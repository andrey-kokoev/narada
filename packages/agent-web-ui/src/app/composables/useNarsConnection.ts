import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch, type Ref } from 'vue';
import { createNarsClient, type NarsClientConnection } from '../../protocol/narsClient';
import { isTransportLive } from '../lib/operatorInputReadiness';

export interface NarsConnectionConfig {
  eventEndpoint: string | null;
  healthEndpoint?: string | null;
  inputEndpoint?: string | null;
  browserToken?: string | null;
  sessionId?: string | null;
  maxReplay?: number;
  view?: Ref<string>;
}

export interface NarsEventHistoryState {
  view: string;
  hasMore: boolean;
  historyTruncated: boolean;
  loading: boolean;
  beforeSequence: number | null;
}

export function useNarsConnection(
  config: NarsConnectionConfig,
  retain: (event: unknown) => void,
  retainMany: (events: unknown[]) => void = (events) => events.forEach(retain),
  onEventsRead?: (event: { event: 'session_events_read'; events: unknown[]; event_count?: number; has_more?: boolean; truncated?: boolean; history_truncated?: boolean }) => void,
) {
  const streamText = ref(config.eventEndpoint ? 'starting' : 'event endpoint not configured');
  const streamLive = ref(false);
  const activeTurnId = ref<string | boolean | null>(null);
  const connection = shallowRef<NarsClientConnection | null>(null);
  const history = reactive<Record<string, NarsEventHistoryState>>({});

  function historyFor(view: string): NarsEventHistoryState {
    history[view] ??= { view, hasMore: false, historyTruncated: false, loading: false, beforeSequence: null };
    return history[view];
  }

  function updateHistory(event: { view?: string; has_more?: boolean; truncated?: boolean; history_truncated?: boolean; first_sequence?: number | null; cursor?: { before_sequence?: number | null } | null }) {
    const state = historyFor(event.view ?? config.view?.value ?? 'conversation');
    state.hasMore = Boolean(event.has_more);
    state.historyTruncated ||= Boolean(event.history_truncated ?? event.truncated);
    state.beforeSequence = event.first_sequence
      ?? event.cursor?.before_sequence
      ?? state.beforeSequence;
  }

  connection.value = createNarsClient({
    endpoint: config.eventEndpoint,
    healthEndpoint: config.healthEndpoint,
    inputEndpoint: config.inputEndpoint,
    browserToken: config.browserToken,
    sessionId: config.sessionId,
    maxReplay: config.maxReplay,
    view: config.view?.value ?? 'conversation',
    onStatus(status) { streamText.value = status; },
    onTransportState(phase) { streamLive.value = isTransportLive(phase); },
    onEvent(event) {
      activeTurnId.value = connection.value?.activeTurnId ?? null;
      if (isSubscriptionLifecycleEvent(event)) updateHistory(event);
      if (isEventsReadResponse(event)) {
        retainMany(event.events);
        updateHistory(event);
        const state = historyFor(event.view ?? config.view?.value ?? 'conversation');
        state.loading = false;
        onEventsRead?.(event);
        return;
      }
      retain(event);
    },
    onDecodeError(message) {
      retain({ event: 'web_ui_decode_error', message });
    },
  });

  if (config.view) {
    watch(config.view, (view) => {
      const state = historyFor(view);
      state.hasMore = false;
      state.historyTruncated = false;
      state.beforeSequence = null;
      connection.value?.subscribeView(view);
    });
  }

  function loadEarlier(): boolean {
    const view = config.view?.value ?? 'conversation';
    const state = historyFor(view);
    if (state.loading || !state.hasMore || !connection.value) return false;
    state.loading = true;
    const sent = connection.value.readEventsPage({
      view,
      beforeSequence: state.beforeSequence ?? undefined,
      direction: 'backward',
      limit: config.maxReplay,
    });
    if (!sent) state.loading = false;
    return sent;
  }

  onBeforeUnmount(() => connection.value?.close());
  return {
    connection,
    streamText,
    streamLive,
    activeTurnId,
    history,
    hasEarlierEvents: computed(() => historyFor(config.view?.value ?? 'conversation').hasMore),
    historyTruncated: computed(() => historyFor(config.view?.value ?? 'conversation').historyTruncated),
    loadingEarlier: computed(() => historyFor(config.view?.value ?? 'conversation').loading),
    loadEarlier,
  };
}

function isEventsReadResponse(event: unknown): event is { event: 'session_events_read'; view?: string; events: unknown[]; event_count?: number; has_more?: boolean; truncated?: boolean; history_truncated?: boolean; first_sequence?: number | null; cursor?: { before_sequence?: number | null } | null } {
  return Boolean(event && typeof event === 'object' && (event as { event?: unknown }).event === 'session_events_read' && Array.isArray((event as { events?: unknown }).events));
}

function isSubscriptionLifecycleEvent(event: unknown): event is { event: 'session_events_subscription_started' | 'session_events_replay_completed'; view?: string; has_more?: boolean; truncated?: boolean; history_truncated?: boolean; first_sequence?: number | null; cursor?: { before_sequence?: number | null } | null } {
  return Boolean(event && typeof event === 'object' && ((event as { event?: unknown }).event === 'session_events_subscription_started' || (event as { event?: unknown }).event === 'session_events_replay_completed'));
}
