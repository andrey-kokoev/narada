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

if (!workerUrl) throw new Error('webhook_delay_remote_source_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('webhook_delay_remote_source_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('webhook_delay_remote_source_live_smoke_requires_site_id');
if (!operationId) throw new Error('webhook_delay_remote_source_live_smoke_requires_operation_id');
if (!Number.isFinite(criticalMinutes) || criticalMinutes <= 0) throw new Error('webhook_delay_remote_source_live_smoke_invalid_critical_minutes');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const sourceAdapterId = option('--source-adapter-id') ?? `sonar_webhook_delay_d1_remote_source_live_${suffix}`;
const observationId = option('--observation-id') ?? `webhook_delay_remote_source_observation_live_${suffix}`;
const delayMinutes = Number(option('--delay-minutes') ?? criticalMinutes + 1);
const comparisonDelayMinutes = Number(option('--comparison-delay-minutes') ?? 1);
const nowIso = new Date().toISOString();
const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const putSamples = await postCarrier({
  operation: 'webhook_delay.remote_source.samples.put',
  request_id: `webhook_delay_remote_source_samples_put_${suffix}`,
  params: {
    site_id: siteId,
    source_adapter_id: sourceAdapterId,
    samples: [{
      sample_id: `webhook_delay_source_sample_today_${suffix}`,
      sample_role: 'today_latest',
      observed_at: nowIso,
      observed_at_ct: null,
      elapsed_minutes: 0,
      delay_minutes: delayMinutes,
    }, {
      sample_id: `webhook_delay_source_sample_yesterday_${suffix}`,
      sample_role: 'yesterday_same_clock',
      observed_at: yesterdayIso,
      observed_at_ct: null,
      elapsed_minutes: 0,
      delay_minutes: comparisonDelayMinutes,
    }],
  },
});
assert.equal(putSamples.http_status, 200, JSON.stringify(putSamples.body));
assert.equal(putSamples.body.ok, true);
assert.equal(putSamples.body.status, 'samples_recorded');
assert.equal(putSamples.body.source_authority, 'cloudflare_webhook_delay_remote_source_adapter');
assert.equal(putSamples.body.sample_count, 2);

const read = await postCarrier({
  operation: 'webhook_delay.remote_source.primary_with_fallback.read',
  request_id: `webhook_delay_remote_source_read_${suffix}`,
  params: {
    site_id: siteId,
    source_adapter_id: sourceAdapterId,
    observation_id: observationId,
    critical_minutes: criticalMinutes,
  },
});
assert.equal(read.http_status, 200, JSON.stringify(read.body));
assert.equal(read.body.ok, true);
assert.equal(read.body.status, 'cloudflare_primary_recorded');
assert.equal(read.body.source_authority, 'cloudflare_webhook_delay_remote_source_adapter');
assert.equal(read.body.source_material_locus, 'cloudflare_remote_source_adapter');
assert.equal(read.body.source_sample_count, 2);
assert.equal(read.body.observation_authority, 'cloudflare_primary_observation_read');
assert.equal(read.body.fallback_authority, 'windows_observation_read_fallback');
assert.equal(read.body.fallback_status, 'available');
assert.equal(read.body.classification.state, 'critical');
assert.equal(read.body.observation.source_schema, 'narada.sonar/webhook-delay-remote-source-adapter/v1');
assert.equal(read.body.observation.latest.delay_minutes, delayMinutes);
assert.equal(read.body.record.source_material_locus, 'cloudflare_remote_source_adapter');

const listedSamples = await postCarrier({
  operation: 'webhook_delay.remote_source.samples.list',
  request_id: `webhook_delay_remote_source_samples_list_${suffix}`,
  params: { site_id: siteId, source_adapter_id: sourceAdapterId, limit: 20 },
});
assert.equal(listedSamples.http_status, 200, JSON.stringify(listedSamples.body));
assert.equal(listedSamples.body.ok, true);
assert.equal(listedSamples.body.samples.length, 2);

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `webhook_delay_remote_source_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, webhook_delay_observation_primary_limit: 20 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.equal(operationRead.body.ok, true);
assert.ok(operationRead.body.webhook_delay_observation_primary_reads.some((entry) => entry.observation_id === observationId && entry.record?.source_material_locus === 'cloudflare_remote_source_adapter'));

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.webhook_delay_remote_source_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  source_adapter_id: sourceAdapterId,
  observation_id: observationId,
  source_authority: read.body.source_authority,
  source_material_locus: read.body.source_material_locus,
  source_sample_count: read.body.source_sample_count,
  classification_state: read.body.classification.state,
  observation_authority: read.body.observation_authority,
  fallback_authority: read.body.fallback_authority,
  fallback_status: read.body.fallback_status,
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
  if (!existsSync(resolved)) throw new Error(`webhook_delay_remote_source_live_smoke_token_file_missing:${resolved}`);
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
    const value = trimmed.slice(index + 1).trim().replace(/^[ '\"]|[ '\"]$/g, '').trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/g, '');
}
