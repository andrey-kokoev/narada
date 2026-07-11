import { unwrapRuntimeEvent } from './runtime-events.js';

export const OPERATOR_INPUT_DELIVERY_PHASES = Object.freeze({
  DRAFT: 'draft',
  SUBMITTING: 'submitting',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  QUEUED: 'queued',
  STEERING: 'steering',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

export const IDLE_OPERATOR_INPUT_DELIVERY = Object.freeze({
  phase: OPERATOR_INPUT_DELIVERY_PHASES.DRAFT,
  requestId: null,
  content: null,
  method: null,
  source: null,
  deliveryMode: null,
  activeTurnId: null,
  acceptedAtMs: null,
  startedAtMs: null,
  terminalAtMs: null,
  terminalState: null,
  error: null,
  history: [OPERATOR_INPUT_DELIVERY_PHASES.DRAFT],
  label: 'Enter a message',
  detail: null,
});

export function createOperatorInputDeliveryState() {
  return {
    records: new Map(),
    order: [],
  };
}

export function createOperatorInputDeliveryProjection(events = [], nowMs = Date.now()) {
  const state = createOperatorInputDeliveryState();
  for (const message of events) reduceOperatorInputDelivery(state, message);
  return materializeOperatorInputDelivery(state, nowMs);
}

/**
 * Reduce local submission evidence and NARS request/turn evidence into one
 * request lifecycle. The local event starts the lifecycle; durable NARS
 * events acknowledge admission and terminal outcome.
 */
export function reduceOperatorInputDelivery(state, message) {
  const event = unwrapRuntimeEvent(message);
  if (!event || typeof event !== 'object') return state;
  const kind = event.event;
  const requestId = requestIdFromEvent(event);

  if (kind === 'operator_input_submitted') {
    if (!isTrackedOperatorFrame(event.method)) return state;
    const record = ensureRecord(state, requestId, event);
    if (isTerminal(record.phase)) return state;
    record.content = event.content ?? record.content;
    record.method = event.method ?? record.method;
    record.source = event.source ?? record.source;
    record.operatorDeliveryMode = event.operator_delivery_mode ?? record.operatorDeliveryMode;
    record.deliveryMode = event.delivery_mode ?? record.deliveryMode;
    record.activeTurnId = event.active_turn_id ?? record.activeTurnId;
    transition(record, OPERATOR_INPUT_DELIVERY_PHASES.SUBMITTING, event);
    return state;
  }

  if (kind === 'web_ui_input_not_sent') {
    if (!isTrackedOperatorFrame(event.method)) return state;
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (record) transition(record, OPERATOR_INPUT_DELIVERY_PHASES.REJECTED, event, event.message ?? event.reason_code ?? 'input was not sent');
    return state;
  }

  if (kind === 'input_event_queued') {
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isTerminal(record.phase)) return state;
    absorbRuntimeMetadata(record, event);
    transition(record, OPERATOR_INPUT_DELIVERY_PHASES.ACCEPTED, event);
    transition(record, queuedPhase(record), event);
    return state;
  }

  if (kind === 'input_event_started' || kind === 'input_admitted_to_turn') {
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isTerminal(record.phase)) return state;
    absorbRuntimeMetadata(record, event);
    if (!record.acceptedAtMs) transition(record, OPERATOR_INPUT_DELIVERY_PHASES.ACCEPTED, event);
    transition(record, OPERATOR_INPUT_DELIVERY_PHASES.STEERING, event);
    return state;
  }

  if (kind === 'input_event_completed') {
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isTerminal(record.phase)) return state;
    absorbRuntimeMetadata(record, event);
    transition(record, OPERATOR_INPUT_DELIVERY_PHASES.COMPLETED, event, null, event.terminal_state ?? 'completed');
    return state;
  }

  if (kind === 'session_control_response') {
    if (!isTrackedOperatorFrame(event.method)) return state;
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isTerminal(record.phase)) return state;
    if (record.phase === OPERATOR_INPUT_DELIVERY_PHASES.DRAFT || record.phase === OPERATOR_INPUT_DELIVERY_PHASES.SUBMITTING) {
      transition(record, OPERATOR_INPUT_DELIVERY_PHASES.ACCEPTED, event);
    }
    return state;
  }

  if (kind === 'session_control_rejected') {
    if (!isTrackedOperatorFrame(event.method)) return state;
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isTerminal(record.phase)) return state;
    const phase = event.code === 'request_dispatch_failed'
      ? OPERATOR_INPUT_DELIVERY_PHASES.FAILED
      : OPERATOR_INPUT_DELIVERY_PHASES.REJECTED;
    transition(record, phase, event, event.error ?? event.code ?? 'request rejected', event.code ?? 'rejected');
    return state;
  }

  if (kind === 'input_dropped_by_operator' || kind === 'input_abandoned_on_session_end') {
    const record = findOrCreateRuntimeRecord(state, requestId ?? event.input_event_id, event);
    if (record && !isTerminal(record.phase)) transition(record, OPERATOR_INPUT_DELIVERY_PHASES.REJECTED, event, event.drop_reason ?? 'input was removed');
    return state;
  }

  if (kind === 'carrier_turn_failed' || kind === 'turn_failed' || kind === 'turn_interrupted') {
    const record = findRecordByTurnOrRequest(state, requestId, event);
    if (record && !isTerminal(record.phase)) transition(record, OPERATOR_INPUT_DELIVERY_PHASES.FAILED, event, event.error ?? event.terminal_state ?? 'turn failed', event.terminal_state ?? 'failed');
    return state;
  }

  if (kind === 'carrier_turn_started' || kind === 'turn_started') {
    const record = findRecordByTurnOrRequest(state, requestId, event);
    if (record && !isTerminal(record.phase)) {
      absorbRuntimeMetadata(record, event);
      transition(record, OPERATOR_INPUT_DELIVERY_PHASES.STEERING, event);
    }
  }
  return state;
}

