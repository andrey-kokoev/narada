import { buildAgentWebUiSubscribeFrame, isAgentWebUiCloudflareProtocolFrame, translateAgentWebUiFrameForCloudflare } from '@narada2/nars-client-projection-contract';
import { applyRuntimeEventToWebUiState, sequenceFromRuntimeMessage } from './runtime-events.js';
import { appendEvent, setText } from './render.js';
import { applyCloudflareEventQuery, cloudflareEventItemToRuntimeMessage, cloudflareEventsRead, cloudflareReplayCompleted, cloudflareSubscriptionStarted, cloudflareWebSocketEndpoint } from './protocol/cloudflare-session-contract.js';

export const buildSubscribeFrame = buildAgentWebUiSubscribeFrame;

export function reconnectDelayForAttempt(attempt, { baseMs = 1000, maxMs = 10000 } = {}) {
  const exponent = Math.max(0, Number(attempt) - 1);
  return Math.min(maxMs, baseMs * (2 ** exponent));
}

function projectionHeaders(browserToken) {
  return browserToken ? { 'x-narada-browser-token-fingerprint': browserToken } : {};
}

function projectionInputResponse(body, response, requestId, transportMethod, remoteMethod) {
  const bodyRecord = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const authorityMethod = typeof bodyRecord.method === 'string' && bodyRecord.method.trim()
    ? bodyRecord.method
    : remoteMethod;
  return {
    ...bodyRecord,
    event: 'projection_input_response',
    request_id: requestId,
    authority_request_id: typeof bodyRecord.request_id === 'string' ? bodyRecord.request_id : null,
    method: authorityMethod,
    transport_method: transportMethod,
    remote_method: authorityMethod,
    http_status: response.status,
    http_ok: response.ok,
    status: typeof bodyRecord.status === 'string' && bodyRecord.status.trim()
      ? bodyRecord.status
      : response.ok ? 'ok' : 'failed',
  };
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
  const browserToken = config.browserToken ?? config.browser_token_fingerprint ?? null;
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
      const remoteFrame = translateAgentWebUiFrameForCloudflare(frame);
      if (!remoteFrame) return false;
      fetchFn(inputEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...projectionHeaders(browserToken) },
        body: JSON.stringify({ method: remoteFrame.method, payload: remoteFrame.params ?? {}, request_id: frame.id }),
      }).then(async (response) => {
        const body = await response.json().catch(() => ({ event: 'projection_input_response', status: response.ok ? 'ok' : 'failed' }));
        appendEvent(projectionInputResponse(body, response, frame.id, frame.method, remoteFrame.method), documentRef);
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
    const remoteWebSocketEnabled = (config.mode === 'cloudflare_authority' || config.mode === 'cloudflare_projection') && typeof WebSocketCtor === 'function';
    const processRemoteMessage = (message) => {
      const sequence = sequenceFromRuntimeMessage(message);
      if (sequence !== null) connection.lastSequence = sequence;
      applyRuntimeEventToWebUiState(connection, message);
      appendEvent(message, documentRef);
    };
    const readRemote = async () => {
      const replayRequestId = `cloudflare_replay_${Date.now()}`;
      const subscriptionId = `sub_${replayRequestId}`;
      appendEvent({
        ...cloudflareSubscriptionStarted({
          requestId: replayRequestId,
          subscriptionId,
          view: 'conversation',
          pageSize: maxReplay ?? 100,
        }),
      }, documentRef);
      try {
        const subscribeFrame = buildSubscribeFrame({
          maxReplay,
          includeReplay: true,
          ...(connection.lastSequence === null ? {} : { sinceSequence: connection.lastSequence }),
        });
        const url = applyCloudflareEventQuery(new URL(endpoint), subscribeFrame, maxReplay ?? 100);
        const response = await fetchFn(url.href, { method: 'GET', headers: projectionHeaders(browserToken) });
        const body = await response.json();
        const messages = [];
        for (const item of body.events ?? []) {
          const message = cloudflareEventItemToRuntimeMessage(item);
          messages.push(message);
          processRemoteMessage(message);
        }
        appendEvent(cloudflareEventsRead({
          messages,
          eventCount: body.event_count ?? messages.length,
          hasMore: body.has_more,
          historyTruncated: body.truncated,
          view: body.view ?? 'conversation',
          cursor: body.cursor ?? null,
        }), documentRef);
        appendEvent(cloudflareReplayCompleted({
          requestId: replayRequestId,
          subscriptionId,
          view: body.view ?? 'conversation',
          replayCount: body.event_count ?? messages.length,
          hasMore: body.has_more,
          historyTruncated: body.truncated,
          cursor: body.cursor ?? null,
        }), documentRef);
        setText('stream', response.ok ? 'long-poll connected' : `remote projection ${response.status}`, documentRef);
      } catch (error) {
        setText('stream', 'remote projection unavailable', documentRef);
        appendEvent({ event: 'projection_stream_unavailable', message: error instanceof Error ? error.message : String(error) }, documentRef);
      } finally {
        if (!connection.closed && !remoteWebSocketEnabled) connection.reconnectTimer = setTimeoutFn(readRemote, 2000);
      }
    };
    const connectRemoteWebSocket = () => {
      const subscribeFrame = buildSubscribeFrame({
        maxReplay,
        includeReplay: true,
        ...(connection.lastSequence === null ? {} : { sinceSequence: connection.lastSequence }),
      });
      const url = new URL(cloudflareWebSocketEndpoint(endpoint, browserToken));
      if (subscribeFrame.params?.since_sequence != null) url.searchParams.set('since_sequence', String(subscribeFrame.params.since_sequence));
      url.searchParams.set('max_events', String(subscribeFrame.params?.max_replay ?? maxReplay ?? 100));
      const socket = new WebSocketCtor(url.href);
      connection.socket = socket;
      socket.addEventListener('open', () => {
        connection.reconnectAttempt = 0;
        connection.disconnectedAt = null;
        setText('stream', 'stream connected', documentRef);
      });
      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message?.event === 'websocket_connected') return;
          processRemoteMessage(message);
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
        setTimeoutFn(connectRemoteWebSocket, delayMs);
      });
      socket.addEventListener('error', () => appendEvent({ event: 'websocket_error', message: 'remote websocket error' }, documentRef));
    };
    setText('stream', 'loading remote projection', documentRef);
    void readRemote().then(() => {
      if (remoteWebSocketEnabled && !connection.closed && !connection.socket) connectRemoteWebSocket();
    });
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
      if (!isAgentWebUiCloudflareProtocolFrame(frame)) throw new Error('unsupported_agent_web_ui_protocol_frame');
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
