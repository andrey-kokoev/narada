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
const siteRef = option('--site-ref') ?? process.env.CLOUDFLARE_CARRIER_SITE_REF ?? `cloudflare://${siteId}`;
const operationId = option('--operation') ?? process.env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
const criticalMinutes = Number(option('--critical-minutes') ?? 15);

if (!workerUrl) throw new Error('webhook_delay_directive_delivery_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('webhook_delay_directive_delivery_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('webhook_delay_directive_delivery_live_smoke_requires_site_id');
if (!operationId) throw new Error('webhook_delay_directive_delivery_live_smoke_requires_operation_id');
if (!Number.isFinite(criticalMinutes) || criticalMinutes <= 0) throw new Error('webhook_delay_directive_delivery_live_smoke_invalid_critical_minutes');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const carrierSessionId = option('--session') ?? `carrier_session_webhook_delay_directive_${suffix}`;
const deliveryId = option('--delivery-id') ?? `webhook_delay_directive_delivery_live_${suffix}`;
const directiveRecordId = option('--directive-record-id') ?? `webhook_delay_directive_live_${suffix}`;
const directiveId = option('--directive-id') ?? `directive_webhook_delay_delivery_live_${suffix}`;
const inputEventId = option('--input-event-id') ?? `input_webhook_delay_directive_delivery_live_${suffix}`;
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

const delivered = await postCarrier({
  operation: 'webhook_delay.directive.primary_with_fallback.deliver',
  request_id: `webhook_delay_directive_delivery_live_${suffix}`,
  params: {
    site_id: siteId,
    site_ref: siteRef,
    site_root: siteRef,
    operation_id: operationId,
    carrier_session_id: carrierSessionId,
    delivery_id: deliveryId,
    directive_record_id: directiveRecordId,
    directive_id: directiveId,
    input_event_id: inputEventId,
    source_summary_path: '.ai/webhook-delay/latest/webhook-arrival-delay-today-vs-yesterday-summary.json',
    critical_minutes: criticalMinutes,
    summary,
  },
});
assert.equal(delivered.http_status, 200, JSON.stringify(delivered.body));
assert.equal(delivered.body.ok, true, JSON.stringify(delivered.body));
assert.equal(delivered.body.status, 'cloudflare_primary_delivered');
assert.equal(delivered.body.site_id, siteId);
assert.equal(delivered.body.operation_id, operationId);
assert.equal(delivered.body.carrier_session_id, carrierSessionId);
assert.equal(delivered.body.classification.state, 'critical');
assert.equal(delivered.body.directive_authority, 'cloudflare_primary_directive_delivery');
assert.equal(delivered.body.dispatch_authority, 'cloudflare_primary_dispatcher');
assert.equal(delivered.body.fallback_authority, 'windows_fallback_dispatcher');
assert.equal(delivered.body.fallback_status, 'available');
assert.equal(delivered.body.delivery_action, 'cloudflare_carrier_input_deliver');
assert.equal(delivered.body.directive_intent.carrier_input_operation, 'carrier.input.deliver');
assert.equal(delivered.body.directive_intent.delivery_semantics, 'cloudflare_primary_delivery');
assert.equal(delivered.body.carrier_admission.is_directive, true);
assert.equal(delivered.body.carrier_admission.directive_visibility, 'agent_visible');
assert.equal(delivered.body.carrier_admission.dispatch_to_provider, true);
assert.equal(delivered.body.carrier_admission.directive_render_to_agent, true);
assert.equal(delivered.body.delivery.admitted, true);
assert.ok(delivered.body.delivery.events.some((event) => event.event_kind === 'directive_receipt_recorded'));
assert.ok(delivered.body.delivery.events.some((event) => event.event_kind === 'input_admitted_to_turn'));
assert.ok(delivered.body.delivery.events.some((event) => event.event_kind === 'provider_request_recorded'));

const listed = await postCarrier({
  operation: 'webhook_delay.directive.primary_with_fallback.list',
  request_id: `webhook_delay_directive_delivery_live_list_${suffix}`,
  params: { site_id: siteId, limit: 20 },
});
assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
assert.equal(listed.body.ok, true);
const listedDelivery = listed.body.directive_deliveries.find((entry) => entry.delivery_id === deliveryId);
assert.ok(listedDelivery, JSON.stringify(listed.body.directive_deliveries));
assert.equal(listedDelivery.delivery_state, 'cloudflare_primary_delivered');
assert.equal(listedDelivery.delivery_ok, true);
assert.equal(listedDelivery.fallback_status, 'available');

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `webhook_delay_directive_delivery_live_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, webhook_delay_directive_delivery_limit: 20, carrier_event_limit: 20, session_limit: 20 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.equal(operationRead.body.ok, true);
assert.ok(operationRead.body.webhook_delay_directive_deliveries.some((entry) => entry.delivery_id === deliveryId));
assert.ok(operationRead.body.operation_product_surface.webhook_delay_directive_delivery_count >= 1);
assert.ok(operationRead.body.sessions.some((session) => session.carrier_session_id === carrierSessionId));
assert.ok(operationRead.body.carrier_evidence.some((entry) => entry.carrier_session_id === carrierSessionId && entry.events.some((event) => event.event_kind === 'directive_receipt_recorded')));

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.webhook_delay_directive_delivery_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  delivery_id: deliveryId,
  directive_record_id: directiveRecordId,
  directive_id: directiveId,
  input_event_id: inputEventId,
  carrier_session_id: carrierSessionId,
  delivery_state: delivered.body.status,
  directive_authority: delivered.body.directive_authority,
  dispatch_authority: delivered.body.dispatch_authority,
  fallback_authority: delivered.body.fallback_authority,
  fallback_status: delivered.body.fallback_status,
  delivery_action: delivered.body.delivery_action,
  carrier_input_operation: delivered.body.directive_intent.carrier_input_operation,
  directive_visibility: delivered.body.carrier_admission.directive_visibility,
  dispatch_to_provider: delivered.body.carrier_admission.dispatch_to_provider,
  delivery_terminal_state: delivered.body.delivery.terminal_state,
  operation_surface_directive_delivery_count: operationRead.body.operation_product_surface.webhook_delay_directive_delivery_count,
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
  if (!existsSync(resolved)) throw new Error(`webhook_delay_directive_delivery_live_smoke_token_file_missing:${resolved}`);
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
