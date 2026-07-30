import { unwrapRuntimeEvent } from './runtime-events.ts';
import { isRecord, type UnknownRecord } from './types.ts';

export const TURN_SUMMARY_ROW_KIND = 'turn_summary';

export type TurnSummary = {
  turnId: string;
  requestId: string | null;
  startedAtMs: number | null;
  completedAtMs: number | null;
  durationSeconds: number | null;
  toolCallCount: number;
  toolResultCount: number;
  toolFailureCount: number;
  uniqueToolNames: string[];
};

type ActiveTurn = {
  turnId: string;
  requestId: string | null;
  startedAtMs: number | null;
  toolCallCount: number;
  toolResultCount: number;
  toolFailureCount: number;
  toolNames: string[];
  toolInvocations: ToolInvocation[];
};

type ToolResultSource = 'provider' | 'carrier' | 'execution' | 'generic';

type ToolInvocation = {
  name: string | null;
  identities: Set<string>;
  called: boolean;
  resultObserved: boolean;
  failed: boolean;
  resultSources: Set<ToolResultSource>;
};

export type TurnSummaryState = {
  activeTurn: ActiveTurn | null;
};

export function createTurnSummaryState(): TurnSummaryState {
  return { activeTurn: null };
}

export function reduceTurnSummaryState(state: TurnSummaryState, message: unknown): void {
  const event = unwrapRuntimeEvent(message);
  if (!event || typeof event !== 'object') return;
  const timestampMs = timestampFromEvent(event);

  if (event.event === 'turn_started' || event.event === 'carrier_turn_started') {
    const turnId = eventTurnId(event);
    if (turnId) {
      state.activeTurn = {
        turnId,
        requestId: eventRequestId(event),
        startedAtMs: timestampMs,
        toolCallCount: 0,
        toolResultCount: 0,
        toolFailureCount: 0,
        toolNames: [],
        toolInvocations: [],
      };
    }
    return;
  }

  for (const providerEvent of providerToolEvents(event)) {
    reduceProviderToolEvent(state, providerEvent);
  }

  if (event.event === 'tool_call' || event.event === 'carrier_tool_requested') {
    recordTopLevelToolCall(state, event);
    return;
  }
  if (event.event === 'tool_result') {
    recordTopLevelToolResult(state, event, 'generic');
    return;
  }
  if (event.event === 'carrier_tool_completed') {
    recordTopLevelToolResult(state, event, 'carrier');
    return;
  }
  if (event.event === 'tool_execution_completed'
    || event.event === 'tool_execution_refused'
    || event.event === 'tool_refused') {
    recordTopLevelToolResult(state, event, 'execution');
  }
}

export function materializeTurnSummary(
  state: TurnSummaryState,
  terminalEvent: UnknownRecord,
): TurnSummary | null {
  if (!state.activeTurn) return null;
  const completedAtMs = timestampFromEvent(terminalEvent) ?? Date.now();
  const durationSeconds = state.activeTurn.startedAtMs !== null
    ? Math.max(0, Math.round((completedAtMs - state.activeTurn.startedAtMs) / 1000))
    : null;
  return {
    turnId: state.activeTurn.turnId,
    requestId: state.activeTurn.requestId,
    startedAtMs: state.activeTurn.startedAtMs,
    completedAtMs,
    durationSeconds,
    toolCallCount: state.activeTurn.toolCallCount,
    toolResultCount: state.activeTurn.toolResultCount,
    toolFailureCount: state.activeTurn.toolFailureCount,
    uniqueToolNames: Array.from(new Set(state.activeTurn.toolNames)),
  };
}

export function clearTurnSummaryState(state: TurnSummaryState): void {
  state.activeTurn = null;
}

export function isTurnTerminalEvent(message: unknown): boolean {
  const event = unwrapRuntimeEvent(message);
  if (!event || typeof event !== 'object') return false;
  return event.event === 'turn_complete'
    || event.event === 'carrier_turn_completed'
    || event.event === 'input_event_completed'
    || event.event === 'input_completed'
    || event.event === 'turn_failed'
    || event.event === 'carrier_turn_failed'
    || event.event === 'turn_interrupted'
    || event.event === 'carrier_turn_interrupted';
}

function providerToolEvents(event: UnknownRecord): UnknownRecord[] {
  const providerEvents: UnknownRecord[] = [];
  const directEvent = event.event;
  if (isRecord(directEvent)) providerEvents.push(directEvent);
  const sourceEvent = objectField(event, 'source_event');
  if (sourceEvent) {
    const nestedEvent = objectField(sourceEvent, 'event');
    providerEvents.push(nestedEvent ?? sourceEvent);
  }
  return providerEvents;
}

function reduceProviderToolEvent(state: TurnSummaryState, providerEvent: UnknownRecord): void {
  if (!state.activeTurn) return;
  if (providerEvent.type === 'item.started') {
    const item = objectField(providerEvent, 'item');
    if (item?.type === 'mcp_tool_call') {
      recordToolCall(state, toolDetail(item), toolIdentity(item));
    }
    return;
  }
  if (providerEvent.type === 'item.completed') {
    const item = objectField(providerEvent, 'item');
    if (item?.type === 'mcp_tool_call') {
      recordToolResult(state, toolDetail(item), toolIdentity(item), 'provider', toolResultFailed(item));
    }
  }
}

function recordTopLevelToolCall(state: TurnSummaryState, event: UnknownRecord): void {
  recordToolCall(state, topLevelToolName(event), toolIdentity(event));
}

function recordTopLevelToolResult(
  state: TurnSummaryState,
  event: UnknownRecord,
  source: ToolResultSource,
): void {
  recordToolResult(state, topLevelToolName(event), toolIdentity(event), source, topLevelToolFailed(event));
}

