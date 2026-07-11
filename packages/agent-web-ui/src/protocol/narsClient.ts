import { buildAgentWebUiEventsReadFrame, isAgentWebUiCloudflareProtocolFrame } from '@narada2/nars-client-projection-contract';
import { toSessionProtocolFrame, type SessionProtocolFrame, type SessionTransport } from './sessionTransport';
import { startCloudflareSessionTransport } from './cloudflareSessionTransport';
import { startLocalSessionTransport } from './localSessionTransport';
import { createNarsTransportLifecycle, isNarsTransportClosed, projectionHeaders, transitionNarsTransport, type NarsClientState } from './sessionTransportAdapters';

export interface NarsClientOptions {
  endpoint: string | null;
  healthEndpoint?: string | null;
  inputEndpoint?: string | null;
  browserToken?: string | null;
  maxReplay?: number;
  WebSocketCtor?: typeof WebSocket;
  fetchFn?: typeof fetch;
  timers?: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;
  onStatus?: (status: string) => void;
  onEvent?: (event: unknown) => void;
  onDecodeError?: (message: string) => void;
}

export interface NarsClientConnection extends SessionTransport {}

export function createNarsClient(options: NarsClientOptions): NarsClientConnection {
  const WebSocketCtor = options.WebSocketCtor ?? globalThis.WebSocket;
  const setTimeoutFn = options.timers?.setTimeout ?? globalThis.setTimeout;
  const clearTimeoutFn = options.timers?.clearTimeout ?? globalThis.clearTimeout;
  const state = {
    socket: null as WebSocket | null,
    lifecycle: createNarsTransportLifecycle(Boolean(options.endpoint)),
    lastSequence: null as number | null,
    activeTurnId: null as string | boolean | null,
    reconnectTimer: null as ReturnType<typeof setTimeout> | null,
    remotePageTimer: null as ReturnType<typeof setTimeout> | null,
    reconcileTimer: null as ReturnType<typeof setTimeout> | null,
    socketGeneration: 0,
  };
  const connection: NarsClientConnection = {
    kind: /^https?:/i.test(options.endpoint ?? '') ? 'cloudflare-projection' : 'local-websocket',
    healthEndpoint: options.healthEndpoint ?? null,
    get lifecycle() { return state.lifecycle; },
    get activeTurnId() { return state.activeTurnId; },
    get lastSequence() { return state.lastSequence; },
    getSocket() { return state.socket; },
    requestHealth(fetchFn = globalThis.fetch) {
      if (!options.healthEndpoint) return null;
      return fetchFn(options.healthEndpoint, {
        method: 'GET',
        cache: 'no-store',
        headers: projectionHeaders(options.browserToken),
      });
    },
    sendFrame(frame: SessionProtocolFrame) {
      const admittedFrame = toSessionProtocolFrame(frame);
      if (!admittedFrame || !isAgentWebUiCloudflareProtocolFrame(admittedFrame)) throw new Error('unsupported_agent_web_ui_protocol_frame');
      const socket = state.socket;
      const openState = WebSocketCtor.OPEN ?? 1;
      if (!socket || socket.readyState !== openState) return false;
      socket.send(JSON.stringify(admittedFrame));
      return true;
    },
    readEventsPage(options) {
      return connection.sendFrame(buildAgentWebUiEventsReadFrame(options));
    },
    close() {
      if (isNarsTransportClosed(state.lifecycle)) return;
      transitionNarsTransport(state.lifecycle, { type: 'close_requested' });
      state.socketGeneration += 1;
      if (state.reconnectTimer) {
        clearTimeoutFn?.(state.reconnectTimer);
        state.reconnectTimer = null;
      }
      if (state.remotePageTimer) {
        clearTimeoutFn?.(state.remotePageTimer);
        state.remotePageTimer = null;
      }
      if (state.reconcileTimer) {
        clearTimeoutFn?.(state.reconcileTimer);
        state.reconcileTimer = null;
      }
      const socket = state.socket;
      state.socket = null;
      socket?.close?.();
      transitionNarsTransport(state.lifecycle, { type: 'closed' });
    },
  };

  if (!options.endpoint) {
    options.onStatus?.('event endpoint not configured');
    return connection;
  }

  const adapterContext = {
    options,
    connection,
    state: state as NarsClientState,
    WebSocketCtor,
    setTimeoutFn,
    clearTimeoutFn,
  };
  if (/^https?:/i.test(options.endpoint)) {
    startCloudflareSessionTransport(adapterContext);
    return connection;
  }
  startLocalSessionTransport(adapterContext);
  return connection;
}
