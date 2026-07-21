import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatOperationRecoveryReadText,
  parseOperationRecoveryReadArgs,
  readOperationRecovery,
  summarizeOperationRecovery,
} from '../read-models/cloudflare-carrier-operation-recovery-read.mjs';

test('parseOperationRecoveryReadArgs reuses operation.read parsing', () => {
  const parsed = parseOperationRecoveryReadArgs([
    '--url', 'https://carrier.example.test',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--format', 'text',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.operation, 'operation.read');
  assert.equal(parsed.params.site_id, 'site_alpha');
  assert.equal(parsed.params.operation_id, 'operation_alpha');
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.auth.kind, 'operator_session');
});

test('summarizeOperationRecovery lifts recovery posture from operation.read summary', () => {
  const summary = summarizeOperationRecovery({
    operation: { site_id: 'site_alpha', operation_id: 'operation_alpha', status: 'active' },
    operation_lifecycle_status: { phase: 'inhabited', health: 'incomplete', next_action: 'local_resident_carrier_evidence' },
  }, {
    operationSummary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      current_status: 'active',
      phase: 'inhabited',
      health: 'incomplete',
      next_action: 'local_resident_carrier_evidence',
      workflow_next_action: 'review_recovery_posture',
      workflow_reason: 'recovery_posture_needs_attention',
      workflow_focus_ref: 'local_resident_carrier_evidence_not_admitted',
      recovery_state: 'local_resident_inhabitance_not_replayable',
      recovery_boundary_count: 12,
      recovery_boundary_keys: ['operation_status', 'operation_sessions'],
      recovery_gap_count: 1,
      recovery_gap_keys: ['local_resident_carrier_evidence_not_admitted'],
      recovery_next_action: 'local_resident_carrier_evidence_not_admitted',
    },
  });

  assert.equal(summary.workflow_next_action, 'review_recovery_posture');
  assert.equal(summary.lifecycle_next_action, 'local_resident_carrier_evidence');
  assert.equal(summary.recovery_state, 'local_resident_inhabitance_not_replayable');
  assert.deepEqual(summary.recovery_gap_keys, ['local_resident_carrier_evidence_not_admitted']);
});

test('readOperationRecovery returns summarized recovery posture', async () => {
  const result = await readOperationRecovery({
    workerUrl: 'https://carrier.example.test',
    operation: 'operation.read',
    params: { site_id: 'site_alpha', operation_id: 'operation_alpha' },
    auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
  }, async () => ({
    status: 200,
    ok: true,
    text: async () => JSON.stringify({
      operation: { site_id: 'site_alpha', operation_id: 'operation_alpha', status: 'active' },
      operation_lifecycle_status: { phase: 'inhabited', health: 'incomplete', next_action: 'local_resident_carrier_evidence' },
      operation_workflow_route: {
        next_action: 'review_recovery_posture',
        reason: 'recovery_posture_needs_attention',
        target: 'local_resident_carrier_evidence_not_admitted',
      },
      cloudflare_recovery_posture: {
        state: 'local_resident_inhabitance_not_replayable',
        recovery_boundary_count: 12,
        recovery_boundaries: [{ key: 'operation_status' }],
        recovery_gaps: [{ key: 'local_resident_carrier_evidence_not_admitted' }],
        next_action: 'local_resident_carrier_evidence_not_admitted',
      },
    }),
    json: async () => ({
      operation: { site_id: 'site_alpha', operation_id: 'operation_alpha', status: 'active' },
      operation_lifecycle_status: { phase: 'inhabited', health: 'incomplete', next_action: 'local_resident_carrier_evidence' },
      operation_workflow_route: {
        next_action: 'review_recovery_posture',
        reason: 'recovery_posture_needs_attention',
        target: 'local_resident_carrier_evidence_not_admitted',
      },
      cloudflare_recovery_posture: {
        state: 'local_resident_inhabitance_not_replayable',
        recovery_boundary_count: 12,
        recovery_boundaries: [{ key: 'operation_status' }],
        recovery_gaps: [{ key: 'local_resident_carrier_evidence_not_admitted' }],
        next_action: 'local_resident_carrier_evidence_not_admitted',
      },
    }),
  }));

  assert.equal(result.schema, 'narada.cloudflare_carrier.operation_recovery_read.v1');
  assert.equal(result.summary.workflow_next_action, 'review_recovery_posture');
  assert.equal(result.summary.recovery_next_action, 'local_resident_carrier_evidence_not_admitted');
});

