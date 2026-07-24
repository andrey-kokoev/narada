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

export function createSiteOperatingLoopRunLifecycle(initialState: any = 'requested'): any {
  assertState(SITE_OPERATING_LOOP_RUN_STATES, initialState, 'run');
  return evidence(SITE_OPERATING_LOOP_RUN_STATE_SCHEMA, initialState);
}

export function createSiteOperatingLoopTriggerLifecycle(initialState: any = 'pending'): any {
  assertState(SITE_OPERATING_LOOP_TRIGGER_STATES, initialState, 'trigger');
  return evidence(SITE_OPERATING_LOOP_TRIGGER_STATE_SCHEMA, initialState);
}

export function createSiteOperatingLoopHealthLifecycle(initialState: any = 'unknown'): any {
  assertState(SITE_OPERATING_LOOP_HEALTH_STATES, initialState, 'health');
  return evidence(SITE_OPERATING_LOOP_HEALTH_STATE_SCHEMA, initialState);
}

export function transitionSiteOperatingLoopRunLifecycle(lifecycle: any, nextState: any): any {
  return transition(lifecycle, nextState, SITE_OPERATING_LOOP_RUN_STATES, RUN_TRANSITIONS, SITE_OPERATING_LOOP_RUN_STATE_SCHEMA, 'run');
}

export function transitionSiteOperatingLoopTriggerLifecycle(lifecycle: any, nextState: any): any {
  return transition(lifecycle, nextState, SITE_OPERATING_LOOP_TRIGGER_STATES, TRIGGER_TRANSITIONS, SITE_OPERATING_LOOP_TRIGGER_STATE_SCHEMA, 'trigger');
}

export function transitionSiteOperatingLoopHealthLifecycle(lifecycle: any, nextState: any): any {
  return transition(lifecycle, nextState, SITE_OPERATING_LOOP_HEALTH_STATES, HEALTH_TRANSITIONS, SITE_OPERATING_LOOP_HEALTH_STATE_SCHEMA, 'health');
}

export function canTransitionSiteOperatingLoopRun(from: any, to: any): boolean {
  return canTransition(from, to, SITE_OPERATING_LOOP_RUN_STATES, RUN_TRANSITIONS, 'run');
}

export function canTransitionSiteOperatingLoopTrigger(from: any, to: any): boolean {
  return canTransition(from, to, SITE_OPERATING_LOOP_TRIGGER_STATES, TRIGGER_TRANSITIONS, 'trigger');
}

export function canTransitionSiteOperatingLoopHealth(from: any, to: any): boolean {
  return canTransition(from, to, SITE_OPERATING_LOOP_HEALTH_STATES, HEALTH_TRANSITIONS, 'health');
}

export function siteOperatingLoopRunLifecycleFromStatus(status: any): any {
  const state = {
    requested: 'requested',
    locking: 'locking',
    running: 'running',
    ok: 'completed',
    completed: 'completed',
    failed: 'failed',
    locked: 'locked',
    aborted: 'aborted',
  }[String(status)] ?? 'requested';
  return createSiteOperatingLoopRunLifecycle(state);
}

export function siteOperatingLoopTriggerLifecycleFromStatus(status: any): any {
  const normalized = String(status);
  return createSiteOperatingLoopTriggerLifecycle(
    ['pending', 'claimed', 'completed', 'failed', 'skipped'].includes(normalized) ? normalized : 'pending',
  );
}

export function siteOperatingLoopHealthLifecycleFromStatus(status: any): any {
  const normalized = String(status);
  return createSiteOperatingLoopHealthLifecycle(
    ['healthy', 'degraded', 'critical'].includes(normalized) ? normalized : 'unknown',
  );
}

function transition(lifecycle: any, nextState: any, states: any, transitions: any, schema: any, kind: any): any {
  assertState(states, nextState, kind);
  assertState(states, lifecycle.state, kind);
  if (lifecycle.state !== nextState && !transitions[lifecycle.state].includes(nextState)) {
    throw new Error(`invalid_site_operating_loop_${kind}_transition: ${lifecycle.state}->${nextState}`);
  }
  return lifecycle.state === nextState
    ? lifecycle
    : evidence(schema, nextState, [...lifecycle.history, nextState]);
}

function canTransition(from: any, to: any, states: any, transitions: any, kind: any): boolean {
  assertState(states, from, kind);
  assertState(states, to, kind);
  return from === to || transitions[from].includes(to);
}

function evidence(schema: any, state: any, history: any = [state]): any {
  return { schema, state, history };
}

function assertState(states: any, state: any, kind: any): void {
  if (!states.includes(state)) throw new Error(`unsupported_site_operating_loop_${kind}_state: ${state}`);
}
