import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCloudflareLocalIngressRequest,
  formatLocalIngressRequestText,
  parseLocalIngressRequestArgs,
  summarizeLocalIngressRequest,
} from './cloudflare-carrier-local-ingress-request.mjs';

test('parseLocalIngressRequestArgs builds governed local ingress request payload', () => {
  const parsed = parseLocalIngressRequestArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--local-ingress-request-id', 'local-ingress-request-1',
    '--operation-id', 'operation_alpha',
    '--task-id', 'cloudflare-task-9',
    '--generated-at', '2026-06-11T12:00:00.000Z',
    '--action-ref', 'local-windows-action:site-file-write:v1',
    '--summary', 'request a governed local Windows site-file write and wait for evidence',
    '--contract-ref', 'contract:cloudflare-to-windows-local-ingress-request:v1',
    '--evidence-contract-ref', 'contract:windows-local-ingress-evidence-return:v1',
    '--rollback-ref', 'rollback:local-ingress-request:v1',
    '--request-id', 'request_local_ingress_1',
    '--format', 'text',
  ], {}, () => 1234);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_local_ingress_1');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    local_ingress_request_id: 'local-ingress-request-1',
    source_payload: {
      generated_at: '2026-06-11T12:00:00.000Z',
      operation_id: 'operation_alpha',
      task_id: 'cloudflare-task-9',
      requested_mutation_class: 'local_repository_filesystem_mutation',
      requested_action_ref: 'local-windows-action:site-file-write:v1',
      requested_action_summary: 'request a governed local Windows site-file write and wait for evidence',
      governed_request_contract_ref: 'contract:cloudflare-to-windows-local-ingress-request:v1',
      evidence_return_contract_ref: 'contract:windows-local-ingress-evidence-return:v1',
      rollback_plan_ref: 'rollback:local-ingress-request:v1',
      target_authority_locus: 'local-windows-site-authority',
      local_executor_authority: 'windows_local_ingress_executor',
      local_execution_admission: 'pending_windows_admission',
      direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
    },
  });
});

test('parseLocalIngressRequestArgs supports operator session auth', () => {
  const parsed = parseLocalIngressRequestArgs([
    '--url', 'https://carrier.example.test',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--action-ref', 'local-windows-action:site-file-write:v2',
    '--contract-ref', 'contract:cloudflare-to-windows-local-ingress-request:v2',
    '--evidence-contract-ref', 'contract:windows-local-ingress-evidence-return:v2',
    '--rollback-ref', 'rollback:local-ingress-request:v2',
  ], {}, () => 1234);

  assert.equal(parsed.requestId, 'local_ingress_request_1234');
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
  assert.equal(parsed.params.source_payload.local_executor_authority, 'windows_local_ingress_executor');
});

test('parseLocalIngressRequestArgs refuses missing required inputs', () => {
  assert.throws(
    () => parseLocalIngressRequestArgs(['--token', 'token', '--site', 'site_alpha', '--action-ref', 'x', '--contract-ref', 'c', '--evidence-contract-ref', 'e', '--rollback-ref', 'r'], {}, () => 1),
    /local_ingress_request_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseLocalIngressRequestArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--action-ref', 'x', '--contract-ref', 'c', '--evidence-contract-ref', 'e', '--rollback-ref', 'r'], {}, () => 1),
    /local_ingress_request_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseLocalIngressRequestArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--contract-ref', 'c', '--evidence-contract-ref', 'e', '--rollback-ref', 'r'], {}, () => 1),
    /local_ingress_request_requires_--action-ref_or_CLOUDFLARE_LOCAL_INGRESS_REQUEST_ACTION_REF/,
  );
  assert.throws(
    () => parseLocalIngressRequestArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--action-ref', 'x', '--evidence-contract-ref', 'e', '--rollback-ref', 'r'], {}, () => 1),
    /local_ingress_request_requires_--contract-ref_or_CLOUDFLARE_LOCAL_INGRESS_REQUEST_CONTRACT_REF/,
  );
  assert.throws(
    () => parseLocalIngressRequestArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--action-ref', 'x', '--contract-ref', 'c', '--rollback-ref', 'r'], {}, () => 1),
    /local_ingress_request_requires_--evidence-contract-ref_or_CLOUDFLARE_LOCAL_INGRESS_REQUEST_EVIDENCE_CONTRACT_REF/,
  );
  assert.throws(
    () => parseLocalIngressRequestArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--action-ref', 'x', '--contract-ref', 'c', '--evidence-contract-ref', 'e'], {}, () => 1),
    /local_ingress_request_requires_--rollback-ref_or_CLOUDFLARE_LOCAL_INGRESS_REQUEST_ROLLBACK_REF/,
  );
  assert.throws(
    () => parseLocalIngressRequestArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha', '--action-ref', 'x', '--contract-ref', 'c', '--evidence-contract-ref', 'e', '--rollback-ref', 'r'], {}, () => 1),
    /local_ingress_request_requires_bearer_token_or_operator_session/,
  );
  assert.throws(
    () => parseLocalIngressRequestArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--action-ref', 'x', '--contract-ref', 'c', '--evidence-contract-ref', 'e', '--rollback-ref', 'r', '--format', 'yaml'], {}, () => 1),
    /local_ingress_request_format_unsupported:yaml/,
  );
});

