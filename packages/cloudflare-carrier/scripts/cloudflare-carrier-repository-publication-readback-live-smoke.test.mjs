import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatRepositoryPublicationReadbackLiveSmokeText,
  parseRepositoryPublicationReadbackLiveSmokeArgs,
  runRepositoryPublicationReadbackLiveSmoke,
} from './cloudflare-carrier-repository-publication-readback-live-smoke.mjs';

test('parseRepositoryPublicationReadbackLiveSmokeArgs builds cloudflare lane config with operator session auth', () => {
  const parsed = parseRepositoryPublicationReadbackLiveSmokeArgs([
    '--url', 'https://carrier.example.test/',
    '--format', 'text',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--repository-publication-request-id', 'repository-publication-request-1',
    '--repository-publication-execution-id', 'cloudflare-execution-1',
    '--operation-id', 'operation-1',
    '--lane', 'cloudflare',
    '--limit', '25',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.siteId, 'site_alpha');
  assert.equal(parsed.repositoryPublicationRequestId, 'repository-publication-request-1');
  assert.equal(parsed.repositoryPublicationExecutionId, 'cloudflare-execution-1');
  assert.equal(parsed.operationId, 'operation-1');
  assert.equal(parsed.lane, 'cloudflare');
  assert.equal(parsed.limit, 25);
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
});

test('formatRepositoryPublicationReadbackLiveSmokeText emits focused downstream reads', () => {
  const text = formatRepositoryPublicationReadbackLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    lane: 'cloudflare',
    repository_publication_request_id: 'repository-publication-request-1',
    repository_publication_admission_id: 'repository-publication-admission-1',
    repository_publication_execution_id: 'cloudflare-execution-1',
    repository_publication_evidence_id: null,
    request_list_count: 1,
    admission_count: 1,
    execution_count: 1,
    evidence_count: 0,
    operation_read_summary: { operation_id: 'operation-1' },
  });

  assert.match(text, /Repository Publication Readback Smoke: ok/);
  assert.match(text, /Lane: cloudflare/);
  assert.match(text, /Request Review: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:request:review:text/);
  assert.match(text, /Admission Read: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:admission:list:text/);
  assert.match(text, /Execution Read: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:cloudflare-execution:list:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('formatRepositoryPublicationReadbackLiveSmokeText suppresses admission read without a real admission id', () => {
  const text = formatRepositoryPublicationReadbackLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    lane: 'cloudflare',
    repository_publication_request_id: 'repository-publication-request-1',
    repository_publication_admission_id: null,
    repository_publication_execution_id: null,
    repository_publication_evidence_id: null,
    request_list_count: 1,
    admission_count: 0,
    execution_count: 0,
    evidence_count: 0,
    operation_read_summary: { operation_id: 'operation-1' },
  });

  assert.doesNotMatch(text, /Admission Read:/);
  assert.doesNotMatch(text, /<repository-publication-admission-id>/);
});

test('parseRepositoryPublicationReadbackLiveSmokeArgs refuses missing required inputs', () => {
  assert.throws(
    () => parseRepositoryPublicationReadbackLiveSmokeArgs(['--site', 'site_alpha', '--repository-publication-request-id', 'repository-publication-request-1'], {}, { loadLocalEnv: false }),
    /repository_publication_readback_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseRepositoryPublicationReadbackLiveSmokeArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--repository-publication-request-id', 'repository-publication-request-1'], {}, { loadLocalEnv: false }),
    /repository_publication_readback_live_smoke_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseRepositoryPublicationReadbackLiveSmokeArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha'], {}, { loadLocalEnv: false }),
    /repository_publication_readback_live_smoke_requires_--repository-publication-request-id_or_CLOUDFLARE_REPOSITORY_PUBLICATION_READBACK_REQUEST_ID/,
  );
  assert.throws(
    () => parseRepositoryPublicationReadbackLiveSmokeArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--repository-publication-request-id', 'repository-publication-request-1', '--lane', 'unknown'], {}, { loadLocalEnv: false }),
    /repository_publication_readback_live_smoke_lane_unsupported:unknown/,
  );
});

