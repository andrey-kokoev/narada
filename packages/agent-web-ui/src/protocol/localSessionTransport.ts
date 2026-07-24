import { buildAgentWebUiEventsReadFrame, buildAgentWebUiSubscribeFrame } from '@narada2/nars-client-projection-contract';
import { applyRuntimeEventToWebUiState, isTerminalRuntimeEvent, sequenceFromRuntimeMessage, unwrapRuntimeEvent } from '../runtime-events.ts';
import { reconnectDelayForAttempt } from '../event-stream.ts';
import { sessionIdFromTransportMessage, toSessionProtocolFrame } from './sessionTransport';
import { isNarsTransportClosed, isNarsTransportOpening, transitionNarsTransport, type NarsClientAdapterContext } from './sessionTransportAdapters';

const LOCAL_RECONCILE_INTERVAL_MS = 5_000;
const LOCAL_ACTIVE_RECONCILE_INTERVAL_MS = 1_000;
const LOCAL_ACTIVE_RECONCILE_DELAY_MS = 500;

export function startLocalSessionTransport(context: NarsClientAdapterContext): void {
  const { options, connection, state, WebSocketCtor, setTimeoutFn, clearTimeoutFn } = context;

  const scheduleLocalReconcile = (delayMs = LOCAL_RECONCILE_INTERVAL_MS) => {
    if (isNarsTransportClosed(state.lifecycle) || isNarsTransportOpening(state.lifecycle) || state.reconcileTimer) return;
    state.reconcileTimer = setTimeoutFn(() => {
      state.reconcileTimer = null;
      if (isNarsTransportClosed(state.lifecycle) || isNarsTransportOpening(state.lifecycle) || state.lifecycle.phase !== 'live') return;
      try {
        connection.sendFrame(toSessionProtocolFrame(buildAgentWebUiEventsReadFrame({
          view: state.view,
          afterSequence: state.lastSequence ?? undefined,
          direction: 'forward',
          limit: options.maxReplay,
        }))!);
      } catch (error) {
        options.onDecodeError?.(error instanceof Error ? error.message : String(error));
      }
      scheduleLocalReconcile(state.activeTurnId === null ? LOCAL_RECONCILE_INTERVAL_MS : LOCAL_ACTIVE_RECONCILE_INTERVAL_MS);
    }, delayMs);
  };

  const rescheduleLocalReconcile = (delayMs = LOCAL_RECONCILE_INTERVAL_MS) => {
    if (state.reconcileTimer) {
      clearTimeoutFn(state.reconcileTimer);
      state.reconcileTimer = null;
    }
    scheduleLocalReconcile(delayMs);
  };

  const connect = () => {
    if (isNarsTransportClosed(state.lifecycle) || isNarsTransportOpening(state.lifecycle) || !options.endpoint) return;
    transitionNarsTransport(state.lifecycle, { type: 'open_requested' });
    options.onTransportState?.(state.lifecycle.phase);
    const socketGeneration = ++state.socketGeneration;
    const socket = new WebSocketCtor(options.endpoint);
    state.socket = socket;
    const isCurrent = () => state.socket === socket && state.socketGeneration === socketGeneration;

    socket.addEventListener('open', () => {
      if (!isCurrent()) return;
      transitionNarsTransport(state.lifecycle, { type: 'connected' });
      options.onTransportState?.(state.lifecycle.phase);
      options.onStatus?.('subscribing');
      const frame = toSessionProtocolFrame(buildAgentWebUiSubscribeFrame({
        maxReplay: options.maxReplay,
        view: state.view,
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
        const expectedSessionId = typeof options.sessionId === 'string' && options.sessionId.trim() ? options.sessionId.trim() : null;
        const observedSessionId = sessionIdFromTransportMessage(message);
        if (expectedSessionId && observedSessionId && expectedSessionId !== observedSessionId) {
          options.onEvent?.({
            event: 'web_ui_session_correlation_mismatch',
            expected_session_id: expectedSessionId,
            observed_session_id: observedSessionId,
            transport: 'local-websocket',
            endpoint: options.endpoint,
            socket_generation: socketGeneration,
            message: 'The WebSocket reported a different NARS session; the socket will be re-established.',
          });
          options.onStatus?.('session mismatch');
          socket.close();
          return;
        }
        const sequence = sequenceFromRuntimeMessage(message) ?? sequenceFromEventsReadMessage(message);
        if (sequence !== null) state.lastSequence = Math.max(state.lastSequence ?? sequence, sequence);
        const events = eventsFromReadMessage(message);
        if (events) {
          for (const event of events) applyRuntimeEventToWebUiState(state, event);
        } else {
          applyRuntimeEventToWebUiState(state, message);
        }
        const runtimeEvent = unwrapRuntimeEvent(message);
        if (runtimeEvent?.event === 'session_events_replay_completed') {
          scheduleLocalReconcile();
        }
        if (runtimeEvent?.event === 'turn_started' || runtimeEvent?.event === 'carrier_turn_started') {
          rescheduleLocalReconcile(LOCAL_ACTIVE_RECONCILE_DELAY_MS);
        }
        options.onStatus?.('connected');
        options.onEvent?.(message);
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
      if (isNarsTransportClosed(state.lifecycle)) {
        options.onStatus?.('closed');
        return;
      }
      if (state.reconnectTimer) return;
      transitionNarsTransport(state.lifecycle, { type: 'reconnect_scheduled', reason: 'local_websocket_closed' });
      options.onTransportState?.(state.lifecycle.phase);
      const delayMs = reconnectDelayForAttempt(state.lifecycle.attempt);
      const disconnectedSeconds = Math.max(0, Math.floor((Date.now() - (state.lifecycle.disconnectedAt ?? Date.now())) / 1000));
      options.onStatus?.(`reconnecting in ${Math.ceil(delayMs / 1000)}s · disconnected ${disconnectedSeconds}s`);
      state.reconnectTimer = setTimeoutFn(() => {
        state.reconnectTimer = null;
        connect();
      }, delayMs);
    });
    socket.addEventListener('error', () => {
      if (!isCurrent()) return;
      options.onStatus?.('error');
      options.onEvent?.({
        schema: 'narada.nars.websocket.error.v1',
        event: 'websocket_error',
        code: 'local_websocket_error',
        message: 'The local NARS WebSocket reported a transport error; no input acknowledgment was inferred from the socket write.',
        transport: 'local-websocket',
        endpoint: options.endpoint,
        session_id: options.sessionId ?? null,
        socket_generation: socketGeneration,
      });
    });
  };

  state.subscribeView = (view) => {
    state.lastSequence = null;
    const frame = toSessionProtocolFrame(buildAgentWebUiSubscribeFrame({
      maxReplay: options.maxReplay,
      view,
      includeReplay: true,
    }));
    const sent = frame ? connection.sendFrame(frame) : false;
    if (sent) rescheduleLocalReconcile();
    return sent;
  };

  connect();
}

function eventsFromReadMessage(message: unknown): unknown[] | null {
  if (!message || typeof message !== 'object') return null;
  const candidate = message as Record<string, unknown>;
  return candidate.event === 'session_events_read' && Array.isArray(candidate.events) ? candidate.events : null;
}

function sequenceFromEventsReadMessage(message: unknown): number | null {
  if (!message || typeof message !== 'object') return null;
  const candidate = message as Record<string, unknown>;
  const cursor = candidate.cursor && typeof candidate.cursor === 'object' ? candidate.cursor as Record<string, unknown> : {};
  const events = eventsFromReadMessage(message) ?? [];
  const values = [candidate.last_sequence, cursor.after_sequence, ...events.map((event) => sequenceFromRuntimeMessage(event))];
  const sequences = values
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => typeof value === 'number' ? value : Number(value))
    .filter((value) => Number.isFinite(value));
  return sequences.length > 0 ? Math.max(...sequences) : null;
}
