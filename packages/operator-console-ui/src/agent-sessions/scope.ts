export interface AgentSessionsScope {
  site: string | null;
  agent: string | null;
}

export interface AgentSessionScopeEntry {
  sessionId: string;
  agentId: string | null;
  siteId: string | null;
}

export function parseAgentSessionsScope(search: string): AgentSessionsScope {
  const query = new URLSearchParams(search);
  return {
    site: query.get('site')?.trim() || null,
    agent: query.get('agent')?.trim() || null,
  };
}

export function isAgentSessionsScopeActive(scope: AgentSessionsScope): boolean {
  return Boolean(scope.site || scope.agent);
}

export function agentSessionMatchesScope(session: AgentSessionScopeEntry, scope: AgentSessionsScope): boolean {
  if (scope.site && (session.siteId ?? '').toLowerCase() !== scope.site.toLowerCase()) return false;
  if (scope.agent) {
    const agentId = (session.agentId ?? '').toLowerCase();
    const wanted = scope.agent.toLowerCase();
    if (agentId !== wanted && !agentId.endsWith(`.${wanted}`)) return false;
  }
  return true;
}

export function filterAgentSessionsByScope<T extends AgentSessionScopeEntry>(sessions: T[], scope: AgentSessionsScope): T[] {
  if (!isAgentSessionsScopeActive(scope)) return sessions;
  return sessions.filter((session) => agentSessionMatchesScope(session, scope));
}
