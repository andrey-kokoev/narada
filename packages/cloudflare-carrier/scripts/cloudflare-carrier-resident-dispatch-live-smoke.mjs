#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
loadLocalEnv(join(repoRoot, '.env'));

const workerUrl = trimTrailingSlash(option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL ?? '');
const tokenFile = option('--token-file') ?? process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? '';
const bearerToken = option('--token') ?? (tokenFile ? readTokenFile(tokenFile) : process.env.CLOUDFLARE_CARRIER_TOKEN ?? '');
const siteId = option('--site') ?? process.env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
const siteRef = option('--site-ref') ?? process.env.CLOUDFLARE_CARRIER_SITE_REF ?? `cloudflare://${siteId}`;
const operationId = option('--operation') ?? process.env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';

if (!workerUrl) throw new Error('resident_dispatch_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('resident_dispatch_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('resident_dispatch_live_smoke_requires_site_id');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const carrierSessionId = option('--session') ?? `carrier_session_cloudflare_dispatch_${suffix}`;
const dispatchDecisionId = option('--dispatch-decision-id') ?? `resident_dispatch_live_${suffix}`;

const dispatched = await postCarrier({
  operation: 'resident_dispatch.primary_with_fallback.start',
  request_id: `resident_dispatch_live_start_${suffix}`,
  params: {
    site_id: siteId,
    operation_id: operationId,
    carrier_session_id: carrierSessionId,
    dispatch_decision_id: dispatchDecisionId,
    agent_id: 'narada.cloudflare.dispatch.live',
    site_root: siteRef,
    site_ref: siteRef,
    windows_fallback_ref: 'windows_local_site_resident_loop',
  },
});
assert.equal(dispatched.http_status, 200, JSON.stringify(dispatched.body));
assert.equal(dispatched.body.ok, true);
assert.equal(dispatched.body.status, 'cloudflare_primary_started');
assert.equal(dispatched.body.dispatch_authority, 'cloudflare_primary_dispatcher');
assert.equal(dispatched.body.fallback_authority, 'windows_fallback_dispatcher');
assert.equal(dispatched.body.fallback_status, 'available');
assert.equal(dispatched.body.dispatch_action, 'cloudflare_session_start');
assert.equal(dispatched.body.carrier_session_id, carrierSessionId);
assert.equal(dispatched.body.session_start.event.event_kind, 'carrier_session_started');

const listed = await postCarrier({
  operation: 'resident_dispatch.primary_with_fallback.list',
  request_id: `resident_dispatch_live_list_${suffix}`,
  params: { site_id: siteId, limit: 20 },
});
assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
assert.equal(listed.body.ok, true);
const listedDecision = listed.body.dispatch_decisions.find((entry) => entry.dispatch_decision_id === dispatchDecisionId);
assert.ok(listedDecision, JSON.stringify(listed.body.dispatch_decisions));
assert.equal(listedDecision.decision_state, 'cloudflare_primary_started');
assert.equal(listedDecision.dispatch_authority, 'cloudflare_primary_dispatcher');
assert.equal(listedDecision.fallback_authority, 'windows_fallback_dispatcher');
assert.equal(listedDecision.fallback_status, 'available');

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `resident_dispatch_live_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, resident_dispatch_limit: 20, carrier_event_limit: 10 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.equal(operationRead.body.ok, true);
assert.ok(operationRead.body.resident_dispatch_decisions.some((entry) => entry.dispatch_decision_id === dispatchDecisionId));
assert.ok(operationRead.body.operation_product_surface.resident_dispatch_decision_count >= 1);
assert.ok(operationRead.body.sessions.some((session) => session.carrier_session_id === carrierSessionId));

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.resident_dispatch_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  dispatch_decision_id: dispatchDecisionId,
  carrier_session_id: carrierSessionId,
  dispatch_state: dispatched.body.status,
  dispatch_authority: dispatched.body.dispatch_authority,
  fallback_authority: dispatched.body.fallback_authority,
  fallback_status: dispatched.body.fallback_status,
  dispatch_action: dispatched.body.dispatch_action,
  listed_dispatch_decision_count: listed.body.dispatch_decisions.length,
  operation_surface_dispatch_decision_count: operationRead.body.operation_product_surface.resident_dispatch_decision_count,
}, null, 2)}\n`);

async function postCarrier(body) {
  const response = await fetch(`${workerUrl}/api/carrier`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bearerToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { http_status: response.status, body: await response.json().catch(() => ({})) };
}

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readTokenFile(tokenFilePath) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(repoRoot, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`resident_dispatch_live_smoke_token_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

function loadLocalEnv(envPath) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/g, '');
}
