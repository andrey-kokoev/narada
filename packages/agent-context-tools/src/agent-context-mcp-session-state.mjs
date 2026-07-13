const AGENT_CONTEXT_MCP_SESSION_STATE_SCHEMA = 'narada.agent_context_mcp.session_state.v1';

const AGENT_CONTEXT_MCP_SESSION_STATES = Object.freeze([
  'created',
  'initializing',
  'initialized',
  'serving',
  'closing',
  'closed',
  'failed',
]);

const AGENT_CONTEXT_MCP_SESSION_TRANSITIONS = Object.freeze({
  created: Object.freeze(['initializing', 'closing', 'failed']),
  initializing: Object.freeze(['initialized', 'failed']),
  initialized: Object.freeze(['serving', 'closing', 'failed']),
  serving: Object.freeze(['closing', 'failed']),
  closing: Object.freeze(['closed']),
  failed: Object.freeze(['closing', 'closed']),
  closed: Object.freeze([]),
});

function assertAgentContextMcpSessionState(state) {
  if (!AGENT_CONTEXT_MCP_SESSION_STATES.includes(state)) {
    throw new Error(`unsupported_agent_context_mcp_session_state: ${state}`);
  }
  return state;
}

function canTransitionAgentContextMcpSession(from, to) {
  assertAgentContextMcpSessionState(from);
  assertAgentContextMcpSessionState(to);
  return from === to || AGENT_CONTEXT_MCP_SESSION_TRANSITIONS[from].includes(to);
}

function createAgentContextMcpSession(initialState = 'created') {
  assertAgentContextMcpSessionState(initialState);
  return {
    schema: AGENT_CONTEXT_MCP_SESSION_STATE_SCHEMA,
    state: initialState,
    history: [initialState],
  };
}

function transitionAgentContextMcpSession(session, nextState) {
  assertAgentContextMcpSessionState(nextState);
  if (!canTransitionAgentContextMcpSession(session.state, nextState)) {
    throw new Error(`invalid_agent_context_mcp_session_transition: ${session.state}->${nextState}`);
  }
  if (session.state === nextState) return session;
  return {
    schema: AGENT_CONTEXT_MCP_SESSION_STATE_SCHEMA,
    state: nextState,
    history: [...session.history, nextState],
  };
}

export {
  AGENT_CONTEXT_MCP_SESSION_STATE_SCHEMA,
  AGENT_CONTEXT_MCP_SESSION_STATES,
  AGENT_CONTEXT_MCP_SESSION_TRANSITIONS,
  assertAgentContextMcpSessionState,
  canTransitionAgentContextMcpSession,
  createAgentContextMcpSession,
  transitionAgentContextMcpSession,
};
