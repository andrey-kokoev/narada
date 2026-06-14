import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatOperationEvidenceReadText,
  parseOperationEvidenceReadArgs,
  readOperationEvidence,
  summarizeOperationEvidence,
} from './cloudflare-carrier-operation-evidence-read.mjs';

test('parseOperationEvidenceReadArgs reuses operation.read auth and ids', () => {
  const parsed = parseOperationEvidenceReadArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_alpha',
    '--token', 'token-value',
    '--format', 'text',
    '--event-limit', '3',
    '--activity-limit', '2',
  ], {});

  assert.equal(parsed.operation, 'operation.read');
  assert.deepEqual(parsed.params, { site_id: 'site_live_smoke', operation_id: 'operation_alpha' });
  assert.equal(parsed.eventLimit, 3);
  assert.equal(parsed.activityLimit, 2);
});

test('summarizeOperationEvidence condenses operation response into operator evidence view', () => {
  const summary = summarizeOperationEvidence({
    operation: { operation_id: 'operation_alpha', site_id: 'site_live_smoke', status: 'active' },
    operation_lifecycle_status: { phase: 'inhabited', health: 'ready', next_action: 'monitor_operation' },
    operation_posture_route: { next_action: 'focus_next_operation' },
    carrier_evidence_read_status: { state: 'loaded' },
    sessions: [{ carrier_session_id: 'session_1' }],
    carrier_evidence: [{
      carrier_session_id: 'session_1',
      events: [
        { sequence: 1, event_kind: 'carrier_session_started' },
        { sequence: 2, event_kind: 'turn_completed' },
      ],
    }],
    operation_activity_timeline: {
      items: [
        { activity_kind: 'carrier_evidence_event', focus_kind: 'carrier_evidence_event', focus_ref: 'session_1:2', summary: 'turn completed' },
      ],
    },
    operation_focus_reviews: [{
      review_id: 'review_1',
      focus_kind: 'carrier_evidence_event',
      focus_ref: 'session_1:2',
      review_status: 'acknowledged',
      recorded_at: '2026-06-11T00:00:00.000Z',
    }],
  }, {
    operationSummary: { operation_id: 'operation_alpha', site_id: 'site_live_smoke' },
    eventLimit: 5,
    activityLimit: 5,
  });

  assert.equal(summary.operation_id, 'operation_alpha');
  assert.equal(summary.carrier_evidence_read_state, 'loaded');
  assert.deepEqual(summary.carrier_session_ids, ['session_1']);
  assert.equal(summary.local_resident_carrier_bridge_state, 'not_observed');
  assert.equal(summary.carrier_event_count, 2);
  assert.equal(summary.recent_carrier_events.at(-1).event_kind, 'turn_completed');
  assert.equal(summary.recent_activities[0].focus_ref, 'session_1:2');
  assert.equal(summary.latest_focus_review.review_id, 'review_1');
});

