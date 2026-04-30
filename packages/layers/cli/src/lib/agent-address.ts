import type { AgentRoster, AgentRosterEntry } from './task-governance.js';

export type AgentAddressResolution =
  | {
      status: 'exact';
      requested_agent: string;
      resolved_agent: string;
      role: string | null;
      site_prefix: string | null;
      candidates: string[];
    }
  | {
      status: 'role_exact_one';
      requested_agent: string;
      resolved_agent: string;
      role: string;
      site_prefix: string | null;
      candidates: string[];
    }
  | {
      status: 'zero_match' | 'multi_match';
      requested_agent: string;
      resolved_agent: null;
      role: string | null;
      site_prefix: string | null;
      candidates: string[];
      repair_command: string;
      error: string;
    };

export function agentAddressResolutionPublic(resolution: AgentAddressResolution): Record<string, unknown> {
  return {
    status: resolution.status,
    requested_agent: resolution.requested_agent,
    resolved_agent: resolution.resolved_agent,
    role: resolution.role,
    site_prefix: resolution.site_prefix,
    candidates: resolution.candidates,
    ...('repair_command' in resolution ? { repair_command: resolution.repair_command } : {}),
    ...('error' in resolution ? { error: resolution.error } : {}),
  };
}

function parseRoleAddress(requested: string): { role: string; sitePrefix: string | null } {
  const trimmed = requested.trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot > 0 && dot < trimmed.length - 1) {
    return {
      role: trimmed.slice(dot + 1),
      sitePrefix: trimmed.slice(0, dot),
    };
  }
  return {
    role: trimmed,
    sitePrefix: null,
  };
}

function rosterSitePrefix(agentId: string): string | null {
  const dot = agentId.lastIndexOf('.');
  return dot > 0 ? agentId.slice(0, dot) : null;
}

function isActiveRosterCard(agent: AgentRosterEntry): boolean {
  return agent.status !== 'done';
}

function roleMatches(agent: AgentRosterEntry, role: string): boolean {
  return agent.role.toLowerCase() === role.toLowerCase();
}

function sitePrefixMatches(agent: AgentRosterEntry, sitePrefix: string | null): boolean {
  if (!sitePrefix) return true;
  return rosterSitePrefix(agent.agent_id) === sitePrefix;
}

export function resolveAgentAddress(roster: AgentRoster, requestedAgent: string): AgentAddressResolution {
  const requested = requestedAgent.trim();
  const exact = roster.agents.find((agent) => agent.agent_id === requested);
  if (exact) {
    return {
      status: 'exact',
      requested_agent: requested,
      resolved_agent: exact.agent_id,
      role: exact.role,
      site_prefix: rosterSitePrefix(exact.agent_id),
      candidates: [exact.agent_id],
    };
  }

  const { role, sitePrefix } = parseRoleAddress(requested);
  const candidates = roster.agents
    .filter(isActiveRosterCard)
    .filter((agent) => roleMatches(agent, role))
    .filter((agent) => sitePrefixMatches(agent, sitePrefix));
  const candidateIds = candidates.map((agent) => agent.agent_id).sort();

  if (candidateIds.length === 1) {
    return {
      status: 'role_exact_one',
      requested_agent: requested,
      resolved_agent: candidateIds[0]!,
      role,
      site_prefix: sitePrefix,
      candidates: candidateIds,
    };
  }

  if (candidateIds.length === 0) {
    return {
      status: 'zero_match',
      requested_agent: requested,
      resolved_agent: null,
      role,
      site_prefix: sitePrefix,
      candidates: [],
      repair_command: `narada task roster add <agent-id> --role ${role}`,
      error: `No active roster agent matches role-shaped address ${requested}`,
    };
  }

  return {
    status: 'multi_match',
    requested_agent: requested,
    resolved_agent: null,
    role,
    site_prefix: sitePrefix,
    candidates: candidateIds,
    repair_command: `Use one concrete agent id: ${candidateIds.join(', ')}`,
    error: `Role-shaped address ${requested} is ambiguous across ${candidateIds.length} active roster agents`,
  };
}
