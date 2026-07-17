import { createNarsStateMachine } from './runtime-state-machine.mjs';

export const NARS_RUNTIME_REQUEST_STATE_SCHEMA = 'narada.nars.runtime_request_state.v1';
export const NARS_RUNTIME_REQUEST_RETENTION_LIMIT = 100;

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
  const machine = createNarsStateMachine({
    identityFields: { runtime_request_id: runtimeRequestId, request_id: requestId, method },
    metadata,
    schema: NARS_RUNTIME_REQUEST_STATE_SCHEMA,
    event: 'runtime_request_state_transition',
    stateField: 'request_state',
    isTerminalState: isNarsRuntimeRequestTerminalState,
    assertTransition: assertNarsRuntimeRequestTransition,
    now,
    onTransition,
  });
  return Object.freeze({
    get state() { return machine.state; },
    runtimeRequestId,
    requestId,
    method,
    transition: machine.transition,
    snapshot: machine.snapshot,
    history: machine.history,
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

  function pruneRetainedRequests() {
    let terminalCount = [...requests.values()]
      .filter((machine) => isNarsRuntimeRequestTerminalState(machine.state))
      .length;
    if (terminalCount <= NARS_RUNTIME_REQUEST_RETENTION_LIMIT) return;
    for (const [runtimeRequestId, machine] of requests) {
      if (!isNarsRuntimeRequestTerminalState(machine.state)) continue;
      requests.delete(runtimeRequestId);
      terminalCount -= 1;
      if (terminalCount <= NARS_RUNTIME_REQUEST_RETENTION_LIMIT) break;
    }
  }

  function requestRefMachines() {
    const machines = [...requests.values()];
    const activeMachines = machines.filter((machine) => !isNarsRuntimeRequestTerminalState(machine.state));
    const terminalMachines = machines.filter((machine) => isNarsRuntimeRequestTerminalState(machine.state));
    const activeRefs = activeMachines.slice(-NARS_RUNTIME_REQUEST_RETENTION_LIMIT);
    const terminalCapacity = Math.max(0, NARS_RUNTIME_REQUEST_RETENTION_LIMIT - activeRefs.length);
    const terminalRefs = terminalCapacity > 0 ? terminalMachines.slice(-terminalCapacity) : [];
    return [...activeRefs, ...terminalRefs];
  }

  function receive({ requestId = null, method = null, requestMetadata = {} } = {}) {
    const runtimeRequestId = `runtime_request_${nextRequestNumber++}`;
    const machine = createNarsRuntimeRequestStateMachine({
      runtimeRequestId,
      requestId,
      method,
      metadata: { ...metadata, ...requestMetadata },
      now,
      onTransition: (record) => {
        try {
          onTransition(record);
        } finally {
          pruneRetainedRequests();
        }
      },
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
    const activeRequestCount = NARS_RUNTIME_REQUEST_STATES
      .filter((state) => !isNarsRuntimeRequestTerminalState(state))
      .reduce((count, state) => count + stateCounts[state], 0);
    const terminalRequestCount = NARS_RUNTIME_REQUEST_TERMINAL_STATES
      .reduce((count, state) => count + stateCounts[state], 0);
    return {
      schema: NARS_RUNTIME_REQUEST_STATE_SCHEMA,
      request_count: requests.size,
      retained_request_count: requests.size,
      retention_limit: NARS_RUNTIME_REQUEST_RETENTION_LIMIT,
      retention_scope: 'terminal_requests_only',
      active_request_count: activeRequestCount,
      terminal_request_count: terminalRequestCount,
      pending_operation_count: operations.size,
      state_counts: stateCounts,
      request_refs: requestRefMachines().map((machine) => {
        const current = machine.snapshot();
        return {
          runtime_request_id: current.runtime_request_id,
          request_id: current.request_id ?? null,
          method: current.method ?? null,
          request_state: current.request_state ?? null,
          terminal_state: current.terminal_state ?? null,
        };
      }),
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
