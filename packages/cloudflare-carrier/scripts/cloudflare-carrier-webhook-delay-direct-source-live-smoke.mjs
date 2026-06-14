#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');

export function parseWebhookDelayDirectSourceLiveSmokeArgs(
  argv = [],
  env = process.env,
  { loadEnv = true } = {},
) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const criticalMinutes = Number(option(args, '--critical-minutes') ?? env.CLOUDFLARE_WEBHOOK_DELAY_CRITICAL_MINUTES ?? 15);
  const sourceUrl = option(args, '--source-url') ?? env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_URL ?? '';
  const sourceToken = option(args, '--source-token') ?? env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_TOKEN ?? '';
  const sourceAdapterId = option(args, '--source-adapter-id') ?? env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_ADAPTER_ID ?? 'sonar_webhook_delay_direct_remote_metric_source_v1';
  const sourceId = option(args, '--source-id') ?? env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_ID ?? 'sonar_webhook_delay_direct_remote_metric_source';
  const observationId = option(args, '--observation-id') ?? null;
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('webhook_delay_direct_source_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`webhook_delay_direct_source_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('webhook_delay_direct_source_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('webhook_delay_direct_source_live_smoke_requires_site_id');
  if (!operationId) throw new Error('webhook_delay_direct_source_live_smoke_requires_operation_id');
  if (!Number.isFinite(criticalMinutes) || criticalMinutes <= 0) throw new Error('webhook_delay_direct_source_live_smoke_invalid_critical_minutes');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    criticalMinutes,
    sourceUrl,
    sourceToken,
    sourceAdapterId,
    sourceId,
    observationId,
  };
}

export function formatWebhookDelayDirectSourceLiveSmokeText(result) {
  const lines = [
    `Webhook Delay Direct Source Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Source: id=${result.source_id} adapter=${result.source_adapter_id} locus=${result.source_material_locus ?? 'unknown'}`,
    `Direct Source: host=${result.direct_source_url_host ?? 'unknown'} samples=${result.direct_source_sample_count ?? 0}`,
    `Observation: id=${result.observation_id} classification=${result.classification_state ?? 'unknown'}`,
    `Authority: source=${result.source_authority ?? 'unknown'} primary=${result.observation_authority ?? 'unknown'} fallback=${result.fallback_authority ?? 'unknown'} status=${result.fallback_status ?? 'unknown'}`,
    `Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`,
    `Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function runWebhookDelayDirectSourceLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const observationId = config.observationId ?? `webhook_delay_direct_source_observation_live_${suffix}`;

  const read = await postCarrier(config, {
    operation: 'webhook_delay.remote_metric.direct_source.read',
    request_id: `webhook_delay_direct_source_read_${suffix}`,
    params: {
      site_id: config.siteId,
      source_adapter_id: config.sourceAdapterId,
      source_id: config.sourceId,
      source_url: config.sourceUrl || undefined,
      source_token: config.sourceToken || undefined,
      observation_id: observationId,
      critical_minutes: config.criticalMinutes,
    },
  }, fetchImpl);
  assert.equal(read.http_status, 200, JSON.stringify(read.body));
  assert.equal(read.body.ok, true);
  assert.equal(read.body.schema, 'narada.sonar.cloudflare_webhook_delay_direct_remote_metric_source.v1');
  assert.equal(read.body.status, 'direct_remote_metric_source_recorded');
  assert.equal(read.body.site_id, config.siteId);
  assert.equal(read.body.source_id, config.sourceId);
  assert.equal(read.body.source_adapter_id, config.sourceAdapterId);
  assert.equal(read.body.source_authority, 'cloudflare_webhook_delay_direct_remote_metric_source_adapter');
  assert.equal(read.body.source_material_locus, 'direct_remote_metric_source');
  assert.equal(read.body.record?.observation_id, observationId);
  assert.equal(read.body.observation_authority, 'cloudflare_primary_observation_read');
  assert.equal(read.body.fallback_authority, 'windows_observation_read_fallback');
  assert.equal(read.body.fallback_status, 'available');
  assert.ok(read.body.direct_source_url_host, 'direct source host is recorded');
  assert.ok(read.body.direct_source_sample_count > 0, 'direct source samples are recorded');
  assert.equal(read.body.source_sample_count, read.body.direct_source_sample_count);
  assert.ok(['ok', 'critical'].includes(read.body.classification?.state), JSON.stringify(read.body.classification));
  assert.equal(read.body.record?.source_material_locus, 'direct_remote_metric_source');

  const listedSamples = await postCarrier(config, {
    operation: 'webhook_delay.remote_source.samples.list',
    request_id: `webhook_delay_direct_source_samples_list_${suffix}`,
    params: { site_id: config.siteId, source_adapter_id: config.sourceAdapterId, limit: 20 },
  }, fetchImpl);
  assert.equal(listedSamples.http_status, 200, JSON.stringify(listedSamples.body));
  assert.equal(listedSamples.body.ok, true);
  assert.ok(listedSamples.body.samples.length > 0, 'direct source samples are listable');
  assert.ok(listedSamples.body.samples.some((entry) => entry.sample?.source_record?.direct_source_url_host === read.body.direct_source_url_host));

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `webhook_delay_direct_source_operation_read_${suffix}`,
    params: { site_id: config.siteId, operation_id: config.operationId, webhook_delay_observation_primary_limit: 20 },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  assert.equal(operationRead.body.ok, true);
  assert.ok(operationRead.body.webhook_delay_observation_primary_reads.some((entry) => entry.observation_id === observationId && entry.record?.source_material_locus === 'direct_remote_metric_source'));

  return {
    schema: 'narada.cloudflare_carrier.webhook_delay_direct_source_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    source_id: config.sourceId,
    source_adapter_id: config.sourceAdapterId,
    observation_id: observationId,
    source_authority: read.body.source_authority,
    source_material_locus: read.body.source_material_locus,
    direct_source_url_host: read.body.direct_source_url_host,
    direct_source_sample_count: read.body.direct_source_sample_count,
    classification_state: read.body.classification.state,
    observation_authority: read.body.observation_authority,
    fallback_authority: read.body.fallback_authority,
    fallback_status: read.body.fallback_status,
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
  if (!existsSync(resolved)) throw new Error(`webhook_delay_direct_source_live_smoke_token_file_missing:${resolved}`);
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
  const config = parseWebhookDelayDirectSourceLiveSmokeArgs(process.argv.slice(2));
  const result = await runWebhookDelayDirectSourceLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatWebhookDelayDirectSourceLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
