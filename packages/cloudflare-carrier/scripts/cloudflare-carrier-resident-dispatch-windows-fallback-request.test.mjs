import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createResidentDispatchWindowsFallbackRequest,
  formatResidentDispatchWindowsFallbackRequestText,
  parseResidentDispatchWindowsFallbackRequestArgs,
  runResidentDispatchWindowsFallbackRequest,
} from './cloudflare-carrier-resident-dispatch-windows-fallback-request.mjs';

test('parseResidentDispatchWindowsFallbackRequestArgs builds create payload with defaults', () => {
  const parsed = parseResidentDispatchWindowsFallbackRequestArgs([
    '--url', 'https://carrier.example/',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_live_alpha',
    '--dispatch-decision-id', 'resident_dispatch_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
  ], {}, () => Date.parse('2026-06-12T00:00:00.000Z'));

  assert.equal(parsed.operation, 'resident_dispatch.windows_fallback_request.create');
  assert.equal(parsed.workerUrl, 'https://carrier.example');
  assert.equal(parsed.auth.kind, 'operator_session');
  assert.equal(parsed.params.site_id, 'site_live_smoke');
  assert.equal(parsed.params.source_payload.operation_id, 'operation_live_alpha');
  assert.equal(parsed.params.source_payload.dispatch_decision_id, 'resident_dispatch_alpha');
  assert.equal(parsed.params.source_payload.requested_action_ref, 'local-windows-action:resident-session-start:v1');
  assert.equal(parsed.params.source_payload.governed_request_contract_ref, 'contract:cloudflare-to-windows-resident-fallback-request:v1');
  assert.equal(parsed.params.source_payload.evidence_return_contract_ref, 'contract:windows-resident-fallback-evidence-return:v1');
  assert.equal(parsed.params.source_payload.rollback_plan_ref, 'rollback:windows-resident-fallback-request:v1');
});

test('parseResidentDispatchWindowsFallbackRequestArgs builds list payload without requiring dispatch decision id', () => {
  const parsed = parseResidentDispatchWindowsFallbackRequestArgs([
    '--operation', 'list',
    '--url', 'https://carrier.example/',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_live_alpha',
    '--token', 'token-value',
    '--limit', '3',
  ], {});

  assert.equal(parsed.operation, 'resident_dispatch.windows_fallback_request.list');
  assert.deepEqual(parsed.params, {
    site_id: 'site_live_smoke',
    operation_id: 'operation_live_alpha',
    limit: 3,
  });
});

test('createResidentDispatchWindowsFallbackRequest posts worker operation and summarizes response', async () => {
  const calls = [];
  const result = await createResidentDispatchWindowsFallbackRequest({
    workerUrl: 'https://carrier.example',
    requestId: 'request_alpha',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    params: {
      site_id: 'site_live_smoke',
      source_payload: {
        operation_id: 'operation_live_alpha',
        dispatch_decision_id: 'resident_dispatch_alpha',
        carrier_session_id: 'carrier_session_alpha',
        requested_action_ref: 'local-windows-action:resident-session-start:v1',
        requested_action_summary: 'request governed Windows resident session start after Cloudflare primary dispatch fallback',
        governed_request_contract_ref: 'contract:cloudflare-to-windows-resident-fallback-request:v1',
        evidence_return_contract_ref: 'contract:windows-resident-fallback-evidence-return:v1',
        rollback_plan_ref: 'rollback:windows-resident-fallback-request:v1',
      },
    },
  }, async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          status: 'recorded',
          carrier_session_id: 'carrier_session_alpha',
          fallback_request: {
            fallback_request_id: 'resident_fallback_request_alpha',
            dispatch_decision_id: 'resident_dispatch_alpha',
            carrier_session_id: 'carrier_session_alpha',
            requested_action_ref: 'local-windows-action:resident-session-start:v1',
            requested_action_summary: 'request governed Windows resident session start after Cloudflare primary dispatch fallback',
            local_execution_admission: 'pending_windows_admission',
            windows_fallback_ref: 'windows_local_site_resident_loop',
            local_executor_authority: 'windows_local_site_resident_loop',
          },
        };
      },
    };
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.summary.fallback_request_id, 'resident_fallback_request_alpha');
  assert.equal(result.summary.request_status, 'recorded');
  assert.equal(result.summary.carrier_session_id, 'carrier_session_alpha');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://carrier.example/api/carrier');
  assert.equal(calls[0].body.operation, 'resident_dispatch.windows_fallback_request.create');
  assert.equal(calls[0].options.headers.cookie, 'narada_operator_session=operator-session-cookie');
});

