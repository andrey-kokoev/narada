import { buildAgentWebUiSubscribeFrame, isAgentWebUiProtocolFrame } from '@narada2/nars-client-projection-contract';
import { applyRuntimeEventToWebUiState, sequenceFromRuntimeMessage } from '../runtime-events.js';
import { reconnectDelayForAttempt } from '../event-stream.js';

export interface NarsClientOptions {
  endpoint: string | null;
  maxReplay?: number;
  WebSocketCtor?: typeof WebSocket;
  timers?: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;
  onStatus?: (status: string) => void;
  onEvent?: (event: unknown) => void;
  onDecodeError?: (message: string) => void;
}

export interface NarsClientConnection {
  readonly activeTurnId: string | boolean | null;
  readonly lastSequence: number | null;
  getSocket(): WebSocket | null;
  sendFrame(frame: unknown): boolean;
  close(): void;
}

export function createNarsClient(options: NarsClientOptions): NarsClientConnection {
  const WebSocketCtor = options.WebSocketCtor ?? globalThis.WebSocket;
  const setTimeoutFn = options.timers?.setTimeout ?? globalThis.setTimeout;
  const clearTimeoutFn = options.timers?.clearTimeout ?? globalThis.clearTimeout;
  const state = {
    socket: null as WebSocket | null,
    closed: false,
    lastSequence: null as number | null,
    activeTurnId: null as string | boolean | null,
    reconnectTimer: null as ReturnType<typeof setTimeout> | null,
    reconnectAttempt: 0,
    disconnectedAt: null as number | null,
  };
  const connection: NarsClientConnection = {
    get activeTurnId() { return state.activeTurnId; },
    get lastSequence() { return state.lastSequence; },
    getSocket() { return state.socket; },
    sendFrame(frame: unknown) {
      if (!isAgentWebUiProtocolFrame(frame)) throw new Error('unsupported_agent_web_ui_protocol_frame');
      const socket = state.socket;
      const openState = WebSocketCtor.OPEN ?? 1;
      if (!socket || socket.readyState !== openState) return false;
      socket.send(JSON.stringify(frame));
      return true;
    },
    close() {
      state.closed = true;
      if (state.reconnectTimer) clearTimeoutFn?.(state.reconnectTimer);
      state.socket?.close?.();
    },
  };

  if (!options.endpoint) {
    options.onStatus?.('event endpoint not configured');
    return connection;
  }

  const connect = () => {
    const socket = new WebSocketCtor(options.endpoint as string);
    state.socket = socket;
    socket.addEventListener('open', () => {
      state.reconnectAttempt = 0;
      state.disconnectedAt = null;
      options.onStatus?.('subscribing');
      const frame = buildAgentWebUiSubscribeFrame({
        maxReplay: options.maxReplay,
        ...(state.lastSequence === null ? {} : { sinceSequence: state.lastSequence }),
      });
      if (!connection.sendFrame(frame)) options.onStatus?.('not open');
    });
    socket.addEventListener('message', (event) => {
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
      if (state.closed) {
        options.onStatus?.('closed');
        return;
      }
      state.disconnectedAt ??= Date.now();
      state.reconnectAttempt += 1;
      const delayMs = reconnectDelayForAttempt(state.reconnectAttempt);
      const disconnectedSeconds = Math.max(0, Math.floor((Date.now() - state.disconnectedAt) / 1000));
      options.onStatus?.(`reconnecting in ${Math.ceil(delayMs / 1000)}s · disconnected ${disconnectedSeconds}s`);
      state.reconnectTimer = setTimeoutFn(connect, delayMs);
    });
    socket.addEventListener('error', () => options.onStatus?.('error'));
  };
  connect();
  return connection;
}
