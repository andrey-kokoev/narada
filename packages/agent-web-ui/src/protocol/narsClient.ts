import { buildAgentWebUiEventsReadFrame, isAgentWebUiCloudflareProtocolFrame, isAgentWebUiNarsMethod, normalizeNarsClientProjectionVerbosity } from '@narada2/nars-client-projection-contract';
import { isProjectionInputAdmissionAccepted, sessionIdFromTransportMessage, toSessionProtocolFrame, type SessionProtocolFrame, type SessionTransport, type SessionTransportCorrelation } from './sessionTransport';
import { startCloudflareSessionTransport } from './cloudflareSessionTransport';
import { startLocalSessionTransport } from './localSessionTransport';
import { createNarsTransportLifecycle, isNarsTransportClosed, projectionHeaders, transitionNarsTransport, type NarsClientState, type NarsTransportPhase } from './sessionTransportAdapters';
import { PENDING_OPERATOR_INPUT_PHASES, transitionPendingOperatorInput, type PendingOperatorInputLifecycle, type PendingOperatorInputPhase } from './operatorInputLifecycle';
import { findCorrelatedInput, inputCorrelationFromEvent, mergeInputCorrelation, normalizeInputCorrelationId as normalizeRequestId } from '../operator-input-correlation.js';

export interface NarsClientOptions {
  endpoint: string | null;
  healthEndpoint?: string | null;
  inputEndpoint?: string | null;
  browserToken?: string | null;
  sessionId?: string | null;
  pendingInputStorageKey?: string;
  pendingInputStorage?: PendingInputStorage | null;
  operatorInputAckTimeoutMs?: number;
  pendingInputRetentionMs?: number;
  maxReplay?: number;
  view?: string;
  WebSocketCtor?: typeof WebSocket;
  fetchFn?: typeof fetch;
  timers?: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;
  onStatus?: (status: string) => void;
  onTransportState?: (phase: NarsTransportPhase) => void;
  onEvent?: (event: unknown) => void;
  onDecodeError?: (message: string) => void;
}

export interface NarsClientConnection extends SessionTransport {}

export const NARS_OPERATOR_INPUT_ACK_TIMEOUT_MS = 5_000;
export const NARS_PENDING_OPERATOR_INPUT_RETENTION_MS = 24 * 60 * 60 * 1000;

type PendingInputStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface PendingOperatorInput extends PendingOperatorInputLifecycle {
  request_id: string;
  method: string;
  content: string;
  source: string | null;
  delivery_mode: string | null;
  active_turn_id: string | boolean | null;
  created_at: string;
  superseded_by_request_id?: string | null;
  input_event_id?: string | null;
  transport: string | null;
  endpoint: string | null;
  session_id: string | null;
  socket_generation: number | null;
}

interface PendingOperatorInputReadResult {
  active: PendingOperatorInput[];
  expired: PendingOperatorInput[];
}

