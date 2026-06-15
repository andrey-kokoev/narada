import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWebhookDelayScheduledSourceLiveSmokeText,
  parseWebhookDelayScheduledSourceLiveSmokeArgs,
  runWebhookDelayScheduledSourceLiveSmoke,
} from './cloudflare-carrier-webhook-delay-scheduled-source-live-smoke.mjs';

test('parseWebhookDelayScheduledSourceLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseWebhookDelayScheduledSourceLiveSmokeArgs([
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

test('formatWebhookDelayScheduledSourceLiveSmokeText emits downstream reads', () => {
  const text = formatWebhookDelayScheduledSourceLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    source_adapter_id: 'source_adapter_alpha',
    scheduled_run_id: 'scheduled_run_alpha',
    observation_id: 'observation_alpha',
  });

  assert.match(text, /Webhook Delay Scheduled Source Smoke: ok/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('runWebhookDelayScheduledSourceLiveSmoke returns summarized scheduled source state', async () => {
  const result = await runWebhookDelayScheduledSourceLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    sourceAdapterId: 'source_adapter_alpha',
    criticalMinutes: 15,
    suffix: '20260614010101',
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'webhook_delay.remote_source.scheduled_read.run') {
        return responseJson(200, {
          ok: true,
          status: 'cloudflare_scheduled_read_recorded',
          trigger_authority: 'cloudflare_cron_trigger',
          source_authority: 'cloudflare_webhook_delay_remote_source_adapter',
          source_material_locus: 'cloudflare_remote_source_adapter',
          fallback_authority: 'windows_observation_read_fallback',
          fallback_status: 'available',
          scheduled_run_id: body.params.scheduled_run_id,
          observation_id: body.params.observation_id,
          source_sample_count: 2,
          classification_state: 'critical',
        });
      }
      if (body.operation === 'webhook_delay.remote_source.scheduled_read.list') {
        return responseJson(200, {
          ok: true,
          runs: [{ scheduled_run_id: 'webhook_delay_scheduled_source_read_live_20260614010101' }],
        });
      }
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          ok: true,
          webhook_delay_scheduled_source_reads: [{
            scheduled_run_id: 'webhook_delay_scheduled_source_read_live_20260614010101',
          }],
        });
      }
      throw new Error(`unexpected_operation:${body.operation}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.trigger_authority, 'cloudflare_cron_trigger');
  assert.equal(result.source_authority, 'cloudflare_webhook_delay_remote_source_adapter');
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
