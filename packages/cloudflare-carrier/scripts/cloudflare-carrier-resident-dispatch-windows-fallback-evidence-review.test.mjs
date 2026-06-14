import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatResidentDispatchWindowsFallbackEvidenceReviewText,
  parseResidentDispatchWindowsFallbackEvidenceReviewArgs,
  readResidentDispatchWindowsFallbackEvidenceReview,
} from './cloudflare-carrier-resident-dispatch-windows-fallback-evidence-review.mjs';

test('parseResidentDispatchWindowsFallbackEvidenceReviewArgs adds focused evidence limits', () => {
  const parsed = parseResidentDispatchWindowsFallbackEvidenceReviewArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--token', 'token-value',
    '--evidence-limit', '4',
  ], {});

  assert.equal(parsed.params.operation_id, 'operation_alpha');
  assert.equal(parsed.params.resident_dispatch_windows_fallback_evidence_limit, 4);
});

test('parseResidentDispatchWindowsFallbackEvidenceReviewArgs supports direct focused review without operation id', () => {
  const parsed = parseResidentDispatchWindowsFallbackEvidenceReviewArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_alpha',
    '--token', 'token-value',
    '--focus-ref', 'resident_dispatch_windows_fallback_evidence_alpha',
  ], {});

  assert.equal(parsed.operation, 'resident_dispatch.windows_fallback_evidence.list');
  assert.equal(parsed.params.site_id, 'site_alpha');
  assert.equal(parsed.params.resident_dispatch_windows_fallback_evidence_limit, 200);
});

test('readResidentDispatchWindowsFallbackEvidenceReview summarizes focused evidence and review state', async () => {
  const result = await readResidentDispatchWindowsFallbackEvidenceReview({
    workerUrl: 'https://carrier.example',
    operation: 'operation.read',
    requestId: 'request_alpha',
    format: 'json',
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      resident_dispatch_windows_fallback_evidence_limit: 4,
    },
    focusRef: 'resident_dispatch_windows_fallback_evidence_alpha',
  }, async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.operation === 'operation.read') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            operation: { site_id: 'site_alpha', operation_id: 'operation_alpha', status: 'active' },
            operation_workflow_route: {
              next_action: 'review_windows_fallback_resident_dispatch_evidence',
              reason: 'windows_fallback_execution_recorded',
              focus_ref: 'resident_dispatch_windows_fallback_evidence_alpha',
            },
            operation_focus_reviews: [{
              review_id: 'focus_review_alpha',
              focus_kind: 'resident_dispatch_windows_fallback_evidence',
              focus_ref: 'resident_dispatch_windows_fallback_evidence_alpha',
              review_status: 'acknowledged',
              recorded_at: '2026-06-12T16:46:00.000Z',
            }],
          });
        },
      };
    }
    if (body.operation === 'resident_dispatch.windows_fallback_evidence.list') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            site_id: 'site_alpha',
            resident_dispatch_windows_fallback_evidence_authority: 'windows_local_site_resident_loop',
            resident_dispatch_windows_fallback_evidence: [{
              fallback_evidence_id: 'resident_dispatch_windows_fallback_evidence_alpha',
              fallback_request_id: 'resident_dispatch_windows_fallback_request_alpha',
              carrier_session_id: 'carrier_session_alpha',
              dispatch_decision_id: 'resident_dispatch_alpha',
              local_execution_id: 'windows_execution_alpha',
              local_execution_status: 'completed',
              local_session_start_admission: 'admitted_by_windows_resident_loop',
              direct_cloudflare_session_start_admission: 'not_admitted',
              local_resident_session_ref: 'windows-session://operation_alpha/1',
              local_executor_authority: 'windows_local_site_resident_loop',
              recorded_at: '2026-06-12T16:45:00.000Z',
              recorded_by_principal_id: 'principal:windows',
            }],
          });
        },
      };
    }
    throw new Error(`unexpected_operation:${body.operation}`);
  });

  assert.equal(result.summary.focused_fallback_evidence_id, 'resident_dispatch_windows_fallback_evidence_alpha');
  assert.equal(result.summary.focused_local_execution_id, 'windows_execution_alpha');
  assert.equal(result.summary.carrier_session_id, 'carrier_session_alpha');
  assert.equal(result.summary.latest_focus_review.review_status, 'acknowledged');
});

