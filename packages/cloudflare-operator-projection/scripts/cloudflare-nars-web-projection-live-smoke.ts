#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

type AnyRecord = Record<string, any>;
type AnyPage = any;
import { resolveNaradaSitePaths } from '@narada-core/site-paths';
import { deliverProjectionInputToNars } from '../dist/nars-session-input-client.js';
import {
  deliverRemoteProjectionInputsOnce,
  preflightCloudflareProjectionRegistration,
  registerProjectionRemotely,
  startLocalProjectionBridgeOnce,
} from '../dist/node.js';
import {
  findHeadlessBrowser,
  openCdpPage,
  waitForPageText,
  waitForPageTextOccurrence,
  waitForPageTextWithAction,
} from './lib/browser-smoke.js';
import { validateRemoteCloudflareApiBaseUrl } from './lib/live-boundary.js';

const args: AnyRecord = parseArgs(process.argv.slice(2));
const now = new Date().toISOString();

const result = await run();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.status === 'passed' || result.status === 'planned' ? 0 : 1;

async function run(): Promise<AnyRecord> {
  const evidencePaths = resolveEvidencePaths('live-smoke', args);
  const evidencePath = evidencePaths.evidencePath;
  if (!args.live) {
    return evidence({
      schema: 'narada.cloudflare_nars_projection.live_smoke.v1',
      status: 'planned',
      code: 'live_flag_required',
      operator_action: 'Re-run with --live after confirming Cloudflare and local NARS mutation intent.',
      required: requiredArgs(),
      evidence_path: null,
    }, evidencePaths, false);
  }
  const missing = requiredArgs().filter((name: string) => !args[optionKey(name)]);
  if (missing.length) {
    return evidence({
      schema: 'narada.cloudflare_nars_projection.live_smoke.v1',
      status: 'refused',
      code: 'missing_required_live_smoke_options',
      missing,
      evidence_path: evidencePath,
    }, evidencePaths, true);
  }
  const remoteBoundary = validateRemoteCloudflareApiBaseUrl(args.cloudflareApiBaseUrl);
  if (!remoteBoundary.ok) {
    return evidence({
      schema: 'narada.cloudflare_nars_projection.live_smoke.v1',
      status: 'refused',
      code: remoteBoundary.code,
      message: remoteBoundary.message,
      deployment_boundary: 'remote_https_worker',
      evidence_path: evidencePath,
    }, evidencePaths, true);
  }
  args.cloudflareApiBaseUrl = remoteBoundary.origin;
  const preflight: AnyRecord = await preflightCloudflareProjectionRegistration({
    cloudflare_api_base_url: args.cloudflareApiBaseUrl,
    cloudflare_carrier_api_base_url: args.cloudflareCarrierUrl,
    operator_cookie_file: args.operatorCookieFile,
    site_coherence_site_id: args.siteCoherenceSiteId,
    require_operator_session: Boolean(args.requireOperatorSession),
  });
  if (preflight.status !== 'ok') {
    return evidence({ schema: 'narada.cloudflare_nars_projection.live_smoke.v1', status: 'refused', code: 'preflight_refused', preflight, evidence_path: evidencePath }, evidencePaths, true);
  }
  const expectedAssetManifest = readJsonFile(args.expectedAssetsManifest);
  if (!expectedAssetManifest || expectedAssetManifest.schema !== 'narada.cloudflare_assets_manifest.v1') {
    return evidence({
      schema: 'narada.cloudflare_nars_projection.live_smoke.v1',
      status: 'refused',
      code: 'expected_asset_manifest_invalid',
      expected_assets_manifest: args.expectedAssetsManifest,
      evidence_path: evidencePath,
    }, evidencePaths, true);
  }

  const projectionId = args.projectionId ?? `proj_live_${Date.now()}`;
  const registration: AnyRecord = await registerProjectionRemotely({
    site_id: args.siteId,
    site_root: args.siteRoot,
    nars_session_id: args.session,
    projection_id: projectionId,
    source_ref: args.carrierSessionId || args.operationId
      ? {
        kind: 'cloudflare_carrier',
        carrier_session_id: args.carrierSessionId ?? null,
        operation_id: args.operationId ?? null,
      }
      : null,
    dry_run: false,
    cloudflare_api_base_url: args.cloudflareApiBaseUrl,
    cloudflare_carrier_api_base_url: args.cloudflareCarrierUrl,
    operator_cookie_file: args.operatorCookieFile,
    site_coherence_site_id: args.siteCoherenceSiteId,
    require_operator_session: Boolean(args.requireOperatorSession),
  });
  if (registration.status !== 'registered_remotely') {
    return evidence({ schema: 'narada.cloudflare_nars_projection.live_smoke.v1', status: 'failed', code: 'registration_failed', registration, evidence_path: evidencePath }, evidencePaths, true);
  }
  const bridgeToken = registration.remote_access.bridge_credential.token_fingerprint;
  const browserToken = registration.remote_access.browser_access_tokens[0]?.token_fingerprint;
  const hostedWebUrl = `${args.cloudflareApiBaseUrl.replace(/\/+$/, '')}/?cloudflare_projection_id=${encodeURIComponent(projectionId)}&cloudflare_api_base_url=${encodeURIComponent(args.cloudflareApiBaseUrl.replace(/\/+$/, ''))}&cloudflare_browser_token=${encodeURIComponent(browserToken)}&smoke_cache_bust=${Date.now()}`;
  const legacyHostedWebUrl = new URL(hostedWebUrl);
  legacyHostedWebUrl.pathname = '/sessions/';
  const base = `${args.cloudflareApiBaseUrl.replace(/\/+$/, '')}/api/nars/projections/${encodeURIComponent(projectionId)}`;

  const bridge: AnyRecord = await startLocalProjectionBridgeOnce({
    site_root: args.siteRoot,
    projection_id: projectionId,
    publish_event: (event: AnyRecord) => postJson(`${base}/events`, { site_id: event.site_id, nars_session_id: event.nars_session_id, event: event.payload }, { 'x-narada-bridge-token-fingerprint': bridgeToken }),
    publish_artifact_metadata: (artifact: AnyRecord) => postJson(`${base}/artifacts`, { artifact }, { 'x-narada-bridge-token-fingerprint': bridgeToken }),
    publish_artifact_content: (content: AnyRecord) => postJson(`${base}/artifacts/${encodeURIComponent(content.artifact_id)}/content`, { artifact: content, content_base64: content.content_base64, headers: content.headers }, { 'x-narada-bridge-token-fingerprint': bridgeToken }),
  });
  const replay = await getJson(`${base}/events?since_sequence=0`, { 'x-narada-browser-token-fingerprint': browserToken });
  const hostedShell = await getText(hostedWebUrl);
  const legacyProjectionRoute = await verifyLegacyProjectionRoute({
    legacyHostedWebUrl: legacyHostedWebUrl.toString(),
    hostedWebUrl,
    projectionId,
    cloudflareApiBaseUrl: args.cloudflareApiBaseUrl,
    browserToken,
  });
  const deployedAssetManifest = await getJson(`${args.cloudflareApiBaseUrl.replace(/\/+$/, '')}/api/nars/assets/manifest`);
  const assetFingerprint = compareAssetManifests(expectedAssetManifest, deployedAssetManifest);
  const metadata = await getJson(`${base}/artifacts`, { 'x-narada-browser-token-fingerprint': browserToken });
  let artifactContent: AnyRecord = { status: 'not_checked', reason: 'no_projected_artifact_metadata' };
  const artifactId = metadata?.artifacts?.[0]?.artifact_id;
  if (artifactId) artifactContent = await getJson(`${base}/artifacts/${encodeURIComponent(artifactId)}/content`, { 'x-narada-browser-token-fingerprint': browserToken });
  const hostedBrowser: AnyRecord = await verifyHostedBrowserProjection({
    hostedWebUrl,
    siteRoot: args.siteRoot,
    projectionId,
    cloudflareApiBaseUrl: args.cloudflareApiBaseUrl,
    browserToken,
  });
  const input: AnyRecord = hostedBrowser.input ?? { status: 'not_checked', reason: 'covered_by_hosted_browser_strict_round_trip' };
  const delivery: AnyRecord = hostedBrowser.delivery ?? { status: 'not_checked', reason: 'covered_by_hosted_browser_strict_round_trip' };
  const revoke: AnyRecord = hostedBrowser.revoke ?? await fetch(base, { method: 'DELETE' }).then((response) => response.json().catch(() => ({ status: response.ok ? 'revoked' : 'unknown' })));
  const refusedAfterRevoke = await getJson(`${base}/events?since_sequence=0`, { 'x-narada-browser-token-fingerprint': browserToken });
  const projectedEventCount = Number(bridge.projected_event_count ?? 0);
  const replayEventCount = Number(replay.event_count ?? 0);
  const remoteReplayCaughtUp = projectedEventCount === 0 || replayEventCount > 0;
  const inputAccepted = input?.input_response?.body?.ok === true;
  const passed = bridge.status === 'connected' && replay.status === 'ok' && remoteReplayCaughtUp && hostedShell.ok === true && hostedShell.contains_app_root === true && hostedShell.contains_agent_web_ui_config_placeholder === false && legacyProjectionRoute.status === 'passed' && assetFingerprint.status === 'passed' && hostedBrowser.status === 'passed' && metadata.status === 'ok' && inputAccepted && delivery.status === 'delivered' && revoke.status === 'revoked' && refusedAfterRevoke.status === 'refused';
  return evidence({
    schema: 'narada.cloudflare_nars_projection.live_smoke.v1',
    status: passed ? 'passed' : 'failed',
    authority_origin: 'local',
    authority_runtime_kind: 'local_nars_authority_runtime',
    smoke_lineage: 'local-origin-live',
    deployment_boundary: remoteBoundary.deployment_boundary,
    remote_cloudflare_origin: remoteBoundary.origin,
    projection_id: projectionId,
    hosted_web_url: hostedWebUrl,
    legacy_hosted_web_url: legacyHostedWebUrl.toString(),
    hosted_shell_check_kind: 'http_html_shell_only',
    hosted_browser_check_kind: 'browser_level_local_origin_projection_e2e',
    strongest_hosted_web_ui_evidence: strongestHostedWebUiEvidence({ hostedShell, hostedBrowser, assetFingerprint }),
    hosted_web_ui_evidence: hostedWebUiEvidence({ hostedShell, hostedBrowser, assetFingerprint }),
    checks: { preflight, registration_status: registration.status, bridge, replay, remote_replay_caught_up: remoteReplayCaughtUp, hosted_shell: hostedShell, legacy_projection_route: legacyProjectionRoute, expected_asset_manifest: args.expectedAssetsManifest, deployed_asset_manifest: deployedAssetManifest, asset_fingerprint: assetFingerprint, hosted_browser: hostedBrowser, metadata, artifact_content: artifactContent, input, delivery, revoke, refused_after_revoke: refusedAfterRevoke },
    evidence_path: evidencePath,
    evidence_latest_path: evidencePaths.latestPath,
    evidence_index_path: evidencePaths.indexPath,
  }, evidencePaths, true);
}

