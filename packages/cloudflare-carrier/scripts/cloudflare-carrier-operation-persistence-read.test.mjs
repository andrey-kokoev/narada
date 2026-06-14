import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatOperationPersistenceReadText,
  parseOperationPersistenceReadArgs,
  readOperationPersistence,
  summarizeOperationPersistence,
} from './cloudflare-carrier-operation-persistence-read.mjs';

test('parseOperationPersistenceReadArgs forwards operation.read parsing', () => {
  const config = parseOperationPersistenceReadArgs([
    '--url', 'https://carrier.example.test',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--operator-session-cookie', 'operator_session=test',
  ]);
  assert.equal(config.operation, 'operation.read');
  assert.equal(config.workerUrl, 'https://carrier.example.test');
  assert.deepEqual(config.params, { site_id: 'site_alpha', operation_id: 'operation_alpha' });
  assert.equal(config.auth.kind, 'operator_session');
  assert.equal(config.format, 'json');
});

test('summarizeOperationPersistence condenses persistence posture from operation.read', () => {
  assert.deepEqual(summarizeOperationPersistence({
    operation: { site_id: 'site_alpha', operation_id: 'operation_alpha', status: 'active' },
    operation_lifecycle_status: { phase: 'inhabited', health: 'incomplete', next_action: 'carrier_evidence' },
    cloudflare_persistence_posture: {
      state: 'degraded',
      active_boundary_count: 10,
      durable_boundary_count: 12,
      missing_boundaries: ['cloudflare_site_registry_projection'],
      warnings: ['carrier_evidence_truncated'],
      durable_boundaries: [{ key: 'session_snapshot' }, { key: 'site_registry' }],
      next_action: 'carrier_evidence_truncated',
    },
  }, {
    operationSummary: {
      workflow_next_action: 'review_persistence_posture',
      workflow_reason: 'persistence_posture_needs_attention',
      current_status: 'active',
      phase: 'inhabited',
      health: 'incomplete',
      next_action: 'carrier_evidence',
    },
  }), {
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    workflow_next_action: 'review_persistence_posture',
    workflow_reason: 'persistence_posture_needs_attention',
    workflow_focus_kind: null,
    workflow_focus_ref: null,
    current_status: 'active',
    phase: 'inhabited',
    health: 'incomplete',
    lifecycle_next_action: 'carrier_evidence',
    persistence_state: 'degraded',
    persistence_active_boundary_count: 10,
    persistence_durable_boundary_count: 12,
    persistence_missing_boundaries: ['cloudflare_site_registry_projection'],
    persistence_warning_count: 1,
    persistence_warnings: ['carrier_evidence_truncated'],
    persistence_durable_boundary_keys: ['session_snapshot', 'site_registry'],
    persistence_next_action: 'carrier_evidence_truncated',
  });
});

test('readOperationPersistence returns condensed summary', async () => {
  const result = await readOperationPersistence({
    workerUrl: 'https://carrier.example.test',
    operation: 'operation.read',
    requestId: 'product_read_operation_read_fixture',
    params: { site_id: 'site_alpha', operation_id: 'operation_alpha' },
    auth: { kind: 'operator_session', value: 'operator_session=test', source: 'operator-session-cookie' },
  }, async () => ({
    status: 200,
    async text() {
      return JSON.stringify({
        operation: { site_id: 'site_alpha', operation_id: 'operation_alpha', status: 'active' },
        operation_lifecycle_status: { phase: 'inhabited', health: 'ready', next_action: 'monitor_operation' },
        cloudflare_persistence_posture: { state: 'durable', active_boundary_count: 12, durable_boundary_count: 12, missing_boundaries: [], warnings: [], durable_boundaries: [{ key: 'session_snapshot' }], next_action: 'monitor_persistence_posture' },
      });
    },
  }));
  assert.equal(result.schema, 'narada.cloudflare_carrier.operation_persistence_read.v1');
  assert.equal(result.summary.persistence_state, 'durable');
  assert.equal(result.summary.persistence_active_boundary_count, 12);
});

test('formatOperationPersistenceReadText includes recovery follow-on command', () => {
  const text = formatOperationPersistenceReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      workflow_next_action: 'review_persistence_posture',
      workflow_reason: 'persistence_posture_needs_attention',
      current_status: 'active',
      phase: 'inhabited',
      health: 'incomplete',
      lifecycle_next_action: 'carrier_evidence',
      persistence_state: 'degraded',
      persistence_active_boundary_count: 10,
      persistence_durable_boundary_count: 12,
      persistence_warning_count: 1,
      persistence_missing_boundaries: ['cloudflare_site_registry_projection'],
      persistence_warnings: ['carrier_evidence_truncated'],
      persistence_durable_boundary_keys: ['session_snapshot', 'site_registry'],
      persistence_next_action: 'carrier_evidence_truncated',
    },
  });
  assert.match(text, /Operation Persistence Read: ok/);
  assert.match(text, /Persistence: state=degraded active=10 durable=12 warnings=1/);
  assert.match(text, /Persistence Next: action=carrier_evidence_truncated missing=cloudflare_site_registry_projection warnings=carrier_evidence_truncated/);
  assert.match(text, /Evidence Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:evidence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Recovery Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:recovery:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
});

test('formatOperationPersistenceReadText emits direct workflow handoff when the workflow route moves beyond persistence', () => {
  const text = formatOperationPersistenceReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      workflow_next_action: 'review_recovery_posture',
      workflow_reason: 'recovery_posture_needs_attention',
      current_status: 'active',
      phase: 'inhabited',
      health: 'incomplete',
      lifecycle_next_action: 'carrier_evidence',
      persistence_state: 'degraded',
      persistence_active_boundary_count: 10,
      persistence_durable_boundary_count: 12,
      persistence_warning_count: 0,
      persistence_missing_boundaries: [],
      persistence_warnings: [],
      persistence_durable_boundary_keys: ['session_snapshot'],
    },
  });

  assert.match(text, /Recovery Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:recovery:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
});
