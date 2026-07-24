import { unwrapRuntimeEvent } from './runtime-events.ts';
import { agentIdentityDisplay, normalizeAgentIdentityRef } from '@narada2/agent-identity';
import { isRecord, type UnknownRecord } from './types.ts';

export type SessionIdentityFallback = {
  siteId?: string | null;
  agentId?: string | null;
  role?: string | null;
  sessionId?: string | null;
};

export type SessionIdentitySummary = SessionIdentityFallback & {
  siteId: string | null;
  agentId: string | null;
  role: string | null;
  sessionId: string | null;
  title: string;
  subtitle: string;
};

/**
 * @param {unknown[]} events
 * @param {{ siteId?: string | null, agentId?: string | null, role?: string | null, sessionId?: string | null } | undefined} fallback
 * @returns {{ siteId: string | null, agentId: string | null, role: string | null, sessionId: string | null, title: string, subtitle: string }}
 */
export function summarizeSessionIdentity(
  events: readonly unknown[] = [],
  fallback?: SessionIdentityFallback,
): SessionIdentitySummary {
  let siteId = fallback?.siteId ?? null;
  let agentId = fallback?.agentId ?? null;
  let role = fallback?.role ?? null;
  let sessionId = fallback?.sessionId ?? null;
  const fallbackFields = {
    siteId: Boolean(fallback?.siteId),
    agentId: Boolean(fallback?.agentId),
    role: Boolean(fallback?.role),
    sessionId: Boolean(fallback?.sessionId),
  };
  let identityRef = null;
  for (const message of events) {
    const event = unwrapRuntimeEvent(message);
    if (!event || typeof event !== 'object') continue;
    identityRef = normalizeAgentIdentityRef(objectField(event, 'agent_identity_ref')) ?? identityRef;
    if (!fallbackFields.siteId) siteId = stringField(event, 'site_id') ?? siteId;
    if (!fallbackFields.agentId) agentId = stringField(event, 'agent_id') ?? agentId;
    if (!fallbackFields.role) role = stringField(event, 'role') ?? role;
    if (!fallbackFields.sessionId) sessionId = stringField(event, 'session_id') ?? sessionId;
    const whoami = objectField(event, 'whoami');
    identityRef = normalizeAgentIdentityRef(objectField(whoami, 'agent_identity_ref')) ?? identityRef;
    if (!fallbackFields.agentId) agentId = stringField(whoami, 'identity') ?? agentId;
    if (!fallbackFields.role) role = stringField(whoami, 'role') ?? role;
    const checkpoint = objectField(event, 'checkpoint');
    if (!fallbackFields.siteId) siteId = stringField(checkpoint, 'site_id') ?? siteId;
    const nested = event.event;
    if (nested && typeof nested === 'object') {
      identityRef = normalizeAgentIdentityRef(objectField(nested, 'agent_identity_ref')) ?? identityRef;
      if (!fallbackFields.agentId) agentId = stringField(nested, 'agent_id') ?? agentId;
      if (!fallbackFields.role) role = stringField(nested, 'role') ?? role;
      if (!fallbackFields.sessionId) sessionId = stringField(nested, 'session_id') ?? sessionId;
      if (!fallbackFields.siteId) siteId = stringField(nested, 'site_id') ?? siteId;
    }
  }
  // Health already supplied the authoritative display identity when present;
  // do not let an older retained event's identity reference rewrite it.
  const displayIdentityRef = fallbackFields.agentId && fallback?.agentId ? null : identityRef;
  const displayAgentId = displayIdentityRef ? agentIdentityDisplay(displayIdentityRef, agentId) : null;
  const resolvedAgentId = displayAgentId ?? agentId;
  const fallbackTitle = resolvedAgentId && resolvedAgentId.includes('.') ? resolvedAgentId : [siteId, resolvedAgentId].filter(Boolean).join('.') || resolvedAgentId;
  const title = agentIdentityDisplay(displayIdentityRef, fallbackTitle) || 'Narada Session';
  const subtitleParts = [];
  if (role) subtitleParts.push(`Role: ${role}`);
  subtitleParts.push('Browser projection attached to one NARS runtime.');
  return { siteId, agentId: resolvedAgentId, role, sessionId, title, subtitle: subtitleParts.join(' · ') };
}

/**
 * @param {{ siteId?: string | null, agentId?: string | null } | undefined} identity
 * @returns {{ siteLabel: string | null, agentLabel: string | null }}
 */
export function summarizeSessionTitleParts(identity?: SessionIdentityFallback): {
  siteLabel: string | null;
  agentLabel: string | null;
} {
  const agentId = typeof identity?.agentId === 'string' && identity.agentId ? identity.agentId : null;
  return {
    siteLabel: typeof identity?.siteId === 'string' && identity.siteId ? identity.siteId : sitePartFromAgentId(agentId),
    agentLabel: agentPartFromAgentId(agentId),
  };
}

function objectField(record: unknown, field: string): UnknownRecord | null {
  if (!isRecord(record)) return null;
  const value = record[field];
  return isRecord(value) ? value : null;
}

function stringField(record: unknown, field: string): string | null {
  if (!isRecord(record)) return null;
  const value = record[field];
  return typeof value === 'string' && value ? value : null;
}

function sitePartFromAgentId(agentId: string | null): string | null {
  if (!agentId || !agentId.includes('.')) return null;
  return agentId.split('.').slice(0, -1).join('.') || null;
}

function agentPartFromAgentId(agentId: string | null): string | null {
  if (!agentId) return null;
  return agentId.includes('.') ? agentId.split('.').at(-1) || null : agentId;
}