async function selectHostedBrowserView(page: AnyPage, label: string): Promise<any> {
  return await page.evaluate(`(() => {
    const label = ${JSON.stringify(label)};
    const canonicalValue = label.toLowerCase() === 'raw' ? 'raw' : label.toLowerCase();
    const selects = [...document.querySelectorAll('select')];
    for (const select of selects) {
      const option = [...select.options].find((candidate) =>
        candidate.value.trim().toLowerCase() === canonicalValue
        || candidate.textContent?.trim().toLowerCase() === label.toLowerCase()
      );
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    const button = [...document.querySelectorAll('button,[role="button"],[role="tab"],label,a,*')].find((candidate) => candidate.textContent?.trim().toLowerCase() === label.toLowerCase());
    if (!button) {
      const available = selects.map((select) => [...select.options].map((option) => option.value + ':' + (option.textContent?.trim() ?? '')));
      throw new Error('projection_view_not_found:' + label + ';select_options=' + JSON.stringify(available));
    }
    button.click();
    return true;
  })()`);
}

async function scrollHostedBrowserTranscriptToBottom(page: AnyPage): Promise<any> {
  return await page.evaluate(`(() => {
    const scroller = document.querySelector('.events-scroll, #events')?.closest('.events-scroll') ?? document.querySelector('.events-scroll');
    const target = scroller || document.scrollingElement || document.documentElement;
    if (!target) return false;
    target.scrollTop = target.scrollHeight;
    return true;
  })()`);
}

