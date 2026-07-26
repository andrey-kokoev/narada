export const NARS_ARTIFACT_LIFECYCLE_STATE_SCHEMA = 'narada.nars.artifact_lifecycle_state.v1' as const;

export const NARS_ARTIFACT_LIFECYCLE_STATES = Object.freeze([
  'active',
  'revoked',
  'expired',
  'archived',
 ] as const);
export type NaradaArtifactLifecycleState = (typeof NARS_ARTIFACT_LIFECYCLE_STATES)[number];

export const NARS_ARTIFACT_LIFECYCLE_TERMINAL_STATES = Object.freeze(['archived'] as const);

export const NARS_ARTIFACT_LIFECYCLE_TRANSITIONS = Object.freeze({
  active: ['revoked', 'expired', 'archived'],
  revoked: ['archived'],
  expired: ['archived'],
  archived: [],
} as const);

export interface NaradaArtifactLifecycleHistoryEntry {
  previous_state: NaradaArtifactLifecycleState | null;
  artifact_state: NaradaArtifactLifecycleState;
  transitioned_at: string | null;
  reason: string | null;
  requested_by?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export interface NaradaArtifactLifecycle {
  schema: typeof NARS_ARTIFACT_LIFECYCLE_STATE_SCHEMA;
  state: NaradaArtifactLifecycleState;
  terminal_state: NaradaArtifactLifecycleState | null;
  owner: string;
  created_at: string | null;
  updated_at: string | null;
  reason: string | null;
  history: NaradaArtifactLifecycleHistoryEntry[];
}

interface NaradaArtifactLifecycleRecord {
  artifact_id?: string;
  lifecycle?: NaradaArtifactLifecycle | null;
  [key: string]: unknown;
}

export interface NaradaArtifactLifecycleEvidence {
  transitioned_at?: string | null;
  updated_at?: string | null;
  reason?: string | null;
  requested_by?: unknown;
}

const STATE_SET = new Set<NaradaArtifactLifecycleState>(NARS_ARTIFACT_LIFECYCLE_STATES);
const TERMINAL_SET = new Set<NaradaArtifactLifecycleState>(NARS_ARTIFACT_LIFECYCLE_TERMINAL_STATES);
const TRANSITION_SET = new Map(
  Object.entries(NARS_ARTIFACT_LIFECYCLE_TRANSITIONS)
    .map(([state, nextStates]) => [state as NaradaArtifactLifecycleState, new Set<NaradaArtifactLifecycleState>(nextStates)]),
);

export function isNarsArtifactLifecycleState(state: unknown): state is NaradaArtifactLifecycleState {
  return typeof state === 'string' && STATE_SET.has(state as NaradaArtifactLifecycleState);
}

export function isNarsArtifactLifecycleTerminalState(state: unknown): state is NaradaArtifactLifecycleState {
  return typeof state === 'string' && TERMINAL_SET.has(state as NaradaArtifactLifecycleState);
}

export function canTransitionNarsArtifactLifecycle(previousState: unknown, nextState: unknown): boolean {
  if (!isNarsArtifactLifecycleState(nextState)) return false;
  if (previousState === nextState) return true;
  if (!isNarsArtifactLifecycleState(previousState)) return false;
  return TRANSITION_SET.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsArtifactLifecycleTransition(previousState: unknown, nextState: unknown): asserts nextState is NaradaArtifactLifecycleState {
  if (!canTransitionNarsArtifactLifecycle(previousState, nextState)) {
    const error = Object.assign(new Error(`invalid_nars_artifact_lifecycle_transition:${previousState}:${nextState}`), {
      code: 'invalid_nars_artifact_lifecycle_transition',
      details: {
      previous_state: previousState ?? null,
      next_state: nextState ?? null,
      },
    });
    throw error;
  }
}

export function createNarsArtifactLifecycle({
  owner = 'nars-session',
  createdAt = null,
  now = createdAt,
  reason = 'artifact_registered',
}: { owner?: string; createdAt?: string | null; now?: string | null; reason?: string } = {}): NaradaArtifactLifecycle {
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

export function normalizeNarsArtifactLifecycle(lifecycle: unknown = {}): NaradaArtifactLifecycle {
  const value = asRecord(lifecycle);
  const state: unknown = value.state ?? 'active';
  if (!isNarsArtifactLifecycleState(state)) {
    const error = Object.assign(new Error(`invalid_nars_artifact_lifecycle_state:${state}`), {
      code: 'invalid_nars_artifact_lifecycle_state',
      details: { state },
    });
    throw error;
  }
  const createdAt = typeof value.created_at === 'string' ? value.created_at : null;
  const updatedAt = typeof value.updated_at === 'string' ? value.updated_at : createdAt;
  const history = Array.isArray(value.history) && value.history.length > 0
    ? value.history.map((entry): NaradaArtifactLifecycleHistoryEntry => {
      const item = asRecord(entry);
      const artifactState = item.artifact_state ?? item.state;
      return {
        previous_state: isNarsArtifactLifecycleState(item.previous_state) ? item.previous_state : null,
        artifact_state: isNarsArtifactLifecycleState(artifactState) ? artifactState : state,
        transitioned_at: typeof item.transitioned_at === 'string' ? item.transitioned_at : updatedAt,
        reason: typeof item.reason === 'string' ? item.reason : null,
        ...(item.requested_by !== undefined ? { requested_by: item.requested_by } : {}),
      };
    })
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
    owner: typeof value.owner === 'string' ? value.owner : 'nars-session',
    created_at: createdAt,
    updated_at: updatedAt,
    reason: typeof value.reason === 'string' ? value.reason : null,
    history,
  };
}

export function transitionNarsArtifactLifecycle(
  lifecycle: unknown,
  nextState: NaradaArtifactLifecycleState,
  evidence: NaradaArtifactLifecycleEvidence = {},
): NaradaArtifactLifecycle {
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

export function transitionNarsArtifactRecord<T extends { artifact_id?: string; lifecycle?: unknown }>(
  record: T,
  nextState: NaradaArtifactLifecycleState,
  evidence: NaradaArtifactLifecycleEvidence = {},
): T & { lifecycle: NaradaArtifactLifecycle } {
  if (!record?.artifact_id) throw new Error('nars_artifact_id_required');
  return {
    ...record,
    lifecycle: transitionNarsArtifactLifecycle(record.lifecycle, nextState, evidence),
  };
}