test('formatOperationRecoveryReadText prints recovery posture and evidence handoff', () => {
  const text = formatOperationRecoveryReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      workflow_next_action: 'review_recovery_posture',
      workflow_reason: 'recovery_posture_needs_attention',
      workflow_focus_kind: 'site_continuity_reconciliation_execution',
      workflow_focus_ref: 'site-continuity-reconciliation-execution:site_alpha:current',
      current_status: 'active',
      phase: 'inhabited',
      health: 'incomplete',
      lifecycle_next_action: 'local_resident_carrier_evidence',
      recovery_state: 'local_resident_inhabitance_not_replayable',
      recovery_boundary_count: 12,
      recovery_boundary_keys: ['operation_status', 'operation_sessions'],
      recovery_gap_count: 1,
      recovery_gap_keys: ['local_resident_carrier_evidence_not_admitted'],
      recovery_next_action: 'local_resident_carrier_evidence_not_admitted',
    },
  });

  assert.match(text, /Operation Recovery Read: ok/);
  assert.match(text, /Recovery: state=local_resident_inhabitance_not_replayable boundaries=12 gaps=1/);
  assert.match(text, /Recovery Next: action=local_resident_carrier_evidence_not_admitted gaps=local_resident_carrier_evidence_not_admitted/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.match(text, /Persistence Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:persistence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Evidence Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:evidence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
});

test('formatOperationRecoveryReadText emits direct workflow handoff when the workflow route moves beyond recovery', () => {
  const text = formatOperationRecoveryReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      workflow_next_action: 'refresh_site_continuity_loop',
      workflow_reason: 'operation_lifecycle_continuity_loop_stale',
      current_status: 'active',
      phase: 'inhabited',
      health: 'ready',
      lifecycle_next_action: 'monitor_operation',
      recovery_state: 'reconstructable',
      recovery_boundary_count: 12,
      recovery_gap_count: 0,
    },
  });

  assert.match(text, /Continuity Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --expected-pre-action refresh_site_continuity_loop --operator-session-file <operator-session-file> --execute-operation-continuity/);
});

test('formatOperationRecoveryReadText suppresses workflow links without a real operation id', () => {
  const text = formatOperationRecoveryReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      workflow_next_action: 'resume_operation_continuation',
      workflow_reason: 'continuation_required',
      current_status: 'active',
      phase: 'inhabited',
      health: 'ready',
      lifecycle_next_action: 'monitor_operation',
      recovery_state: 'reconstructable',
      recovery_boundary_count: 12,
      recovery_gap_count: 0,
    },
  });

  assert.doesNotMatch(text, /Continuation Workflow:/);
});

test('formatOperationRecoveryReadText suppresses operator handoff without a real site id', () => {
  const text = formatOperationRecoveryReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation_id: 'operation_alpha',
      workflow_next_action: 'refresh_site_continuity_loop',
      workflow_reason: 'operation_lifecycle_continuity_loop_stale',
      current_status: 'active',
      phase: 'inhabited',
      health: 'ready',
      lifecycle_next_action: 'monitor_operation',
      recovery_state: 'reconstructable',
      recovery_boundary_count: 12,
      recovery_gap_count: 0,
    },
  });

  assert.doesNotMatch(text, /Continuity Workflow:/);
  assert.doesNotMatch(text, /Persistence Read:/);
  assert.doesNotMatch(text, /Evidence Read:/);
  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /<site-id>/);
});

test('formatOperationRecoveryReadText suppresses operator handoff without a real worker url', () => {
  const text = formatOperationRecoveryReadText({
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      workflow_next_action: 'refresh_site_continuity_loop',
      workflow_reason: 'operation_lifecycle_continuity_loop_stale',
      current_status: 'active',
      phase: 'inhabited',
      health: 'ready',
      lifecycle_next_action: 'monitor_operation',
      recovery_state: 'reconstructable',
      recovery_boundary_count: 12,
      recovery_gap_count: 0,
    },
  });

  assert.doesNotMatch(text, /Continuity Workflow:/);
  assert.doesNotMatch(text, /Persistence Read:/);
  assert.doesNotMatch(text, /Evidence Read:/);
  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /<worker-url>/);
});