test('runResidentDispatchWindowsFallbackRequest reads list posture', async () => {
  const result = await runResidentDispatchWindowsFallbackRequest({
    operation: 'resident_dispatch.windows_fallback_request.list',
    workerUrl: 'https://carrier.example',
    requestId: 'request_list_alpha',
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    params: {
      site_id: 'site_live_smoke',
      operation_id: 'operation_live_alpha',
      limit: 2,
    },
  }, async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        ok: true,
        status: 'selected',
        requests: [{
          fallback_request_id: 'resident_fallback_request_alpha',
          operation_id: 'operation_live_alpha',
          dispatch_decision_id: 'resident_dispatch_alpha',
          requested_action_ref: 'local-windows-action:resident-session-start:v1',
          requested_action_summary: 'request governed Windows resident session start after Cloudflare primary dispatch fallback',
          local_execution_admission: 'pending_windows_admission',
          windows_fallback_ref: 'windows_local_site_resident_loop',
          local_executor_authority: 'windows_local_site_resident_loop',
        }],
      };
    },
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.summary.request_count, 1);
  assert.equal(result.summary.fallback_request_id, 'resident_fallback_request_alpha');
  assert.equal(result.summary.request_status, 'selected');
});

test('formatResidentDispatchWindowsFallbackRequestText prints key posture', () => {
  const text = formatResidentDispatchWindowsFallbackRequestText({
    operation: 'resident_dispatch.windows_fallback_request.list',
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-cookie',
    site_id: 'site_live_smoke',
    operation_id: 'operation_live_alpha',
    dispatch_decision_id: 'resident_dispatch_alpha',
    http_status: 200,
    status: 'ok',
    summary: {
      request_status: 'selected',
      request_count: 1,
      fallback_request_id: 'resident_fallback_request_alpha',
      carrier_session_id: 'carrier_session_alpha',
      requested_action_ref: 'local-windows-action:resident-session-start:v1',
      requested_action_summary: 'request governed Windows resident session start after Cloudflare primary dispatch fallback',
      local_execution_admission: 'pending_windows_admission',
      windows_fallback_ref: 'windows_local_site_resident_loop',
      local_executor_authority: 'windows_local_site_resident_loop',
    },
    response: {},
  });

  assert.match(text, /Resident Dispatch Windows Fallback Request/);
  assert.match(text, /Operation: resident_dispatch\.windows_fallback_request\.list/);
  assert.match(text, /Fallback Request: resident_fallback_request_alpha/);
  assert.match(text, /Execution Admission: pending_windows_admission/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example --site site_live_smoke --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example --site site_live_smoke --carrier-session-id carrier_session_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example --site site_live_smoke --carrier-session-id carrier_session_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --carrier-session-id carrier_session_alpha --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
});

test('formatResidentDispatchWindowsFallbackRequestText suppresses worker-scoped handoffs without worker url', () => {
  const text = formatResidentDispatchWindowsFallbackRequestText({
    site_id: 'site_live_smoke',
    operation_id: 'operation_live_alpha',
    status: 'ok',
    summary: {
      fallback_request_id: 'resident_fallback_request_alpha',
      carrier_session_id: 'carrier_session_alpha',
    },
    response: {},
  });

  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Session Evidence:/);
  assert.doesNotMatch(text, /Task Review:/);
  assert.doesNotMatch(text, /Task Workflow:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /--url unknown/);
});