async function captureHostedBrowserState(page: AnyPage): Promise<AnyRecord> {
  const dom = await page.evaluate(`(() => {
    const selects = [...document.querySelectorAll('select')].map((select) => ({
      id: select.id,
      aria_label: select.getAttribute('aria-label'),
      value: select.value,
      options: [...select.options].slice(0, 24).map((option) => ({ value: option.value, label: option.textContent?.trim() ?? '' })),
    }));
    const bodyText = document.body?.innerText ?? '';
    return {
      href: location.href,
      pathname: location.pathname,
      ready_state: document.readyState,
      body_text_length: bodyText.length,
      body_text_sample: bodyText.slice(0, 2500),
      app_present: Boolean(document.querySelector('#app')),
      operator_input_present: Boolean(document.querySelector('#operator-input')),
      select_count: selects.length,
      selects,
    };
  })()`);
  return {
    dom,
    websocket_frames: typeof page.webSocketFrames === 'function'
      ? page.webSocketFrames().slice(-20).map((frame: AnyRecord) => ({
        url: frame.url ?? null,
        payload_data: String(frame.payload_data ?? '').slice(0, 1200),
        opcode: frame.opcode ?? null,
      }))
      : [],
    websocket_frames_sent: typeof page.webSocketFramesSent === 'function'
      ? page.webSocketFramesSent().slice(-20).map((frame: AnyRecord) => ({
        url: frame.url ?? null,
        payload_data: String(frame.payload_data ?? '').slice(0, 1200),
        opcode: frame.opcode ?? null,
      }))
      : [],
    websocket_closures: typeof page.webSocketClosures === 'function' ? page.webSocketClosures().slice(-20) : [],
    websocket_instrumentation: typeof page.webSocketInstrumentation === 'function' ? await page.webSocketInstrumentation() : [],
    runtime_diagnostics: typeof page.runtimeDiagnostics === 'function' ? page.runtimeDiagnostics().slice(-20) : [],
  };
}

