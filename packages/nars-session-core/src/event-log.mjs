import { existsSync, readFileSync } from 'node:fs';

export const NARS_EVENTS_READ_SCHEMA = 'narada.nars.events.read.v1';
export const NARS_SESSION_EVENT_VIEWS = Object.freeze([
  'conversation',
  'operations',
  'diagnostics',
  'raw',
]);
export const NARS_SESSION_EVENT_DEFAULT_VIEW = 'raw';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

const CONVERSATION_EVENT_KINDS = new Set([
  'assistant_message',
  'assistant_message_stream',
  'user_message',
  'operator_input_submitted',
  // Delivery acknowledgements are transport facts required by a conversation
  // client to settle its composer and activity state. They remain hidden from
  // the normal Chat projection by the client projection contract.
  'conversation_enqueue_requested',
  'input_event_queued',
  'input_event_deduplicated',
  'input_event_started',
  'input_event_completed',
  // Request lifecycle evidence lets a conversation transport settle a
  // pending browser input even when an earlier admission event was missed.
  'runtime_request_state_transition',
  'input_queued_for_turn_boundary',
  'input_admitted_to_turn',
  'input_dropped_by_operator',
  'input_abandoned_on_session_end',
  'input_completed',
  'session_control_accepted',
  'session_control_response',
  'session_control_rejected',
  'session_cancel',
  'carrier_turn_started',
  'carrier_turn_completed',
  'carrier_turn_failed',
  'carrier_turn_interrupted',
  // Confirmation state is consumed by the browser affordance reducer. Keep
  // it on the conversation transport even though the normal Chat renderer
  // intentionally omits these control records.
  'session_affordance_action_requested',
  'session_affordance_action_result',
  'session_affordance_action_refused',
  'session_affordance_confirmation_required',
  'session_affordance_action_confirmed',
  'session_affordance_action_cancelled',
  'agent_web_ui_message',
  'agent_web_ui_help',
  'session_artifact_registered',
  'session_artifact_read',
  'error',
  'websocket_error',
  'web_ui_decode_error',
  'web_ui_input_not_sent',
  'runtime_error',
]);

const OPERATION_EVENT_KINDS = new Set([
  'tool_call',
  'tool_result',
  'turn_failed',
  'conversation_enqueue_requested',
  'input_queued_for_turn_boundary',
  'input_admitted_to_turn',
  'input_dropped_by_operator',
  'input_abandoned_on_session_end',
  'input_completed',
  'session_started',
  'session_closed',
  'session_status',
  'session_recovery',
  'session_operations',
  'session_sync',
  'observer_status',
  'observers_status',
  'carrier_command_result',
  'turn_started',
  'turn_complete',
  'directive_received',
  'directive_receipt_recorded',
  'directive_carrier_accepted_recorded',
  'directive_complete',
]);

const DIAGNOSTIC_EVENT_KINDS = new Set([
  'authority_session_revoked',
  'projection_revoked',
  'carrier_diagnostic_recorded',
  'mcp_runtime_fault',
  'runtime_projection_failure',
  'runtime_output_failure',
  'runtime_control_input_bridge_error',
  'runtime_intelligence_reconfiguration',
  'intelligence_runtime_reconfiguration_state_transition',
  'provider_runtime_fault',
  'provider_error',
  'session_health',
  'websocket_connected',
  'session_events_subscription_started',
  'session_events_replay_completed',
]);

export function normalizeNarsSessionEventView(view = NARS_SESSION_EVENT_DEFAULT_VIEW) {
  const normalized = String(view ?? NARS_SESSION_EVENT_DEFAULT_VIEW).trim().toLowerCase();
  return NARS_SESSION_EVENT_VIEWS.includes(normalized) ? normalized : null;
}

export function getNarsEventKind(event) {
  const eventValue = event?.event ?? event?.event_kind;
  if (typeof eventValue === 'string') return eventValue;
  if (eventValue && typeof eventValue === 'object' && typeof eventValue.type === 'string') return eventValue.type;
  return typeof event?.type === 'string' ? event.type : null;
}

