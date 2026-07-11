import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue';
import { createSessionProjection } from '../../session-projection.js';
import { summarizeSessionIdentity as summarizeProjectedSessionIdentity } from '../../session-identity.js';
import type { ProjectedEventRow } from '../lib/eventProjection';
import type { HealthIdentitySummary } from './useHealthStatus';
import type { AgentActivityState } from './useAgentActivity';
import type { ProjectionVerbosity } from './useProjectionVerbosity';

export interface SessionIdentitySummary {
  siteId: string | null;
  agentId: string | null;
  role: string | null;
  sessionId: string | null;
  title: string;
  subtitle: string;
}

export function useNarsEvents(
  events: unknown[],
  verbosity: Ref<ProjectionVerbosity>,
  healthIdentity?: Ref<HealthIdentitySummary>,
  healthBody?: Ref<Record<string, unknown> | null>,
) {
  const nowMs = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    timer = setInterval(() => {
      nowMs.value = Date.now();
    }, 1000);
  });
  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  const projection = computed(() => createSessionProjection(events, {
    verbosity: verbosity.value,
    nowMs: nowMs.value,
    healthSnapshot: healthBody?.value ?? null,
  }));
  const rows = computed(() => projection.value.rows as ProjectedEventRow[]);
  const summarizedStateSampleCount = computed(() => projection.value.droppedStateSampleCount);
  const activity = computed<AgentActivityState>(() => projection.value.activity as AgentActivityState);
  const activeTurnId = computed(() => activity.value.activeTurnId ?? null);
  const sessionIdentity = computed(() => {
    const snapshot = Array.from({ length: events.length }, (_, index) => events[index]);
    return summarizeProjectedSessionIdentity(snapshot, healthIdentity?.value) as SessionIdentitySummary;
  });
  return { projection, rows, summarizedStateSampleCount, activity, activeTurnId, sessionIdentity };
}
