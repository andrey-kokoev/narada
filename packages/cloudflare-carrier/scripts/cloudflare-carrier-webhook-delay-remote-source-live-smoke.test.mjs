import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWebhookDelayRemoteSourceLiveSmokeText,
  parseWebhookDelayRemoteSourceLiveSmokeArgs,
  runWebhookDelayRemoteSourceLiveSmoke,
} from './cloudflare-carrier-webhook-delay-remote-source-live-smoke.mjs';

test('parseWebhookDelayRemoteSourceLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseWebhookDelayRemoteSourceLiveSmokeArgs([
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

test('formatWebhookDelayRemoteSourceLiveSmokeText emits downstream reads', () => {
  const text = formatWebhookDelayRemoteSourceLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    source_adapter_id: 'source_adapter_alpha',
    observation_id: 'observation_alpha',
  });

  assert.match(text, /Webhook Delay Remote Source Smoke: ok/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('runWebhookDelayRemoteSourceLiveSmoke returns summarized remote source state', async () => {
  const result = await runWebhookDelayRemoteSourceLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    criticalMinutes: 15,
    delayMinutes: 16,
    comparisonDelayMinutes: 1,
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'webhook_delay.remote_source.samples.put') {
        return responseJson(200, {
          ok: true,
          status: 'samples_recorded',
          source_authority: 'cloudflare_webhook_delay_remote_source_adapter',
          sample_count: 2,
        });
      }
      if (body.operation === 'webhook_delay.remote_source.primary_with_fallback.read') {
        return responseJson(200, {
          ok: true,
          status: 'cloudflare_primary_recorded',
          source_authority: 'cloudflare_webhook_delay_remote_source_adapter',
          source_material_locus: 'cloudflare_remote_source_adapter',
          source_sample_count: 2,
          observation_authority: 'cloudflare_primary_observation_read',
          fallback_authority: 'windows_observation_read_fallback',
          fallback_status: 'available',
          classification: { state: 'critical' },
          observation: {
            source_schema: 'narada.sonar/webhook-delay-remote-source-adapter/v1',
            latest: { delay_minutes: 16 },
          },
          record: { source_material_locus: 'cloudflare_remote_source_adapter' },
        });
      }
      if (body.operation === 'webhook_delay.remote_source.samples.list') {
        return responseJson(200, {
          ok: true,
          samples: [{ sample_id: 'a' }, { sample_id: 'b' }],
        });
      }
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          ok: true,
          webhook_delay_observation_primary_reads: [{
            observation_id: extractId(body.request_id, 'webhook_delay_remote_source_operation_read_', 'webhook_delay_remote_source_observation_live_'),
            record: { source_material_locus: 'cloudflare_remote_source_adapter' },
          }],
        });
      }
      throw new Error(`unexpected_operation:${body.operation}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.source_authority, 'cloudflare_webhook_delay_remote_source_adapter');
  assert.equal(result.source_sample_count, 2);
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
