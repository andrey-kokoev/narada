import { buildAgentWebUiSubscribeFrame } from '@narada2/nars-client-projection-contract';
import { applyRuntimeEventToWebUiState, sequenceFromRuntimeMessage } from '../runtime-events.js';
import { reconnectDelayForAttempt } from '../event-stream.js';
import { toSessionProtocolFrame } from './sessionTransport';
import { isNarsTransportClosed, isNarsTransportOpening, transitionNarsTransport, type NarsClientAdapterContext } from './sessionTransportAdapters';

export function startLocalSessionTransport(context: NarsClientAdapterContext): void {
  const { options, connection, state, WebSocketCtor, setTimeoutFn } = context;

  const connect = () => {
    if (isNarsTransportClosed(state.lifecycle) || isNarsTransportOpening(state.lifecycle) || !options.endpoint) return;
    transitionNarsTransport(state.lifecycle, { type: 'open_requested' });
    const socketGeneration = ++state.socketGeneration;
    const socket = new WebSocketCtor(options.endpoint);
    state.socket = socket;
    const isCurrent = () => state.socket === socket && state.socketGeneration === socketGeneration;

    socket.addEventListener('open', () => {
      if (!isCurrent()) return;
      transitionNarsTransport(state.lifecycle, { type: 'connected' });
      options.onStatus?.('subscribing');
      const frame = toSessionProtocolFrame(buildAgentWebUiSubscribeFrame({
        maxReplay: options.maxReplay,
        ...(state.lastSequence === null ? {} : { sinceSequence: state.lastSequence }),
      }));
      if (!frame) {
        options.onStatus?.('not open');
        return;
      }
      if (!connection.sendFrame(frame)) options.onStatus?.('not open');
    });
    socket.addEventListener('message', (event) => {
      if (!isCurrent()) return;
      try {
        const message = JSON.parse(event.data);
        const sequence = sequenceFromRuntimeMessage(message);
        if (sequence !== null) state.lastSequence = sequence;
        applyRuntimeEventToWebUiState(state, message);
        options.onStatus?.('connected');
        options.onEvent?.(message);
      } catch (error) {
        options.onDecodeError?.(error instanceof Error ? error.message : String(error));
      }
    });
    socket.addEventListener('close', () => {
      if (!isCurrent()) return;
      if (isNarsTransportClosed(state.lifecycle)) {
        options.onStatus?.('closed');
        return;
      }
      if (state.reconnectTimer) return;
      transitionNarsTransport(state.lifecycle, { type: 'reconnect_scheduled', reason: 'local_websocket_closed' });
      const delayMs = reconnectDelayForAttempt(state.lifecycle.attempt);
      const disconnectedSeconds = Math.max(0, Math.floor((Date.now() - (state.lifecycle.disconnectedAt ?? Date.now())) / 1000));
      options.onStatus?.(`reconnecting in ${Math.ceil(delayMs / 1000)}s · disconnected ${disconnectedSeconds}s`);
      state.reconnectTimer = setTimeoutFn(() => {
        state.reconnectTimer = null;
        connect();
      }, delayMs);
    });
    socket.addEventListener('error', () => {
      if (isCurrent()) options.onStatus?.('error');
    });
  };

  connect();
}
