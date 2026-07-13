export const NARS_ARTIFACT_LIFECYCLE_STATE_SCHEMA = 'narada.nars.artifact_lifecycle_state.v1';

export const NARS_ARTIFACT_LIFECYCLE_STATES = Object.freeze([
  'active',
  'revoked',
  'expired',
  'archived',
]);

export const NARS_ARTIFACT_LIFECYCLE_TERMINAL_STATES = Object.freeze(['archived']);

export const NARS_ARTIFACT_LIFECYCLE_TRANSITIONS = Object.freeze({
  active: Object.freeze(['revoked', 'expired', 'archived']),
  revoked: Object.freeze(['archived']),
  expired: Object.freeze(['archived']),
  archived: Object.freeze([]),
});

const STATE_SET = new Set(NARS_ARTIFACT_LIFECYCLE_STATES);
const TERMINAL_SET = new Set(NARS_ARTIFACT_LIFECYCLE_TERMINAL_STATES);
const TRANSITION_SET = new Map(
  Object.entries(NARS_ARTIFACT_LIFECYCLE_TRANSITIONS)
    .map(([state, nextStates]) => [state, new Set(nextStates)]),
);

export function isNarsArtifactLifecycleState(state) {
  return STATE_SET.has(state);
}

export function isNarsArtifactLifecycleTerminalState(state) {
  return TERMINAL_SET.has(state);
}

export function canTransitionNarsArtifactLifecycle(previousState, nextState) {
  if (!isNarsArtifactLifecycleState(nextState)) return false;
  if (previousState === nextState) return true;
  return TRANSITION_SET.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsArtifactLifecycleTransition(previousState, nextState) {
  if (!canTransitionNarsArtifactLifecycle(previousState, nextState)) {
    throw new Error(`invalid_nars_artifact_lifecycle_transition:${previousState}:${nextState}`);
  }
  return nextState;
}

export function createNarsArtifactLifecycle({
  owner = 'nars-session',
  createdAt = null,
  now = createdAt,
  reason = 'artifact_registered',
} = {}) {
  return normalizeNarsArtifactLifecycle({
    schema: NARS_ARTIFACT_LIFECYCLE_STATE_SCHEMA,
    state: 'active',
    owner,
    created_at: createdAt,
    updated_at: now,
    reason,
    history: [{
      previous_state: null,
      artifact_state: 'active',
      transitioned_at: now,
      reason,
    }],
  });
}

export function normalizeNarsArtifactLifecycle(lifecycle = {}) {
  const state = lifecycle.state ?? 'active';
  if (!isNarsArtifactLifecycleState(state)) {
    throw new Error(`invalid_nars_artifact_lifecycle_state:${state}`);
  }
  const createdAt = lifecycle.created_at ?? null;
  const updatedAt = lifecycle.updated_at ?? createdAt;
  const history = Array.isArray(lifecycle.history) && lifecycle.history.length > 0
    ? lifecycle.history.map((entry) => ({
      previous_state: entry?.previous_state ?? null,
      artifact_state: entry?.artifact_state ?? entry?.state ?? state,
      transitioned_at: entry?.transitioned_at ?? updatedAt,
      reason: entry?.reason ?? null,
      ...(entry?.requested_by !== undefined ? { requested_by: entry.requested_by } : {}),
    }))
    : [{
      previous_state: null,
      artifact_state: state,
      transitioned_at: updatedAt,
      reason: 'artifact_registered',
    }];
  return {
    schema: NARS_ARTIFACT_LIFECYCLE_STATE_SCHEMA,
    state,
    terminal_state: isNarsArtifactLifecycleTerminalState(state) ? state : null,
    owner: lifecycle.owner ?? 'nars-session',
    created_at: createdAt,
    updated_at: updatedAt,
    reason: lifecycle.reason ?? null,
    history,
  };
}

export function transitionNarsArtifactLifecycle(lifecycle, nextState, evidence = {}) {
  const current = normalizeNarsArtifactLifecycle(lifecycle);
  assertNarsArtifactLifecycleTransition(current.state, nextState);
  if (current.state === nextState) return current;
  const transitionedAt = evidence.transitioned_at ?? evidence.updated_at ?? new Date().toISOString();
  const reason = evidence.reason ?? `artifact_${nextState}`;
  const transition = {
    previous_state: current.state,
    artifact_state: nextState,
    transitioned_at: transitionedAt,
    reason,
    ...(evidence.requested_by !== undefined ? { requested_by: evidence.requested_by } : {}),
  };
  return normalizeNarsArtifactLifecycle({
    ...current,
    state: nextState,
    updated_at: transitionedAt,
    reason,
    history: [...current.history, transition],
  });
}

export function transitionNarsArtifactRecord(record, nextState, evidence = {}) {
  if (!record?.artifact_id) throw new Error('nars_artifact_id_required');
  return {
    ...record,
    lifecycle: transitionNarsArtifactLifecycle(record.lifecycle, nextState, evidence),
  };
}
