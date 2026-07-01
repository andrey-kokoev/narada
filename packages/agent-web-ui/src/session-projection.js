import { projectRuntimeEvent, sequenceFromRuntimeMessage, shouldRenderRuntimeProjection, unwrapRuntimeEvent } from './runtime-events.js';

export const IDLE_ACTIVITY = Object.freeze({
  active: false,
  state: 'idle',
  label: 'Idle',
  detail: null,
  elapsedSeconds: 0,
  startedAtMs: null,
});

export function createSessionProjection(events = [], options = {}) {
  const projection = {
    rawEvents: [],
    rows: [],
    health: createInitialHealthState(),
    activity: { ...IDLE_ACTIVITY },
    droppedStateSampleCount: 0,
  };
  const rowState = createRowProjectionState();
  const activityState = createActivityAccumulator();
  for (const message of events) {
    projection.rawEvents.push(message);
    reduceHealthState(projection.health, message);
    const disposition = classifyRuntimeMessage(message);
    if (disposition === 'state_sample') {
      projection.droppedStateSampleCount += 1;
    } else {
      const row = projectMessageRow(message, options, rowState);
      if (row) projection.rows = materializedRows(rowState);
    }
    applyActivityEvent(activityState, message);
  }
  projection.rows = materializedRows(rowState);
  projection.activity = materializeActivity(activityState, options.nowMs ?? Date.now());
  return projection;
}

function supersededLifecycleAssistantAggregate(row, state) {
  if (row.kind !== 'assistant_message') return false;
  const event = row.event;
  if (!event || typeof event !== 'object') return false;
  if (event.lifecycle_event !== 'assistant_message' || !event.turn_id) return false;
  const summary = normalizeAssistantText(row.summary);
  if (!summary) return false;
  let coveredPriorRows = 0;
  for (const prior of state.renderedByKey.values()) {
    if (prior.kind !== 'assistant_message') continue;
    if (!sameAssistantScope(prior.event, event)) continue;
    if (!isProviderAssistantMessage(prior.event)) continue;
    const priorSummary = normalizeAssistantText(prior.summary);
    if (priorSummary && summary.includes(priorSummary)) coveredPriorRows += 1;
  }
  return coveredPriorRows > 0;
}

function isProviderAssistantMessage(event) {
  const providerEvent = event?.event;
  return Boolean(providerEvent && typeof providerEvent === 'object' && providerEvent.type === 'item.completed' && providerEvent.item?.type === 'agent_message');
}

export function classifyRuntimeMessage(message) {
  const event = unwrapRuntimeEvent(message);
  if (!event || typeof event !== 'object') return 'raw_record';
  if (isRoutineHealthySessionHealth(event) || event.event === 'websocket_connected') return 'state_sample';
  if (event.event === 'session_health') return 'diagnostic_signal';
  if (event.event === 'assistant_message' || event.event === 'assistant_message_stream' || event.event === 'user_message' || event.event === 'operator_input_submitted' || event.event === 'agent_web_ui_message' || event.event === 'agent_web_ui_help') return 'conversation_fact';
  if (event.event === 'error' || event.event === 'websocket_error' || event.event === 'web_ui_decode_error' || event.event === 'web_ui_input_not_sent' || event.event === 'turn_failed') return 'diagnostic_signal';
  if (event.event === 'tool_call' || event.event === 'tool_result' || event.event === 'turn_started' || event.event === 'turn_complete') return 'operation_fact';
  if (event.event === 'directive_received' || event.event === 'directive_receipt_recorded' || event.event === 'directive_carrier_accepted_recorded' || event.event === 'directive_complete' || event.event === 'session_events_subscription_started') return 'protocol_evidence';
  const providerEvent = event.event;
  if (providerEvent && typeof providerEvent === 'object') {
    if (providerEvent.type === 'item.started' || providerEvent.type === 'item.completed' || providerEvent.type === 'turn.started' || providerEvent.type === 'turn.completed') return 'operation_fact';
    return 'protocol_evidence';
  }
  return 'raw_record';
}

