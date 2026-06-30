import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue';
import { createSessionProjection } from '../../session-projection.js';

export interface AgentActivityState {
  active: boolean;
  state: 'idle' | 'queued' | 'thinking' | 'tool' | 'streaming' | 'failed';
  label: string;
  detail: string | null;
  elapsedSeconds: number;
  startedAtMs: number | null;
}

export const IDLE_ACTIVITY: AgentActivityState = {
  active: false,
  state: 'idle',
  label: 'Idle',
  detail: null,
  elapsedSeconds: 0,
  startedAtMs: null,
};

export function useAgentActivity(events: unknown[] | Ref<unknown[]>) {
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
    return normalizeActivity(createSessionProjection(sourceEvents ?? [], { nowMs: now.value }).activity);
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
