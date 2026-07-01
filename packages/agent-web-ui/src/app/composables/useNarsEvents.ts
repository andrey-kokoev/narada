import { computed, type Ref } from 'vue';
import { createSessionProjection } from '../../session-projection.js';
import { unwrapRuntimeEvent } from '../../runtime-events.js';
import type { ProjectedEventRow } from '../lib/eventProjection';
import type { HealthIdentitySummary } from './useHealthStatus';
import type { ProjectionVerbosity } from './useProjectionVerbosity';

export interface SessionIdentitySummary {
  siteId: string | null;
  agentId: string | null;
  role: string | null;
  sessionId: string | null;
  title: string;
  subtitle: string;
}

export function useNarsEvents(events: unknown[], verbosity: Ref<ProjectionVerbosity>, healthIdentity?: Ref<HealthIdentitySummary>) {
  const projection = computed(() => createSessionProjection(events, { verbosity: verbosity.value }));
  const rows = computed(() => projection.value.rows as ProjectedEventRow[]);
  const summarizedStateSampleCount = computed(() => projection.value.droppedStateSampleCount);
  const sessionIdentity = computed(() => {
    const snapshot = Array.from({ length: events.length }, (_, index) => events[index]);
    return summarizeSessionIdentity(snapshot, healthIdentity?.value);
  });
  return { rows, summarizedStateSampleCount, sessionIdentity };
}

function summarizeSessionIdentity(events: unknown[], fallback: HealthIdentitySummary | undefined): SessionIdentitySummary {
  let siteId: string | null = fallback?.siteId ?? null;
  let agentId: string | null = fallback?.agentId ?? null;
  let role: string | null = fallback?.role ?? null;
  let sessionId: string | null = fallback?.sessionId ?? null;
  for (const message of events) {
    const event = unwrapRuntimeEvent(message);
    if (!event || typeof event !== 'object') continue;
    siteId = stringField(event, 'site_id') ?? siteId;
    agentId = stringField(event, 'agent_id') ?? agentId;
    role = stringField(event, 'role') ?? role;
    sessionId = stringField(event, 'session_id') ?? sessionId;
    const whoami = objectField(event, 'whoami');
    agentId = stringField(whoami, 'identity') ?? agentId;
    role = stringField(whoami, 'role') ?? role;
    const checkpoint = objectField(event, 'checkpoint');
    siteId = stringField(checkpoint, 'site_id') ?? siteId;
    const nested = event.event;
    if (nested && typeof nested === 'object') {
      agentId = stringField(nested, 'agent_id') ?? agentId;
      role = stringField(nested, 'role') ?? role;
      sessionId = stringField(nested, 'session_id') ?? sessionId;
      siteId = stringField(nested, 'site_id') ?? siteId;
    }
  }
  const title = [siteId, agentId].filter(Boolean).join(' / ') || agentId || 'Narada Session';
  const subtitleParts = [];
  if (role) subtitleParts.push(`Role: ${role}`);
  subtitleParts.push('Browser projection attached to one NARS runtime.');
  return { siteId, agentId, role, sessionId, title, subtitle: subtitleParts.join(' · ') };
}

function objectField(record: unknown, field: string): Record<string, unknown> | null {
  if (!record || typeof record !== 'object') return null;
  const value = (record as Record<string, unknown>)[field];
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function stringField(record: unknown, field: string): string | null {
  if (!record || typeof record !== 'object') return null;
  const value = (record as Record<string, unknown>)[field];
  return typeof value === 'string' && value ? value : null;
}
