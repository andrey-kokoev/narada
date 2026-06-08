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

if (!workerUrl) throw new Error('webhook_delay_directive_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('webhook_delay_directive_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('webhook_delay_directive_live_smoke_requires_site_id');
if (!operationId) throw new Error('webhook_delay_directive_live_smoke_requires_operation_id');
if (!Number.isFinite(criticalMinutes) || criticalMinutes <= 0) throw new Error('webhook_delay_directive_live_smoke_invalid_critical_minutes');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const directiveRecordId = option('--directive-record-id') ?? `webhook_delay_directive_live_${suffix}`;
const directiveId = option('--directive-id') ?? `directive_webhook_delay_live_${suffix}`;
const inputEventId = option('--input-event-id') ?? `input_webhook_delay_directive_live_${suffix}`;
const delayMinutes = Number(option('--delay-minutes') ?? criticalMinutes + 1);
const summary = {
  schema: 'narada.sonar/webhook-delay-today-vs-yesterday/v1',
  generated_at: new Date().toISOString(),
  rows72: 1,
  today: {
    latest: {
      at: new Date().toISOString(),
      at_ct: null,
      elapsed_minutes: 0,
      delay_minutes: delayMinutes,
    },
  },
  yesterday_same_clock: {
    delay_minutes: 0,
    delta_minutes_today_minus_yesterday: delayMinutes,
  },
};

const recorded = await postCarrier({
  operation: 'webhook_delay.directive.dual_record.record',
  request_id: `webhook_delay_directive_live_record_${suffix}`,
  params: {
    site_id: siteId,
    operation_id: operationId,
    directive_record_id: directiveRecordId,
    directive_id: directiveId,
    input_event_id: inputEventId,
    source_summary_path: '.ai/webhook-delay/latest/webhook-arrival-delay-today-vs-yesterday-summary.json',
    critical_minutes: criticalMinutes,
    summary,
  },
});
assert.equal(recorded.http_status, 200, JSON.stringify(recorded.body));
assert.equal(recorded.body.ok, true);
assert.equal(recorded.body.status, 'recorded');
assert.equal(recorded.body.site_id, siteId);
assert.equal(recorded.body.operation_id, operationId);
assert.equal(recorded.body.classification.state, 'critical');
assert.equal(recorded.body.directive_action, 'record_directive_emission_intent');
assert.equal(recorded.body.directive_authority, 'cloudflare_directive_dual_recorded');
assert.equal(recorded.body.fallback_authority, 'windows_fallback_dispatcher');
assert.equal(recorded.body.directive_intent.carrier_input_operation, 'carrier.input.record');
assert.equal(recorded.body.directive_intent.delivery_semantics, 'record_only');
assert.equal(recorded.body.carrier_admission.is_directive, true);
assert.equal(recorded.body.carrier_admission.directive_visibility, 'record_only');
assert.equal(recorded.body.carrier_admission.dispatch_to_provider, false);
assert.equal(recorded.body.carrier_admission.complete_without_provider, true);

const listed = await postCarrier({
  operation: 'webhook_delay.directive.dual_record.list',
  request_id: `webhook_delay_directive_live_list_${suffix}`,
  params: { site_id: siteId, limit: 20 },
});
assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
assert.equal(listed.body.ok, true);
const listedRecord = listed.body.directive_records.find((entry) => entry.directive_record_id === directiveRecordId);
assert.ok(listedRecord, JSON.stringify(listed.body.directive_records));
assert.equal(listedRecord.directive_authority, 'cloudflare_directive_dual_recorded');
assert.equal(listedRecord.fallback_status, 'available');
assert.equal(listedRecord.carrier_admission.dispatch_to_provider, false);

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `webhook_delay_directive_live_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, webhook_delay_directive_limit: 20 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.equal(operationRead.body.ok, true);
assert.ok(operationRead.body.webhook_delay_directive_records.some((entry) => entry.directive_record_id === directiveRecordId));
assert.ok(operationRead.body.operation_product_surface.webhook_delay_directive_record_count >= 1);

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.webhook_delay_directive_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
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
  if (!existsSync(resolved)) throw new Error(`webhook_delay_directive_live_smoke_token_file_missing:${resolved}`);
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