async function verifyHostedBrowserProjection(args: AnyRecord): Promise<AnyRecord> {
  const browserPath = findHeadlessBrowser();
  if (!browserPath) return { status: 'failed', code: 'headless_browser_not_found' };
  const message = `Cloudflare strict live local NARS E2E ${Date.now()}`;
  const submittedInput = message;
  const page = await openCdpPage({ browserPath, url: args.hostedWebUrl, userDataPrefix: 'narada-cloudflare-projection-browser-', instrumentWebSocketClose: true });
  try {
    const initial = await waitForPageText(page, 'Browser projection attached', 15000);
    const stream = await waitForPageText(page, 'stream connected', 15000);
    const bootstrap: AnyRecord = await page.evaluate(`(() => {
      const params = new URLSearchParams(location.search);
      return {
        pathname: location.pathname,
        projection_id: params.get('cloudflare_projection_id'),
        cloudflare_api_base_url: params.get('cloudflare_api_base_url'),
        browser_token_present: Boolean(params.get('cloudflare_browser_token')),
        config_placeholder_present: document.documentElement?.innerHTML.includes('__NARADA_AGENT_WEB_UI_CONFIG__') ?? false,
      };
    })()`);
    const beforeOccurrence = await page.textOccurrenceCount(message);
    await selectHostedBrowserView(page, 'Raw');
    const rawViewConnected = await page.waitForWebSocketFrame((entry: AnyRecord) => {
      const url = String(entry.url ?? '');
      const payload = String(entry.payload_data ?? '');
      return url.includes(`/api/nars/projections/${args.projectionId}/events/websocket`)
        && url.includes('view=raw')
        && payload.includes('"event":"websocket_connected"');
    }, 15000);
    const input = await submitHostedBrowserOperatorMessage(page, submittedInput);
    const optimistic = await waitForPageTextOccurrence(page, message, beforeOccurrence + 1, 10000);
    const delivery = await deliverRemoteProjectionInputsOnce({
      site_root: args.siteRoot,
      projection_id: args.projectionId,
      cloudflare_api_base_url: args.cloudflareApiBaseUrl,
      max_inputs: 10,
      submit_nars_input: (input) => submitLiveLocalNarsInput({ siteRoot: args.siteRoot, projectionId: args.projectionId, input, expectedMessage: message }),
    });
    const acknowledgedInput = delivery.acknowledgements?.find((ack) => ack.status === 'acknowledged' && ack.ok === true) ?? null;
    const acknowledgedInputId = acknowledgedInput?.input_id ?? null;
    const narsAdmission = acknowledgedInput?.nars_admission?.admission ?? acknowledgedInput?.nars_admission;
    const narsInputEventId = typeof narsAdmission?.input_event_id === 'string'
      ? narsAdmission.input_event_id
      : null;
    const localEventLog = narsInputEventId
      ? await waitForLocalEventLogMessage({ siteRoot: args.siteRoot, projectionId: args.projectionId, message: narsInputEventId, timeoutMs: 10000 })
      : { found: false, reason: 'no_nars_input_event_id' };
    const bridgeAfterInput: AnyRecord = await startLocalProjectionBridgeOnce({
      site_root: args.siteRoot,
      projection_id: args.projectionId,
      cloudflare_api_base_url: args.cloudflareApiBaseUrl,
      max_events: 5000,
    });
    const remoteCache = narsInputEventId
      ? await waitForRemoteProjectionCacheText({
        cloudflareApiBaseUrl: args.cloudflareApiBaseUrl,
        projectionId: args.projectionId,
        browserToken: args.browserToken,
        text: narsInputEventId,
        sinceSequence: Math.max(0, Number(bridgeAfterInput.bridge_state?.last_replicated_sequence ?? 0) - 20),
        timeoutMs: 10000,
      })
      : { found: false, reason: 'no_acknowledged_input_id' };
    await scrollHostedBrowserTranscriptToBottom(page);
    const replicated = narsInputEventId
      ? await waitForPageTextWithAction(page, narsInputEventId, 15000, () => scrollHostedBrowserTranscriptToBottom(page))
      : { found: false, reason: 'no_nars_input_event_id' };
    const replicatedWebSocketFrame = narsInputEventId
      ? await page.waitForWebSocketFrame((entry: AnyRecord) => {
        const url = String(entry.url ?? '');
        const payload = String(entry.payload_data ?? '');
        return url.includes(`/api/nars/projections/${args.projectionId}/events/websocket`)
          && payload.includes(narsInputEventId);
      }, 15000)
      : { found: false, reason: 'no_nars_input_event_id' };
    const revoke = await fetch(`${args.cloudflareApiBaseUrl.replace(/\/+$/, '')}/api/nars/projections/${encodeURIComponent(args.projectionId)}`, { method: 'DELETE' })
      .then((response) => response.json().catch(() => ({ status: response.ok ? 'revoked' : 'unknown' })));
    const revocationWebSocketFrame = await page.waitForWebSocketFrame((entry: AnyRecord) => {
      const url = String(entry.url ?? '');
      const payload = String(entry.payload_data ?? '');
      return url.includes(`/api/nars/projections/${args.projectionId}/events/websocket`)
        && payload.includes('projection_revoked');
    }, 15000);
    const revokedRendered = await waitForPageText(page, 'projection_revoked', 15000);
    const passed = bootstrap.pathname === '/'
      && bootstrap.projection_id === args.projectionId
      && bootstrap.cloudflare_api_base_url === args.cloudflareApiBaseUrl.replace(/\/+$/, '')
      && bootstrap.browser_token_present === true
      && bootstrap.config_placeholder_present === false
      && rawViewConnected.found
      && input.status === 'submitted_from_hosted_browser_ui'
      && delivery.status === 'delivered'
      && delivery.delivered_count >= 1
      && acknowledgedInputId !== null
      && narsInputEventId !== null
      && delivery.acknowledgements?.some((ack) => ack.status === 'acknowledged' && ack.ok === true)
      && localEventLog.found
      && bridgeAfterInput.status === 'connected'
      && bridgeAfterInput.projected_event_count > 0
      && remoteCache.found
      && replicatedWebSocketFrame.found
      && revoke.status === 'revoked'
      && revocationWebSocketFrame.found
      && revokedRendered.found;
    const browserState = await captureHostedBrowserState(page);
    return { status: passed ? 'passed' : 'failed', strict_round_trip: true, bootstrap, initial, stream, view: 'Raw', raw_view_connected: rawViewConnected, input, optimistic, delivery, acknowledged_input_id: acknowledgedInputId, nars_input_event_id: narsInputEventId, local_event_log: localEventLog, bridge_after_input: bridgeAfterInput, remote_cache: remoteCache, replicated, replicated_websocket_frame: replicatedWebSocketFrame, revoke, revocation_websocket_frame: revocationWebSocketFrame, revoked_rendered: revokedRendered, browser_state: browserState, message, submitted_input: submittedInput };
  } catch (error) {
    return {
      status: 'failed',
      code: 'hosted_browser_projection_failed',
      error: error instanceof Error ? error.message : String(error),
      message,
      failure_state: await captureHostedBrowserState(page).catch((diagnosticError: unknown) => ({
        error: diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError),
      })),
    };
  } finally {
    await page.close();
  }
}

