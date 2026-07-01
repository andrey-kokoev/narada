import { buildAgentWebUiSubscribeFrame, isAgentWebUiProtocolFrame } from '@narada2/nars-client-projection-contract';
import { applyRuntimeEventToWebUiState, sequenceFromRuntimeMessage } from './runtime-events.js';
import { appendEvent, setText } from './render.js';

export const buildSubscribeFrame = buildAgentWebUiSubscribeFrame;

export function reconnectDelayForAttempt(attempt, { baseMs = 1000, maxMs = 10000 } = {}) {
  const exponent = Math.max(0, Number(attempt) - 1);
  return Math.min(maxMs, baseMs * (2 ** exponent));
}

function disconnectedDurationText(disconnectedAt, now = Date.now()) {
  if (!disconnectedAt) return '0s';
  return `${Math.max(0, Math.floor((now - disconnectedAt) / 1000))}s`;
}

function setReconnectText(connection, documentRef, delayMs) {
  setText('stream', `reconnecting in ${Math.ceil(delayMs / 1000)}s · disconnected ${disconnectedDurationText(connection.disconnectedAt)}`, documentRef);
}

export function connectEvents(endpointOrConfig, maxReplay, documentRef = document, WebSocketCtor = globalThis.WebSocket, timers = {}) {
  const config = typeof endpointOrConfig === 'object' && endpointOrConfig !== null
    ? endpointOrConfig
    : { eventEndpoint: endpointOrConfig, inputEndpoint: null, cacheEndpoint: null, healthTransport: 'websocket' };
  const endpoint = config.eventEndpoint ?? config.event_endpoint ?? endpointOrConfig;
  const inputEndpoint = config.inputEndpoint ?? config.input_endpoint ?? null;
  const fetchFn = timers.fetch ?? globalThis.fetch;
  if (!endpoint) {
    setText('stream', 'event endpoint not configured', documentRef);
    return null;
  }
  const setTimeoutFn = typeof timers === 'function' ? timers : timers.setTimeout ?? globalThis.setTimeout;
  const clearTimeoutFn = typeof timers === 'function' ? globalThis.clearTimeout : timers.clearTimeout ?? globalThis.clearTimeout;
  const connection = {
    socket: null,
    closed: false,
    lastSequence: null,
    activeTurnId: null,
    reconnectTimer: null,
    reconnectAttempt: 0,
    disconnectedAt: null,
    getSocket() { return this.socket; },
    sendFrame(frame) {
      if (!inputEndpoint || !fetchFn) {
        const openState = this.socket?.constructor?.OPEN ?? globalThis.WebSocket?.OPEN ?? 1;
        if (this.socket?.readyState !== openState) return false;
        this.socket.send(JSON.stringify(frame));
        return true;
      }
      fetchFn(inputEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method: frame.method, payload: frame.params ?? {}, request_id: frame.id }),
      }).then(async (response) => {
        const body = await response.json().catch(() => ({ event: 'projection_input_response', status: response.ok ? 'ok' : 'failed' }));
        appendEvent({ event: 'projection_input_response', status: response.ok ? 'ok' : 'failed', ...body }, documentRef);
      }).catch((error) => appendEvent({ event: 'projection_input_failed', message: error instanceof Error ? error.message : String(error) }, documentRef));
      return true;
    },
    close() {
      this.closed = true;
      if (this.reconnectTimer) clearTimeoutFn?.(this.reconnectTimer);
      this.socket?.close?.();
    },
  };
  if (/^https?:/i.test(String(endpoint))) {
    const readRemote = async () => {
      try {
        const url = new URL(endpoint);
        if (connection.lastSequence !== null) url.searchParams.set('since_sequence', String(connection.lastSequence));
        url.searchParams.set('max_events', String(maxReplay ?? 100));
        const response = await fetchFn(url.href, { method: 'GET' });
        const body = await response.json();
        for (const item of body.events ?? []) {
          const message = item?.payload ?? item;
          const sequence = sequenceFromRuntimeMessage(message) ?? item?.event_sequence ?? item?.sequence ?? null;
          if (sequence !== null) connection.lastSequence = sequence;
          applyRuntimeEventToWebUiState(connection, message);
          appendEvent(message, documentRef);
        }
        setText('stream', response.ok ? 'connected' : `remote projection ${response.status}`, documentRef);
      } catch (error) {
        setText('stream', 'remote projection unavailable', documentRef);
        appendEvent({ event: 'projection_stream_unavailable', message: error instanceof Error ? error.message : String(error) }, documentRef);
      }
    };
    setText('stream', 'loading remote projection', documentRef);
    readRemote();
    connection.reconnectTimer = setTimeoutFn(readRemote, 2000);
    return connection;
  }
  const connect = () => {
    const socket = new WebSocketCtor(endpoint);
    connection.socket = socket;
    socket.addEventListener('open', () => {
      connection.reconnectAttempt = 0;
      connection.disconnectedAt = null;
      setText('stream', 'subscribing', documentRef);
      const frame = buildSubscribeFrame({
        maxReplay,
        ...(connection.lastSequence === null ? {} : { sinceSequence: connection.lastSequence }),
      });
      if (!isAgentWebUiProtocolFrame(frame)) throw new Error('unsupported_agent_web_ui_protocol_frame');
      socket.send(JSON.stringify(frame));
    });
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        const sequence = sequenceFromRuntimeMessage(message);
        if (sequence !== null) connection.lastSequence = sequence;
        applyRuntimeEventToWebUiState(connection, message);
        setText('stream', 'connected', documentRef);
        appendEvent(message, documentRef);
      } catch (error) {
        appendEvent({ event: 'web_ui_decode_error', message: error instanceof Error ? error.message : String(error) }, documentRef);
      }
    });
    socket.addEventListener('close', () => {
      if (connection.closed) {
        setText('stream', 'closed', documentRef);
        return;
      }
      connection.disconnectedAt ??= Date.now();
      connection.reconnectAttempt += 1;
      const delayMs = reconnectDelayForAttempt(connection.reconnectAttempt);
      setReconnectText(connection, documentRef, delayMs);
      connection.reconnectTimer = setTimeoutFn(connect, delayMs);
    });
    socket.addEventListener('error', () => setText('stream', 'error', documentRef));
  };
  connect();
  return connection;
}
