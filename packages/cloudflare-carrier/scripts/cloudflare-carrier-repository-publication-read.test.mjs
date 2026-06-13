import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatRepositoryPublicationReadText,
  parseRepositoryPublicationReadArgs,
  readRepositoryPublicationSurface,
  summarizeRepositoryPublicationSurface,
} from './cloudflare-carrier-repository-publication-read.mjs';

test('parseRepositoryPublicationReadArgs builds request list payload', () => {
  const parsed = parseRepositoryPublicationReadArgs([
    '--operation', 'repository_publication.request.list',
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--limit', '7',
    '--request-id', 'request_repository_publication_read_1',
    '--format', 'text',
  ]);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.operation, 'repository_publication.request.list');
  assert.equal(parsed.requestId, 'request_repository_publication_read_1');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    limit: 7,
    repository_publication_request_limit: 7,
  });
});

test('parseRepositoryPublicationReadArgs supports operator session auth and request filter', () => {
  const parsed = parseRepositoryPublicationReadArgs([
    '--operation', 'repository_publication.cloudflare_execution.list',
    '--url', 'https://carrier.example.test',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--repository-publication-request-id', 'repository-publication-request-1',
  ], {}, () => 99);

  assert.equal(parsed.requestId, 'repository_publication_read_repository_publication_cloudflare_execution_list_repository-publication-request-1');
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    repository_publication_request_id: 'repository-publication-request-1',
  });
});

test('parseRepositoryPublicationReadArgs supports focused evidence id with widened default limit', () => {
  const parsed = parseRepositoryPublicationReadArgs([
    '--operation', 'repository_publication.evidence.list',
    '--url', 'https://carrier.example.test',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--repository-publication-evidence-id', 'repository-publication-evidence-7',
  ], {}, () => 42);

  assert.equal(parsed.requestId, 'repository_publication_read_repository_publication_evidence_list_repository-publication-evidence-7');
  assert.equal(parsed.focusEvidenceId, 'repository-publication-evidence-7');
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    limit: 500,
    repository_publication_evidence_limit: 500,
  });
});

test('parseRepositoryPublicationReadArgs refuses missing required inputs and unsupported operation', () => {
  assert.throws(
    () => parseRepositoryPublicationReadArgs(['--operation', 'repository_publication.request.list', '--token', 'token', '--site', 'site_alpha']),
    /repository_publication_read_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseRepositoryPublicationReadArgs(['--operation', 'repository_publication.request.list', '--url', 'https://carrier.example.test', '--token', 'token']),
    /repository_publication_read_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseRepositoryPublicationReadArgs(['--operation', 'repository_publication.unknown', '--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha']),
    /repository_publication_read_operation_unsupported:repository_publication.unknown/,
  );
  assert.throws(
    () => parseRepositoryPublicationReadArgs(['--operation', 'repository_publication.request.list', '--url', 'https://carrier.example.test', '--site', 'site_alpha']),
    /repository_publication_read_requires_bearer_token_or_operator_session/,
  );
});

