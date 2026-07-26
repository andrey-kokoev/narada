type RuntimeState = 'declared' | 'loading' | 'ready' | 'degraded' | 'restarting' | 'unavailable';
type RuntimeLifecycle = { schema: string; state: RuntimeState; history: RuntimeState[] };

export const MCP_FABRIC_RUNTIME_LIFECYCLE_SCHEMA = 'narada.mcp.fabric.runtime.lifecycle_state.v1';

export const MCP_FABRIC_RUNTIME_STATES = Object.freeze([
  'declared',
  'loading',
  'ready',
  'degraded',
  'restarting',
  'unavailable',
]);

const TRANSITIONS: Record<RuntimeState, readonly RuntimeState[]> = Object.freeze({
  declared: Object.freeze(['loading', 'unavailable'] as const),
  loading: Object.freeze(['ready', 'degraded', 'unavailable'] as const),
  ready: Object.freeze(['degraded', 'restarting', 'unavailable'] as const),
  degraded: Object.freeze(['ready', 'restarting', 'unavailable'] as const),
  restarting: Object.freeze(['loading', 'ready', 'degraded', 'unavailable'] as const),
  unavailable: Object.freeze(['loading', 'declared'] as const),
});

export function createMcpFabricRuntimeLifecycle(initialState: RuntimeState = 'declared'): RuntimeLifecycle {
  assertState(initialState);
  return { schema: MCP_FABRIC_RUNTIME_LIFECYCLE_SCHEMA, state: initialState, history: [initialState] };
}

export function canTransitionMcpFabricRuntime(from: string, to: string): boolean {
  assertState(from);
  assertState(to);
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertMcpFabricRuntimeTransition(from: string, to: string): void {
  if (!canTransitionMcpFabricRuntime(from, to)) {
    throw new Error(`invalid_mcp_fabric_runtime_transition: ${from}->${to}`);
  }
}

export function transitionMcpFabricRuntime(lifecycle: RuntimeLifecycle, nextState: string): RuntimeLifecycle {
  assertState(lifecycle?.state);
  assertState(nextState);
  assertMcpFabricRuntimeTransition(lifecycle.state, nextState);
  return lifecycle.state === nextState
    ? lifecycle
    : {
      schema: MCP_FABRIC_RUNTIME_LIFECYCLE_SCHEMA,
      state: nextState,
      history: [...lifecycle.history, nextState],
    };
}

function assertState(state: any): asserts state is RuntimeState {
  if (!(MCP_FABRIC_RUNTIME_STATES as readonly string[]).includes(state)) {
    throw new Error(`unsupported_mcp_fabric_runtime_state: ${state}`);
  }
}
