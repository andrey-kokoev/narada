import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTaskLifecycleReportLiveSmokeText,
  parseTaskLifecycleReportLiveSmokeArgs,
  runTaskLifecycleReportLiveSmoke,
} from './cloudflare-carrier-task-lifecycle-report-live-smoke.mjs';

test('parseTaskLifecycleReportLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseTaskLifecycleReportLiveSmokeArgs([
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

test('formatTaskLifecycleReportLiveSmokeText emits downstream reads', () => {
  const text = formatTaskLifecycleReportLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    task_id: 'task_alpha',
    task_number: 7,
  });

  assert.match(text, /Task Lifecycle Report Smoke: ok/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('runTaskLifecycleReportLiveSmoke returns summarized report state', async () => {
  const result = await runTaskLifecycleReportLiveSmoke({
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
      if (body.request_id.includes('refused')) {
        return responseJson(403, {
          code: 'task_lifecycle_report_not_admitted',
          decision: { reason: 'windows_task_lifecycle_mutation_authority_retained' },
        });
      }
      if (body.request_id.includes('mismatch')) {
        return responseJson(400, {
          code: 'task_lifecycle_report_reporter_mismatch',
          claimed_by_agent_id: 'agent_alpha',
        });
      }
      if (body.operation === 'task_lifecycle.task_report.admit') {
        return responseJson(200, {
          status: 'reported',
          previous_status: 'claimed',
          new_status: 'closed',
          mutation_authority: 'cloudflare_task_lifecycle_d1',
          cloudflare_write_admission: 'admitted',
          write_effect: 'task_lifecycle_report',
          task: {
            status: 'closed',
            report: { changed_file_evidence_admission: 'not_admitted' },
          },
        });
      }
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          ok: true,
          task_lifecycle_tasks: [{ task_id: 'task_alpha', status: 'closed', report_id: 'report_alpha' }],
          operation_product_surface: {
            task_lifecycle_task_report_authority: 'cloudflare_task_lifecycle_d1',
            task_lifecycle_authority_partition: 'task_create_claim_and_report_cloudflare_remaining_windows',
            task_lifecycle_write_admission_posture: 'task_create_claim_and_report_admitted_remaining_writes_not_admitted',
            task_lifecycle_cloudflare_write_admission: 'task_create_claim_and_report_admitted',
            task_lifecycle_task_count: 1,
            task_lifecycle_write_admission_count: 3,
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}:${body.request_id}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.task_id, 'task_alpha');
  assert.equal(result.reporter_agent_id, 'agent_alpha');
  assert.equal(result.new_status, 'closed');
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
