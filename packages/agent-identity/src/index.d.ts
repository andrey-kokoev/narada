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

export interface AgentIdentityScopeV2 {
  kind: 'narada_site' | 'unscoped';
  site_id?: string;
}

export interface AgentIdentityRefV2 {
  schema: 'narada.agent_identity_ref.v2';
  identity_scope: AgentIdentityScopeV2;
  local_agent_id: string;
  role: string;
  canonical_agent_id: string;
  display: string;
  legacy_agent_id?: string;
}

export interface AgentIdentityResolutionProvenance {
  kind: string;
  field?: string;
  value?: string;
}

export type AgentIdentityResolution =
  | { status: 'resolved'; value: AgentIdentityRefV2; provenance: AgentIdentityResolutionProvenance[] }
  | { status: 'refused'; code: string; message: string };

export declare const AGENT_IDENTITY_REF_SCHEMA: 'narada.agent_identity_ref.v1';
export declare const AGENT_IDENTITY_REF_V2_SCHEMA: 'narada.agent_identity_ref.v2';
export declare function buildAgentIdentityRef(identityValue: unknown, roleValue?: unknown, explicitSiteId?: unknown): AgentIdentityRef;
export declare function buildAgentIdentityRefV2(input?: unknown): AgentIdentityRefV2;
export declare function resolveAgentIdentityRef(input: unknown, context?: {
  site_id?: unknown;
  siteId?: unknown;
  role?: unknown;
  agent_id?: unknown;
  agentId?: unknown;
  target_version?: unknown;
  targetVersion?: unknown;
}): AgentIdentityResolution;
export declare function agentIdentityDisplay(identityRef: unknown, fallback?: unknown): string | null;
export declare function normalizeAgentIdentityRef(value: unknown): AgentIdentityRef | null;
export declare function normalizeAgentIdentityRefV2(value: unknown, context?: Record<string, unknown>): AgentIdentityRefV2 | null;
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
