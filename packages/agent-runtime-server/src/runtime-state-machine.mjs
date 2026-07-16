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
  const reservedCanonicalFieldNames = new Set([
    'schema',
    'event',
    'timestamp',
    'previous_state',
    'terminal_state',
    stateField,
  ]);
  const conflictingIdentityField = Object.keys(identityFields)
    .find((fieldName) => reservedCanonicalFieldNames.has(fieldName));
  if (conflictingIdentityField) {
    throw new Error(`narada_state_machine_reserved_identity_field:${conflictingIdentityField}`);
  }
  const canonicalFieldNames = new Set([
    ...reservedCanonicalFieldNames,
    ...Object.keys(identityFields),
  ]);
  const extensionFields = (fields) => Object.fromEntries(
    Object.entries(fields ?? {}).filter(([key]) => !canonicalFieldNames.has(key)),
  );

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
      ...extensionFields(metadata),
      ...extensionFields(evidence),
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
      ...extensionFields(metadata),
    }),
    history: () => history.slice(),
  });
}
