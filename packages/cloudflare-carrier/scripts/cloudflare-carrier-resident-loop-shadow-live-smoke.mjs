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
const operationId = option('--operation') ?? process.env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';

if (!workerUrl) throw new Error('resident_loop_shadow_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('resident_loop_shadow_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('resident_loop_shadow_live_smoke_requires_site_id');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const loopRunId = option('--loop-run-id') ?? `resident_loop_shadow_live_${suffix}`;
const loopRun = {
  operation_id: operationId,
  run_started_at: new Date().toISOString(),
  run_finished_at: new Date().toISOString(),
  status: 'shadow_recorded',
  steps: [{ step_id: 'live_shadow_record', status: 'ok' }],
  operator_attention: [{ attention_id: 'live_shadow_attention', severity: 'info' }],
};

const recorded = await postCarrier({
  operation: 'resident_loop.shadow_read.record',
  request_id: `resident_loop_shadow_live_record_${suffix}`,
  params: {
    site_id: siteId,
    loop_run_id: loopRunId,
    source_summary_path: '.ai/operator-attention/operator_attention_operating-layer_pending_directive_stale_pending_directive_stale.json',
    loop_run: loopRun,
  },
});
assert.equal(recorded.http_status, 200, JSON.stringify(recorded.body));
assert.equal(recorded.body.ok, true);
assert.equal(recorded.body.status, 'recorded');
assert.equal(recorded.body.site_id, siteId);
assert.equal(recorded.body.shadow_mode, 'cloudflare_shadow_read');
assert.equal(recorded.body.dispatch_authority, 'windows_primary_dispatcher');
assert.equal(recorded.body.dispatch_action, 'none');
assert.equal(recorded.body.loop_run.step_count, 1);
assert.equal(recorded.body.loop_run.operator_attention_count, 1);

const listed = await postCarrier({
  operation: 'resident_loop.shadow_read.list',
  request_id: `resident_loop_shadow_live_list_${suffix}`,
  params: { site_id: siteId, limit: 20 },
});
assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
assert.equal(listed.body.ok, true);
const listedRun = listed.body.loop_runs.find((entry) => entry.loop_run_id === loopRunId);
assert.ok(listedRun, JSON.stringify(listed.body.loop_runs));
assert.equal(listedRun.loop_status, 'shadow_recorded');
assert.equal(listedRun.dispatch_authority, 'windows_primary_dispatcher');
assert.equal(listedRun.dispatch_action, 'none');

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `resident_loop_shadow_live_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, resident_loop_shadow_limit: 20 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.equal(operationRead.body.ok, true);
assert.ok(operationRead.body.resident_loop_shadow_runs.some((entry) => entry.loop_run_id === loopRunId));
assert.ok(operationRead.body.operation_product_surface.resident_loop_shadow_run_count >= 1);
assert.equal(operationRead.body.operation_product_surface.dispatch_authority, 'windows_primary_dispatcher');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.resident_loop_shadow_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  loop_run_id: loopRunId,
  loop_status: recorded.body.loop_run.status,
  shadow_mode: recorded.body.shadow_mode,
  dispatch_authority: recorded.body.dispatch_authority,
  dispatch_action: recorded.body.dispatch_action,
  listed_loop_run_count: listed.body.loop_runs.length,
  operation_surface_shadow_run_count: operationRead.body.operation_product_surface.resident_loop_shadow_run_count,
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
  if (!existsSync(resolved)) throw new Error(`resident_loop_shadow_live_smoke_token_file_missing:${resolved}`);
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
