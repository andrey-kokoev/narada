#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveAuth } from '../shared/cloudflare-carrier-auth-http.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders } from '../shared/cloudflare-carrier-auth-http.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../../..');

export function parseWebhookDelayRemoteSourceLiveSmokeArgs(
  argv = [],
  env = process.env,
  { loadEnv = true } = {},
) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const criticalMinutes = Number(option(args, '--critical-minutes') ?? 15);
  const sourceAdapterId = option(args, '--source-adapter-id') ?? null;
  const observationId = option(args, '--observation-id') ?? null;
  const delayMinutes = Number(option(args, '--delay-minutes') ?? criticalMinutes + 1);
  const comparisonDelayMinutes = Number(option(args, '--comparison-delay-minutes') ?? 1);
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('webhook_delay_remote_source_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`webhook_delay_remote_source_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('webhook_delay_remote_source_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('webhook_delay_remote_source_live_smoke_requires_site_id');
  if (!operationId) throw new Error('webhook_delay_remote_source_live_smoke_requires_operation_id');
  if (!Number.isFinite(criticalMinutes) || criticalMinutes <= 0) throw new Error('webhook_delay_remote_source_live_smoke_invalid_critical_minutes');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    criticalMinutes,
    sourceAdapterId,
    observationId,
    delayMinutes,
    comparisonDelayMinutes,
  };
}

export function formatWebhookDelayRemoteSourceLiveSmokeText(result) {
  const lines = [
    `Webhook Delay Remote Source Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Source Adapter: ${result.source_adapter_id}`,
    `Observation: ${result.observation_id}`,
    `Source: authority=${result.source_authority ?? 'unknown'} locus=${result.source_material_locus ?? 'unknown'} samples=${result.source_sample_count ?? 0}`,
    `Observation Authority: primary=${result.observation_authority ?? 'unknown'} fallback=${result.fallback_authority ?? 'unknown'} status=${result.fallback_status ?? 'unknown'} classification=${result.classification_state ?? 'unknown'}`,
    `Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`,
    `Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`,
    `Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function runWebhookDelayRemoteSourceLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const sourceAdapterId = config.sourceAdapterId ?? `sonar_webhook_delay_d1_remote_source_live_${suffix}`;
  const observationId = config.observationId ?? `webhook_delay_remote_source_observation_live_${suffix}`;
  const nowIso = new Date().toISOString();
  const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const putSamples = await postCarrier(config, {
    operation: 'webhook_delay.remote_source.samples.put',
    request_id: `webhook_delay_remote_source_samples_put_${suffix}`,
    params: {
      site_id: config.siteId,
      source_adapter_id: sourceAdapterId,
      samples: [{
        sample_id: `webhook_delay_source_sample_today_${suffix}`,
        sample_role: 'today_latest',
        observed_at: nowIso,
        observed_at_ct: null,
        elapsed_minutes: 0,
        delay_minutes: config.delayMinutes,
      }, {
        sample_id: `webhook_delay_source_sample_yesterday_${suffix}`,
        sample_role: 'yesterday_same_clock',
        observed_at: yesterdayIso,
        observed_at_ct: null,
        elapsed_minutes: 0,
        delay_minutes: config.comparisonDelayMinutes,
      }],
    },
  }, fetchImpl);
  assert.equal(putSamples.http_status, 200, JSON.stringify(putSamples.body));
  assert.equal(putSamples.body.ok, true);
  assert.equal(putSamples.body.status, 'samples_recorded');
  assert.equal(putSamples.body.source_authority, 'cloudflare_webhook_delay_remote_source_adapter');
  assert.equal(putSamples.body.sample_count, 2);

  const read = await postCarrier(config, {
    operation: 'webhook_delay.remote_source.primary_with_fallback.read',
    request_id: `webhook_delay_remote_source_read_${suffix}`,
    params: {
      site_id: config.siteId,
      source_adapter_id: sourceAdapterId,
      observation_id: observationId,
      critical_minutes: config.criticalMinutes,
    },
  }, fetchImpl);
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
  assert.equal(read.body.observation.latest.delay_minutes, config.delayMinutes);
  assert.equal(read.body.record.source_material_locus, 'cloudflare_remote_source_adapter');

  const listedSamples = await postCarrier(config, {
    operation: 'webhook_delay.remote_source.samples.list',
    request_id: `webhook_delay_remote_source_samples_list_${suffix}`,
    params: { site_id: config.siteId, source_adapter_id: sourceAdapterId, limit: 20 },
  }, fetchImpl);
  assert.equal(listedSamples.http_status, 200, JSON.stringify(listedSamples.body));
  assert.equal(listedSamples.body.ok, true);
  assert.equal(listedSamples.body.samples.length, 2);

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `webhook_delay_remote_source_operation_read_${suffix}`,
    params: { site_id: config.siteId, operation_id: config.operationId, webhook_delay_observation_primary_limit: 20 },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  assert.equal(operationRead.body.ok, true);
  assert.ok(operationRead.body.webhook_delay_observation_primary_reads.some((entry) => entry.observation_id === observationId && entry.record?.source_material_locus === 'cloudflare_remote_source_adapter'));

  return {
    schema: 'narada.cloudflare_carrier.webhook_delay_remote_source_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    source_adapter_id: sourceAdapterId,
    observation_id: observationId,
    source_authority: read.body.source_authority,
    source_material_locus: read.body.source_material_locus,
    source_sample_count: read.body.source_sample_count,
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
  if (!existsSync(resolved)) throw new Error(`webhook_delay_remote_source_live_smoke_token_file_missing:${resolved}`);
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
  const config = parseWebhookDelayRemoteSourceLiveSmokeArgs(process.argv.slice(2));
  const result = await runWebhookDelayRemoteSourceLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatWebhookDelayRemoteSourceLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
