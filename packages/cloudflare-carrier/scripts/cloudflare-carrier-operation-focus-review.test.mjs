import assert from 'node:assert/strict';
import test from 'node:test';

import {
  callOperationFocusReview,
  formatOperationFocusReviewText,
  parseOperationFocusReviewArgs,
  summarizeOperationFocusReview,
} from './cloudflare-carrier-operation-focus-review.mjs';

test('parseOperationFocusReviewArgs builds acknowledge payload', () => {
  const parsed = parseOperationFocusReviewArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--focus-kind', 'site_continuity_reconciliation_execution',
    '--focus-ref', 'reconciliation_1',
    '--note', 'reviewed',
    '--request-id', 'request_focus_review_1',
    '--format', 'text',
  ], {}, () => 1234);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.operation, 'operation_focus_review.acknowledge');
  assert.equal(parsed.requestId, 'request_focus_review_1');
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    focus_kind: 'site_continuity_reconciliation_execution',
    focus_ref: 'reconciliation_1',
    review_action: 'acknowledge_operation_focus_review',
    review_status: 'acknowledged',
    generated_at: parsed.params.generated_at,
    note: 'reviewed',
  });
});

test('parseOperationFocusReviewArgs builds list payload', () => {
  const parsed = parseOperationFocusReviewArgs([
    '--operation', 'operation_focus_review.list',
    '--url', 'https://carrier.example.test',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--limit', '4',
  ], {}, () => 99);

  assert.equal(parsed.operation, 'operation_focus_review.list');
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
  assert.deepEqual(parsed.params, { site_id: 'site_alpha', limit: 4, operation_focus_review_limit: 4 });
});

test('parseOperationFocusReviewArgs refuses missing acknowledge inputs', () => {
  assert.throws(
    () => parseOperationFocusReviewArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha'], {}, () => 1),
    /operation_focus_review_acknowledge_requires_--focus-kind/,
  );
  assert.throws(
    () => parseOperationFocusReviewArgs(['--operation', 'unsupported', '--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha'], {}, () => 1),
    /operation_focus_review_operation_unsupported:unsupported/,
  );
});

test('callOperationFocusReview posts acknowledge envelope', async () => {
  const requests = [];
  const result = await callOperationFocusReview({
    workerUrl: 'https://carrier.example.test',
    operation: 'operation_focus_review.acknowledge',
    requestId: 'request_focus_review_1',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      focus_kind: 'site_continuity_reconciliation_execution',
      focus_ref: 'reconciliation_1',
      review_action: 'acknowledge_operation_focus_review',
      review_status: 'acknowledged',
      generated_at: '2026-06-12T05:00:00.000Z',
    },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return responseJson(200, {
      ok: true,
      status: 'acknowledged',
      site_id: 'site_alpha',
      operation_focus_review_authority: 'cloudflare_operator_operation_focus_review',
      review_admission: 'admitted',
      record: {
        review_id: 'review_1',
        site_id: 'site_alpha',
        operation_id: 'operation_alpha',
        focus_kind: 'site_continuity_reconciliation_execution',
        focus_ref: 'reconciliation_1',
        review_action: 'acknowledge_operation_focus_review',
        review_status: 'acknowledged',
        recorded_by_principal_id: 'principal:operator',
        recorded_at: '2026-06-12T05:00:10.000Z',
      },
    });
  });

  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.headers.authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    operation: 'operation_focus_review.acknowledge',
    request_id: 'request_focus_review_1',
    params: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      focus_kind: 'site_continuity_reconciliation_execution',
      focus_ref: 'reconciliation_1',
      review_action: 'acknowledge_operation_focus_review',
      review_status: 'acknowledged',
      generated_at: '2026-06-12T05:00:00.000Z',
    },
  });
  assert.equal(result.summary.focus_kind, 'site_continuity_reconciliation_execution');
});

test('summaries and text output preserve list and refusal evidence', () => {
  const listSummary = summarizeOperationFocusReview('operation_focus_review.list', {
    ok: true,
    status: 'ok',
    site_id: 'site_alpha',
    operation_focus_review_authority: 'cloudflare_operator_operation_focus_review',
    review_admission: 'admitted',
    reviews: [{
      review_id: 'review_1',
      focus_kind: 'site_continuity_reconciliation_execution',
      focus_ref: 'reconciliation_1',
      review_status: 'acknowledged',
      recorded_at: '2026-06-12T05:00:10.000Z',
    }],
  }, { site_id: 'site_alpha' });
  assert.equal(listSummary.review_count, 1);

  const refused = summarizeOperationFocusReview('operation_focus_review.acknowledge', {
    ok: false,
    code: 'operation_focus_review_requires_existing_focus',
  }, {
    site_id: 'site_alpha',
    focus_kind: 'site_continuity_reconciliation_execution',
    focus_ref: 'missing_focus',
  });
  const text = formatOperationFocusReviewText({
    status: 'refused',
    operation: 'operation_focus_review.acknowledge',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    summary: refused,
  });
  assert.match(text, /Operation Focus Review: acknowledge refused/);
  assert.match(text, /Focus: site_continuity_reconciliation_execution:missing_focus/);
});

test('formatOperationFocusReviewText emits direct follow-on operation commands', () => {
  const text = formatOperationFocusReviewText({
    status: 'ok',
    operation: 'operation_focus_review.acknowledge',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation_focus_review.acknowledge',
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      review_id: 'review_1',
      focus_kind: 'site_continuity_reconciliation_execution',
      focus_ref: 'reconciliation_1',
      review_status: 'acknowledged',
    },
  });

  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.match(text, /Review List: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text -- --operation operation_focus_review\.list --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);

  const noWorker = formatOperationFocusReviewText({
    status: 'ok',
    operation: 'operation_focus_review.acknowledge',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation_focus_review.acknowledge',
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      review_id: 'review_1',
      focus_kind: 'site_continuity_reconciliation_execution',
      focus_ref: 'reconciliation_1',
      review_status: 'acknowledged',
    },
  });

  assert.doesNotMatch(noWorker, /Operation Review:/);
  assert.doesNotMatch(noWorker, /Operation Next Workflow:/);
  assert.doesNotMatch(noWorker, /Site Read:/);
  assert.doesNotMatch(noWorker, /Site Next Workflow:/);
  assert.doesNotMatch(noWorker, /Posture Coherence Review:/);
  assert.doesNotMatch(noWorker, /Durability Coherence Review:/);
  assert.doesNotMatch(noWorker, /Review List:/);
});

function responseJson(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
