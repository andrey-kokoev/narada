import { unwrapRuntimeEvent } from './runtime-events.js';
import { findCorrelatedInput, inputCorrelationFromEvent, mergeInputCorrelation } from './operator-input-correlation.js';
import {
  OPERATOR_INPUT_PHASES,
  OPERATOR_INPUT_TRANSITIONS,
  canTransitionOperatorInput,
  transitionOperatorInputLifecycle,
} from './operator-input-lifecycle.js';

function isProjectionInputAdmissionAccepted(event) {
  const status = typeof event?.status === 'string' ? event.status.trim().toLowerCase() : '';
  if (!status) return event?.http_ok === true;
  return ['ok', 'accepted', 'admitted', 'admitted_to_turn', 'queued'].includes(status);
}

export const OPERATOR_INPUT_DELIVERY_PHASES = OPERATOR_INPUT_PHASES;
export const OPERATOR_INPUT_DELIVERY_TRANSITIONS = OPERATOR_INPUT_TRANSITIONS;
export const canTransitionOperatorInputDelivery = canTransitionOperatorInput;

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
    if (isFinalTerminal(record.phase)) return state;
    record.content = event.content ?? record.content;
    record.method = event.method ?? record.method;
    record.source = event.source ?? record.source;
    record.operatorDeliveryMode = event.operator_delivery_mode ?? record.operatorDeliveryMode;
    record.deliveryMode = event.delivery_mode ?? record.deliveryMode;
    record.activeTurnId = event.active_turn_id ?? record.activeTurnId;
    transition(record, OPERATOR_INPUT_DELIVERY_PHASES.SUBMITTING, event);
    return state;
  }

  if (kind === 'operator_input_pending_restored') {
    if (!isTrackedOperatorFrame(event.method)) return state;
    const record = ensureRecord(state, requestId, event);
    if (isFinalTerminal(record.phase)) return state;
    absorbRuntimeMetadata(record, event);
    const restoredPhase = event.pending_state === 'reviewing'
      ? OPERATOR_INPUT_DELIVERY_PHASES.REVIEWING
      : OPERATOR_INPUT_DELIVERY_PHASES.TIMED_OUT;
    transition(record, restoredPhase, event, event.message ?? 'input was not acknowledged before the browser session ended', restoredPhase === OPERATOR_INPUT_DELIVERY_PHASES.REVIEWING ? 'reviewing' : 'ack_timeout');
    return state;
  }

  if (kind === 'operator_input_reviewed') {
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isFinalTerminal(record.phase)) return state;
    absorbRuntimeMetadata(record, event);
    transition(record, OPERATOR_INPUT_DELIVERY_PHASES.REVIEWING, event, event.message ?? 'review the input before retrying');
    return state;
  }

  if (kind === 'operator_input_discarded') {
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isFinalTerminal(record.phase)) return state;
    absorbRuntimeMetadata(record, event);
    transition(record, OPERATOR_INPUT_DELIVERY_PHASES.DISCARDED, event, event.message ?? 'input was discarded', 'discarded');
    return state;
  }

  if (kind === 'operator_input_retried') {
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isFinalTerminal(record.phase)) return state;
    absorbRuntimeMetadata(record, event);
    transition(record, OPERATOR_INPUT_DELIVERY_PHASES.RETRIED, event, event.message ?? 'a manual retry was submitted', 'retried');
    return state;
  }

  if (kind === 'operator_input_pending_expired') {
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isFinalTerminal(record.phase)) return state;
    absorbRuntimeMetadata(record, event);
    transition(record, OPERATOR_INPUT_DELIVERY_PHASES.EXPIRED, event, event.message ?? 'recovery expired', 'expired');
    return state;
  }

  if (kind === 'web_ui_input_ack_timeout') {
    if (!isTrackedOperatorFrame(event.method)) return state;
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isFinalTerminal(record.phase)) return state;
    absorbRuntimeMetadata(record, event);
    transition(record, OPERATOR_INPUT_DELIVERY_PHASES.TIMED_OUT, event, event.message ?? 'NARS did not acknowledge the input', 'ack_timeout');
    return state;
  }

  if (kind === 'web_ui_input_not_sent') {
    if (!isTrackedOperatorFrame(event.method)) return state;
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (record) transition(record, OPERATOR_INPUT_DELIVERY_PHASES.REJECTED, event, event.message ?? event.reason_code ?? 'input was not sent');
    return state;
  }

  if (kind === 'web_ui_input_transport_failed') {
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isFinalTerminal(record.phase)) return state;
    absorbRuntimeMetadata(record, event);
    transition(record, OPERATOR_INPUT_DELIVERY_PHASES.FAILED, event, event.message ?? event.reason_code ?? 'input transport failed', 'transport_failed');
    return state;
  }

  if (kind === 'operator_input_late_acknowledged') {
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isFinalTerminal(record.phase)) return state;
    absorbRuntimeMetadata(record, event);
    transition(record, OPERATOR_INPUT_DELIVERY_PHASES.LATE_RECONCILED, event, null, 'late_acknowledged');
    return state;
  }

  if (kind === 'projection_input_response' && isProjectionInputAdmissionAccepted(event)) {
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isFinalTerminal(record.phase)) return state;
    absorbRuntimeMetadata(record, event);
    transition(record, OPERATOR_INPUT_DELIVERY_PHASES.RELAY_PENDING, event);
    return state;
  }

  if (kind === 'input_event_queued') {
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isFinalTerminal(record.phase)) return state;
    absorbRuntimeMetadata(record, event);
    transition(record, OPERATOR_INPUT_DELIVERY_PHASES.ACCEPTED, event);
    transition(record, queuedPhase(record), event);
    return state;
  }

  if (kind === 'input_event_started' || kind === 'input_admitted_to_turn') {
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isFinalTerminal(record.phase)) return state;
    absorbRuntimeMetadata(record, event);
    if (!record.acceptedAtMs) transition(record, OPERATOR_INPUT_DELIVERY_PHASES.ACCEPTED, event);
    transition(record, OPERATOR_INPUT_DELIVERY_PHASES.STEERING, event);
    return state;
  }

  if (kind === 'input_event_completed' || kind === 'input_completed') {
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isFinalTerminal(record.phase)) return state;
    absorbRuntimeMetadata(record, event);
    transition(record, OPERATOR_INPUT_DELIVERY_PHASES.COMPLETED, event, null, event.terminal_state ?? 'completed');
    return state;
  }

  if (kind === 'session_control_accepted' || kind === 'session_control_response') {
    if (!isTrackedOperatorFrame(event.method)) return state;
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isFinalTerminal(record.phase)) return state;
    if (kind === 'session_control_response' && ['failed', 'rejected', 'refused', 'interrupted'].includes(event.terminal_state)) {
      const phase = event.terminal_state === 'rejected' || event.terminal_state === 'refused'
        ? OPERATOR_INPUT_DELIVERY_PHASES.REJECTED
        : OPERATOR_INPUT_DELIVERY_PHASES.FAILED;
      transition(record, phase, event, event.error ?? event.message ?? event.terminal_state, event.terminal_state);
      return state;
    }
    if (record.phase === OPERATOR_INPUT_DELIVERY_PHASES.DRAFT
      || record.phase === OPERATOR_INPUT_DELIVERY_PHASES.SUBMITTING
      || record.phase === OPERATOR_INPUT_DELIVERY_PHASES.RELAY_PENDING
      || record.phase === OPERATOR_INPUT_DELIVERY_PHASES.TIMED_OUT) {
      transition(record, OPERATOR_INPUT_DELIVERY_PHASES.ACCEPTED, event);
    }
    return state;
  }

  if (kind === 'runtime_request_state_transition') {
    if (!isTrackedOperatorFrame(event.method)) return state;
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isFinalTerminal(record.phase)) return state;
    if (event.request_state === 'failed' || event.request_state === 'rejected') {
      const phase = event.request_state === 'rejected'
        ? OPERATOR_INPUT_DELIVERY_PHASES.REJECTED
        : OPERATOR_INPUT_DELIVERY_PHASES.FAILED;
      transition(record, phase, event, event.error ?? event.message ?? event.request_state, event.request_state);
    }
    return state;
  }

  if (kind === 'session_control_rejected') {
    if (!isTrackedOperatorFrame(event.method)) return state;
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (!record || isFinalTerminal(record.phase)) return state;
    const phase = event.code === 'request_dispatch_failed'
      ? OPERATOR_INPUT_DELIVERY_PHASES.FAILED
      : OPERATOR_INPUT_DELIVERY_PHASES.REJECTED;
    transition(record, phase, event, event.error ?? event.code ?? 'request rejected', event.code ?? 'rejected');
    return state;
  }

  if (kind === 'input_dropped_by_operator' || kind === 'input_abandoned_on_session_end') {
    const record = findOrCreateRuntimeRecord(state, requestId, event);
    if (record && !isFinalTerminal(record.phase)) transition(record, OPERATOR_INPUT_DELIVERY_PHASES.REJECTED, event, event.drop_reason ?? 'input was removed');
    return state;
  }

  if (kind === 'carrier_turn_failed' || kind === 'turn_failed' || kind === 'turn_interrupted') {
    const record = findRecordByTurnOrRequest(state, requestId, event);
    if (record && !isFinalTerminal(record.phase)) transition(record, OPERATOR_INPUT_DELIVERY_PHASES.FAILED, event, event.error ?? event.terminal_state ?? 'turn failed', event.terminal_state ?? 'failed');
    return state;
  }

  if (kind === 'carrier_turn_started' || kind === 'turn_started') {
    const record = findRecordByTurnOrRequest(state, requestId, event);
    if (record && !isFinalTerminal(record.phase)) {
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
  const correlation = inputCorrelationFromEvent(event);
  const normalizedRequestId = requestId ?? correlation.requestId;
  const key = normalizedRequestId ?? (correlation.inputEventId ? `input:${correlation.inputEventId}` : `event:${state.order.length}`);
  let record = state.records.get(key);
  if (!record) {
    record = {
      requestId: normalizedRequestId,
      phase: OPERATOR_INPUT_DELIVERY_PHASES.DRAFT,
      content: event.content ?? null,
      method: event.method ?? null,
      source: event.source ?? null,
      operatorDeliveryMode: event.operator_delivery_mode ?? null,
      deliveryMode: event.delivery_mode ?? null,
      inputEventId: correlation.inputEventId,
      sessionId: correlation.sessionId,
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
  const explicitMatch = findCorrelatedInput(state.records.values(), { ...event, request_id: requestId ?? event?.request_id });
  if (explicitMatch.record || explicitMatch.ambiguous) return explicitMatch.record;
  const activeMatch = findCorrelatedInput(state.records.values(), event, {
    allowUniqueMethod: true,
    activeOnly: (record) => !isFinalTerminal(record.phase),
  });
  return activeMatch.record;
}

function findOrCreateRuntimeRecord(state, requestId, event) {
  const existing = findRecord(state, requestId, event);
  if (existing) return existing;
  const activeMatch = findCorrelatedInput(state.records.values(), event, {
    allowUniqueMethod: true,
    activeOnly: (record) => !isFinalTerminal(record.phase),
  });
  if (activeMatch.ambiguous) return null;
  return ensureRecord(state, requestId, event);
}

function findRecordByTurnOrRequest(state, requestId, event) {
  const direct = findRecord(state, requestId, event);
  if (direct) return direct;
  if (event?.turn_id) {
    for (let index = state.order.length - 1; index >= 0; index -= 1) {
      const record = state.records.get(state.order[index]);
      if ((record?.activeTurnId === event.turn_id || record?.inputEventId === event.turn_id) && !isFinalTerminal(record.phase)) return record;
    }
  }
  return null;
}

function absorbRuntimeMetadata(record, event) {
  mergeInputCorrelation(record, event);
  record.source ??= event.source ?? null;
  record.deliveryMode ??= event.delivery_mode ?? null;
  record.activeTurnId ??= event.active_turn_id ?? event.turn_id ?? null;
  record.method ??= event.method ?? null;
}

function transition(record, phase, event, error = null, terminalState = null) {
  if (isFinalTerminal(record.phase)) return record;
  const previousPhase = record.phase;
  const timestampMs = timestampFromEvent(event) ?? Date.now();
  if (!transitionOperatorInputLifecycle(record, phase, new Date(timestampMs).toISOString())) return record;
  if (previousPhase === OPERATOR_INPUT_DELIVERY_PHASES.TIMED_OUT && phase !== OPERATOR_INPUT_DELIVERY_PHASES.TIMED_OUT) {
    record.terminalAtMs = null;
    record.terminalState = null;
    record.error = null;
  }
  if (previousPhase !== phase) record.history.push(phase);
  if (phase === OPERATOR_INPUT_DELIVERY_PHASES.ACCEPTED) record.acceptedAtMs ??= timestampMs;
  if (phase === OPERATOR_INPUT_DELIVERY_PHASES.STEERING) record.startedAtMs ??= timestampMs;
  if (phase === OPERATOR_INPUT_DELIVERY_PHASES.COMPLETED
    || phase === OPERATOR_INPUT_DELIVERY_PHASES.REJECTED
    || phase === OPERATOR_INPUT_DELIVERY_PHASES.FAILED
    || phase === OPERATOR_INPUT_DELIVERY_PHASES.TIMED_OUT
    || phase === OPERATOR_INPUT_DELIVERY_PHASES.RETRIED
    || phase === OPERATOR_INPUT_DELIVERY_PHASES.LATE_RECONCILED
    || phase === OPERATOR_INPUT_DELIVERY_PHASES.DISCARDED
    || phase === OPERATOR_INPUT_DELIVERY_PHASES.EXPIRED) {
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

function isFinalTerminal(phase) {
  return phase === OPERATOR_INPUT_DELIVERY_PHASES.COMPLETED
    || phase === OPERATOR_INPUT_DELIVERY_PHASES.REJECTED
    || phase === OPERATOR_INPUT_DELIVERY_PHASES.FAILED
    || phase === OPERATOR_INPUT_DELIVERY_PHASES.RETRIED
    || phase === OPERATOR_INPUT_DELIVERY_PHASES.LATE_RECONCILED
    || phase === OPERATOR_INPUT_DELIVERY_PHASES.DISCARDED
    || phase === OPERATOR_INPUT_DELIVERY_PHASES.EXPIRED;
}

function isTrackedOperatorFrame(method) {
  return method === 'session.submit' || method === 'conversation.send' || method === 'conversation.enqueue' || method === 'conversation.steer';
}

function requestIdFromEvent(event) {
  return inputCorrelationFromEvent(event).requestId;
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
    [OPERATOR_INPUT_DELIVERY_PHASES.TIMED_OUT]: 'Input not acknowledged',
    [OPERATOR_INPUT_DELIVERY_PHASES.RELAY_PENDING]: 'Relay accepted; waiting for NARS',
    [OPERATOR_INPUT_DELIVERY_PHASES.REVIEWING]: 'Review input before retrying',
    [OPERATOR_INPUT_DELIVERY_PHASES.RETRIED]: 'Manual retry submitted',
    [OPERATOR_INPUT_DELIVERY_PHASES.LATE_RECONCILED]: 'Late acknowledgment reconciled',
    [OPERATOR_INPUT_DELIVERY_PHASES.DISCARDED]: 'Input discarded',
    [OPERATOR_INPUT_DELIVERY_PHASES.EXPIRED]: 'Recovery expired',
  }[phase] ?? 'Input state unknown';
}

function deliveryDetail(record, nowMs) {
  if (record.phase === OPERATOR_INPUT_DELIVERY_PHASES.TIMED_OUT) return 'No acknowledgment was observed; the input may still have been admitted. Review before retrying manually; no automatic resend was attempted';
  if (record.error) return String(record.error);
  if (record.phase === OPERATOR_INPUT_DELIVERY_PHASES.SUBMITTING) return 'Waiting for NARS acknowledgment';
  if (record.phase === OPERATOR_INPUT_DELIVERY_PHASES.RELAY_PENDING) return 'Cloudflare accepted the relay; waiting for NARS acknowledgment';
  if (record.phase === OPERATOR_INPUT_DELIVERY_PHASES.REVIEWING) return 'Check the transcript before sending this input again';
  if (record.phase === OPERATOR_INPUT_DELIVERY_PHASES.RETRIED) return 'A new request was submitted manually';
  if (record.phase === OPERATOR_INPUT_DELIVERY_PHASES.LATE_RECONCILED) return `NARS acknowledged this input after recovery${record.terminalState ? ` (${record.terminalState})` : ''}`;
  if (record.phase === OPERATOR_INPUT_DELIVERY_PHASES.DISCARDED) return 'No automatic resend was attempted';
  if (record.phase === OPERATOR_INPUT_DELIVERY_PHASES.EXPIRED) return 'The input was removed after the recovery retention window';
  if (record.phase === OPERATOR_INPUT_DELIVERY_PHASES.STEERING && record.startedAtMs) return `${Math.max(0, Math.floor((nowMs - record.startedAtMs) / 1000))}s active`;
  if (record.phase === OPERATOR_INPUT_DELIVERY_PHASES.QUEUED) return 'NARS accepted this input and is holding it for the next turn';
  if (record.phase === OPERATOR_INPUT_DELIVERY_PHASES.COMPLETED) return record.terminalState ?? 'completed';
  return null;
}
