export const NARS_RUNTIME_REQUEST_STATE_SCHEMA = 'narada.nars.runtime_request_state.v1';

export const NARS_RUNTIME_REQUEST_STATES = Object.freeze([
  'received',
  'scheduled',
  'waiting',
  'running',
  'completed',
  'rejected',
  'failed',
]);

export const NARS_RUNTIME_REQUEST_TERMINAL_STATES = Object.freeze([
  'completed',
  'rejected',
  'failed',
]);

export const NARS_RUNTIME_REQUEST_TRANSITIONS = Object.freeze({
  received: Object.freeze(['scheduled', 'rejected', 'failed']),
  scheduled: Object.freeze(['waiting', 'running', 'rejected', 'failed']),
  waiting: Object.freeze(['running', 'failed']),
  running: Object.freeze(['completed', 'rejected', 'failed']),
  completed: Object.freeze([]),
  rejected: Object.freeze([]),
  failed: Object.freeze([]),
});

const stateSet = new Set(NARS_RUNTIME_REQUEST_STATES);
const terminalStateSet = new Set(NARS_RUNTIME_REQUEST_TERMINAL_STATES);
const transitionSets = new Map(Object.entries(NARS_RUNTIME_REQUEST_TRANSITIONS)
  .map(([state, nextStates]) => [state, new Set(nextStates)]));

export function isNarsRuntimeRequestState(state) {
  return stateSet.has(state);
}

export function isNarsRuntimeRequestTerminalState(state) {
  return terminalStateSet.has(state);
}

export function canTransitionNarsRuntimeRequest(previousState, nextState) {
  if (!isNarsRuntimeRequestState(nextState)) return false;
  if (previousState === nextState) return true;
  if (previousState == null) return nextState === 'received';
  return transitionSets.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsRuntimeRequestTransition(previousState, nextState) {
  if (!canTransitionNarsRuntimeRequest(previousState, nextState)) {
    throw new Error(`invalid_nars_runtime_request_transition:${previousState}:${nextState}`);
  }
  return nextState;
}

export function createNarsRuntimeRequestStateMachine({
  runtimeRequestId,
  requestId = null,
  method = null,
  metadata = {},
  now = () => new Date().toISOString(),
  onTransition = () => {},
} = {}) {
  if (!runtimeRequestId) throw new Error('narada_runtime_request_id_required');
  let state = null;
  const history = [];

  function transition(nextState, evidence = {}) {
    assertNarsRuntimeRequestTransition(state, nextState);
    if (state === nextState) return history.at(-1) ?? null;
    const previousState = state;
    state = nextState;
    const record = {
      schema: NARS_RUNTIME_REQUEST_STATE_SCHEMA,
      event: 'runtime_request_state_transition',
      timestamp: now(),
      runtime_request_id: runtimeRequestId,
      request_id: requestId,
      method,
      previous_state: previousState,
      request_state: nextState,
      terminal_state: isNarsRuntimeRequestTerminalState(nextState) ? nextState : null,
      ...metadata,
      ...evidence,
    };
    history.push(record);
    onTransition(record);
    return record;
  }

  return Object.freeze({
    get state() { return state; },
    runtimeRequestId,
    requestId,
    method,
    transition,
    snapshot: () => ({
      schema: NARS_RUNTIME_REQUEST_STATE_SCHEMA,
      runtime_request_id: runtimeRequestId,
      request_id: requestId,
      method,
      request_state: state,
      terminal_state: isNarsRuntimeRequestTerminalState(state) ? state : null,
      ...metadata,
    }),
    history: () => history.slice(),
  });
}

export function createNarsRuntimeRequestRegistry({
  metadata = {},
  now = () => new Date().toISOString(),
  onTransition = () => {},
} = {}) {
  let nextRequestNumber = 1;
  const requests = new Map();
  const operations = new Map();

  function receive({ requestId = null, method = null, requestMetadata = {} } = {}) {
    const runtimeRequestId = `runtime_request_${nextRequestNumber++}`;
    const machine = createNarsRuntimeRequestStateMachine({
      runtimeRequestId,
      requestId,
      method,
      metadata: { ...metadata, ...requestMetadata },
      now,
      onTransition,
    });
    requests.set(runtimeRequestId, machine);
    machine.transition('received');
    return machine;
  }

  function request(runtimeRequestId) {
    return requests.get(String(runtimeRequestId)) ?? null;
  }

  function track(runtimeRequestId, operation) {
    const machine = request(runtimeRequestId);
    if (!machine) throw new Error(`narada_runtime_request_not_found:${runtimeRequestId}`);
    const promise = Promise.resolve(operation);
    operations.set(machine.runtimeRequestId, promise);
    promise.then(
      () => { operations.delete(machine.runtimeRequestId); },
      () => { operations.delete(machine.runtimeRequestId); },
    );
    return promise;
  }

  function pendingOperations() {
    return [...operations.values()];
  }

  function snapshot() {
    const stateCounts = Object.fromEntries(NARS_RUNTIME_REQUEST_STATES.map((state) => [state, 0]));
    for (const machine of requests.values()) {
      if (machine.state) stateCounts[machine.state] += 1;
    }
    return {
      schema: NARS_RUNTIME_REQUEST_STATE_SCHEMA,
      request_count: requests.size,
      active_request_count: NARS_RUNTIME_REQUEST_STATES
        .filter((state) => !isNarsRuntimeRequestTerminalState(state))
        .reduce((count, state) => count + stateCounts[state], 0),
      pending_operation_count: operations.size,
      state_counts: stateCounts,
    };
  }

  return Object.freeze({
    receive,
    request,
    track,
    pendingOperations,
    snapshot,
    requests: () => [...requests.values()].map((machine) => machine.snapshot()),
  });
}
