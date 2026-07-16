import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue';
import { createSessionProjection } from '../../session-projection.js';

export interface AgentActivityState {
  active: boolean;
  state: 'idle' | 'queued' | 'thinking' | 'tool' | 'streaming' | 'failed';
  label: string;
  detail: string | null;
  elapsedSeconds: number;
  startedAtMs: number | null;
  activeTurnId: string | boolean | null;
}

export const IDLE_ACTIVITY: AgentActivityState = {
  active: false,
  state: 'idle',
  label: 'Idle',
  detail: null,
  elapsedSeconds: 0,
  startedAtMs: null,
  activeTurnId: null,
};

export function useAgentActivity(events: unknown[] | Ref<unknown[]>, healthBody?: Ref<Record<string, unknown> | null>) {
  const now = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    timer = setInterval(() => {
      now.value = Date.now();
    }, 1000);
  });
  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  const activity = computed<AgentActivityState>(() => {
    const sourceEvents = Array.isArray(events) ? events : events.value;
    return reconcileActivityWithHealth(
      normalizeActivity(createSessionProjection(sourceEvents ?? [], { nowMs: now.value, healthSnapshot: healthBody?.value ?? null }).activity),
      healthBody?.value ?? null,
    );
  });
  return { activity };
}

export function accumulateActivity(events: unknown[], nowMs = Date.now()): AgentActivityState {
  return normalizeActivity(createSessionProjection(events, { nowMs }).activity);
}

function normalizeActivity(value: AgentActivityState): AgentActivityState {
  if (!value?.active) return { ...IDLE_ACTIVITY };
  return value;
}

function reconcileActivityWithHealth(activity: AgentActivityState, health: Record<string, unknown> | null): AgentActivityState {
  if (!activity.active || !health) return activity;
  if (!Object.prototype.hasOwnProperty.call(health, 'active_turn_state')) return activity;
  if (health.active_turn_state !== 'running') {
    const observedAtMs = parseHealthTimestamp(health.health_observed_at)
      ?? parseHealthTimestamp(health.generated_at)
      ?? parseHealthTimestamp(health.timestamp);
    if (observedAtMs !== null && activity.startedAtMs !== null && activity.startedAtMs > observedAtMs) return activity;
    return { ...IDLE_ACTIVITY };
  }
  return activity;
}

function parseHealthTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
