import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatLocalIngressEvidenceText,
  parseLocalIngressEvidenceArgs,
  putCloudflareLocalIngressEvidence,
  summarizeLocalIngressEvidence,
} from './cloudflare-carrier-local-ingress-evidence.mjs';

test('parseLocalIngressEvidenceArgs builds governed local ingress evidence payload', () => {
  const parsed = parseLocalIngressEvidenceArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--local-ingress-evidence-id', 'local-ingress-evidence-1',
    '--local-ingress-request-id', 'local-ingress-request-1',
    '--local-execution-id', 'local-execution-1',
    '--generated-at', '2026-06-11T12:30:00.000Z',
    '--changed-file', 'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
    '--changed-file', 'packages/cloudflare-carrier/README.md',
    '--windows-admission-reason', 'governed_local_ingress_request_admitted',
    '--local-executor-authority', 'windows_local_ingress_executor',
    '--rollback-evidence-ref', 'rollback:local-ingress-execution:v1',
    '--request-id', 'request_local_ingress_evidence_1',
    '--format', 'text',
  ], {}, () => 1234);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_local_ingress_evidence_1');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    local_ingress_evidence_id: 'local-ingress-evidence-1',
    source_payload: {
      generated_at: '2026-06-11T12:30:00.000Z',
      local_ingress_request_id: 'local-ingress-request-1',
      local_execution_id: 'local-execution-1',
      requested_mutation_class: 'local_repository_filesystem_mutation',
      windows_admission_action: 'admit',
      windows_admission_reason: 'governed_local_ingress_request_admitted',
      local_execution_status: 'completed',
      local_executor_authority: 'windows_local_ingress_executor',
      local_filesystem_mutation_admission: 'admitted_by_windows_local_ingress',
      changed_files: [
        'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
        'packages/cloudflare-carrier/README.md',
      ],
      rollback_evidence_ref: 'rollback:local-ingress-execution:v1',
      direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
    },
  });
});

test('parseLocalIngressEvidenceArgs supports operator session auth and env changed files', () => {
  const parsed = parseLocalIngressEvidenceArgs([
    '--url', 'https://carrier.example.test',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--local-ingress-request-id', 'local-ingress-request-2',
    '--local-execution-id', 'local-execution-2',
  ], {
    CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_CHANGED_FILES: 'a.txt, b.txt',
  }, () => 1234);

  assert.equal(parsed.requestId, 'local_ingress_evidence_local-execution-2');
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
  assert.deepEqual(parsed.params.source_payload.changed_files, ['a.txt', 'b.txt']);
});

test('parseLocalIngressEvidenceArgs refuses missing required inputs', () => {
  assert.throws(
    () => parseLocalIngressEvidenceArgs(['--token', 'token', '--site', 'site_alpha', '--local-ingress-request-id', 'r', '--local-execution-id', 'e', '--changed-file', 'a.txt'], {}, () => 1),
    /local_ingress_evidence_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseLocalIngressEvidenceArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--local-ingress-request-id', 'r', '--local-execution-id', 'e', '--changed-file', 'a.txt'], {}, () => 1),
    /local_ingress_evidence_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseLocalIngressEvidenceArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--local-execution-id', 'e', '--changed-file', 'a.txt'], {}, () => 1),
    /local_ingress_evidence_requires_--local-ingress-request-id_or_CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_REQUEST_ID/,
  );
  assert.throws(
    () => parseLocalIngressEvidenceArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--local-ingress-request-id', 'r', '--changed-file', 'a.txt'], {}, () => 1),
    /local_ingress_evidence_requires_--local-execution-id_or_CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_EXECUTION_ID/,
  );
  assert.throws(
    () => parseLocalIngressEvidenceArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--local-ingress-request-id', 'r', '--local-execution-id', 'e'], {}, () => 1),
    /local_ingress_evidence_requires_--changed-file_or_CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_CHANGED_FILES/,
  );
  assert.throws(
    () => parseLocalIngressEvidenceArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha', '--local-ingress-request-id', 'r', '--local-execution-id', 'e', '--changed-file', 'a.txt'], {}, () => 1),
    /local_ingress_evidence_requires_bearer_token_or_operator_session/,
  );
  assert.throws(
    () => parseLocalIngressEvidenceArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--local-ingress-request-id', 'r', '--local-execution-id', 'e', '--changed-file', 'a.txt', '--format', 'yaml'], {}, () => 1),
    /local_ingress_evidence_format_unsupported:yaml/,
  );
});

