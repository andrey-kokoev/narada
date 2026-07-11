import { buildAgentWebUiSubscribeFrame, isAgentWebUiCloudflareProtocolFrame, translateAgentWebUiFrameForCloudflare } from '@narada2/nars-client-projection-contract';
import { applyRuntimeEventToWebUiState, sequenceFromRuntimeMessage } from '../runtime-events.js';
import { reconnectDelayForAttempt } from '../event-stream.js';
import { toSessionProtocolFrame } from './sessionTransport';
import { isNarsTransportClosed, isNarsTransportOpening, transitionNarsTransport, type NarsClientAdapterContext } from './sessionTransportAdapters';

const REMOTE_RECONCILE_OVERLAP_EVENTS = 1000;

function cloudflareWebSocketEndpoint(endpoint: string, browserToken: string | null | undefined): string {
  const url = new URL(endpoint);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = url.pathname.replace(/\/events$/, '/events/websocket');
  url.pathname = path === url.pathname ? `${url.pathname.replace(/\/+$/, '')}/websocket` : path;
  if (browserToken) url.searchParams.set('browser_token', browserToken);
  return url.href;
}

function cloudflareEventItemToRuntimeMessage(item: Record<string, unknown>): unknown {
  const payload = item.payload ?? item;
  const sequence = typeof item.event_sequence === 'number'
    ? item.event_sequence
    : typeof item.sequence === 'number'
      ? item.sequence
      : null;
  if (sequence === null) return payload;
  return { event: 'session_event', payload, cursor: { sequence } };
}

