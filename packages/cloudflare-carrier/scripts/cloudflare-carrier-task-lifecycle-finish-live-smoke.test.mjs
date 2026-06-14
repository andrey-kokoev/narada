import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTaskLifecycleFinishLiveSmokeText,
  parseTaskLifecycleFinishLiveSmokeArgs,
  runTaskLifecycleFinishLiveSmoke,
} from './cloudflare-carrier-task-lifecycle-finish-live-smoke.mjs';

test('parseTaskLifecycleFinishLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseTaskLifecycleFinishLiveSmokeArgs([
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

test('formatTaskLifecycleFinishLiveSmokeText emits downstream reads', () => {
  const text = formatTaskLifecycleFinishLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    task_id: 'task_alpha',
    task_number: 7,
  });

  assert.match(text, /Task Lifecycle Finish Smoke: ok/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('runTaskLifecycleFinishLiveSmoke returns summarized finish state', async () => {
  const result = await runTaskLifecycleFinishLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    agentId: 'agent_alpha',
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'task_lifecycle.task_create.admit') {
        return responseJson(200, { task: { task_id: 'task_alpha', task_number: 7, status: 'opened' } });
      }
      if (body.operation === 'task_lifecycle.task_claim.admit') {
        return responseJson(200, { task: { status: 'claimed' } });
      }
      if (body.operation === 'task_lifecycle.task_report.admit') {
        return responseJson(200, {
          task: { status: 'closed', report: { changed_file_evidence_admission: 'not_admitted' } },
          report: { report_id: 'report_alpha' },
        });
      }
      if (body.operation === 'task_lifecycle.changed_file_evidence.admit') {
        return responseJson(200, {
          task: { changed_file_evidence_count: 1 },
          evidence: {
            filesystem_mutation_admission: 'not_admitted',
            repository_publication_admission: 'not_admitted',
            projection_write_admission: 'not_admitted',
          },
        });
      }
      if (body.request_id.includes('refused')) {
        return responseJson(403, {
          code: 'task_lifecycle_finish_not_admitted',
          decision: { reason: 'windows_task_lifecycle_mutation_authority_retained' },
        });
      }
      if (body.operation === 'task_lifecycle.task_finish.admit') {
        return responseJson(200, {
          status: 'finished',
          previous_status: 'closed',
          new_status: 'finished',
          mutation_authority: 'cloudflare_task_lifecycle_d1',
          cloudflare_write_admission: 'admitted',
          write_effect: 'task_lifecycle_finish',
          task: {
            status: 'finished',
            finish_verdict: 'accepted',
            changed_file_evidence_count: 1,
          },
        });
      }
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          ok: true,
          task_lifecycle_tasks: [{ task_id: 'task_alpha', status: 'finished', finish_id: 'finish_alpha' }],
          operation_product_surface: {
            task_lifecycle_task_finish_authority: 'cloudflare_task_lifecycle_d1',
            task_lifecycle_authority_partition: 'task_create_claim_report_finish_and_changed_file_evidence_cloudflare_remaining_windows',
            task_lifecycle_write_admission_posture: 'task_create_claim_report_finish_and_changed_file_evidence_admitted_remaining_writes_not_admitted',
            task_lifecycle_cloudflare_write_admission: 'task_create_claim_report_finish_and_changed_file_evidence_admitted',
            task_lifecycle_task_count: 1,
            task_lifecycle_write_admission_count: 5,
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}:${body.request_id}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.task_id, 'task_alpha');
  assert.equal(result.finalizer_agent_id, 'agent_alpha');
  assert.equal(result.new_status, 'finished');
  assert.equal(result.finish_verdict, 'accepted');
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
