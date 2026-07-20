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
  assert.deepEqual(parseAgentSessionsScope('?site=sonar&agent=sonar.resident'), { site: 'sonar', agent: 'sonar.resident', status: 'valid', reason: null });
  assert.deepEqual(parseAgentSessionsScope('?agent=sonar.resident'), { site: null, agent: 'sonar.resident', status: 'invalid', reason: 'site_and_agent_scope_required' });
  assert.deepEqual(parseAgentSessionsScope('?site=sonar&agent=other.resident'), { site: 'sonar', agent: 'other.resident', status: 'invalid', reason: 'canonical_agent_scope_mismatch' });
  assert.deepEqual(parseAgentSessionsScope(''), { site: null, agent: null, status: 'unscoped', reason: null });
  assert.equal(isAgentSessionsScopeActive(parseAgentSessionsScope('?site=sonar')), true);
  assert.equal(isAgentSessionsScopeActive(parseAgentSessionsScope('')), false);
});

test('scope filters to exactly the matching site and agent sessions', () => {
  const scoped = filterAgentSessionsByScope(sessions, { site: 'sonar', agent: 'sonar.resident', status: 'valid', reason: null });
  assert.deepEqual(scoped.map((session) => session.sessionId), ['session-1']);
  const invalid = filterAgentSessionsByScope(sessions, { site: 'sonar', agent: null, status: 'invalid', reason: 'site_and_agent_scope_required' });
  assert.deepEqual(invalid, []);
  const unscoped = filterAgentSessionsByScope(sessions, { site: null, agent: null, status: 'unscoped', reason: null });
  assert.equal(unscoped.length, sessions.length);
});

test('agent scope requires an exact canonical Site-agent match', () => {
  const scope = { site: 'sonar', agent: 'sonar.resident', status: 'valid', reason: null } as const;
  assert.equal(agentSessionMatchesScope(sessions[0]!, scope), true);
  assert.equal(agentSessionMatchesScope(sessions[2]!, scope), false);
  assert.equal(agentSessionMatchesScope(sessions[1]!, scope), false);
  assert.equal(agentSessionMatchesScope(sessions[3]!, scope), false);
});
