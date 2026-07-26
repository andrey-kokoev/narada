export const SITE_LIFT_LIFECYCLE_SCHEMA: any = 'narada.site_lift.lifecycle_state.v1';

export const SITE_LIFT_LIFECYCLE_STATES: any = Object.freeze([
  'requested',
  'validating',
  'planned',
  'created',
  'sending',
  'sent',
  'receiving',
  'received',
  'admitting',
  'admitted',
  'partial',
  'refused',
  'failed',
]);

const TRANSITIONS: any = Object.freeze({
  requested: Object.freeze(['validating', 'refused', 'failed']),
  validating: Object.freeze(['planned', 'refused', 'failed']),
  planned: Object.freeze(['created', 'sending', 'partial', 'refused', 'failed']),
  created: Object.freeze(['sending', 'admitted', 'partial', 'failed']),
  sending: Object.freeze(['sent', 'partial', 'refused', 'failed']),
  sent: Object.freeze(['receiving', 'partial', 'failed']),
  receiving: Object.freeze(['received', 'partial', 'refused', 'failed']),
  received: Object.freeze(['admitting', 'refused', 'failed']),
  admitting: Object.freeze(['admitted', 'partial', 'refused', 'failed']),
  admitted: Object.freeze(['partial']),
  partial: Object.freeze(['sending', 'receiving', 'admitting', 'failed']),
  refused: Object.freeze([]),
  failed: Object.freeze([]),
});

export function createSiteLiftLifecycle(initialState: any = 'requested') : any{
  assertState(initialState);
  return { schema: SITE_LIFT_LIFECYCLE_SCHEMA, state: initialState, history: [initialState] };
}

export function canTransitionSiteLiftLifecycle(from: any, to: any) : any{
  assertState(from);
  assertState(to);
  return from === to || TRANSITIONS[from].includes(to);
}

export function transitionSiteLiftLifecycle(lifecycle: any, nextState: any) : any{
  assertState(nextState);
  if (!canTransitionSiteLiftLifecycle(lifecycle.state, nextState)) {
    throw new Error(`invalid_site_lift_transition: ${lifecycle.state}->${nextState}`);
  }
  return lifecycle.state === nextState
    ? lifecycle
    : { schema: SITE_LIFT_LIFECYCLE_SCHEMA, state: nextState, history: [...lifecycle.history, nextState] };
}

export function siteLiftLifecycleFromStatus(status: any) : any{
  const normalized: any = String(status);
  const state: any = ['planned', 'created', 'sent', 'admitted', 'partial', 'refused', 'failed'].includes(normalized)
    ? normalized
    : 'requested';
  return createSiteLiftLifecycle(state);
}

function assertState(state: any) : any{
  if (!SITE_LIFT_LIFECYCLE_STATES.includes(state)) throw new Error(`unsupported_site_lift_state: ${state}`);
}
