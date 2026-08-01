#!/usr/bin/env node
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  type BrowserCookie,
  findHeadlessBrowser,
  openCdpPage,
  waitForPageText,
} from './lib/browser-smoke.js';
import { canonicalizeRouteDirectory, routeDirectoryDigest } from './lib/operator-console-mirror-contract.js';
import { resolveJourneyRoutes, type JourneyRoutes } from './lib/operator-console-mirror-journey.js';

type AnyRecord = Record<string, any>;
type EvidenceTarget = {
  runId: string;
  path: string;
  indexPath: string;
};
type OperatorConsoleAuth = {
  headers: Record<string, string>;
  browserCookies: BrowserCookie[];
};
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

type LiveArgs = {
  live: boolean;
  plan: boolean;
  allowSkippedJourneys: boolean;
  quiet: boolean;
  help: boolean;
  url: string | null;
  localRouteDirectoryUrl: string | null;
  evidencePath: string | null;
  operatorSecretStdin: boolean;
  turnContent: string | null;
  artifactId: string | null;
  artifactSha256: string | null;
  mutationMode: 'none' | 'disposable' | 'api-disposable';
  failureMode: 'none' | 'tunnel-loss' | 'route-revocation' | 'stale-lease';
  timeoutMs: number;
};

const args = parseArgs(process.argv.slice(2));
const evidenceRunId = randomUUID();

if (args.help) {
  process.stdout.write([
    'Cloudflare Operator Console mirror live E2E',
    '',
    'Planning mode:',
    '  pnpm --filter @narada-core/cloudflare-nars-projection plan:operator-console-mirror-live',
    '  ... --plan',
    '',
    'Live mode requires --live, a Worker origin, and the Narada shared secret on stdin.',
    '',
    'Live mode with the Narada-owned shared secret:',
    '  Get-Secret -Name <narada-operator-console-secret> -AsPlainText | pnpm --filter @narada-core/cloudflare-nars-projection test:operator-console-mirror-live -- --url <worker-url> --operator-secret-stdin --turn-content <sentinel> --artifact-id <id> --artifact-sha256 <sha256>',
    '',
    'The live gate compares the remote route directory with the local authority by default:',
    '  --local-route-directory-url <http://127.0.0.1:61729/console/routes>',
    '',
    'Strict live mode requires a concrete artifact and its expected content digest:',
    '  ... --artifact-id <session-artifact-id>',
    '  ... --artifact-sha256 <64-hex-sha256>',
    '',
    'Reachability-only mode (dynamic session, artifact, and Site Operations slices may be skipped):',
    '  ... --allow-skipped-journeys',
    'The default live profile fails when any required dynamic slice is unavailable.',
    '',
    'The full live profile performs a disposable Site Registry mutation journey through the real UI by default:',
    '  ... --mutation-mode disposable',
    'This adds, edits, retires, and purges a unique temporary record and verifies cleanup.',
    'Use --mutation-mode none only for an explicit read-only browser profile.',
    'Direct API-only mutation coverage is separate and explicit:',
    '  ... --mutation-mode api-disposable',
    '',
    'Opt-in failure checks (disrupt local projection state and restore it):',
    '  ... --failure-mode tunnel-loss',
    '  ... --failure-mode route-revocation',
    '  ... --failure-mode stale-lease',
    'Route failure modes require NARADA_OPERATOR_ROUTER_TOKEN or the local Router token file.',
    'Tunnel-loss requires the owned mirror state or NARADA_OPERATOR_CONSOLE_BRIDGE_TOKEN so the mirror can be restored.',
    '',
    'The shared secret is accepted only from stdin, bounded in memory, and never written to evidence or output.',
  ].join('\n'));
  process.exit(0);
}

const result = await run();
if (args.quiet) {
  process.stdout.write(JSON.stringify({ status: result.status, code: result.code ?? null, evidence_path: result.evidence_path ?? null }) + '\n');
} else {
  process.stdout.write('[cloudflare:operator-console-mirror-live] ' + result.status + ': ' + (result.code ?? 'checks_complete') + '\n');
  if (result.evidence_path) process.stdout.write('evidence: ' + result.evidence_path + '\n');
}
process.exitCode = ['passed', 'passed_with_skips', 'planned'].includes(String(result.status)) ? 0 : 1;

