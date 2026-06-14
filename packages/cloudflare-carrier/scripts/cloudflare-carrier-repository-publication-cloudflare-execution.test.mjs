import assert from 'node:assert/strict';
import test from 'node:test';

import {
  executeCloudflareRepositoryPublication,
  formatRepositoryPublicationCloudflareExecutionText,
  parseRepositoryPublicationCloudflareExecutionArgs,
  summarizeRepositoryPublicationCloudflareExecution,
} from './cloudflare-carrier-repository-publication-cloudflare-execution.mjs';

test('parseRepositoryPublicationCloudflareExecutionArgs builds execution payload', () => {
  const parsed = parseRepositoryPublicationCloudflareExecutionArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--repository-publication-request-id', 'repository-publication-request-1',
    '--repository-publication-execution-id', 'cloudflare-execution-1',
    '--generated-at', '2026-06-12T03:00:00.000Z',
    '--execute-cloudflare-github',
    '--request-id', 'request_repository_publication_cloudflare_execution_1',
    '--format', 'text',
  ], {}, () => 1234);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_repository_publication_cloudflare_execution_1');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    repository_publication_request_id: 'repository-publication-request-1',
    repository_publication_execution_id: 'cloudflare-execution-1',
    generated_at: '2026-06-12T03:00:00.000Z',
  });
});

test('parseRepositoryPublicationCloudflareExecutionArgs supports operator session auth', () => {
  const parsed = parseRepositoryPublicationCloudflareExecutionArgs([
    '--url', 'https://carrier.example.test',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--repository-publication-request-id', 'repository-publication-request-1',
    '--execute-cloudflare-github',
  ], {}, () => 99);

  assert.equal(parsed.requestId, 'repository_publication_cloudflare_execution_repository-publication-request-1');
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
});

test('parseRepositoryPublicationCloudflareExecutionArgs refuses missing acknowledgement and required inputs', () => {
  assert.throws(
    () => parseRepositoryPublicationCloudflareExecutionArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--repository-publication-request-id', 'repository-publication-request-1'], {}, () => 1),
    /repository_publication_cloudflare_execution_requires_--execute-cloudflare-github_or_CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTE_CLOUDFLARE_GITHUB=1/,
  );
  assert.throws(
    () => parseRepositoryPublicationCloudflareExecutionArgs(['--token', 'token', '--site', 'site_alpha', '--repository-publication-request-id', 'repository-publication-request-1', '--execute-cloudflare-github'], {}, () => 1),
    /repository_publication_cloudflare_execution_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseRepositoryPublicationCloudflareExecutionArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--execute-cloudflare-github'], {}, () => 1),
    /repository_publication_cloudflare_execution_requires_--repository-publication-request-id_or_CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTION_REQUEST_ID/,
  );
});

