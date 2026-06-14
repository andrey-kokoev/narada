import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWebhookDelayDirectiveDeliveryLiveSmokeText,
  parseWebhookDelayDirectiveDeliveryLiveSmokeArgs,
  runWebhookDelayDirectiveDeliveryLiveSmoke,
} from './cloudflare-carrier-webhook-delay-directive-delivery-live-smoke.mjs';

test('parseWebhookDelayDirectiveDeliveryLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseWebhookDelayDirectiveDeliveryLiveSmokeArgs([
    '--url', 'https://carrier.example.test',
    '--format', 'text',
    '--operator-session-cookie', 'operator-cookie',
    '--site', 'site_alpha',
    '--operation', 'operation_alpha',
  ], {}, { loadEnv: false });

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-cookie',
    source: 'operator-session-cookie',
  });
});

test('formatWebhookDelayDirectiveDeliveryLiveSmokeText emits downstream reads', () => {
  const text = formatWebhookDelayDirectiveDeliveryLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    delivery_id: 'delivery_alpha',
    directive_record_id: 'directive_record_alpha',
    carrier_session_id: 'carrier_session_alpha',
  });

  assert.match(text, /Webhook Delay Directive Delivery Smoke: ok/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
  assert.match(text, /Directive Delivery Review: pnpm --filter @narada2\/cloudflare-carrier product:directive:delivery:review:text/);
  assert.match(text, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text/);
});

test('runWebhookDelayDirectiveDeliveryLiveSmoke returns summarized delivery state', async () => {
  const result = await runWebhookDelayDirectiveDeliveryLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    siteRef: 'cloudflare://site_alpha',
    operationId: 'operation_alpha',
    criticalMinutes: 15,
    delayMinutes: 16,
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'webhook_delay.directive.primary_with_fallback.deliver') {
        return responseJson(200, {
          ok: true,
          status: 'cloudflare_primary_delivered',
          site_id: body.params.site_id,
          operation_id: body.params.operation_id,
          carrier_session_id: body.params.carrier_session_id,
          classification: { state: 'critical' },
          directive_authority: 'cloudflare_primary_directive_delivery',
          dispatch_authority: 'cloudflare_primary_dispatcher',
          fallback_authority: 'windows_fallback_dispatcher',
          fallback_status: 'available',
          delivery_action: 'cloudflare_carrier_input_deliver',
          directive_intent: { carrier_input_operation: 'carrier.input.deliver' },
          carrier_admission: {
            directive_visibility: 'agent_visible',
            dispatch_to_provider: true,
          },
          delivery: {
            admitted: true,
            terminal_state: 'input_completed',
            events: [{ event_kind: 'directive_receipt_recorded' }],
          },
        });
      }
      if (body.operation === 'webhook_delay.directive.primary_with_fallback.list') {
        return responseJson(200, {
          ok: true,
          directive_deliveries: [{
            delivery_id: extractId(body.request_id, 'webhook_delay_directive_delivery_live_list_', 'webhook_delay_directive_delivery_live_'),
            delivery_state: 'cloudflare_primary_delivered',
            delivery_ok: true,
            fallback_status: 'available',
          }],
        });
      }
      if (body.operation === 'operation.read') {
        const deliveryId = extractId(body.request_id, 'webhook_delay_directive_delivery_live_operation_read_', 'webhook_delay_directive_delivery_live_');
        const sessionId = extractId(body.request_id, 'webhook_delay_directive_delivery_live_operation_read_', 'carrier_session_webhook_delay_directive_');
        return responseJson(200, {
          ok: true,
          webhook_delay_directive_deliveries: [{ delivery_id: deliveryId }],
          operation_product_surface: {
            webhook_delay_directive_delivery_count: 1,
          },
          sessions: [{ carrier_session_id: sessionId }],
          carrier_evidence: [{
            carrier_session_id: sessionId,
            events: [{ event_kind: 'directive_receipt_recorded' }],
          }],
        });
      }
      throw new Error(`unexpected_operation:${body.operation}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.directive_authority, 'cloudflare_primary_directive_delivery');
  assert.equal(result.operation_surface_directive_delivery_count, 1);
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}

function extractId(requestId, prefix, idPrefix) {
  return requestId.startsWith(prefix) ? `${idPrefix}${requestId.slice(prefix.length)}` : `${idPrefix}unknown`;
}
