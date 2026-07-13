import type { McpSurfaceCarrierLifecycleState } from './types.js';

export const MCP_SURFACE_CARRIER_LIFECYCLE_SCHEMA = 'narada.mcp.surface_carrier.lifecycle_state.v1' as const;

const allowedTransitions: Record<McpSurfaceCarrierLifecycleState, readonly McpSurfaceCarrierLifecycleState[]> = {
  stale: ['restart_requested'],
  restart_requested: ['stale', 'carrier_restarted'],
  carrier_restarted: ['stale', 'restart_requested', 'live_verified'],
  live_verified: ['stale', 'restart_requested'],
};

export interface McpSurfaceCarrierLifecycleTransition {
  from: McpSurfaceCarrierLifecycleState;
  to: McpSurfaceCarrierLifecycleState;
}

export interface McpSurfaceCarrierLifecycleMachine {
  state: McpSurfaceCarrierLifecycleState;
  history: McpSurfaceCarrierLifecycleState[];
}

export function canTransitionMcpSurfaceCarrierLifecycle(
  from: McpSurfaceCarrierLifecycleState,
  to: McpSurfaceCarrierLifecycleState,
): boolean {
  return from === to || allowedTransitions[from].includes(to);
}

export function assertMcpSurfaceCarrierLifecycleTransition(
  from: McpSurfaceCarrierLifecycleState,
  to: McpSurfaceCarrierLifecycleState,
): void {
  if (!canTransitionMcpSurfaceCarrierLifecycle(from, to)) {
    throw new Error(`invalid_mcp_surface_carrier_lifecycle_transition: ${from} -> ${to}`);
  }
}

export function createMcpSurfaceCarrierLifecycle(
  initialState: McpSurfaceCarrierLifecycleState = 'stale',
): McpSurfaceCarrierLifecycleMachine {
  return { state: initialState, history: [initialState] };
}

export function transitionMcpSurfaceCarrierLifecycle(
  machine: McpSurfaceCarrierLifecycleMachine,
  nextState: McpSurfaceCarrierLifecycleState,
): McpSurfaceCarrierLifecycleMachine {
  assertMcpSurfaceCarrierLifecycleTransition(machine.state, nextState);
  if (machine.state === nextState) return machine;
  return {
    state: nextState,
    history: [...machine.history, nextState],
  };
}
