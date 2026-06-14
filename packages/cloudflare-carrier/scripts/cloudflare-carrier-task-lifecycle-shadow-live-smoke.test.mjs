import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTaskLifecycleShadowLiveSmokeText,
  parseTaskLifecycleShadowLiveSmokeArgs,
  runTaskLifecycleShadowLiveSmoke,
} from './cloudflare-carrier-task-lifecycle-shadow-live-smoke.mjs';

test('parseTaskLifecycleShadowLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseTaskLifecycleShadowLiveSmokeArgs([
    '--url', 'https://carrier.example.test',
    '--format', 'text',
    '--operator-session-cookie', 'operator-cookie',
    '--site', 'site_alpha',
    '--operation', 'operation_alpha',
    '--payload-file', 'payload.json',
  ], {}, { loadEnv: false });

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-cookie',
    source: 'operator-session-cookie',
  });
});

test('formatTaskLifecycleShadowLiveSmokeText emits downstream reads', () => {
  const text = formatTaskLifecycleShadowLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    read_id: 'read_alpha',
    mode: 'payload_record',
  });

  assert.match(text, /Task Lifecycle Shadow Smoke: ok/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('runTaskLifecycleShadowLiveSmoke returns summarized shadow state', async () => {
  const result = await runTaskLifecycleShadowLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    payloadFile: '',
    sourceUrl: 'https://source.example.test/shadow',
    sourceToken: 'source-token',
    limit: 25,
    readId: 'read_alpha',
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'task_lifecycle.shadow_read.source.read') {
        return responseJson(200, {
          ok: true,
          status: 'source_read_recorded',
          site_id: 'site_alpha',
          shadow_mode: 'cloudflare_shadow_read',
          mutation_authority: 'windows_task_lifecycle_sqlite',
          cloudflare_write_admission: 'not_admitted',
          dispatch_authority: 'windows_primary_dispatcher',
          dispatch_action: 'none',
          read: { task_count: 3 },
        });
      }
      if (body.operation === 'task_lifecycle.shadow_read.list') {
        return responseJson(200, {
          ok: true,
          reads: [{ read_id: 'read_alpha', mutation_authority: 'windows_task_lifecycle_sqlite', cloudflare_write_admission: 'not_admitted' }],
        });
      }
      if (body.operation === 'site.read') {
        return responseJson(200, {
          ok: true,
          task_lifecycle_shadow_reads: [{ read_id: 'read_alpha' }],
        });
      }
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          ok: true,
          task_lifecycle_shadow_reads: [{ read_id: 'read_alpha' }],
          operation_product_surface: {
            task_lifecycle_shadow_read_count: 1,
            task_lifecycle_mutation_authority: 'windows_task_lifecycle_sqlite',
            task_lifecycle_cloudflare_write_admission: 'not_admitted',
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}:${body.request_id}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.read_id, 'read_alpha');
  assert.equal(result.mode, 'source_read');
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
