type FabricLifecycle = { state: string; history: string[] };

export const MCP_FABRIC_LIFECYCLE_SCHEMA = 'narada.mcp.fabric.lifecycle_state.v1';

const allowedTransitions: Record<string, string[]> = {
  discovered: ['loaded', 'load_failed'],
  loaded: ['starting', 'closed'],
  starting: ['ready', 'start_failed', 'probe_failed'],
  ready: ['closing', 'probe_failed'],
  probe_failed: ['closing', 'closed'],
  start_failed: ['closing', 'closed'],
  closing: ['closed', 'close_failed'],
  close_failed: ['closed'],
  load_failed: ['discovered'],
};

export function canTransitionMcpFabricLifecycle(from: string, to: string): boolean {
  return from === to || (allowedTransitions[from] ?? []).includes(to);
}

export function assertMcpFabricLifecycleTransition(from: string, to: string): void {
  if (!canTransitionMcpFabricLifecycle(from, to)) {
    throw new Error(`invalid_mcp_fabric_lifecycle_transition: ${from} -> ${to}`);
  }
}

export function createMcpFabricLifecycle(initialState: string = 'discovered'): FabricLifecycle {
  return { state: initialState, history: [initialState] };
}

export function transitionMcpFabricLifecycle(machine: FabricLifecycle, nextState: string): FabricLifecycle {
  assertMcpFabricLifecycleTransition(machine.state, nextState);
  if (machine.state === nextState) return machine;
  return {
    state: nextState,
    history: [...machine.history, nextState],
  };
}
