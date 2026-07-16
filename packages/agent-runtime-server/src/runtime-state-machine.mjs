export function createNarsStateMachine({
  initialState = null,
  identityFields = {},
  metadata = {},
  schema,
  event,
  stateField,
  includeTerminalState = true,
  isTerminalState,
  assertTransition,
  recordSameState = false,
  now = () => new Date().toISOString(),
  onTransition = () => {},
} = {}) {
  let state = initialState;
  const history = [];

  function transition(nextState, evidence = {}) {
    assertTransition(state, nextState);
    if (!recordSameState && state === nextState) return history.at(-1) ?? null;
    const previousState = state;
    state = nextState;
    const record = {
      schema,
      event,
      timestamp: now(),
      ...identityFields,
      previous_state: previousState,
      [stateField]: nextState,
      ...(includeTerminalState
        ? { terminal_state: isTerminalState(nextState) ? nextState : null }
        : {}),
      ...metadata,
      ...evidence,
    };
    history.push(record);
    onTransition(record);
    return record;
  }

  return Object.freeze({
    get state() { return state; },
    transition,
    snapshot: () => ({
      schema,
      ...identityFields,
      [stateField]: state,
      ...(includeTerminalState
        ? { terminal_state: isTerminalState(state) ? state : null }
        : {}),
      ...metadata,
    }),
    history: () => history.slice(),
  });
}
