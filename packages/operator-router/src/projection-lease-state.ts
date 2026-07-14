export const OPERATOR_ROUTER_PROJECTION_LEASE_SCHEMA = 'narada.operator_router.projection_lease.lifecycle_state.v1' as const;

export const OPERATOR_ROUTER_PROJECTION_LEASE_STATES = [
  'requested',
  'registering',
  'active',
  'renewing',
  'degraded',
  'recovering',
  'detached',
  'expired',
] as const;

export type OperatorRouterProjectionLeaseState = typeof OPERATOR_ROUTER_PROJECTION_LEASE_STATES[number];
export interface OperatorRouterProjectionLeaseLifecycle {
  schema: typeof OPERATOR_ROUTER_PROJECTION_LEASE_SCHEMA;
  state: OperatorRouterProjectionLeaseState;
  history: readonly OperatorRouterProjectionLeaseState[];
}

const transitions: Record<OperatorRouterProjectionLeaseState, readonly OperatorRouterProjectionLeaseState[]> = {
  requested: ['registering', 'expired', 'detached'],
  registering: ['active', 'degraded', 'expired', 'detached'],
  active: ['renewing', 'degraded', 'expired', 'detached'],
  renewing: ['active', 'degraded', 'expired', 'detached'],
  degraded: ['recovering', 'expired', 'detached'],
  recovering: ['active', 'degraded', 'expired', 'detached'],
  detached: [],
  expired: [],
};

export function createOperatorRouterProjectionLeaseLifecycle(
  initialState: OperatorRouterProjectionLeaseState = 'requested',
): OperatorRouterProjectionLeaseLifecycle {
  assertState(initialState);
  return { schema: OPERATOR_ROUTER_PROJECTION_LEASE_SCHEMA, state: initialState, history: [initialState] };
}

export function canTransitionOperatorRouterProjectionLease(
  from: OperatorRouterProjectionLeaseState,
  to: OperatorRouterProjectionLeaseState,
): boolean {
  assertState(from);
  assertState(to);
  return from === to || transitions[from].includes(to);
}

export function transitionOperatorRouterProjectionLease(
  lifecycle: OperatorRouterProjectionLeaseLifecycle,
  nextState: OperatorRouterProjectionLeaseState,
): OperatorRouterProjectionLeaseLifecycle {
  assertState(lifecycle.state);
  if (!canTransitionOperatorRouterProjectionLease(lifecycle.state, nextState)) {
    throw new Error(`invalid_operator_router_projection_lease_transition: ${lifecycle.state}->${nextState}`);
  }
  return lifecycle.state === nextState
    ? lifecycle
    : {
      schema: OPERATOR_ROUTER_PROJECTION_LEASE_SCHEMA,
      state: nextState,
      history: [...lifecycle.history, nextState],
    };
}

function assertState(state: string): asserts state is OperatorRouterProjectionLeaseState {
  if (!(OPERATOR_ROUTER_PROJECTION_LEASE_STATES as readonly string[]).includes(state)) {
    throw new Error(`unsupported_operator_router_projection_lease_state: ${state}`);
  }
}
