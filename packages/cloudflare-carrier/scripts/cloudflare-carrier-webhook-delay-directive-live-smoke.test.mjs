import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWebhookDelayDirectiveLiveSmokeText,
  parseWebhookDelayDirectiveLiveSmokeArgs,
  runWebhookDelayDirectiveLiveSmoke,
} from './cloudflare-carrier-webhook-delay-directive-live-smoke.mjs';

test('parseWebhookDelayDirectiveLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseWebhookDelayDirectiveLiveSmokeArgs([
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

test('formatWebhookDelayDirectiveLiveSmokeText emits downstream reads', () => {
  const text = formatWebhookDelayDirectiveLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    directive_record_id: 'directive_record_alpha',
    directive_id: 'directive_alpha',
    input_event_id: 'input_alpha',
  });

  assert.match(text, /Webhook Delay Directive Smoke: ok/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Directive Delivery Review: pnpm --filter @narada2\/cloudflare-carrier product:directive:delivery:review:text/);
});

test('runWebhookDelayDirectiveLiveSmoke returns summarized directive state', async () => {
  const result = await runWebhookDelayDirectiveLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    criticalMinutes: 15,
    delayMinutes: 16,
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'webhook_delay.directive.dual_record.record') {
        return responseJson(200, {
          ok: true,
          status: 'recorded',
          site_id: body.params.site_id,
          operation_id: body.params.operation_id,
          classification: { state: 'critical' },
          directive_action: 'record_directive_emission_intent',
          directive_authority: 'cloudflare_directive_dual_recorded',
          fallback_authority: 'windows_fallback_dispatcher',
          fallback_status: 'available',
          directive_intent: { carrier_input_operation: 'carrier.input.record' },
          carrier_admission: {
            is_directive: true,
            directive_visibility: 'record_only',
            dispatch_to_provider: false,
          },
        });
      }
      if (body.operation === 'webhook_delay.directive.dual_record.list') {
        return responseJson(200, {
          ok: true,
          directive_records: [{
            directive_record_id: extractId(body.request_id, 'webhook_delay_directive_live_list_', 'webhook_delay_directive_live_'),
            directive_authority: 'cloudflare_directive_dual_recorded',
            fallback_status: 'available',
            carrier_admission: { dispatch_to_provider: false },
          }],
        });
      }
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          ok: true,
          webhook_delay_directive_records: [{
            directive_record_id: extractId(body.request_id, 'webhook_delay_directive_live_operation_read_', 'webhook_delay_directive_live_'),
          }],
          operation_product_surface: {
            webhook_delay_directive_record_count: 1,
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.directive_authority, 'cloudflare_directive_dual_recorded');
  assert.equal(result.operation_surface_directive_record_count, 1);
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
