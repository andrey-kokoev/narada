import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCloudflareRepositoryPublicationRequest,
  formatRepositoryPublicationRequestText,
  parseRepositoryPublicationRequestArgs,
  summarizeRepositoryPublicationRequest,
} from './cloudflare-carrier-repository-publication-request.mjs';

test('parseRepositoryPublicationRequestArgs builds governed publication request payload', () => {
  const parsed = parseRepositoryPublicationRequestArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--repository-publication-request-id', 'repository-publication-request-1',
    '--operation-id', 'operation_alpha',
    '--task-id', 'cloudflare-task-12',
    '--generated-at', '2026-06-12T02:00:00.000Z',
    '--publication-ref', 'publication:site-alpha:v1',
    '--action-ref', 'repository-publication:release:v1',
    '--summary', 'publish governed repository state from windows evidence',
    '--repository-ref', 'github:andrey/site-alpha',
    '--branch-ref', 'refs/heads/main',
    '--source-change-ref', 'git:commit:1234567890abcdef1234567890abcdef12345678',
    '--contract-ref', 'contract:repository-publication-request:v1',
    '--evidence-contract-ref', 'contract:repository-publication-evidence:v1',
    '--rollback-ref', 'rollback:repository-publication:v1',
    '--request-id', 'request_repository_publication_1',
    '--format', 'text',
  ], {}, () => 1234);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_repository_publication_1');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    repository_publication_request_id: 'repository-publication-request-1',
    source_payload: {
      generated_at: '2026-06-12T02:00:00.000Z',
      operation_id: 'operation_alpha',
      task_id: 'cloudflare-task-12',
      publication_ref: 'publication:site-alpha:v1',
      requested_action_ref: 'repository-publication:release:v1',
      requested_action_summary: 'publish governed repository state from windows evidence',
      repository_ref: 'github:andrey/site-alpha',
      branch_ref: 'refs/heads/main',
      source_change_ref: 'git:commit:1234567890abcdef1234567890abcdef12345678',
      governed_request_contract_ref: 'contract:repository-publication-request:v1',
      evidence_return_contract_ref: 'contract:repository-publication-evidence:v1',
      rollback_plan_ref: 'rollback:repository-publication:v1',
      repository_publication_admission: 'pending_windows_publication_admission',
      cloudflare_git_push_admission: 'not_admitted',
      direct_cloudflare_repository_mutation_admission: 'not_admitted',
    },
  });
});

test('parseRepositoryPublicationRequestArgs supports operator session auth and default action ref', () => {
  const parsed = parseRepositoryPublicationRequestArgs([
    '--url', 'https://carrier.example.test',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--publication-ref', 'publication:site-alpha:v2',
    '--repository-ref', 'github:andrey/site-alpha',
    '--branch-ref', 'main',
    '--source-change-ref', 'git:commit:1234567890abcdef1234567890abcdef12345678',
    '--contract-ref', 'contract:repository-publication-request:v2',
    '--evidence-contract-ref', 'contract:repository-publication-evidence:v2',
    '--rollback-ref', 'rollback:repository-publication:v2',
  ], {}, () => 99);

  assert.equal(parsed.requestId, 'repository_publication_request_publication:site-alpha:v2');
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
  assert.equal(parsed.params.source_payload.requested_action_ref, 'publication:site-alpha:v2');
});

test('parseRepositoryPublicationRequestArgs refuses missing required inputs', () => {
  assert.throws(
    () => parseRepositoryPublicationRequestArgs(['--token', 'token', '--site', 'site_alpha', '--publication-ref', 'p', '--repository-ref', 'r', '--branch-ref', 'b', '--source-change-ref', 's', '--contract-ref', 'c', '--evidence-contract-ref', 'e', '--rollback-ref', 'rb'], {}, () => 1),
    /repository_publication_request_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseRepositoryPublicationRequestArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--publication-ref', 'p', '--repository-ref', 'r', '--branch-ref', 'b', '--source-change-ref', 's', '--contract-ref', 'c', '--evidence-contract-ref', 'e', '--rollback-ref', 'rb'], {}, () => 1),
    /repository_publication_request_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseRepositoryPublicationRequestArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--repository-ref', 'r', '--branch-ref', 'b', '--source-change-ref', 's', '--contract-ref', 'c', '--evidence-contract-ref', 'e', '--rollback-ref', 'rb'], {}, () => 1),
    /repository_publication_request_requires_--publication-ref_or_CLOUDFLARE_REPOSITORY_PUBLICATION_REF/,
  );
  assert.throws(
    () => parseRepositoryPublicationRequestArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha', '--publication-ref', 'p', '--repository-ref', 'r', '--branch-ref', 'b', '--source-change-ref', 's', '--contract-ref', 'c', '--evidence-contract-ref', 'e', '--rollback-ref', 'rb'], {}, () => 1),
    /repository_publication_request_requires_bearer_token_or_operator_session/,
  );
  assert.throws(
    () => parseRepositoryPublicationRequestArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--publication-ref', 'p', '--repository-ref', 'r', '--branch-ref', 'b', '--source-change-ref', 's', '--contract-ref', 'c', '--evidence-contract-ref', 'e', '--rollback-ref', 'rb', '--format', 'yaml'], {}, () => 1),
    /repository_publication_request_format_unsupported:yaml/,
  );
});

