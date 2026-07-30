import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch, type Ref } from 'vue';
import { createNarsClient, type NarsClientConnection } from '../../protocol/narsClient';
import type { NarsTransportPhase } from '../../protocol/sessionTransportAdapters';
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
  retainMany: (events: unknown[]) => void = (events: any) => events.forEach(retain),
  onEventsRead?: (event: { event: 'session_events_read'; events: unknown[]; event_count?: number; has_more?: boolean; truncated?: boolean; history_truncated?: boolean }) => void,
) {
  const streamText = ref(config.eventEndpoint ? 'starting' : 'event endpoint not configured');
  const streamLive = ref(false);
  const streamPhase = ref<NarsTransportPhase>(config.eventEndpoint ? 'idle' : 'unconfigured');
  const streamReason = ref<string | null>(null);
  const activeTurnId = ref<string | boolean | null>(null);
  const connection = shallowRef<NarsClientConnection | null>(null);
  const history = reactive<Record<string, NarsEventHistoryState>>({});
  let stopped = false;

  function historyFor(view: string): NarsEventHistoryState {
    history[view] ??= { view, hasMore: false, historyTruncated: false, loading: false, beforeSequence: null };
    return history[view];
  }

  function updateHistory(event: { view?: string; has_more?: boolean; truncated?: boolean; history_truncated?: boolean; first_sequence?: number | null; cursor?: { before_sequence?: number | null } | null }) {
    const state = historyFor(config.view?.value ?? event.view ?? 'conversation');
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
    view: transportViewForProjection(config.view?.value ?? 'conversation'),
    onStatus(status: any) { if (!stopped) streamText.value = status; },
    onTransportState(phase: NarsTransportPhase, reason: string | null = null) {
      if (stopped) return;
      streamPhase.value = phase;
      streamReason.value = reason;
      streamLive.value = isTransportLive(phase);
    },
    onEvent(event: any) {
      if (stopped) return;
      activeTurnId.value = connection.value?.activeTurnId ?? null;
      if (isSubscriptionLifecycleEvent(event)) updateHistory(event);
      if (isEventsReadResponse(event)) {
        retainMany(event.events);
        updateHistory(event);
        const state = historyFor(config.view?.value ?? event.view ?? 'conversation');
        state.loading = false;
        onEventsRead?.(event);
        return;
      }
      retain(event);
    },
    onDecodeError(message: any) {
      if (stopped) return;
      retain({ event: 'web_ui_decode_error', message });
    },
  });

  if (config.view) {
    watch(config.view, (view: any) => {
      if (stopped) return;
      const state = historyFor(view);
      state.hasMore = false;
      state.historyTruncated = false;
      state.beforeSequence = null;
      connection.value?.subscribeView(transportViewForProjection(view));
    });
  }

  function loadEarlier(): boolean {
    const view = config.view?.value ?? 'conversation';
    const state = historyFor(view);
    if (stopped || state.loading || !state.hasMore || !connection.value) return false;
    state.loading = true;
    const sent = connection.value.readEventsPage({
      view: transportViewForProjection(view),
      beforeSequence: state.beforeSequence ?? undefined,
      direction: 'backward',
      limit: config.maxReplay,
    });
    if (!sent) state.loading = false;
    return sent;
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    connection.value?.close();
  }

  onBeforeUnmount(stop);
  return {
    connection,
    streamText,
    streamLive,
    streamPhase,
    streamReason,
    activeTurnId,
    history,
    hasEarlierEvents: computed(() => historyFor(config.view?.value ?? 'conversation').hasMore),
    historyTruncated: computed(() => historyFor(config.view?.value ?? 'conversation').historyTruncated),
    loadingEarlier: computed(() => historyFor(config.view?.value ?? 'conversation').loading),
    loadEarlier,
    stop,
  };
}

// Chat renders turn summaries from tool lifecycle evidence while keeping
// operation rows hidden at conversation verbosity. Request the operations
// transport view for that projection so the summary reducer receives the
// evidence it needs; the visible projection remains controlled by verbosity.
function transportViewForProjection(view: string): string {
  return view === 'conversation' ? 'operations' : view;
}

function isEventsReadResponse(event: unknown): event is { event: 'session_events_read'; view?: string; events: unknown[]; event_count?: number; has_more?: boolean; truncated?: boolean; history_truncated?: boolean; first_sequence?: number | null; cursor?: { before_sequence?: number | null } | null } {
  return Boolean(event && typeof event === 'object' && (event as { event?: unknown }).event === 'session_events_read' && Array.isArray((event as { events?: unknown }).events));
}

function isSubscriptionLifecycleEvent(event: unknown): event is { event: 'session_events_subscription_started' | 'session_events_replay_completed'; view?: string; has_more?: boolean; truncated?: boolean; history_truncated?: boolean; first_sequence?: number | null; cursor?: { before_sequence?: number | null } | null } {
  return Boolean(event && typeof event === 'object' && ((event as { event?: unknown }).event === 'session_events_subscription_started' || (event as { event?: unknown }).event === 'session_events_replay_completed'));
}