function recordToolCall(state: TurnSummaryState, name: string | null, identity: string | null): void {
  const activeTurn = state.activeTurn;
  if (!activeTurn) return;
  const invocation = identity
    ? activeTurn.toolInvocations.find((candidate) => candidate.identities.has(identity))
    : null;
  if (invocation) {
    addInvocationIdentity(invocation, identity);
    setInvocationName(invocation, name);
    if (invocation.called) return;
    invocation.called = true;
    activeTurn.toolCallCount += 1;
    appendToolName(activeTurn, name);
    return;
  }

  const created = createToolInvocation(name, identity);
  created.called = true;
  activeTurn.toolInvocations.push(created);
  activeTurn.toolCallCount += 1;
  appendToolName(activeTurn, name);
}

function recordToolResult(
  state: TurnSummaryState,
  name: string | null,
  identity: string | null,
  source: ToolResultSource,
  failed: boolean,
): void {
  const activeTurn = state.activeTurn;
  if (!activeTurn) return;

  let invocation = identity
    ? activeTurn.toolInvocations.find((candidate) => candidate.identities.has(identity)) ?? null
    : null;
  if (!invocation && name) {
    invocation = activeTurn.toolInvocations.find((candidate) => candidate.name === name && !candidate.resultObserved) ?? null;
  }
  if (!invocation && name && isDuplicateResult(activeTurn, name, source)) return;

  if (!invocation) {
    invocation = createToolInvocation(name, identity);
    invocation.called = true;
    activeTurn.toolInvocations.push(invocation);
    activeTurn.toolCallCount += 1;
    appendToolName(activeTurn, name);
  } else {
    addInvocationIdentity(invocation, identity);
    setInvocationName(invocation, name);
  }

  if (!invocation.resultObserved) {
    invocation.resultObserved = true;
    invocation.resultSources.add(source);
    activeTurn.toolResultCount += 1;
  }
  if (failed && !invocation.failed) {
    invocation.failed = true;
    activeTurn.toolFailureCount += 1;
  }
}

function createToolInvocation(name: string | null, identity: string | null): ToolInvocation {
  const identities = new Set<string>();
  addIdentity(identities, identity);
  return {
    name,
    identities,
    called: false,
    resultObserved: false,
    failed: false,
    resultSources: new Set<ToolResultSource>(),
  };
}

function addInvocationIdentity(invocation: ToolInvocation, identity: string | null): void {
  addIdentity(invocation.identities, identity);
}

function addIdentity(identities: Set<string>, identity: string | null): void {
  if (identity) identities.add(identity);
}

function setInvocationName(invocation: ToolInvocation, name: string | null): void {
  if (!invocation.name && name) invocation.name = name;
}

function appendToolName(activeTurn: ActiveTurn, name: string | null): void {
  if (name) activeTurn.toolNames.push(name);
}

function isDuplicateResult(activeTurn: ActiveTurn, name: string, source: ToolResultSource): boolean {
  const equivalentSources: ToolResultSource[] = source === 'carrier'
    ? ['execution', 'provider']
    : source === 'execution'
      ? ['carrier', 'provider']
      : source === 'provider'
        ? ['carrier', 'execution']
        : ['generic'];
  return activeTurn.toolInvocations.some((invocation) => invocation.name === name
    && invocation.resultObserved
    && (invocation.resultSources.has(source)
      || equivalentSources.some((equivalentSource) => invocation.resultSources.has(equivalentSource))));
}

function eventTurnId(event: UnknownRecord): string | null {
  const value = event.turn_id ?? event.input_event_id ?? event.event_id;
  return typeof value === 'string' && value ? value : null;
}

function eventRequestId(event: UnknownRecord): string | null {
  const value = event.request_id ?? event.requestId;
  return typeof value === 'string' && value ? value : null;
}

function topLevelToolName(event: UnknownRecord): string | null {
  return toolNameFromRecord(event);
}

function toolNameFromRecord(record: UnknownRecord): string | null {
  const directToolName = stringField(record, 'tool_name');
  if (directToolName) return directToolName;
  const server = stringField(record, 'server') ?? stringField(record, 'server_name');
  const tool = stringField(record, 'tool');
  if (tool) return [server, tool].filter(Boolean).join('.') || tool;
  const namedTool = stringField(record, 'name');
  return [server, namedTool].filter(Boolean).join('.') || null;
}

function toolIdentity(record: UnknownRecord): string | null {
  const value = record.execution_id
    ?? record.tool_call_id
    ?? record.tool_id
    ?? record.call_id
    ?? record.id;
  if (typeof value === 'string' && value) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function topLevelToolFailed(event: UnknownRecord): boolean {
  if (event.error) return true;
  return isFailedToolStatus(event.status ?? event.execution_state ?? event.terminal_state);
}

function toolDetail(item: UnknownRecord): string | null {
  return toolNameFromRecord(item);
}

function toolResultFailed(item: UnknownRecord): boolean {
  if (item.error) return true;
  return isFailedToolStatus(item.status);
}

function isFailedToolStatus(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return ['blocked', 'cancelled', 'denied', 'error', 'failed', 'interrupted', 'refused'].includes(value.toLowerCase());
}

function objectField(record: UnknownRecord, field: string): UnknownRecord | null {
  const value = record[field];
  return isRecord(value) ? value : null;
}

function stringField(record: UnknownRecord, field: string): string | null {
  const value = record[field];
  return typeof value === 'string' && value ? value : null;
}

function timestampFromEvent(event: UnknownRecord | null): number | null {
  if (!event) return null;
  const timestamp = event.timestamp;
  if (typeof timestamp !== 'string') return null;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}
