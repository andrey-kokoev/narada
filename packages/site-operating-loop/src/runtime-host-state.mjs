import { randomUUID } from 'node:crypto';

export const SITE_OPERATING_LOOP_RUNTIME_HOST_STATE_SCHEMA = 'narada.site_operating_loop.runtime_host_state.v1';

// `ready` is deliberately not `projections_ready`: the generic loop runtime
// can run without an HTTP/SSE attachment. Projection readiness belongs to the
// optional server adapter, while this state machine describes the authority
// that executes Site loop cycles.
export const SITE_OPERATING_LOOP_RUNTIME_HOST_STATES = Object.freeze([
  'created',
  'binding',
  'ready',
  'serving',
  'closing',
  'stopped',
  'failed',
]);

export const SITE_OPERATING_LOOP_RUNTIME_HOST_TRANSITIONS = Object.freeze({
  created: Object.freeze(['binding', 'failed']),
  binding: Object.freeze(['ready', 'failed']),
  ready: Object.freeze(['serving', 'failed']),
  serving: Object.freeze(['closing', 'failed']),
  closing: Object.freeze(['stopped', 'failed']),
  failed: Object.freeze(['closing', 'stopped']),
  stopped: Object.freeze([]),
});

const transitionSets = new Map(Object.entries(SITE_OPERATING_LOOP_RUNTIME_HOST_TRANSITIONS)
  .map(([state, nextStates]) => [state, new Set(nextStates)]));

export function isSiteOperatingLoopRuntimeHostState(state) {
  return SITE_OPERATING_LOOP_RUNTIME_HOST_STATES.includes(state);
}

export function canTransitionSiteOperatingLoopRuntimeHost(previousState, nextState) {
  if (!isSiteOperatingLoopRuntimeHostState(nextState)) return false;
  if (previousState === nextState) return true;
  return transitionSets.get(previousState)?.has(nextState) ?? false;
}

export function assertSiteOperatingLoopRuntimeHostTransition(previousState, nextState) {
  if (!canTransitionSiteOperatingLoopRuntimeHost(previousState, nextState)) {
    throw new Error(`invalid_site_operating_loop_runtime_host_transition:${previousState}:${nextState}`);
  }
  return nextState;
}

export function createSiteOperatingLoopRuntimeHostStateMachine({
  initialState = 'created',
  runtimeId = `site_loop_runtime_${randomUUID()}`,
  authorityEpoch = 1,
  metadata = {},
  history = null,
  now = () => new Date().toISOString(),
  onTransition = () => {},
} = {}) {
  if (!isSiteOperatingLoopRuntimeHostState(initialState)) {
    throw new Error(`invalid_site_operating_loop_runtime_host_state:${initialState}`);
  }
  if (!runtimeId) throw new Error('runtimeId is required');
  const normalizedEpoch = Number(authorityEpoch);
  if (!Number.isInteger(normalizedEpoch) || normalizedEpoch < 1) {
    throw new Error(`invalid_site_operating_loop_runtime_host_authority_epoch:${authorityEpoch}`);
  }

  let state = initialState;
  let lifecycleHistory = Array.isArray(history) && history.length > 0
    ? [...history]
    : [initialState];
  if (lifecycleHistory.at(-1) !== initialState || lifecycleHistory.some((entry) => !isSiteOperatingLoopRuntimeHostState(entry))) {
    throw new Error('invalid_site_operating_loop_runtime_host_history');
  }

  const snapshot = () => ({
    schema: SITE_OPERATING_LOOP_RUNTIME_HOST_STATE_SCHEMA,
    runtime_id: String(runtimeId),
    authority_epoch: normalizedEpoch,
    runtime_host_state: state,
    lifecycle_history: [...lifecycleHistory],
    metadata: { ...metadata },
  });

  const transition = (nextState, details = {}) => {
    assertSiteOperatingLoopRuntimeHostTransition(state, nextState);
    const previousState = state;
    if (state !== nextState) {
      state = nextState;
      lifecycleHistory = [...lifecycleHistory, nextState];
    }
    const record = {
      ...snapshot(),
      event: 'runtime_host_lifecycle_transition',
      previous_runtime_host_state: previousState,
      details: details ?? {},
      timestamp: now(),
    };
    onTransition(record);
    return record;
  };

  return Object.freeze({
    get state() {
      return state;
    },
    snapshot,
    transition,
  });
}
