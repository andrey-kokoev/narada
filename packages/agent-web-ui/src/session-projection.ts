import { projectRuntimeEvent, sequenceFromRuntimeMessage, shouldRenderRuntimeProjection, unwrapRuntimeEvent } from './runtime-events.ts';
import {
  IDLE_ACTIVITY,
  createTurnActivityState,
  createInitialHealthState,
  isRoutineHealthySessionHealth,
  materializeTurnActivity,
  reconcileTurnActivityWithHealth,
  reduceTurnActivity,
  reduceHealthState,
} from './session-projection-activity.ts';
import {
  joinAssistantMessageBoundary,
  mergeAssistantMessageBoundary,
  normalizeProjectedSummary,
  repairCollapsedAssistantBoundaries,
} from './session-projection-boundaries.ts';
import { agentIdentityGroupKey } from '@narada2/agent-identity';
import {
  createOperatorInputDeliveryState,
  materializeOperatorInputDelivery,
  reduceOperatorInputDelivery,
} from './operator-input-delivery.ts';
import { isRecord, type UnknownRecord } from './types.ts';
import type { RuntimeProjection } from './runtime-events.ts';

export type SessionProjectionOptions = {
  verbosity?: string;
  customView?: unknown;
  nowMs?: number;
  healthSnapshot?: unknown;
};

type ProjectionRow = {
  key: string;
  kind: string;
  label: string;
  tone: string;
  summary: unknown;
  event: unknown;
  renderKey?: string;
  streamContent?: string;
  disposition: string;
  [key: string]: unknown;
};

type RowProjectionState = {
  renderedByKey: Map<string, ProjectionRow>;
  order: string[];
};

type CustomProjectionView = {
  facets?: readonly string[];
};

export type SessionProjection = {
  rawEvents: unknown[];
  rows: unknown[];
  health: ReturnType<typeof createInitialHealthState>;
  activity: ReturnType<typeof materializeTurnActivity>;
  operatorDelivery: ReturnType<typeof materializeOperatorInputDelivery>;
  droppedStateSampleCount: number;
};

export function createSessionProjection(
  events: readonly unknown[] = [],
  options: SessionProjectionOptions = {},
): SessionProjection {
  const projection: SessionProjection = {
    rawEvents: [] as unknown[],
    rows: [] as unknown[],
    health: createInitialHealthState(),
    activity: { ...IDLE_ACTIVITY },
    operatorDelivery: materializeOperatorInputDelivery(createOperatorInputDeliveryState(), options.nowMs ?? Date.now()),
    droppedStateSampleCount: 0,
  };
  const rowState = createRowProjectionState();
  const activityState = createTurnActivityState();
  const operatorDeliveryState = createOperatorInputDeliveryState();
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
    reduceTurnActivity(activityState, message);
    reduceOperatorInputDelivery(operatorDeliveryState, message);
  }
  reconcileTurnActivityWithHealth(activityState, isRecord(options.healthSnapshot) ? options.healthSnapshot : null);
  projection.rows = materializedRows(rowState);
  projection.activity = materializeTurnActivity(activityState, options.nowMs ?? Date.now());
  projection.operatorDelivery = materializeOperatorInputDelivery(operatorDeliveryState, options.nowMs ?? Date.now());
  return projection;
}

function customViewIncludesDisposition(view: CustomProjectionView, disposition: string): boolean {
  const facet = facetForProjectionDisposition(disposition);
  return Boolean(facet && Array.isArray(view.facets) && view.facets.includes(facet));
}

function includesProjectionDisposition(verbosity: string | undefined, disposition: string): boolean {
  return verbosity?.toLowerCase() !== 'diagnostics' || disposition === 'diagnostic_signal';
}

function facetForProjectionDisposition(disposition: string): string | null {
  if (disposition === 'conversation_fact') return 'conversation';
  if (disposition === 'operation_fact') return 'operations';
  if (disposition === 'diagnostic_signal') return 'diagnostics';
  if (disposition === 'protocol_evidence') return 'protocol';
  if (disposition === 'raw_record') return 'raw';
  return null;
}

