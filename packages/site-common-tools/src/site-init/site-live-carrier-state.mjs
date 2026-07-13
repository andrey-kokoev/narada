const SITE_LIVE_CARRIER_STATE_SCHEMA = 'narada.site_live_carrier.lifecycle_state.v1';

const SITE_LIVE_CARRIER_STATES = Object.freeze([
  'requested',
  'planning',
  'planned',
  'applying',
  'applied',
  'verifying',
  'verified',
  'recovering',
  'recovered',
  'refused',
  'failed',
]);

const SITE_LIVE_CARRIER_TRANSITIONS = Object.freeze({
  requested: Object.freeze(['planning', 'refused']),
  planning: Object.freeze(['planned', 'refused']),
  planned: Object.freeze(['applying', 'verifying', 'recovering', 'refused']),
  applying: Object.freeze(['applied', 'refused', 'failed']),
  verifying: Object.freeze(['verified', 'refused', 'failed']),
  recovering: Object.freeze(['recovered', 'refused', 'failed']),
  applied: Object.freeze([]),
  verified: Object.freeze([]),
  recovered: Object.freeze([]),
  refused: Object.freeze([]),
  failed: Object.freeze([]),
});

function assertSiteLiveCarrierState(state) {
  if (!SITE_LIVE_CARRIER_STATES.includes(state)) {
    throw new Error(`unsupported_site_live_carrier_state: ${state}`);
  }
  return state;
}

function canTransitionSiteLiveCarrier(from, to) {
  assertSiteLiveCarrierState(from);
  assertSiteLiveCarrierState(to);
  return from === to || SITE_LIVE_CARRIER_TRANSITIONS[from].includes(to);
}

function createSiteLiveCarrierLifecycle(initialState = 'requested') {
  assertSiteLiveCarrierState(initialState);
  return {
    schema: SITE_LIVE_CARRIER_STATE_SCHEMA,
    state: initialState,
    history: [initialState],
  };
}

function transitionSiteLiveCarrierLifecycle(lifecycle, nextState) {
  assertSiteLiveCarrierState(nextState);
  if (!canTransitionSiteLiveCarrier(lifecycle.state, nextState)) {
    throw new Error(`invalid_site_live_carrier_transition: ${lifecycle.state}->${nextState}`);
  }
  if (lifecycle.state === nextState) return lifecycle;
  return {
    schema: SITE_LIVE_CARRIER_STATE_SCHEMA,
    state: nextState,
    history: [...lifecycle.history, nextState],
  };
}

function assertSiteLiveCarrierTransition(lifecycle, nextState) {
  if (!canTransitionSiteLiveCarrier(lifecycle.state, nextState)) {
    throw new Error(`invalid_site_live_carrier_transition: ${lifecycle.state}->${nextState}`);
  }
  return true;
}

export {
  SITE_LIVE_CARRIER_STATE_SCHEMA,
  SITE_LIVE_CARRIER_STATES,
  SITE_LIVE_CARRIER_TRANSITIONS,
  assertSiteLiveCarrierState,
  assertSiteLiveCarrierTransition,
  canTransitionSiteLiveCarrier,
  createSiteLiveCarrierLifecycle,
  transitionSiteLiveCarrierLifecycle,
};
