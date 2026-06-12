import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatRepositoryPublicationEvidenceText,
  parseRepositoryPublicationEvidenceArgs,
  putCloudflareRepositoryPublicationEvidence,
  summarizeRepositoryPublicationEvidence,
} from './cloudflare-carrier-repository-publication-evidence.mjs';

test('parseRepositoryPublicationEvidenceArgs builds admitted publication evidence payload', () => {
  const parsed = parseRepositoryPublicationEvidenceArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--repository-publication-evidence-id', 'repository-publication-evidence-1',
    '--repository-publication-request-id', 'repository-publication-request-1',
    '--publication-execution-id', 'publication-execution-1',
    '--generated-at', '2026-06-12T02:20:00.000Z',
    '--publication-ref', 'publication:site-alpha:v1',
    '--action-ref', 'repository-publication:release:v1',
    '--repository-ref', 'github:andrey/site-alpha',
    '--branch-ref', 'main',
    '--source-change-ref', 'git:commit:1234567890abcdef1234567890abcdef12345678',
    '--windows-admission-action', 'admit',
    '--windows-admission-reason', 'windows_repository_publication_completed',
    '--publication-status', 'completed',
    '--published-commit-ref', 'git:commit:abcdefabcdefabcdefabcdefabcdefabcdefabcd',
    '--rollback-evidence-ref', 'rollback:repository-publication:v1',
    '--request-id', 'request_repository_publication_evidence_1',
    '--format', 'text',
  ], {}, () => 1234);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_repository_publication_evidence_1');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    repository_publication_evidence_id: 'repository-publication-evidence-1',
    source_payload: {
      generated_at: '2026-06-12T02:20:00.000Z',
      repository_publication_request_id: 'repository-publication-request-1',
      publication_execution_id: 'publication-execution-1',
      publication_ref: 'publication:site-alpha:v1',
      requested_action_ref: 'repository-publication:release:v1',
      repository_ref: 'github:andrey/site-alpha',
      branch_ref: 'main',
      source_change_ref: 'git:commit:1234567890abcdef1234567890abcdef12345678',
      windows_admission_action: 'admit',
      windows_admission_reason: 'windows_repository_publication_completed',
      publication_status: 'completed',
      repository_publication_executor_authority: 'windows_repository_publication_executor',
      published_commit_ref: 'git:commit:abcdefabcdefabcdefabcdefabcdefabcdefabcd',
      rollback_evidence_ref: 'rollback:repository-publication:v1',
      cloudflare_git_push_admission: 'not_admitted',
      direct_cloudflare_repository_mutation_admission: 'not_admitted',
    },
  });
});

test('parseRepositoryPublicationEvidenceArgs supports refuse action without published commit', () => {
  const parsed = parseRepositoryPublicationEvidenceArgs([
    '--url', 'https://carrier.example.test',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--repository-publication-request-id', 'repository-publication-request-1',
    '--publication-execution-id', 'publication-execution-2',
    '--repository-ref', 'github:andrey/site-alpha',
    '--branch-ref', 'main',
    '--source-change-ref', 'git:commit:1234567890abcdef1234567890abcdef12345678',
    '--windows-admission-action', 'refuse',
    '--publication-status', 'failed',
  ], {}, () => 99);

  assert.equal(parsed.requestId, 'repository_publication_evidence_publication-execution-2');
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
  assert.equal(parsed.params.source_payload.publication_status, 'failed');
  assert.equal('published_commit_ref' in parsed.params.source_payload, false);
});

test('parseRepositoryPublicationEvidenceArgs refuses invalid combinations', () => {
  assert.throws(
    () => parseRepositoryPublicationEvidenceArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--repository-publication-request-id', 'repository-publication-request-1', '--repository-ref', 'github:andrey/site-alpha', '--branch-ref', 'main', '--source-change-ref', 'git:commit:1234567890abcdef1234567890abcdef12345678'], {}, () => 1),
    /repository_publication_evidence_requires_--publication-execution-id_or_CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_EXECUTION_ID/,
  );
  assert.throws(
    () => parseRepositoryPublicationEvidenceArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--repository-publication-request-id', 'repository-publication-request-1', '--publication-execution-id', 'publication-execution-1', '--repository-ref', 'github:andrey/site-alpha', '--branch-ref', 'main', '--source-change-ref', 'git:commit:1234567890abcdef1234567890abcdef12345678', '--windows-admission-action', 'admit', '--publication-status', 'failed'], {}, () => 1),
    /repository_publication_evidence_admitted_status_invalid:failed/,
  );
  assert.throws(
    () => parseRepositoryPublicationEvidenceArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--repository-publication-request-id', 'repository-publication-request-1', '--publication-execution-id', 'publication-execution-1', '--repository-ref', 'github:andrey/site-alpha', '--branch-ref', 'main', '--source-change-ref', 'git:commit:1234567890abcdef1234567890abcdef12345678', '--windows-admission-action', 'admit'], {}, () => 1),
    /repository_publication_evidence_requires_--published-commit-ref_for_admit/,
  );
});