export function isRoutineHealthySessionHealth(event) {
  if (!event || event.event !== 'session_health') return false;
  const status = String(event.status ?? '').toLowerCase();
  const mcpState = String(event.mcp?.operational_state ?? event.mcp_operational_state ?? '').toLowerCase();
  const startupFailures = Number(event.mcp_startup_failure_count ?? event.mcp?.startup_failure_count ?? 0);
  const runtimeFaults = Number(event.mcp_runtime_fault_count ?? event.mcp?.runtime_fault_count ?? 0);
  return status === 'healthy' && (mcpState === '' || mcpState === 'healthy') && startupFailures === 0 && runtimeFaults === 0;
}

function createInitialHealthState() {
  return {
    status: 'unknown',
    text: 'health unknown',
    agentId: null,
    sessionId: null,
    lastSeenAt: null,
    healthySampleCount: 0,
    degradedSampleCount: 0,
    lastEvent: null,
  };
}

function reduceHealthState(state, message) {
  const event = unwrapRuntimeEvent(message);
  if (!event || typeof event !== 'object' || event.event !== 'session_health') return;
  const status = String(event.status ?? 'unknown');
  state.status = status;
  state.agentId = event.agent_id ?? state.agentId;
  state.sessionId = event.session_id ?? state.sessionId;
  state.lastSeenAt = event.timestamp ?? new Date().toISOString();
  state.lastEvent = event;
  state.text = `${status} · ${state.agentId ?? 'agent'} · ${state.sessionId ?? 'session'}`;
  if (isRoutineHealthySessionHealth(event)) state.healthySampleCount += 1;
  else state.degradedSampleCount += 1;
}

function createRowProjectionState() {
  return { renderedByKey: new Map(), order: [] };
}

function projectMessageRow(message, options, state) {
  let projection = projectRuntimeEvent(message);
  if (!shouldRenderRuntimeProjection(projection, options)) return null;
  const key = projection.renderKey ?? projectionIdentityKey(message, projection) ?? `event:${state.renderedByKey.size}`;
  if (projection.kind === 'assistant_message_stream') {
    const previous = state.renderedByKey.get(key)?.streamContent ?? '';
    const streamContent = `${previous}${summarizeValue(projection.summary)}`;
    projection = { ...projection, summary: streamContent, streamContent };
  }
  const row = {
    key,
    kind: String(projection.kind),
    label: String(projection.label),
    tone: String(projection.tone),
    summary: summarizeValue(projection.summary || projection.event),
    event: projection.event,
    renderKey: projection.renderKey,
    streamContent: projection.streamContent,
    disposition: classifyRuntimeMessage(message),
  };
  if (supersededLifecycleAssistantAggregate(row, state)) return null;
  pruneSupersededAssistantStreams(row, state);
  if (duplicateAssistantMessageKey(row, state)) return null;
  pruneSupersededOperatorEcho(row, state);
  if (duplicateOperatorMessageKey(row, state)) return null;
  state.renderedByKey.set(key, row);
  if (!state.order.includes(key)) state.order.push(key);
  return row;
}

function materializedRows(state) {
  return state.order.map((key) => state.renderedByKey.get(key)).filter(Boolean);
}

function projectionIdentityKey(event, projection) {
  const projectedEvent = unwrapRuntimeEvent(event) ?? projection?.event;
  if (projectedEvent && typeof projectedEvent === 'object') {
    const requestId = projectedEvent.request_id;
    if (requestId && (projection.kind === 'operator_input_submitted' || projection.kind === 'user_message')) return `operator:${String(requestId)}`;
    if (requestId && (projection.kind === 'assistant_message' || projection.kind === 'assistant_message_stream')) return `assistant:${String(requestId)}`;
  }
  const sequence = sequenceFromRuntimeMessage(event);
  if (sequence !== null) return `sequence:${sequence}`;
  return null;
}