test('readOperationEvidence preserves product read envelope and text formatting stays concise', async () => {
  const result = await readOperationEvidence({
    workerUrl: 'https://carrier.example',
    operation: 'operation.read',
    requestId: 'evidence_fixture',
    params: { site_id: 'site_live_smoke', operation_id: 'operation_alpha' },
    format: 'json',
    eventLimit: 2,
    activityLimit: 2,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
  }, async () => ({
    status: 200,
    async text() {
      return JSON.stringify({
        ok: true,
        operation: { operation_id: 'operation_alpha', site_id: 'site_live_smoke', status: 'active' },
        operation_lifecycle_status: { phase: 'inhabited', health: 'ready', next_action: 'monitor_operation' },
        carrier_evidence_read_status: { state: 'loaded' },
        sessions: [{ carrier_session_id: 'session_1' }],
        carrier_evidence: [{ carrier_session_id: 'session_1', events: [{ sequence: 7, event_kind: 'tool_result_received' }] }],
        operation_activity_timeline: { items: [{ activity_kind: 'carrier_evidence_event', focus_ref: 'session_1:7', summary: 'tool result' }] },
        operation_focus_reviews: [],
      });
    },
  }));

  assert.equal(result.schema, 'narada.cloudflare_carrier.operation_evidence_read.v1');
  assert.equal(result.summary.carrier_event_count, 1);
  const text = formatOperationEvidenceReadText(result);
  assert.match(text, /Operation Evidence Read: ok/);
  assert.match(text, /Carrier Sessions: session_1/);
  assert.match(text, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example --site site_live_smoke --carrier-session-id session_1 --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example --site site_live_smoke --carrier-session-id session_1 --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --carrier-session-id session_1 --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.match(text, /tool_result_received/);
  assert.match(text, /Recovery Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:recovery:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Persistence Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:persistence:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_alpha --operator-session-file <operator-session-file>/);
});

test('formatOperationEvidenceReadText emits direct workflow handoff when the workflow route is explicit', () => {
  const text = formatOperationEvidenceReadText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      phase: 'inhabited',
      health: 'ready',
      current_status: 'active',
      next_action: 'monitor_operation',
      posture_next_action: 'focus_next_operation',
      workflow_next_action: 'review_site_continuity_reconciliation_execution',
      workflow_focus_kind: 'site_continuity_reconciliation_execution',
      workflow_focus_ref: 'site-continuity-reconciliation-execution:site_alpha:current',
      carrier_evidence_read_state: 'loaded',
      carrier_session_ids: ['session_1'],
      carrier_event_count: 1,
    },
  });

  assert.match(text, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --focus-kind site_continuity_reconciliation_execution --focus-ref site-continuity-reconciliation-execution:site_alpha:current --operator-session-file <operator-session-file>/);
  assert.match(text, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example --site site_alpha --carrier-session-id session_1 --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example --site site_alpha --carrier-session-id session_1 --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --carrier-session-id session_1 --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
});

test('formatOperationEvidenceReadText recognizes Windows fallback evidence as reviewable focus', () => {
  const text = formatOperationEvidenceReadText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      phase: 'active_uninhabited',
      health: 'incomplete',
      current_status: 'active',
      next_action: 'session',
      posture_next_action: 'monitor_operations',
      carrier_evidence_read_state: 'no_sessions',
      carrier_session_ids: [],
      local_resident_session_refs: ['windows-session://operation_alpha/1'],
      local_resident_session_count: 1,
      local_resident_carrier_bridge_state: 'not_admitted_to_cloudflare_carrier_session',
      carrier_event_count: 0,
      recent_activities: [{
        activity_kind: 'resident_dispatch_windows_fallback_evidence',
        focus_kind: 'resident_dispatch_windows_fallback_evidence',
        focus_ref: 'resident_dispatch_windows_fallback_evidence_alpha',
        summary: 'fallback execution recorded',
      }],
      reviewable_focus_kind: 'resident_dispatch_windows_fallback_evidence',
      reviewable_focus_ref: 'resident_dispatch_windows_fallback_evidence_alpha',
    },
  });

  assert.match(text, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text/);
  assert.match(text, /--focus-kind resident_dispatch_windows_fallback_evidence/);
  assert.match(text, /Local Resident Evidence: sessions=1 bridge=not_admitted_to_cloudflare_carrier_session/);
  assert.match(text, /Local Resident Sessions: windows-session:\/\/operation_alpha\/1/);
  assert.match(text, /Reviewable Focus: resident_dispatch_windows_fallback_evidence:resident_dispatch_windows_fallback_evidence_alpha/);
});

test('formatOperationEvidenceReadText distinguishes current reviewable focus from latest acknowledged review', () => {
  const text = formatOperationEvidenceReadText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      phase: 'inhabited',
      health: 'ready',
      current_status: 'active',
      next_action: 'monitor_operation',
      posture_next_action: 'monitor_operations',
      carrier_evidence_read_state: 'partial',
      carrier_session_ids: ['session_1'],
      carrier_event_count: 1,
      latest_focus_review: {
        focus_kind: 'site_continuity_reconciliation_execution',
        focus_ref: 'site-continuity-reconciliation-execution:site_alpha:older',
        review_status: 'acknowledged',
      },
      reviewable_focus_kind: 'site_continuity_reconciliation_execution',
      reviewable_focus_ref: 'site-continuity-reconciliation-execution:site_alpha:newer',
    },
  });

  assert.match(text, /Reviewable Focus: site_continuity_reconciliation_execution:site-continuity-reconciliation-execution:site_alpha:newer/);
  assert.match(text, /Latest Review: site_continuity_reconciliation_execution:site-continuity-reconciliation-execution:site_alpha:older status=acknowledged/);
  assert.match(text, /Recovery Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:recovery:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Persistence Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:persistence:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
});