test('putCloudflareRepositoryPublicationEvidence posts the evidence envelope', async () => {
  const requests = [];
  const result = await putCloudflareRepositoryPublicationEvidence({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_repository_publication_evidence_1',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      repository_publication_evidence_id: 'repository-publication-evidence-1',
      source_payload: {
        generated_at: '2026-06-12T02:20:00.000Z',
        repository_publication_request_id: 'repository-publication-request-1',
        publication_execution_id: 'publication-execution-1',
        publication_ref: 'publication:site-alpha:v1',
        requested_action_ref: 'repository-publication:release:v1',
        repository_ref: 'github:andrey/site-alpha',
        branch_ref: 'main',
        source_change_ref: 'git:commit:1234567890abcdef1234567890abcdef12345678',
        windows_admission_action: 'admit',
        windows_admission_reason: 'windows_repository_publication_completed',
        publication_status: 'completed',
        repository_publication_executor_authority: 'windows_repository_publication_executor',
        published_commit_ref: 'git:commit:abcdefabcdefabcdefabcdefabcdefabcdefabcd',
        rollback_evidence_ref: 'rollback:repository-publication:v1',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
      },
    },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return responseJson(200, {
      ok: true,
      status: 'recorded',
      site_id: 'site_alpha',
      repository_publication_evidence_authority: 'windows_repository_publication_executor',
      repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
      cloudflare_evidence_store_authority: 'cloudflare_repository_publication_evidence_store',
      repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
      cloudflare_repository_publication_admission_id: 'repository-publication-admission-1',
      cloudflare_repository_publication_admission_action: 'admit',
      cloudflare_git_push_admission: 'not_admitted',
      direct_cloudflare_repository_mutation_admission: 'not_admitted',
      authority_partition: 'cloudflare_admits_repository_publication_windows_executes_and_cloudflare_records_evidence',
      evidence: {
        generated_at: '2026-06-12T02:20:00.000Z',
        repository_publication_request_id: 'repository-publication-request-1',
        publication_execution_id: 'publication-execution-1',
        publication_ref: 'publication:site-alpha:v1',
        requested_action_ref: 'repository-publication:release:v1',
        repository_ref: 'github:andrey/site-alpha',
        branch_ref: 'main',
        source_change_ref: 'git:commit:1234567890abcdef1234567890abcdef12345678',
        windows_admission_action: 'admit',
        windows_admission_reason: 'windows_repository_publication_completed',
        publication_status: 'completed',
        repository_publication_executor_authority: 'windows_repository_publication_executor',
        published_commit_ref: 'git:commit:abcdefabcdefabcdefabcdefabcdefabcdefabcd',
        rollback_evidence_ref: 'rollback:repository-publication:v1',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
        evidence_posture: 'windows_repository_publication_resolved_cloudflare_recorded_evidence',
      },
      record: {
        repository_publication_evidence_id: 'repository-publication-evidence-1',
        repository_publication_executor_authority: 'windows_repository_publication_executor',
        cloudflare_repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
        recorded_by_principal_id: 'principal:operator',
        recorded_at: '2026-06-12T02:20:10.000Z',
      },
    });
  });

  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.headers.authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    operation: 'repository_publication.evidence.put',
    request_id: 'request_repository_publication_evidence_1',
    params: {
      site_id: 'site_alpha',
      repository_publication_evidence_id: 'repository-publication-evidence-1',
      source_payload: {
        generated_at: '2026-06-12T02:20:00.000Z',
        repository_publication_request_id: 'repository-publication-request-1',
        publication_execution_id: 'publication-execution-1',
        publication_ref: 'publication:site-alpha:v1',
        requested_action_ref: 'repository-publication:release:v1',
        repository_ref: 'github:andrey/site-alpha',
        branch_ref: 'main',
        source_change_ref: 'git:commit:1234567890abcdef1234567890abcdef12345678',
        windows_admission_action: 'admit',
        windows_admission_reason: 'windows_repository_publication_completed',
        publication_status: 'completed',
        repository_publication_executor_authority: 'windows_repository_publication_executor',
        published_commit_ref: 'git:commit:abcdefabcdefabcdefabcdefabcdefabcdefabcd',
        rollback_evidence_ref: 'rollback:repository-publication:v1',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
      },
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.repository_publication_evidence.v1');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.equal(result.summary.cloudflare_evidence_store_authority, 'cloudflare_repository_publication_evidence_store');
});

test('summaries and text output preserve refusal evidence', () => {
  const summary = summarizeRepositoryPublicationEvidence({
    ok: false,
    code: 'repository_publication_evidence_cloudflare_admission_required',
  }, {
    site_id: 'site_alpha',
    source_payload: {
      repository_publication_request_id: 'repository-publication-request-1',
      publication_execution_id: 'publication-execution-1',
      repository_ref: 'github:andrey/site-alpha',
      branch_ref: 'main',
      source_change_ref: 'git:commit:1234567890abcdef1234567890abcdef12345678',
      windows_admission_action: 'admit',
      publication_status: 'completed',
      published_commit_ref: 'git:commit:abcdefabcdefabcdefabcdefabcdefabcdefabcd',
      cloudflare_git_push_admission: 'not_admitted',
      direct_cloudflare_repository_mutation_admission: 'not_admitted',
    },
  });

  assert.equal(summary.code, 'repository_publication_evidence_cloudflare_admission_required');
  const text = formatRepositoryPublicationEvidenceText({
    status: 'refused',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    params: { site_id: 'site_alpha' },
    summary,
  });
  assert.match(text, /Repository Publication Evidence: refused/);
  assert.match(text, /Execution: publication-execution-1/);
});

function responseJson(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
