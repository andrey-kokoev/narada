import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatAuthorityTransferReadinessLiveSmokeText,
  parseAuthorityTransferReadinessLiveSmokeArgs,
  runAuthorityTransferReadinessLiveSmoke,
} from './cloudflare-carrier-authority-transfer-readiness-live-smoke.mjs';

test('parseAuthorityTransferReadinessLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseAuthorityTransferReadinessLiveSmokeArgs([
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

test('formatAuthorityTransferReadinessLiveSmokeText emits downstream reads', () => {
  const text = formatAuthorityTransferReadinessLiveSmokeText({
    status: 'incomplete',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    authority_transfer_posture: {},
    slices: { repository_publication: {} },
  });

  assert.match(text, /Authority Transfer Readiness Smoke: incomplete/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Authority Transfer Read: pnpm --filter @narada2\/cloudflare-carrier product:authority-transfer:text/);
});

test('runAuthorityTransferReadinessLiveSmoke returns summarized readiness state', async () => {
  const result = await runAuthorityTransferReadinessLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    repositoryRef: 'github:andrey-kokoev/narada',
    branchRef: 'cloudflare-publication',
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          operation_product_surface: {
            mailbox_status_source_read_count: 1,
            mailbox_draft_reply_proposal_count: 1,
            mailbox_send_confirmation_count: 1,
            site_file_change_proposal_count: 1,
            site_file_materialization_count: 1,
            local_ingress_request_count: 1,
            local_ingress_authority_partition: 'partition_local',
            task_lifecycle_count: 3,
            task_lifecycle_authority_partition: 'partition_tasks',
            repository_publication_request_count: 2,
            repository_publication_execution_count: 2,
            repository_publication_evidence_count: 1,
            repository_publication_authority_partition: 'partition_repo',
          },
          authority_transfer_posture: {
            transfer_complete: false,
            domain_count: 5,
            cloudflare_owned_count: 3,
            cloudflare_governed_windows_executed_count: 1,
            cloudflare_recorded_windows_owned_count: 2,
            windows_retained_count: 1,
            remaining_windows_domain_count: 1,
            remaining_windows_authority_count: 1,
            remaining_windows_domains: ['mailbox'],
            remaining_windows_authorities: ['windows.mailbox'],
            next_action: 'continue_authority_transfer',
          },
        });
      }
      if (body.operation === 'repository_publication.cloudflare_execution.readiness') {
        return responseJson(200, {
          schema: 'narada.sonar.cloudflare_github_repository_publication_readiness.v1',
          status: 'ok',
          site_id: 'site_alpha',
          readiness_status: 'not_ready',
          github_token_secret_ref: 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN',
          cloudflare_git_push_admission: 'not_admitted',
          github_token_configured: true,
          requested_repository_allowed: true,
          requested_branch_allowed: true,
        });
      }
      throw new Error(`unexpected_operation:${body.operation}:${body.request_id}`);
    },
  });

  assert.equal(result.status, 'incomplete');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.match(result.incomplete_reasons.join(','), /repository_publication_cloudflare_github_not_ready/);
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
