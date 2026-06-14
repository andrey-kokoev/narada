import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatResidentLoopShadowLiveSmokeText,
  parseResidentLoopShadowLiveSmokeArgs,
  runResidentLoopShadowLiveSmoke,
} from './cloudflare-carrier-resident-loop-shadow-live-smoke.mjs';

test('parseResidentLoopShadowLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseResidentLoopShadowLiveSmokeArgs([
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

test('formatResidentLoopShadowLiveSmokeText emits downstream reads', () => {
  const text = formatResidentLoopShadowLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    loop_run_id: 'loop_alpha',
  });

  assert.match(text, /Resident Loop Shadow Smoke: ok/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
});

test('runResidentLoopShadowLiveSmoke returns summarized shadow state', async () => {
  let createdLoopRunId = null;
  const result = await runResidentLoopShadowLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    loopRunId: null,
    sourceSummaryPath: '.ai/operator-attention/example.json',
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'resident_loop.shadow_read.record') {
        createdLoopRunId = body.params.loop_run_id;
        return responseJson(200, {
          ok: true,
          status: 'recorded',
          site_id: 'site_alpha',
          shadow_mode: 'cloudflare_shadow_read',
          dispatch_authority: 'windows_primary_dispatcher',
          dispatch_action: 'none',
          loop_run: { status: 'shadow_recorded', step_count: 1, operator_attention_count: 1 },
        });
      }
      if (body.operation === 'resident_loop.shadow_read.list') {
        return responseJson(200, {
          ok: true,
          loop_runs: [{ loop_run_id: createdLoopRunId, loop_status: 'shadow_recorded', dispatch_authority: 'windows_primary_dispatcher', dispatch_action: 'none' }],
        });
      }
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          ok: true,
          resident_loop_shadow_runs: [{ loop_run_id: createdLoopRunId }],
          operation_product_surface: {
            resident_loop_shadow_run_count: 1,
            dispatch_authority: 'windows_primary_dispatcher',
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}:${body.request_id}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.match(result.loop_run_id, /^resident_loop_shadow_live_/);
  assert.equal(result.dispatch_authority, 'windows_primary_dispatcher');
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
