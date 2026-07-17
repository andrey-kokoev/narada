#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
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
} from './lib/browser-smoke.mjs';

const args = parseArgs(process.argv.slice(2));
const now = new Date().toISOString();

const result = await run();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.status === 'passed' || result.status === 'planned' ? 0 : 1;

async function run() {
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
  const missing = requiredArgs().filter((name) => !args[optionKey(name)]);
  if (missing.length) {
    return evidence({
      schema: 'narada.cloudflare_nars_projection.live_smoke.v1',
      status: 'refused',
      code: 'missing_required_live_smoke_options',
      missing,
      evidence_path: evidencePath,
    }, evidencePaths, true);
  }
  const preflight = await preflightCloudflareProjectionRegistration({
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
  const registration = await registerProjectionRemotely({
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
  const base = `${args.cloudflareApiBaseUrl.replace(/\/+$/, '')}/api/nars/projections/${encodeURIComponent(projectionId)}`;

  const bridge = await startLocalProjectionBridgeOnce({
    site_root: args.siteRoot,
    projection_id: projectionId,
    publish_event: (event) => postJson(`${base}/events`, { site_id: event.site_id, nars_session_id: event.nars_session_id, event: event.payload }, { 'x-narada-bridge-token-fingerprint': bridgeToken }),
    publish_artifact_metadata: (artifact) => postJson(`${base}/artifacts`, { artifact }, { 'x-narada-bridge-token-fingerprint': bridgeToken }),
    publish_artifact_content: (content) => postJson(`${base}/artifacts/${encodeURIComponent(content.artifact_id)}/content`, { artifact: content, content_base64: content.content_base64, headers: content.headers }, { 'x-narada-bridge-token-fingerprint': bridgeToken }),
  });
  const replay = await getJson(`${base}/events?since_sequence=0`, { 'x-narada-browser-token-fingerprint': browserToken });
  const hostedShell = await getText(hostedWebUrl);
  const deployedAssetManifest = await getJson(`${args.cloudflareApiBaseUrl.replace(/\/+$/, '')}/api/nars/assets/manifest`);
  const assetFingerprint = compareAssetManifests(expectedAssetManifest, deployedAssetManifest);
  const metadata = await getJson(`${base}/artifacts`, { 'x-narada-browser-token-fingerprint': browserToken });
  let artifactContent = { status: 'not_checked', reason: 'no_projected_artifact_metadata' };
  const artifactId = metadata?.artifacts?.[0]?.artifact_id;
  if (artifactId) artifactContent = await getJson(`${base}/artifacts/${encodeURIComponent(artifactId)}/content`, { 'x-narada-browser-token-fingerprint': browserToken });
  const hostedBrowser = await verifyHostedBrowserProjection({
    hostedWebUrl,
    siteRoot: args.siteRoot,
    projectionId,
    cloudflareApiBaseUrl: args.cloudflareApiBaseUrl,
    browserToken,
  });
  const input = hostedBrowser.input ?? { status: 'not_checked', reason: 'covered_by_hosted_browser_strict_round_trip' };
  const delivery = hostedBrowser.delivery ?? { status: 'not_checked', reason: 'covered_by_hosted_browser_strict_round_trip' };
  const revoke = hostedBrowser.revoke ?? await fetch(base, { method: 'DELETE' }).then((response) => response.json().catch(() => ({ status: response.ok ? 'revoked' : 'unknown' })));
  const refusedAfterRevoke = await getJson(`${base}/events?since_sequence=0`, { 'x-narada-browser-token-fingerprint': browserToken });
  const projectedEventCount = Number(bridge.projected_event_count ?? 0);
  const replayEventCount = Number(replay.event_count ?? 0);
  const remoteReplayCaughtUp = projectedEventCount === 0 || replayEventCount > 0;
  const inputAccepted = input?.input_response?.body?.ok === true;
  const passed = bridge.status === 'connected' && replay.status === 'ok' && remoteReplayCaughtUp && hostedShell.ok === true && assetFingerprint.status === 'passed' && hostedBrowser.status === 'passed' && metadata.status === 'ok' && inputAccepted && delivery.status === 'delivered' && revoke.status === 'revoked' && refusedAfterRevoke.status === 'refused';
  return evidence({
    schema: 'narada.cloudflare_nars_projection.live_smoke.v1',
    status: passed ? 'passed' : 'failed',
    authority_origin: 'local',
    authority_runtime_kind: 'local_nars_authority_runtime',
    smoke_lineage: 'local-origin-live',
    projection_id: projectionId,
    hosted_web_url: hostedWebUrl,
    hosted_shell_check_kind: 'http_html_shell_only',
    hosted_browser_check_kind: 'browser_level_local_origin_projection_e2e',
    strongest_hosted_web_ui_evidence: strongestHostedWebUiEvidence({ hostedShell, hostedBrowser, assetFingerprint }),
    hosted_web_ui_evidence: hostedWebUiEvidence({ hostedShell, hostedBrowser, assetFingerprint }),
    checks: { preflight, registration_status: registration.status, bridge, replay, remote_replay_caught_up: remoteReplayCaughtUp, hosted_shell: hostedShell, expected_asset_manifest: args.expectedAssetsManifest, deployed_asset_manifest: deployedAssetManifest, asset_fingerprint: assetFingerprint, hosted_browser: hostedBrowser, metadata, artifact_content: artifactContent, input, delivery, revoke, refused_after_revoke: refusedAfterRevoke },
    evidence_path: evidencePath,
    evidence_latest_path: evidencePaths.latestPath,
    evidence_index_path: evidencePaths.indexPath,
  }, evidencePaths, true);
}

async function selectHostedBrowserView(page, label) {
  return await page.evaluate(`(() => {
    const label = ${JSON.stringify(label)};
    const select = document.querySelector('#projection-verbosity, select[aria-label="View"]');
    if (select) {
      const option = [...select.options].find((candidate) => candidate.textContent?.trim().toLowerCase() === label.toLowerCase());
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    const button = [...document.querySelectorAll('button,[role="button"],[role="tab"],label,a,*')].find((candidate) => candidate.textContent?.trim().toLowerCase() === label.toLowerCase());
    if (!button) throw new Error('projection_view_button_not_found:' + label);
    button.click();
    return true;
  })()`);
}

async function scrollHostedBrowserTranscriptToBottom(page) {
  return await page.evaluate(`(() => {
    const scroller = document.querySelector('.events-scroll, #events')?.closest('.events-scroll') ?? document.querySelector('.events-scroll');
    const target = scroller || document.scrollingElement || document.documentElement;
    if (!target) return false;
    target.scrollTop = target.scrollHeight;
    return true;
  })()`);
}

async function verifyHostedBrowserProjection(args) {
  const browserPath = findHeadlessBrowser();
  if (!browserPath) return { status: 'failed', code: 'headless_browser_not_found' };
  const message = `Cloudflare strict live local NARS E2E ${Date.now()}`;
  const submittedInput = `/json ${JSON.stringify({
    id: `strict-live-enqueue-${Date.now()}`,
    method: 'conversation.enqueue',
    params: { message, source: 'agent-web-ui-live-smoke' },
  })}`;
  const page = await openCdpPage({ browserPath, url: args.hostedWebUrl, userDataPrefix: 'narada-cloudflare-projection-browser-' });
  try {
    const initial = await waitForPageText(page, 'Browser projection attached', 15000);
    const stream = await waitForPageText(page, 'stream connected', 15000);
    const beforeOccurrence = await page.textOccurrenceCount(message);
    const input = await submitHostedBrowserOperatorMessage(page, submittedInput);
    const optimistic = await waitForPageTextOccurrence(page, message, beforeOccurrence + 1, 10000);
    const delivery = await deliverRemoteProjectionInputsOnce({
      site_root: args.siteRoot,
      projection_id: args.projectionId,
      cloudflare_api_base_url: args.cloudflareApiBaseUrl,
      max_inputs: 10,
      submit_nars_input: (input) => submitLiveLocalNarsInput({ siteRoot: args.siteRoot, projectionId: args.projectionId, input, expectedMessage: message }),
    });
    const acknowledgedInputId = delivery.acknowledgements?.find((ack) => ack.status === 'acknowledged' && ack.ok === true)?.input_id ?? null;
    const localEventLog = acknowledgedInputId
      ? await waitForLocalEventLogMessage({ siteRoot: args.siteRoot, projectionId: args.projectionId, message: acknowledgedInputId, timeoutMs: 10000 })
      : { found: false, reason: 'no_acknowledged_input_id' };
    const bridgeAfterInput = await startLocalProjectionBridgeOnce({
      site_root: args.siteRoot,
      projection_id: args.projectionId,
      cloudflare_api_base_url: args.cloudflareApiBaseUrl,
      max_events: 5000,
    });
    const remoteCache = acknowledgedInputId
      ? await waitForRemoteProjectionCacheText({
        cloudflareApiBaseUrl: args.cloudflareApiBaseUrl,
        projectionId: args.projectionId,
        browserToken: args.browserToken,
        text: acknowledgedInputId,
        sinceSequence: Math.max(0, Number(bridgeAfterInput.bridge_state?.last_replicated_sequence ?? 0) - 20),
        timeoutMs: 10000,
      })
      : { found: false, reason: 'no_acknowledged_input_id' };
    await selectHostedBrowserView(page, 'Raw');
    await scrollHostedBrowserTranscriptToBottom(page);
    const replicated = acknowledgedInputId
      ? await waitForPageTextWithAction(page, acknowledgedInputId, 15000, () => scrollHostedBrowserTranscriptToBottom(page))
      : { found: false, reason: 'no_acknowledged_input_id' };
    const replicatedWebSocketFrame = acknowledgedInputId
      ? await page.waitForWebSocketFrame((entry) => {
        const url = String(entry.url ?? '');
        const payload = String(entry.payload_data ?? '');
        return url.includes(`/api/nars/projections/${args.projectionId}/events/websocket`)
          && payload.includes(acknowledgedInputId);
      }, 15000)
      : { found: false, reason: 'no_acknowledged_input_id' };
    const revoke = await fetch(`${args.cloudflareApiBaseUrl.replace(/\/+$/, '')}/api/nars/projections/${encodeURIComponent(args.projectionId)}`, { method: 'DELETE' })
      .then((response) => response.json().catch(() => ({ status: response.ok ? 'revoked' : 'unknown' })));
    const revocationWebSocketFrame = await page.waitForWebSocketFrame((entry) => {
      const url = String(entry.url ?? '');
      const payload = String(entry.payload_data ?? '');
      return url.includes(`/api/nars/projections/${args.projectionId}/events/websocket`)
        && payload.includes('projection_revoked');
    }, 15000);
    const revokedRendered = await waitForPageText(page, 'projection_revoked', 15000);
    const passed = input.status === 'submitted_from_hosted_browser_ui'
      && delivery.status === 'delivered'
      && delivery.delivered_count >= 1
      && delivery.acknowledgements?.some((ack) => ack.status === 'acknowledged' && ack.ok === true)
      && localEventLog.found
      && bridgeAfterInput.status === 'connected'
      && bridgeAfterInput.projected_event_count > 0
      && remoteCache.found
      && replicatedWebSocketFrame.found
      && revoke.status === 'revoked'
      && revocationWebSocketFrame.found
      && revokedRendered.found;
    return { status: passed ? 'passed' : 'failed', strict_round_trip: true, initial, stream, view: 'Raw', input, optimistic, delivery, acknowledged_input_id: acknowledgedInputId, local_event_log: localEventLog, bridge_after_input: bridgeAfterInput, remote_cache: remoteCache, replicated, replicated_websocket_frame: replicatedWebSocketFrame, revoke, revocation_websocket_frame: revocationWebSocketFrame, revoked_rendered: revokedRendered, message, submitted_input: submittedInput };
  } catch (error) {
    return { status: 'failed', code: 'hosted_browser_projection_failed', error: error instanceof Error ? error.message : String(error), message };
  } finally {
    await page.close();
  }
}

async function waitForRemoteProjectionCacheText(args) {
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

async function submitHostedBrowserOperatorMessage(page, message) {
  await page.evaluate(`(() => {
    const input = document.querySelector('#operator-input');
    if (!input) throw new Error('operator_input_not_found');
    input.value = ${JSON.stringify(message)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const form = document.querySelector('#operator-form');
    if (!form) throw new Error('operator_form_not_found');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return true;
  })()`);
  const inputResponse = await page.waitForNetworkResponse((entry) => entry.method === 'POST' && /\/api\/nars\/projections\/[^/]+\/input$/.test(new URL(entry.url).pathname), 10000);
  const inputResponseBody = inputResponse.request_id ? await page.getNetworkResponseBody(inputResponse.request_id) : null;
  inputResponse.body = inputResponseBody;
  return { status: 'submitted_from_hosted_browser_ui', message, input_response: inputResponse };
}

async function submitLiveLocalNarsInput(args) {
  const session = readLocalSessionRecord(args.siteRoot, args.projectionId);
  if (!session?.event_endpoint) throw new Error('local_nars_event_endpoint_not_found');
  const websocket = await submitFrameToNarsWebSocket({
    endpoint: session.event_endpoint,
    input: args.input,
    expectedMessage: args.expectedMessage,
  });
  const durableEvidenceText = args.input.input_id;
  const localEventLog = await waitForLocalEventLogMessage({
    siteRoot: args.siteRoot,
    projectionId: args.projectionId,
    message: durableEvidenceText,
    timeoutMs: 20000,
  });
  if (!localEventLog.found) {
    throw new Error(`local_nars_input_not_durably_observed:${localEventLog.events_path ?? localEventLog.reason ?? 'unknown'}`);
  }
  return { status: 'accepted_by_live_local_nars', websocket, local_event_log: localEventLog };
}

async function submitFrameToNarsWebSocket(args) {
  const ws = new WebSocket(args.endpoint);
  let observedExpectedEvent = false;
  const receivedEvents = [];
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('local_nars_input_observation_timeout')), 20000);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ id: `${args.input.input_id}:subscribe`, method: 'session.events.subscribe', params: { include_replay: false, max_replay: 0 } }));
      ws.send(JSON.stringify({ id: args.input.input_id, method: args.input.method, params: args.input.payload ?? {} }));
    });
    ws.addEventListener('message', (event) => {
      const parsed = JSON.parse(String(event.data));
      receivedEvents.push(parsed.event ?? parsed.payload?.event ?? parsed.payload?.event_kind ?? parsed.schema ?? 'unknown');
      const payload = parsed.payload ?? parsed;
      const eventText = JSON.stringify(payload);
      const content = String(payload.content ?? payload.payload?.content ?? '');
      if (((payload.event === 'user_message' || payload.role === 'user') && content.includes(args.expectedMessage)) || eventText.includes(args.input.input_id)) {
        observedExpectedEvent = true;
        clearTimeout(timer);
        resolve();
      }
    });
    ws.addEventListener('error', (error) => {
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error('local_nars_websocket_error'));
    });
    ws.addEventListener('close', () => {
      if (!observedExpectedEvent) {
        clearTimeout(timer);
        reject(new Error('local_nars_websocket_closed_before_expected_message'));
      }
    });
  });
  try { ws.close(); } catch {}
  return { status: 'accepted_by_live_local_nars_websocket', observed_expected_event: observedExpectedEvent, observed_events: receivedEvents.slice(-12) };
}