test('readRepositoryPublicationSurface posts request.next envelope and summarizes selection', async () => {
  const requests = [];
  const result = await readRepositoryPublicationSurface({
    workerUrl: 'https://carrier.example.test',
    operation: 'repository_publication.request.next',
    requestId: 'request_repository_publication_read_2',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: { site_id: 'site_alpha', limit: 1, repository_publication_request_limit: 1 },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return responseJson(200, {
      ok: true,
      schema: 'narada.sonar.cloudflare_repository_publication_request.v1',
      status: 'selected',
      site_id: 'site_alpha',
      repository_publication_request_authority: 'cloudflare_repository_publication_request_queue',
      repository_publication_dispatch_authority: 'cloudflare_repository_publication_request_queue',
      repository_publication_executor_authority: 'windows_repository_publication_executor',
      repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
      repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
      cloudflare_git_push_admission: 'not_admitted',
      direct_cloudflare_repository_mutation_admission: 'not_admitted',
      authority_partition: 'cloudflare_admits_repository_publication_windows_executes_and_returns_evidence',
      pending_unadmitted_count: 2,
      admission: {
        repository_publication_admission_id: 'repository-publication-admission-1',
        admission_action: 'admit',
      },
      request: {
        repository_publication_request_id: 'repository-publication-request-1',
        publication_ref: 'publication:site-alpha:v1',
        repository_ref: 'github:andrey/site-alpha',
        branch_ref: 'main',
        source_change_ref: 'git:commit:1234',
      },
    });
  });

  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.headers.authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    operation: 'repository_publication.request.next',
    request_id: 'request_repository_publication_read_2',
    params: {
      site_id: 'site_alpha',
      limit: 1,
      repository_publication_request_limit: 1,
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.repository_publication_read.v1');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.equal(result.summary.repository_publication_request_id, 'repository-publication-request-1');
  assert.equal(result.summary.pending_unadmitted_count, 2);
});

test('readRepositoryPublicationSurface posts evidence list envelope and summarizes latest evidence', async () => {
  const requests = [];
  const result = await readRepositoryPublicationSurface({
    workerUrl: 'https://carrier.example.test',
    operation: 'repository_publication.evidence.list',
    requestId: 'request_repository_publication_read_3',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      repository_publication_request_id: 'repository-publication-request-1',
      limit: 5,
      repository_publication_evidence_limit: 5,
    },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return responseJson(200, {
      ok: true,
      schema: 'narada.sonar.cloudflare_repository_publication_evidence.v1',
      status: 'ok',
      site_id: 'site_alpha',
      repository_publication_evidence_authority: 'windows_repository_publication_executor',
      repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
      cloudflare_evidence_store_authority: 'cloudflare_repository_publication_evidence_store',
      repository_publication_admission: 'resolved_after_cloudflare_repository_publication_admission',
      cloudflare_git_push_admission: 'not_admitted',
      direct_cloudflare_repository_mutation_admission: 'not_admitted',
      authority_partition: 'cloudflare_admits_repository_publication_windows_executes_and_cloudflare_records_evidence',
      evidence: [{
        repository_publication_evidence_id: 'repository-publication-evidence-1',
        repository_publication_request_id: 'repository-publication-request-1',
        publication_execution_id: 'publication-execution-1',
        publication_status: 'completed',
        published_commit_ref: 'git:commit:123456',
      }],
    });
  });

  assert.deepEqual(JSON.parse(requests[0].init.body), {
    operation: 'repository_publication.evidence.list',
    request_id: 'request_repository_publication_read_3',
    params: {
      site_id: 'site_alpha',
      repository_publication_request_id: 'repository-publication-request-1',
      limit: 5,
      repository_publication_evidence_limit: 5,
    },
  });
  assert.equal(result.summary.latest_repository_publication_evidence_id, 'repository-publication-evidence-1');
  assert.equal(result.summary.latest_published_commit_ref, 'git:commit:123456');
});

test('readRepositoryPublicationSurface refuses focused evidence id that is not present', async () => {
  await assert.rejects(
    readRepositoryPublicationSurface({
      workerUrl: 'https://carrier.example.test',
      operation: 'repository_publication.evidence.list',
      requestId: 'request_repository_publication_read_missing_evidence',
      auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
      params: {
        site_id: 'site_alpha',
        limit: 500,
        repository_publication_evidence_limit: 500,
      },
      focusEvidenceId: 'repository-publication-evidence-missing',
    }, async () => responseJson(200, {
      ok: true,
      status: 'ok',
      site_id: 'site_alpha',
      evidence: [{
        repository_publication_evidence_id: 'repository-publication-evidence-1',
        repository_publication_request_id: 'repository-publication-request-1',
      }],
    })),
    /repository_publication_evidence_read_focus_not_found:repository-publication-evidence-missing/,
  );
});

test('summarizeRepositoryPublicationSurface narrows evidence summary to focused evidence id', () => {
  const summary = summarizeRepositoryPublicationSurface('repository_publication.evidence.list', {
    ok: true,
    status: 'ok',
    site_id: 'site_alpha',
    evidence: [
      {
        repository_publication_evidence_id: 'repository-publication-evidence-2',
        repository_publication_request_id: 'repository-publication-request-2',
        publication_execution_id: 'publication-execution-2',
        publication_status: 'completed',
        published_commit_ref: 'git:commit:2222',
      },
      {
        repository_publication_evidence_id: 'repository-publication-evidence-1',
        repository_publication_request_id: 'repository-publication-request-1',
        publication_execution_id: 'publication-execution-1',
        publication_status: 'completed',
        published_commit_ref: 'git:commit:1111',
      },
    ],
  }, {
    site_id: 'site_alpha',
  }, {
    focusEvidenceId: 'repository-publication-evidence-1',
  });

  assert.equal(summary.evidence_count, 1);
  assert.equal(summary.focused_repository_publication_evidence_id, 'repository-publication-evidence-1');
  assert.equal(summary.latest_repository_publication_evidence_id, 'repository-publication-evidence-1');
  assert.equal(summary.latest_published_commit_ref, 'git:commit:1111');
});

test('summaries and text output preserve refusal evidence for filtered execution list', () => {
  const summary = summarizeRepositoryPublicationSurface('repository_publication.cloudflare_execution.list', {
    ok: false,
    code: 'site_authority_denied',
  }, {
    site_id: 'site_alpha',
    repository_publication_request_id: 'repository-publication-request-1',
  });

  assert.equal(summary.code, 'site_authority_denied');
  const text = formatRepositoryPublicationReadText({
    status: 'refused',
    operation: 'repository_publication.cloudflare_execution.list',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    params: { site_id: 'site_alpha' },
    summary,
  });
  assert.match(text, /Repository Publication Read: Cloudflare Execution List refused/);
  assert.match(text, /Request: repository-publication-request-1/);
});

function responseJson(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
