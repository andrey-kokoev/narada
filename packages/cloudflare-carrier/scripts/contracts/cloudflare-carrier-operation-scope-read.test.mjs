import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatOperationScopeReadText,
  parseOperationScopeReadArgs,
  readOperationScope,
  summarizeOperationScope,
} from '../read-models/cloudflare-carrier-operation-scope-read.mjs';

test('parseOperationScopeReadArgs reuses operation.read parsing', () => {
  const parsed = parseOperationScopeReadArgs([
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

test('summarizeOperationScope lifts lifecycle and workflow details', () => {
  const summary = summarizeOperationScope({
    operation: { site_id: 'site_alpha', operation_id: 'operation_alpha', operation_kind: 'mailbox' },
    operation_status_history: { current_status: 'active' },
    operation_lifecycle_status: { phase: 'inhabited', health: 'attention', next_action: 'carrier_evidence', session_count: 1, task_count: 2 },
    operation_workflow_route: { next_action: 'read_operation_scope', reason: 'operation_scope_not_loaded' },
    cloudflare_persistence_posture: { state: 'durable' },
    cloudflare_recovery_posture: { state: 'reconstructable' },
  });

  assert.equal(summary.scope_loaded, true);
  assert.equal(summary.operation_kind, 'mailbox');
  assert.equal(summary.workflow_next_action, 'read_operation_scope');
  assert.equal(summary.task_count, 2);
});

test('readOperationScope returns summarized operation scope', async () => {
  const result = await readOperationScope({
    workerUrl: 'https://carrier.example.test',
    operation: 'operation.read',
    params: { site_id: 'site_alpha', operation_id: 'operation_alpha' },
    auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
  }, async () => ({
    status: 200,
    ok: true,
    text: async () => JSON.stringify({
      operation: { site_id: 'site_alpha', operation_id: 'operation_alpha' },
      operation_status_history: { current_status: 'active' },
      operation_lifecycle_status: { phase: 'inhabited', health: 'ready', next_action: 'monitor_operation', session_count: 1, task_count: 0 },
      operation_workflow_route: { next_action: 'monitor_operation', reason: 'complete' },
    }),
  }));

  assert.equal(result.schema, 'narada.cloudflare_carrier.operation_scope_read.v1');
  assert.equal(result.summary.operation_id, 'operation_alpha');
  assert.equal(result.summary.scope_loaded, true);
});

test('formatOperationScopeReadText prints scope summary', () => {
  const text = formatOperationScopeReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation_id: 'operation_alpha',
      site_id: 'site_alpha',
      operation_kind: 'mailbox',
      current_status: 'active',
      scope_loaded: true,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'carrier_evidence',
      workflow_next_action: 'read_operation_scope',
      workflow_reason: 'operation_scope_not_loaded',
      session_count: 1,
      task_count: 2,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
    },
  });

  assert.match(text, /Operation Scope: ok/);
  assert.match(text, /Kind: mailbox/);
  assert.match(text, /Scope Loaded: yes/);
  assert.match(text, /Workflow Route: action=read_operation_scope reason=operation_scope_not_loaded/);
  assert.match(text, /Inventory: sessions=1 tasks=2/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('formatOperationScopeReadText suppresses next workflow for passive routes', () => {
  const text = formatOperationScopeReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation_id: 'operation_alpha',
      site_id: 'site_alpha',
      current_status: 'active',
      scope_loaded: true,
      phase: 'inhabited',
      health: 'ready',
      next_action: 'monitor_operation',
      workflow_next_action: 'monitor_operation',
      workflow_reason: 'complete',
      session_count: 1,
      task_count: 0,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
    },
  });

  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
});

test('formatOperationScopeReadText suppresses site-scoped handoffs without a real site id', () => {
  const text = formatOperationScopeReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation_id: 'operation_alpha',
      current_status: 'active',
      scope_loaded: true,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'carrier_evidence',
      workflow_next_action: 'read_operation_scope',
      workflow_reason: 'operation_scope_not_loaded',
      session_count: 1,
      task_count: 2,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
    },
  });

  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Posture Coherence Review:/);
  assert.doesNotMatch(text, /Durability Coherence Review:/);
  assert.doesNotMatch(text, /Posture Coherence Review:/);
  assert.doesNotMatch(text, /Durability Coherence Review:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /<site-id>/);
});

test('formatOperationScopeReadText suppresses worker-scoped handoffs without a real worker url', () => {
  const text = formatOperationScopeReadText({
    auth_source: 'operator-session-file',
    summary: {
      operation_id: 'operation_alpha',
      site_id: 'site_alpha',
      current_status: 'active',
      scope_loaded: true,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'carrier_evidence',
      workflow_next_action: 'read_operation_scope',
      workflow_reason: 'operation_scope_not_loaded',
      session_count: 1,
      task_count: 2,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
    },
  });

  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /<worker-url>/);
});