export function materializeOperatorInputDelivery(state, nowMs = Date.now()) {
  const record = state.order.length > 0 ? state.records.get(state.order.at(-1)) : null;
  if (!record) return { ...IDLE_OPERATOR_INPUT_DELIVERY, history: [...IDLE_OPERATOR_INPUT_DELIVERY.history] };
  return {
    phase: record.phase,
    requestId: record.requestId,
    content: record.content,
    method: record.method,
    source: record.source,
    deliveryMode: record.deliveryMode,
    activeTurnId: record.activeTurnId,
    acceptedAtMs: record.acceptedAtMs,
    startedAtMs: record.startedAtMs,
    terminalAtMs: record.terminalAtMs,
    terminalState: record.terminalState,
    error: record.error,
    history: [...record.history],
    label: deliveryLabel(record.phase),
    detail: deliveryDetail(record, nowMs),
  };
}

function ensureRecord(state, requestId, event) {
  const key = requestId ?? `event:${state.order.length}`;
  let record = state.records.get(key);
  if (!record) {
    record = {
      requestId: requestId ?? null,
      phase: OPERATOR_INPUT_DELIVERY_PHASES.DRAFT,
      content: event.content ?? null,
      method: event.method ?? null,
      source: event.source ?? null,
      operatorDeliveryMode: event.operator_delivery_mode ?? null,
      deliveryMode: event.delivery_mode ?? null,
      inputEventId: event.event_id ?? event.input_event_id ?? null,
      activeTurnId: event.active_turn_id ?? event.turn_id ?? null,
      acceptedAtMs: null,
      startedAtMs: null,
      terminalAtMs: null,
      terminalState: null,
      error: null,
      localSubmission: event.event === 'operator_input_submitted',
      history: [OPERATOR_INPUT_DELIVERY_PHASES.DRAFT],
    };
    state.records.set(key, record);
    state.order.push(key);
  }
  return record;
}

function findRecord(state, requestId, event) {
  if (requestId && state.records.has(requestId)) return state.records.get(requestId);
  if (requestId) {
    for (const key of state.order) {
      const record = state.records.get(key);
      if (record && (record.requestId === requestId || record.inputEventId === requestId)) return record;
    }
  }
  if (event?.method) {
    for (let index = state.order.length - 1; index >= 0; index -= 1) {
      const record = state.records.get(state.order[index]);
      if (record?.method === event.method && !isTerminal(record.phase)) return record;
    }
  }
  for (const eventId of [event?.event_id, event?.input_event_id, event?.turn_id]) {
    if (!eventId) continue;
    for (const key of state.order) {
      const record = state.records.get(key);
      if (record && (record.requestId === eventId || record.inputEventId === eventId)) return record;
    }
  }
  return null;
}

function findOrCreateRuntimeRecord(state, requestId, event) {
  const existing = findRecord(state, requestId, event);
  if (existing) return existing;
  if (!requestId && !event?.method) {
    for (let index = state.order.length - 1; index >= 0; index -= 1) {
      const record = state.records.get(state.order[index]);
      if (record?.localSubmission && !isTerminal(record.phase)) return record;
    }
  }
  return ensureRecord(state, requestId, event);
}

