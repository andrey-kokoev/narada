import { computed, type Ref } from 'vue';
import { createSessionProjection } from '../../session-projection.js';
import { summarizeSessionIdentity as summarizeProjectedSessionIdentity } from '../../session-identity.js';
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
    return summarizeProjectedSessionIdentity(snapshot, healthIdentity?.value) as SessionIdentitySummary;
  });
  return { rows, summarizedStateSampleCount, sessionIdentity };
}
