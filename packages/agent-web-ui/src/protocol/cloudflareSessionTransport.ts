import { buildAgentWebUiSubscribeFrame, isAgentWebUiCloudflareProtocolFrame, translateAgentWebUiFrameForCloudflare } from '@narada2/nars-client-projection-contract';
import { applyRuntimeEventToWebUiState, isTerminalRuntimeEvent, sequenceFromRuntimeMessage } from '../runtime-events.ts';
import { reconnectDelayForAttempt } from '../event-stream.ts';
import { applyCloudflareEventQuery, cloudflareEventItemToRuntimeMessage, cloudflareEventsRead, cloudflareReplayCompleted, cloudflareSubscriptionStarted, cloudflareWebSocketEndpoint } from './cloudflare-session-contract.ts';
import { isProjectionInputAdmissionAccepted, toSessionProtocolFrame } from './sessionTransport';
import { isNarsTransportClosed, isNarsTransportOpening, transitionNarsTransport, type NarsClientAdapterContext } from './sessionTransportAdapters';

const REMOTE_RECONCILE_OVERLAP_EVENTS = 1000;

export function startCloudflareSessionTransport(context: NarsClientAdapterContext): void {
  const { options, connection, state, WebSocketCtor, setTimeoutFn } = context;
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  let replaySerial = 0;
  const makeSubscribeFrame = (sinceSequence: number | null = state.lastSequence) => buildAgentWebUiSubscribeFrame({
    maxReplay: options.maxReplay,
    view: state.view,
    includeReplay: true,
    ...(sinceSequence === null ? {} : { sinceSequence }),
  });
  const processRuntimeMessage = (message: unknown, fallbackSequence: unknown = null, emit = true, updateCursor = true) => {
    const sequence = sequenceFromRuntimeMessage(message) ?? (typeof fallbackSequence === 'number' ? fallbackSequence : null);
    if (updateCursor && sequence !== null) state.lastSequence = sequence;
    applyRuntimeEventToWebUiState(state, message);
    if (emit) options.onEvent?.(message);
  };
  const readRemotePage = async (scheduleContinuation = true, sinceSequence: number | null = state.lastSequence) => {
    let hasMore = false;
    let lastSequence: number | null = null;
    let eventCount = 0;
    let historyTruncated = false;
    let cursor: unknown = null;
    try {
      const subscribeFrame = makeSubscribeFrame(sinceSequence);
      const params = (subscribeFrame as { params?: { since_sequence?: number; page_size?: number; view?: string } }).params;
      const url = applyCloudflareEventQuery(new URL(options.endpoint as string), subscribeFrame, options.maxReplay ?? 100);
      const response = await fetchFn(url.href, { method: 'GET', headers: contextHeaders(context) });
      const body = await response.json() as { events?: unknown[]; has_more?: boolean; truncated?: boolean; event_count?: number; view?: string; cursor?: unknown };
      const messages: unknown[] = [];
      for (const item of body.events ?? []) {
        const message = cloudflareEventItemToRuntimeMessage((item ?? {}) as Record<string, unknown>);
        messages.push(message);
        processRuntimeMessage(message, null, false);
        lastSequence = sequenceFromRuntimeMessage(message) ?? lastSequence;
      }
      hasMore = Boolean(body.has_more);
      eventCount = body.event_count ?? messages.length;
      historyTruncated = Boolean(body.truncated);
      cursor = body.cursor ?? null;
      options.onEvent?.(cloudflareEventsRead({
        messages,
        eventCount,
        hasMore,
        historyTruncated,
        view: body.view ?? params?.view ?? state.view,
        cursor,
      }));
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
    return { hasMore, lastSequence, eventCount, historyTruncated, cursor };
  };
  const drainRemotePages = async (maxPages = 10, sinceSequence: number | null = null) => {
    let cursor = sinceSequence;
    let eventCount = 0;
    let historyTruncated = false;
    let lastCursor: unknown = null;
    for (let page = 0; page < maxPages && !isNarsTransportClosed(state.lifecycle); page += 1) {
      const result = await readRemotePage(false, cursor ?? state.lastSequence);
      cursor = result.lastSequence ?? cursor;
      eventCount += result.eventCount;
      historyTruncated ||= result.historyTruncated;
      lastCursor = result.cursor ?? lastCursor;
      if (!result.hasMore) return { hasMore: false, eventCount, historyTruncated, cursor: lastCursor };
    }
    return { hasMore: true, eventCount, historyTruncated, cursor: lastCursor };
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
    options.onTransportState?.(state.lifecycle.phase);
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
    options.onTransportState?.(state.lifecycle.phase);
    try {
      transitionNarsTransport(state.lifecycle, { type: 'replay_started' });
      options.onTransportState?.(state.lifecycle.phase);
      const replayRequestId = `cloudflare_replay_${Date.now()}_${++replaySerial}`;
      const subscriptionId = `sub_${replayRequestId}`;
      options.onEvent?.(cloudflareSubscriptionStarted({
        requestId: replayRequestId,
        subscriptionId,
        view: state.view,
        pageSize: options.maxReplay ?? 100,
      }));
      const replay = await drainRemotePages();
      options.onEvent?.(cloudflareReplayCompleted({
        requestId: replayRequestId,
        subscriptionId,
        view: state.view,
        replayCount: replay.eventCount,
        hasMore: replay.hasMore,
        historyTruncated: replay.historyTruncated,
        cursor: replay.cursor,
      }));
      if (isNarsTransportClosed(state.lifecycle)) return;
      const subscribeFrame = makeSubscribeFrame();
      const url = applyCloudflareEventQuery(
        new URL(cloudflareWebSocketEndpoint(options.endpoint as string, options.browserToken)),
        subscribeFrame,
        options.maxReplay ?? 100,
      );
      const socket = new WebSocketCtor(url.href);
      const socketGeneration = ++state.socketGeneration;
      state.socket = socket;
      const isCurrent = () => state.socket === socket && state.socketGeneration === socketGeneration;
      socket.addEventListener('open', () => {
        if (!isCurrent()) return;
        transitionNarsTransport(state.lifecycle, { type: 'connected' });
        options.onTransportState?.(state.lifecycle.phase);
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
          if (isTerminalRuntimeEvent(message)) {
            connection.close();
            options.onStatus?.('closed');
          }
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

  state.sendFrameImpl = (frame) => {
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
      const bodyRecord = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
      const narsAdmission = recordFrom(bodyRecord.nars_admission);
      const admissionEvidence = recordFrom(narsAdmission.evidence);
      const authorityStatus = firstString(narsAdmission.status, bodyRecord.status)
        ?? (response.ok ? 'ok' : 'failed');
      const authorityMethod = typeof bodyRecord.method === 'string' && bodyRecord.method.trim()
        ? bodyRecord.method
        : remoteFrame.method;
      const authorityRequestId = firstString(
        bodyRecord.authority_request_id,
        bodyRecord.request_id,
        narsAdmission.request_id,
        admissionEvidence.request_id,
      );
      const inputEventId = firstString(
        bodyRecord.input_event_id,
        bodyRecord.inputEventId,
        narsAdmission.input_event_id,
        narsAdmission.inputEventId,
        admissionEvidence.input_event_id,
        admissionEvidence.inputEventId,
      );
      const inputId = firstString(
        bodyRecord.input_id,
        bodyRecord.inputId,
        narsAdmission.input_id,
        narsAdmission.inputId,
        admissionEvidence.input_id,
        admissionEvidence.inputId,
      );
      options.onEvent?.({
        ...bodyRecord,
        event: 'projection_input_response',
        request_id: admittedFrame.id,
        authority_request_id: authorityRequestId,
        input_event_id: inputEventId,
        input_id: inputId,
        method: authorityMethod,
        transport_method: admittedFrame.method,
        remote_method: authorityMethod,
        http_status: response.status,
        http_ok: response.ok,
        status: authorityStatus,
      });
      if (isProjectionInputAdmissionAccepted({ ...bodyRecord, status: authorityStatus, http_ok: response.ok })) scheduleRemoteInputCatchUp();
    }).catch((error) => options.onEvent?.({
      event: 'projection_input_failed',
      request_id: admittedFrame.id,
      method: admittedFrame.method,
      message: error instanceof Error ? error.message : String(error),
    }));
    return true;
  };
  connection.readEventsPage = (page) => {
    if (!options.endpoint || isNarsTransportClosed(state.lifecycle)) return false;
    const url = new URL(options.endpoint);
    if (page.afterSequence != null) url.searchParams.set('since_sequence', String(page.afterSequence));
    if (page.beforeSequence != null) url.searchParams.set('before_sequence', String(page.beforeSequence));
    if (page.direction) url.searchParams.set('direction', page.direction);
    url.searchParams.set('max_events', String(page.limit ?? options.maxReplay ?? 100));
    if (page.view) url.searchParams.set('view', page.view);
    fetchFn(url.href, { method: 'GET', headers: contextHeaders(context) }).then(async (response) => {
      const body = await response.json() as { events?: unknown[]; event_count?: number; has_more?: boolean; truncated?: boolean; view?: string; cursor?: unknown };
      const messages: unknown[] = [];
      for (const item of body.events ?? []) {
        const message = cloudflareEventItemToRuntimeMessage((item ?? {}) as Record<string, unknown>);
        messages.push(message);
        processRuntimeMessage(message, null, false, page.direction !== 'backward');
      }
      options.onEvent?.({
        event: 'session_events_read',
        transport: 'cloudflare-projection-page',
        method: 'session.events.read',
        events: messages,
        event_count: body.event_count ?? messages.length,
        has_more: Boolean(body.has_more),
        truncated: Boolean(body.truncated),
        history_truncated: Boolean(body.truncated),
        view: body.view ?? page.view ?? state.view,
        cursor: body.cursor ?? null,
      });
    }).catch((error) => options.onEvent?.({ event: 'projection_page_failed', message: error instanceof Error ? error.message : String(error) }));
    return true;
  };
  state.subscribeView = (view) => {
    state.view = view;
    state.lastSequence = null;
    scheduleRemoteReconnect('event_view_changed');
    return true;
  };
  options.onStatus?.('opening remote stream');
  void connectRemoteWebSocket();
}

function contextHeaders(context: NarsClientAdapterContext): Record<string, string> {
  return context.options.browserToken ? { 'x-narada-browser-token-fingerprint': context.options.browserToken } : {};
}

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