export function eventMatchesNarsView(event, view = NARS_SESSION_EVENT_DEFAULT_VIEW) {
  const normalizedView = normalizeNarsSessionEventView(view);
  if (!normalizedView || normalizedView === 'raw') return normalizedView === 'raw';
  const kind = getNarsEventKind(event);
  if (normalizedView === 'conversation') return CONVERSATION_EVENT_KINDS.has(kind);
  if (normalizedView === 'operations') {
    return CONVERSATION_EVENT_KINDS.has(kind)
      || OPERATION_EVENT_KINDS.has(kind)
      || kind?.startsWith?.('authority_source_')
      || kind?.startsWith?.('authority_target_')
      || kind === 'item.started'
      || kind === 'item.completed'
      || kind === 'turn.started'
      || kind === 'turn.completed';
  }
  return DIAGNOSTIC_EVENT_KINDS.has(kind)
    || kind?.startsWith?.('provider_');
}

export function eventMatchesNarsFilters(event, filters = {}) {
  if (!filters || typeof filters !== 'object') return true;
  const eventKind = getNarsEventKind(event);
  if (filters.view !== undefined && !eventMatchesNarsView(event, filters.view)) return false;
  const kinds = Array.isArray(filters.event_kinds) ? filters.event_kinds : Array.isArray(filters.kinds) ? filters.kinds : null;
  if (kinds && !kinds.includes(eventKind)) return false;
  const families = Array.isArray(filters.families) ? filters.families : null;
  if (families?.length) {
    const family = String(eventKind ?? '').startsWith('session_') ? 'session' : 'turn';
    if (!families.includes(family)) return false;
  }
  if (filters.request_id && !eventMatchesNarsSelector(event, 'request_id', filters.request_id)) return false;
  if (filters.turn_id && !eventMatchesNarsSelector(event, 'turn_id', filters.turn_id)) return false;
  const anyOf = filters.any_of;
  if (anyOf && typeof anyOf === 'object' && !Array.isArray(anyOf)) {
    const selectors = ['request_id', 'turn_id', 'input_event_id', 'directive_id']
      .filter((field) => anyOf[field] !== undefined && anyOf[field] !== null && anyOf[field] !== '');
    if (selectors.length > 0 && !selectors.some((field) => eventMatchesNarsSelector(event, field, anyOf[field]))) return false;
  }
  return true;
}

function eventMatchesNarsSelector(event, field, expected) {
  const payload = event?.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
    ? event.payload
    : {};
  const values = field === 'input_event_id'
    ? [event?.input_event_id, event?.event_id, payload.input_event_id, payload.event_id]
    : [event?.[field], payload[field]];
  return values.some((value) => value !== undefined && value !== null && String(value) === String(expected));
}

