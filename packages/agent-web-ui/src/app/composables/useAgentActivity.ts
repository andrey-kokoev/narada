import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue';
import { createSessionProjection } from '../../session-projection.ts';
import type { ActivitySnapshot } from '../../session-projection-activity.ts';

export type AgentActivityState = ActivitySnapshot;

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
    return createSessionProjection(sourceEvents ?? [], {
      nowMs: now.value,
      healthSnapshot: healthBody?.value ?? null,
    }).activity;
  });
  return { activity };
}

export function accumulateActivity(events: unknown[], nowMs = Date.now()): AgentActivityState {
  return createSessionProjection(events, { nowMs }).activity;
}
