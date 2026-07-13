import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionAgentContextMcpSession,
  createAgentContextMcpSession,
  transitionAgentContextMcpSession,
} from './agent-context-mcp-session-state.mjs';

test('agent context MCP session follows initialize, serve, and close protocol', () => {
  let session = createAgentContextMcpSession();
  for (const state of ['initializing', 'initialized', 'serving', 'closing', 'closed']) {
    session = transitionAgentContextMcpSession(session, state);
  }
  assert.equal(session.state, 'closed');
  assert.deepEqual(session.history, ['created', 'initializing', 'initialized', 'serving', 'closing', 'closed']);
  assert.equal(canTransitionAgentContextMcpSession('created', 'serving'), false);
  assert.equal(canTransitionAgentContextMcpSession('serving', 'closing'), true);
});

test('agent context MCP session rejects serving after close', () => {
  const session = createAgentContextMcpSession('closed');
  assert.throws(
    () => transitionAgentContextMcpSession(session, 'serving'),
    /invalid_agent_context_mcp_session_transition/,
  );
});