test('createCloudflareLocalIngressRequest posts the local ingress envelope and redacts auth', async () => {
  const requests = [];
  const result = await createCloudflareLocalIngressRequest({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_local_ingress_1',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      local_ingress_request_id: 'local-ingress-request-1',
      source_payload: {
        generated_at: '2026-06-11T12:00:00.000Z',
        operation_id: 'operation_alpha',
        task_id: 'cloudflare-task-9',
        requested_mutation_class: 'local_repository_filesystem_mutation',
        requested_action_ref: 'local-windows-action:site-file-write:v1',
        requested_action_summary: 'request a governed local Windows site-file write and wait for evidence',
        governed_request_contract_ref: 'contract:cloudflare-to-windows-local-ingress-request:v1',
        evidence_return_contract_ref: 'contract:windows-local-ingress-evidence-return:v1',
        rollback_plan_ref: 'rollback:local-ingress-request:v1',
        target_authority_locus: 'local-windows-site-authority',
        local_executor_authority: 'windows_local_ingress_executor',
        local_execution_admission: 'pending_windows_admission',
        direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
      },
    },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return responseJson(200, {
      ok: true,
      status: 'queued',
      site_id: 'site_alpha',
      local_ingress_request_authority: 'cloudflare_local_ingress_request_queue',
      target_authority_locus: 'local-windows-site-authority',
      local_executor_authority: 'windows_local_ingress_executor',
      local_execution_admission: 'pending_windows_admission',
      direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
      request: {
        generated_at: '2026-06-11T12:00:00.000Z',
        operation_id: 'operation_alpha',
        task_id: 'cloudflare-task-9',
        requested_mutation_class: 'local_repository_filesystem_mutation',
        requested_action_ref: 'local-windows-action:site-file-write:v1',
        requested_action_summary: 'request a governed local Windows site-file write and wait for evidence',
        governed_request_contract_ref: 'contract:cloudflare-to-windows-local-ingress-request:v1',
        evidence_return_contract_ref: 'contract:windows-local-ingress-evidence-return:v1',
        rollback_plan_ref: 'rollback:local-ingress-request:v1',
        authority_locus: 'cloudflare_local_ingress_request_queue',
        target_authority_locus: 'local-windows-site-authority',
        local_executor_authority: 'windows_local_ingress_executor',
        local_execution_admission: 'pending_windows_admission',
        direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        request_posture: 'cloudflare_queued_request_windows_must_admit_execute_and_return_evidence',
      },
      record: {
        local_ingress_request_id: 'local-ingress-request-1',
        site_id: 'site_alpha',
        request_posture: 'cloudflare_queued_request_windows_must_admit_execute_and_return_evidence',
        recorded_by_principal_id: 'principal:operator',
        recorded_at: '2026-06-11T12:00:10.000Z',
      },
    });
  });

  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.headers.authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    operation: 'local_ingress.request.create',
    request_id: 'request_local_ingress_1',
    params: {
      site_id: 'site_alpha',
      local_ingress_request_id: 'local-ingress-request-1',
      source_payload: {
        generated_at: '2026-06-11T12:00:00.000Z',
        operation_id: 'operation_alpha',
        task_id: 'cloudflare-task-9',
        requested_mutation_class: 'local_repository_filesystem_mutation',
        requested_action_ref: 'local-windows-action:site-file-write:v1',
        requested_action_summary: 'request a governed local Windows site-file write and wait for evidence',
        governed_request_contract_ref: 'contract:cloudflare-to-windows-local-ingress-request:v1',
        evidence_return_contract_ref: 'contract:windows-local-ingress-evidence-return:v1',
        rollback_plan_ref: 'rollback:local-ingress-request:v1',
        target_authority_locus: 'local-windows-site-authority',
        local_executor_authority: 'windows_local_ingress_executor',
        local_execution_admission: 'pending_windows_admission',
        direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
      },
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.local_ingress_request.v1');
  assert.equal(result.auth_source, 'flag:--token');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.deepEqual(result.summary, {
    ok: true,
    code: null,
    status: 'queued',
    site_id: 'site_alpha',
    local_ingress_request_id: 'local-ingress-request-1',
    generated_at: '2026-06-11T12:00:00.000Z',
    operation_id: 'operation_alpha',
    task_id: 'cloudflare-task-9',
    requested_mutation_class: 'local_repository_filesystem_mutation',
    requested_action_ref: 'local-windows-action:site-file-write:v1',
    requested_action_summary: 'request a governed local Windows site-file write and wait for evidence',
    local_ingress_request_authority: 'cloudflare_local_ingress_request_queue',
    target_authority_locus: 'local-windows-site-authority',
    local_executor_authority: 'windows_local_ingress_executor',
    local_execution_admission: 'pending_windows_admission',
    direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
    repository_publication_admission: 'not_admitted',
    request_posture: 'cloudflare_queued_request_windows_must_admit_execute_and_return_evidence',
    governed_request_contract_ref: 'contract:cloudflare-to-windows-local-ingress-request:v1',
    evidence_return_contract_ref: 'contract:windows-local-ingress-evidence-return:v1',
    rollback_plan_ref: 'rollback:local-ingress-request:v1',
    recorded_by_principal_id: 'principal:operator',
    recorded_at: '2026-06-11T12:00:10.000Z',
  });
});