test('runRepositoryPublicationReadbackLiveSmoke verifies cloudflare lane through readback surfaces', async () => {
  const calls = [];
  const result = await runRepositoryPublicationReadbackLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    siteId: 'site_alpha',
    repositoryPublicationRequestId: 'repository-publication-request-1',
    repositoryPublicationAdmissionId: 'repository-publication-admission-1',
    repositoryPublicationExecutionId: 'cloudflare-execution-1',
    repositoryPublicationEvidenceId: null,
    operationId: 'operation-1',
    lane: 'cloudflare',
    limit: 10,
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
  }, async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body, headers: init.headers });
    return responseJson(200, responseFor(body.operation, body.params));
  });

  assert.equal(calls[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(calls[0].headers.authorization, 'Bearer secret-token');
  assert.equal(result.status, 'ok');
  assert.equal(result.repository_publication_execution_id, 'cloudflare-execution-1');
  assert.equal(result.execution_list_summary.direct_cloudflare_repository_mutation_admission, 'admitted_by_cloudflare_github_repository_publication');
  assert.equal(result.operation_read_summary.operation_id, 'operation-1');
});

function responseFor(operation, params) {
  switch (operation) {
    case 'repository_publication.request.list':
      return {
        ok: true,
        status: 'ok',
        site_id: params.site_id,
        repository_publication_request_authority: 'cloudflare_repository_publication_request_queue',
        repository_publication_executor_authority: 'windows_repository_publication_executor',
        repository_publication_admission: 'pending_windows_publication_admission',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
        authority_partition: 'cloudflare_queues_governed_repository_publication_request_windows_admits_publishes_and_returns_evidence',
        requests: [{
          repository_publication_request_id: 'repository-publication-request-1',
          operation_id: 'operation-1',
          publication_ref: 'publication:site-alpha:v1',
          repository_ref: 'github:andrey/site-alpha',
          branch_ref: 'cloudflare-publication',
          source_change_ref: 'git:commit:1234',
        }],
      };
    case 'repository_publication.admission.list':
      return {
        ok: true,
        status: 'ok',
        site_id: params.site_id,
        repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
        repository_publication_executor_authority: 'windows_repository_publication_executor',
        repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
        authority_partition: 'cloudflare_admits_repository_publication_windows_executes_and_returns_evidence',
        admissions: [{
          repository_publication_admission_id: 'repository-publication-admission-1',
          repository_publication_request_id: 'repository-publication-request-1',
          admission_action: 'admit',
          admission_reason: 'ok',
          repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
        }],
      };
    case 'repository_publication.evidence.list':
      return {
        ok: true,
        status: 'ok',
        site_id: params.site_id,
        repository_publication_evidence_authority: 'windows_repository_publication_executor',
        repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
        cloudflare_evidence_store_authority: 'cloudflare_repository_publication_evidence_store',
        repository_publication_admission: 'resolved_after_cloudflare_repository_publication_admission',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
        authority_partition: 'cloudflare_admits_repository_publication_windows_executes_and_cloudflare_records_evidence',
        evidence: [],
      };
    case 'repository_publication.cloudflare_execution.list':
      return {
        ok: true,
        status: 'ok',
        site_id: params.site_id,
        repository_publication_executor_authority: 'cloudflare_github_repository_publication_executor',
        repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
        repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'admitted_by_cloudflare_github_repository_publication',
        authority_partition: 'cloudflare_admits_and_executes_github_repository_publication',
        executions: [{
          repository_publication_execution_id: 'cloudflare-execution-1',
          repository_publication_request_id: 'repository-publication-request-1',
          publication_status: 'completed',
          repository_ref: 'github:andrey/site-alpha',
          branch_ref: 'cloudflare-publication',
          published_commit_ref: 'git:commit:1234',
          github_http_status: 200,
          direct_cloudflare_repository_mutation_admission: 'admitted_by_cloudflare_github_repository_publication',
        }],
      };
    case 'repository_publication.request.next':
      return {
        ok: true,
        status: 'drained',
        site_id: params.site_id,
        repository_publication_request_authority: 'not_observed',
        repository_publication_dispatch_authority: 'not_observed',
        repository_publication_executor_authority: 'not_observed',
        repository_publication_admission_authority: 'not_observed',
        repository_publication_admission: 'not_observed',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
        authority_partition: 'cloudflare_admits_repository_publication_windows_executes_and_returns_evidence',
        pending_unadmitted_count: 0,
        request: null,
      };
    case 'operation.read':
      return {
        ok: true,
        operation: { operation_id: 'operation-1', site_id: params.site_id, status: 'active' },
        operation_status_history: { current_status: 'active', transition_count: 1, latest_transition: null },
        operation_lifecycle_status: { phase: 'execute', health: 'ok', next_action: 'monitor', session_count: 0, task_count: 0 },
        repository_publication_executions: [{
          repository_publication_execution_id: 'cloudflare-execution-1',
          repository_publication_request_id: 'repository-publication-request-1',
        }],
        repository_publication_evidence: [],
      };
    default:
      throw new Error(`unexpected operation ${operation}`);
  }
}

function responseJson(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
