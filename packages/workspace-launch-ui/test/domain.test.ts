import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseWorkspaceLaunchBootstrapPayload,
  parseWorkspaceLaunchDashboardAttempts,
  parseWorkspaceLaunchSelectorModelPayload,
  isWorkspaceLaunchAttemptActive,
  workspaceLaunchAttemptsForView,
  unique,
} from '../src/launcher/domain.ts';

const selectionMode = {
  site: 'single' as const,
  role: 'single' as const,
  operatorSurface: 'single' as const,
};

const selection = {
  site: ['smart-scheduling'],
  role: ['resident'],
  operatorSurface: ['agent-cli'],
  runtime: 'codex',
  intelligenceProvider: 'codex-subscription',
  selectionMode,
};

const selectorModel = {
  schema: 'narada.workspace_launch.selector_model.v1' as const,
  siteOptions: [{ value: 'smart-scheduling', label: 'Smart Scheduling' }],
  roleOptions: [{ value: 'resident', label: 'Resident' }],
  operatorSurfaceOptions: [{ value: 'agent-cli', label: 'Agent CLI' }],
  runtimeOptions: [{ value: 'codex', label: 'Codex' }],
  intelligenceProviderOptions: [{ value: 'codex-subscription', label: 'Codex Subscription' }],
  selected: selection,
};

const bootstrapPayload = {
  model: {
    records: [{
      site: 'smart-scheduling',
      role: 'resident',
      agent: 'smart-scheduling.resident',
      runtime: 'codex',
      operator_surface: 'agent-cli',
      agent_identity_ref: { canonical_agent_id: 'smart-scheduling.resident' },
    }],
    siteChoices: ['smart-scheduling'],
    initialSites: ['smart-scheduling'],
    initialRoles: ['resident'],
    initialOperatorSurfaces: ['agent-cli'],
    initialRuntime: 'codex',
    initialIntelligenceProvider: 'codex-subscription',
    initialSelectionMode: selectionMode,
    narsOperatorSurfaceChoices: ['agent-cli'],
    selectorModel,
  },
  persistent: true,
};

test('adapts the launcher bootstrap contract into UI-facing fields', () => {
  const bootstrap = parseWorkspaceLaunchBootstrapPayload(bootstrapPayload);

  assert.ok(bootstrap);
  assert.equal(bootstrap.persistent, true);
  assert.deepEqual(bootstrap.model.records[0], {
    site: 'smart-scheduling',
    role: 'resident',
    agent: 'smart-scheduling.resident',
    runtime: 'codex',
    operatorSurface: 'agent-cli',
    agentIdentityRef: { canonicalAgentId: 'smart-scheduling.resident' },
  });
  assert.equal(bootstrap.model.selectorModel.operatorSurfaceOptions[0]?.label, 'Agent CLI');
});

test('rejects malformed launcher payloads at the adapter boundary', () => {
  assert.equal(parseWorkspaceLaunchBootstrapPayload({ model: {}, persistent: true }), null);
  assert.equal(parseWorkspaceLaunchDashboardAttempts({ attempts: [{ status: 'running' }] }), null);
  assert.equal(parseWorkspaceLaunchDashboardAttempts({ attempts: [{
    launch_attempt_id: 'attempt-invalid-session-ids',
    selection,
    status: 'launched',
    result_summary: 'Launch completed',
    expected_launch_session_ids: [42],
  }] }), null);
});

test('normalizes dashboard attempts without exposing wire naming to the template', () => {
  const attempts = parseWorkspaceLaunchDashboardAttempts({
    schema: 'narada.workspace_launch.dashboard.v1',
    attempts: [{
      launch_attempt_id: 'attempt-1',
      selection,
      status: 'completed',
      result_summary: 'Launch completed',
      expected_launch_session_ids: [],
      updated_at: '2026-07-12T12:00:00.000Z',
      handoffs: [{ posture: 'ready', status: 'accepted' }],
      observations: [{ health: 'healthy', session_id: null }],
      projections: [{ projection_kind: 'operator_terminal', status: 'open' }],
      actions: ['retry'],
    }],
  });

  assert.ok(attempts);
  const attempt = attempts[0];
  assert.ok(attempt);
  assert.deepEqual({
    launchAttemptId: attempt.launchAttemptId,
    selection: attempt.selection,
    status: attempt.status,
    resultSummary: attempt.resultSummary,
    updatedAt: attempt.updatedAt,
    handoffs: attempt.handoffs,
    observations: attempt.observations,
    projections: attempt.projections,
    actions: attempt.actions,
  }, {
    launchAttemptId: 'attempt-1',
    selection,
    status: 'completed',
    resultSummary: 'Launch completed',
    updatedAt: '2026-07-12T12:00:00.000Z',
    handoffs: [{ posture: 'ready', status: 'accepted' }],
    observations: [{ health: 'healthy', sessionId: null }],
    projections: [{ projectionKind: 'operator_terminal', status: 'open' }],
    actions: ['retry'],
  });
  assert.equal((attempt.raw as { launch_attempt_id?: unknown }).launch_attempt_id, 'attempt-1');
  assert.equal(isWorkspaceLaunchAttemptActive(attempt, Date.parse('2026-07-12T12:00:00.000Z')), false);
});

test('only a fresh owned NARS observation is active', () => {
  const parsed = parseWorkspaceLaunchDashboardAttempts({
    schema: 'narada.workspace_launch.dashboard.v1',
    attempts: [{
      launch_attempt_id: 'attempt-live',
      selection,
      status: 'launched',
      result_summary: 'Launch completed',
      expected_launch_session_ids: ['session-live'],
      updated_at: '2026-07-12T12:00:00.000Z',
      observations: [{
        health: 'healthy',
        session_id: 'session-live',
        last_checked_at: '2026-07-12T11:59:30.000Z',
        ownership_posture: 'owned_by_runtime_authority',
      }],
      projections: [{ projection_kind: 'operator_terminal', status: 'handed_off' }],
      actions: ['recheck'],
    }, {
      launch_attempt_id: 'attempt-stale',
      selection,
      status: 'launched',
      result_summary: 'Launch completed',
      expected_launch_session_ids: ['session-stale'],
      updated_at: '2026-07-12T08:00:00.000Z',
      observations: [{
        health: 'healthy',
        session_id: 'session-stale',
        last_checked_at: '2026-07-12T08:00:00.000Z',
        ownership_posture: 'owned_by_runtime_authority',
      }],
      projections: [{ projection_kind: 'operator_terminal', status: 'handed_off' }],
      actions: ['recheck'],
    }],
  });

  assert.ok(parsed);
  assert.equal(isWorkspaceLaunchAttemptActive(parsed[0]!, Date.parse('2026-07-12T12:00:00.000Z')), true);
  assert.equal(isWorkspaceLaunchAttemptActive(parsed[1]!, Date.parse('2026-07-12T12:00:00.000Z')), false);
  const now = Date.parse('2026-07-12T12:00:00.000Z');
  assert.deepEqual(workspaceLaunchAttemptsForView(parsed, false, now).map((attempt) => attempt.launchAttemptId), ['attempt-live']);
  assert.deepEqual(workspaceLaunchAttemptsForView(parsed, true, now).map((attempt) => attempt.launchAttemptId), ['attempt-stale']);
});

test('keeps shared launcher helpers deterministic', () => {
  assert.deepEqual(unique([' codex ', 'codex', '', 'agent-cli']), ['codex', 'agent-cli']);
  assert.deepEqual(parseWorkspaceLaunchSelectorModelPayload(selectorModel).selected, {
    runtime: 'codex',
    intelligenceProvider: 'codex-subscription',
  });
});
