import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatResidentDispatchWindowsFallbackEvidenceText,
  parseResidentDispatchWindowsFallbackEvidenceArgs,
  runResidentDispatchWindowsFallbackEvidence,
} from './cloudflare-carrier-resident-dispatch-windows-fallback-evidence.mjs';

test('parseResidentDispatchWindowsFallbackEvidenceArgs builds put payload with defaults', () => {
  const parsed = parseResidentDispatchWindowsFallbackEvidenceArgs([
    '--url', 'https://carrier.example/',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_live_alpha',
    '--dispatch-decision-id', 'resident_dispatch_alpha',
    '--fallback-request-id', 'resident_fallback_request_alpha',
    '--local-execution-id', 'windows_execution_alpha',
    '--local-resident-session-ref', 'windows-session://operation_live_alpha/1',
    '--operator-session-cookie', 'operator-session-cookie',
  ], {}, () => Date.parse('2026-06-12T00:00:00.000Z'));

  assert.equal(parsed.operation, 'resident_dispatch.windows_fallback_evidence.put');
  assert.equal(parsed.workerUrl, 'https://carrier.example');
  assert.equal(parsed.auth.kind, 'operator_session');
  assert.equal(parsed.params.site_id, 'site_live_smoke');
  assert.equal(parsed.params.source_payload.fallback_request_id, 'resident_fallback_request_alpha');
  assert.equal(parsed.params.source_payload.local_execution_id, 'windows_execution_alpha');
  assert.equal(parsed.params.source_payload.local_session_start_admission, 'admitted_by_windows_resident_loop');
  assert.equal(parsed.params.source_payload.direct_cloudflare_session_start_admission, 'not_admitted');
});

test('parseResidentDispatchWindowsFallbackEvidenceArgs builds list payload', () => {
  const parsed = parseResidentDispatchWindowsFallbackEvidenceArgs([
    '--operation', 'list',
    '--url', 'https://carrier.example/',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_live_alpha',
    '--token', 'token-value',
    '--limit', '2',
  ], {});

  assert.equal(parsed.operation, 'resident_dispatch.windows_fallback_evidence.list');
  assert.deepEqual(parsed.params, {
    site_id: 'site_live_smoke',
    operation_id: 'operation_live_alpha',
    limit: 2,
  });
});

test('runResidentDispatchWindowsFallbackEvidence reads list posture', async () => {
  const result = await runResidentDispatchWindowsFallbackEvidence({
    operation: 'resident_dispatch.windows_fallback_evidence.list',
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
        evidence: [{
          fallback_evidence_id: 'resident_fallback_evidence_alpha',
          fallback_request_id: 'resident_fallback_request_alpha',
          operation_id: 'operation_live_alpha',
          carrier_session_id: 'carrier_session_alpha',
          dispatch_decision_id: 'resident_dispatch_alpha',
          local_execution_id: 'windows_execution_alpha',
          local_session_start_admission: 'admitted_by_windows_resident_loop',
          direct_cloudflare_session_start_admission: 'not_admitted',
          local_resident_session_ref: 'windows-session://operation_live_alpha/1',
          local_executor_authority: 'windows_local_site_resident_loop',
        }],
      };
    },
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.summary.evidence_count, 1);
  assert.equal(result.summary.fallback_evidence_id, 'resident_fallback_evidence_alpha');
  assert.equal(result.summary.local_execution_id, 'windows_execution_alpha');
  assert.equal(result.summary.carrier_session_id, 'carrier_session_alpha');
});

test('formatResidentDispatchWindowsFallbackEvidenceText prints key posture', () => {
  const text = formatResidentDispatchWindowsFallbackEvidenceText({
    operation: 'resident_dispatch.windows_fallback_evidence.list',
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-cookie',
    site_id: 'site_live_smoke',
    operation_id: 'operation_live_alpha',
    dispatch_decision_id: 'resident_dispatch_alpha',
    http_status: 200,
    status: 'ok',
    summary: {
      evidence_status: 'selected',
      evidence_count: 1,
      fallback_evidence_id: 'resident_fallback_evidence_alpha',
      fallback_request_id: 'resident_fallback_request_alpha',
      local_execution_id: 'windows_execution_alpha',
      local_session_start_admission: 'admitted_by_windows_resident_loop',
      direct_cloudflare_session_start_admission: 'not_admitted',
      local_resident_session_ref: 'windows-session://operation_live_alpha/1',
      local_executor_authority: 'windows_local_site_resident_loop',
      carrier_session_id: 'carrier_session_alpha',
    },
    response: {},
  });

  assert.match(text, /Resident Dispatch Windows Fallback Evidence/);
  assert.match(text, /Operation: resident_dispatch\.windows_fallback_evidence\.list/);
  assert.match(text, /Fallback Evidence: resident_fallback_evidence_alpha/);
  assert.match(text, /Session Start Admission: admitted_by_windows_resident_loop/);
  assert.match(text, /Cloudflare Carrier Session: carrier_session_alpha/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example --site site_live_smoke --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --operator-session-file <operator-session-file>/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --operator-session-file <operator-session-file>/);
  assert.match(text, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example --site site_live_smoke --carrier-session-id carrier_session_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example --site site_live_smoke --carrier-session-id carrier_session_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --carrier-session-id carrier_session_alpha --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.match(text, /Resident Dispatch Windows Fallback Evidence Review: pnpm --filter @narada2\/cloudflare-carrier product:resident-dispatch:windows-fallback-evidence:review:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file>/);
});

test('formatResidentDispatchWindowsFallbackEvidenceText suppresses worker-scoped handoffs without worker url', () => {
  const text = formatResidentDispatchWindowsFallbackEvidenceText({
    site_id: 'site_live_smoke',
    operation_id: 'operation_live_alpha',
    status: 'ok',
    summary: {
      fallback_evidence_id: 'resident_fallback_evidence_alpha',
      carrier_session_id: 'carrier_session_alpha',
    },
    response: {},
  });

  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Posture Coherence Review:/);
  assert.doesNotMatch(text, /Durability Coherence Review:/);
  assert.doesNotMatch(text, /Session Evidence:/);
  assert.doesNotMatch(text, /Task Review:/);
  assert.doesNotMatch(text, /Task Workflow:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /Fallback Evidence Review:/);
  assert.doesNotMatch(text, /--url unknown/);
});
