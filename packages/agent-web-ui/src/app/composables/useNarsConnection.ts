import { onBeforeUnmount, ref, shallowRef } from 'vue';
import { createNarsClient, type NarsClientConnection } from '../../protocol/narsClient';

export interface NarsConnectionConfig {
  eventEndpoint: string | null;
  maxReplay?: number;
}

export function useNarsConnection(config: NarsConnectionConfig, retain: (event: unknown) => void) {
  const streamText = ref(config.eventEndpoint ? 'starting' : 'event endpoint not configured');
  const activeTurnId = ref<string | boolean | null>(null);
  const connection = shallowRef<NarsClientConnection | null>(null);

  connection.value = createNarsClient({
    endpoint: config.eventEndpoint,
    maxReplay: config.maxReplay,
    onStatus(status) { streamText.value = status; },
    onEvent(event) {
      activeTurnId.value = connection.value?.activeTurnId ?? null;
      retain(event);
    },
    onDecodeError(message) {
      retain({ event: 'web_ui_decode_error', message });
    },
  });

  onBeforeUnmount(() => connection.value?.close());
  return { connection, streamText, activeTurnId };
}
