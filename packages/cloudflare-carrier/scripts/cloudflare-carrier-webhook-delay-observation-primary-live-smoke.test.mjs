import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWebhookDelayObservationPrimaryLiveSmokeText,
  parseWebhookDelayObservationPrimaryLiveSmokeArgs,
  runWebhookDelayObservationPrimaryLiveSmoke,
} from './cloudflare-carrier-webhook-delay-observation-primary-live-smoke.mjs';

test('parseWebhookDelayObservationPrimaryLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseWebhookDelayObservationPrimaryLiveSmokeArgs([
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

test('formatWebhookDelayObservationPrimaryLiveSmokeText emits downstream reads', () => {
  const text = formatWebhookDelayObservationPrimaryLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    observation_id: 'observation_alpha',
  });

  assert.match(text, /Webhook Delay Observation Primary Smoke: ok/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('runWebhookDelayObservationPrimaryLiveSmoke returns summarized primary observation state', async () => {
  const result = await runWebhookDelayObservationPrimaryLiveSmoke({
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
      if (body.operation === 'webhook_delay.observation.primary_with_fallback.record') {
        return responseJson(200, {
          ok: true,
          status: 'cloudflare_primary_recorded',
          site_id: body.params.site_id,
          observation_authority: 'cloudflare_primary_observation_read',
          fallback_authority: 'windows_observation_read_fallback',
          fallback_status: 'available',
          dispatch_authority: 'cloudflare_primary_dispatcher',
          dispatch_action: 'none',
          classification: { state: 'critical', read_mode: 'cloudflare_primary_with_windows_fallback' },
          record: {
            source_locus: 'cloudflare_carrier_site',
            source_material_locus: 'windows_local_site_summary',
            retained_windows_authority: ['windows_observation_refresh_fallback', 'task_lifecycle_write'],
          },
        });
      }
      if (body.operation === 'webhook_delay.observation.primary_with_fallback.list') {
        return responseJson(200, {
          ok: true,
          observation_authority: 'cloudflare_primary_observation_read',
          observations: [{
            observation_id: extractId(body.request_id, 'webhook_delay_observation_primary_live_list_', 'webhook_delay_observation_primary_live_'),
            classification_state: 'critical',
            fallback_status: 'available',
          }],
        });
      }
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          ok: true,
          webhook_delay_observation_primary_reads: [{
            observation_id: extractId(body.request_id, 'webhook_delay_observation_primary_live_operation_read_', 'webhook_delay_observation_primary_live_'),
          }],
          operation_product_surface: {
            webhook_delay_observation_primary_read_count: 1,
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.observation_authority, 'cloudflare_primary_observation_read');
  assert.equal(result.operation_surface_observation_primary_read_count, 1);
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