async function verifyLegacyProjectionRoute(args: AnyRecord): Promise<AnyRecord> {
  const expected = new URL(args.hostedWebUrl);
  const response = await fetch(args.legacyHostedWebUrl, { redirect: 'manual' });
  const location = response.headers.get('location');
  if (!location) return { status: 'failed', code: 'legacy_projection_route_missing_location', http_status: response.status, requested_pathname: '/sessions/' };
  let canonical: URL;
  try {
    canonical = new URL(location, args.legacyHostedWebUrl);
  } catch {
    return { status: 'failed', code: 'legacy_projection_route_invalid_location', http_status: response.status, requested_pathname: '/sessions/' };
  }
  const passed = response.status === 307
    && canonical.origin === expected.origin
    && canonical.pathname === '/'
    && canonical.searchParams.get('cloudflare_projection_id') === args.projectionId
    && canonical.searchParams.get('cloudflare_api_base_url') === args.cloudflareApiBaseUrl.replace(/\/+$/, '')
    && canonical.searchParams.get('cloudflare_browser_token') === args.browserToken;
  return {
    status: passed ? 'passed' : 'failed',
    requested_pathname: '/sessions/',
    http_status: response.status,
    canonical_pathname: canonical.pathname,
    canonical_projection_id: canonical.searchParams.get('cloudflare_projection_id'),
    canonical_api_base_url: canonical.searchParams.get('cloudflare_api_base_url'),
    browser_token_preserved: canonical.searchParams.get('cloudflare_browser_token') === args.browserToken,
  };
}

