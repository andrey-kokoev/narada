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

test('parseRepositoryPublicationReadArgs supports focused admission and execution ids with widened defaults', () => {
  const admissionParsed = parseRepositoryPublicationReadArgs([
    '--operation', 'repository_publication.admission.list',
    '--url', 'https://carrier.example.test',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--repository-publication-admission-id', 'repository-publication-admission-7',
  ], {}, () => 42);

  assert.equal(admissionParsed.focusAdmissionId, 'repository-publication-admission-7');
  assert.deepEqual(admissionParsed.params, {
    site_id: 'site_alpha',
    limit: 500,
    repository_publication_admission_limit: 500,
  });

  const executionParsed = parseRepositoryPublicationReadArgs([
    '--operation', 'repository_publication.cloudflare_execution.list',
    '--url', 'https://carrier.example.test',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--repository-publication-execution-id', 'repository-publication-execution-7',
  ], {}, () => 42);

  assert.equal(executionParsed.focusExecutionId, 'repository-publication-execution-7');
  assert.deepEqual(executionParsed.params, {
    site_id: 'site_alpha',
    limit: 500,
    repository_publication_execution_limit: 500,
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
        operation_id: 'operation-1',
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
  assert.equal(result.summary.operation_id, 'operation-1');
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
        windows_admission_reason: null,
        evidence_posture: 'windows_repository_publication_resolved_cloudflare_recorded_evidence',
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
  assert.equal(result.summary.latest_publication_reason, null);
  assert.equal(result.summary.latest_evidence_posture, 'windows_repository_publication_resolved_cloudflare_recorded_evidence');
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

test('readRepositoryPublicationSurface refuses focused admission id that is not present', async () => {
  await assert.rejects(
    readRepositoryPublicationSurface({
      workerUrl: 'https://carrier.example.test',
      operation: 'repository_publication.admission.list',
      requestId: 'request_repository_publication_read_missing_admission',
      auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
      params: {
        site_id: 'site_alpha',
        limit: 500,
        repository_publication_admission_limit: 500,
      },
      focusAdmissionId: 'repository-publication-admission-missing',
    }, async () => responseJson(200, {
      ok: true,
      status: 'ok',
      site_id: 'site_alpha',
      admissions: [{
        repository_publication_admission_id: 'repository-publication-admission-1',
        repository_publication_request_id: 'repository-publication-request-1',
      }],
    })),
    /repository_publication_admission_read_focus_not_found:repository-publication-admission-missing/,
  );
});

test('readRepositoryPublicationSurface refuses focused execution id that is not present', async () => {
  await assert.rejects(
    readRepositoryPublicationSurface({
      workerUrl: 'https://carrier.example.test',
      operation: 'repository_publication.cloudflare_execution.list',
      requestId: 'request_repository_publication_read_missing_execution',
      auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
      params: {
        site_id: 'site_alpha',
        limit: 500,
        repository_publication_execution_limit: 500,
      },
      focusExecutionId: 'repository-publication-execution-missing',
    }, async () => responseJson(200, {
      ok: true,
      status: 'ok',
      site_id: 'site_alpha',
      executions: [{
        repository_publication_execution_id: 'repository-publication-execution-1',
        repository_publication_request_id: 'repository-publication-request-1',
      }],
    })),
    /repository_publication_execution_read_focus_not_found:repository-publication-execution-missing/,
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
        evidence_posture: 'windows_repository_publication_resolved_cloudflare_recorded_evidence',
        published_commit_ref: 'git:commit:2222',
      },
      {
        repository_publication_evidence_id: 'repository-publication-evidence-1',
        repository_publication_request_id: 'repository-publication-request-1',
        publication_execution_id: 'publication-execution-1',
        publication_status: 'refused',
        windows_admission_reason: 'repository_publication_push_not_enabled',
        evidence_posture: 'windows_repository_publication_refused_cloudflare_recorded_evidence',
        published_commit_ref: 'git:commit:1111',
      },
    ],
  }, {
    site_id: 'site_alpha',
  }, {
    focusEvidenceId: 'repository-publication-evidence-1',
  });

  assert.equal(summary.evidence_count, 1);
  assert.equal(summary.requested_repository_publication_evidence_id, 'repository-publication-evidence-1');
  assert.equal(summary.focused_repository_publication_evidence_id, 'repository-publication-evidence-1');
  assert.equal(summary.focused_publication_execution_id, 'publication-execution-1');
  assert.equal(summary.focused_publication_status, 'refused');
  assert.equal(summary.focused_publication_reason, 'repository_publication_push_not_enabled');
  assert.equal(summary.latest_repository_publication_evidence_id, 'repository-publication-evidence-1');
  assert.equal(summary.latest_publication_reason, 'repository_publication_push_not_enabled');
  assert.equal(summary.latest_evidence_posture, 'windows_repository_publication_refused_cloudflare_recorded_evidence');
  assert.equal(summary.latest_published_commit_ref, 'git:commit:1111');
});

test('summarizeRepositoryPublicationSurface narrows admission summary to focused admission id', () => {
  const summary = summarizeRepositoryPublicationSurface('repository_publication.admission.list', {
    ok: true,
    status: 'ok',
    site_id: 'site_alpha',
    admissions: [
      {
        repository_publication_admission_id: 'repository-publication-admission-2',
        repository_publication_request_id: 'repository-publication-request-2',
        admission_action: 'admit',
      },
      {
        repository_publication_admission_id: 'repository-publication-admission-1',
        repository_publication_request_id: 'repository-publication-request-1',
        admission_action: 'admit',
        admission_reason: 'admitted_reason',
      },
    ],
  }, {
    site_id: 'site_alpha',
  }, {
    focusAdmissionId: 'repository-publication-admission-1',
  });

  assert.equal(summary.admission_count, 1);
  assert.equal(summary.focused_repository_publication_admission_id, 'repository-publication-admission-1');
  assert.equal(summary.latest_repository_publication_admission_id, 'repository-publication-admission-1');
  assert.equal(summary.latest_admission_reason, 'admitted_reason');
});

test('summarizeRepositoryPublicationSurface narrows execution summary to focused execution id', () => {
  const summary = summarizeRepositoryPublicationSurface('repository_publication.cloudflare_execution.list', {
    ok: true,
    status: 'ok',
    site_id: 'site_alpha',
    executions: [
      {
        repository_publication_execution_id: 'repository-publication-execution-2',
        repository_publication_request_id: 'repository-publication-request-2',
        publication_status: 'completed',
      },
      {
        repository_publication_execution_id: 'repository-publication-execution-1',
        repository_publication_request_id: 'repository-publication-request-1',
        publication_status: 'completed',
        repository_ref: 'github:andrey/site-alpha',
        branch_ref: 'main',
        published_commit_ref: 'git:commit:1111',
        github_http_status: 200,
      },
    ],
  }, {
    site_id: 'site_alpha',
  }, {
    focusExecutionId: 'repository-publication-execution-1',
  });

  assert.equal(summary.execution_count, 1);
  assert.equal(summary.focused_repository_publication_execution_id, 'repository-publication-execution-1');
  assert.equal(summary.latest_repository_publication_execution_id, 'repository-publication-execution-1');
  assert.equal(summary.focused_repository_ref, 'github:andrey/site-alpha');
  assert.equal(summary.focused_github_http_status, 200);
});

test('formatRepositoryPublicationReadText surfaces evidence refusal reason', () => {
  const text = formatRepositoryPublicationReadText({
    status: 'ok',
    operation: 'repository_publication.evidence.list',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    params: { site_id: 'site_alpha' },
    summary: {
      operation: 'repository_publication.evidence.list',
      site_id: 'site_alpha',
      status: 'ok',
      evidence_count: 1,
      repository_publication_request_id: 'repository-publication-request-1',
      focused_repository_publication_evidence_id: 'repository-publication-evidence-1',
      focused_publication_execution_id: 'publication-execution-1',
      focused_evidence_posture: 'windows_repository_publication_refused_cloudflare_recorded_evidence',
      focused_publication_status: 'refused',
      focused_publication_reason: 'repository_publication_push_not_enabled',
      latest_repository_publication_evidence_id: 'repository-publication-evidence-1',
      latest_publication_execution_id: 'publication-execution-1',
      latest_evidence_posture: 'windows_repository_publication_refused_cloudflare_recorded_evidence',
      latest_publication_status: 'refused',
      latest_publication_reason: 'repository_publication_push_not_enabled',
      repository_publication_evidence_authority: 'windows_repository_publication_executor',
      repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
      cloudflare_evidence_store_authority: 'cloudflare_repository_publication_evidence_store',
    },
  });

  assert.match(text, /Focused Evidence: repository-publication-evidence-1/);
  assert.match(text, /Focused Execution: publication-execution-1/);
  assert.match(text, /Current Posture: windows_repository_publication_refused_cloudflare_recorded_evidence/);
  assert.match(text, /Focused Publication Status: refused reason=repository_publication_push_not_enabled/);
  assert.match(text, /Request Read: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:request:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --repository-publication-request-id repository-publication-request-1 --operator-session-file <operator-session-file>/);
});

test('formatRepositoryPublicationReadText surfaces operation review on request surfaces', () => {
  const requestListText = formatRepositoryPublicationReadText({
    status: 'ok',
    operation: 'repository_publication.request.list',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    params: { site_id: 'site_alpha' },
    summary: {
      operation: 'repository_publication.request.list',
      site_id: 'site_alpha',
      request_count: 1,
      latest_repository_publication_request_id: 'repository-publication-request-1',
      latest_operation_id: 'operation-1',
      latest_publication_ref: 'publication:site-alpha:v1',
      repository_publication_request_authority: 'cloudflare_repository_publication_request_queue',
      repository_publication_executor_authority: 'windows_repository_publication_executor',
    },
  });

  assert.match(requestListText, /Latest Request: repository-publication-request-1/);
  assert.match(requestListText, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation-1 --operator-session-file <operator-session-file>/);
  assert.match(requestListText, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation-1 --operator-session-file <operator-session-file> --execute-operation-next/);

  const requestNextText = formatRepositoryPublicationReadText({
    status: 'ok',
    operation: 'repository_publication.request.next',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    params: { site_id: 'site_alpha' },
    summary: {
      operation: 'repository_publication.request.next',
      site_id: 'site_alpha',
      repository_publication_request_id: 'repository-publication-request-1',
      operation_id: 'operation-1',
      repository_publication_admission_id: 'repository-publication-admission-1',
      admission_action: 'admit',
      pending_unadmitted_count: 2,
      repository_publication_request_authority: 'cloudflare_repository_publication_request_queue',
      repository_publication_dispatch_authority: 'cloudflare_repository_publication_request_queue',
      repository_publication_executor_authority: 'windows_repository_publication_executor',
      repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
    },
  });

  assert.match(requestNextText, /Request: repository-publication-request-1/);
  assert.match(requestNextText, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation-1 --operator-session-file <operator-session-file>/);
  assert.match(requestNextText, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation-1 --operator-session-file <operator-session-file> --execute-operation-next/);
});

test('formatRepositoryPublicationReadText surfaces focused admission and execution labels', () => {
  const admissionText = formatRepositoryPublicationReadText({
    status: 'ok',
    operation: 'repository_publication.admission.list',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    params: { site_id: 'site_alpha' },
    summary: {
      operation: 'repository_publication.admission.list',
      site_id: 'site_alpha',
      admission_count: 1,
      focused_repository_publication_admission_id: 'repository-publication-admission-1',
      latest_repository_publication_request_id: 'repository-publication-request-1',
      latest_admission_action: 'admit',
      latest_admission_reason: 'admitted_reason',
      repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
      repository_publication_executor_authority: 'windows_repository_publication_executor',
    },
  });

  assert.match(admissionText, /Focused Admission: repository-publication-admission-1/);
  assert.match(admissionText, /Focused Request: repository-publication-request-1/);
  assert.match(admissionText, /Focused Decision: admit reason=admitted_reason/);
  assert.match(admissionText, /Request Read: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:request:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --repository-publication-request-id repository-publication-request-1 --operator-session-file <operator-session-file>/);

  const executionText = formatRepositoryPublicationReadText({
    status: 'ok',
    operation: 'repository_publication.cloudflare_execution.list',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    params: { site_id: 'site_alpha' },
    summary: {
      operation: 'repository_publication.cloudflare_execution.list',
      site_id: 'site_alpha',
      execution_count: 1,
      repository_publication_request_id: 'repository-publication-request-1',
      focused_repository_publication_execution_id: 'repository-publication-execution-1',
      focused_publication_status: 'completed',
      focused_repository_ref: 'github:andrey/site-alpha',
      focused_branch_ref: 'main',
      focused_published_commit_ref: 'git:commit:1111',
      focused_github_http_status: 200,
      repository_publication_executor_authority: 'windows_repository_publication_executor',
      repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
    },
  });

  assert.match(executionText, /Focused Execution: repository-publication-execution-1/);
  assert.match(executionText, /Focused Publication Status: completed/);
  assert.match(executionText, /Focused GitHub HTTP Status: 200/);
  assert.match(executionText, /Request Read: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:request:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --repository-publication-request-id repository-publication-request-1 --operator-session-file <operator-session-file>/);
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
