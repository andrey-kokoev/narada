export interface AgentSessionsScope {
  site: string | null;
  agent: string | null;
  status: 'unscoped' | 'valid' | 'invalid';
  reason: string | null;
}

export interface AgentSessionScopeEntry {
  sessionId: string;
  agentId: string | null;
  siteId: string | null;
}

export function parseAgentSessionsScope(search: string): AgentSessionsScope {
  const query = new URLSearchParams(search);
  const site = query.get('site')?.trim() || null;
  const agent = query.get('agent')?.trim() || null;
  if (!site && !agent) return { site: null, agent: null, status: 'unscoped', reason: null };
  if (!site || !agent) return { site, agent, status: 'invalid', reason: 'site_and_agent_scope_required' };
  const prefix = `${site.toLowerCase()}.`;
  if (!agent.toLowerCase().startsWith(prefix) || agent.length <= prefix.length) {
    return { site, agent, status: 'invalid', reason: 'canonical_agent_scope_mismatch' };
  }
  return { site, agent, status: 'valid', reason: null };
}

export function isAgentSessionsScopeActive(scope: AgentSessionsScope): boolean {
  return scope.status !== 'unscoped';
}

export function agentSessionMatchesScope(session: AgentSessionScopeEntry, scope: AgentSessionsScope): boolean {
  if (scope.status === 'invalid') return false;
  if (scope.site && (session.siteId ?? '').toLowerCase() !== scope.site.toLowerCase()) return false;
  if (scope.agent) {
    const agentId = (session.agentId ?? '').toLowerCase();
    if (agentId !== scope.agent.toLowerCase()) return false;
  }
  return true;
}

export function filterAgentSessionsByScope<T extends AgentSessionScopeEntry>(sessions: T[], scope: AgentSessionsScope): T[] {
  if (!isAgentSessionsScopeActive(scope)) return sessions;
  return sessions.filter((session) => agentSessionMatchesScope(session, scope));
}