test('createCloudflareRepositoryPublicationRequest posts the publication envelope and redacts auth', async () => {
  const requests = [];
  const result = await createCloudflareRepositoryPublicationRequest({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_repository_publication_1',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      repository_publication_request_id: 'repository-publication-request-1',
      source_payload: {
        generated_at: '2026-06-12T02:00:00.000Z',
        operation_id: 'operation_alpha',
        task_id: 'cloudflare-task-12',
        publication_ref: 'publication:site-alpha:v1',
        requested_action_ref: 'repository-publication:release:v1',
        requested_action_summary: 'publish governed repository state from windows evidence',
        repository_ref: 'github:andrey/site-alpha',
        branch_ref: 'refs/heads/main',
        source_change_ref: 'git:commit:1234567890abcdef1234567890abcdef12345678',
        governed_request_contract_ref: 'contract:repository-publication-request:v1',
        evidence_return_contract_ref: 'contract:repository-publication-evidence:v1',
        rollback_plan_ref: 'rollback:repository-publication:v1',
        repository_publication_admission: 'pending_windows_publication_admission',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
      },
    },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return responseJson(200, {
      ok: true,
      status: 'queued',
      site_id: 'site_alpha',
      repository_publication_request_authority: 'cloudflare_repository_publication_request_queue',
      repository_publication_executor_authority: 'windows_repository_publication_executor',
      repository_publication_admission: 'pending_windows_publication_admission',
      cloudflare_git_push_admission: 'not_admitted',
      direct_cloudflare_repository_mutation_admission: 'not_admitted',
      authority_partition: 'cloudflare_queues_governed_repository_publication_request_windows_admits_publishes_and_returns_evidence',
      request: {
        generated_at: '2026-06-12T02:00:00.000Z',
        operation_id: 'operation_alpha',
        task_id: 'cloudflare-task-12',
        publication_ref: 'publication:site-alpha:v1',
        requested_action_ref: 'repository-publication:release:v1',
        requested_action_summary: 'publish governed repository state from windows evidence',
        repository_ref: 'github:andrey/site-alpha',
        branch_ref: 'refs/heads/main',
        source_change_ref: 'git:commit:1234567890abcdef1234567890abcdef12345678',
        governed_request_contract_ref: 'contract:repository-publication-request:v1',
        evidence_return_contract_ref: 'contract:repository-publication-evidence:v1',
        rollback_plan_ref: 'rollback:repository-publication:v1',
        authority_locus: 'cloudflare_repository_publication_request_queue',
        repository_publication_executor_authority: 'windows_repository_publication_executor',
        repository_publication_admission: 'pending_windows_publication_admission',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
        request_posture: 'cloudflare_queued_repository_publication_request_windows_must_admit_publish_and_return_evidence',
      },
      record: {
        repository_publication_request_id: 'repository-publication-request-1',
        site_id: 'site_alpha',
        request_posture: 'cloudflare_queued_repository_publication_request_windows_must_admit_publish_and_return_evidence',
        recorded_by_principal_id: 'principal:operator',
        recorded_at: '2026-06-12T02:00:10.000Z',
      },
    });
  });

  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.headers.authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    operation: 'repository_publication.request.create',
    request_id: 'request_repository_publication_1',
    params: {
      site_id: 'site_alpha',
      repository_publication_request_id: 'repository-publication-request-1',
      source_payload: {
        generated_at: '2026-06-12T02:00:00.000Z',
        operation_id: 'operation_alpha',
        task_id: 'cloudflare-task-12',
        publication_ref: 'publication:site-alpha:v1',
        requested_action_ref: 'repository-publication:release:v1',
        requested_action_summary: 'publish governed repository state from windows evidence',
        repository_ref: 'github:andrey/site-alpha',
        branch_ref: 'refs/heads/main',
        source_change_ref: 'git:commit:1234567890abcdef1234567890abcdef12345678',
        governed_request_contract_ref: 'contract:repository-publication-request:v1',
        evidence_return_contract_ref: 'contract:repository-publication-evidence:v1',
        rollback_plan_ref: 'rollback:repository-publication:v1',
        repository_publication_admission: 'pending_windows_publication_admission',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
      },
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.repository_publication_request.v1');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.equal(result.summary.repository_publication_request_authority, 'cloudflare_repository_publication_request_queue');
  assert.equal(result.summary.request_posture, 'cloudflare_queued_repository_publication_request_windows_must_admit_publish_and_return_evidence');

  const text = formatRepositoryPublicationRequestText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: result.summary,
  });
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --task-id cloudflare-task-12 --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --task-id cloudflare-task-12 --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
});

test('summaries and text output preserve refusal evidence', () => {
  const summary = summarizeRepositoryPublicationRequest({
    ok: false,
    code: 'repository_publication_cloudflare_git_push_admission_invalid',
    cloudflare_git_push_admission: 'admitted',
  }, {
    site_id: 'site_alpha',
    source_payload: {
      publication_ref: 'publication:site-alpha:v1',
      requested_action_ref: 'repository-publication:release:v1',
      repository_ref: 'github:andrey/site-alpha',
      branch_ref: 'main',
      source_change_ref: 'git:commit:1234567890abcdef1234567890abcdef12345678',
      cloudflare_git_push_admission: 'admitted',
    },
  });

  assert.equal(summary.code, 'repository_publication_cloudflare_git_push_admission_invalid');
  assert.equal(summary.cloudflare_git_push_admission, 'admitted');
  const text = formatRepositoryPublicationRequestText({
    status: 'refused',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    params: { site_id: 'site_alpha' },
    summary,
  });
  assert.match(text, /Repository Publication Request: refused/);
  assert.match(text, /Cloudflare Git Push Admission: admitted/);
  assert.equal(text.includes('Task Review:'), false);
  assert.equal(text.includes('Task Workflow:'), false);
  assert.equal(text.includes('Operation Review:'), false);
  assert.equal(text.includes('Operation Next Workflow:'), false);
});

function responseJson(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
