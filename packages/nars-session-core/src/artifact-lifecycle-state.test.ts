import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NARS_ARTIFACT_LIFECYCLE_TRANSITIONS,
  assertNarsArtifactLifecycleTransition,
  canTransitionNarsArtifactLifecycle,
  createNarsArtifactLifecycle,
  isNarsArtifactLifecycleTerminalState,
  normalizeNarsArtifactLifecycle,
  transitionNarsArtifactLifecycle,
  transitionNarsArtifactRecord,
} from './artifact-lifecycle-state.js';

interface LifecycleError {
  code?: string;
  details?: { state?: unknown; previous_state?: unknown; next_state?: unknown };
}

test('artifact lifecycle FSM allows deactivation and final archival without reactivation', () => {
  const active = createNarsArtifactLifecycle({ createdAt: '2026-07-13T00:00:00.000Z' });
  const revoked = transitionNarsArtifactLifecycle(active, 'revoked', {
    transitioned_at: '2026-07-13T00:01:00.000Z',
    reason: 'operator_revoked',
    requested_by: 'operator',
  });
  const archived = transitionNarsArtifactLifecycle(revoked, 'archived', {
    transitioned_at: '2026-07-13T00:02:00.000Z',
    reason: 'retention_complete',
  });

  assert.deepEqual(NARS_ARTIFACT_LIFECYCLE_TRANSITIONS, {
    active: ['revoked', 'expired', 'archived'],
    revoked: ['archived'],
    expired: ['archived'],
    archived: [],
  });
  assert.equal(revoked.state, 'revoked');
  assert.equal(revoked.terminal_state, null);
  assert.equal(archived.state, 'archived');
  assert.equal(archived.terminal_state, 'archived');
  assert.equal(archived.history.length, 3);
  assert.equal(archived.history[1].requested_by, 'operator');
  assert.equal(isNarsArtifactLifecycleTerminalState('archived'), true);
  assert.equal(canTransitionNarsArtifactLifecycle('archived', 'active'), false);
  assert.throws(
    () => normalizeNarsArtifactLifecycle({ state: 'unknown' }),
    (error) => {
      const typed = error as LifecycleError;
      return typed.code === 'invalid_nars_artifact_lifecycle_state'
        && typed.details?.state === 'unknown';
    },
  );
  assert.throws(
    () => assertNarsArtifactLifecycleTransition('revoked', 'active'),
    (error) => {
      const typed = error as LifecycleError;
      return typed.code === 'invalid_nars_artifact_lifecycle_transition'
        && typed.details?.previous_state === 'revoked'
        && typed.details?.next_state === 'active';
    },
  );
});

test('artifact lifecycle record transition preserves artifact identity and rejects invalid states', () => {
  const record = {
    artifact_id: 'art_1',
    kind: 'text',
    lifecycle: { state: 'active', owner: 'nars-session' },
  };
  const expired = transitionNarsArtifactRecord(record, 'expired', {
    transitioned_at: '2026-07-13T00:03:00.000Z',
  });
  assert.equal(expired.artifact_id, 'art_1');
  assert.equal(expired.lifecycle.state, 'expired');
  assert.equal(expired.lifecycle.history.length, 2);
  assert.throws(
    () => transitionNarsArtifactRecord(expired, 'revoked'),
    (error) => {
      const typed = error as LifecycleError;
      return typed.code === 'invalid_nars_artifact_lifecycle_transition'
        && typed.details?.previous_state === 'expired'
        && typed.details?.next_state === 'revoked';
    },
  );
});