function supersededLifecycleAssistantAggregate(row: ProjectionRow, state: RowProjectionState): boolean {
  if (row.kind !== 'assistant_message') return false;
  const event = row.event;
  if (!isRecord(event)) return false;
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

function isProviderAssistantMessage(event: unknown): boolean {
  if (!isRecord(event)) return false;
  const providerEvent = event.event;
  return Boolean(isRecord(providerEvent) && providerEvent.type === 'item.completed' && isRecord(providerEvent.item) && providerEvent.item.type === 'agent_message');
}

export function classifyRuntimeMessage(message: unknown): string {
  const event = unwrapRuntimeEvent(message);
  if (!event || typeof event !== 'object') return 'raw_record';
  if (isRoutineHealthySessionHealth(event) || event.event === 'websocket_connected') return 'state_sample';
  if (event.event === 'session_health') return 'diagnostic_signal';
  if (event.event === 'runtime_intelligence_reconfiguration' || event.event === 'intelligence_runtime_reconfiguration_state_transition') return 'diagnostic_signal';
  if (event.event === 'web_ui_session_correlation_mismatch' || event.event === 'web_ui_input_ack_ignored' || event.event === 'web_ui_input_correlation_ambiguous' || event.event === 'operator_input_pending_restored' || event.event === 'operator_input_pending_expired' || event.event === 'operator_input_discarded' || event.event === 'operator_input_reviewed' || event.event === 'operator_input_retried' || event.event === 'operator_input_late_acknowledged') return 'diagnostic_signal';
  if (event.event === 'assistant_message' || event.event === 'assistant_message_stream' || event.event === 'user_message' || event.event === 'operator_input_submitted' || event.event === 'agent_web_ui_message' || event.event === 'agent_web_ui_help' || event.event === 'session_artifact_registered' || event.event === 'session_artifact_read') return 'conversation_fact';
  if (event.event === 'error' || event.event === 'websocket_error' || event.event === 'web_ui_decode_error' || event.event === 'web_ui_input_not_sent' || event.event === 'web_ui_input_ack_timeout' || event.event === 'web_ui_input_transport_failed' || event.event === 'operator_input_pending_restored' || event.event === 'operator_input_pending_expired' || event.event === 'operator_input_discarded' || event.event === 'turn_failed' || event.event === 'carrier_turn_failed' || event.event === 'carrier_turn_interrupted' || event.event === 'authority_session_revoked' || event.event === 'projection_revoked' || event.event === 'runtime_projection_failure' || event.event === 'runtime_control_input_bridge_error' || event.event === 'projection_input_failed') return 'diagnostic_signal';
  if (event.event === 'tool_call' || event.event === 'tool_result' || event.event === 'carrier_tool_requested' || event.event === 'carrier_tool_completed'
    || event.event === 'tool_execution_state_transition' || event.event === 'tool_execution_completed' || event.event === 'tool_execution_refused'
    || event.event === 'tool_admitted' || event.event === 'tool_refused' || event.event === 'turn_lifecycle_transition'
    || event.event === 'turn_started' || event.event === 'carrier_turn_started' || event.event === 'carrier_turn_completed' || event.event === 'turn_complete'
    || event.event === 'session_control_accepted' || event.event === 'session_control_response' || event.event === 'session_control_rejected' || event.event === 'runtime_request_state_transition'
    || event.event === 'conversation_enqueue_requested' || event.event === 'input_event_queued' || event.event === 'input_event_started' || event.event === 'input_event_completed'
    || event.event === 'input_queued_for_turn_boundary' || event.event === 'input_admitted_to_turn'
    || event.event === 'input_dropped_by_operator' || event.event === 'input_abandoned_on_session_end' || event.event === 'input_completed'
    || event.event === 'session_started' || event.event === 'session_closed' || event.event === 'session_status'
    || event.event === 'session_recovery' || event.event === 'session_operations' || event.event === 'session_sync'
    || event.event === 'observer_status' || event.event === 'observers_status' || event.event === 'carrier_command_result'
    || (typeof event.event === 'string' && (event.event.startsWith('authority_source_') || event.event.startsWith('authority_target_')))) return 'operation_fact';
  if (event.event === 'session_events_replay_completed') return 'diagnostic_signal';
  if (event.event === 'directive_received' || event.event === 'directive_receipt_recorded' || event.event === 'directive_carrier_accepted_recorded' || event.event === 'directive_complete' || event.event === 'session_events_subscription_started') return 'protocol_evidence';
  const providerEvent = event.event;
  if (isRecord(providerEvent)) {
    if (providerEvent.type === 'item.started' || providerEvent.type === 'item.completed' || providerEvent.type === 'turn.started' || providerEvent.type === 'turn.completed') return 'operation_fact';
    return 'protocol_evidence';
  }
  return 'raw_record';
}


function createRowProjectionState(): RowProjectionState {
  return { renderedByKey: new Map(), order: [] };
}

function projectMessageRow(message: unknown, options: SessionProjectionOptions, state: RowProjectionState): ProjectionRow | null {
  let projection = projectRuntimeEvent(message);
  const disposition = classifyRuntimeMessage(message);
  if (!includesProjectionDisposition(options.verbosity, disposition)) return null;
  if (!shouldRenderRuntimeProjection(projection, options)) return null;
  if (isRecord(options.customView) && !customViewIncludesDisposition(options.customView as CustomProjectionView, disposition)) return null;
  // Primary path: contract-provided render keys carry the identity contract.
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
    summary: normalizeProjectedSummary(String(projection.kind), projection.summary || projection.event),
    event: projection.event,
    renderKey: projection.renderKey,
    streamContent: projection.streamContent,
    disposition,
  };
  if (supersededLifecycleAssistantAggregate(row, state)) return null;
  pruneSupersededAssistantStreams(row, state);
  if (duplicateAssistantMessageKey(row, state)) return null;
  pruneSupersededOperatorEcho(row, state);
  if (duplicateOperatorMessageKey(row, state)) return null;
  const storedRow = mergeAssistantMessageBoundary(state.renderedByKey.get(key), row);
  state.renderedByKey.set(key, storedRow);
  if (!state.order.includes(key)) state.order.push(key);
  return storedRow;
}


