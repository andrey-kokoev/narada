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
const criticalMinutes = Number(option('--critical-minutes') ?? 15);

if (!workerUrl) throw new Error('webhook_delay_shadow_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('webhook_delay_shadow_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('webhook_delay_shadow_live_smoke_requires_site_id');
if (!Number.isFinite(criticalMinutes) || criticalMinutes <= 0) throw new Error('webhook_delay_shadow_live_smoke_invalid_critical_minutes');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const observationId = option('--observation-id') ?? `webhook_delay_shadow_live_${suffix}`;
const summary = {
  schema: 'narada.sonar/webhook-delay-today-vs-yesterday/v1',
  generated_at: new Date().toISOString(),
  rows72: 1,
  today: {
    latest: {
      at: new Date().toISOString(),
      at_ct: null,
      elapsed_minutes: 0,
      delay_minutes: Number(option('--delay-minutes') ?? criticalMinutes + 1),
    },
  },
  yesterday_same_clock: {
    delay_minutes: 0,
    delta_minutes_today_minus_yesterday: Number(option('--delay-minutes') ?? criticalMinutes + 1),
  },
};

const recorded = await postCarrier({
  operation: 'webhook_delay.shadow_read.record',
  request_id: `webhook_delay_shadow_live_record_${suffix}`,
  params: {
    site_id: siteId,
    observation_id: observationId,
    source_summary_path: '.ai/webhook-delay/latest/webhook-arrival-delay-today-vs-yesterday-summary.json',
    critical_minutes: criticalMinutes,
    summary,
  },
});
assert.equal(recorded.http_status, 200, JSON.stringify(recorded.body));
assert.equal(recorded.body.ok, true);
assert.equal(recorded.body.status, 'recorded');
assert.equal(recorded.body.site_id, siteId);
assert.equal(recorded.body.shadow_mode, 'cloudflare_shadow_read');
assert.equal(recorded.body.dispatch_authority, 'windows_primary_dispatcher');
assert.equal(recorded.body.dispatch_action, 'none');
assert.equal(recorded.body.classification.state, 'critical');
assert.equal(recorded.body.classification.dispatch_action, 'none');

const listed = await postCarrier({
  operation: 'webhook_delay.shadow_read.list',
  request_id: `webhook_delay_shadow_live_list_${suffix}`,
  params: { site_id: siteId, limit: 20 },
});
assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
assert.equal(listed.body.ok, true);
const listedObservation = listed.body.observations.find((entry) => entry.observation_id === observationId);
assert.ok(listedObservation, JSON.stringify(listed.body.observations));
assert.equal(listedObservation.classification_state, 'critical');
assert.equal(listedObservation.dispatch_authority, 'windows_primary_dispatcher');
assert.equal(listedObservation.dispatch_action, 'none');

const siteRead = await postCarrier({
  operation: 'site.read',
  request_id: `webhook_delay_shadow_live_site_read_${suffix}`,
  params: { site_id: siteId, webhook_delay_shadow_limit: 20 },
});
assert.equal(siteRead.http_status, 200, JSON.stringify(siteRead.body));
assert.equal(siteRead.body.ok, true);
assert.ok(siteRead.body.webhook_delay_shadow_observations.some((entry) => entry.observation_id === observationId));

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `webhook_delay_shadow_live_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, webhook_delay_shadow_limit: 20 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.equal(operationRead.body.ok, true);
assert.ok(operationRead.body.webhook_delay_shadow_observations.some((entry) => entry.observation_id === observationId));
assert.ok(operationRead.body.operation_product_surface.webhook_delay_shadow_observation_count >= 1);
assert.equal(operationRead.body.operation_product_surface.dispatch_authority, 'windows_primary_dispatcher');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.webhook_delay_shadow_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  observation_id: observationId,
  classification_state: recorded.body.classification.state,
  shadow_mode: recorded.body.shadow_mode,
  dispatch_authority: recorded.body.dispatch_authority,
  dispatch_action: recorded.body.dispatch_action,
  listed_observation_count: listed.body.observations.length,
  operation_surface_shadow_observation_count: operationRead.body.operation_product_surface.webhook_delay_shadow_observation_count,
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
  if (!existsSync(resolved)) throw new Error(`webhook_delay_shadow_live_smoke_token_file_missing:${resolved}`);
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