export function readNarsEventLogPage({
  eventsPath,
  afterSequence = null,
  beforeSequence = null,
  sinceTimestamp = null,
  filters = {},
  view = NARS_SESSION_EVENT_DEFAULT_VIEW,
  limit = DEFAULT_LIMIT,
  direction = null,
} = {}) {
  const normalizedView = normalizeNarsSessionEventView(view);
  if (!normalizedView) throw new TypeError(`invalid_nars_session_event_view:${String(view)}`);
  const boundedLimit = boundedPositiveInteger(limit, DEFAULT_LIMIT, MAX_LIMIT);
  const requestedDirection = direction ?? (beforeSequence == null ? 'forward' : 'backward');
  const allEvents = readNarsEventLog(eventsPath);
  const effectiveSinceTimestamp = hasSequenceCursor(afterSequence) ? null : sinceTimestamp;
  const filtered = allEvents.events.filter((event) => eventInPageWindow(event, { afterSequence, beforeSequence, sinceTimestamp: effectiveSinceTimestamp }) && eventMatchesNarsFilters(event, { ...filters, view: normalizedView }));
  let events;
  let hasMore = false;
  if (requestedDirection === 'backward') {
    hasMore = filtered.length > boundedLimit;
    events = filtered.slice(Math.max(0, filtered.length - boundedLimit));
  } else {
    hasMore = filtered.length > boundedLimit;
    events = filtered.slice(0, boundedLimit);
  }
  const first = events.at(0) ?? null;
  const last = events.at(-1) ?? null;
  const lastSequence = allEvents.events.at(-1)?.event_sequence ?? allEvents.events.at(-1)?.sequence ?? null;
  return {
    schema: NARS_EVENTS_READ_SCHEMA,
    status: 'ok',
    source: 'events_jsonl',
    events_path: eventsPath ?? null,
    direction: requestedDirection,
    view: normalizedView,
    limit: boundedLimit,
    event_count: events.length,
    has_more: hasMore,
    first_sequence: first?.event_sequence ?? first?.sequence ?? null,
    last_sequence: last?.event_sequence ?? last?.sequence ?? null,
    cursor: {
      before_sequence: first?.event_sequence ?? first?.sequence ?? beforeSequence ?? null,
      after_sequence: last?.event_sequence ?? last?.sequence ?? afterSequence ?? null,
      last_sequence: lastSequence,
      next_sequence: Number.isFinite(Number(lastSequence)) ? Number(lastSequence) + 1 : 1,
    },
    corrupt_line_count: allEvents.corruptLineCount,
    events,
  };
}

export function readNarsEventLog(eventsPath) {
  if (!eventsPath || !existsSync(eventsPath)) return { events: [], corruptLineCount: 0 };
  const events = [];
  let corruptLineCount = 0;
  for (const line of readFileSync(eventsPath, 'utf8').split(/\r?\n/).filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      if (event && typeof event === 'object') events.push(event);
    } catch {
      corruptLineCount += 1;
    }
  }
  return { events, corruptLineCount };
}

export function readNarsEventLogTail(eventsPath, limit = MAX_LIMIT) {
  if (!eventsPath || !existsSync(eventsPath)) return { events: [], corruptLineCount: 0 };
  const boundedLimit = boundedPositiveInteger(limit, DEFAULT_LIMIT, MAX_LIMIT);
  const events = [];
  let corruptLineCount = 0;
  // Keep parsed event memory bounded while preserving the newest evidence needed by
  // readiness checks; do not retain every parsed event in the returned array.
  for (const match of readFileSync(eventsPath, 'utf8').matchAll(/[^\r\n]+/g)) {
    const line = match[0];
    try {
      const event = JSON.parse(line);
      if (event && typeof event === 'object' && boundedLimit > 0) {
        events.push(event);
        if (events.length > boundedLimit) events.shift();
      }
    } catch {
      corruptLineCount += 1;
    }
  }
  return { events, corruptLineCount };
}

function eventInPageWindow(event, { afterSequence, beforeSequence, sinceTimestamp }) {
  const sequence = Number(event?.event_sequence ?? event?.sequence ?? 0);
  const after = optionalInteger(afterSequence);
  const before = optionalInteger(beforeSequence);
  if (Number.isFinite(after) && sequence <= after) return false;
  if (Number.isFinite(before) && sequence >= before) return false;
  if (sinceTimestamp) {
    const sinceTime = Date.parse(String(sinceTimestamp));
    const eventTime = Date.parse(String(event?.timestamp ?? event?.generated_at ?? ''));
    if (Number.isFinite(sinceTime) && Number.isFinite(eventTime) && eventTime <= sinceTime) return false;
  }
  return true;
}

function hasSequenceCursor(value) {
  return Number.isFinite(optionalInteger(value));
}

function optionalInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  return Number.parseInt(String(value), 10);
}

function boundedPositiveInteger(value, defaultValue, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return defaultValue;
  return Math.min(parsed, max);
}