function materializedRows(state: RowProjectionState): ProjectionRow[] {
  return state.order
    .map((key) => state.renderedByKey.get(key))
    .filter((row): row is ProjectionRow => row !== undefined);
}

function projectionIdentityKey(event: unknown, projection: RuntimeProjection): string | null {
  const projectedEvent = unwrapRuntimeEvent(event) ?? projection?.event;
  if (isRecord(projectedEvent)) {
    const requestId = projectedEvent.request_id;
    if (requestId && (projection.kind === 'operator_input_submitted' || projection.kind === 'user_message')) return `operator:${String(requestId)}`;
    if (requestId && (projection.kind === 'assistant_message' || projection.kind === 'assistant_message_stream')) return `assistant:${String(requestId)}`;
  }
  const sequence = sequenceFromRuntimeMessage(event);
  if (sequence !== null) return `sequence:${sequence}`;
  return null;
}

function duplicateAssistantMessageKey(row: ProjectionRow, state: RowProjectionState): string | null {
  // Compatibility fallback only: render keys should already dedupe the primary path.
  if (row.kind !== 'assistant_message') return null;
  const summary = normalizeAssistantText(row.summary);
  if (!summary) return null;
  const rowIdentity = assistantMessageIdentity(row.event);
  for (const [key, prior] of state.renderedByKey) {
    if (prior.kind !== 'assistant_message') continue;
    if (!sameAssistantScope(prior.event, row.event)) continue;
    const priorIdentity = assistantMessageIdentity(prior.event);
    if (rowIdentity || priorIdentity) {
      if (!rowIdentity || !priorIdentity || rowIdentity !== priorIdentity) continue;
    }
    if (normalizeAssistantText(prior.summary) === summary) return key;
  }
  return null;
}

function assistantMessageIdentity(event: unknown): string | null {
  if (!isRecord(event)) return null;
  const value = event.request_id ?? event.input_id ?? event.turn_id ?? event.event_id;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

function duplicateOperatorMessageKey(row: ProjectionRow, state: RowProjectionState): string | null {
  // Compatibility fallback only: render keys should already dedupe the primary path.
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

function pruneSupersededOperatorEcho(row: ProjectionRow, state: RowProjectionState): void {
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

function isOperatorMessageRow(row: ProjectionRow): boolean {
  return row?.kind === 'user_message' || row?.kind === 'operator_input_submitted';
}

function sameOperatorScope(a: unknown, b: unknown): boolean {
  const left = eventScope(a);
  const right = eventScope(b);
  if (!left.sessionId || !right.sessionId) return true;
  return left.sessionId === right.sessionId;
}

function pruneSupersededAssistantStreams(finalRow: ProjectionRow, state: RowProjectionState): void {
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


function sameAssistantScope(a: unknown, b: unknown): boolean {
  const left = eventScope(a);
  const right = eventScope(b);
  if (!left.agentId && !left.sessionId && !right.agentId && !right.sessionId) return true;
  return left.agentId === right.agentId && left.sessionId === right.sessionId;
}

type ProjectionScope = { agentId: string | null; sessionId: string | null };

function eventScope(value: unknown): ProjectionScope {
  if (!isRecord(value)) return { agentId: null, sessionId: null };
  const agentId = value.agent_id ?? value.agentId;
  const siteId = value.site_id ?? value.siteId;
  const sessionId = value.session_id ?? value.sessionId;
  return {
    agentId: agentIdentityGroupKey(value.agent_identity_ref, typeof agentId === 'string' ? agentId : null, typeof siteId === 'string' ? siteId : null),
    sessionId: typeof sessionId === 'string' ? sessionId : null,
  };
}

function agentLabel(event: UnknownRecord, suffix: string): string {
  const agentId = agentIdentityGroupKey(event?.agent_identity_ref, event?.agent_id ?? event?.agentId ?? null, event?.site_id ?? event?.siteId ?? null);
  return `${agentId} ${suffix}`;
}

function providerDetail(event: UnknownRecord): string | null {
  const provider = typeof event.provider === 'string' && event.provider ? event.provider : null;
  return provider ? `waiting on ${provider}` : null;
}

function terminalDetail(event: UnknownRecord): string | null {
  return typeof event.terminal_state === 'string' ? event.terminal_state : null;
}

function toolDetail(item: UnknownRecord): string | null {
  const name = [item.server, item.tool].filter((value) => typeof value === 'string' && value).join('.');
  return name || null;
}

function objectField(record: unknown, field: string): UnknownRecord | null {
  if (!isRecord(record)) return null;
  const value = record[field];
  return isRecord(value) ? value : null;
}

function timestampFromEvent(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const timestamp = value.timestamp;
  if (typeof timestamp !== 'string') return null;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAssistantText(value: unknown): string {
  return String(value ?? '').trim().replace(/\r\n/g, '\n');
}

function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((part) => summarizeValue(part)).join('\n');
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}
