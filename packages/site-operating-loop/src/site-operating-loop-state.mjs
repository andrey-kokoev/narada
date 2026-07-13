export const SITE_OPERATING_LOOP_RUN_STATE_SCHEMA = 'narada.site_operating_loop.run.lifecycle_state.v1';
export const SITE_OPERATING_LOOP_TRIGGER_STATE_SCHEMA = 'narada.site_operating_loop.trigger.lifecycle_state.v1';
export const SITE_OPERATING_LOOP_HEALTH_STATE_SCHEMA = 'narada.site_operating_loop.health.lifecycle_state.v1';

export const SITE_OPERATING_LOOP_RUN_STATES = Object.freeze([
  'requested',
  'locking',
  'running',
  'locked',
  'completed',
  'failed',
  'aborted',
]);

export const SITE_OPERATING_LOOP_TRIGGER_STATES = Object.freeze([
  'pending',
  'claimed',
  'completed',
  'failed',
  'skipped',
]);

export const SITE_OPERATING_LOOP_HEALTH_STATES = Object.freeze([
  'unknown',
  'healthy',
  'degraded',
  'critical',
]);

const RUN_TRANSITIONS = Object.freeze({
  requested: Object.freeze(['locking', 'aborted', 'failed']),
  locking: Object.freeze(['running', 'locked', 'aborted', 'failed']),
  running: Object.freeze(['completed', 'failed', 'aborted']),
  locked: Object.freeze([]),
  completed: Object.freeze([]),
  failed: Object.freeze([]),
  aborted: Object.freeze([]),
});

const TRIGGER_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['claimed', 'skipped']),
  claimed: Object.freeze(['completed', 'failed', 'skipped']),
  completed: Object.freeze([]),
  failed: Object.freeze([]),
  skipped: Object.freeze([]),
});

const HEALTH_TRANSITIONS = Object.freeze({
  unknown: Object.freeze(['healthy', 'degraded', 'critical']),
  healthy: Object.freeze(['degraded', 'critical']),
  degraded: Object.freeze(['healthy', 'critical']),
  critical: Object.freeze(['healthy', 'degraded']),
});

export function createSiteOperatingLoopRunLifecycle(initialState = 'requested') {
  assertState(SITE_OPERATING_LOOP_RUN_STATES, initialState, 'run');
  return evidence(SITE_OPERATING_LOOP_RUN_STATE_SCHEMA, initialState);
}

export function createSiteOperatingLoopTriggerLifecycle(initialState = 'pending') {
  assertState(SITE_OPERATING_LOOP_TRIGGER_STATES, initialState, 'trigger');
  return evidence(SITE_OPERATING_LOOP_TRIGGER_STATE_SCHEMA, initialState);
}

export function createSiteOperatingLoopHealthLifecycle(initialState = 'unknown') {
  assertState(SITE_OPERATING_LOOP_HEALTH_STATES, initialState, 'health');
  return evidence(SITE_OPERATING_LOOP_HEALTH_STATE_SCHEMA, initialState);
}

export function transitionSiteOperatingLoopRunLifecycle(lifecycle, nextState) {
  return transition(lifecycle, nextState, SITE_OPERATING_LOOP_RUN_STATES, RUN_TRANSITIONS, SITE_OPERATING_LOOP_RUN_STATE_SCHEMA, 'run');
}

export function transitionSiteOperatingLoopTriggerLifecycle(lifecycle, nextState) {
  return transition(lifecycle, nextState, SITE_OPERATING_LOOP_TRIGGER_STATES, TRIGGER_TRANSITIONS, SITE_OPERATING_LOOP_TRIGGER_STATE_SCHEMA, 'trigger');
}

export function transitionSiteOperatingLoopHealthLifecycle(lifecycle, nextState) {
  return transition(lifecycle, nextState, SITE_OPERATING_LOOP_HEALTH_STATES, HEALTH_TRANSITIONS, SITE_OPERATING_LOOP_HEALTH_STATE_SCHEMA, 'health');
}

export function canTransitionSiteOperatingLoopRun(from, to) {
  return canTransition(from, to, SITE_OPERATING_LOOP_RUN_STATES, RUN_TRANSITIONS, 'run');
}

export function canTransitionSiteOperatingLoopTrigger(from, to) {
  return canTransition(from, to, SITE_OPERATING_LOOP_TRIGGER_STATES, TRIGGER_TRANSITIONS, 'trigger');
}

export function canTransitionSiteOperatingLoopHealth(from, to) {
  return canTransition(from, to, SITE_OPERATING_LOOP_HEALTH_STATES, HEALTH_TRANSITIONS, 'health');
}

export function siteOperatingLoopRunLifecycleFromStatus(status) {
  const state = {
    running: 'running',
    ok: 'completed',
    failed: 'failed',
    locked: 'locked',
    aborted: 'aborted',
  }[String(status)] ?? 'requested';
  return createSiteOperatingLoopRunLifecycle(state);
}

export function siteOperatingLoopTriggerLifecycleFromStatus(status) {
  const normalized = String(status);
  return createSiteOperatingLoopTriggerLifecycle(
    ['pending', 'claimed', 'completed', 'failed', 'skipped'].includes(normalized) ? normalized : 'pending',
  );
}

export function siteOperatingLoopHealthLifecycleFromStatus(status) {
  const normalized = String(status);
  return createSiteOperatingLoopHealthLifecycle(
    ['healthy', 'degraded', 'critical'].includes(normalized) ? normalized : 'unknown',
  );
}

function transition(lifecycle, nextState, states, transitions, schema, kind) {
  assertState(states, nextState, kind);
  assertState(states, lifecycle.state, kind);
  if (lifecycle.state !== nextState && !transitions[lifecycle.state].includes(nextState)) {
    throw new Error(`invalid_site_operating_loop_${kind}_transition: ${lifecycle.state}->${nextState}`);
  }
  return lifecycle.state === nextState
    ? lifecycle
    : evidence(schema, nextState, [...lifecycle.history, nextState]);
}

function canTransition(from, to, states, transitions, kind) {
  assertState(states, from, kind);
  assertState(states, to, kind);
  return from === to || transitions[from].includes(to);
}

function evidence(schema, state, history = [state]) {
  return { schema, state, history };
}

function assertState(states, state, kind) {
  if (!states.includes(state)) throw new Error(`unsupported_site_operating_loop_${kind}_state: ${state}`);
}
