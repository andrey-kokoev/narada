export const SITE_OPERATING_LOOP_EXECUTION_STATE_SCHEMA = 'narada.site_operating_loop.execution.lifecycle_state.v1';

export const SITE_OPERATING_LOOP_EXECUTION_STATES = Object.freeze([
  'scheduled',
  'admitted',
  'running',
  'waiting',
  'retry',
  'completed',
  'failed',
  'cancelled',
]);

const TRANSITIONS = Object.freeze({
  scheduled: Object.freeze(['admitted', 'failed', 'cancelled']),
  admitted: Object.freeze(['running', 'waiting', 'failed', 'cancelled']),
  running: Object.freeze(['waiting', 'retry', 'completed', 'failed', 'cancelled']),
  waiting: Object.freeze(['running', 'retry', 'failed', 'cancelled']),
  retry: Object.freeze(['running', 'waiting', 'failed', 'cancelled']),
  completed: Object.freeze([]),
  failed: Object.freeze([]),
  cancelled: Object.freeze([]),
});

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);

export function createSiteOperatingLoopExecutionLifecycle(initialState: any = 'scheduled'): any {
  assertState(initialState);
  return { schema: SITE_OPERATING_LOOP_EXECUTION_STATE_SCHEMA, state: initialState, history: [initialState] };
}

export function canTransitionSiteOperatingLoopExecution(from: any, to: any): boolean {
  assertState(from);
  assertState(to);
  return from === to || (TRANSITIONS as Record<string, readonly string[]>)[from].includes(to);
}

export function assertSiteOperatingLoopExecutionTransition(from: any, to: any): void {
  if (!canTransitionSiteOperatingLoopExecution(from, to)) {
    throw new Error(`invalid_site_operating_loop_execution_transition: ${from}->${to}`);
  }
}

export function transitionSiteOperatingLoopExecution(lifecycle: any, nextState: any): any {
  assertState(lifecycle?.state);
  assertSiteOperatingLoopExecutionTransition(lifecycle.state, nextState);
  return lifecycle.state === nextState
    ? lifecycle
    : {
      schema: SITE_OPERATING_LOOP_EXECUTION_STATE_SCHEMA,
      state: nextState,
      history: [...lifecycle.history, nextState],
    };
}

export function isTerminalSiteOperatingLoopExecutionState(state: any): boolean {
  assertState(state);
  return TERMINAL_STATES.has(state);
}

export function siteOperatingLoopExecutionLifecycleFromRunState(state: any): any {
  const mapped = {
    requested: 'scheduled',
    locking: 'admitted',
    locked: 'admitted',
    running: 'running',
    completed: 'completed',
    ok: 'completed',
    failed: 'failed',
    aborted: 'cancelled',
  }[String(state)];
  return createSiteOperatingLoopExecutionLifecycle(mapped ?? 'scheduled');
}

function assertState(state: any): void {
  if (!SITE_OPERATING_LOOP_EXECUTION_STATES.includes(state)) {
    throw new Error(`unsupported_site_operating_loop_execution_state: ${state}`);
  }
}
