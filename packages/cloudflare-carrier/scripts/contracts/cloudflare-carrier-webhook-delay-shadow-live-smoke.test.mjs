import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWebhookDelayShadowLiveSmokeText,
  parseWebhookDelayShadowLiveSmokeArgs,
  runWebhookDelayShadowLiveSmoke,
} from '../workflows/cloudflare-carrier-webhook-delay-shadow-live-smoke.mjs';

test('parseWebhookDelayShadowLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseWebhookDelayShadowLiveSmokeArgs([
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

test('formatWebhookDelayShadowLiveSmokeText emits downstream reads', () => {
  const text = formatWebhookDelayShadowLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    observation_id: 'observation_alpha',
  });

  assert.match(text, /Webhook Delay Shadow Smoke: ok/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('runWebhookDelayShadowLiveSmoke returns summarized shadow state', async () => {
  const result = await runWebhookDelayShadowLiveSmoke({
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
      if (body.operation === 'webhook_delay.shadow_read.record') {
        return responseJson(200, {
          ok: true,
          status: 'recorded',
          site_id: body.params.site_id,
          shadow_mode: 'cloudflare_shadow_read',
          dispatch_authority: 'windows_primary_dispatcher',
          dispatch_action: 'none',
          classification: { state: 'critical', dispatch_action: 'none' },
        });
      }
      if (body.operation === 'webhook_delay.shadow_read.list') {
        return responseJson(200, {
          ok: true,
          observations: [{
            observation_id: extractId(body.request_id, 'webhook_delay_shadow_live_list_', 'webhook_delay_shadow_live_'),
            classification_state: 'critical',
            dispatch_authority: 'windows_primary_dispatcher',
            dispatch_action: 'none',
          }],
        });
      }
      if (body.operation === 'site.read') {
        return responseJson(200, {
          ok: true,
          webhook_delay_shadow_observations: [{
            observation_id: extractId(body.request_id, 'webhook_delay_shadow_live_site_read_', 'webhook_delay_shadow_live_'),
          }],
        });
      }
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          ok: true,
          webhook_delay_shadow_observations: [{
            observation_id: extractId(body.request_id, 'webhook_delay_shadow_live_operation_read_', 'webhook_delay_shadow_live_'),
          }],
          operation_product_surface: {
            webhook_delay_shadow_observation_count: 1,
            dispatch_authority: 'windows_primary_dispatcher',
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.shadow_mode, 'cloudflare_shadow_read');
  assert.equal(result.operation_surface_shadow_observation_count, 1);
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