async function waitForRemoteProjectionCacheText(args: AnyRecord): Promise<AnyRecord> {
  const base = `${args.cloudflareApiBaseUrl.replace(/\/+$/, '')}/api/nars/projections/${encodeURIComponent(args.projectionId)}/events`;
  const headers = { 'x-narada-browser-token-fingerprint': args.browserToken };
  const started = Date.now();
  let last = null;
  while (Date.now() - started < args.timeoutMs) {
    const url = `${base}?since_sequence=${encodeURIComponent(String(args.sinceSequence ?? 0))}&max_events=200`;
    last = await getJson(url, headers);
    const text = JSON.stringify(last);
    if (text.includes(args.text)) return { found: true, waited_ms: Date.now() - started, since_sequence: args.sinceSequence ?? 0, event_count: last.event_count ?? last.events?.length ?? null };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { found: false, waited_ms: Date.now() - started, since_sequence: args.sinceSequence ?? 0, event_count: last?.event_count ?? last?.events?.length ?? null, status: last?.status ?? null, code: last?.code ?? null };
}

async function submitHostedBrowserOperatorMessage(page: AnyPage, message: string): Promise<AnyRecord> {
  await page.fill('#operator-input', message);
  await page.click('.composer-submit');
  const inputResponse = await page.waitForNetworkResponse((entry: AnyRecord) => entry.method === 'POST' && /\/api\/nars\/projections\/[^/]+\/input$/.test(new URL(entry.url).pathname), 10000);
  const inputResponseBody = inputResponse.request_id ? await page.getNetworkResponseBody(inputResponse.request_id) : null;
  inputResponse.body = inputResponseBody;
  return { status: 'submitted_from_hosted_browser_ui', message, input_response: inputResponse };
}

async function submitLiveLocalNarsInput(args: AnyRecord): Promise<AnyRecord> {
  const session = readLocalSessionRecord(args.siteRoot, args.projectionId);
  if (!session?.event_endpoint) throw new Error('local_nars_event_endpoint_not_found');
  const admission = await deliverProjectionInputToNars({
    event_endpoint: String(session.event_endpoint),
    session_id: String(session.session_id ?? ''),
    site_id: typeof session.site_id === 'string' ? session.site_id : null,
    projection_id: args.projectionId,
    input_id: args.input.input_id,
    method: args.input.method,
    payload: args.input.payload ?? {},
    authority_epoch: typeof session.authority_epoch === 'number' ? session.authority_epoch : null,
    authority_runtime_id: typeof session.authority_runtime_id === 'string' ? session.authority_runtime_id : null,
  });
  const durableEvidenceText = typeof admission.input_event_id === 'string'
    ? admission.input_event_id
    : null;
  if (!durableEvidenceText) throw new Error('local_nars_input_event_id_not_returned');
  const localEventLog = await waitForLocalEventLogMessage({
    siteRoot: args.siteRoot,
    projectionId: args.projectionId,
    message: durableEvidenceText,
    timeoutMs: 20000,
  });
  if (!localEventLog.found) {
    throw new Error(`local_nars_input_not_durably_observed:${localEventLog.events_path ?? localEventLog.reason ?? 'unknown'}`);
  }
  return { status: 'accepted_by_live_local_nars', admission, local_event_log: localEventLog };
}

function readLocalSessionRecord(siteRoot: string, projectionId: string): AnyRecord | null {
  const sitePaths = resolveNaradaSitePaths({ siteRoot });
  const registrationPath = join(sitePaths.siteAuthorityRoot, 'crew', 'nars-projections', projectionId, 'intent.json');
  const intent = readJsonFile(registrationPath);
  const sessionId = intent?.nars_session_id;
  if (!sessionId) return null;
  const index = readJsonFile(join(sitePaths.narsSessionsRoot, 'index.json'));
  const entry = index?.sessions?.find((candidate: AnyRecord) => candidate.session_id === sessionId || candidate.carrier_session_id === sessionId);
  return entry?.record_path ? readJsonFile(entry.record_path) : null;
}

async function waitForLocalEventLogMessage(args: AnyRecord): Promise<AnyRecord> {
  const session = readLocalSessionRecord(args.siteRoot, args.projectionId);
  const eventsPath = session?.events_path;
  if (!eventsPath) return { found: false, reason: 'local_nars_events_path_not_found' };
  const started = Date.now();
  while (Date.now() - started < args.timeoutMs) {
    const text = existsSync(eventsPath) ? readFileSync(eventsPath, 'utf8') : '';
    const found = text.includes(args.message);
    if (found) return { found: true, events_path: eventsPath, waited_ms: Date.now() - started };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { found: false, events_path: eventsPath, waited_ms: Date.now() - started };
}

function readJsonFile(path: string): AnyRecord | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

async function postJson(url: string, body: any, headers: AnyRecord = {}): Promise<AnyRecord> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return response.json().catch(() => ({ status: response.ok ? 'ok' : 'failed', http_status: response.status }));
}

async function getJson(url: string, headers: AnyRecord = {}): Promise<AnyRecord> {
  const response = await fetch(url, { headers });
  return response.json().catch(() => ({ status: response.ok ? 'ok' : 'failed', http_status: response.status }));
}

async function getText(url: string, headers: AnyRecord = {}): Promise<AnyRecord> {
  const response = await fetch(url, { headers });
  const text = await response.text().catch(() => '');
  return {
    ok: response.ok,
    status: response.status,
    content_type: response.headers.get('content-type'),
    contains_app_root: text.includes('id="app"') || text.includes("id='app'"),
    contains_agent_web_ui_config_placeholder: text.includes('__NARADA_AGENT_WEB_UI_CONFIG__'),
  };
}

function compareAssetManifests(expected: any, deployed: any): AnyRecord {
  const mismatches = [];
  for (const field of ['schema', 'target', 'source_hash', 'asset_tree_hash']) {
    if (expected?.[field] !== deployed?.[field]) mismatches.push({ field, expected: expected?.[field] ?? null, deployed: deployed?.[field] ?? null });
  }
  if (expected?.git_commit && expected.git_commit !== deployed?.git_commit) {
    mismatches.push({ field: 'git_commit', expected: expected.git_commit, deployed: deployed?.git_commit ?? null });
  }
  for (const scope of ['console', 'sessions']) {
    const expectedArtifact = expected?.source_artifacts?.[scope] ?? {};
    const deployedArtifact = deployed?.source_artifacts?.[scope] ?? {};
    for (const field of ['source_hash', 'recipe_hash', 'output_tree_hash']) {
      if (expectedArtifact[field] !== deployedArtifact[field]) mismatches.push({ field: `source_artifacts.${scope}.${field}`, expected: expectedArtifact[field] ?? null, deployed: deployedArtifact[field] ?? null });
    }
  }
  return {
    status: mismatches.length === 0 ? 'passed' : 'failed',
    mismatches,
    expected: assetManifestSummary(expected),
    deployed: assetManifestSummary(deployed),
  };
}

function assetManifestSummary(manifest: any): AnyRecord {
  return {
    schema: manifest?.schema ?? null,
    target: manifest?.target ?? null,
    source_hash: manifest?.source_hash ?? null,
    asset_tree_hash: manifest?.asset_tree_hash ?? null,
    git_commit: manifest?.git_commit ?? null,
    source_artifacts: manifest?.source_artifacts ?? null,
  };
}

function resolveEvidencePaths(lineage: string, options: AnyRecord): AnyRecord {
  const root = resolve(process.cwd(), '.narada/crew/nars-projections');
  return {
    evidencePath: options.evidencePath ?? resolve(root, `${lineage}-${Date.now()}.json`),
    latestPath: options.evidenceLatestPath ?? resolve(root, `${lineage}-latest.json`),
    indexPath: options.evidenceIndexPath ?? resolve(root, `${lineage}-index.json`),
  };
}

function hostedWebUiEvidence({ hostedShell, hostedBrowser, assetFingerprint }: AnyRecord): AnyRecord {
  return {
    schema: 'narada.hosted_web_ui_evidence.v1',
    levels: [
      { level: 'html_shell_available', status: hostedShell?.ok === true ? 'passed' : 'failed' },
      { level: 'deployed_asset_fingerprint_verified', status: assetFingerprint?.status === 'passed' ? 'passed' : 'failed' },
      { level: 'browser_booted', status: hostedBrowser?.initial?.found === true ? 'passed' : 'failed' },
      { level: 'replay_rendered', status: hostedBrowser?.stream?.found === true ? 'passed' : 'failed' },
      { level: 'live_stream_rendered', status: hostedBrowser?.stream?.found === true ? 'passed' : 'failed' },
      { level: 'operator_input_submitted', status: hostedBrowser?.input?.status === 'submitted_from_hosted_browser_ui' ? 'passed' : 'failed' },
      { level: 'local_input_delivered', status: hostedBrowser?.delivery?.status === 'delivered' ? 'passed' : 'failed' },
      { level: 'projected_input_replicated', status: hostedBrowser?.remote_cache?.found === true || hostedBrowser?.replicated?.found === true ? 'passed' : 'failed' },
      { level: 'live_websocket_projected_input_frame_verified', status: hostedBrowser?.replicated_websocket_frame?.found === true ? 'passed' : 'failed' },
      { level: 'revocation_rendered', status: hostedBrowser?.revoked_rendered?.found === true ? 'passed' : 'failed' },
      { level: 'live_websocket_revocation_frame_verified', status: hostedBrowser?.revocation_websocket_frame?.found === true ? 'passed' : 'failed' },
      { level: 'artifact_metadata_rendered', status: hostedBrowser?.status === 'passed' ? 'passed' : 'unknown' },
    ],
  };
}

function strongestHostedWebUiEvidence({ hostedShell, hostedBrowser, assetFingerprint }: AnyRecord): string {
  if (assetFingerprint?.status === 'passed' && hostedBrowser?.status === 'passed') return 'browser_level_deployed_artifact_fingerprint_verified';
  if (hostedBrowser?.status === 'passed') return 'browser_level_local_origin_projection_e2e';
  if (hostedShell?.ok === true) return 'http_html_shell_only';
  return 'none';
}

function evidence(payload: AnyRecord, paths: AnyRecord, write: boolean): AnyRecord {
  const enriched = write
    ? { ...payload, evidence_latest_path: payload.evidence_latest_path ?? paths.latestPath, evidence_index_path: payload.evidence_index_path ?? paths.indexPath }
    : payload;
  if (write) {
    mkdirSync(dirname(paths.evidencePath), { recursive: true });
    const body = `${JSON.stringify(enriched, null, 2)}\n`;
    writeFileSync(paths.evidencePath, body);
    writeFileSync(paths.latestPath, body);
    writeFileSync(paths.indexPath, `${JSON.stringify({
      schema: 'narada.smoke_evidence_index.v1',
      lineage: enriched.smoke_lineage ?? 'local-origin-live',
      latest_status: enriched.status,
      latest_evidence_path: paths.evidencePath,
      latest_copy_path: paths.latestPath,
      latest_run_at: new Date().toISOString(),
      strongest_hosted_web_ui_evidence: enriched.strongest_hosted_web_ui_evidence ?? null,
    }, null, 2)}\n`);
  }
  return enriched;
}

function requiredArgs(): string[] {
  return ['--cloudflare-api-base-url', '--site-root', '--site-id', '--session', '--expected-assets-manifest'];
}

function optionKey(option: string): string {
  return option.replace(/^--/, '').replace(/-([a-z])/g, (_: string, char: string) => char.toUpperCase());
}

function parseArgs(argv: string[]): AnyRecord {
  const options: AnyRecord = { live: false, requireOperatorSession: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--live') options.live = true;
    else if (arg === '--require-operator-session') options.requireOperatorSession = true;
    else if (arg.startsWith('--')) {
      const equalsIndex = arg.indexOf('=');
      if (equalsIndex > 0) options[optionKey(arg.slice(0, equalsIndex))] = arg.slice(equalsIndex + 1);
      else options[optionKey(arg)] = argv[index + 1], index += 1;
    }
  }
  return options;
}
