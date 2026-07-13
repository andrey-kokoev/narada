export const SITE_INIT_LIFECYCLE_SCHEMA = 'narada.site_init.lifecycle_state.v1';

export const SITE_INIT_LIFECYCLE_STATES = Object.freeze([
  'requested',
  'inspecting',
  'planned',
  'previewed',
  'applying',
  'seeded',
  'initialized',
  'already_initialized',
  'not_initialized',
  'doctor_report',
  'blocked',
  'refused',
  'partial',
  'failed',
]);

const TRANSITIONS = Object.freeze({
  requested: Object.freeze(['inspecting', 'refused', 'failed']),
  inspecting: Object.freeze([
    'planned',
    'already_initialized',
    'not_initialized',
    'doctor_report',
    'blocked',
    'refused',
    'failed',
  ]),
  planned: Object.freeze(['previewed', 'applying', 'refused', 'failed']),
  previewed: Object.freeze([]),
  applying: Object.freeze(['seeded', 'partial', 'failed']),
  seeded: Object.freeze(['initialized', 'partial', 'failed']),
  initialized: Object.freeze([]),
  already_initialized: Object.freeze([]),
  not_initialized: Object.freeze([]),
  doctor_report: Object.freeze([]),
  blocked: Object.freeze([]),
  refused: Object.freeze([]),
  partial: Object.freeze(['applying', 'failed']),
  failed: Object.freeze([]),
});

export function createSiteInitLifecycle(initialState = 'requested') {
  assertState(initialState);
  return {
    schema: SITE_INIT_LIFECYCLE_SCHEMA,
    state: initialState,
    history: [initialState],
  };
}

export function canTransitionSiteInitLifecycle(from, to) {
  assertState(from);
  assertState(to);
  return from === to || TRANSITIONS[from].includes(to);
}

export function transitionSiteInitLifecycle(lifecycle, nextState) {
  assertState(nextState);
  if (!canTransitionSiteInitLifecycle(lifecycle.state, nextState)) {
    throw new Error(`invalid_site_init_transition: ${lifecycle.state}->${nextState}`);
  }
  return lifecycle.state === nextState
    ? lifecycle
    : { schema: SITE_INIT_LIFECYCLE_SCHEMA, state: nextState, history: [...lifecycle.history, nextState] };
}

function assertState(state) {
  if (!SITE_INIT_LIFECYCLE_STATES.includes(state)) throw new Error(`unsupported_site_init_state: ${state}`);
}
