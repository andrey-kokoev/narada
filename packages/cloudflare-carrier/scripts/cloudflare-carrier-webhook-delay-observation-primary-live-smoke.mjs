#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');

export function parseWebhookDelayObservationPrimaryLiveSmokeArgs(
  argv = [],
  env = process.env,
  { loadEnv = true } = {},
) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const criticalMinutes = Number(option(args, '--critical-minutes') ?? 15);
  const observationId = option(args, '--observation-id') ?? null;
  const delayMinutes = Number(option(args, '--delay-minutes') ?? criticalMinutes + 1);
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('webhook_delay_observation_primary_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`webhook_delay_observation_primary_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('webhook_delay_observation_primary_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('webhook_delay_observation_primary_live_smoke_requires_site_id');
  if (!operationId) throw new Error('webhook_delay_observation_primary_live_smoke_requires_operation_id');
  if (!Number.isFinite(criticalMinutes) || criticalMinutes <= 0) throw new Error('webhook_delay_observation_primary_live_smoke_invalid_critical_minutes');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    criticalMinutes,
    observationId,
    delayMinutes,
  };
}

export function formatWebhookDelayObservationPrimaryLiveSmokeText(result) {
  const lines = [
    `Webhook Delay Observation Primary Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Observation: ${result.observation_id}`,
    `Classification: state=${result.classification_state ?? 'unknown'}`,
    `Authority: observation=${result.observation_authority ?? 'unknown'} fallback=${result.fallback_authority ?? 'unknown'} status=${result.fallback_status ?? 'unknown'}`,
    `Dispatch: authority=${result.dispatch_authority ?? 'unknown'} action=${result.dispatch_action ?? 'unknown'}`,
    `Counts: operation_surface=${result.operation_surface_observation_primary_read_count ?? 0}`,
    `Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function runWebhookDelayObservationPrimaryLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const observationId = config.observationId ?? `webhook_delay_observation_primary_live_${suffix}`;
  const summary = {
    schema: 'narada.sonar/webhook-delay-today-vs-yesterday/v1',
    generated_at: new Date().toISOString(),
    rows72: 1,
    today: {
      latest: {
        at: new Date().toISOString(),
        at_ct: null,
        elapsed_minutes: 0,
        delay_minutes: config.delayMinutes,
      },
    },
    yesterday_same_clock: {
      delay_minutes: 0,
      delta_minutes_today_minus_yesterday: config.delayMinutes,
    },
  };

  const recorded = await postCarrier(config, {
    operation: 'webhook_delay.observation.primary_with_fallback.record',
    request_id: `webhook_delay_observation_primary_live_record_${suffix}`,
    params: {
      site_id: config.siteId,
      observation_id: observationId,
      source_summary_path: '.ai/webhook-delay/latest/webhook-arrival-delay-today-vs-yesterday-summary.json',
      critical_minutes: config.criticalMinutes,
      summary,
    },
  }, fetchImpl);
  assert.equal(recorded.http_status, 200, JSON.stringify(recorded.body));
  assert.equal(recorded.body.ok, true);
  assert.equal(recorded.body.status, 'cloudflare_primary_recorded');
  assert.equal(recorded.body.site_id, config.siteId);
  assert.equal(recorded.body.observation_authority, 'cloudflare_primary_observation_read');
  assert.equal(recorded.body.fallback_authority, 'windows_observation_read_fallback');
  assert.equal(recorded.body.fallback_status, 'available');
  assert.equal(recorded.body.dispatch_authority, 'cloudflare_primary_dispatcher');
  assert.equal(recorded.body.dispatch_action, 'none');
  assert.equal(recorded.body.classification.state, 'critical');
  assert.equal(recorded.body.classification.read_mode, 'cloudflare_primary_with_windows_fallback');
  assert.equal(recorded.body.record.source_locus, 'cloudflare_carrier_site');
  assert.equal(recorded.body.record.source_material_locus, 'windows_local_site_summary');
  assert.ok(recorded.body.record.retained_windows_authority.includes('windows_observation_refresh_fallback'));
  assert.ok(recorded.body.record.retained_windows_authority.includes('task_lifecycle_write'));

  const listed = await postCarrier(config, {
    operation: 'webhook_delay.observation.primary_with_fallback.list',
    request_id: `webhook_delay_observation_primary_live_list_${suffix}`,
    params: { site_id: config.siteId, limit: 20 },
  }, fetchImpl);
  assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.ok, true);
  assert.equal(listed.body.observation_authority, 'cloudflare_primary_observation_read');
  const listedObservation = listed.body.observations.find((entry) => entry.observation_id === observationId);
  assert.ok(listedObservation, JSON.stringify(listed.body.observations));
  assert.equal(listedObservation.classification_state, 'critical');
  assert.equal(listedObservation.fallback_status, 'available');

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `webhook_delay_observation_primary_live_operation_read_${suffix}`,
    params: { site_id: config.siteId, operation_id: config.operationId, webhook_delay_observation_primary_limit: 20 },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  assert.equal(operationRead.body.ok, true);
  assert.ok(operationRead.body.webhook_delay_observation_primary_reads.some((entry) => entry.observation_id === observationId));
  assert.ok(operationRead.body.operation_product_surface.webhook_delay_observation_primary_read_count >= 1);

  return {
    schema: 'narada.cloudflare_carrier.webhook_delay_observation_primary_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    observation_id: observationId,
    classification_state: recorded.body.classification.state,
    observation_authority: recorded.body.observation_authority,
    fallback_authority: recorded.body.fallback_authority,
    fallback_status: recorded.body.fallback_status,
    dispatch_authority: recorded.body.dispatch_authority,
    dispatch_action: recorded.body.dispatch_action,
    operation_surface_observation_primary_read_count: operationRead.body.operation_product_surface.webhook_delay_observation_primary_read_count,
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
  if (!existsSync(resolved)) throw new Error(`webhook_delay_observation_primary_live_smoke_token_file_missing:${resolved}`);
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
  const config = parseWebhookDelayObservationPrimaryLiveSmokeArgs(process.argv.slice(2));
  const result = await runWebhookDelayObservationPrimaryLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatWebhookDelayObservationPrimaryLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