test('formatLocalIngressRequestText suppresses worker-scoped handoffs without a real worker url', () => {
  const text = formatLocalIngressRequestText({
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      task_id: 'cloudflare-task-9',
      requested_action_ref: 'local-windows-action:site-file-write:v1',
    },
  });

  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /Task Review:/);
  assert.doesNotMatch(text, /Task Workflow:/);
  assert.doesNotMatch(text, /<worker-url>/);
});

test('createCloudflareLocalIngressRequest preserves structured refusal evidence', async () => {
  await assert.rejects(async () => createCloudflareLocalIngressRequest({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_local_ingress_refused',
    format: 'text',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      source_payload: {
        requested_mutation_class: 'local_repository_filesystem_mutation',
        requested_action_ref: 'local-windows-action:site-file-write:v1',
        governed_request_contract_ref: 'contract:cloudflare-to-windows-local-ingress-request:v1',
        evidence_return_contract_ref: 'contract:windows-local-ingress-evidence-return:v1',
        rollback_plan_ref: 'rollback:local-ingress-request:v1',
        target_authority_locus: 'local-windows-site-authority',
        local_executor_authority: 'windows_local_ingress_executor',
        local_execution_admission: 'pending_windows_admission',
        direct_cloudflare_filesystem_mutation_admission: 'admitted',
        repository_publication_admission: 'not_admitted',
      },
    },
  }, async () => responseJson(400, {
    ok: false,
    code: 'local_ingress_direct_cloudflare_filesystem_mutation_admission_invalid',
    site_id: 'site_alpha',
  })), (error) => {
    assert.equal(error.code, 'local_ingress_direct_cloudflare_filesystem_mutation_admission_invalid');
    assert.equal(error.http_status, 400);
    assert.equal(error.summary.requested_action_ref, 'local-windows-action:site-file-write:v1');
    return true;
  });

  const invalid = summarizeLocalIngressRequest({
    ok: false,
    code: 'local_ingress_request_contract_ref_required',
    site_id: 'site_alpha',
  }, {
    site_id: 'site_alpha',
    source_payload: {
      requested_action_ref: 'local-windows-action:site-file-write:v1',
    },
  });
  assert.equal(invalid.code, 'local_ingress_request_contract_ref_required');
  assert.equal(invalid.requested_action_ref, 'local-windows-action:site-file-write:v1');
});

test('formatLocalIngressRequestText renders queued and refused summaries without auth material', () => {
  const queued = formatLocalIngressRequestText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    summary: {
      ok: true,
      status: 'queued',
      site_id: 'site_alpha',
      local_ingress_request_id: 'local-ingress-request-1',
      operation_id: 'operation_alpha',
      task_id: 'cloudflare-task-9',
      requested_action_ref: 'local-windows-action:site-file-write:v1',
      requested_action_summary: 'request a governed local Windows site-file write and wait for evidence',
      local_ingress_request_authority: 'cloudflare_local_ingress_request_queue',
      target_authority_locus: 'local-windows-site-authority',
      local_executor_authority: 'windows_local_ingress_executor',
      requested_mutation_class: 'local_repository_filesystem_mutation',
      local_execution_admission: 'pending_windows_admission',
      direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
      request_posture: 'cloudflare_queued_request_windows_must_admit_execute_and_return_evidence',
    },
  });

  assert.match(queued, /Local Ingress Request: ok/);
  assert.match(queued, /Status: queued/);
  assert.match(queued, /Local Execution Admission: pending_windows_admission/);
  assert.match(queued, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --task-id cloudflare-task-9 --operator-session-file <operator-session-file>/);
  assert.match(queued, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --task-id cloudflare-task-9 --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.match(queued, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(queued, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.equal(queued.includes('secret-token'), false);

  const refused = formatLocalIngressRequestText({
    status: 'refused',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      ok: false,
      code: 'local_ingress_direct_cloudflare_filesystem_mutation_admission_invalid',
      site_id: 'site_alpha',
      requested_action_ref: 'local-windows-action:site-file-write:v1',
    },
  });

  assert.match(refused, /Local Ingress Request: refused/);
  assert.match(refused, /Code: local_ingress_direct_cloudflare_filesystem_mutation_admission_invalid/);
  assert.equal(refused.includes('Task Review:'), false);
  assert.equal(refused.includes('Task Workflow:'), false);
  assert.equal(refused.includes('secret-token'), false);
});

function responseJson(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