test('putCloudflareLocalIngressEvidence posts the evidence envelope and redacts auth', async () => {
  const requests = [];
  const result = await putCloudflareLocalIngressEvidence({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_local_ingress_evidence_1',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      local_ingress_evidence_id: 'local-ingress-evidence-1',
      source_payload: {
        generated_at: '2026-06-11T12:30:00.000Z',
        local_ingress_request_id: 'local-ingress-request-1',
        local_execution_id: 'local-execution-1',
        requested_mutation_class: 'local_repository_filesystem_mutation',
        windows_admission_action: 'admit',
        windows_admission_reason: 'governed_local_ingress_request_admitted',
        local_execution_status: 'completed',
        local_executor_authority: 'windows_local_ingress_executor',
        local_filesystem_mutation_admission: 'admitted_by_windows_local_ingress',
        changed_files: [
          'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
          'packages/cloudflare-carrier/README.md',
        ],
        rollback_evidence_ref: 'rollback:local-ingress-execution:v1',
        direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
      },
    },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return responseJson(200, {
      ok: true,
      status: 'recorded',
      site_id: 'site_alpha',
      local_ingress_evidence_authority: 'windows_local_ingress_executor',
      cloudflare_evidence_store_authority: 'cloudflare_local_ingress_evidence_store',
      local_filesystem_mutation_admission: 'admitted_by_windows_local_ingress',
      direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
      authority_partition: 'windows_executes_local_ingress_cloudflare_records_evidence_without_direct_filesystem_authority',
      evidence: {
        generated_at: '2026-06-11T12:30:00.000Z',
        local_ingress_request_id: 'local-ingress-request-1',
        local_execution_id: 'local-execution-1',
        requested_mutation_class: 'local_repository_filesystem_mutation',
        windows_admission_action: 'admit',
        windows_admission_reason: 'governed_local_ingress_request_admitted',
        local_execution_status: 'completed',
        local_executor_authority: 'windows_local_ingress_executor',
        local_filesystem_mutation_admission: 'admitted_by_windows_local_ingress',
        changed_files: [
          'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
          'packages/cloudflare-carrier/README.md',
        ],
        rollback_evidence_ref: 'rollback:local-ingress-execution:v1',
        direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        evidence_posture: 'windows_local_ingress_executed_cloudflare_recorded_evidence',
      },
      record: {
        local_ingress_evidence_id: 'local-ingress-evidence-1',
        site_id: 'site_alpha',
        local_ingress_request_id: 'local-ingress-request-1',
        local_execution_id: 'local-execution-1',
        changed_file_count: 2,
        evidence_posture: 'windows_local_ingress_executed_cloudflare_recorded_evidence',
        recorded_by_principal_id: 'principal:operator',
        recorded_at: '2026-06-11T12:30:10.000Z',
      },
    });
  });

  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.headers.authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    operation: 'local_ingress.evidence.put',
    request_id: 'request_local_ingress_evidence_1',
    params: {
      site_id: 'site_alpha',
      local_ingress_evidence_id: 'local-ingress-evidence-1',
      source_payload: {
        generated_at: '2026-06-11T12:30:00.000Z',
        local_ingress_request_id: 'local-ingress-request-1',
        local_execution_id: 'local-execution-1',
        requested_mutation_class: 'local_repository_filesystem_mutation',
        windows_admission_action: 'admit',
        windows_admission_reason: 'governed_local_ingress_request_admitted',
        local_execution_status: 'completed',
        local_executor_authority: 'windows_local_ingress_executor',
        local_filesystem_mutation_admission: 'admitted_by_windows_local_ingress',
        changed_files: [
          'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
          'packages/cloudflare-carrier/README.md',
        ],
        rollback_evidence_ref: 'rollback:local-ingress-execution:v1',
        direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
      },
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.local_ingress_evidence.v1');
  assert.equal(result.auth_source, 'flag:--token');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.deepEqual(result.summary, {
    ok: true,
    code: null,
    status: 'recorded',
    site_id: 'site_alpha',
    local_ingress_evidence_id: 'local-ingress-evidence-1',
    generated_at: '2026-06-11T12:30:00.000Z',
    local_ingress_request_id: 'local-ingress-request-1',
    local_execution_id: 'local-execution-1',
    requested_mutation_class: 'local_repository_filesystem_mutation',
    windows_admission_action: 'admit',
    windows_admission_reason: 'governed_local_ingress_request_admitted',
    local_execution_status: 'completed',
    local_executor_authority: 'windows_local_ingress_executor',
    cloudflare_evidence_store_authority: 'cloudflare_local_ingress_evidence_store',
    local_filesystem_mutation_admission: 'admitted_by_windows_local_ingress',
    direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
    repository_publication_admission: 'not_admitted',
    changed_file_count: 2,
    changed_files: [
      'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
      'packages/cloudflare-carrier/README.md',
    ],
    rollback_evidence_ref: 'rollback:local-ingress-execution:v1',
    evidence_posture: 'windows_local_ingress_executed_cloudflare_recorded_evidence',
    authority_partition: 'windows_executes_local_ingress_cloudflare_records_evidence_without_direct_filesystem_authority',
    recorded_by_principal_id: 'principal:operator',
    recorded_at: '2026-06-11T12:30:10.000Z',
  });
});

test('formatLocalIngressEvidenceText suppresses worker-scoped handoff without a real worker url', () => {
  const text = formatLocalIngressEvidenceText({
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      local_ingress_request_id: 'local-ingress-request-1',
      local_execution_id: 'local-execution-1',
      changed_file_count: 0,
      changed_files: [],
    },
  });

  assert.doesNotMatch(text, /Request Review:/);
  assert.doesNotMatch(text, /<worker-url>/);
});

