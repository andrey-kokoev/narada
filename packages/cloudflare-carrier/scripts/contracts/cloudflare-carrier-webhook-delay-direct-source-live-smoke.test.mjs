import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWebhookDelayDirectSourceLiveSmokeText,
  parseWebhookDelayDirectSourceLiveSmokeArgs,
  runWebhookDelayDirectSourceLiveSmoke,
} from '../workflows/cloudflare-carrier-webhook-delay-direct-source-live-smoke.mjs';

test('parseWebhookDelayDirectSourceLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseWebhookDelayDirectSourceLiveSmokeArgs([
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

test('formatWebhookDelayDirectSourceLiveSmokeText emits downstream reads', () => {
  const text = formatWebhookDelayDirectSourceLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    source_id: 'source_alpha',
    source_adapter_id: 'source_adapter_alpha',
  });

  assert.match(text, /Webhook Delay Direct Source Smoke: ok/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('runWebhookDelayDirectSourceLiveSmoke returns summarized direct source state', async () => {
  const result = await runWebhookDelayDirectSourceLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    criticalMinutes: 15,
    sourceAdapterId: 'source_adapter_alpha',
    sourceId: 'source_alpha',
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'webhook_delay.remote_metric.direct_source.read') {
        return responseJson(200, {
          ok: true,
          schema: 'narada.sonar.cloudflare_webhook_delay_direct_remote_metric_source.v1',
          status: 'direct_remote_metric_source_recorded',
          site_id: body.params.site_id,
          source_id: body.params.source_id,
          source_adapter_id: body.params.source_adapter_id,
          source_authority: 'cloudflare_webhook_delay_direct_remote_metric_source_adapter',
          source_material_locus: 'direct_remote_metric_source',
          record: {
            observation_id: body.params.observation_id,
            source_material_locus: 'direct_remote_metric_source',
          },
          observation_authority: 'cloudflare_primary_observation_read',
          fallback_authority: 'windows_observation_read_fallback',
          fallback_status: 'available',
          direct_source_url_host: 'example.test',
          direct_source_sample_count: 3,
          source_sample_count: 3,
          classification: { state: 'critical' },
        });
      }
      if (body.operation === 'webhook_delay.remote_source.samples.list') {
        return responseJson(200, {
          ok: true,
          samples: [{
            sample: {
              source_record: {
                direct_source_url_host: 'example.test',
              },
            },
          }],
        });
      }
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          ok: true,
          webhook_delay_observation_primary_reads: [{
            observation_id: extractId(body.request_id, 'webhook_delay_direct_source_operation_read_', 'webhook_delay_direct_source_observation_live_'),
            record: { source_material_locus: 'direct_remote_metric_source' },
          }],
        });
      }
      throw new Error(`unexpected_operation:${body.operation}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.source_authority, 'cloudflare_webhook_delay_direct_remote_metric_source_adapter');
  assert.equal(result.direct_source_url_host, 'example.test');
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
