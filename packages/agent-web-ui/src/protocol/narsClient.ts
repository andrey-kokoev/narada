import { buildAgentWebUiEventsReadFrame, buildAgentWebUiSubscribeFrame, isAgentWebUiProtocolFrame } from '@narada2/nars-client-projection-contract';
import { applyRuntimeEventToWebUiState, sequenceFromRuntimeMessage } from '../runtime-events.js';
import { reconnectDelayForAttempt } from '../event-stream.js';

export interface NarsClientOptions {
  endpoint: string | null;
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

const REMOTE_RECONCILE_OVERLAP_EVENTS = 1000;

function cloudflareWebSocketEndpoint(endpoint: string, browserToken: string | null | undefined): string {
  const url = new URL(endpoint);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = url.pathname.replace(/\/events$/, '/events/websocket');
  url.pathname = path === url.pathname ? `${url.pathname.replace(/\/+$/, '')}/websocket` : path;
  if (browserToken) url.searchParams.set('browser_token', browserToken);
  return url.href;
}

function projectionHeaders(browserToken: string | null | undefined): Record<string, string> {
  return browserToken ? { 'x-narada-browser-token-fingerprint': browserToken } : {};
}

function cloudflareEventItemToRuntimeMessage(item: Record<string, unknown>): unknown {
  const payload = item.payload ?? item;
  const sequence = typeof item.event_sequence === 'number'
    ? item.event_sequence
    : typeof item.sequence === 'number'
      ? item.sequence
      : null;
  if (sequence === null) return payload;
  return {
    event: 'session_event',
    payload,
    cursor: { sequence },
  };
}

export interface NarsClientConnection {
  readonly activeTurnId: string | boolean | null;
  readonly lastSequence: number | null;
  getSocket(): WebSocket | null;
  sendFrame(frame: unknown): boolean;
  readEventsPage(options: { beforeSequence?: number; afterSequence?: number; direction?: 'forward' | 'backward'; limit?: number }): boolean;
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
    reconcileTimer: null as ReturnType<typeof setTimeout> | null,
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
    readEventsPage(options) {
      return connection.sendFrame(buildAgentWebUiEventsReadFrame(options));
    },
    close() {
      state.closed = true;
      if (state.reconnectTimer) clearTimeoutFn?.(state.reconnectTimer);
      if (state.reconcileTimer) clearTimeoutFn?.(state.reconcileTimer);
      state.socket?.close?.();
    },
  };

  if (!options.endpoint) {
    options.onStatus?.('event endpoint not configured');
    return connection;
  }