test('formatOperationEvidenceReadText omits synthetic operation ids from review ack', () => {
  const text = formatOperationEvidenceReadText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      phase: 'inhabited',
      health: 'ready',
      current_status: 'active',
      next_action: 'monitor_operation',
      reviewable_focus_kind: 'site_continuity_reconciliation_execution',
      reviewable_focus_ref: 'site-continuity-reconciliation-execution:site_alpha:current',
    },
  });

  assert.match(text, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text -- --url https:\/\/carrier\.example --site site_alpha --focus-kind site_continuity_reconciliation_execution --focus-ref site-continuity-reconciliation-execution:site_alpha:current --operator-session-file <operator-session-file>/);
  assert.doesNotMatch(text, /Review Ack:.*<operation-id>/);
});

test('formatOperationEvidenceReadText suppresses workflow links without a real operation id', () => {
  const text = formatOperationEvidenceReadText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      workflow_next_action: 'refresh_site_continuity_loop',
      workflow_reason: 'operation_lifecycle_continuity_loop_stale',
      workflow_focus_kind: 'site_continuity_reconciliation_execution',
      workflow_focus_ref: 'site-continuity-reconciliation-execution:site_alpha:current',
      phase: 'inhabited',
      health: 'ready',
      current_status: 'active',
      next_action: 'monitor_operation',
    },
  });

  assert.doesNotMatch(text, /Continuity Workflow:/);
  assert.doesNotMatch(text, /Review Ack:.*<operation-id>/);
});

test('formatOperationEvidenceReadText suppresses operator handoff without a real site id', () => {
  const text = formatOperationEvidenceReadText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      operation_id: 'operation_alpha',
      workflow_next_action: 'review_site_continuity_reconciliation_execution',
      workflow_focus_kind: 'site_continuity_reconciliation_execution',
      workflow_focus_ref: 'site-continuity-reconciliation-execution:site_alpha:current',
      reviewable_focus_kind: 'site_continuity_reconciliation_execution',
      reviewable_focus_ref: 'site-continuity-reconciliation-execution:site_alpha:current',
      phase: 'inhabited',
      health: 'ready',
      current_status: 'active',
      next_action: 'monitor_operation',
      carrier_evidence_read_state: 'loaded',
    },
  });

  assert.doesNotMatch(text, /Review Ack:/);
  assert.doesNotMatch(text, /Recovery Read:/);
  assert.doesNotMatch(text, /Persistence Read:/);
  assert.doesNotMatch(text, /<site-id>/);
});

test('summarizeOperationEvidence makes local resident evidence posture explicit without inventing a Cloudflare session', () => {
  const summary = summarizeOperationEvidence({
    operation: { operation_id: 'operation_alpha', site_id: 'site_live_smoke', status: 'active' },
    operation_lifecycle_status: { phase: 'inhabited', health: 'incomplete', next_action: 'local_resident_carrier_evidence' },
    operation_posture_route: { next_action: 'focus_next_operation' },
    carrier_evidence_read_status: { state: 'no_sessions' },
    sessions: [],
    carrier_evidence: [],
    resident_dispatch_windows_fallback_evidence: [{
      fallback_evidence_id: 'resident_dispatch_windows_fallback_evidence_alpha',
      operation_id: 'operation_alpha',
      local_session_start_admission: 'admitted_by_windows_resident_loop',
      local_resident_session_ref: 'windows-session://operation_alpha/1',
    }],
    operation_activity_timeline: { items: [] },
    operation_focus_reviews: [],
  }, {
    operationSummary: { operation_id: 'operation_alpha', site_id: 'site_live_smoke' },
    eventLimit: 5,
    activityLimit: 5,
  });

  assert.equal(summary.next_action, 'local_resident_carrier_evidence');
  assert.equal(summary.carrier_evidence_read_state, 'no_sessions');
  assert.equal(summary.local_resident_session_count, 1);
  assert.deepEqual(summary.local_resident_session_refs, ['windows-session://operation_alpha/1']);
  assert.equal(summary.local_resident_carrier_bridge_state, 'not_admitted_to_cloudflare_carrier_session');
});
