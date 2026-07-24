import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue';
import { createSessionProjection } from '../../session-projection.ts';
import { summarizeSessionIdentity as summarizeProjectedSessionIdentity } from '../../session-identity.ts';
import type { ProjectedEventRow } from '../lib/eventProjection';
import type { HealthIdentitySummary } from './useHealthStatus';
import type { AgentActivityState } from './useAgentActivity';
import type { ProjectionVerbosity, ProjectionViewOption } from './useProjectionVerbosity';

export interface SessionIdentitySummary {
  siteId: string | null;
  agentId: string | null;
  role: string | null;
  sessionId: string | null;
  title: string;
  subtitle: string;
}

export interface OperatorInputDeliveryProjection {
  phase: 'draft' | 'submitting' | 'accepted' | 'rejected' | 'queued' | 'steering' | 'completed' | 'failed' | 'timed_out' | 'relay_pending' | 'reviewing' | 'retried' | 'late_reconciled' | 'discarded' | 'expired';
  requestId: string | null;
  content: string | null;
  method: string | null;
  idempotencyKey: string | null;
  source: string | null;
  deliveryMode: string | null;
  activeTurnId: string | boolean | null;
  acceptedAtMs: number | null;
  startedAtMs: number | null;
  terminalAtMs: number | null;
  terminalState: string | null;
  error: string | null;
  history: string[];
  label: string;
  detail: string | null;
}

export function useNarsEvents(
  events: unknown[],
  verbosity: Readonly<Ref<ProjectionVerbosity>>,
  activeView: Readonly<Ref<ProjectionViewOption>> | undefined,
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
    customView: activeView?.value && !activeView.value.builtIn ? activeView.value : null,
    nowMs: nowMs.value,
    healthSnapshot: healthBody?.value ?? null,
  }));
  const rows = computed(() => projection.value.rows as ProjectedEventRow[]);
  const summarizedStateSampleCount = computed(() => projection.value.droppedStateSampleCount);
  const activity = computed<AgentActivityState>(() => projection.value.activity as AgentActivityState);
  const activeTurnId = computed(() => activity.value.activeTurnId ?? null);
  const operatorDelivery = computed<OperatorInputDeliveryProjection>(() => projection.value.operatorDelivery as OperatorInputDeliveryProjection);
  const sessionIdentity = computed(() => {
    const snapshot = Array.from({ length: events.length }, (_, index) => events[index]);
    return summarizeProjectedSessionIdentity(snapshot, healthIdentity?.value) as SessionIdentitySummary;
  });
  return { projection, rows, summarizedStateSampleCount, activity, activeTurnId, operatorDelivery, sessionIdentity };
}