function duplicateAssistantMessageKey(row, state) {
  if (row.kind !== 'assistant_message') return null;
  const summary = normalizeAssistantText(row.summary);
  if (!summary) return null;
  for (const [key, prior] of state.renderedByKey) {
    if (prior.kind !== 'assistant_message') continue;
    if (!sameAssistantScope(prior.event, row.event)) continue;
    if (normalizeAssistantText(prior.summary) === summary) return key;
  }
  return null;
}

function duplicateOperatorMessageKey(row, state) {
  if (!isOperatorMessageRow(row)) return null;
  const summary = normalizeAssistantText(row.summary);
  if (!summary) return null;
  for (const [key, prior] of state.renderedByKey) {
    if (!isOperatorMessageRow(prior)) continue;
    if (!sameOperatorScope(prior.event, row.event)) continue;
    if (normalizeAssistantText(prior.summary) === summary) return key;
  }
  return null;
}

function pruneSupersededOperatorEcho(row, state) {
  if (row.kind !== 'user_message') return;
  const summary = normalizeAssistantText(row.summary);
  if (!summary) return;
  for (const [key, prior] of state.renderedByKey) {
    if (prior.kind !== 'operator_input_submitted') continue;
    if (!sameOperatorScope(prior.event, row.event)) continue;
    if (normalizeAssistantText(prior.summary) !== summary) continue;
    state.renderedByKey.delete(key);
    const index = state.order.indexOf(key);
    if (index >= 0) state.order.splice(index, 1);
  }
}

function isOperatorMessageRow(row) {
  return row?.kind === 'user_message' || row?.kind === 'operator_input_submitted';
}

function sameOperatorScope(a, b) {
  const left = eventScope(a);
  const right = eventScope(b);
  if (!left.sessionId || !right.sessionId) return true;
  return left.sessionId === right.sessionId;
}

function pruneSupersededAssistantStreams(finalRow, state) {
  if (finalRow.kind !== 'assistant_message') return;
  for (const [key, prior] of state.renderedByKey) {
    if (prior.kind !== 'assistant_message_stream' && prior.kind !== 'assistant_message') continue;
    if (key === finalRow.key) continue;
    if (!sameAssistantScope(prior.event, finalRow.event)) continue;
    const priorSummary = normalizeAssistantText(prior.summary);
    const finalSummary = normalizeAssistantText(finalRow.summary);
    if (!priorSummary || priorSummary === finalSummary) continue;
    if (!finalSummary.includes(priorSummary)) continue;
    state.renderedByKey.delete(key);
    const index = state.order.indexOf(key);
    if (index >= 0) state.order.splice(index, 1);
  }
}

function createActivityAccumulator() {
  return {
    state: 'idle',
    startedAtMs: null,
    label: 'Idle',
    detail: null,
    activeTurnId: null,
    activeToolIds: new Set(),
  };
}

function applyActivityEvent(state, message) {
  const event = unwrapRuntimeEvent(message);
  const timestampMs = timestampFromEvent(event) ?? timestampFromEvent(message) ?? state.startedAtMs ?? Date.now();
  if (!event || typeof event !== 'object') return state;
  if (event.event === 'operator_input_submitted') return startActivity(state, 'queued', timestampMs, 'Waiting for agent...', null);
  if (event.event === 'directive_received' || event.event === 'directive_carrier_accepted_recorded') return startActivity(state, 'queued', timestampMs, 'Waiting for agent...', 'directive accepted');
  if (event.event === 'turn_started') return Object.assign(startActivity(state, 'thinking', timestampMs, agentLabel(event, 'is thinking...'), providerDetail(event)), { activeTurnId: event.turn_id ?? true });
  if (event.event === 'assistant_message_stream') return startActivity(state, 'streaming', timestampMs, agentLabel(event, 'is responding...'), null);
  if (event.event === 'assistant_message' || event.event === 'turn_complete' || event.event === 'directive_complete' || event.event === 'session_closed') return clearActivity(state, event);
  if (event.event === 'turn_failed') return startActivity(state, 'failed', timestampMs, 'Turn failed', terminalDetail(event));
  const providerEvent = event.event;
  if (providerEvent && typeof providerEvent === 'object') return applyProviderActivityEvent(state, providerEvent, event, timestampMs);
  return state;
}

