export interface AgentIdentityRef {
  schema: 'narada.agent_identity_ref.v1';
  site_id: string | null;
  local_agent_id: string;
  role: string;
  canonical_agent_id: string;
  display: string;
  source_agent_id: string;
  scope: 'site_scoped' | 'unscoped';
}

export declare const AGENT_IDENTITY_REF_SCHEMA: 'narada.agent_identity_ref.v1';
export declare function buildAgentIdentityRef(identityValue: unknown, roleValue?: unknown, explicitSiteId?: unknown): AgentIdentityRef;
export declare function agentIdentityDisplay(identityRef: unknown, fallback?: unknown): string | null;
export declare function normalizeAgentIdentityRef(value: unknown): AgentIdentityRef | null;
export declare function agentIdentityRefMatchesRequest(identityRef: unknown, requestedAgentId: unknown): boolean;
export declare function agentIdentityGroupKey(identityRef: unknown, fallbackAgentId?: unknown, fallbackSiteId?: unknown): string;
export declare function renderOperatorValue(value: unknown, options?: {
  mode?: 'inline' | 'block';
  limit?: number;
  depth?: number;
}): string;
export declare function renderOperatorObjectSummary(value: unknown, options?: {
  limit?: number;
  depth?: number;
}): string;
export declare function roleSegment(agentId: unknown): string | null;
export declare function siteSegment(agentId: unknown): string | null;
export declare function normalizeSiteToken(value: unknown): string;
