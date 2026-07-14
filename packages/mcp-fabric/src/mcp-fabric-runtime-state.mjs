export const MCP_FABRIC_RUNTIME_LIFECYCLE_SCHEMA = 'narada.mcp.fabric.runtime.lifecycle_state.v1';

export const MCP_FABRIC_RUNTIME_STATES = Object.freeze([
  'declared',
  'loading',
  'ready',
  'degraded',
  'restarting',
  'unavailable',
]);

const TRANSITIONS = Object.freeze({
  declared: Object.freeze(['loading', 'unavailable']),
  loading: Object.freeze(['ready', 'degraded', 'unavailable']),
  ready: Object.freeze(['degraded', 'restarting', 'unavailable']),
  degraded: Object.freeze(['ready', 'restarting', 'unavailable']),
  restarting: Object.freeze(['loading', 'ready', 'degraded', 'unavailable']),
  unavailable: Object.freeze(['loading', 'declared']),
});

export function createMcpFabricRuntimeLifecycle(initialState = 'declared') {
  assertState(initialState);
  return { schema: MCP_FABRIC_RUNTIME_LIFECYCLE_SCHEMA, state: initialState, history: [initialState] };
}

export function canTransitionMcpFabricRuntime(from, to) {
  assertState(from);
  assertState(to);
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertMcpFabricRuntimeTransition(from, to) {
  if (!canTransitionMcpFabricRuntime(from, to)) {
    throw new Error(`invalid_mcp_fabric_runtime_transition: ${from}->${to}`);
  }
}

export function transitionMcpFabricRuntime(lifecycle, nextState) {
  assertState(lifecycle?.state);
  assertMcpFabricRuntimeTransition(lifecycle.state, nextState);
  return lifecycle.state === nextState
    ? lifecycle
    : {
      schema: MCP_FABRIC_RUNTIME_LIFECYCLE_SCHEMA,
      state: nextState,
      history: [...lifecycle.history, nextState],
    };
}

function assertState(state) {
  if (!MCP_FABRIC_RUNTIME_STATES.includes(state)) {
    throw new Error(`unsupported_mcp_fabric_runtime_state: ${state}`);
  }
}
