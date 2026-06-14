import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatResidentDispatchWindowsFallbackExecuteText,
  parseResidentDispatchWindowsFallbackExecuteArgs,
  runResidentDispatchWindowsFallbackExecute,
} from './cloudflare-carrier-resident-dispatch-windows-fallback-execute.mjs';

test('parseResidentDispatchWindowsFallbackExecuteArgs requires explicit execution acknowledgement', () => {
  assert.throws(
    () => parseResidentDispatchWindowsFallbackExecuteArgs([
      '--url', 'https://carrier.example',
      '--site', 'site_alpha',
      '--token', 'token-value',
    ], {}),
    /resident_dispatch_windows_fallback_execute_requires_--execute-windows-fallback/,
  );
});

test('parseResidentDispatchWindowsFallbackExecuteArgs supports operator session auth', () => {
  const parsed = parseResidentDispatchWindowsFallbackExecuteArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--execute-windows-fallback',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example');
  assert.equal(parsed.siteId, 'site_alpha');
  assert.equal(parsed.operationId, 'operation_alpha');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-session-cookie',
    source: 'operator-session-cookie',
  });
});

test('runResidentDispatchWindowsFallbackExecute selects the pending request and records fallback evidence', async () => {
  const calls = [];
  const fetchImpl = async (_url, init = {}) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.operation === 'resident_dispatch.windows_fallback_request.list') {
      return response(200, {
        ok: true,
        status: 'ok',
        requests: [{
          fallback_request_id: 'fallback_request_alpha',
          operation_id: 'operation_alpha',
          carrier_session_id: 'carrier_session_alpha',
          dispatch_decision_id: 'resident_dispatch_alpha',
          local_execution_admission: 'pending_windows_admission',
        }],
      });
    }
    if (body.operation === 'resident_dispatch.windows_fallback_evidence.put') {
      assert.equal(body.params.source_payload.local_execution_id, 'fallback_request_alpha:execution');
      assert.equal(body.params.source_payload.local_resident_session_ref, 'windows-resident-session:site_alpha:operation_alpha:fallback_request_alpha:execution');
      return response(200, {
        ok: true,
        status: 'ok',
        evidence: {
          fallback_request_id: 'fallback_request_alpha',
          dispatch_decision_id: 'resident_dispatch_alpha',
          local_execution_id: 'fallback_request_alpha:execution',
          local_resident_session_ref: 'windows-resident-session:site_alpha:operation_alpha:fallback_request_alpha:execution',
        },
        record: {
          fallback_evidence_id: 'fallback_request_alpha:evidence',
          local_executor_authority: 'windows_local_site_resident_loop',
          local_session_start_admission: 'admitted_by_windows_resident_loop',
          direct_cloudflare_session_start_admission: 'not_admitted',
        },
      });
    }
    throw new Error(`unexpected_operation:${body.operation}`);
  };

  const result = await runResidentDispatchWindowsFallbackExecute({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    dispatchDecisionId: null,
    fallbackRequestId: null,
    localExecutionId: null,
    localResidentSessionRef: null,
    fallbackEvidenceId: null,
    generatedAt: '2026-06-12T16:45:00.000Z',
    localExecutorAuthority: 'windows_local_site_resident_loop',
    windowsAdmissionReason: 'windows_resident_loop_started_session_after_cloudflare_primary_dispatch_failure',
    rollbackEvidenceRef: null,
    format: 'json',
    executeAcknowledged: true,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
  }, fetchImpl);

  assert.equal(result.status, 'ok');
  assert.equal(result.fallback_request_id, 'fallback_request_alpha');
  assert.equal(result.fallback_evidence_id, 'fallback_request_alpha:evidence');
  assert.equal(result.local_execution_id, 'fallback_request_alpha:execution');
  assert.equal(result.summary.local_session_start_admission, 'admitted_by_windows_resident_loop');
  assert.equal(result.summary.carrier_session_id, 'carrier_session_alpha');
  assert.equal(calls.length, 2);
});

test('formatResidentDispatchWindowsFallbackExecuteText renders the execution summary', () => {
  const text = formatResidentDispatchWindowsFallbackExecuteText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    dispatch_decision_id: 'resident_dispatch_alpha',
    fallback_request_id: 'fallback_request_alpha',
    local_execution_id: 'execution_alpha',
    local_resident_session_ref: 'windows-resident-session:site_alpha:operation_alpha:execution_alpha',
    fallback_evidence_id: 'evidence_alpha',
    status: 'ok',
    summary: {
      request_status: 'ok',
      local_execution_admission: 'pending_windows_admission',
      local_session_start_admission: 'admitted_by_windows_resident_loop',
      direct_cloudflare_session_start_admission: 'not_admitted',
      local_executor_authority: 'windows_local_site_resident_loop',
      carrier_session_id: 'carrier_session_alpha',
    },
  });

  assert.match(text, /Resident Dispatch Windows Fallback Execute/);
  assert.match(text, /Fallback Evidence: evidence_alpha/);
  assert.match(text, /Session Start Admission: admitted_by_windows_resident_loop/);
  assert.match(text, /Cloudflare Carrier Session: carrier_session_alpha/);
  assert.match(text, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example --site site_alpha --carrier-session-id carrier_session_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example --site site_alpha --carrier-session-id carrier_session_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --carrier-session-id carrier_session_alpha --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.match(text, /Resident Dispatch Windows Fallback Evidence Review: pnpm --filter @narada2\/cloudflare-carrier product:resident-dispatch:windows-fallback-evidence:review:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
});

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}
