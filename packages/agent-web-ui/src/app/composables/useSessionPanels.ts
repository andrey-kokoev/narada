import { computed, reactive, ref, type Ref } from 'vue';
import {
  availableSessionPanelIds,
  isSessionPanelAvailable,
  SESSION_PANEL_REGISTRY,
  type SessionPanelCapabilityContext,
  type SessionPanelId,
} from '../panel-registry';

export type SessionPanelOpenState = Record<SessionPanelId, boolean>;

const initialOpenState: SessionPanelOpenState = {
  runtime_topology: false,
  mcp: false,
  generic_affordance: false,
  artifacts: false,
  delegation: false,
  git: false,
  inbox: false,
  mailbox: false,
  scheduler: false,
  sop: false,
  surface_feedback: false,
  task_lifecycle: false,
};

export function useSessionPanels(context: Ref<SessionPanelCapabilityContext>) {
  const state = reactive({ ...initialOpenState });
  const selectedGenericAffordanceKey = ref<string | null>(null);
  const availableIds = computed(() => availableSessionPanelIds(context.value));
  const registrations = computed(() => SESSION_PANEL_REGISTRY);

  function isAvailable(id: SessionPanelId): boolean {
    return isSessionPanelAvailable(id, context.value);
  }

  function open(id: SessionPanelId): void {
    if (!isAvailable(id)) return;
    state[id] = true;
  }

  function close(id: SessionPanelId): void {
    state[id] = false;
  }

  function openGeneric(key: string): void {
    if (!isAvailable('generic_affordance')) return;
    selectedGenericAffordanceKey.value = key;
    state.generic_affordance = true;
  }

  return {
    state,
    registrations,
    availableIds,
    selectedGenericAffordanceKey,
    isAvailable,
    open,
    close,
    openGeneric,
  };
}

export type SessionPanelsController = ReturnType<typeof useSessionPanels>;