export function createNarsClient(options: NarsClientOptions): NarsClientConnection {
  const WebSocketCtor = options.WebSocketCtor ?? globalThis.WebSocket;
  const setTimeoutFn = options.timers?.setTimeout ?? globalThis.setTimeout;
  const clearTimeoutFn = options.timers?.clearTimeout ?? globalThis.clearTimeout;
  const isCloudflareTransport = /^https?:/i.test(options.endpoint ?? '');
  const pendingInputStorage = options.pendingInputStorage ?? readSessionStorage();
  const pendingInputStorageKey = options.pendingInputStorageKey
    ?? `narada:agent-web-ui:pending-inputs.v1:${encodeURIComponent(options.sessionId ?? options.endpoint ?? 'unbound')}`;
  const operatorInputAckTimeoutMs = Number.isFinite(options.operatorInputAckTimeoutMs)
    ? Math.max(1, options.operatorInputAckTimeoutMs as number)
    : NARS_OPERATOR_INPUT_ACK_TIMEOUT_MS;
  const pendingInputRetentionMs = Number.isFinite(options.pendingInputRetentionMs)
    ? Math.max(1, options.pendingInputRetentionMs as number)
    : NARS_PENDING_OPERATOR_INPUT_RETENTION_MS;
  const pendingOperatorInputs = new Map<string, PendingOperatorInput>();
  const pendingOperatorInputTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const state = {
    socket: null as WebSocket | null,
    lifecycle: createNarsTransportLifecycle(Boolean(options.endpoint)),
    lastSequence: null as number | null,
    activeTurnId: null as string | boolean | null,
    reconnectTimer: null as ReturnType<typeof setTimeout> | null,
    remotePageTimer: null as ReturnType<typeof setTimeout> | null,
    reconcileTimer: null as ReturnType<typeof setTimeout> | null,
    socketGeneration: 0,
    view: normalizeNarsClientProjectionVerbosity(options.view ?? 'conversation'),
    sendFrameImpl: undefined as ((frame: SessionProtocolFrame) => boolean) | undefined,
    subscribeView: undefined as ((view: string) => boolean) | undefined,
  };
  const notifyTransportState = () => options.onTransportState?.(state.lifecycle.phase);
  const currentTransportCorrelation = (): SessionTransportCorrelation => ({
    transport: isCloudflareTransport ? 'cloudflare-projection' : 'local-websocket',
    endpoint: options.endpoint ?? null,
    session_id: normalizeRequestId(options.sessionId),
    socket_generation: state.socketGeneration,
  });

  const restoredPending = readPendingOperatorInputs(pendingInputStorage, pendingInputStorageKey, pendingInputRetentionMs);
  for (const pending of restoredPending.active) pendingOperatorInputs.set(pending.request_id, pending);
  if (restoredPending.expired.length > 0) {
    persistPendingOperatorInputs(pendingInputStorage, pendingInputStorageKey, pendingOperatorInputs.values());
  }

  const removePendingOperatorInput = (requestId: string | null | undefined) => {
    const normalizedRequestId = normalizeRequestId(requestId);
    if (!normalizedRequestId) return;
    const timer = pendingOperatorInputTimers.get(normalizedRequestId);
    if (timer !== undefined) clearTimeoutFn?.(timer);
    pendingOperatorInputTimers.delete(normalizedRequestId);
    pendingOperatorInputs.delete(normalizedRequestId);
    persistPendingOperatorInputs(pendingInputStorage, pendingInputStorageKey, pendingOperatorInputs.values());
  };

  const clearPendingOperatorInput = (requestId: string | null | undefined) => {
    removePendingOperatorInput(requestId);
  };

  const reviewPendingOperatorInput = (requestId: string | null | undefined): boolean => {
    const normalizedRequestId = normalizeRequestId(requestId);
    const pending = normalizedRequestId ? pendingOperatorInputs.get(normalizedRequestId) : null;
    if (!pending || !transitionPendingOperatorInput(pending, PENDING_OPERATOR_INPUT_PHASES.REVIEWING)) return false;
    clearPendingOperatorInputTimer(pending.request_id);
    persistPendingOperatorInputs(pendingInputStorage, pendingInputStorageKey, pendingOperatorInputs.values());
    emitLocalEvent(options.onEvent, pendingLifecycleEvent('operator_input_reviewed', pending, {
      message: 'Input marked for manual review; no resend was attempted.',
    }));
    return true;
  };

  const discardPendingOperatorInput = (requestId: string | null | undefined): boolean => {
    const normalizedRequestId = normalizeRequestId(requestId);
    const pending = normalizedRequestId ? pendingOperatorInputs.get(normalizedRequestId) : null;
    if (!pending) return false;
    removePendingOperatorInput(normalizedRequestId);
    emitLocalEvent(options.onEvent, pendingLifecycleEvent('operator_input_discarded', pending, {
      message: 'Unacknowledged input was discarded by the operator.',
    }));
    return true;
  };

  const markPendingOperatorInputRetried = (requestId: string | null | undefined, retryRequestId: string | null = null): boolean => {
    const normalizedRequestId = normalizeRequestId(requestId);
    const pending = normalizedRequestId ? pendingOperatorInputs.get(normalizedRequestId) : null;
    if (!pending || !transitionPendingOperatorInput(pending, PENDING_OPERATOR_INPUT_PHASES.RETRIED)) return false;
    clearPendingOperatorInputTimer(pending.request_id);
    pending.superseded_by_request_id = normalizeRequestId(retryRequestId);
    persistPendingOperatorInputs(pendingInputStorage, pendingInputStorageKey, pendingOperatorInputs.values());
    emitLocalEvent(options.onEvent, pendingLifecycleEvent('operator_input_retried', pending, {
      retry_request_id: pending.superseded_by_request_id,
      message: 'A new operator input was submitted manually after review.',
    }));
    return true;
  };

  const clearPendingOperatorInputTimer = (requestId: string) => {
    const timer = pendingOperatorInputTimers.get(requestId);
    if (timer !== undefined) clearTimeoutFn?.(timer);
    pendingOperatorInputTimers.delete(requestId);
  };

  const armPendingOperatorInputTimeout = (requestId: string) => {
    clearPendingOperatorInputTimer(requestId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    timer = setTimeoutFn(() => {
      if (pendingOperatorInputTimers.get(requestId) !== timer) return;
      timeoutPendingOperatorInput(requestId);
    }, operatorInputAckTimeoutMs);
    pendingOperatorInputTimers.set(requestId, timer);
  };

  const failPendingOperatorInput = (requestId: string, message: unknown) => {
    const pending = pendingOperatorInputs.get(requestId);
    if (!pending) return;
    removePendingOperatorInput(requestId);
    emitLocalEvent(options.onEvent, pendingLifecycleEvent('web_ui_input_transport_failed', pending, {
      reason_code: 'projection_input_failed',
      message: String(message ?? 'Cloudflare input relay failed'),
    }));
  };

  const timeoutPendingOperatorInput = (requestId: string) => {
    const pending = pendingOperatorInputs.get(requestId);
    if (!pending) return;
    if (!transitionPendingOperatorInput(pending, PENDING_OPERATOR_INPUT_PHASES.TIMED_OUT)) return;
    clearPendingOperatorInputTimer(requestId);
    persistPendingOperatorInputs(pendingInputStorage, pendingInputStorageKey, pendingOperatorInputs.values());
    emitLocalEvent(options.onEvent, pendingLifecycleEvent('web_ui_input_ack_timeout', pending, {
      timeout_ms: operatorInputAckTimeoutMs,
      reason_code: 'nars_ack_timeout',
      message: `NARS did not acknowledge this input within ${operatorInputAckTimeoutMs}ms; no automatic resend was attempted.`,
    }));
    options.onStatus?.(`input acknowledgment timed out after ${Math.ceil(operatorInputAckTimeoutMs / 1000)}s`);
    const socket = state.socket;
    if (socket) {
      try {
        socket.close();
      } catch {
        // The socket close path owns reconnect scheduling.
      }
    }
  };

  const trackPendingOperatorInput = (frame: SessionProtocolFrame) => {
    const requestId = normalizeRequestId(frame.id);
    if (!requestId || !isTrackedOperatorInputMethod(frame.method)) return null;
    const pending = pendingInputFromFrame(requestId, frame, currentTransportCorrelation());
    pendingOperatorInputs.set(requestId, pending);
    persistPendingOperatorInputs(pendingInputStorage, pendingInputStorageKey, pendingOperatorInputs.values());
    armPendingOperatorInputTimeout(requestId);
    return requestId;
  };

  const reconcilePendingOperatorInput = (message: unknown): boolean => {
    const observedSessionId = sessionIdFromTransportMessage(message);
    const expectedSessionId = normalizeRequestId(options.sessionId);
    if (observedSessionId && expectedSessionId && observedSessionId !== expectedSessionId) {
      const event = unwrapTransportEvent(message);
      const pendingMatch = findCorrelatedInput(pendingOperatorInputs.values(), event, { allowUniqueMethod: true });
      const pending = pendingMatch.record as PendingOperatorInput | null;
      if (pending) {
        emitLocalEvent(options.onEvent, pendingLifecycleEvent('web_ui_input_ack_ignored', pending, {
          reason_code: 'session_correlation_mismatch',
          observed_session_id: observedSessionId,
          expected_session_id: expectedSessionId,
          message: 'An acknowledgment from a different NARS session was ignored; no resend was attempted.',
        }));
      }
      emitLocalEvent(options.onEvent, {
        event: 'web_ui_session_correlation_mismatch',
        expected_session_id: expectedSessionId,
        observed_session_id: observedSessionId,
        ...currentTransportCorrelation(),
        message: 'The attached transport reported a different NARS session; the event was ignored.',
      });
      return false;
    }
    const event = unwrapTransportEvent(message);
    if (!event || typeof event !== 'object') return true;
    const kind = typeof event.event === 'string' ? event.event : null;
    const requestState = typeof event.request_state === 'string' ? event.request_state.trim().toLowerCase() : '';
    const correlation = inputCorrelationFromEvent(event);
    const pendingMatch = findCorrelatedInput(pendingOperatorInputs.values(), event, { allowUniqueMethod: true });
    const pending = pendingMatch.record as PendingOperatorInput | null;
    if (pendingMatch.ambiguous) {
      emitLocalEvent(options.onEvent, {
        event: 'web_ui_input_correlation_ambiguous',
        request_id: correlation.requestId,
        input_event_id: correlation.inputEventId,
        method: correlation.method,
        message: 'The runtime event matched more than one pending input; it was not applied to a browser recovery record.',
      });
    }

    if (pending && correlation.inputEventId) {
      mergeInputCorrelation(pending, event, {
        requestKey: 'request_id',
        inputEventKey: 'input_event_id',
        sessionKey: 'session_id',
      });
      persistPendingOperatorInputs(pendingInputStorage, pendingInputStorageKey, pendingOperatorInputs.values());
    }

    if (kind === 'projection_input_response') {
      if (isProjectionInputAdmissionAccepted(event)) {
        if (pending && transitionPendingOperatorInput(pending, PENDING_OPERATOR_INPUT_PHASES.RELAY_PENDING)) {
          persistPendingOperatorInputs(pendingInputStorage, pendingInputStorageKey, pendingOperatorInputs.values());
          if (pending.phase === PENDING_OPERATOR_INPUT_PHASES.RELAY_PENDING) armPendingOperatorInputTimeout(pending.request_id);
        }
      } else if (pending) {
        failPendingOperatorInput(pending.request_id, event.message ?? event.error ?? event.code ?? 'Cloudflare input relay failed');
      }
      return true;
    }

    if (kind === 'projection_input_failed') {
      if (pending) failPendingOperatorInput(pending.request_id, event.message ?? event.error ?? 'Cloudflare input relay failed');
      return true;
    }

    if (kind === 'session_control_accepted' || kind === 'input_event_queued' || kind === 'input_event_started' || kind === 'input_admitted_to_turn' || kind === 'session_control_rejected' || kind === 'session_control_response' || (kind === 'runtime_request_state_transition' && ['completed', 'failed', 'rejected', 'interrupted'].includes(requestState))) {
      if (pending) {
        if (pending.phase === PENDING_OPERATOR_INPUT_PHASES.TIMED_OUT || pending.phase === PENDING_OPERATOR_INPUT_PHASES.REVIEWING || pending.phase === PENDING_OPERATOR_INPUT_PHASES.RETRIED) {
          emitLocalEvent(options.onEvent, pendingLifecycleEvent('operator_input_late_acknowledged', pending, {
            acknowledged_event: kind,
            recovery_state: pending.phase,
            message: 'NARS acknowledged this input after the browser had entered recovery.',
          }));
        }
        clearPendingOperatorInput(pending.request_id);
      }
      return true;
    }
    if (kind === 'input_event_completed' || kind === 'input_completed') {
      if (pending) {
        if (pending.phase === PENDING_OPERATOR_INPUT_PHASES.TIMED_OUT || pending.phase === PENDING_OPERATOR_INPUT_PHASES.REVIEWING || pending.phase === PENDING_OPERATOR_INPUT_PHASES.RETRIED) {
          emitLocalEvent(options.onEvent, pendingLifecycleEvent('operator_input_late_acknowledged', pending, {
            acknowledged_event: kind,
            recovery_state: pending.phase,
            message: 'NARS completed this input after the browser had entered recovery.',
          }));
        }
        clearPendingOperatorInput(pending.request_id);
      }
    }
    return true;
  };

  const adapterOptions: NarsClientOptions = {
    ...options,
    onEvent(message) {
      if (reconcilePendingOperatorInput(message)) options.onEvent?.(message);
    },
  };
  const connection: NarsClientConnection = {
    kind: /^https?:/i.test(options.endpoint ?? '') ? 'cloudflare-projection' : 'local-websocket',
    healthEndpoint: options.healthEndpoint ?? null,
    get transportCorrelation() { return currentTransportCorrelation(); },
    get lifecycle() { return state.lifecycle; },
    get activeTurnId() { return state.activeTurnId; },
    get lastSequence() { return state.lastSequence; },
    subscribeView(view) {
      state.view = normalizeNarsClientProjectionVerbosity(view);
      return state.subscribeView?.(state.view) ?? false;
    },
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
      const admittedByTransport = isCloudflareTransport
        ? isAgentWebUiCloudflareProtocolFrame(admittedFrame)
        : Boolean(admittedFrame && isAgentWebUiNarsMethod(admittedFrame.method));
      if (!admittedFrame || !admittedByTransport) throw new Error('unsupported_agent_web_ui_protocol_frame');
      const requestId = trackPendingOperatorInput(admittedFrame);
      try {
        const sent = state.sendFrameImpl?.(admittedFrame) ?? false;
        if (!sent && requestId) clearPendingOperatorInput(requestId);
        return sent;
      } catch (error) {
        if (requestId) clearPendingOperatorInput(requestId);
        throw error;
      }
    },
    clearPendingOperatorInput,
    reviewPendingOperatorInput,
    discardPendingOperatorInput,
    markPendingOperatorInputRetried,
    readEventsPage(options) {
      return connection.sendFrame(buildAgentWebUiEventsReadFrame(options));
    },
    close() {
      if (isNarsTransportClosed(state.lifecycle)) return;
      transitionNarsTransport(state.lifecycle, { type: 'close_requested' });
      notifyTransportState();
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
      for (const timer of pendingOperatorInputTimers.values()) clearTimeoutFn?.(timer);
      pendingOperatorInputTimers.clear();
      pendingOperatorInputs.clear();
      const socket = state.socket;
      state.socket = null;
      socket?.close?.();
      transitionNarsTransport(state.lifecycle, { type: 'closed' });
      notifyTransportState();
    },
  };

  if (!options.endpoint) {
    notifyTransportState();
    options.onStatus?.('event endpoint not configured');
    return connection;
  }

  notifyTransportState();

  for (const pending of pendingOperatorInputs.values()) {
    if (pending.phase === PENDING_OPERATOR_INPUT_PHASES.RETRIED) continue;
    emitLocalEvent(options.onEvent, pendingLifecycleEvent('operator_input_pending_restored', pending, {
      message: pending.phase === PENDING_OPERATOR_INPUT_PHASES.REVIEWING
        ? 'This input is already marked for manual review; send it again only after checking the transcript.'
        : 'This input was not durably acknowledged before the browser session ended; review it before retrying.',
    }));
  }
  for (const expired of restoredPending.expired) {
    emitLocalEvent(options.onEvent, pendingLifecycleEvent('operator_input_pending_expired', expired, {
      reason_code: 'pending_input_retention_elapsed',
      message: 'Recovery for this unacknowledged input expired after 24 hours.',
    }));
  }

  state.sendFrameImpl = (frame) => {
    const socket = state.socket;
    const openState = WebSocketCtor.OPEN ?? 1;
    if (!socket || socket.readyState !== openState) return false;
    socket.send(JSON.stringify(frame));
    return true;
  };

  const adapterContext = {
    options: adapterOptions,
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

function isTrackedOperatorInputMethod(method: string): boolean {
  return method === 'session.submit'
    || method === 'conversation.send'
    || method === 'conversation.enqueue'
    || method === 'conversation.steer';
}

function pendingInputFromFrame(requestId: string, frame: SessionProtocolFrame, correlation: SessionTransportCorrelation): PendingOperatorInput {
  const params = frame.params && typeof frame.params === 'object' ? frame.params : {};
  return {
    phase: PENDING_OPERATOR_INPUT_PHASES.SENT,
    updated_at: new Date().toISOString(),
    request_id: requestId,
    method: frame.method,
    content: String(params.message ?? params.content ?? params.command ?? frame.method),
    source: typeof params.source === 'string' ? params.source : null,
    delivery_mode: typeof params.delivery_mode === 'string' ? params.delivery_mode : null,
    active_turn_id: typeof params.active_turn_id === 'string' || typeof params.active_turn_id === 'boolean' ? params.active_turn_id : null,
    created_at: new Date().toISOString(),
    transport: correlation.transport,
    endpoint: correlation.endpoint,
    session_id: correlation.session_id,
    socket_generation: correlation.socket_generation,
  };
}

function unwrapTransportEvent(message: unknown): Record<string, unknown> | null {
  if (!message || typeof message !== 'object') return null;
  const candidate = message as Record<string, unknown>;
  if (candidate.event === 'session_event' && candidate.payload && typeof candidate.payload === 'object') {
    return candidate.payload as Record<string, unknown>;
  }
  return candidate;
}

function readSessionStorage(): PendingInputStorage | null {
  try {
    return typeof globalThis.sessionStorage === 'undefined' ? null : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function readPendingOperatorInputs(storage: PendingInputStorage | null, key: string, retentionMs: number): PendingOperatorInputReadResult {
  if (!storage) return { active: [], expired: [] };
  try {
    const raw = storage.getItem(key);
    if (!raw) return { active: [], expired: [] };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { active: [], expired: [] };
    const active: PendingOperatorInput[] = [];
    const expired: PendingOperatorInput[] = [];
    const now = Date.now();
    for (const value of parsed) {
      if (!value || typeof value !== 'object' || typeof value.request_id !== 'string' || typeof value.method !== 'string' || typeof value.content !== 'string') continue;
      const candidate = value as Partial<PendingOperatorInput>;
      const createdAt = typeof candidate.created_at === 'string' ? candidate.created_at : new Date(now).toISOString();
      const updatedAt = typeof candidate.updated_at === 'string' ? candidate.updated_at : createdAt;
      const phase = isPendingOperatorInputPhase(candidate.phase) ? candidate.phase : PENDING_OPERATOR_INPUT_PHASES.TIMED_OUT;
      const normalized: PendingOperatorInput = {
        ...candidate,
        phase,
        updated_at: updatedAt,
        created_at: createdAt,
        request_id: value.request_id,
        method: value.method,
        content: value.content,
        source: typeof candidate.source === 'string' ? candidate.source : null,
        delivery_mode: typeof candidate.delivery_mode === 'string' ? candidate.delivery_mode : null,
        active_turn_id: typeof candidate.active_turn_id === 'string' || typeof candidate.active_turn_id === 'boolean' ? candidate.active_turn_id : null,
        transport: typeof candidate.transport === 'string' ? candidate.transport : null,
        endpoint: typeof candidate.endpoint === 'string' ? candidate.endpoint : null,
        session_id: typeof candidate.session_id === 'string' ? candidate.session_id : null,
        socket_generation: typeof candidate.socket_generation === 'number' ? candidate.socket_generation : null,
      };
      const updatedAtMs = Date.parse(updatedAt);
      if (Number.isFinite(updatedAtMs) && now - updatedAtMs > retentionMs) expired.push(normalized);
      else active.push(normalized);
    }
    return { active, expired };
  } catch {
    return { active: [], expired: [] };
  }
}

function persistPendingOperatorInputs(storage: PendingInputStorage | null, key: string, values: Iterable<PendingOperatorInput>): void {
  if (!storage) return;
  try {
    const records = [...values].slice(-20);
    if (records.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(records));
  } catch {
    // Browser storage is an advisory recovery surface; transport remains authoritative.
  }
}

function emitLocalEvent(onEvent: ((event: unknown) => void) | undefined, event: unknown): void {
  onEvent?.(event);
}

function isPendingOperatorInputPhase(value: unknown): value is PendingOperatorInputPhase {
  return value === PENDING_OPERATOR_INPUT_PHASES.SENT
    || value === PENDING_OPERATOR_INPUT_PHASES.RELAY_PENDING
    || value === PENDING_OPERATOR_INPUT_PHASES.TIMED_OUT
    || value === PENDING_OPERATOR_INPUT_PHASES.REVIEWING
    || value === PENDING_OPERATOR_INPUT_PHASES.RETRIED;
}

function pendingLifecycleEvent(
  event: string,
  pending: PendingOperatorInput,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    event,
    request_id: pending.request_id,
    method: pending.method,
    content: pending.content,
    source: pending.source,
    delivery_mode: pending.delivery_mode,
    active_turn_id: pending.active_turn_id,
    created_at: pending.created_at,
    pending_state: pending.phase,
    input_event_id: pending.input_event_id ?? null,
    transport: pending.transport,
    endpoint: pending.endpoint,
    session_id: pending.session_id,
    socket_generation: pending.socket_generation,
    ...extra,
  };
}