test('executeCloudflareRepositoryPublication posts the execution envelope and redacts auth', async () => {
  const requests = [];
  const result = await executeCloudflareRepositoryPublication({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_repository_publication_cloudflare_execution_1',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      repository_publication_request_id: 'repository-publication-request-1',
      repository_publication_execution_id: 'cloudflare-execution-1',
      generated_at: '2026-06-12T03:00:00.000Z',
    },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return responseJson(200, {
      ok: true,
      schema: 'narada.sonar.cloudflare_github_repository_publication_execution.v1',
      status: 'execution_recorded',
      site_id: 'site_alpha',
      repository_publication_executor_authority: 'cloudflare_github_repository_publication_executor',
      repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
      repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
      cloudflare_git_push_admission: 'not_admitted',
      direct_cloudflare_repository_mutation_admission: 'admitted_by_cloudflare_github_repository_publication',
      publication_status: 'completed',
      authority_partition: 'cloudflare_admits_and_executes_github_repository_publication',
      execution: {
        repository_publication_execution_id: 'cloudflare-execution-1',
        repository_publication_request_id: 'repository-publication-request-1',
        publication_ref: 'publication:site-alpha:v1',
        requested_action_ref: 'repository-publication:release:v1',
        repository_ref: 'github:andrey/site-alpha',
        branch_ref: 'cloudflare-publication',
        source_change_ref: 'git:commit:1234567890abcdef1234567890abcdef12345678',
        publication_status: 'completed',
        repository_publication_executor_authority: 'cloudflare_github_repository_publication_executor',
        github_credential_mode: 'github_app_installation',
        repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
        repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
        cloudflare_repository_publication_admission_id: 'repository-publication-admission-1',
        cloudflare_repository_publication_admission_action: 'admit',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'admitted_by_cloudflare_github_repository_publication',
        published_commit_ref: 'git:commit:1234567890abcdef1234567890abcdef12345678',
        github_http_status: 200,
        github_response_summary: {
          github_operation: 'update_ref',
          ref: 'refs/heads/cloudflare-publication',
          object_sha: '1234567890abcdef1234567890abcdef12345678',
          object_type: 'commit',
          message: null,
        },
        rollback_evidence_ref: 'rollback:github-ref:github:andrey/site-alpha:cloudflare-publication',
        execution_posture: 'cloudflare_admitted_and_executed_github_repository_publication',
      },
      request: {
        publication_ref: 'publication:site-alpha:v1',
        requested_action_ref: 'repository-publication:release:v1',
        repository_ref: 'github:andrey/site-alpha',
        branch_ref: 'cloudflare-publication',
        source_change_ref: 'git:commit:1234567890abcdef1234567890abcdef12345678',
      },
      admission: {
        repository_publication_admission_id: 'repository-publication-admission-1',
        admission_action: 'admit',
      },
    });
  });

  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.headers.authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    operation: 'repository_publication.cloudflare_execution.execute',
    request_id: 'request_repository_publication_cloudflare_execution_1',
    params: {
      site_id: 'site_alpha',
      repository_publication_request_id: 'repository-publication-request-1',
      repository_publication_execution_id: 'cloudflare-execution-1',
      generated_at: '2026-06-12T03:00:00.000Z',
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.repository_publication_cloudflare_execution.v1');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.equal(result.summary.publication_status, 'completed');
  assert.equal(result.summary.direct_cloudflare_repository_mutation_admission, 'admitted_by_cloudflare_github_repository_publication');
});

test('summaries and text output preserve execution refusal evidence', () => {
  const summary = summarizeRepositoryPublicationCloudflareExecution({
    ok: false,
    code: 'cloudflare_repository_publication_execution_admission_required',
  }, {
    site_id: 'site_alpha',
    repository_publication_request_id: 'repository-publication-request-1',
  });

  assert.equal(summary.code, 'cloudflare_repository_publication_execution_admission_required');
  const text = formatRepositoryPublicationCloudflareExecutionText({
    status: 'refused',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    params: { site_id: 'site_alpha' },
    summary,
  });
  assert.match(text, /Repository Publication Cloudflare Execution: refused/);
  assert.match(text, /Request: repository-publication-request-1/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Request Review: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:request:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --repository-publication-request-id repository-publication-request-1 --operator-session-file <operator-session-file>/);
});

test('formatRepositoryPublicationCloudflareExecutionText suppresses site continuation without a real worker url', () => {
  const text = formatRepositoryPublicationCloudflareExecutionText({
    status: 'refused',
    auth_source: 'flag:--token',
    params: { site_id: 'site_alpha' },
    summary: {
      ok: false,
      code: 'cloudflare_repository_publication_execution_admission_required',
      site_id: 'site_alpha',
      repository_publication_request_id: 'repository-publication-request-1',
    },
  });

  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Posture Coherence Review:/);
  assert.doesNotMatch(text, /Durability Coherence Review:/);
  assert.doesNotMatch(text, /Request Review:/);
  assert.doesNotMatch(text, /<worker-url>/);
});

function responseJson(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
