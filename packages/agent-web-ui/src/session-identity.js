import { unwrapRuntimeEvent } from './runtime-events.js';
import { agentIdentityDisplay, normalizeAgentIdentityRef } from '@narada2/agent-identity';

/**
 * @param {unknown[]} events
 * @param {{ siteId?: string | null, agentId?: string | null, role?: string | null, sessionId?: string | null } | undefined} fallback
 * @returns {{ siteId: string | null, agentId: string | null, role: string | null, sessionId: string | null, title: string, subtitle: string }}
 */
export function summarizeSessionIdentity(events = [], fallback = undefined) {
  let siteId = fallback?.siteId ?? null;
  let agentId = fallback?.agentId ?? null;
  let role = fallback?.role ?? null;
  let sessionId = fallback?.sessionId ?? null;
  let identityRef = null;
  for (const message of events) {
    const event = unwrapRuntimeEvent(message);
    if (!event || typeof event !== 'object') continue;
    identityRef = normalizeAgentIdentityRef(objectField(event, 'agent_identity_ref')) ?? identityRef;
    siteId = stringField(event, 'site_id') ?? siteId;
    agentId = stringField(event, 'agent_id') ?? agentId;
    role = stringField(event, 'role') ?? role;
    sessionId = stringField(event, 'session_id') ?? sessionId;
    const whoami = objectField(event, 'whoami');
    identityRef = normalizeAgentIdentityRef(objectField(whoami, 'agent_identity_ref')) ?? identityRef;
    agentId = stringField(whoami, 'identity') ?? agentId;
    role = stringField(whoami, 'role') ?? role;
    const checkpoint = objectField(event, 'checkpoint');
    siteId = stringField(checkpoint, 'site_id') ?? siteId;
    const nested = event.event;
    if (nested && typeof nested === 'object') {
      identityRef = normalizeAgentIdentityRef(objectField(nested, 'agent_identity_ref')) ?? identityRef;
      agentId = stringField(nested, 'agent_id') ?? agentId;
      role = stringField(nested, 'role') ?? role;
      sessionId = stringField(nested, 'session_id') ?? sessionId;
      siteId = stringField(nested, 'site_id') ?? siteId;
    }
  }
  const fallbackTitle = agentId && agentId.includes('.') ? agentId : [siteId, agentId].filter(Boolean).join('.') || agentId;
  const title = agentIdentityDisplay(identityRef, fallbackTitle) || 'Narada Session';
  const subtitleParts = [];
  if (role) subtitleParts.push(`Role: ${role}`);
  subtitleParts.push('Browser projection attached to one NARS runtime.');
  return { siteId, agentId, role, sessionId, title, subtitle: subtitleParts.join(' · ') };
}

function objectField(record, field) {
  if (!record || typeof record !== 'object') return null;
  const value = record[field];
  return value && typeof value === 'object' ? value : null;
}

function stringField(record, field) {
  if (!record || typeof record !== 'object') return null;
  const value = record[field];
  return typeof value === 'string' && value ? value : null;
}
