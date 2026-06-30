import { onBeforeUnmount, ref, shallowRef } from 'vue';
import { createNarsClient, type NarsClientConnection } from '../../protocol/narsClient';

export interface NarsConnectionConfig {
  eventEndpoint: string | null;
  maxReplay?: number;
}

export function useNarsConnection(
  config: NarsConnectionConfig,
  retain: (event: unknown) => void,
  retainMany: (events: unknown[]) => void = (events) => events.forEach(retain),
  onEventsRead?: (event: { event: 'session_events_read'; events: unknown[]; event_count?: number; has_more?: boolean }) => void,
) {
  const streamText = ref(config.eventEndpoint ? 'starting' : 'event endpoint not configured');
  const activeTurnId = ref<string | boolean | null>(null);
  const connection = shallowRef<NarsClientConnection | null>(null);

  connection.value = createNarsClient({
    endpoint: config.eventEndpoint,
    maxReplay: config.maxReplay,
    onStatus(status) { streamText.value = status; },
    onEvent(event) {
      activeTurnId.value = connection.value?.activeTurnId ?? null;
      if (isEventsReadResponse(event)) {
        retainMany(event.events.map((payload: unknown) => ({ event: 'session_event', payload })));
        onEventsRead?.(event);
        return;
      }
      retain(event);
    },
    onDecodeError(message) {
      retain({ event: 'web_ui_decode_error', message });
    },
  });

  onBeforeUnmount(() => connection.value?.close());
  return { connection, streamText, activeTurnId };
}

function isEventsReadResponse(event: unknown): event is { event: 'session_events_read'; events: unknown[]; event_count?: number; has_more?: boolean } {
  return Boolean(event && typeof event === 'object' && (event as { event?: unknown }).event === 'session_events_read' && Array.isArray((event as { events?: unknown }).events));
}
