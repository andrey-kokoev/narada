import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTaskLifecycleCreateLiveSmokeText,
  parseTaskLifecycleCreateLiveSmokeArgs,
  runTaskLifecycleCreateLiveSmoke,
} from '../workflows/cloudflare-carrier-task-lifecycle-create-live-smoke.mjs';

test('parseTaskLifecycleCreateLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseTaskLifecycleCreateLiveSmokeArgs([
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

test('formatTaskLifecycleCreateLiveSmokeText emits downstream reads', () => {
  const text = formatTaskLifecycleCreateLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    task_id: 'task_alpha',
    task_number: 7,
  });

  assert.match(text, /Task Lifecycle Create Smoke: ok/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('runTaskLifecycleCreateLiveSmoke returns summarized create state', async () => {
  const result = await runTaskLifecycleCreateLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    cutoverPointRef: 'cutover:task-lifecycle-create:v1',
    governedWriteContractRef: 'contract:task-lifecycle-create:v1',
    confirmationEvidenceRef: 'evidence:live-smoke:task-lifecycle-create',
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.request_id.includes('refused')) {
        return responseJson(403, {
          code: 'task_lifecycle_create_not_admitted',
          decision: { action: 'refuse', reason: 'windows_task_lifecycle_mutation_authority_retained' },
        });
      }
      if (body.operation === 'task_lifecycle.task_create.admit') {
        return responseJson(200, {
          ok: true,
          status: 'created',
          decision: { action: 'admit', reason: 'cloudflare_task_create_cutover_admitted' },
          mutation_authority: 'cloudflare_task_lifecycle_d1',
          cloudflare_write_admission: 'admitted',
          write_effect: 'task_lifecycle_create',
          task: {
            site_id: body.params.site_id,
            task_id: 'task_alpha',
            task_number: 7,
            status: 'opened',
            cutover_point_ref: body.params.cutover_point_ref,
            governed_write_contract_ref: body.params.governed_write_contract_ref,
            confirmation_evidence_ref: body.params.confirmation_evidence_ref,
          },
        });
      }
      if (body.operation === 'task_lifecycle.task.list') {
        return responseJson(200, {
          ok: true,
          tasks: [{
            task_id: 'task_alpha',
            mutation_authority: 'cloudflare_task_lifecycle_d1',
            cloudflare_write_admission: 'admitted',
          }],
        });
      }
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          ok: true,
          task_lifecycle_tasks: [{ task_id: 'task_alpha' }],
          operation_product_surface: {
            task_lifecycle_default_mutation_authority: 'windows_task_lifecycle_sqlite',
            task_lifecycle_default_cloudflare_write_admission: 'not_admitted',
            task_lifecycle_task_create_authority: 'cloudflare_task_lifecycle_d1',
            task_lifecycle_authority_partition: 'task_create_cloudflare_remaining_windows',
            task_lifecycle_write_admission_posture: 'task_create_admitted_remaining_writes_not_admitted',
            task_lifecycle_mutation_authority: 'split_by_mutation_class',
            task_lifecycle_cloudflare_write_admission: 'task_create_admitted',
            task_lifecycle_task_count: 1,
            task_lifecycle_write_admission_count: 1,
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.task_id, 'task_alpha');
  assert.equal(result.write_effect, 'task_lifecycle_create');
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