function findRecordByTurnOrRequest(state, requestId, event) {
  const direct = findRecord(state, requestId, event);
  if (direct) return direct;
  if (event?.turn_id) {
    for (let index = state.order.length - 1; index >= 0; index -= 1) {
      const record = state.records.get(state.order[index]);
      if ((record?.activeTurnId === event.turn_id || record?.inputEventId === event.turn_id) && !isTerminal(record.phase)) return record;
    }
  }
  for (let index = state.order.length - 1; index >= 0; index -= 1) {
    const record = state.records.get(state.order[index]);
    if (record && !isTerminal(record.phase)) return record;
  }
  return null;
}

function absorbRuntimeMetadata(record, event) {
  record.source ??= event.source ?? null;
  record.deliveryMode ??= event.delivery_mode ?? null;
  record.activeTurnId ??= event.turn_id ?? null;
  record.inputEventId ??= event.event_id ?? event.input_event_id ?? null;
  record.method ??= event.method ?? null;
}

function transition(record, phase, event, error = null, terminalState = null) {
  if (isTerminal(record.phase)) return record;
  if (record.phase !== phase) record.history.push(phase);
  record.phase = phase;
  const timestampMs = timestampFromEvent(event) ?? Date.now();
  if (phase === OPERATOR_INPUT_DELIVERY_PHASES.ACCEPTED) record.acceptedAtMs ??= timestampMs;
  if (phase === OPERATOR_INPUT_DELIVERY_PHASES.STEERING) record.startedAtMs ??= timestampMs;
  if (phase === OPERATOR_INPUT_DELIVERY_PHASES.COMPLETED || phase === OPERATOR_INPUT_DELIVERY_PHASES.REJECTED || phase === OPERATOR_INPUT_DELIVERY_PHASES.FAILED) {
    record.terminalAtMs = timestampMs;
    record.terminalState = terminalState ?? record.terminalState;
  }
  if (error) record.error = error;
  return record;
}

function queuedPhase(record) {
  return record.operatorDeliveryMode === 'enqueue'
    || (record.operatorDeliveryMode == null && record.deliveryMode === 'admit_after_active_turn')
    ? OPERATOR_INPUT_DELIVERY_PHASES.QUEUED
    : OPERATOR_INPUT_DELIVERY_PHASES.STEERING;
}

function isTerminal(phase) {
  return phase === OPERATOR_INPUT_DELIVERY_PHASES.COMPLETED
    || phase === OPERATOR_INPUT_DELIVERY_PHASES.REJECTED
    || phase === OPERATOR_INPUT_DELIVERY_PHASES.FAILED;
}

function isTrackedOperatorFrame(method) {
  return method === 'session.submit' || method === 'conversation.send' || method === 'conversation.enqueue' || method === 'conversation.steer';
}

function requestIdFromEvent(event) {
  return event.request_id ?? event.requestId ?? event.input_request_id ?? event.input_event_id ?? null;
}

function timestampFromEvent(event) {
  const parsed = Date.parse(String(event?.timestamp ?? event?.created_at ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function deliveryLabel(phase) {
  return {
    [OPERATOR_INPUT_DELIVERY_PHASES.DRAFT]: 'Enter a message',
    [OPERATOR_INPUT_DELIVERY_PHASES.SUBMITTING]: 'Submitting input…',
    [OPERATOR_INPUT_DELIVERY_PHASES.ACCEPTED]: 'Input accepted',
    [OPERATOR_INPUT_DELIVERY_PHASES.REJECTED]: 'Input rejected',
    [OPERATOR_INPUT_DELIVERY_PHASES.QUEUED]: 'Queued for the next turn',
    [OPERATOR_INPUT_DELIVERY_PHASES.STEERING]: 'Steering the active turn',
    [OPERATOR_INPUT_DELIVERY_PHASES.COMPLETED]: 'Input delivered',
    [OPERATOR_INPUT_DELIVERY_PHASES.FAILED]: 'Input failed',
  }[phase] ?? 'Input state unknown';
}

function deliveryDetail(record, nowMs) {
  if (record.error) return String(record.error);
  if (record.phase === OPERATOR_INPUT_DELIVERY_PHASES.SUBMITTING) return 'Waiting for NARS acknowledgment';
  if (record.phase === OPERATOR_INPUT_DELIVERY_PHASES.STEERING && record.startedAtMs) return `${Math.max(0, Math.floor((nowMs - record.startedAtMs) / 1000))}s active`;
  if (record.phase === OPERATOR_INPUT_DELIVERY_PHASES.QUEUED) return 'NARS accepted this input and is holding it for the next turn';
  if (record.phase === OPERATOR_INPUT_DELIVERY_PHASES.COMPLETED) return record.terminalState ?? 'completed';
  return null;
}
