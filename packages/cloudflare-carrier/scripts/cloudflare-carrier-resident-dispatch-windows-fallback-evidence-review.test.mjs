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
  }, async () => ({
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
        resident_dispatch_windows_fallback_evidence: [{
          fallback_evidence_id: 'resident_dispatch_windows_fallback_evidence_alpha',
          fallback_request_id: 'resident_dispatch_windows_fallback_request_alpha',
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
        operation_focus_reviews: [{
          review_id: 'focus_review_alpha',
          focus_kind: 'resident_dispatch_windows_fallback_evidence',
          focus_ref: 'resident_dispatch_windows_fallback_evidence_alpha',
          review_status: 'acknowledged',
          recorded_at: '2026-06-12T16:46:00.000Z',
        }],
      });
    },
  }));

  assert.equal(result.summary.focused_fallback_evidence_id, 'resident_dispatch_windows_fallback_evidence_alpha');
  assert.equal(result.summary.focused_local_execution_id, 'windows_execution_alpha');
  assert.equal(result.summary.latest_focus_review.review_status, 'acknowledged');
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
      focused_local_session_start_admission: 'admitted_by_windows_resident_loop',
      focused_direct_cloudflare_session_start_admission: 'not_admitted',
    },
  });

  assert.match(text, /Resident Dispatch Windows Fallback Evidence Review: ok/);
  assert.match(text, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text/);
  assert.match(text, /--focus-kind resident_dispatch_windows_fallback_evidence/);
});
