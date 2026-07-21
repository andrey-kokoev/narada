#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveAuth } from '../shared/cloudflare-carrier-auth-http.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders } from '../shared/cloudflare-carrier-auth-http.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const packageRoot = resolve(scriptDir, '../..');
const repoRoot = resolve(packageRoot, '../..');

export function parseWebhookDelayScheduledSourceLiveSmokeArgs(
  argv = [],
  env = process.env,
  { loadEnv = true } = {},
) {
  const args = [...argv];
  if (loadEnv) {
    loadLocalEnv(join(repoRoot, '.env'), env);
    loadLocalEnv(join(packageRoot, '.env'), env);
  }

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SOURCE_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const sourceAdapterId = option(args, '--source-adapter-id') ?? env.CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SOURCE_ADAPTER_ID ?? 'sonar_webhook_delay_windows_readonly_db_summary_feed_v1';
  const criticalMinutes = Number(option(args, '--critical-minutes') ?? env.CLOUDFLARE_WEBHOOK_DELAY_CRITICAL_MINUTES ?? 15);
  const suffix = option(args, '--suffix') ?? null;
  const scheduledRunId = option(args, '--scheduled-run-id') ?? null;
  const observationId = option(args, '--observation-id') ?? null;
  const scheduledTime = option(args, '--scheduled-time') ?? null;
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('webhook_delay_scheduled_source_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`webhook_delay_scheduled_source_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('webhook_delay_scheduled_source_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('webhook_delay_scheduled_source_live_smoke_requires_site_id');
  if (!operationId) throw new Error('webhook_delay_scheduled_source_live_smoke_requires_operation_id');
  if (!Number.isFinite(criticalMinutes) || criticalMinutes <= 0) throw new Error('webhook_delay_scheduled_source_live_smoke_invalid_critical_minutes');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    sourceAdapterId,
    criticalMinutes,
    suffix,
    scheduledRunId,
    observationId,
    scheduledTime,
  };
}

export function formatWebhookDelayScheduledSourceLiveSmokeText(result) {
  const lines = [
    `Webhook Delay Scheduled Source Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Source Adapter: ${result.source_adapter_id}`,
    `Scheduled Run: ${result.scheduled_run_id}`,
    `Observation: ${result.observation_id}`,
    `Source: authority=${result.source_authority ?? 'unknown'} locus=${result.source_material_locus ?? 'unknown'} samples=${result.source_sample_count ?? 0}`,
    `Trigger: authority=${result.trigger_authority ?? 'unknown'} classification=${result.classification_state ?? 'unknown'} fallback=${result.fallback_authority ?? 'unknown'} status=${result.fallback_status ?? 'unknown'}`,
    `Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`,
    `Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`,
    `Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function runWebhookDelayScheduledSourceLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = config.suffix ?? new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const scheduledRunId = config.scheduledRunId ?? `webhook_delay_scheduled_source_read_live_${suffix}`;
  const observationId = config.observationId ?? `webhook_delay_scheduled_source_observation_live_${suffix}`;
  const scheduledTime = config.scheduledTime ?? new Date().toISOString();

  const run = await postCarrier(config, {
    operation: 'webhook_delay.remote_source.scheduled_read.run',
    request_id: `webhook_delay_scheduled_source_read_run_${suffix}`,
    params: {
      site_id: config.siteId,
      source_adapter_id: config.sourceAdapterId,
      scheduled_run_id: scheduledRunId,
      observation_id: observationId,
      scheduled_time: scheduledTime,
      trigger_kind: 'live_smoke_operator_requested',
      critical_minutes: config.criticalMinutes,
    },
  }, fetchImpl);
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

  const listed = await postCarrier(config, {
    operation: 'webhook_delay.remote_source.scheduled_read.list',
    request_id: `webhook_delay_scheduled_source_read_list_${suffix}`,
    params: { site_id: config.siteId, limit: 20 },
  }, fetchImpl);
  assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.ok, true);
  assert.ok(listed.body.runs.some((entry) => entry.scheduled_run_id === scheduledRunId));

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `webhook_delay_scheduled_source_operation_read_${suffix}`,
    params: { site_id: config.siteId, operation_id: config.operationId, webhook_delay_scheduled_source_read_limit: 20 },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  assert.equal(operationRead.body.ok, true);
  assert.ok(operationRead.body.webhook_delay_scheduled_source_reads.some((entry) => entry.scheduled_run_id === scheduledRunId));

  return {
    schema: 'narada.cloudflare_carrier.webhook_delay_scheduled_source_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    source_adapter_id: config.sourceAdapterId,
    scheduled_run_id: scheduledRunId,
    observation_id: observationId,
    trigger_authority: run.body.trigger_authority,
    source_material_locus: run.body.source_material_locus,
    source_authority: run.body.source_authority,
    source_sample_count: run.body.source_sample_count,
    classification_state: run.body.classification_state,
    fallback_authority: run.body.fallback_authority,
    fallback_status: run.body.fallback_status,
  };
}

async function postCarrier(config, body, fetchImpl) {
  const response = await fetchImpl(`${config.workerUrl}/api/carrier`, {
    method: 'POST',
    headers: {
      ...authHeaders(config.auth),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { http_status: response.status, body: await response.json().catch(() => ({})) };
}

function resolveBearerFromEnv(args, env) {
  const tokenFile = option(args, '--token-file') ?? env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? null;
  if (tokenFile) return { kind: 'bearer', value: readTokenFile(tokenFile), source: tokenFile === env.CLOUDFLARE_CARRIER_TOKEN_FILE ? 'env:CLOUDFLARE_CARRIER_TOKEN_FILE' : 'token-file' };
  const token = option(args, '--token') ?? env.CLOUDFLARE_CARRIER_TOKEN ?? null;
  if (token) return { kind: 'bearer', value: token, source: option(args, '--token') ? 'flag:--token' : 'env:CLOUDFLARE_CARRIER_TOKEN' };
  return null;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readTokenFile(tokenFilePath) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(repoRoot, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`webhook_delay_scheduled_source_live_smoke_token_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

function loadLocalEnv(envPath, env = process.env) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^[ '\"]|[ '\"]$/g, '').trim();
    if (!(key in env)) env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/g, '');
}

if (process.argv[1] === scriptPath) {
  const config = parseWebhookDelayScheduledSourceLiveSmokeArgs(process.argv.slice(2));
  const result = await runWebhookDelayScheduledSourceLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatWebhookDelayScheduledSourceLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