  if (/^https?:/i.test(options.endpoint)) {
    const makeSubscribeFrame = (sinceSequence: number | null = state.lastSequence) => buildAgentWebUiSubscribeFrame({
      maxReplay: options.maxReplay,
      includeReplay: true,
      ...(sinceSequence === null ? {} : { sinceSequence }),
    }) as { method: 'session.events.subscribe'; params?: { max_replay?: number; since_sequence?: number } };
    const fetchFn = options.fetchFn ?? globalThis.fetch;
    const processRuntimeMessage = (message: unknown, fallbackSequence: unknown = null, emit = true) => {
      const sequence = sequenceFromRuntimeMessage(message) ?? (typeof fallbackSequence === 'number' ? fallbackSequence : null);
      if (sequence !== null) state.lastSequence = sequence;
      applyRuntimeEventToWebUiState(state, message);
      if (emit) options.onEvent?.(message);
    };
    const readRemotePage = async (scheduleContinuation = true, sinceSequence: number | null = state.lastSequence) => {
      let hasMore = false;
      let lastSequence: number | null = null;
      try {
        const subscribeFrame = makeSubscribeFrame(sinceSequence);
        const url = new URL(options.endpoint as string);
        if (subscribeFrame.params?.since_sequence != null) url.searchParams.set('since_sequence', String(subscribeFrame.params.since_sequence));
        url.searchParams.set('max_events', String(subscribeFrame.params?.max_replay ?? options.maxReplay ?? 100));
        const response = await fetchFn(url.href, { method: 'GET', headers: projectionHeaders(options.browserToken) });
        const body = await response.json();
        const messages: unknown[] = [];
        for (const item of body.events ?? []) {
          const message = cloudflareEventItemToRuntimeMessage(item ?? {});
          messages.push(message);
          processRuntimeMessage(message, null, false);
          lastSequence = sequenceFromRuntimeMessage(message) ?? lastSequence;
        }
        hasMore = Boolean(body.has_more);
        options.onEvent?.({
          event: 'session_events_read',
          transport: 'cloudflare-projection-replay',
          method: subscribeFrame.method,
          events: messages,
          event_count: body.event_count ?? messages.length,
          has_more: hasMore,
          cursor: body.cursor ?? null,
        });
        options.onStatus?.(response.ok ? 'replay connected' : `remote projection ${response.status}`);
      } catch (error) {
        options.onStatus?.('remote projection unavailable');
        options.onEvent?.({ event: 'projection_stream_unavailable', message: error instanceof Error ? error.message : String(error) });
      } finally {
        if (scheduleContinuation && !state.closed && hasMore) state.reconnectTimer = setTimeoutFn(() => { void readRemotePage(); }, 0);
      }
      return { hasMore, lastSequence };
    };
    const drainRemotePages = async (maxPages = 10, sinceSequence: number | null = null) => {
      let cursor = sinceSequence;
      for (let page = 0; page < maxPages && !state.closed; page += 1) {
        const result = await readRemotePage(false, cursor ?? state.lastSequence);
        cursor = result.lastSequence ?? cursor;
        if (!result.hasMore) return;
      }
    };
    const remoteOverlapCursor = (sequence: number | null): number | null => (
      sequence === null ? null : Math.max(0, sequence - REMOTE_RECONCILE_OVERLAP_EVENTS)
    );
    const scheduleRemoteReconcile = () => {
      if (state.closed || state.reconcileTimer) return;
      state.reconcileTimer = setTimeoutFn(async () => {
        state.reconcileTimer = null;
        if (state.closed) return;
        await drainRemotePages(12, remoteOverlapCursor(state.lastSequence));
        scheduleRemoteReconcile();
      }, 5000);
    };
    const scheduleRemoteReconnect = (reason: string) => {
      if (state.closed) return;
      state.reconnectAttempt += 1;
      const delayMs = reconnectDelayForAttempt(state.reconnectAttempt);
      options.onStatus?.(`stream reconnecting in ${Math.ceil(delayMs / 1000)}s`);
      options.onEvent?.({ event: 'projection_stream_unavailable', message: reason });
      state.reconnectTimer = setTimeoutFn(connectRemoteWebSocket, delayMs);
    };
    const scheduleRemoteInputCatchUp = () => {
      const sinceBeforeInput = remoteOverlapCursor(state.lastSequence);
      for (const delayMs of [500, 1500, 3500]) {
        setTimeoutFn(() => {
          if (!state.closed) void drainRemotePages(12, sinceBeforeInput);
        }, delayMs);
      }
    };
    const connectRemoteWebSocket = async () => {
      try {
        await drainRemotePages();
        const subscribeFrame = makeSubscribeFrame();
        const url = new URL(cloudflareWebSocketEndpoint(options.endpoint as string, options.browserToken));
        if (subscribeFrame.params?.since_sequence != null) url.searchParams.set('since_sequence', String(subscribeFrame.params.since_sequence));
        url.searchParams.set('max_events', String(subscribeFrame.params?.max_replay ?? options.maxReplay ?? 100));
        const socket = new WebSocketCtor(url.href);
        state.socket = socket;
        socket.addEventListener('open', () => {
          state.reconnectAttempt = 0;
          state.disconnectedAt = null;
          options.onStatus?.('stream connected');
          scheduleRemoteReconcile();
        });
        socket.addEventListener('message', (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message?.event === 'websocket_connected') {
              options.onEvent?.(message);
              return;
            }
            processRuntimeMessage(message);
          } catch (error) {
            options.onDecodeError?.(error instanceof Error ? error.message : String(error));
          }
        });
        socket.addEventListener('close', () => {
          scheduleRemoteReconnect('remote_websocket_closed');
        });
        socket.addEventListener('error', () => {
          scheduleRemoteReconnect('remote_websocket_error');
        });
      } catch (error) {
        scheduleRemoteReconnect(error instanceof Error ? error.message : String(error));
      }
    };
    connection.sendFrame = (frame: unknown) => {
      if (!isAgentWebUiProtocolFrame(frame)) throw new Error('unsupported_agent_web_ui_protocol_frame');
      const protocolFrame = frame as { method: string; params?: Record<string, unknown>; id?: string };
      if (!options.inputEndpoint) return false;
      fetchFn(options.inputEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...projectionHeaders(options.browserToken) },
        body: JSON.stringify({ method: protocolFrame.method, payload: protocolFrame.params ?? {}, request_id: protocolFrame.id }),
      }).then(async (response) => {
        const body = await response.json().catch(() => ({ event: 'projection_input_response', status: response.ok ? 'ok' : 'failed' }));
        options.onEvent?.({ event: 'projection_input_response', status: response.ok ? 'ok' : 'failed', ...body });
        if (response.ok) scheduleRemoteInputCatchUp();
      }).catch((error) => options.onEvent?.({ event: 'projection_input_failed', message: error instanceof Error ? error.message : String(error) }));
      return true;
    };
    options.onStatus?.('opening remote stream');
    connectRemoteWebSocket();
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
