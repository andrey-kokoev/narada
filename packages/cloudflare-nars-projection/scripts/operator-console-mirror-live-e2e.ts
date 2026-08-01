#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  findHeadlessBrowser,
  openCdpPage,
  waitForPageText,
} from './lib/browser-smoke.js';
import { resolveJourneyRoutes, type JourneyRoutes } from './lib/operator-console-mirror-journey.js';

type AnyRecord = Record<string, any>;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

type LiveArgs = {
  live: boolean;
  quiet: boolean;
  help: boolean;
  url: string | null;
  localRouteDirectoryUrl: string | null;
  evidencePath: string | null;
  accessClientId: string | null;
  accessClientSecret: string | null;
  accessClientSecretFile: string | null;
  accessCookieFile: string | null;
  artifactId: string | null;
  mutationMode: 'none' | 'disposable';
  failureMode: 'none' | 'tunnel-loss' | 'route-revocation' | 'stale-lease';
  timeoutMs: number;
};

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write([
    'Cloudflare Operator Console mirror live E2E',
    '',
    'Planning mode:',
    '  pnpm --filter @narada-core/cloudflare-nars-projection smoke:operator-console-mirror-live',
    '',
    'Live mode with a Cloudflare Access service token:',
    '  pnpm --filter @narada-core/cloudflare-nars-projection smoke:operator-console-mirror-live -- --live --url <worker-url> --access-client-id <id> --access-client-secret-file <path>',
    '',
    'Live mode with an exported CF_Authorization cookie:',
    '  ... --live --url <worker-url> --access-cookie-file <path>',
    '',
    'The live gate compares the remote route directory with the local authority by default:',
    '  --local-route-directory-url <http://127.0.0.1:61729/console/routes>',
    '',
    'If the live session has no rendered artifact reference, provide:',
    '  ... --artifact-id <session-artifact-id>',
    '',
    'Opt-in disposable Site Registry mutation journey:',
    '  ... --mutation-mode disposable',
    'This adds, edits, retires, and purges a unique temporary record and verifies cleanup.',
    '',
    'Opt-in failure checks (disrupt local projection state and restore it):',
    '  ... --failure-mode tunnel-loss',
    '  ... --failure-mode route-revocation',
    '  ... --failure-mode stale-lease',
    'Route failure modes require NARADA_OPERATOR_ROUTER_TOKEN or the local Router token file.',
    'Tunnel-loss requires the owned mirror state or NARADA_OPERATOR_CONSOLE_BRIDGE_TOKEN so the mirror can be restored.',
    '',
    'The service-token secret or cookie value is never written to evidence or output.',
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
process.exitCode = result.status === 'passed' || result.status === 'planned' ? 0 : 1;

async function run(): Promise<AnyRecord> {
  const evidencePath = args.evidencePath
    ? resolve(args.evidencePath)
    : resolve(REPO_ROOT, '.narada/evidence/operator-console-mirror-live.json');
  if (!args.live) {
    return persist({
      schema: 'narada.operator_console_mirror.live_e2e.v1',
      status: 'planned',
      code: 'live_flag_required',
      required: ['--live', '--url', 'one Access credential mode'],
      credential_modes: ['service_token', 'cf_authorization_cookie'],
      evidence_path: evidencePath,
    }, evidencePath);
  }

  let baseUrl: string;
  let headers: Record<string, string>;
  try {
    baseUrl = requireWorkerOrigin(args.url);
    headers = readAccessHeaders(args);
  } catch (error) {
    return persistRefusal(error instanceof Error ? error.message : String(error), evidencePath);
  }

  const evidence: AnyRecord = {
    schema: 'narada.operator_console_mirror.live_e2e.v1',
    status: 'running',
    worker_url: baseUrl,
    access_mode: headers['CF-Access-Client-Id'] ? 'service_token' : 'cf_authorization_cookie',
    mutation_mode: args.mutationMode,
    failure_mode: args.failureMode,
    checks: {},
  };

  try {
    const unauthenticated = await request(baseUrl, '/api/nars/operator-console/routes', {});
    assert.ok([302, 401, 403].includes(unauthenticated.response.status), 'unauthenticated mirror route must fail closed');
    evidence.checks.unauthenticated = { status: unauthenticated.response.status, passed: true };

    const invalidAccess = headers['CF-Access-Client-Id']
      ? await request(baseUrl, '/api/nars/operator-console/routes', {
        'CF-Access-Client-Id': headers['CF-Access-Client-Id'],
        'CF-Access-Client-Secret': 'invalid-live-e2e-secret',
      })
      : null;
    if (invalidAccess) {
      assert.ok([302, 401, 403].includes(invalidAccess.response.status), 'invalid Access service token must fail closed');
      evidence.checks.invalid_access = { status: invalidAccess.response.status, passed: true };
    }

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
    const remoteParity = comparableRouteDirectory(routeDirectory.body);
    const localParity = comparableRouteDirectory(localRouteDirectory.body);
    assert.equal(JSON.stringify(remoteParity), JSON.stringify(localParity), 'remote route directory does not match local authority');
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

    if (args.mutationMode === 'disposable') {
      evidence.checks.mutation_journey = await runDisposableRegistryMutationJourney(baseUrl, registryHeaders);
    }

    if (args.failureMode !== 'none') {
      return await runFailureMode({ baseUrl, headers, journeyRoutes, evidence, evidencePath });
    }

    const browserPath = findHeadlessBrowser();
    assert.ok(browserPath, 'a supported headless browser is required for browser-level acceptance');
    const page = await openCdpPage({
      browserPath,
      url: baseUrl + '/',
      extraHeaders: headers,
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

      const dynamicChecks: AnyRecord = {};
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
      let sessionConfig: AnyRecord = {};
      let websocketRecords: AnyRecord[] = [];
      if (journeyRoutes.session_path && journeyRoutes.session_events_path) {
        await page.navigate(baseUrl + journeyRoutes.session_path);
        sessionConfig = await page.evaluate('JSON.parse(document.querySelector("#nars-config")?.textContent ?? "{}")');
        const expectedEventEndpoint = new URL(journeyRoutes.session_events_path, baseUrl);
        expectedEventEndpoint.protocol = expectedEventEndpoint.protocol === 'https:' ? 'wss:' : 'ws:';
        assert.equal(String(sessionConfig.eventEndpoint ?? ''), expectedEventEndpoint.toString(), JSON.stringify({ session_config: sessionConfig }));
        const replay = await page.waitForWebSocketFrame(
          (entry: AnyRecord) => String(entry.url ?? '') === expectedEventEndpoint.toString()
            && String(entry.payload_data ?? '').includes('session_events_replay_completed'),
          args.timeoutMs,
        );
        sessionEvents = replay;
        assert.equal(replay.found, true, JSON.stringify({ session_events: replay }));
        assert.equal(await page.evaluate('Boolean(document.querySelector("#events"))'), true);
        websocketRecords = await page.webSocketInstrumentation();
        assert.equal(websocketRecords.some((record: AnyRecord) => String(record.url ?? '') === expectedEventEndpoint.toString()), true, JSON.stringify({ websocket_records: websocketRecords }));
      } else {
        dynamicChecks.agent_sessions = {
          ...journeyRoutes.availability.agent_sessions,
          status: 'skipped',
        };
      }

      const observedArtifactHref = await page.evaluate('Array.from(document.querySelectorAll("a[href*=\\"/artifacts/\\"]")).map((element) => element.href).find(Boolean) ?? null');
      const artifactHref = typeof observedArtifactHref === 'string' ? observedArtifactHref : null;
      let artifactPath: string | null = null;
      let artifactContentPath: string | null = null;
      let artifactId: string | null = null;
      if (journeyRoutes.artifact_base_path && (artifactHref || args.artifactId?.trim())) {
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
        artifactContentPath = artifactPath.replace(/\/?$/, '/content');
        await page.navigate(baseUrl + artifactContentPath);
        const artifactContent = await waitForPageValue(page, 'document.body?.innerText ?? ""', (value) => String(value).trim().length > 0, args.timeoutMs);
        assert.equal(artifactContent.found, true, JSON.stringify({ artifact_content: artifactContent }));
        dynamicChecks.artifacts = {
          status: 'passed',
          path: artifactPath,
          content_path: artifactContentPath,
          artifact_id: decodeURIComponent(concreteArtifactId),
        };
      } else {
        dynamicChecks.artifacts = {
          ...journeyRoutes.availability.artifacts,
          status: 'skipped',
          reason: journeyRoutes.artifact_base_path ? 'artifact_id_not_observed' : journeyRoutes.availability.artifacts.reason,
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
        dynamic: dynamicChecks,
        site_operations_path: journeyRoutes.site_operations_path,
        session_path: journeyRoutes.session_path,
        session_events_path: journeyRoutes.session_events_path,
        session_event_count: sessionEvents?.value ?? null,
        session_event_endpoint: sessionConfig.eventEndpoint ?? null,
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

    evidence.status = 'passed';
    return persist(evidence, evidencePath);
  } catch (error) {
    evidence.status = 'failed';
    evidence.code = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
    return persist(evidence, evidencePath);
  }
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
  evidencePath,
}: {
  baseUrl: string;
  headers: Record<string, string>;
  journeyRoutes: JourneyRoutes;
  evidence: AnyRecord;
  evidencePath: string;
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
    return persist(evidence, evidencePath);
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
  return persist(evidence, evidencePath);
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

function comparableRouteDirectory(body: AnyRecord): AnyRecord {
  const parity = body.httpRouteParity && typeof body.httpRouteParity === 'object'
    ? { ...(body.httpRouteParity as AnyRecord), generatedAt: null }
    : null;
  return {
    schema: body.schema ?? null,
    surfaces: Array.isArray(body.surfaces) ? body.surfaces : [],
    httpRouteParity: parity,
  };
}

function readAccessHeaders(input: LiveArgs): Record<string, string> {
  if (input.accessClientId) {
    const secret = input.accessClientSecretFile
      ? readFileSync(input.accessClientSecretFile, 'utf8').trim()
      : input.accessClientSecret?.trim();
    if (!secret) throw new Error('access_client_secret_required');
    return {
      'CF-Access-Client-Id': input.accessClientId,
      'CF-Access-Client-Secret': secret,
    };
  }
  if (input.accessCookieFile) {
    const raw = readFileSync(input.accessCookieFile, 'utf8').trim();
    if (!raw) throw new Error('access_cookie_empty');
    let value = raw;
    try {
      const parsed = JSON.parse(raw);
      value = parsed?.value ?? parsed?.cookie ?? parsed?.CF_Authorization ?? (
        Array.isArray(parsed?.cookies)
          ? parsed.cookies.find((cookie: AnyRecord) => cookie?.name === 'CF_Authorization')?.value
          : undefined
      ) ?? '';
    } catch {
      // A plain exported CF_Authorization value is also accepted.
    }
    if (!value) throw new Error('cf_authorization_cookie_not_found');
    return { Cookie: String(value).startsWith('CF_Authorization=') ? String(value) : 'CF_Authorization=' + String(value) };
  }
  throw new Error('access_service_token_or_cookie_required');
}

function compact(value: AnyRecord): string {
  return JSON.stringify({
    status: value.response?.status,
    schema: value.body?.schema ?? null,
    semantic_status: value.body?.status ?? null,
  });
}

function persist(value: AnyRecord, evidencePath: string): AnyRecord {
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, JSON.stringify({ ...value, generated_at: new Date().toISOString() }, null, 2) + '\n', 'utf8');
  return { ...value, evidence_path: evidencePath };
}

function persistRefusal(code: string, evidencePath: string): AnyRecord {
  return persist({
    schema: 'narada.operator_console_mirror.live_e2e.v1',
    status: 'refused',
    code,
  }, evidencePath);
}

function parseArgs(values: string[]): LiveArgs {
  const parsed: LiveArgs = {
    live: false,
    quiet: false,
    help: false,
    url: process.env.OPERATOR_CONSOLE_MIRROR_URL ?? null,
    localRouteDirectoryUrl: process.env.OPERATOR_CONSOLE_LOCAL_ROUTE_DIRECTORY_URL ?? 'http://127.0.0.1:61729/console/routes',
    evidencePath: process.env.OPERATOR_CONSOLE_MIRROR_EVIDENCE_PATH ?? null,
    accessClientId: process.env.CLOUDFLARE_ACCESS_CLIENT_ID ?? null,
    accessClientSecret: process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET ?? null,
    accessClientSecretFile: process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET_FILE ?? null,
    accessCookieFile: process.env.CLOUDFLARE_ACCESS_COOKIE_FILE ?? null,
    artifactId: process.env.OPERATOR_CONSOLE_MIRROR_ARTIFACT_ID ?? null,
    mutationMode: (process.env.OPERATOR_CONSOLE_MIRROR_MUTATION_MODE ?? 'none') as LiveArgs['mutationMode'],
    failureMode: 'none',
    timeoutMs: 30_000,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--live') parsed.live = true;
    else if (value === '--quiet') parsed.quiet = true;
    else if (value === '--help' || value === '-h') parsed.help = true;
    else if (value === '--url') parsed.url = values[++index] ?? null;
    else if (value === '--local-route-directory-url') parsed.localRouteDirectoryUrl = values[++index] ?? null;
    else if (value === '--evidence-path') parsed.evidencePath = values[++index] ?? null;
    else if (value === '--access-client-id') parsed.accessClientId = values[++index] ?? null;
    else if (value === '--access-client-secret') parsed.accessClientSecret = values[++index] ?? null;
    else if (value === '--access-client-secret-file') parsed.accessClientSecretFile = values[++index] ?? null;
    else if (value === '--access-cookie-file') parsed.accessCookieFile = values[++index] ?? null;
    else if (value === '--artifact-id') parsed.artifactId = values[++index] ?? null;
    else if (value === '--mutation-mode') parsed.mutationMode = (values[++index] ?? 'none') as LiveArgs['mutationMode'];
    else if (value === '--failure-mode') parsed.failureMode = (values[++index] ?? 'none') as LiveArgs['failureMode'];
    else if (value === '--timeout-ms') parsed.timeoutMs = Number(values[++index] ?? '30000');
  }
  if (!['none', 'tunnel-loss', 'route-revocation', 'stale-lease'].includes(parsed.failureMode)) {
    throw new Error('failure_mode_invalid');
  }
  if (!['none', 'disposable'].includes(parsed.mutationMode)) {
    throw new Error('mutation_mode_invalid');
  }
  return parsed;
}