test('readResidentDispatchWindowsFallbackEvidenceReview supports direct focused review without operation read', async () => {
  const calls = [];
  const result = await readResidentDispatchWindowsFallbackEvidenceReview({
    workerUrl: 'https://carrier.example',
    operation: 'resident_dispatch.windows_fallback_evidence.list',
    requestId: 'request_beta',
    format: 'json',
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      resident_dispatch_windows_fallback_evidence_limit: 200,
    },
    focusRef: 'resident_dispatch_windows_fallback_evidence_alpha',
  }, async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.operation === 'resident_dispatch.windows_fallback_evidence.list') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            site_id: 'site_alpha',
            resident_dispatch_windows_fallback_evidence_authority: 'windows_local_site_resident_loop',
            resident_dispatch_windows_fallback_evidence: [
              {
                fallback_evidence_id: 'resident_dispatch_windows_fallback_evidence_alpha',
                operation_id: 'operation_alpha',
                cloudflare_carrier_session_id: 'carrier_session_alpha',
                local_execution_id: 'windows_execution_alpha',
                local_execution_status: 'completed',
              },
              {
                fallback_evidence_id: 'resident_dispatch_windows_fallback_evidence_beta',
                operation_id: 'operation_beta',
                local_execution_id: 'windows_execution_beta',
                local_execution_status: 'completed',
              },
            ],
          });
        },
      };
    }
    throw new Error(`unexpected_operation:${body.operation}`);
  });

  assert.deepEqual(calls.map((entry) => entry.operation), [
    'resident_dispatch.windows_fallback_evidence.list',
  ]);
  assert.equal(result.summary.evidence_count, 1);
  assert.equal(result.summary.operation_id, 'operation_alpha');
  assert.equal(result.summary.carrier_session_id, 'carrier_session_alpha');
  assert.equal(result.summary.focused_fallback_evidence_id, 'resident_dispatch_windows_fallback_evidence_alpha');
});

test('readResidentDispatchWindowsFallbackEvidenceReview fails explicitly when focused evidence is missing', async () => {
  await assert.rejects(() => readResidentDispatchWindowsFallbackEvidenceReview({
    workerUrl: 'https://carrier.example',
    operation: 'resident_dispatch.windows_fallback_evidence.list',
    requestId: 'request_gamma',
    format: 'json',
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      resident_dispatch_windows_fallback_evidence_limit: 200,
    },
    focusRef: 'missing_evidence',
  }, async () => ({
    status: 200,
    async text() {
      return JSON.stringify({
        ok: true,
        site_id: 'site_alpha',
        resident_dispatch_windows_fallback_evidence: [
          { fallback_evidence_id: 'resident_dispatch_windows_fallback_evidence_alpha' },
        ],
      });
    },
  })), /resident_dispatch_windows_fallback_evidence_review_focus_not_found:missing_evidence/);
});
test('formatResidentDispatchWindowsFallbackEvidenceReviewText prints review ack command', () => {
  const text = formatResidentDispatchWindowsFallbackEvidenceReviewText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      workflow_next_action: 'review_windows_fallback_resident_dispatch_evidence',
      workflow_reason: 'windows_fallback_execution_recorded',
      evidence_count: 1,
      focused_fallback_evidence_id: 'resident_dispatch_windows_fallback_evidence_alpha',
      focused_local_execution_id: 'windows_execution_alpha',
      focused_local_execution_status: 'completed',
      carrier_session_id: 'carrier_session_alpha',
      focused_local_session_start_admission: 'admitted_by_windows_resident_loop',
      focused_direct_cloudflare_session_start_admission: 'not_admitted',
      latest_focus_review: {
        focus_kind: 'resident_dispatch_windows_fallback_evidence',
        focus_ref: 'resident_dispatch_windows_fallback_evidence_alpha',
        review_status: 'acknowledged',
      },
    },
  });

  assert.match(text, /Resident Dispatch Windows Fallback Evidence Review: ok/);
  assert.match(text, /Focused Review: resident_dispatch_windows_fallback_evidence:resident_dispatch_windows_fallback_evidence_alpha status=acknowledged/);
  assert.match(text, /Cloudflare Carrier Session: carrier_session_alpha/);
  assert.match(text, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example --site site_alpha --carrier-session-id carrier_session_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example --site site_alpha --carrier-session-id carrier_session_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --carrier-session-id carrier_session_alpha --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
  assert.match(text, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text/);
  assert.match(text, /--focus-kind resident_dispatch_windows_fallback_evidence/);
});

test('formatResidentDispatchWindowsFallbackEvidenceReviewText suppresses next workflow for passive routes', () => {
  const text = formatResidentDispatchWindowsFallbackEvidenceReviewText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      workflow_next_action: 'monitor_operation',
      workflow_reason: 'complete',
      evidence_count: 1,
      focused_fallback_evidence_id: 'resident_dispatch_windows_fallback_evidence_alpha',
    },
  });

  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
});

test('formatResidentDispatchWindowsFallbackEvidenceReviewText omits synthetic operation ids from review ack', () => {
  const text = formatResidentDispatchWindowsFallbackEvidenceReviewText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      workflow_next_action: 'review_windows_fallback_resident_dispatch_evidence',
      workflow_reason: 'windows_fallback_execution_recorded',
      evidence_count: 1,
      focused_fallback_evidence_id: 'resident_dispatch_windows_fallback_evidence_alpha',
    },
  });

  assert.match(text, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text -- --url https:\/\/carrier\.example --site site_alpha --focus-kind resident_dispatch_windows_fallback_evidence --focus-ref resident_dispatch_windows_fallback_evidence_alpha --operator-session-file <operator-session-file>/);
  assert.doesNotMatch(text, /Review Ack:.*<operation-id>/);
});
