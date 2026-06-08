#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');
const repoRoot = resolve(packageRoot, '../..');
loadLocalEnv(join(repoRoot, '.env'));
loadLocalEnv(join(packageRoot, '.env'));

const workerUrl = trimTrailingSlash(option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL ?? '');
const tokenFile = option('--token-file') ?? process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? '';
const bearerToken = option('--token') ?? (tokenFile ? readTokenFile(tokenFile) : process.env.CLOUDFLARE_CARRIER_TOKEN ?? '');
const siteId = option('--site') ?? process.env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
const operationId = option('--operation') ?? process.env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
const sourceAdapterId = option('--source-adapter-id') ?? process.env.CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SOURCE_ADAPTER_ID ?? 'sonar_webhook_delay_windows_readonly_db_summary_feed_v1';
const criticalMinutes = Number(option('--critical-minutes') ?? process.env.CLOUDFLARE_WEBHOOK_DELAY_CRITICAL_MINUTES ?? 15);

if (!workerUrl) throw new Error('webhook_delay_scheduled_source_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('webhook_delay_scheduled_source_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('webhook_delay_scheduled_source_live_smoke_requires_site_id');
if (!operationId) throw new Error('webhook_delay_scheduled_source_live_smoke_requires_operation_id');
if (!Number.isFinite(criticalMinutes) || criticalMinutes <= 0) throw new Error('webhook_delay_scheduled_source_live_smoke_invalid_critical_minutes');

const suffix = option('--suffix') ?? new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const scheduledRunId = option('--scheduled-run-id') ?? `webhook_delay_scheduled_source_read_live_${suffix}`;
const observationId = option('--observation-id') ?? `webhook_delay_scheduled_source_observation_live_${suffix}`;
const scheduledTime = option('--scheduled-time') ?? new Date().toISOString();

const run = await postCarrier({
  operation: 'webhook_delay.remote_source.scheduled_read.run',
  request_id: `webhook_delay_scheduled_source_read_run_${suffix}`,
  params: {
    site_id: siteId,
    source_adapter_id: sourceAdapterId,
    scheduled_run_id: scheduledRunId,
    observation_id: observationId,
    scheduled_time: scheduledTime,
    trigger_kind: 'live_smoke_operator_requested',
    critical_minutes: criticalMinutes,
  },
});
assert.equal(run.http_status, 200, JSON.stringify(run.body));
assert.equal(run.body.ok, true, JSON.stringify(run.body));
assert.equal(run.body.status, 'cloudflare_scheduled_read_recorded');
assert.equal(run.body.trigger_authority, 'cloudflare_cron_trigger');
assert.equal(run.body.source_authority, 'cloudflare_webhook_delay_remote_source_adapter');
assert.equal(run.body.source_material_locus, 'cloudflare_remote_source_adapter');
assert.equal(run.body.fallback_authority, 'windows_observation_read_fallback');
assert.equal(run.body.fallback_status, 'available');
assert.equal(run.body.scheduled_run_id, scheduledRunId);
assert.equal(run.body.observation_id, observationId);

const listed = await postCarrier({
  operation: 'webhook_delay.remote_source.scheduled_read.list',
  request_id: `webhook_delay_scheduled_source_read_list_${suffix}`,
  params: { site_id: siteId, limit: 20 },
});
assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
assert.equal(listed.body.ok, true);
assert.ok(listed.body.runs.some((entry) => entry.scheduled_run_id === scheduledRunId));

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `webhook_delay_scheduled_source_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, webhook_delay_scheduled_source_read_limit: 20 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.equal(operationRead.body.ok, true);
assert.ok(operationRead.body.webhook_delay_scheduled_source_reads.some((entry) => entry.scheduled_run_id === scheduledRunId));

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.webhook_delay_scheduled_source_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  source_adapter_id: sourceAdapterId,
  scheduled_run_id: scheduledRunId,
  observation_id: observationId,
  trigger_authority: run.body.trigger_authority,
  source_material_locus: run.body.source_material_locus,
  source_authority: run.body.source_authority,
  source_sample_count: run.body.source_sample_count,
  classification_state: run.body.classification_state,
  fallback_authority: run.body.fallback_authority,
  fallback_status: run.body.fallback_status,
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
  if (!existsSync(resolved)) throw new Error(`webhook_delay_scheduled_source_live_smoke_token_file_missing:${resolved}`);
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
