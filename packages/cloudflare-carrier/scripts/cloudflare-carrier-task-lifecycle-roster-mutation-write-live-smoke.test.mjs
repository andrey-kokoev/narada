import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTaskLifecycleRosterMutationWriteLiveSmokeText,
  parseTaskLifecycleRosterMutationWriteLiveSmokeArgs,
  runTaskLifecycleRosterMutationWriteLiveSmoke,
} from './cloudflare-carrier-task-lifecycle-roster-mutation-write-live-smoke.mjs';

test('parseTaskLifecycleRosterMutationWriteLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseTaskLifecycleRosterMutationWriteLiveSmokeArgs([
    '--url', 'https://carrier.example.test',
    '--format', 'text',
    '--operator-session-cookie', 'operator-cookie',
    '--site', 'site_alpha',
    '--operation', 'operation_alpha',
    '--assignee-principal', 'principal_alpha',
  ], {}, { loadEnv: false });

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-cookie',
    source: 'operator-session-cookie',
  });
});

test('formatTaskLifecycleRosterMutationWriteLiveSmokeText emits downstream reads', () => {
  const text = formatTaskLifecycleRosterMutationWriteLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    task_id: 'task_alpha',
    task_number: 7,
  });

  assert.match(text, /Task Lifecycle Roster Mutation Write Smoke: ok/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('runTaskLifecycleRosterMutationWriteLiveSmoke returns summarized roster mutation write state', async () => {
  const result = await runTaskLifecycleRosterMutationWriteLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    agentId: 'agent_alpha',
    assigneePrincipalId: 'principal_alpha',
    membershipStatus: 'active',
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
        return responseJson(200, {});
      }
      if (body.operation === 'task_lifecycle.source_state_write.admit') {
        return responseJson(200, {});
      }
      if (body.operation === 'task_lifecycle.assignment_write.admit') {
        return responseJson(200, {});
      }
      if (body.operation === 'task_lifecycle.role_resolution_write.admit') {
        if (body.request_id.includes('refused')) {
          return responseJson(403, {
            code: 'task_lifecycle_role_resolution_write_not_admitted',
            decision: { reason: 'windows_task_lifecycle_mutation_authority_retained' },
          });
        }
        return responseJson(200, {
          status: 'task_lifecycle_role_resolution_written',
          mutation_authority: 'cloudflare_task_lifecycle_d1',
          cloudflare_write_admission: 'admitted',
          write_effect: 'task_lifecycle_role_resolution_write',
          role_resolution: {
            resolved_role: 'owner',
            role_resolution_authority_admission: 'admitted',
            roster_read_admission: 'admitted',
            roster_mutation_admission: 'not_admitted',
            mailbox_mutation_admission: 'not_admitted',
            filesystem_mutation_admission: 'not_admitted',
            repository_publication_admission: 'not_admitted',
          },
        });
      }
      if (body.operation === 'task_lifecycle.roster_mutation_write.admit') {
        if (body.request_id.includes('refused')) {
          return responseJson(403, {
            code: 'task_lifecycle_roster_mutation_write_not_admitted',
            decision: { reason: 'windows_task_lifecycle_mutation_authority_retained' },
          });
        }
        return responseJson(200, {
          status: 'task_lifecycle_roster_mutation_written',
          mutation_authority: 'cloudflare_task_lifecycle_d1',
          cloudflare_write_admission: 'admitted',
          write_effect: 'task_lifecycle_roster_mutation_write',
          roster_mutation: {
            roster_mutation_admission: 'admitted',
            mailbox_mutation_admission: 'not_admitted',
            filesystem_mutation_admission: 'not_admitted',
            repository_publication_admission: 'not_admitted',
          },
        });
      }
      if (body.operation === 'operation.read' && body.request_id.includes('role_resolution_write_live_operation_read_')) {
        return responseJson(200, {
          task_lifecycle_tasks: [{ task_id: 'task_alpha', task_lifecycle_role_resolution_write_count: 1 }],
          operation_product_surface: {
            task_lifecycle_role_resolution_authority: 'cloudflare_task_lifecycle_d1',
            task_lifecycle_role_resolution_write_count: 1,
            task_lifecycle_roster_read_admission: 'admitted',
            task_lifecycle_roster_mutation_admission: 'not_admitted',
            task_lifecycle_role_resolution_authority_admission: 'admitted',
            task_lifecycle_authority_partition: 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_cloudflare_remaining_windows_effects',
            task_lifecycle_write_admission_posture: 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_admitted_remaining_external_effects_not_admitted',
            task_lifecycle_cloudflare_write_admission: 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_admitted',
            task_lifecycle_write_admission_count: 8,
          },
        });
      }
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          task_lifecycle_tasks: [{ task_id: 'task_alpha', task_lifecycle_roster_mutation_write_count: 1 }],
          operation_product_surface: {
            task_lifecycle_role_resolution_authority: 'cloudflare_task_lifecycle_d1',
            task_lifecycle_role_resolution_write_count: 1,
            task_lifecycle_roster_read_admission: 'admitted',
            task_lifecycle_roster_mutation_admission: 'admitted',
            task_lifecycle_role_resolution_authority_admission: 'admitted',
            task_lifecycle_authority_partition: 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_cloudflare_remaining_windows_effects',
            task_lifecycle_write_admission_posture: 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_admitted_remaining_external_effects_not_admitted',
            task_lifecycle_cloudflare_write_admission: 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_admitted',
            task_lifecycle_write_admission_count: 9,
            task_lifecycle_roster_mutation_authority: 'cloudflare_task_lifecycle_d1',
            task_lifecycle_roster_mutation_write_count: 1,
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}:${body.request_id}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.task_id, 'task_alpha');
  assert.equal(result.write_effect, 'task_lifecycle_roster_mutation_write');
  assert.equal(result.membership_role, 'owner');
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
