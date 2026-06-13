import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatAuthorityTransferText,
  parseAuthorityTransferReadArgs,
  readAuthorityTransfer,
  summarizeAuthorityTransfer,
} from './cloudflare-carrier-authority-transfer-read.mjs';

test('parseAuthorityTransferReadArgs builds authority transfer inputs', () => {
  const parsed = parseAuthorityTransferReadArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--repository-ref', 'github:andrey/site-alpha',
    '--branch-ref', 'cloudflare-publication',
    '--request-id', 'authority_transfer_read_1',
    '--format', 'text',
  ]);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'authority_transfer_read_1');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
  assert.equal(parsed.operationParams.site_id, 'site_alpha');
  assert.equal(parsed.operationParams.operation_id, 'operation_alpha');
  assert.equal(parsed.readinessParams.repository_ref, 'github:andrey/site-alpha');
  assert.equal(parsed.readinessParams.branch_ref, 'cloudflare-publication');
});

test('parseAuthorityTransferReadArgs supports operator session auth and refuses missing required inputs', () => {
  const parsed = parseAuthorityTransferReadArgs([
    '--url', 'https://carrier.example.test',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--repository-ref', 'github:andrey/site-alpha',
    '--branch-ref', 'cloudflare-publication',
  ]);
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });

  assert.throws(
    () => parseAuthorityTransferReadArgs(['--token', 'token', '--site', 'site_alpha', '--operation-id', 'operation_alpha', '--repository-ref', 'github:andrey/site-alpha', '--branch-ref', 'cloudflare-publication']),
    /authority_transfer_read_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseAuthorityTransferReadArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--repository-ref', 'github:andrey/site-alpha', '--branch-ref', 'cloudflare-publication']),
    /authority_transfer_read_requires_--operation-id_or_--carrier-operation_or_CLOUDFLARE_CARRIER_OPERATION_ID/,
  );
});

test('readAuthorityTransfer composes operation read with repository readiness and redacts auth', async () => {
  const requests = [];
  const result = await readAuthorityTransfer({
    workerUrl: 'https://carrier.example.test',
    requestId: 'authority_transfer_read_1',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    operationParams: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      mailbox_status_source_limit: 20,
      mailbox_draft_reply_proposal_limit: 20,
      mailbox_outlook_draft_create_limit: 20,
      mailbox_send_accepted_limit: 20,
      mailbox_send_confirmation_limit: 20,
      site_file_change_proposal_limit: 20,
      site_file_materialization_limit: 20,
      local_ingress_request_limit: 20,
      repository_publication_request_limit: 20,
      repository_publication_execution_limit: 20,
      repository_publication_evidence_limit: 20,
      task_lifecycle_limit: 20,
    },
    readinessParams: {
      site_id: 'site_alpha',
      repository_ref: 'github:andrey/site-alpha',
      branch_ref: 'cloudflare-publication',
    },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    const body = JSON.parse(init.body);
    if (body.operation === 'operation.read') {
      return responseJson(200, {
        operation: {
          site_id: 'site_alpha',
          operation_id: 'operation_alpha',
        },
        authority_transfer_posture: {
          transfer_complete: false,
          domain_count: 12,
          cloudflare_owned_count: 9,
          windows_retained_count: 3,
          remaining_windows_domain_count: 1,
          remaining_windows_authority_count: 1,
          remaining_windows_domains: ['mailbox'],
          remaining_windows_authorities: [{ authority: 'mailbox_send', domain: 'mailbox' }],
          next_action: 'transfer_mailbox_send_authority',
        },
        operation_product_surface: {
          mailbox_status_source_read_count: 2,
          mailbox_draft_reply_proposal_count: 3,
          mailbox_outlook_draft_create_count: 4,
          mailbox_send_accepted_count: 5,
          mailbox_send_confirmation_count: 6,
          site_file_change_proposal_count: 7,
          site_file_materialization_count: 8,
          local_ingress_request_count: 9,
          local_ingress_authority_partition: 'governed_windows',
          task_lifecycle_count: 10,
          task_lifecycle_authority_partition: 'cloudflare_task_lifecycle',
          repository_publication_request_count: 11,
          repository_publication_execution_count: 12,
          repository_publication_evidence_count: 13,
          repository_publication_authority_partition: 'cloudflare_repository_publication_executor_configured',
        },
      });
    }
    if (body.operation === 'repository_publication.cloudflare_execution.readiness') {
      return responseJson(200, {
        ok: true,
        status: 'ok',
        site_id: 'site_alpha',
        readiness_status: 'ready',
        requested_repository_ref: 'github:andrey/site-alpha',
        requested_branch_ref: 'cloudflare-publication',
        requested_repository_allowed: true,
        requested_branch_allowed: true,
        github_token_configured: true,
        cloudflare_git_push_admission: 'not_admitted',
      });
    }
    throw new Error(`unexpected operation:${body.operation}`);
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.headers.authorization, 'Bearer secret-token');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.equal(result.summary.transfer_readiness, 'incomplete');
  assert.deepEqual(result.summary.remaining_windows_domains, ['mailbox']);
  assert.equal(result.summary.slices.repository_publication.readiness_status, 'ready');
  assert.deepEqual(result.params, {
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    repository_ref: 'github:andrey/site-alpha',
    branch_ref: 'cloudflare-publication',
  });
});

test('summaries and text output preserve completion readiness and incomplete reasons', () => {
  const summary = summarizeAuthorityTransfer({
    operation: { site_id: 'site_alpha', operation_id: 'operation_alpha' },
    authority_transfer_posture: {
      transfer_complete: true,
      domain_count: 12,
      cloudflare_owned_count: 12,
      windows_retained_count: 0,
      remaining_windows_domains: [],
      remaining_windows_authorities: [],
      next_action: 'verify_full_cloudflare_authority',
    },
    operation_product_surface: {},
  }, {
    readiness_status: 'ready',
    requested_repository_ref: 'github:andrey/site-alpha',
    requested_branch_ref: 'cloudflare-publication',
    requested_repository_allowed: true,
    requested_branch_allowed: true,
    github_token_configured: true,
    cloudflare_git_push_admission: 'not_admitted',
  });

  assert.equal(summary.transfer_readiness, 'ready_for_completion_audit');
  const text = formatAuthorityTransferText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    summary,
  });
  assert.match(text, /Authority Transfer: ok/);
  assert.match(text, /Readiness: ready_for_completion_audit/);
  assert.doesNotMatch(text, /Incomplete Reason:/);
});

function responseJson(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