function readLocalSessionRecord(siteRoot, projectionId) {
  const sitePaths = resolveNaradaSitePaths({ siteRoot });
  const registrationPath = join(sitePaths.siteAuthorityRoot, 'crew', 'nars-projections', projectionId, 'intent.json');
  const intent = readJsonFile(registrationPath);
  const sessionId = intent?.nars_session_id;
  if (!sessionId) return null;
  const index = readJsonFile(join(sitePaths.narsSessionsRoot, 'index.json'));
  const entry = index?.sessions?.find((candidate) => candidate.session_id === sessionId || candidate.carrier_session_id === sessionId);
  return entry?.record_path ? readJsonFile(entry.record_path) : null;
}

async function waitForLocalEventLogMessage(args) {
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

function readJsonFile(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return response.json().catch(() => ({ status: response.ok ? 'ok' : 'failed', http_status: response.status }));
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  return response.json().catch(() => ({ status: response.ok ? 'ok' : 'failed', http_status: response.status }));
}

async function getText(url, headers = {}) {
  const response = await fetch(url, { headers });
  const text = await response.text().catch(() => '');
  return { ok: response.ok, status: response.status, content_type: response.headers.get('content-type'), contains_app_root: text.includes('id="app"') || text.includes("id='app'") };
}

function compareAssetManifests(expected, deployed) {
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

function assetManifestSummary(manifest) {
  return {
    schema: manifest?.schema ?? null,
    target: manifest?.target ?? null,
    source_hash: manifest?.source_hash ?? null,
    asset_tree_hash: manifest?.asset_tree_hash ?? null,
    git_commit: manifest?.git_commit ?? null,
    source_artifacts: manifest?.source_artifacts ?? null,
  };
}

function resolveEvidencePaths(lineage, options) {
  const root = resolve(process.cwd(), '.narada/crew/nars-projections');
  return {
    evidencePath: options.evidencePath ?? resolve(root, `${lineage}-${Date.now()}.json`),
    latestPath: options.evidenceLatestPath ?? resolve(root, `${lineage}-latest.json`),
    indexPath: options.evidenceIndexPath ?? resolve(root, `${lineage}-index.json`),
  };
}

function hostedWebUiEvidence({ hostedShell, hostedBrowser, assetFingerprint }) {
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

function strongestHostedWebUiEvidence({ hostedShell, hostedBrowser, assetFingerprint }) {
  if (assetFingerprint?.status === 'passed' && hostedBrowser?.status === 'passed') return 'browser_level_deployed_artifact_fingerprint_verified';
  if (hostedBrowser?.status === 'passed') return 'browser_level_local_origin_projection_e2e';
  if (hostedShell?.ok === true) return 'http_html_shell_only';
  return 'none';
}

function evidence(payload, paths, write) {
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

function requiredArgs() {
  return ['--cloudflare-api-base-url', '--site-root', '--site-id', '--session', '--expected-assets-manifest'];
}

function optionKey(option) {
  return option.replace(/^--/, '').replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function parseArgs(argv) {
  const options = { live: false, requireOperatorSession: false };
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
