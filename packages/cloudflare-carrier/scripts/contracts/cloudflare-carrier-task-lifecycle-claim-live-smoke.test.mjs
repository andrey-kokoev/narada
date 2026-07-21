import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTaskLifecycleClaimLiveSmokeText,
  parseTaskLifecycleClaimLiveSmokeArgs,
  runTaskLifecycleClaimLiveSmoke,
} from '../workflows/cloudflare-carrier-task-lifecycle-claim-live-smoke.mjs';

test('parseTaskLifecycleClaimLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseTaskLifecycleClaimLiveSmokeArgs([
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

test('formatTaskLifecycleClaimLiveSmokeText emits downstream reads', () => {
  const text = formatTaskLifecycleClaimLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    task_id: 'task_alpha',
    task_number: 7,
  });

  assert.match(text, /Task Lifecycle Claim Smoke: ok/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('runTaskLifecycleClaimLiveSmoke returns summarized claim state', async () => {
  const result = await runTaskLifecycleClaimLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    claimantAgentId: 'agent_alpha',
    createCutoverPointRef: 'cutover:task-lifecycle-create:v1',
    createContractRef: 'contract:task-lifecycle-create:v1',
    createEvidenceRef: 'evidence:live-smoke:task-lifecycle-create',
    claimCutoverPointRef: 'cutover:task-lifecycle-claim:v1',
    claimContractRef: 'contract:task-lifecycle-claim:v1',
    claimEvidenceRef: 'evidence:live-smoke:task-lifecycle-claim',
    assignmentAuthorityRef: 'assignment-authority:task-lifecycle-claim:v1',
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'task_lifecycle.task_create.admit') {
        return responseJson(200, {
          status: 'created',
          task: { task_id: 'task_alpha', task_number: 7, status: 'opened' },
        });
      }
      if (body.request_id.includes('refused')) {
        return responseJson(403, {
          code: 'task_lifecycle_claim_not_admitted',
          decision: { reason: 'windows_task_lifecycle_mutation_authority_retained' },
        });
      }
      if (body.request_id.includes('duplicate')) {
        return responseJson(409, {
          code: 'task_lifecycle_claim_conflict',
          previous_status: 'claimed',
          conflict_policy: 'opened_only_no_overwrite',
        });
      }
      if (body.operation === 'task_lifecycle.task_claim.admit') {
        return responseJson(200, {
          status: 'claimed',
          previous_status: 'opened',
          decision: { reason: 'cloudflare_task_claim_cutover_admitted', conflict_policy: 'opened_only_no_overwrite' },
          mutation_authority: 'cloudflare_task_lifecycle_d1',
          cloudflare_write_admission: 'admitted',
          write_effect: 'task_lifecycle_claim',
          task: {
            task_id: 'task_alpha',
            task_number: 7,
            status: 'claimed',
            claimed_by_agent_id: body.params.claimant_agent_id,
            assignment_authority_ref: body.params.assignment_authority_ref,
          },
        });
      }
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          ok: true,
          task_lifecycle_tasks: [{ task_id: 'task_alpha', status: 'claimed' }],
          operation_product_surface: {
            task_lifecycle_default_mutation_authority: 'windows_task_lifecycle_sqlite',
            task_lifecycle_default_cloudflare_write_admission: 'not_admitted',
            task_lifecycle_task_create_authority: 'cloudflare_task_lifecycle_d1',
            task_lifecycle_task_claim_authority: 'cloudflare_task_lifecycle_d1',
            task_lifecycle_task_claim_count: 1,
            task_lifecycle_authority_partition: 'task_create_and_claim_cloudflare_remaining_windows',
            task_lifecycle_write_admission_posture: 'task_create_and_claim_admitted_remaining_writes_not_admitted',
            task_lifecycle_cloudflare_write_admission: 'task_create_and_claim_admitted',
            task_lifecycle_task_count: 1,
            task_lifecycle_write_admission_count: 2,
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}:${body.request_id}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.task_id, 'task_alpha');
  assert.equal(result.claimant_agent_id, 'agent_alpha');
  assert.equal(result.write_effect, 'task_lifecycle_claim');
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