function applyProviderActivityEvent(state, providerEvent, envelope, timestampMs) {
  if (providerEvent.type === 'turn.started' || providerEvent.type === 'thread.started') return startActivity(state, 'thinking', timestampMs, agentLabel(envelope, 'is thinking...'), providerDetail(envelope));
  if (providerEvent.type === 'turn.completed') return clearActivity(state, envelope);
  if (providerEvent.type === 'item.started') {
    const item = objectField(providerEvent, 'item');
    if (item?.type === 'mcp_tool_call') {
      if (item.id) state.activeToolIds.add(String(item.id));
      return startActivity(state, 'tool', timestampMs, 'Using tool...', toolDetail(item));
    }
    if (item?.type === 'agent_message') return startActivity(state, 'streaming', timestampMs, agentLabel(envelope, 'is responding...'), null);
  }
  if (providerEvent.type === 'item.completed') {
    const item = objectField(providerEvent, 'item');
    if (item?.type === 'agent_message') return clearActivity(state, envelope);
    if (item?.type === 'mcp_tool_call') {
      if (item.id) state.activeToolIds.delete(String(item.id));
      if (state.activeToolIds.size === 0) return startActivity(state, 'thinking', timestampMs, agentLabel(envelope, 'is thinking...'), providerDetail(envelope));
    }
  }
  return state;
}

function startActivity(state, nextState, timestampMs, label, detail) {
  state.state = nextState;
  state.startedAtMs ??= timestampMs;
  state.label = label;
  state.detail = detail;
  return state;
}

function clearActivity(state, event) {
  if (event.turn_id && state.activeTurnId && event.turn_id !== state.activeTurnId) return state;
  state.state = 'idle';
  state.startedAtMs = null;
  state.label = 'Idle';
  state.detail = null;
  state.activeTurnId = null;
  state.activeToolIds.clear();
  return state;
}

function materializeActivity(state, nowMs) {
  if (state.state === 'idle' || !state.startedAtMs) return { ...IDLE_ACTIVITY };
  return {
    active: true,
    state: state.state,
    label: state.label,
    detail: state.detail,
    startedAtMs: state.startedAtMs,
    elapsedSeconds: Math.max(0, Math.floor((nowMs - state.startedAtMs) / 1000)),
  };
}

function sameAssistantScope(a, b) {
  const left = eventScope(a);
  const right = eventScope(b);
  if (!left.agentId && !left.sessionId && !right.agentId && !right.sessionId) return true;
  return left.agentId === right.agentId && left.sessionId === right.sessionId;
}

function eventScope(value) {
  if (!value || typeof value !== 'object') return { agentId: null, sessionId: null };
  return {
    agentId: value.agent_id ?? value.agentId ?? null,
    sessionId: value.session_id ?? value.sessionId ?? null,
  };
}

function agentLabel(event, suffix) {
  const agentId = typeof event.agent_id === 'string' && event.agent_id ? event.agent_id : 'Agent';
  return `${agentId} ${suffix}`;
}

function providerDetail(event) {
  const provider = typeof event.provider === 'string' && event.provider ? event.provider : null;
  return provider ? `waiting on ${provider}` : null;
}

function terminalDetail(event) {
  return typeof event.terminal_state === 'string' ? event.terminal_state : null;
}

function toolDetail(item) {
  const name = [item.server, item.tool].filter((value) => typeof value === 'string' && value).join('.');
  return name || null;
}

function objectField(record, field) {
  const value = record[field];
  return value && typeof value === 'object' ? value : null;
}

function timestampFromEvent(value) {
  if (!value || typeof value !== 'object') return null;
  const timestamp = value.timestamp;
  if (typeof timestamp !== 'string') return null;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAssistantText(value) {
  return String(value ?? '').trim().replace(/\r\n/g, '\n');
}

function summarizeValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}
