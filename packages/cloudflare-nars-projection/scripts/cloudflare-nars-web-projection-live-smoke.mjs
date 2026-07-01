#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  deliverRemoteProjectionInputsOnce,
  preflightCloudflareProjectionRegistration,
  registerProjectionRemotely,
  startLocalProjectionBridgeOnce,
} from '../dist/node.js';

const args = parseArgs(process.argv.slice(2));
const now = new Date().toISOString();

const result = await run();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.status === 'passed' || result.status === 'planned' ? 0 : 1;

async function run() {
  const evidencePath = args.evidencePath ?? resolve(process.cwd(), `.narada/crew/nars-projections/live-smoke-${Date.now()}.json`);
  if (!args.live) {
    return evidence({
      schema: 'narada.cloudflare_nars_projection.live_smoke.v1',
      status: 'planned',
      code: 'live_flag_required',
      operator_action: 'Re-run with --live after confirming Cloudflare and local NARS mutation intent.',
      required: requiredArgs(),
      evidence_path: null,
    }, evidencePath, false);
  }
  const missing = requiredArgs().filter((name) => !args[optionKey(name)]);
  if (missing.length) {
    return evidence({
      schema: 'narada.cloudflare_nars_projection.live_smoke.v1',
      status: 'refused',
      code: 'missing_required_live_smoke_options',
      missing,
      evidence_path: evidencePath,
    }, evidencePath, true);
  }
  const preflight = await preflightCloudflareProjectionRegistration({
    cloudflare_api_base_url: args.cloudflareApiBaseUrl,
    cloudflare_carrier_api_base_url: args.cloudflareCarrierUrl,
    operator_cookie_file: args.operatorCookieFile,
    site_coherence_site_id: args.siteCoherenceSiteId,
    require_operator_session: Boolean(args.requireOperatorSession),
  });
  if (preflight.status !== 'ok') {
    return evidence({ schema: 'narada.cloudflare_nars_projection.live_smoke.v1', status: 'refused', code: 'preflight_refused', preflight, evidence_path: evidencePath }, evidencePath, true);
  }

  const projectionId = args.projectionId ?? `proj_live_${Date.now()}`;
  const registration = await registerProjectionRemotely({
    site_id: args.siteId,
    site_root: args.siteRoot,
    nars_session_id: args.session,
    projection_id: projectionId,
    dry_run: false,
    cloudflare_api_base_url: args.cloudflareApiBaseUrl,
    cloudflare_carrier_api_base_url: args.cloudflareCarrierUrl,
    operator_cookie_file: args.operatorCookieFile,
    site_coherence_site_id: args.siteCoherenceSiteId,
    require_operator_session: Boolean(args.requireOperatorSession),
  });
  if (registration.status !== 'registered_remotely') {
    return evidence({ schema: 'narada.cloudflare_nars_projection.live_smoke.v1', status: 'failed', code: 'registration_failed', registration, evidence_path: evidencePath }, evidencePath, true);
  }
  const bridgeToken = registration.remote_access.bridge_credential.token_fingerprint;
  const browserToken = registration.remote_access.browser_access_tokens[0]?.token_fingerprint;
  const base = `${args.cloudflareApiBaseUrl.replace(/\/+$/, '')}/api/nars/projections/${encodeURIComponent(projectionId)}`;

  const bridge = await startLocalProjectionBridgeOnce({
    site_root: args.siteRoot,
    projection_id: projectionId,
    publish_event: (event) => postJson(`${base}/events`, { event }, { 'x-narada-bridge-token-fingerprint': bridgeToken }),
    publish_artifact_metadata: (artifact) => postJson(`${base}/artifacts`, { artifact }, { 'x-narada-bridge-token-fingerprint': bridgeToken }),
    publish_artifact_content: (content) => postJson(`${base}/artifacts/${encodeURIComponent(content.artifact_id)}/content`, { artifact: content, content_base64: content.content_base64, headers: content.headers }, { 'x-narada-bridge-token-fingerprint': bridgeToken }),
  });
  const replay = await getJson(`${base}/events?since_sequence=0`, { 'x-narada-browser-token-fingerprint': browserToken });
  const metadata = await getJson(`${base}/artifacts`, { 'x-narada-browser-token-fingerprint': browserToken });
  let artifactContent = { status: 'not_checked', reason: 'no_projected_artifact_metadata' };
  const artifactId = metadata?.artifacts?.[0]?.artifact_id;
  if (artifactId) artifactContent = await getJson(`${base}/artifacts/${encodeURIComponent(artifactId)}/content`, { 'x-narada-browser-token-fingerprint': browserToken });
  const input = await postJson(`${base}/input`, { method: 'conversation.enqueue', payload: { message: 'Cloudflare NARS web projection live smoke input', smoke_at: now } }, { 'x-narada-browser-token-fingerprint': browserToken });
  const delivery = await deliverRemoteProjectionInputsOnce({
    site_root: args.siteRoot,
    projection_id: projectionId,
    cloudflare_api_base_url: args.cloudflareApiBaseUrl,
    submit_nars_input: (envelope) => ({ status: 'accepted_by_live_smoke_harness', envelope }),
  });
  const revoke = await fetch(base, { method: 'DELETE' }).then((response) => response.json().catch(() => ({ status: response.ok ? 'revoked' : 'unknown' })));
  const refusedAfterRevoke = await getJson(`${base}/events?since_sequence=0`, { 'x-narada-browser-token-fingerprint': browserToken });
  const passed = bridge.status === 'connected' && replay.status === 'ok' && metadata.status === 'ok' && input.ok === true && delivery.status === 'delivered' && revoke.status === 'revoked' && refusedAfterRevoke.status === 'refused';
  return evidence({
    schema: 'narada.cloudflare_nars_projection.live_smoke.v1',
    status: passed ? 'passed' : 'failed',
    projection_id: projectionId,
    checks: { preflight, registration_status: registration.status, bridge, replay, metadata, artifact_content: artifactContent, input, delivery, revoke, refused_after_revoke: refusedAfterRevoke },
    evidence_path: evidencePath,
  }, evidencePath, true);
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return response.json().catch(() => ({ status: response.ok ? 'ok' : 'failed', http_status: response.status }));
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  return response.json().catch(() => ({ status: response.ok ? 'ok' : 'failed', http_status: response.status }));
}

function evidence(payload, path, write) {
  if (write) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
  }
  return payload;
}

function requiredArgs() {
  return ['--cloudflare-api-base-url', '--site-root', '--site-id', '--session'];
}

function optionKey(option) {
  return option.replace(/^--/, '').replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function parseArgs(argv) {
  const options = { live: false, requireOperatorSession: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--live') options.live = true;
    else if (arg === '--require-operator-session') options.requireOperatorSession = true;
    else if (arg.startsWith('--')) options[optionKey(arg)] = argv[index + 1], index += 1;
  }
  return options;
}
