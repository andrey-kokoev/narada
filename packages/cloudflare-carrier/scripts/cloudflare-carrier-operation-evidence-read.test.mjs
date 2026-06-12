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
  assert.match(text, /tool_result_received/);
});
