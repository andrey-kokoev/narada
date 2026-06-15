#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');

export function parseWebhookDelayDirectiveLiveSmokeArgs(
  argv = [],
  env = process.env,
  { loadEnv = true } = {},
) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const criticalMinutes = Number(option(args, '--critical-minutes') ?? 15);
  const directiveRecordId = option(args, '--directive-record-id') ?? null;
  const directiveId = option(args, '--directive-id') ?? null;
  const inputEventId = option(args, '--input-event-id') ?? null;
  const delayMinutes = Number(option(args, '--delay-minutes') ?? criticalMinutes + 1);
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('webhook_delay_directive_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`webhook_delay_directive_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('webhook_delay_directive_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('webhook_delay_directive_live_smoke_requires_site_id');
  if (!operationId) throw new Error('webhook_delay_directive_live_smoke_requires_operation_id');
  if (!Number.isFinite(criticalMinutes) || criticalMinutes <= 0) throw new Error('webhook_delay_directive_live_smoke_invalid_critical_minutes');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    criticalMinutes,
    directiveRecordId,
    directiveId,
    inputEventId,
    delayMinutes,
  };
}

export function formatWebhookDelayDirectiveLiveSmokeText(result) {
  const lines = [
    `Webhook Delay Directive Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Directive Record: ${result.directive_record_id}`,
    `Directive: id=${result.directive_id} input=${result.input_event_id} classification=${result.classification_state ?? 'unknown'}`,
    `Authority: directive=${result.directive_authority ?? 'unknown'} fallback=${result.fallback_authority ?? 'unknown'} status=${result.fallback_status ?? 'unknown'}`,
    `Intent: action=${result.directive_action ?? 'unknown'} carrier_input=${result.carrier_input_operation ?? 'unknown'} visibility=${result.directive_visibility ?? 'unknown'} dispatch_to_provider=${result.dispatch_to_provider ?? 'unknown'}`,
    `Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`,
    `Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`,
    `Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`,
    `Directive Delivery Review: pnpm --filter @narada2/cloudflare-carrier product:directive:delivery:review:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --focus-ref ${result.directive_record_id} --operator-session-file <operator-session-file>`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function runWebhookDelayDirectiveLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const directiveRecordId = config.directiveRecordId ?? `webhook_delay_directive_live_${suffix}`;
  const directiveId = config.directiveId ?? `directive_webhook_delay_live_${suffix}`;
  const inputEventId = config.inputEventId ?? `input_webhook_delay_directive_live_${suffix}`;
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
    operation: 'webhook_delay.directive.dual_record.record',
    request_id: `webhook_delay_directive_live_record_${suffix}`,
    params: {
      site_id: config.siteId,
      operation_id: config.operationId,
      directive_record_id: directiveRecordId,
      directive_id: directiveId,
      input_event_id: inputEventId,
      source_summary_path: '.ai/webhook-delay/latest/webhook-arrival-delay-today-vs-yesterday-summary.json',
      critical_minutes: config.criticalMinutes,
      summary,
    },
  }, fetchImpl);
  assert.equal(recorded.http_status, 200, JSON.stringify(recorded.body));
  assert.equal(recorded.body.ok, true);
  assert.equal(recorded.body.status, 'recorded');
  assert.equal(recorded.body.site_id, config.siteId);
  assert.equal(recorded.body.operation_id, config.operationId);
  assert.equal(recorded.body.classification.state, 'critical');
  assert.equal(recorded.body.directive_action, 'record_directive_emission_intent');
  assert.equal(recorded.body.directive_authority, 'cloudflare_directive_dual_recorded');
  assert.equal(recorded.body.fallback_authority, 'windows_fallback_dispatcher');
  assert.equal(recorded.body.directive_intent.carrier_input_operation, 'carrier.input.record');
  assert.equal(recorded.body.carrier_admission.is_directive, true);

  const listed = await postCarrier(config, {
    operation: 'webhook_delay.directive.dual_record.list',
    request_id: `webhook_delay_directive_live_list_${suffix}`,
    params: { site_id: config.siteId, limit: 20 },
  }, fetchImpl);
  assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.ok, true);
  const listedRecord = listed.body.directive_records.find((entry) => entry.directive_record_id === directiveRecordId);
  assert.ok(listedRecord, JSON.stringify(listed.body.directive_records));
  assert.equal(listedRecord.directive_authority, 'cloudflare_directive_dual_recorded');
  assert.equal(listedRecord.fallback_status, 'available');
  assert.equal(listedRecord.carrier_admission.dispatch_to_provider, false);

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `webhook_delay_directive_live_operation_read_${suffix}`,
    params: { site_id: config.siteId, operation_id: config.operationId, webhook_delay_directive_limit: 20 },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  assert.equal(operationRead.body.ok, true);
  assert.ok(operationRead.body.webhook_delay_directive_records.some((entry) => entry.directive_record_id === directiveRecordId));
  assert.ok(operationRead.body.operation_product_surface.webhook_delay_directive_record_count >= 1);

  return {
    schema: 'narada.cloudflare_carrier.webhook_delay_directive_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    directive_record_id: directiveRecordId,
    directive_id: directiveId,
    input_event_id: inputEventId,
    classification_state: recorded.body.classification.state,
    directive_authority: recorded.body.directive_authority,
    fallback_authority: recorded.body.fallback_authority,
    fallback_status: recorded.body.fallback_status,
    directive_action: recorded.body.directive_action,
    carrier_input_operation: recorded.body.directive_intent.carrier_input_operation,
    directive_visibility: recorded.body.carrier_admission.directive_visibility,
    dispatch_to_provider: recorded.body.carrier_admission.dispatch_to_provider,
    operation_surface_directive_record_count: operationRead.body.operation_product_surface.webhook_delay_directive_record_count,
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
  if (!existsSync(resolved)) throw new Error(`webhook_delay_directive_live_smoke_token_file_missing:${resolved}`);
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
  const config = parseWebhookDelayDirectiveLiveSmokeArgs(process.argv.slice(2));
  const result = await runWebhookDelayDirectiveLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatWebhookDelayDirectiveLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