async function run(): Promise<AnyRecord> {
  const evidenceTarget = resolveEvidenceTarget(args.evidencePath, evidenceRunId);
  if (args.plan) {
    return persist({
      schema: 'narada.operator_console_mirror.live_e2e.v1',
      status: 'planned',
      code: 'plan_requested',
       required: ['--live', '--url', '--operator-secret-stdin', '--turn-content', '--artifact-id', '--artifact-sha256'],
       credential_modes: ['narada_shared_secret_stdin'],
      evidence_path: evidenceTarget.path,
    }, evidenceTarget);
  }
  if (!args.live) return persistRefusal('live_flag_required_use_plan_for_explicit_plan', evidenceTarget);

  let baseUrl: string;
  let headers: Record<string, string>;
  let browserCookies: BrowserCookie[];
  try {
    baseUrl = requireWorkerOrigin(args.url);
    const auth = await readOperatorConsoleAuth(args, baseUrl);
    headers = auth.headers;
    browserCookies = auth.browserCookies;
  } catch (error) {
    return persistRefusal(error instanceof Error ? error.message : String(error), evidenceTarget);
  }

  const evidence: AnyRecord = {
    schema: 'narada.operator_console_mirror.live_e2e.v1',
    status: 'running',
    worker_url: baseUrl,
     access_mode: 'narada_shared_secret',
    credential_transport: 'stdin',
    profile: args.failureMode === 'none'
      ? (args.allowSkippedJourneys ? 'reachability-only' : 'full')
      : `failure:${args.failureMode}`,
    mutation_mode: args.mutationMode,
    failure_mode: args.failureMode,
    checks: {},
  };

  try {
    const unauthenticated = await request(baseUrl, '/api/nars/operator-console/routes', {});
    assert.ok([302, 401, 403].includes(unauthenticated.response.status), 'unauthenticated mirror route must fail closed');
    evidence.checks.unauthenticated = { status: unauthenticated.response.status, passed: true };

    const invalidSecret = await request(baseUrl, '/api/nars/operator-console/routes', {
      Authorization: 'Bearer invalid-live-e2e-secret',
    });
    assert.ok([401, 403].includes(invalidSecret.response.status), 'invalid shared secret must fail closed');
    evidence.checks.invalid_shared_secret = { status: invalidSecret.response.status, passed: true };

    const routeDirectory = await requestJson(baseUrl, '/api/nars/operator-console/routes', headers);
    assert.equal(routeDirectory.response.status, 200, compact(routeDirectory));
    assert.equal(routeDirectory.body?.schema, 'narada.operator_workspace.route_directory.v3', compact(routeDirectory));
    assert.equal(routeDirectory.body?.httpRouteParity?.status, 'complete', compact(routeDirectory));
    const parityRoutes = Array.isArray(routeDirectory.body?.httpRouteParity?.routes)
      ? routeDirectory.body.httpRouteParity.routes
      : [];
    assert.ok(parityRoutes.length > 0, 'remote route parity inventory must not be empty');
    const routeIds = parityRoutes.map((route: AnyRecord) => route.routeId);
    for (const routeId of [
      'operator-console.root',
      'operator-console.surfaces-page',
      'operator-console.registry-page',
      'operator-console.sessions-page',
      'operator-console.agents-page',
    ]) {
      assert.ok(routeIds.includes(routeId), 'remote route parity is missing ' + routeId);
    }
    const routeDirectoryText = JSON.stringify(routeDirectory.body);
    for (const forbidden of ['target_url', 'health_url', 'registration_token', 'bridge_token']) {
      assert.equal(routeDirectoryText.includes(forbidden), false, 'route directory leaked ' + forbidden);
    }
    const localRouteDirectory = await readLocalRouteDirectory(args.localRouteDirectoryUrl);
    assert.equal(localRouteDirectory.response.status, 200, compact(localRouteDirectory));
    assert.equal(localRouteDirectory.body?.schema, routeDirectory.body?.schema, compact(localRouteDirectory));
    assert.deepEqual(routeDirectory.body?.workspaceHost, {
      kind: 'cloudflare',
      id: 'worker',
      origin: baseUrl,
    }, 'remote route directory workspace host is invalid');
    assert.deepEqual(localRouteDirectory.body?.workspaceHost, {
      kind: 'local',
      id: 'operator-console',
      origin: null,
    }, 'local route directory workspace host is invalid');
    const remoteContract = comparableRouteDirectory(routeDirectory.body);
    const localContract = comparableRouteDirectory(localRouteDirectory.body);
    assert.deepEqual(remoteContract, localContract, 'remote route directory does not match local authority');
    const remoteContractSha256 = routeDirectoryDigest(routeDirectory.body, { ignoreAuthorityIdentity: true });
    const localContractSha256 = routeDirectoryDigest(localRouteDirectory.body, { ignoreAuthorityIdentity: true });
    assert.equal(remoteContractSha256, localContractSha256, 'route directory contract digests differ');
    const journeyRoutes = resolveJourneyRoutes(routeDirectory.body);
    evidence.checks.route_directory = {
      status: routeDirectory.response.status,
      schema: routeDirectory.body.schema,
      parity_status: routeDirectory.body.httpRouteParity.status,
      parity_route_count: parityRoutes.length,
      local_status: localRouteDirectory.response.status,
      local_parity_route_count: Array.isArray(localRouteDirectory.body?.httpRouteParity?.routes)
        ? localRouteDirectory.body.httpRouteParity.routes.length
        : 0,
      remote_contract_sha256: remoteContractSha256,
      local_contract_sha256: localContractSha256,
      comparison: 'complete_document_except_generatedAt_and_workspaceHost',
      local_remote_parity_match: true,
      journey_routes: journeyRoutes,
      passed: true,
    };

    const undeclaredRoute = await requestJson(baseUrl, '/api/nars/operator-console/route-that-is-not-declared', headers);
    assert.ok([404, 405].includes(undeclaredRoute.response.status), compact(undeclaredRoute));
    const disallowedMethod = await requestJson(baseUrl, '/api/nars/operator-console/routes', headers, {
      method: 'POST',
      body: '{}',
    });
    assert.ok([404, 405].includes(disallowedMethod.response.status), compact(disallowedMethod));
    evidence.checks.authority_boundary = {
      undeclared_route_status: undeclaredRoute.response.status,
      disallowed_method_status: disallowedMethod.response.status,
      passed: true,
    };

    const health = await requestJson(baseUrl, '/api/nars/operator-console/health', headers);
    assert.equal(health.response.status, 200, compact(health));
    assert.equal(health.body?.status, 'healthy', compact(health));
    assert.equal(health.body?.transport?.websocket?.status, 'ready', compact(health));
    evidence.checks.health = {
      status: health.response.status,
      mirror_status: health.body.status,
      websocket_transport: health.body?.transport?.websocket?.transport ?? null,
      passed: true,
    };

    // Exercise one real declared mutation intent in dry-run mode. This proves
    // the Worker and gateway forward a domain request without applying state,
    // rather than proving only that POST is admitted by the route table.
    const registryHeaders = {
      ...headers,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    const registryList = await requestJson(baseUrl, '/console/registry/api/sites', registryHeaders);
    assert.equal(registryList.response.status, 200, compact(registryList));
    const registrySites = Array.isArray(registryList.body?.sites) ? registryList.body.sites : [];
    assert.ok(registrySites.length > 0, 'remote registry must expose at least one Site for dry-run intent acceptance');
    const registrySite = registrySites[0] as AnyRecord;
    const registrySiteId = typeof registrySite.site_id === 'string' ? registrySite.site_id : null;
    const registryRevision = Number.isInteger(registrySite.revision) ? registrySite.revision : null;
    assert.ok(registrySiteId && registryRevision !== null, 'remote registry Site must expose id and revision');
    const registryPlan = await requestJson(baseUrl, '/console/registry/api/operations/plan', registryHeaders, {
      method: 'POST',
      body: JSON.stringify({
        operation: 'retire',
        reference: registrySiteId,
        expected_revision: registryRevision,
        reason: 'operator-console-mirror-live dry-run verification',
        actor: 'operator-console-mirror-live-e2e',
      }),
    });
    assert.equal(registryPlan.response.status, 200, compact(registryPlan));
    assert.equal(registryPlan.body?.schema, 'narada.site_registry.management.v0', compact(registryPlan));
    assert.equal(registryPlan.body?.status, 'planned', compact(registryPlan));
    assert.equal(registryPlan.body?.mutation_performed, false, compact(registryPlan));
    evidence.checks.mutation_intent = {
      route: '/console/registry/api/operations/plan',
      operation: registryPlan.body?.operation ?? null,
      site_id: registrySiteId,
      status: registryPlan.response.status,
      result_status: registryPlan.body?.status ?? null,
      mutation_performed: registryPlan.body?.mutation_performed ?? null,
      passed: true,
    };

    if (args.mutationMode === 'api-disposable') {
      evidence.checks.api_mutation_journey = await runDisposableRegistryMutationJourney(baseUrl, registryHeaders);
    }

    if (args.failureMode !== 'none') {
      return await runFailureMode({ baseUrl, headers, journeyRoutes, evidence, evidenceTarget });
    }

    assertRequiredDynamicJourneys(journeyRoutes);

    const browserPath = findHeadlessBrowser();
    assert.ok(browserPath, 'a supported headless browser is required for browser-level acceptance');
    const page = await openCdpPage({
      browserPath,
      url: baseUrl + '/',
      extraHeaders: headers,
      cookies: browserCookies,
      instrumentWebSocketClose: true,
      userDataPrefix: 'narada-operator-console-mirror-live-',
    });
    try {
      const rootText = await waitForPageText(page, 'Site Registry', args.timeoutMs);
      assert.equal(rootText.found, true, JSON.stringify(rootText));
      const root = await page.evaluate('({ href: location.href, title: document.title, surface: document.body?.dataset?.naradaSurface ?? null, bodyLength: document.body?.innerText?.length ?? 0 })');
      assert.equal(String(root.title), 'Narada Cloudflare Workspace');
      assert.equal(root.surface, null);
      assert.ok(root.bodyLength > 100);

      const pages = [
        { path: '/console/surfaces', text: 'Site Registry' },
        { path: '/console/registry', text: 'Site Registry' },
        { path: '/console/registry/add', text: 'Add Site' },
        { path: '/console/registry/manage', text: 'Manage' },
        { path: '/console/launch', text: 'Site Runtime' },
        { path: '/console/onboarding', text: 'First Use' },
        { path: '/console/sessions', text: 'Agent Sessions' },
        { path: '/console/agents', text: 'Sites and Agents' },
      ];
      const browserPages: AnyRecord[] = [];
      for (const target of pages) {
        await page.navigate(baseUrl + target.path);
        const rendered = await waitForPageText(page, target.text, args.timeoutMs);
        assert.equal(rendered.found, true, JSON.stringify({ target, rendered }));
        const state = await page.evaluate('({ href: location.href, title: document.title, bodyLength: document.body?.innerText?.length ?? 0 })');
        const expectedTitle = target.path === '/console/surfaces'
          ? 'Narada Operator Workspace'
          : 'Operator Console - Sites';
        assert.equal(String(state.title), expectedTitle);
        assert.ok(state.bodyLength > 100);
        browserPages.push({ path: target.path, href: state.href, body_length: state.bodyLength });
      }

      const interactionChecks = await runBrowserOperatorInteractionJourney(page, baseUrl);
      const dynamicChecks: AnyRecord = {};
      if (args.mutationMode === 'disposable') {
        dynamicChecks.registry_mutation = await runBrowserDisposableRegistryMutationJourney(page, baseUrl, registryHeaders);
      }
      if (journeyRoutes.site_operations_path) {
        await page.navigate(baseUrl + journeyRoutes.site_operations_path);
        const siteOperations = await waitForPageText(page, 'Task & Agent Operations', args.timeoutMs);
        assert.equal(siteOperations.found, true, JSON.stringify({ site_operations: siteOperations }));
        dynamicChecks.site_operations = {
          status: 'passed',
          path: journeyRoutes.site_operations_path,
        };
      } else {
        dynamicChecks.site_operations = {
          ...journeyRoutes.availability.site_operations,
          status: 'skipped',
        };
      }

      let sessionEvents: AnyRecord | null = null;
      let sessionTurn: AnyRecord | null = null;
      let sessionConfig: AnyRecord = {};
      let websocketRecords: AnyRecord[] = [];
      const sessionJourney = journeyRoutes.session_path
        && journeyRoutes.session_events_path
        && journeyRoutes.session_input_path
        && (!args.allowSkippedJourneys || args.turnContent?.trim())
        ? {
          path: journeyRoutes.session_path,
          eventsPath: journeyRoutes.session_events_path,
          inputPath: journeyRoutes.session_input_path,
        }
        : null;
      if (sessionJourney) {
        await page.navigate(baseUrl + sessionJourney.path);
        const sessionConfigReady = await waitForPageValue(
          page,
          '(() => { try { return JSON.parse(document.querySelector("#nars-config")?.textContent ?? "{}"); } catch { return {}; } })()',
          (value) => Boolean(value && typeof value === 'object'
            && typeof (value as AnyRecord).eventEndpoint === 'string'
            && typeof (value as AnyRecord).healthEndpoint === 'string'),
          args.timeoutMs,
        );
        assert.equal(sessionConfigReady.found, true, JSON.stringify({ session_config: sessionConfigReady }));
        sessionConfig = sessionConfigReady.value as AnyRecord;
        const expectedEventEndpoint = new URL(sessionJourney.eventsPath, baseUrl);
        expectedEventEndpoint.protocol = expectedEventEndpoint.protocol === 'https:' ? 'wss:' : 'ws:';
        const expectedInputEndpoint = new URL(sessionJourney.inputPath, baseUrl).toString();
        assert.equal(String(sessionConfig.eventEndpoint ?? ''), expectedEventEndpoint.toString(), JSON.stringify({ session_config: sessionConfig }));
        const configuredInputEndpoint = typeof sessionConfig.inputEndpoint === 'string'
          ? sessionConfig.inputEndpoint
          : typeof sessionConfig.input_endpoint === 'string'
            ? sessionConfig.input_endpoint
            : null;
        const inputTransport = configuredInputEndpoint ? 'http' : 'websocket';
        if (inputTransport === 'http') {
          assert.equal(configuredInputEndpoint, expectedInputEndpoint, JSON.stringify({ session_config: sessionConfig }));
        }
        const sessionControls = await waitForPageValue(
          page,
          'Boolean(document.querySelector("#operator-form") && document.querySelector("#operator-input") && document.querySelector(".composer-submit"))',
          (value) => value === true,
          args.timeoutMs,
        );
        assert.equal(sessionControls.found, true, JSON.stringify({ session_controls: sessionControls }));
        const replay = await page.waitForWebSocketFrame(
          (entry: AnyRecord) => String(entry.url ?? '') === expectedEventEndpoint.toString()
            && String(entry.payload_data ?? '').includes('session_events_replay_completed'),
          args.timeoutMs,
        );
        sessionEvents = replay;
        assert.equal(replay.found, true, JSON.stringify({ session_events: replay }));
        assert.equal(await page.evaluate('Boolean(document.querySelector("#events"))'), true);
        const turnContent = args.turnContent;
        if (!turnContent?.trim()) throw new Error('live_session_turn_content_required');
        const baselineRendered = await page.evaluate('(() => ({ operator_or_user: document.querySelectorAll("#events [data-event-kind=operator_input_submitted], #events [data-event-kind=user_message]").length, assistant: document.querySelectorAll("#events [data-event-kind=assistant_message]").length }))()');
        const priorTurnIds = new Set(page.webSocketFrames()
          .map((entry: AnyRecord) => parseWebSocketEvent(entry)?.turn_id)
          .filter((value: unknown): value is string => typeof value === 'string'));
        await page.fill('#operator-input', turnContent);
        await page.click('.composer-submit');
        const localSubmission = await waitForPageValue(
          page,
          '(() => { const form = document.querySelector("#operator-form"); return { request_id: form?.getAttribute("data-operator-delivery-request-id") ?? null, phase: form?.getAttribute("data-operator-delivery-phase") ?? null }; })()',
          (value) => Boolean(value && typeof value === 'object' && typeof (value as AnyRecord).request_id === 'string' && (value as AnyRecord).phase !== 'draft'),
          args.timeoutMs,
        );
        assert.equal(localSubmission.found, true, JSON.stringify({ local_submission: localSubmission }));
        const requestId = String((localSubmission.value as AnyRecord).request_id);
        const queued = await waitForSessionEvent(page, expectedEventEndpoint.toString(), 'input_event_queued', (event) => event.request_id === requestId, args.timeoutMs);
        const started = await waitForSessionEvent(page, expectedEventEndpoint.toString(), 'input_event_started', (event) => event.request_id === queued.event.request_id, args.timeoutMs);
        const queuedTurnId = String(queued.event.turn_id ?? queued.event.event_id ?? '');
        const turnStarted = await waitForSessionEvent(page, expectedEventEndpoint.toString(), 'carrier_turn_started', (event) => {
          if (priorTurnIds.has(String(event.turn_id ?? ''))) return false;
          return !queuedTurnId || String(event.turn_id ?? '') === queuedTurnId;
        }, args.timeoutMs);
        const turnId = String(turnStarted.event.turn_id ?? '');
        assert.ok(turnId, 'carrier turn must expose a concrete turn id');
        const assistant = await waitForSessionEvent(page, expectedEventEndpoint.toString(), 'assistant_message', (event) => event.turn_id === turnId, args.timeoutMs);
        const turnCompleted = await waitForSessionEvent(page, expectedEventEndpoint.toString(), 'carrier_turn_completed', (event) => event.turn_id === turnId, args.timeoutMs);
        const inputCompleted = await waitForSessionEvent(page, expectedEventEndpoint.toString(), 'input_event_completed', (event) => event.request_id === queued.event.request_id, args.timeoutMs);
        const controlResponse = await waitForSessionEvent(page, expectedEventEndpoint.toString(), 'session_control_response', (event) => event.request_id === queued.event.request_id, args.timeoutMs);
        assert.equal(inputCompleted.event.terminal_state, 'completed', JSON.stringify(inputCompleted.event));
        assert.equal(controlResponse.event.terminal_state, 'completed', JSON.stringify(controlResponse.event));
        const rendered = await waitForPageValue(
          page,
          '(() => ({ operator_or_user: document.querySelectorAll("#events [data-event-kind=operator_input_submitted], #events [data-event-kind=user_message]").length, assistant: document.querySelectorAll("#events [data-event-kind=assistant_message]").length, phase: document.querySelector("#operator-form")?.getAttribute("data-operator-delivery-phase") ?? null }))()',
          (value) => Boolean(value && typeof value === 'object'
            && Number((value as AnyRecord).operator_or_user) > Number((baselineRendered as AnyRecord).operator_or_user)
            && Number((value as AnyRecord).assistant) > Number((baselineRendered as AnyRecord).assistant)
            && (value as AnyRecord).phase === 'completed'),
          args.timeoutMs,
        );
        assert.equal(rendered.found, true, JSON.stringify({ baseline_rendered: baselineRendered, rendered }));
        const lifecycle = [queued, started, turnStarted, assistant, turnCompleted, inputCompleted, controlResponse]
          .map((entry) => Number(entry.event.event_sequence ?? entry.event.sequence));
        assert.equal(lifecycle.every(Number.isFinite), true, JSON.stringify({ lifecycle }));
        for (let index = 1; index < lifecycle.length; index += 1) {
          assert.ok(lifecycle[index] > lifecycle[index - 1], JSON.stringify({ lifecycle }));
        }
        sessionTurn = {
          request_id: requestId,
          turn_id: turnId,
          turn_content_length: turnContent.length,
          input_transport: inputTransport,
          event_kinds: [queued, started, turnStarted, assistant, turnCompleted, inputCompleted, controlResponse].map((entry) => entry.event.event),
          terminal_state: inputCompleted.event.terminal_state,
          rendered: rendered.value,
          passed: true,
        };
        websocketRecords = await page.webSocketInstrumentation();
        assert.equal(websocketRecords.some((record: AnyRecord) => String(record.url ?? '') === expectedEventEndpoint.toString()), true, JSON.stringify({ websocket_records: websocketRecords }));
      } else {
        dynamicChecks.agent_sessions = {
          ...journeyRoutes.availability.agent_sessions,
          status: 'skipped',
          reason: journeyRoutes.session_path && !args.turnContent?.trim()
            ? 'turn_content_not_requested'
            : journeyRoutes.availability.agent_sessions.reason,
        };
      }

      const observedArtifactHref = await page.evaluate('Array.from(document.querySelectorAll("a[href*=\\"/artifacts/\\"]")).map((element) => element.href).find(Boolean) ?? null');
      const artifactHref = typeof observedArtifactHref === 'string' ? observedArtifactHref : null;
      let artifactPath: string | null = null;
      let artifactContentPath: string | null = null;
      let artifactId: string | null = null;
      if (journeyRoutes.artifact_base_path && (artifactHref || args.artifactId?.trim()) && args.artifactSha256?.trim()) {
        artifactPath = resolveArtifactPath({
          baseUrl,
          artifactBasePath: journeyRoutes.artifact_base_path,
          artifactId: args.artifactId,
          artifactHref,
        });
        artifactId = artifactPath.split('/').filter(Boolean).at(-1) ?? null;
        const concreteArtifactId = artifactId;
        if (!concreteArtifactId) throw new Error('live journey artifact id must be concrete');
        await page.navigate(baseUrl + artifactPath);
        const artifactBody = await waitForPageValue(page, 'document.body?.innerText ?? ""', (value) => String(value).includes(decodeURIComponent(concreteArtifactId)), args.timeoutMs);
        assert.equal(artifactBody.found, true, JSON.stringify({ artifact: artifactBody }));
        const artifactMarkup = await page.evaluate('document.documentElement?.outerHTML ?? ""');
        assert.equal(artifactMarkup.includes('source_path'), false);
        const artifactMetadata = await requestJson(baseUrl, artifactPath, headers);
        assert.equal(artifactMetadata.response.status, 200, compact(artifactMetadata));
        assert.equal(artifactMetadata.body?.artifact_id, decodeURIComponent(concreteArtifactId), compact(artifactMetadata));
        const expectedSessionId = journeyRoutes.session_path?.split('/').filter(Boolean)[1] ?? null;
        if (expectedSessionId) assert.equal(artifactMetadata.body?.session_id, expectedSessionId, compact(artifactMetadata));
        assert.equal(artifactMetadata.body?.lifecycle?.state, 'active', compact(artifactMetadata));
        assert.equal('source_path' in artifactMetadata.body, false, compact(artifactMetadata));
        artifactContentPath = artifactPath.replace(/\/?$/, '/content');
        const artifactContent = await requestBytes(baseUrl, artifactContentPath, headers);
        assert.equal(artifactContent.response.status, 200, compact({ response: artifactContent.response, body: {} }));
        assert.ok(artifactContent.bytes.byteLength > 0, 'artifact content must not be empty');
        const artifactContentSha256 = createHash('sha256').update(artifactContent.bytes).digest('hex');
        const expectedArtifactSha256 = args.artifactSha256?.trim().toLowerCase();
        assert.ok(expectedArtifactSha256, 'strict artifact acceptance requires --artifact-sha256');
        assert.equal(artifactContentSha256, expectedArtifactSha256, 'artifact content digest does not match the supplied fixture digest');
        dynamicChecks.artifacts = {
          status: 'passed',
          path: artifactPath,
          content_path: artifactContentPath,
          artifact_id: decodeURIComponent(concreteArtifactId),
          content_bytes: artifactContent.bytes.byteLength,
          content_type: artifactContent.response.headers.get('content-type'),
          lifecycle_state: artifactMetadata.body?.lifecycle?.state ?? null,
          session_id: artifactMetadata.body?.session_id ?? null,
          expected_sha256: expectedArtifactSha256,
          observed_sha256: artifactContentSha256,
        };
      } else {
        if (!args.allowSkippedJourneys) {
          throw new Error(`required_live_journey_unavailable:artifacts:${journeyRoutes.artifact_base_path ? (artifactHref || args.artifactId?.trim() ? 'artifact_sha256_required' : 'artifact_id_not_observed') : journeyRoutes.availability.artifacts.reason}`);
        }
        dynamicChecks.artifacts = {
          ...journeyRoutes.availability.artifacts,
          status: 'skipped',
          reason: journeyRoutes.artifact_base_path
            ? (artifactHref || args.artifactId?.trim() ? 'artifact_sha256_required' : 'artifact_id_not_observed')
            : journeyRoutes.availability.artifacts.reason,
        };
      }

      const renderedMarkup = await page.evaluate('document.documentElement?.outerHTML ?? ""');
      for (const forbidden of ['127.0.0.1', '61729', '61730', 'operator-console.internal']) {
        assert.equal(renderedMarkup.includes(forbidden), false, 'browser projection leaked ' + forbidden);
      }
      assert.equal(page.runtimeDiagnostics().some((entry: AnyRecord) => entry.kind === 'exception'), false);
      evidence.checks.browser = {
        root,
        pages: browserPages,
        interactions: interactionChecks,
        dynamic: dynamicChecks,
        site_operations_path: journeyRoutes.site_operations_path,
        session_path: journeyRoutes.session_path,
        session_events_path: journeyRoutes.session_events_path,
        session_input_path: journeyRoutes.session_input_path,
        session_replay: sessionEvents
          ? { found: Boolean(sessionEvents.found), waited_ms: sessionEvents.waited_ms ?? null }
          : null,
        session_event_endpoint: sessionConfig.eventEndpoint ?? null,
        session_input_endpoint: sessionConfig.inputEndpoint ?? sessionConfig.input_endpoint ?? null,
        session_input_transport: sessionConfig.inputEndpoint || sessionConfig.input_endpoint ? 'http' : 'websocket',
        session_turn: sessionTurn,
        websocket_records: websocketRecords.slice(0, 8),
        artifact_path: artifactPath,
        artifact_content_path: artifactContentPath,
        artifact_id: artifactId ? decodeURIComponent(artifactId) : null,
        runtime_diagnostics: page.runtimeDiagnostics().slice(0, 8),
        passed: true,
      };
    } finally {
      await page.close();
    }

    evidence.status = args.allowSkippedJourneys ? 'passed_with_skips' : 'passed';
    return persist(evidence, evidenceTarget);
  } catch (error) {
    evidence.status = 'failed';
    evidence.code = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
    return persist(evidence, evidenceTarget);
  }
}

function assertRequiredDynamicJourneys(journeyRoutes: JourneyRoutes): void {
  if (args.allowSkippedJourneys) return;
  const missing: string[] = [];
  if (!journeyRoutes.site_operations_path) {
    missing.push(`site_operations:${journeyRoutes.availability.site_operations.reason}`);
  }
  if (!journeyRoutes.session_path || !journeyRoutes.session_events_path || !journeyRoutes.session_input_path) {
    missing.push(`agent_sessions:${journeyRoutes.availability.agent_sessions.reason}`);
  }
  if (!journeyRoutes.artifact_base_path) {
    missing.push(`artifacts:${journeyRoutes.availability.artifacts.reason}`);
  }
  if (!args.turnContent?.trim()) missing.push('agent_sessions:turn_content_required');
  if (!args.artifactSha256?.trim()) missing.push('artifacts:artifact_sha256_required');
  if (missing.length) throw new Error(`required_live_journey_unavailable:${missing.join('|')}`);
}

async function runBrowserOperatorInteractionJourney(page: AnyRecord, baseUrl: string): Promise<AnyRecord> {
  await page.navigate(baseUrl + '/console/launch');
  const launchPage = await waitForPageText(page, 'Site Runtime', args.timeoutMs);
  assert.equal(launchPage.found, true, JSON.stringify({ launch_page: launchPage }));
  const tileCount = await waitForPageValue(
    page,
    'document.querySelectorAll("button.site-tile[data-site-id]").length',
    (value) => Number(value) > 0,
    args.timeoutMs,
  );
  assert.equal(tileCount.found, true, JSON.stringify({ site_tiles: tileCount }));
  const siteId = await page.evaluate('document.querySelector("button.site-tile[data-site-id]")?.getAttribute("data-site-id") ?? null');
  assert.equal(typeof siteId, 'string');
  assert.ok(String(siteId).trim(), 'launch journey requires a concrete Site tile');

  await page.click('button.site-tile[data-site-id]');
  const registryNavigation = await waitForPageValue(
    page,
    'location.pathname',
    (value) => value === '/console/registry',
    args.timeoutMs,
  );
  assert.equal(registryNavigation.found, true, JSON.stringify({ registry_navigation: registryNavigation }));
  const selectedSite = await page.evaluate('new URL(location.href).searchParams.get("site") ?? null');
  assert.equal(selectedSite, siteId, 'launch tile must select the clicked Site');
  const postureButton = await waitForPageValue(
    page,
    'Boolean(document.querySelector("[data-testid=\\"site-detail-check-posture\\"]") && !document.querySelector("[data-testid=\\"site-detail-check-posture\\"]")?.matches(":disabled"))',
    (value) => value === true,
    args.timeoutMs,
  );
  assert.equal(postureButton.found, true, JSON.stringify({ posture_button: postureButton }));
  await page.click('[data-testid="site-detail-check-posture"]');
  const postureResult = await waitForPageValue(
    page,
    'document.querySelector(".launch-status")?.innerText ?? ""',
    (value) => typeof value === 'string' && value.trim().length > 0,
    args.timeoutMs,
  );
  assert.equal(postureResult.found, true, JSON.stringify({ posture_result: postureResult }));
  assert.match(String(postureResult.value), /dry run/i, 'posture action must remain a dry run');

  await page.navigate(baseUrl + '/console/onboarding');
  const onboardingPage = await waitForPageText(page, 'Start with one assistant', args.timeoutMs);
  assert.equal(onboardingPage.found, true, JSON.stringify({ onboarding_page: onboardingPage }));
  const refreshButton = await waitForPageValue(
    page,
    'Boolean(document.querySelector("button[aria-label=\\"Refresh status\\"]") && !document.querySelector("button[aria-label=\\"Refresh status\\"]")?.matches(":disabled"))',
    (value) => value === true,
    args.timeoutMs,
  );
  assert.equal(refreshButton.found, true, JSON.stringify({ refresh_button: refreshButton }));
  const beforeRefresh = page.networkResponseCount();
  await page.click('button[aria-label="Refresh status"]');
  const refresh = await page.waitForNetworkResponse(
    (entry: AnyRecord) => entry.method === 'GET' && String(entry.url ?? '').includes('/console/onboarding/api/status'),
    args.timeoutMs,
    beforeRefresh,
  );
  assert.equal(refresh.found, true, JSON.stringify({ onboarding_refresh: refresh }));
  return {
    site_runtime: {
      site_id: siteId,
      launch_page: true,
      selected_site: selectedSite,
      posture_action: 'check-posture',
      posture_result: postureResult.value,
    },
    onboarding: {
      page: true,
      refresh_request: refresh,
    },
  };
}

async function runBrowserDisposableRegistryMutationJourney(
  page: AnyRecord,
  baseUrl: string,
  headers: Record<string, string>,
): Promise<AnyRecord> {
  const siteId = `operator-console-mirror-live-${Date.now()}-${process.pid}`;
  const root = resolve(REPO_ROOT, '.ai', 'tmp', siteId);
  const sourceRef = 'operator-console-mirror-live-e2e';
  const history: AnyRecord[] = [];

  const statusText = async (expected: string, phase: string): Promise<string> => {
    const result = await waitForPageValue(
      page,
      'document.querySelector("[data-testid=\\"site-registry-status\\"]")?.innerText ?? ""',
      (value) => typeof value === 'string' && value.includes(expected),
      args.timeoutMs,
    );
    assert.equal(result.found, true, JSON.stringify({ phase, result }));
    const value = String(result.value ?? '');
    history.push({ phase, status: value });
    return value;
  };

  const waitForEnabled = async (selector: string, phase: string): Promise<void> => {
    const result = await waitForPageValue(
      page,
      `Boolean(document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)})?.matches(':disabled'))`,
      (value) => value === true,
      args.timeoutMs,
    );
    assert.equal(result.found, true, JSON.stringify({ phase, selector, result }));
  };

  const previewAndApply = async (phase: string, purge = false): Promise<void> => {
    await waitForEnabled('[data-testid="site-registry-preview"]', `${phase}:preview-enabled`);
    await page.click('[data-testid="site-registry-preview"]');
    await statusText('Preview ready.', `${phase}:preview`);
    if (purge) {
      const confirmation = await page.evaluate('document.querySelector("[data-testid=\\"site-registry-purge-confirmation\\"]")?.getAttribute("placeholder") ?? ""');
      assert.ok(typeof confirmation === 'string' && confirmation.length > 0, `${phase} must expose an exact purge confirmation`);
      await page.fill('[data-testid="site-registry-purge-confirmation"]', confirmation);
    }
    await page.click('[data-testid="site-registry-confirm-apply"]');
    await waitForEnabled('[data-testid="site-registry-apply"]', `${phase}:apply-enabled`);
    await page.click('[data-testid="site-registry-apply"]');
    await statusText('Change applied.', `${phase}:apply`);
  };

  const read = async (): Promise<{ response: Response; body: AnyRecord }> => {
    return await requestJson(baseUrl, `/console/registry/api/sites/${encodeURIComponent(siteId)}`, headers);
  };

  try {
    await page.navigate(baseUrl + '/console/registry/add');
    const addPage = await waitForPageText(page, 'Add Site', args.timeoutMs);
    assert.equal(addPage.found, true, JSON.stringify({ add_page: addPage }));
    await page.fill('[data-testid="site-registry-site-id"]', siteId);
    await page.fill('[data-testid="site-registry-root"]', root);
    await page.fill('[data-testid="site-registry-substrate"]', 'windows');
    await page.fill('[data-testid="site-registry-source-ref"]', sourceRef);
    await page.fill('[data-testid="site-registry-reason"]', 'Disposable browser journey add');
    await previewAndApply('add');
    const added = await read();
    assert.equal(added.response.status, 200, compact(added));
    const addedRevision = Number(added.body?.site?.revision);
    assert.ok(Number.isInteger(addedRevision), compact(added));
    history.push({ phase: 'add:readback', http_status: added.response.status, revision: addedRevision });

    await page.navigate(baseUrl + `/console/registry/manage?operation=edit&site=${encodeURIComponent(siteId)}`);
    const editPage = await waitForPageText(page, 'Edit Site', args.timeoutMs);
    assert.equal(editPage.found, true, JSON.stringify({ edit_page: editPage }));
    const editSelection = await waitForPageValue(
      page,
      `document.querySelector("[data-testid=\\"site-registry-existing-site\\"]")?.value ?? ""`,
      (value) => value === siteId,
      args.timeoutMs,
    );
    assert.equal(editSelection.found, true, JSON.stringify({ edit_selection: editSelection }));
    await page.fill('[data-testid="site-registry-source-ref"]', `${sourceRef}-edit`);
    await page.fill('[data-testid="site-registry-reason"]', 'Disposable browser journey edit');
    await previewAndApply('edit');
    const edited = await read();
    assert.equal(edited.response.status, 200, compact(edited));
    assert.ok(Number(edited.body?.site?.revision) > addedRevision, compact(edited));
    history.push({ phase: 'edit:readback', http_status: edited.response.status, revision: edited.body?.site?.revision ?? null });

    await page.navigate(baseUrl + `/console/registry/manage?operation=retire&site=${encodeURIComponent(siteId)}`);
    const retirePage = await waitForPageText(page, 'Retire Site', args.timeoutMs);
    assert.equal(retirePage.found, true, JSON.stringify({ retire_page: retirePage }));
    await page.fill('[data-testid="site-registry-reason"]', 'Disposable browser journey retire');
    await previewAndApply('retire');
    const retired = await read();
    assert.equal(retired.response.status, 200, compact(retired));
    assert.equal(retired.body?.site?.lifecycle_status, 'retired', compact(retired));
    history.push({ phase: 'retire:readback', http_status: retired.response.status, lifecycle_status: retired.body?.site?.lifecycle_status ?? null });

    await page.navigate(baseUrl + `/console/registry/manage?operation=purge&site=${encodeURIComponent(siteId)}`);
    const purgePage = await waitForPageText(page, 'Purge Site', args.timeoutMs);
    assert.equal(purgePage.found, true, JSON.stringify({ purge_page: purgePage }));
    await page.fill('[data-testid="site-registry-reason"]', 'Disposable browser journey purge');
    await previewAndApply('purge', true);
    const final = await read();
    assert.equal(final.response.status, 404, compact(final));
    history.push({ phase: 'purge:readback', http_status: final.response.status, cleanup: 'verified_absent' });
    return { status: 'passed', site_id: siteId, mutation_surface: 'browser-ui', history };
  } catch (error) {
    let cleanup: { status: 'verified_absent' };
    try {
      cleanup = await cleanupDisposableRegistryRecord(baseUrl, headers, siteId, history);
    } catch (cleanupError) {
      throw new Error(`browser_registry_mutation_failed:${error instanceof Error ? error.message : String(error)};manual_cleanup_required:${siteId};cleanup_error=${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
    }
    throw new Error(`browser_registry_mutation_failed:${error instanceof Error ? error.message : String(error)};cleanup=${cleanup.status}`);
  }
}

async function cleanupDisposableRegistryRecord(
  baseUrl: string,
  headers: Record<string, string>,
  siteId: string,
  history: AnyRecord[],
): Promise<{ status: 'verified_absent' }> {
  const read = async (): Promise<{ response: Response; body: AnyRecord }> => {
    return await requestJson(baseUrl, `/console/registry/api/sites/${encodeURIComponent(siteId)}`, headers);
  };
  const post = async (operation: string, payload: AnyRecord): Promise<{ response: Response; body: AnyRecord }> => {
    const result = await requestJson(baseUrl, `/console/registry/api/operations/apply`, headers, {
      method: 'POST',
      body: JSON.stringify({ ...payload, operation, reference: siteId, confirm_apply: true, actor: 'operator-console-mirror-live-e2e-recovery' }),
    });
    history.push({ phase: `recovery:${operation}`, http_status: result.response.status, status: result.body?.status ?? null });
    assert.equal(result.response.status, 200, compact(result));
    assert.equal(result.body?.status, 'applied', compact(result));
    return result;
  };

  const current = await read();
  if (current.response.status === 404) return { status: 'verified_absent' };
  assert.equal(current.response.status, 200, compact(current));
  const currentSite = current.body?.site as AnyRecord | undefined;
  assert.ok(currentSite, compact(current));
  let revision = Number(currentSite.revision);
  assert.ok(Number.isInteger(revision), compact(current));
  if (currentSite.lifecycle_status !== 'retired') {
    const retired = await post('retire', {
      expected_revision: revision,
      reason: 'Disposable browser journey recovery cleanup',
    });
    revision = Number(retired.body?.after?.revision);
    assert.ok(Number.isInteger(revision), compact(retired));
  }
  await post('purge', {
    expected_revision: revision,
    reason: 'Disposable browser journey recovery cleanup',
    confirm_site_id: siteId,
  });
  const final = await read();
  assert.equal(final.response.status, 404, compact(final));
  history.push({ phase: 'recovery:readback', http_status: final.response.status, cleanup: 'verified_absent' });
  return { status: 'verified_absent' };
}

async function runDisposableRegistryMutationJourney(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<AnyRecord> {
  const siteId = `operator-console-mirror-live-${Date.now()}-${process.pid}`;
  const root = join(REPO_ROOT, '.ai', 'tmp', siteId);
  const actor = 'operator-console-mirror-live-e2e';
  const operationsPath = '/console/registry/api/operations';
  const history: AnyRecord[] = [];

  if (existsSync(root)) throw new Error('disposable_registry_root_already_exists');

  const record = (value: { response: Response; body: AnyRecord }): AnyRecord => ({
    http_status: value.response.status,
    result_status: value.body?.status ?? null,
    operation: value.body?.operation ?? null,
    mutation_performed: value.body?.mutation_performed ?? null,
    site_id: value.body?.site_id ?? null,
    revision: value.body?.after?.revision ?? value.body?.site?.revision ?? null,
    lifecycle_status: value.body?.after?.lifecycle_status ?? value.body?.site?.lifecycle_status ?? null,
    refusals: value.body?.refusals ?? [],
  });

  const post = async (suffix: string, payload: AnyRecord): Promise<{ response: Response; body: AnyRecord }> => {
    const value = await requestJson(baseUrl, operationsPath + suffix, headers, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    history.push(record(value));
    return value;
  };

  const read = async (): Promise<{ response: Response; body: AnyRecord }> => {
    const value = await requestJson(baseUrl, `/console/registry/api/sites/${encodeURIComponent(siteId)}`, headers);
    history.push(record(value));
    return value;
  };

  const assertApplied = (value: { response: Response; body: AnyRecord }, operation: string): void => {
    assert.equal(value.response.status, 200, compact(value));
    assert.equal(value.body?.status, 'applied', compact(value));
    assert.equal(value.body?.operation, operation, compact(value));
    assert.equal(value.body?.mutation_performed, true, compact(value));
  };

  const cleanup = async (): Promise<AnyRecord> => {
    const current = await read();
    if (current.response.status === 404) return { status: 'verified_absent' };
    assert.equal(current.response.status, 200, compact(current));
    const currentSite = current.body?.site as AnyRecord | undefined;
    assert.ok(currentSite, compact(current));
    let revision = currentSite.revision as number;
    assert.ok(Number.isInteger(revision), compact(current));
    if (currentSite.lifecycle_status !== 'retired') {
      const retire = await post('/apply', {
        operation: 'retire',
        reference: siteId,
        reason: 'Disposable live acceptance cleanup',
        actor,
        expected_revision: revision,
        confirm_apply: true,
      });
      assertApplied(retire, 'retire');
      revision = retire.body.after.revision as number;
    }
    const purge = await post('/apply', {
      operation: 'purge',
      reference: siteId,
      reason: 'Disposable live acceptance cleanup',
      actor,
      expected_revision: revision,
      confirm_site_id: siteId,
      confirm_apply: true,
    });
    assertApplied(purge, 'purge');
    const final = await read();
    assert.equal(final.response.status, 404, compact(final));
    return { status: 'verified_absent' };
  };

  const common = {
    site_id: siteId,
    root,
    variant: 'native',
    substrate: 'windows',
    source: 'manual',
    source_ref: 'operator-console-mirror-live-e2e',
    actor,
  };
  let applied = false;
  try {
    const planAdd = await post('/plan', { ...common, operation: 'add' });
    assert.equal(planAdd.response.status, 200, compact(planAdd));
    assert.equal(planAdd.body?.status, 'planned', compact(planAdd));
    assert.equal(planAdd.body?.mutation_performed, false, compact(planAdd));

    applied = true;
    const applyAdd = await post('/apply', { ...common, operation: 'add', confirm_apply: true });
    assertApplied(applyAdd, 'add');
    const afterAdd = await read();
    assert.equal(afterAdd.response.status, 200, compact(afterAdd));
    const revisionAfterAdd = afterAdd.body?.site?.revision as number;
    assert.ok(Number.isInteger(revisionAfterAdd), compact(afterAdd));

    const editPayload = {
      operation: 'edit',
      reference: siteId,
      aim_json: JSON.stringify({ name: 'Disposable live mirror acceptance' }),
      reason: 'Exercise live edit contract',
      actor,
      expected_revision: revisionAfterAdd,
    };
    const planEdit = await post('/plan', editPayload);
    assert.equal(planEdit.response.status, 200, compact(planEdit));
    assert.equal(planEdit.body?.status, 'planned', compact(planEdit));
    assert.equal(planEdit.body?.mutation_performed, false, compact(planEdit));
    const applyEdit = await post('/apply', { ...editPayload, confirm_apply: true });
    assertApplied(applyEdit, 'edit');
    const afterEdit = await read();
    assert.equal(afterEdit.response.status, 200, compact(afterEdit));
    const revisionAfterEdit = afterEdit.body?.site?.revision as number;
    assert.ok(Number.isInteger(revisionAfterEdit), compact(afterEdit));

    const retirePayload = {
      operation: 'retire',
      reference: siteId,
      reason: 'Exercise live lifecycle contract',
      actor,
      expected_revision: revisionAfterEdit,
    };
    const planRetire = await post('/plan', retirePayload);
    assert.equal(planRetire.response.status, 200, compact(planRetire));
    assert.equal(planRetire.body?.status, 'planned', compact(planRetire));
    const applyRetire = await post('/apply', { ...retirePayload, confirm_apply: true });
    assertApplied(applyRetire, 'retire');
    const afterRetire = await read();
    assert.equal(afterRetire.response.status, 200, compact(afterRetire));
    assert.equal(afterRetire.body?.site?.lifecycle_status, 'retired', compact(afterRetire));
    const revisionAfterRetire = afterRetire.body?.site?.revision as number;
    assert.ok(Number.isInteger(revisionAfterRetire), compact(afterRetire));

    const purgePayload = {
      operation: 'purge',
      reference: siteId,
      reason: 'Exercise live purge contract',
      actor,
      expected_revision: revisionAfterRetire,
      confirm_site_id: siteId,
    };
    const planPurge = await post('/plan', purgePayload);
    assert.equal(planPurge.response.status, 200, compact(planPurge));
    assert.equal(planPurge.body?.status, 'planned', compact(planPurge));
    assert.equal(planPurge.body?.mutation_performed, false, compact(planPurge));
    const applyPurge = await post('/apply', { ...purgePayload, confirm_apply: true });
    assertApplied(applyPurge, 'purge');
    applied = false;
    const final = await read();
    assert.equal(final.response.status, 404, compact(final));
    return {
      status: 'passed',
      site_id: siteId,
      operation_count: history.filter((entry) => entry.operation).length,
      cleanup: 'verified_absent',
      history,
    };
  } catch (error) {
    let cleanupStatus: AnyRecord;
    try {
      cleanupStatus = applied ? await cleanup() : { status: 'not_needed' };
    } catch (cleanupError) {
      cleanupStatus = { status: 'failed', error: String(cleanupError).slice(0, 300) };
    }
    const primary = error instanceof Error ? error.message : String(error);
    throw new Error(`disposable_registry_mutation_failed:${primary};cleanup=${JSON.stringify(cleanupStatus)}`);
  }
}

function resolveArtifactPath({
  baseUrl,
  artifactBasePath,
  artifactId,
  artifactHref,
}: {
  baseUrl: string;
  artifactBasePath: string;
  artifactId: string | null;
  artifactHref: string | null;
}): string {
  if (artifactHref) {
    const parsed = new URL(artifactHref, baseUrl);
    if (parsed.origin !== baseUrl) throw new Error('live_journey_artifact_link_origin_invalid');
    const path = parsed.pathname.replace(/\/(?:content)\/?$/, '').replace(/\/$/, '');
    if (path.startsWith(`${artifactBasePath}/`) && path !== artifactBasePath) return path;
  }
  if (artifactId?.trim()) return `${artifactBasePath}/${encodeURIComponent(artifactId.trim())}`;
  throw new Error('live_journey_artifact_id_required');
}

async function runFailureMode({
  baseUrl,
  headers,
  journeyRoutes,
  evidence,
  evidenceTarget,
}: {
  baseUrl: string;
  headers: Record<string, string>;
  journeyRoutes: JourneyRoutes;
  evidence: AnyRecord;
  evidenceTarget: EvidenceTarget;
}): Promise<AnyRecord> {
  if (args.failureMode === 'tunnel-loss') {
    const restartAuthority = await resolveMirrorRestartAuthority();
    if (!restartAuthority) throw new Error('failure_injection_mirror_restart_authority_required');
    let stopExitCode: number | null = null;
    let restartExitCode: number | null = null;
    let unavailable: { status: number | null; code: string | null; waited_ms: number } | null = null;
    try {
      stopExitCode = await runMirrorLifecycleCommand('stop');
      assert.equal(stopExitCode, 0, 'mirror stop command failed');
      unavailable = await waitForRemoteStatus(baseUrl, '/api/nars/operator-console/health', headers, (status) => status === 503);
      assert.equal(unavailable.status, 503, JSON.stringify(unavailable));
    } finally {
      restartExitCode = await runMirrorLifecycleCommand('restart');
    }
    assert.equal(restartExitCode, 0, 'mirror restart command failed');
    const restored = await waitForRemoteStatus(baseUrl, '/api/nars/operator-console/health', headers, (status) => status === 200);
    assert.equal(restored.status, 200, JSON.stringify(restored));
    evidence.checks.failure_injection = {
      mode: 'tunnel-loss',
      stop_exit_code: stopExitCode,
      unavailable_status: unavailable?.status ?? null,
      unavailable_code: unavailable?.code ?? null,
      restart_exit_code: restartExitCode,
      restored_status: restored.status,
      restart_authority: restartAuthority,
      passed: true,
    };
    evidence.status = 'passed';
    return persist(evidence, evidenceTarget);
  }

  if (!journeyRoutes.session_path) {
    throw new Error(`failure_mode_requires_concrete_session_route:${journeyRoutes.availability.agent_sessions.reason}`);
  }
  const sessionPath = journeyRoutes.session_path;
  const failureProbePath = args.failureMode === 'stale-lease'
    ? `${sessionPath.replace(/\/$/, '')}/api/health`
    : sessionPath;
  const routerToken = readRouterAdminToken();
  const routerUrl = requireLoopbackRouterUrl(process.env.NARADA_OPERATOR_ROUTER_URL ?? 'http://127.0.0.1:61729');
  const adminRoutes = await routerRequest(routerUrl, routerToken, '/admin/routes');
  assert.equal(adminRoutes.response.status, 200, compact(adminRoutes));
  const routes = Array.isArray(adminRoutes.body?.routes) ? adminRoutes.body.routes as AnyRecord[] : [];
  const targetPath = normalizeRoutePath(sessionPath);
  const route = routes.find((candidate) => normalizeRoutePath(String(candidate.public_path ?? '')) === targetPath);
  assert.ok(route, 'live failure injection requires a concrete session route');
  const routeId = String(route.route_id ?? '');
  const ownerId = String(route.owner_id ?? '');
  const instanceNonce = String(route.process_evidence?.instance_nonce ?? '');
  assert.ok(routeId && ownerId && instanceNonce, 'live failure injection route identity is incomplete');

  let mutationResponse: { status: number; code: string | null } | null = null;
  let unavailable: { status: number | null; code: string | null; waited_ms: number } | null = null;
  let restoreResponse: { status: number; code: string | null } | null = null;
  let primaryFailure: unknown = null;
  let staleRoute: AnyRecord | null = null;
  const failureWaitTimeoutMs = args.failureMode === 'stale-lease'
    ? Math.min(args.timeoutMs, 15_000)
    : args.timeoutMs;
  try {
    if (args.failureMode === 'route-revocation') {
      const deleted = await routerRequest(routerUrl, routerToken, `/admin/routes/${encodeURIComponent(routeId)}`, {
        method: 'DELETE',
        body: JSON.stringify({ owner_id: ownerId, instance_nonce: instanceNonce }),
      });
      mutationResponse = { status: deleted.response.status, code: stringOrNull(deleted.body?.error) };
      assert.equal(deleted.response.status, 200, compact(deleted));
    } else if (args.failureMode === 'stale-lease') {
      const processEvidence = route.process_evidence && typeof route.process_evidence === 'object'
        ? route.process_evidence as AnyRecord
        : {};
      const staleOwnerId = `operator-console-live-e2e:stale:${Date.now()}`;
      const staleInstanceNonce = `operator-console-live-e2e-${Date.now()}`;
      staleRoute = {
        ...route,
        owner_id: staleOwnerId,
        process_evidence: {
          ...processEvidence,
          pid: null,
          instance_nonce: staleInstanceNonce,
        },
        lease_ms: 5_000,
      };
      let registered = false;
      for (let attempt = 0; attempt < 3 && !registered; attempt += 1) {
        const deleted = await routerRequest(routerUrl, routerToken, `/admin/routes/${encodeURIComponent(routeId)}`, {
          method: 'DELETE',
          body: JSON.stringify({ owner_id: ownerId, instance_nonce: instanceNonce }),
        });
        assert.equal(deleted.response.status, 200, compact(deleted));
        const replacement = await routerRequest(routerUrl, routerToken, '/admin/routes', {
          method: 'POST',
          body: JSON.stringify(staleRoute),
        });
        if (replacement.response.status === 200) {
          registered = true;
          mutationResponse = { status: replacement.response.status, code: stringOrNull(replacement.body?.error) };
          break;
        }
        if (stringOrNull(replacement.body?.error) !== 'operator_router_route_owner_conflict') {
          assert.equal(replacement.response.status, 200, compact(replacement));
        }
      }
      assert.equal(registered, true, 'stale-lease route replacement was not admitted');
    } else {
      const renewed = await routerRequest(routerUrl, routerToken, `/admin/routes/${encodeURIComponent(routeId)}/renew`, {
        method: 'POST',
        body: JSON.stringify({ owner_id: ownerId, instance_nonce: instanceNonce, lease_ms: 5_000 }),
      });
      mutationResponse = { status: renewed.response.status, code: stringOrNull(renewed.body?.error) };
      assert.equal(renewed.response.status, 200, compact(renewed));
    }
    unavailable = await waitForRemoteStatus(baseUrl, failureProbePath, headers, (status) => status === 404, failureWaitTimeoutMs);
    assert.equal(unavailable.status, 404, JSON.stringify(unavailable));
  } catch (error) {
    primaryFailure = error;
  } finally {
    if (staleRoute) {
      const staleProcessEvidence = staleRoute.process_evidence as AnyRecord;
      const deletedStale = await routerRequest(routerUrl, routerToken, `/admin/routes/${encodeURIComponent(routeId)}`, {
        method: 'DELETE',
        body: JSON.stringify({
          owner_id: staleRoute.owner_id,
          instance_nonce: staleProcessEvidence.instance_nonce,
        }),
      });
      const staleDeleteCode = stringOrNull(deletedStale.body?.error);
      if (primaryFailure === null && deletedStale.response.status !== 200 && staleDeleteCode !== 'operator_router_route_not_found') {
        primaryFailure = new Error(`stale_route_cleanup_failed:${deletedStale.response.status}`);
      }
    }
    const restored = await routerRequest(routerUrl, routerToken, '/admin/routes', {
      method: 'POST',
      body: JSON.stringify(route),
    });
    restoreResponse = { status: restored.response.status, code: stringOrNull(restored.body?.error) };
    if (primaryFailure === null && restored.response.status !== 200) {
      primaryFailure = new Error(`route_restore_failed:${restored.response.status}`);
    }
  }
  if (primaryFailure !== null) throw primaryFailure;
  assert.equal(restoreResponse?.status, 200, JSON.stringify(restoreResponse));
  const restoredRoute = await waitForRemoteStatus(baseUrl, failureProbePath, headers, (status) => status === 200);
  assert.equal(restoredRoute.status, 200, JSON.stringify(restoredRoute));
  evidence.checks.failure_injection = {
    mode: args.failureMode,
    route_id: routeId,
    probe_path: failureProbePath,
    probe_timeout_ms: failureWaitTimeoutMs,
    mutation_status: mutationResponse?.status ?? null,
    mutation_code: mutationResponse?.code ?? null,
    unavailable_status: unavailable?.status ?? null,
    unavailable_code: unavailable?.code ?? null,
    restore_status: restoreResponse?.status ?? null,
    restored_status: restoredRoute.status,
    passed: true,
  };
  evidence.status = 'passed';
  return persist(evidence, evidenceTarget);
}

async function runMirrorLifecycleCommand(action: 'stop' | 'restart'): Promise<number> {
  const entrypoint = resolve(REPO_ROOT, 'packages/layers/cli/dist/main.js');
  return await new Promise<number>((resolvePromise) => {
    let settled = false;
    const child = spawn(process.execPath, [entrypoint, 'console', 'mirror', action, '--format', 'json'], {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: 'ignore',
      windowsHide: true,
    });
    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      resolvePromise(code);
    };
    child.once('error', () => finish(1));
    child.once('exit', (code) => finish(typeof code === 'number' ? code : 1));
  });
}

async function resolveMirrorRestartAuthority(): Promise<'environment' | 'owned_state' | null> {
  if (process.env.NARADA_OPERATOR_CONSOLE_BRIDGE_TOKEN?.trim()) return 'environment';

  const status = await runMirrorStatusCommand();
  const bridgeTokenFile = status?.state?.bridge_token_file;
  if (status?.status !== 'ready' || typeof bridgeTokenFile !== 'string' || !existsSync(bridgeTokenFile)) {
    return null;
  }
  return 'owned_state';
}

async function runMirrorStatusCommand(): Promise<AnyRecord | null> {
  const entrypoint = resolve(REPO_ROOT, 'packages/layers/cli/dist/main.js');
  return await new Promise<AnyRecord | null>((resolvePromise) => {
    let settled = false;
    let stdout = '';
    const child = spawn(process.execPath, [entrypoint, 'console', 'mirror', 'status', '--format', 'json'], {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill();
      finish(null);
    }, 10_000);
    const finish = (value: AnyRecord | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(value);
    };
    child.stdout?.on('data', (chunk) => {
      if (stdout.length < 100_000) stdout += String(chunk).slice(0, 100_000 - stdout.length);
    });
    child.once('error', () => finish(null));
    child.once('exit', (code) => {
      if (code !== 0) return finish(null);
      try {
        const parsed = JSON.parse(stdout.trim());
        finish(parsed && typeof parsed === 'object' ? parsed as AnyRecord : null);
      } catch {
        finish(null);
      }
    });
  });
}

async function waitForRemoteStatus(
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
  predicate: (status: number) => boolean,
  waitTimeoutMs = args.timeoutMs,
): Promise<{ status: number | null; code: string | null; waited_ms: number }> {
  const started = Date.now();
  let latest: { status: number | null; code: string | null } = { status: null, code: null };
  while (Date.now() - started < waitTimeoutMs) {
    try {
      const result = await requestJson(baseUrl, path, headers);
      latest = { status: result.response.status, code: stringOrNull(result.body?.code) };
      if (predicate(result.response.status)) return { ...latest, waited_ms: Date.now() - started };
    } catch {
      latest = { status: null, code: null };
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  return { ...latest, waited_ms: Date.now() - started };
}

async function routerRequest(
  routerUrl: string,
  routerToken: string,
  path: string,
  options: { method?: string; body?: string } = {},
): Promise<{ response: Response; body: AnyRecord }> {
  const response = await fetch(new URL(path, routerUrl), {
    method: options.method ?? 'GET',
    headers: {
      'x-narada-router-token': routerToken,
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(options.body !== undefined ? { body: options.body } : {}),
    redirect: 'manual',
    signal: AbortSignal.timeout(args.timeoutMs),
  });
  const raw = (await response.text()).slice(0, 64_000);
  let body: AnyRecord;
  try { body = JSON.parse(raw); } catch { body = {}; }
  return { response, body };
}

function readRouterAdminToken(): string {
  const configured = process.env.NARADA_OPERATOR_ROUTER_TOKEN?.trim();
  if (configured) return configured;
  const localAppData = process.env.LOCALAPPDATA?.trim()
    || join(process.env.USERPROFILE?.trim() || process.env.HOME?.trim() || '', 'AppData', 'Local');
  const stateRoot = process.env.NARADA_OPERATOR_ROUTER_STATE_ROOT?.trim()
    || join(localAppData, 'Narada', 'operator-router');
  const token = readFileSync(join(stateRoot, 'registration-token'), 'utf8').trim();
  if (!token) throw new Error('router_admin_token_required');
  return token;
}

function requireLoopbackRouterUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.search || url.hash) {
    throw new Error('router_url_must_be_loopback_http');
  }
  return url.origin;
}

function normalizeRoutePath(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '');
  return normalized || '/';
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

async function waitForPageValue(
  page: AnyRecord,
  expression: string,
  predicate: (value: unknown) => boolean,
  timeoutMs: number,
): Promise<{ found: boolean; value?: unknown; waited_ms: number }> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await page.evaluate(expression);
    if (predicate(value)) return { found: true, value, waited_ms: Date.now() - started };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return { found: false, value: await page.evaluate(expression), waited_ms: Date.now() - started };
}

function parseWebSocketEvent(entry: AnyRecord): AnyRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(String(entry?.payload_data ?? ''));
  } catch {
    return null;
  }
  const unwrap = (candidate: unknown): AnyRecord | null => {
    if (!candidate || typeof candidate !== 'object') return null;
    const record = candidate as AnyRecord;
    if (record.event === 'session_event' && record.payload) {
      const nested = unwrap(record.payload);
      if (nested) return nested;
    }
    if (typeof record.event === 'string') return record;
    if (record.event && typeof record.event === 'object') return unwrap(record.event);
    for (const key of ['payload', 'data', 'message', 'result']) {
      const nested = unwrap(record[key]);
      if (nested) return nested;
    }
    return null;
  };
  return unwrap(value);
}

async function waitForSessionEvent(
  page: AnyRecord,
  endpoint: string,
  eventName: string,
  predicate: (event: AnyRecord) => boolean,
  timeoutMs: number,
): Promise<{ entry: AnyRecord; event: AnyRecord }> {
  const result = await page.waitForWebSocketFrame(
    (entry: AnyRecord) => {
      if (String(entry.url ?? '') !== endpoint) return false;
      const event = parseWebSocketEvent(entry);
      return event?.event === eventName && predicate(event);
    },
    timeoutMs,
  );
  assert.equal(result.found, true, JSON.stringify({ endpoint, event: eventName, result }));
  const event = parseWebSocketEvent(result);
  assert.ok(event, JSON.stringify({ endpoint, event: eventName, result }));
  return { entry: result, event: event! };
}

async function request(
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
  options: { method?: string; body?: string } = {},
): Promise<{ response: Response; raw: string }> {
  const response = await fetch(new URL(path, baseUrl), {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: options.body } : {}),
    redirect: 'manual',
    signal: AbortSignal.timeout(args.timeoutMs),
  });
  const raw = await response.text();
  return { response, raw: raw.slice(0, 1_000_000) };
}

async function requestJson(
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
  options: { method?: string; body?: string } = {},
): Promise<{ response: Response; body: AnyRecord; raw: string }> {
  const result = await request(baseUrl, path, headers, options);
  let body: AnyRecord;
  try {
    body = JSON.parse(result.raw);
  } catch {
    body = { raw: result.raw.slice(0, 4000) };
  }
  return { ...result, body };
}

const MAX_ARTIFACT_CONTENT_BYTES = 64 * 1024 * 1024;

async function requestBytes(
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
): Promise<{ response: Response; bytes: Uint8Array }> {
  const response = await fetch(new URL(path, baseUrl), {
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(args.timeoutMs),
  });
  const advertisedLength = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(advertisedLength) && advertisedLength > MAX_ARTIFACT_CONTENT_BYTES) {
    throw new Error(`artifact_content_exceeds_bound:${advertisedLength}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_ARTIFACT_CONTENT_BYTES) {
    throw new Error(`artifact_content_exceeds_bound:${bytes.byteLength}`);
  }
  return { response, bytes };
}

function requireWorkerOrigin(value: string | null): string {
  const raw = value?.trim();
  if (!raw) throw new Error('worker_url_required');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('worker_url_must_be_https_origin');
  }
  return url.origin;
}

function requireLocalRouteDirectoryUrl(value: string | null): string {
  const raw = value?.trim();
  if (!raw) throw new Error('local_route_directory_url_required');
  const url = new URL(raw);
  if (url.protocol !== 'http:' || url.username || url.password || url.search || url.hash || url.pathname !== '/console/routes') {
    throw new Error('local_route_directory_url_invalid');
  }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('local_route_directory_url_must_be_loopback');
  }
  return url.toString();
}

async function readLocalRouteDirectory(value: string | null): Promise<{ response: Response; body: AnyRecord; raw: string }> {
  const response = await fetch(requireLocalRouteDirectoryUrl(value), {
    redirect: 'manual',
    signal: AbortSignal.timeout(args.timeoutMs),
  });
  const raw = (await response.text()).slice(0, 1_000_000);
  let body: AnyRecord;
  try {
    body = JSON.parse(raw);
  } catch {
    body = { raw: raw.slice(0, 4000) };
  }
  return { response, body, raw };
}

function comparableRouteDirectory(body: AnyRecord): unknown {
  return canonicalizeRouteDirectory(body, { ignoreAuthorityIdentity: true });
}

async function readOperatorConsoleAuth(input: LiveArgs, baseUrl: string): Promise<OperatorConsoleAuth> {
  if (!input.operatorSecretStdin) throw new Error('operator_console_shared_secret_stdin_required');
  const secret = await readStdinSecret('operator_console_shared_secret');
  const loginResponse = await fetch(new URL('/auth/operator-console', baseUrl), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ secret, return_to: '/' }),
    redirect: 'manual',
    signal: AbortSignal.timeout(args.timeoutMs),
  });
  if (loginResponse.status !== 200) {
    throw new Error(`operator_console_browser_login_failed:${loginResponse.status}`);
  }
  const setCookieValues = typeof (loginResponse.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === 'function'
    ? (loginResponse.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
    : [loginResponse.headers.get('set-cookie') ?? ''];
  const cookiePair = setCookieValues
    .map((value) => value.split(';', 1)[0]?.trim() ?? '')
    .find((value) => value.startsWith('narada_operator_console_session='));
  if (!cookiePair) throw new Error('operator_console_browser_session_cookie_missing');
  const separator = cookiePair.indexOf('=');
  const cookieValue = cookiePair.slice(separator + 1);
  if (!cookieValue) throw new Error('operator_console_browser_session_cookie_empty');
  return {
    headers: { Authorization: `Bearer ${secret}` },
    browserCookies: [{
      name: 'narada_operator_console_session',
      value: cookieValue,
      url: baseUrl + '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    }],
  };
}

async function readStdinSecret(label: string): Promise<string> {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += String(chunk);
    if (raw.length > 16_384) throw new Error(`${label}_stdin_exceeds_limit`);
  }
  const value = raw.trim();
  if (!value) throw new Error(`${label}_stdin_empty`);
  return value;
}

function compact(value: AnyRecord): string {
  return JSON.stringify({
    status: value.response?.status,
    schema: value.body?.schema ?? null,
    semantic_status: value.body?.status ?? null,
  });
}

function resolveEvidenceTarget(requestedPath: string | null, runId: string): EvidenceTarget {
  const requested = requestedPath
    ? resolve(requestedPath)
    : resolve(REPO_ROOT, '.narada/evidence/operator-console-mirror-live');
  const isJsonFile = requested.toLowerCase().endsWith('.json');
  const directory = isJsonFile ? dirname(requested) : requested;
  const stem = isJsonFile ? basename(requested, '.json') : 'run';
  return {
    runId,
    path: join(directory, `${stem}-${runId}.json`),
    indexPath: join(directory, 'index.jsonl'),
  };
}

function persist(value: AnyRecord, target: EvidenceTarget): AnyRecord {
  mkdirSync(dirname(target.path), { recursive: true });
  const generatedAt = new Date().toISOString();
  const output: AnyRecord = {
    ...value,
    run_id: target.runId,
    generated_at: generatedAt,
    evidence_path: target.path,
    evidence_index_path: target.indexPath,
  };
  writeFileSync(target.path, JSON.stringify(output, null, 2) + '\n', 'utf8');
  appendFileSync(target.indexPath, JSON.stringify({
    schema: output.schema ?? null,
    run_id: target.runId,
    status: output.status ?? null,
    code: output.code ?? null,
    worker_url: output.worker_url ?? null,
    access_mode: output.access_mode ?? null,
    mutation_mode: output.mutation_mode ?? null,
    failure_mode: output.failure_mode ?? null,
    generated_at: generatedAt,
    evidence_path: target.path,
  }) + '\n', 'utf8');
  return output;
}

function persistRefusal(code: string, target: EvidenceTarget): AnyRecord {
  return persist({
    schema: 'narada.operator_console_mirror.live_e2e.v1',
    status: 'refused',
    code,
  }, target);
}

function parseArgs(values: string[]): LiveArgs {
  const parsed: LiveArgs = {
    live: false,
    plan: false,
    allowSkippedJourneys: false,
    quiet: false,
    help: false,
    url: process.env.OPERATOR_CONSOLE_MIRROR_URL ?? null,
    localRouteDirectoryUrl: process.env.OPERATOR_CONSOLE_LOCAL_ROUTE_DIRECTORY_URL ?? 'http://127.0.0.1:61729/console/routes',
    evidencePath: process.env.OPERATOR_CONSOLE_MIRROR_EVIDENCE_PATH ?? null,
    operatorSecretStdin: false,
    turnContent: process.env.OPERATOR_CONSOLE_MIRROR_TURN_CONTENT ?? null,
    artifactId: process.env.OPERATOR_CONSOLE_MIRROR_ARTIFACT_ID ?? null,
    artifactSha256: process.env.OPERATOR_CONSOLE_MIRROR_ARTIFACT_SHA256 ?? null,
    mutationMode: (process.env.OPERATOR_CONSOLE_MIRROR_MUTATION_MODE ?? 'disposable') as LiveArgs['mutationMode'],
    failureMode: 'none',
    timeoutMs: 30_000,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--live') parsed.live = true;
    else if (value === '--plan') parsed.plan = true;
    else if (value === '--allow-skipped-journeys') parsed.allowSkippedJourneys = true;
    else if (value === '--quiet') parsed.quiet = true;
    else if (value === '--help' || value === '-h') parsed.help = true;
    else if (value === '--url') parsed.url = values[++index] ?? null;
    else if (value === '--local-route-directory-url') parsed.localRouteDirectoryUrl = values[++index] ?? null;
    else if (value === '--evidence-path') parsed.evidencePath = values[++index] ?? null;
    else if (value === '--operator-secret-stdin') parsed.operatorSecretStdin = true;
    else if (value === '--operator-secret' || value === '--operator-secret-file') {
      index += 1;
      throw new Error('operator_console_shared_secret_forbidden_use_stdin');
    }
    else if (value === '--turn-content') parsed.turnContent = values[++index] ?? null;
    else if (value === '--artifact-id') parsed.artifactId = values[++index] ?? null;
    else if (value === '--artifact-sha256') parsed.artifactSha256 = values[++index] ?? null;
    else if (value === '--mutation-mode') parsed.mutationMode = (values[++index] ?? 'none') as LiveArgs['mutationMode'];
    else if (value === '--failure-mode') parsed.failureMode = (values[++index] ?? 'none') as LiveArgs['failureMode'];
    else if (value === '--timeout-ms') parsed.timeoutMs = Number(values[++index] ?? '30000');
  }
  if (!['none', 'tunnel-loss', 'route-revocation', 'stale-lease'].includes(parsed.failureMode)) {
    throw new Error('failure_mode_invalid');
  }
  if (!['none', 'disposable', 'api-disposable'].includes(parsed.mutationMode)) {
    throw new Error('mutation_mode_invalid');
  }
  if (parsed.artifactSha256 && !/^[a-f0-9]{64}$/i.test(parsed.artifactSha256.trim())) {
    throw new Error('artifact_sha256_invalid');
  }
  if (parsed.live && parsed.plan) throw new Error('live_plan_conflict');
  return parsed;
}