export function startCloudflareSessionTransport(context: NarsClientAdapterContext): void {
  const { options, connection, state, WebSocketCtor, setTimeoutFn } = context;
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const makeSubscribeFrame = (sinceSequence: number | null = state.lastSequence) => buildAgentWebUiSubscribeFrame({
    maxReplay: options.maxReplay,
    includeReplay: true,
    ...(sinceSequence === null ? {} : { sinceSequence }),
  });
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
      const params = (subscribeFrame as { params?: { since_sequence?: number; max_replay?: number } }).params;
      if (params?.since_sequence != null) url.searchParams.set('since_sequence', String(params.since_sequence));
      url.searchParams.set('max_events', String(params?.max_replay ?? options.maxReplay ?? 100));
      const response = await fetchFn(url.href, { method: 'GET', headers: contextHeaders(context) });
      const body = await response.json() as { events?: unknown[]; has_more?: boolean; event_count?: number; cursor?: unknown };
      const messages: unknown[] = [];
      for (const item of body.events ?? []) {
        const message = cloudflareEventItemToRuntimeMessage((item ?? {}) as Record<string, unknown>);
        messages.push(message);
        processRuntimeMessage(message, null, false);
        lastSequence = sequenceFromRuntimeMessage(message) ?? lastSequence;
      }
      hasMore = Boolean(body.has_more);
      options.onEvent?.({
        event: 'session_events_read',
        transport: 'cloudflare-projection-replay',
        method: 'session.events.subscribe',
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
      if (scheduleContinuation && !isNarsTransportClosed(state.lifecycle) && hasMore && !state.remotePageTimer) {
        state.remotePageTimer = setTimeoutFn(() => {
          state.remotePageTimer = null;
          void readRemotePage();
        }, 0);
      }
    }
    return { hasMore, lastSequence };
  };
  const drainRemotePages = async (maxPages = 10, sinceSequence: number | null = null) => {
    let cursor = sinceSequence;
    for (let page = 0; page < maxPages && !isNarsTransportClosed(state.lifecycle); page += 1) {
      const result = await readRemotePage(false, cursor ?? state.lastSequence);
      cursor = result.lastSequence ?? cursor;
      if (!result.hasMore) return;
    }
  };
  const remoteOverlapCursor = (sequence: number | null): number | null => (
    sequence === null ? null : Math.max(0, sequence - REMOTE_RECONCILE_OVERLAP_EVENTS)
  );
  const scheduleRemoteReconcile = () => {
    if (isNarsTransportClosed(state.lifecycle) || state.reconcileTimer) return;
    state.reconcileTimer = setTimeoutFn(async () => {
      state.reconcileTimer = null;
      if (isNarsTransportClosed(state.lifecycle)) return;
      await drainRemotePages(12, remoteOverlapCursor(state.lastSequence));
      scheduleRemoteReconcile();
    }, 5000);
  };
  const scheduleRemoteReconnect = (reason: string) => {
    if (isNarsTransportClosed(state.lifecycle) || state.reconnectTimer) return;
    const staleSocket = state.socket;
    state.socket = null;
    state.socketGeneration += 1;
    try {
      staleSocket?.close?.();
    } catch {
      // The reconnect timer remains the source of truth after a failed close.
    }
    transitionNarsTransport(state.lifecycle, { type: 'reconnect_scheduled', reason });
    const delayMs = reconnectDelayForAttempt(state.lifecycle.attempt);
    options.onStatus?.(`stream reconnecting in ${Math.ceil(delayMs / 1000)}s`);
    options.onEvent?.({ event: 'projection_stream_unavailable', message: reason });
    state.reconnectTimer = setTimeoutFn(() => {
      state.reconnectTimer = null;
      void connectRemoteWebSocket();
    }, delayMs);
  };
  const scheduleRemoteInputCatchUp = () => {
    const sinceBeforeInput = remoteOverlapCursor(state.lastSequence);
    for (const delayMs of [500, 1500, 3500]) {
      setTimeoutFn(() => {
        if (!isNarsTransportClosed(state.lifecycle)) void drainRemotePages(12, sinceBeforeInput);
      }, delayMs);
    }
  };
  const connectRemoteWebSocket = async () => {
    if (isNarsTransportClosed(state.lifecycle) || isNarsTransportOpening(state.lifecycle)) return;
    transitionNarsTransport(state.lifecycle, { type: 'open_requested' });
    try {
      transitionNarsTransport(state.lifecycle, { type: 'replay_started' });
      await drainRemotePages();
      if (isNarsTransportClosed(state.lifecycle)) return;
      const subscribeFrame = makeSubscribeFrame();
      const params = (subscribeFrame as { params?: { since_sequence?: number; max_replay?: number } }).params;
      const url = new URL(cloudflareWebSocketEndpoint(options.endpoint as string, options.browserToken));
      if (params?.since_sequence != null) url.searchParams.set('since_sequence', String(params.since_sequence));
      url.searchParams.set('max_events', String(params?.max_replay ?? options.maxReplay ?? 100));
      const socket = new WebSocketCtor(url.href);
      const socketGeneration = ++state.socketGeneration;
      state.socket = socket;
      const isCurrent = () => state.socket === socket && state.socketGeneration === socketGeneration;
      socket.addEventListener('open', () => {
        if (!isCurrent()) return;
        transitionNarsTransport(state.lifecycle, { type: 'connected' });
        options.onStatus?.('stream connected');
        scheduleRemoteReconcile();
      });
      socket.addEventListener('message', (event) => {
        if (!isCurrent()) return;
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
        if (!isCurrent()) return;
        scheduleRemoteReconnect('remote_websocket_closed');
      });
      socket.addEventListener('error', () => {
        if (isCurrent()) scheduleRemoteReconnect('remote_websocket_error');
      });
    } catch (error) {
      scheduleRemoteReconnect(error instanceof Error ? error.message : String(error));
      return;
    }
  };

  connection.sendFrame = (frame) => {
    const admittedFrame = toSessionProtocolFrame(frame);
    if (!admittedFrame || !isAgentWebUiCloudflareProtocolFrame(admittedFrame)) throw new Error('unsupported_agent_web_ui_protocol_frame');
    const remoteFrame = translateAgentWebUiFrameForCloudflare(admittedFrame);
    if (!remoteFrame || !options.inputEndpoint) return false;
    fetchFn(options.inputEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...contextHeaders(context) },
      body: JSON.stringify({ method: remoteFrame.method, payload: remoteFrame.params ?? {}, request_id: admittedFrame.id }),
    }).then(async (response) => {
      const body = await response.json().catch(() => ({ event: 'projection_input_response', status: response.ok ? 'ok' : 'failed' }));
      options.onEvent?.({ event: 'projection_input_response', status: response.ok ? 'ok' : 'failed', ...body });
      if (response.ok) scheduleRemoteInputCatchUp();
    }).catch((error) => options.onEvent?.({ event: 'projection_input_failed', message: error instanceof Error ? error.message : String(error) }));
    return true;
  };
  options.onStatus?.('opening remote stream');
  void connectRemoteWebSocket();
}

function contextHeaders(context: NarsClientAdapterContext): Record<string, string> {
  return context.options.browserToken ? { 'x-narada-browser-token-fingerprint': context.options.browserToken } : {};
}
