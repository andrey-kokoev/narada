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
      };
    }
    return;
  }

  const providerEvent = event.event;
  if (isRecord(providerEvent)) {
    reduceProviderToolEvent(state, providerEvent);
    return;
  }

  if (event.event === 'tool_call') {
    recordTopLevelToolCall(state, event);
    return;
  }
  if (event.event === 'tool_result') {
    recordTopLevelToolResult(state, event);
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

function reduceProviderToolEvent(state: TurnSummaryState, providerEvent: UnknownRecord): void {
  if (!state.activeTurn) return;
  if (providerEvent.type === 'item.started') {
    const item = objectField(providerEvent, 'item');
    if (item?.type === 'mcp_tool_call') {
      const name = toolDetail(item);
      if (name) {
        state.activeTurn.toolCallCount += 1;
        state.activeTurn.toolNames.push(name);
      }
    }
    return;
  }
  if (providerEvent.type === 'item.completed') {
    const item = objectField(providerEvent, 'item');
    if (item?.type === 'mcp_tool_call') {
      const name = toolDetail(item);
      if (name) {
        state.activeTurn.toolResultCount += 1;
        if (toolResultFailed(item)) {
          state.activeTurn.toolFailureCount += 1;
        }
      }
    }
  }
}

function recordTopLevelToolCall(state: TurnSummaryState, event: UnknownRecord): void {
  if (!state.activeTurn) return;
  const name = topLevelToolName(event);
  if (!name) return;
  state.activeTurn.toolCallCount += 1;
  state.activeTurn.toolNames.push(name);
}

function recordTopLevelToolResult(state: TurnSummaryState, event: UnknownRecord): void {
  if (!state.activeTurn) return;
  const name = topLevelToolName(event);
  if (!name) return;
  state.activeTurn.toolResultCount += 1;
  if (topLevelToolFailed(event)) {
    state.activeTurn.toolFailureCount += 1;
  }
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
  const direct = event.tool_name ?? event.tool;
  if (typeof direct === 'string' && direct) return direct;
  const server = typeof event.server === 'string' && event.server ? event.server : null;
  const tool = typeof event.tool === 'string' && event.tool ? event.tool : null;
  return [server, tool].filter(Boolean).join('.') || null;
}

function topLevelToolFailed(event: UnknownRecord): boolean {
  if (event.error) return true;
  const status = typeof event.status === 'string' ? event.status.toLowerCase() : '';
  return status === 'failed' || status === 'error';
}

function toolDetail(item: UnknownRecord): string | null {
  const name = [item.server, item.tool].filter((value: unknown) => typeof value === 'string' && value).join('.');
  return name || null;
}

function toolResultFailed(item: UnknownRecord): boolean {
  if (item.error) return true;
  const status = typeof item.status === 'string' ? item.status.toLowerCase() : '';
  return status === 'failed' || status === 'error';
}

function objectField(record: UnknownRecord, field: string): UnknownRecord | null {
  const value = record[field];
  return isRecord(value) ? value : null;
}

function timestampFromEvent(event: UnknownRecord | null): number | null {
  if (!event) return null;
  const timestamp = event.timestamp;
  if (typeof timestamp !== 'string') return null;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}
