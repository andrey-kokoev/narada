import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTaskLifecycleSourceStateWriteLiveSmokeText,
  parseTaskLifecycleSourceStateWriteLiveSmokeArgs,
  runTaskLifecycleSourceStateWriteLiveSmoke,
} from './cloudflare-carrier-task-lifecycle-source-state-write-live-smoke.mjs';

test('parseTaskLifecycleSourceStateWriteLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseTaskLifecycleSourceStateWriteLiveSmokeArgs([
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

test('formatTaskLifecycleSourceStateWriteLiveSmokeText emits downstream reads', () => {
  const text = formatTaskLifecycleSourceStateWriteLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    task_id: 'task_alpha',
    task_number: 7,
  });

  assert.match(text, /Task Lifecycle Source State Write Smoke: ok/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('runTaskLifecycleSourceStateWriteLiveSmoke returns summarized source-state write state', async () => {
  const result = await runTaskLifecycleSourceStateWriteLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    agentId: 'agent_alpha',
    filePath: 'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'task_lifecycle.task_create.admit') {
        return responseJson(200, { task: { task_id: 'task_alpha', task_number: 7 } });
      }
      if (body.operation === 'task_lifecycle.task_claim.admit') {
        return responseJson(200, {});
      }
      if (body.operation === 'task_lifecycle.task_report.admit') {
        return responseJson(200, { report: { report_id: 'report_alpha' } });
      }
      if (body.operation === 'task_lifecycle.changed_file_evidence.admit') {
        return responseJson(200, {});
      }
      if (body.operation === 'task_lifecycle.task_finish.admit') {
        return responseJson(200, { task: { status: 'finished' } });
      }
      if (body.operation === 'task_lifecycle.projection_write.admit') {
        return responseJson(200, { write_effect: 'task_lifecycle_projection_write' });
      }
      if (body.request_id.includes('refused')) {
        return responseJson(403, {
          code: 'task_lifecycle_source_state_write_not_admitted',
          decision: { reason: 'windows_task_lifecycle_mutation_authority_retained' },
        });
      }
      if (body.operation === 'task_lifecycle.source_state_write.admit') {
        return responseJson(200, {
          status: 'task_lifecycle_source_state_written',
          mutation_authority: 'cloudflare_task_lifecycle_d1',
          cloudflare_write_admission: 'admitted',
          write_effect: 'task_lifecycle_source_state_write',
          source_state_write: {
            canonical_source_state_authority: 'cloudflare_task_lifecycle_d1',
            windows_sqlite_source_write_admission: 'not_admitted',
            filesystem_mutation_admission: 'not_admitted',
            repository_publication_admission: 'not_admitted',
            mailbox_mutation_admission: 'not_admitted',
          },
          task: { task_lifecycle_source_state_write_count: 1 },
        });
      }
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          task_lifecycle_tasks: [{ task_id: 'task_alpha', status: 'finished', task_lifecycle_source_state_write_count: 1 }],
          operation_product_surface: {
            task_lifecycle_source_state_authority: 'cloudflare_task_lifecycle_d1',
            task_lifecycle_source_state_write_count: 1,
            task_lifecycle_windows_sqlite_source_write_admission: 'not_admitted',
            task_lifecycle_authority_partition: 'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_cloudflare_remaining_windows_effects',
            task_lifecycle_write_admission_posture: 'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_admitted_remaining_external_effects_not_admitted',
            task_lifecycle_cloudflare_write_admission: 'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_admitted',
            task_lifecycle_write_admission_count: 6,
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}:${body.request_id}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.task_id, 'task_alpha');
  assert.equal(result.write_effect, 'task_lifecycle_source_state_write');
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