test('putCloudflareLocalIngressEvidence preserves structured refusal evidence', async () => {
  await assert.rejects(
    () => putCloudflareLocalIngressEvidence({
      workerUrl: 'https://carrier.example.test',
      requestId: 'request_local_ingress_evidence_refused',
      auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
      params: {
        site_id: 'site_alpha',
        source_payload: {
          local_ingress_request_id: 'local-ingress-request-1',
          local_execution_id: 'local-execution-1',
          requested_mutation_class: 'local_repository_filesystem_mutation',
          windows_admission_action: 'admit',
          local_execution_status: 'completed',
          local_executor_authority: 'windows_local_ingress_executor',
          local_filesystem_mutation_admission: 'admitted_by_windows_local_ingress',
          changed_files: ['packages/cloudflare-carrier/src/cloudflare-worker.mjs'],
          direct_cloudflare_filesystem_mutation_admission: 'admitted',
          repository_publication_admission: 'not_admitted',
        },
      },
    }, async () => responseJson(400, {
      ok: false,
      code: 'local_ingress_evidence_direct_cloudflare_filesystem_mutation_admission_invalid',
      direct_cloudflare_filesystem_mutation_admission: 'admitted',
    })),
    (error) => {
      assert.equal(error.code, 'local_ingress_evidence_direct_cloudflare_filesystem_mutation_admission_invalid');
      assert.equal(error.http_status, 400);
      assert.deepEqual(error.summary, {
        ok: false,
        code: 'local_ingress_evidence_direct_cloudflare_filesystem_mutation_admission_invalid',
        status: null,
        site_id: 'site_alpha',
        local_ingress_evidence_id: null,
        generated_at: null,
        local_ingress_request_id: 'local-ingress-request-1',
        local_execution_id: 'local-execution-1',
        requested_mutation_class: 'local_repository_filesystem_mutation',
        windows_admission_action: 'admit',
        windows_admission_reason: null,
        local_execution_status: 'completed',
        local_executor_authority: 'windows_local_ingress_executor',
        cloudflare_evidence_store_authority: 'cloudflare_local_ingress_evidence_store',
        local_filesystem_mutation_admission: 'admitted_by_windows_local_ingress',
        direct_cloudflare_filesystem_mutation_admission: 'admitted',
        repository_publication_admission: 'not_admitted',
        changed_file_count: 1,
        changed_files: ['packages/cloudflare-carrier/src/cloudflare-worker.mjs'],
        rollback_evidence_ref: null,
        evidence_posture: 'windows_local_ingress_executed_cloudflare_recorded_evidence',
        authority_partition: null,
        recorded_by_principal_id: null,
        recorded_at: null,
      });
      return true;
    },
  );
});

test('formatLocalIngressEvidenceText renders recorded and refused summaries without auth material', () => {
  const rendered = formatLocalIngressEvidenceText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    summary: {
      ok: true,
      code: null,
      status: 'recorded',
      site_id: 'site_alpha',
      local_ingress_evidence_id: 'local-ingress-evidence-1',
      local_ingress_request_id: 'local-ingress-request-1',
      local_execution_id: 'local-execution-1',
      local_executor_authority: 'windows_local_ingress_executor',
      cloudflare_evidence_store_authority: 'cloudflare_local_ingress_evidence_store',
      local_filesystem_mutation_admission: 'admitted_by_windows_local_ingress',
      direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
      changed_file_count: 2,
      changed_files: ['a.txt', 'b.txt'],
      evidence_posture: 'windows_local_ingress_executed_cloudflare_recorded_evidence',
      authority_partition: 'windows_executes_local_ingress_cloudflare_records_evidence_without_direct_filesystem_authority',
    },
  });
  assert.match(rendered, /Local Ingress Evidence: ok/);
  assert.match(rendered, /Request: local-ingress-request-1/);
  assert.match(rendered, /Execution: local-execution-1/);
  assert.match(rendered, /Changed File: a.txt/);
  assert.match(rendered, /Request Review: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:request:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --local-ingress-request-id local-ingress-request-1 --operator-session-file <operator-session-file>/);
  assert.equal(rendered.includes('secret-token'), false);

  const refused = formatLocalIngressEvidenceText({
    status: 'refused',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-cookie',
    summary: summarizeLocalIngressEvidence({
      ok: false,
      code: 'local_ingress_evidence_repository_publication_admission_invalid',
      repository_publication_admission: 'admitted',
    }, {
      site_id: 'site_alpha',
      source_payload: {
        local_ingress_request_id: 'local-ingress-request-2',
        local_execution_id: 'local-execution-2',
        local_executor_authority: 'windows_local_ingress_executor',
        changed_files: ['c.txt'],
        repository_publication_admission: 'admitted',
      },
    }),
  });
  assert.match(refused, /Local Ingress Evidence: refused/);
  assert.match(refused, /Code: local_ingress_evidence_repository_publication_admission_invalid/);
  assert.match(refused, /Repository Publication: admitted/);
});

function responseJson(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
