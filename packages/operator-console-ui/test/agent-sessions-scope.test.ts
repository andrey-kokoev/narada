import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agentSessionMatchesScope,
  filterAgentSessionsByScope,
  isAgentSessionsScopeActive,
  parseAgentSessionsScope,
} from '../src/agent-sessions/scope.ts';

const sessions = [
  { sessionId: 'session-1', agentId: 'sonar.resident', siteId: 'sonar' },
  { sessionId: 'session-2', agentId: 'sonar.builder', siteId: 'sonar' },
  { sessionId: 'session-3', agentId: 'andrey-user.resident', siteId: 'andrey-user' },
  { sessionId: 'session-4', agentId: null, siteId: null },
];

test('parse agent sessions scope from the query string', () => {
  assert.deepEqual(parseAgentSessionsScope('?site=sonar&agent=sonar.resident'), { site: 'sonar', agent: 'sonar.resident' });
  assert.deepEqual(parseAgentSessionsScope('?agent=sonar.resident'), { site: null, agent: 'sonar.resident' });
  assert.deepEqual(parseAgentSessionsScope(''), { site: null, agent: null });
  assert.equal(isAgentSessionsScopeActive(parseAgentSessionsScope('?site=sonar')), true);
  assert.equal(isAgentSessionsScopeActive(parseAgentSessionsScope('')), false);
});

test('scope filters to exactly the matching site and agent sessions', () => {
  const scoped = filterAgentSessionsByScope(sessions, { site: 'sonar', agent: 'sonar.resident' });
  assert.deepEqual(scoped.map((session) => session.sessionId), ['session-1']);
  const siteOnly = filterAgentSessionsByScope(sessions, { site: 'sonar', agent: null });
  assert.deepEqual(siteOnly.map((session) => session.sessionId), ['session-1', 'session-2']);
  const unscoped = filterAgentSessionsByScope(sessions, { site: null, agent: null });
  assert.equal(unscoped.length, sessions.length);
});

test('agent scope accepts canonical ids and bare local ids', () => {
  assert.equal(agentSessionMatchesScope(sessions[0]!, { site: null, agent: 'sonar.resident' }), true);
  assert.equal(agentSessionMatchesScope(sessions[0]!, { site: null, agent: 'resident' }), true);
  assert.equal(agentSessionMatchesScope(sessions[2]!, { site: null, agent: 'resident' }), true);
  assert.equal(agentSessionMatchesScope(sessions[0]!, { site: null, agent: 'builder' }), false);
  assert.equal(agentSessionMatchesScope(sessions[3]!, { site: null, agent: 'resident' }), false);
});
