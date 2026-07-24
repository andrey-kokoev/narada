import { unwrapRuntimeEvent } from './runtime-events.ts';
import { agentIdentityDisplay } from '@narada2/agent-identity';
import { isRecord, type UnknownRecord } from './types.ts';

export const TURN_ACTIVITY_PHASES = Object.freeze({
  IDLE: 'idle',
  QUEUED: 'queued',
  THINKING: 'thinking',
  TOOL: 'tool',
  STREAMING: 'streaming',
  FAILED: 'failed',
});

export const IDLE_ACTIVITY = Object.freeze({
  active: false,
  state: TURN_ACTIVITY_PHASES.IDLE,
  label: 'Idle',
  detail: null,
  elapsedSeconds: 0,
  startedAtMs: null,
  activeTurnId: null,
});

export type ActivitySnapshot = {
  active: boolean;
  state: 'idle' | 'queued' | 'thinking' | 'tool' | 'streaming' | 'failed';
  label: string;
  detail: string | null;
  elapsedSeconds: number;
  startedAtMs: number | null;
  activeTurnId: string | boolean | null;
};

type HealthState = {
  status: string;
  text: string;
  agentId: string | null;
  sessionId: string | null;
  lastSeenAt: string | null;
  healthySampleCount: number;
  degradedSampleCount: number;
  lastEvent: UnknownRecord | null;
};

type TurnActivityState = {
  state: ActivitySnapshot['state'];
  startedAtMs: number | null;
  label: string;
  detail: string | null;
  activeTurnId: string | boolean | null;
  activeRequestId: string | null;
  lastTerminalTurnId: string | null;
  lastTerminalRequestId: string | null;
  activeToolIds: Set<string>;
  toolCallCount: number;
  toolResultCount: number;
  toolFailureCount: number;
  latestToolName: string | null;
};

export const ACTIVE_TURN_HEALTH_STATES = Object.freeze([
  'running',
  'accepted',
  'contextualized',
  'evaluating',
  'tool_requested',
  'tool_admitted',
  'executing',
  'reconciling',
]);

const TOOL_TURN_HEALTH_STATES = new Set(['tool_requested', 'tool_admitted', 'executing']);

export function createInitialHealthState(): HealthState {
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

function eventRequestId(event: UnknownRecord): string | null {
  const requestId = event?.request_id ?? event?.requestId;
  return typeof requestId === 'string' && requestId ? requestId : null;
}

export function reduceHealthState(state: HealthState, message: unknown): void {
  const event = unwrapRuntimeEvent(message);
  if (!event || typeof event !== 'object' || event.event !== 'session_health') return;
  const status = String(event.status ?? 'unknown');
  state.status = status;
  state.agentId = eventAgentDisplay(event) ?? state.agentId;
  state.sessionId = typeof event.session_id === 'string' ? event.session_id : state.sessionId;
  state.lastSeenAt = typeof event.timestamp === 'string' ? event.timestamp : new Date().toISOString();
  state.lastEvent = event;
  state.text = `${status} · ${state.agentId ?? 'agent'} · ${state.sessionId ?? 'session'}`;
  if (isRoutineHealthySessionHealth(event)) state.healthySampleCount += 1;
  else state.degradedSampleCount += 1;
}

export function isRoutineHealthySessionHealth(event: UnknownRecord | null): boolean {
  if (!event || event.event !== 'session_health') return false;
  const status = String(event.status ?? '').toLowerCase();
  const mcp = isRecord(event.mcp) ? event.mcp : {};
  const mcpState = String(mcp.operational_state ?? event.mcp_operational_state ?? '').toLowerCase();
  const startupFailures = Number(event.mcp_startup_failure_count ?? mcp.startup_failure_count ?? 0);
  const runtimeFaults = Number(event.mcp_runtime_fault_count ?? mcp.runtime_fault_count ?? 0);
  return status === 'healthy' && (mcpState === '' || mcpState === 'healthy') && startupFailures === 0 && runtimeFaults === 0;
}

export function createTurnActivityState(): TurnActivityState {
  return {
    state: TURN_ACTIVITY_PHASES.IDLE,
    startedAtMs: null,
    label: 'Idle',
    detail: null,
    activeTurnId: null,
    activeRequestId: null,
    lastTerminalTurnId: null,
    lastTerminalRequestId: null,
    activeToolIds: new Set(),
    toolCallCount: 0,
    toolResultCount: 0,
    toolFailureCount: 0,
    latestToolName: null,
  };
}

/**
 * Reduce the observed runtime history into one turn/activity state machine.
 * Events can arrive from the middle of a turn after replay, so transitions
 * are tolerant of missing earlier events rather than rejecting observations.
 */
export function reduceTurnActivity(state: TurnActivityState, message: unknown): TurnActivityState {
  const event = unwrapRuntimeEvent(message);
  const timestampMs = timestampFromEvent(event) ?? timestampFromEvent(message) ?? state.startedAtMs ?? Date.now();
  if (!event || typeof event !== 'object') return state;
  // A browser-local send is transport evidence only. Turn activity becomes
  // visible after durable NARS admission, so a half-open socket cannot make
  // the session look queued forever.
  if (event.event === 'operator_input_submitted') return state;
  if (event.event === 'session_control_accepted' && event.method === 'session.submit') {
    return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.QUEUED, timestampMs, 'Waiting for agent...', 'NARS accepted the input');
  }
  if (event.event === 'input_event_queued') return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.QUEUED, timestampMs, 'Waiting for agent...', 'NARS accepted the input');
  if (event.event === 'directive_received' || event.event === 'directive_carrier_accepted_recorded') return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.QUEUED, timestampMs, 'Waiting for agent...', 'directive accepted');
  if (event.event === 'turn_started' || event.event === 'carrier_turn_started') {
    if (isLateCompletedActivityEvent(state, event)) return state;
    return startTurnActivity(state, timestampMs, agentLabel(event, 'is thinking...'), providerDetail(event), turnIdentity(event.turn_id) ?? true, eventRequestId(event));
  }
  if (event.event === 'assistant_message_stream') {
    if (isStaleTurnActivityEvent(state, event)) return state;
    adoptActivityIdentity(state, event);
    return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.STREAMING, timestampMs, agentLabel(event, 'is responding...'), null);
  }
  if (event.event === 'session_health') return reconcileTurnActivityWithHealth(state, event);
  const providerEvent = event.event;
  if (isRecord(providerEvent)) {
    if (providerEvent.type === 'turn.started' || providerEvent.type === 'thread.started') return applyProviderActivityEvent(state, providerEvent, event, timestampMs);
    if (isStaleTurnActivityEvent(state, event)) return state;
    return applyProviderActivityEvent(state, providerEvent, event, timestampMs);
  }
  if (isStaleTurnActivityEvent(state, event)) return state;
  if (event.event === 'tool_call') return applyTopLevelToolCallActivity(state, event, timestampMs);
  if (event.event === 'tool_result') return applyTopLevelToolResultActivity(state, event, timestampMs);
  if (event.event === 'assistant_message') {
    // A turn can emit an interim assistant message before its next tool call; only the explicit lifecycle aggregate terminates it.
    if (state.activeTurnId && event.lifecycle_event !== 'assistant_message') return state;
    return resetTurnActivity(state, event);
  }
  if (event.event === 'turn_complete'
    || event.event === 'carrier_turn_completed'
    || event.event === 'input_event_completed'
    || event.event === 'input_completed'
    || event.event === 'turn_interrupted'
    || event.event === 'carrier_turn_interrupted'
    || event.event === 'directive_complete'
    || event.event === 'session_closed') return resetTurnActivity(state, event);
  if (event.event === 'turn_failed' || event.event === 'carrier_turn_failed') {
    return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.FAILED, timestampMs, 'Turn failed', terminalDetail(event), turnIdentity(event.turn_id) ?? state.activeTurnId);
  }
  return state;
}

function adoptActivityIdentity(state: TurnActivityState, event: UnknownRecord): void {
  const turnId = typeof event?.turn_id === 'string' && event.turn_id ? event.turn_id : null;
  const requestId = eventRequestId(event);
  if (turnId && !state.activeTurnId) state.activeTurnId = turnId;
  if (requestId && !state.activeRequestId) state.activeRequestId = requestId;
}

function isLateCompletedActivityEvent(state: TurnActivityState, event: UnknownRecord): boolean {
  const turnId = activityTurnId(event);
  const requestId = eventRequestId(event);
  return Boolean((turnId && turnId === state.lastTerminalTurnId) || (requestId && requestId === state.lastTerminalRequestId));
}

function isStaleTurnActivityEvent(state: TurnActivityState, event: UnknownRecord): boolean {
  if (isLateCompletedActivityEvent(state, event)) return true;
  const turnId = activityTurnId(event);
  const requestId = eventRequestId(event);
  if (state.activeTurnId && turnId && turnId !== state.activeTurnId) return true;
  if (state.activeRequestId && requestId && requestId !== state.activeRequestId) return true;
  return false;
}

// Compatibility aliases for callers that still import the pre-state-machine names.
export const createActivityAccumulator = createTurnActivityState;
export const applyActivityEvent = reduceTurnActivity;
export const materializeActivity = materializeTurnActivity;

export function materializeTurnActivity(state: TurnActivityState, nowMs: number): ActivitySnapshot {
  if (state.state === TURN_ACTIVITY_PHASES.IDLE || !state.startedAtMs) return { ...IDLE_ACTIVITY };
  return {
    active: true,
    state: state.state,
    label: state.label,
    detail: state.detail,
    startedAtMs: state.startedAtMs,
    elapsedSeconds: Math.max(0, Math.floor((nowMs - state.startedAtMs) / 1000)),
    activeTurnId: state.activeTurnId,
  };
}

export function reconcileTurnActivityWithHealth(state: TurnActivityState, event: UnknownRecord | null): TurnActivityState {
  if (!event || typeof event !== 'object') return state;
  if (!Object.prototype.hasOwnProperty.call(event, 'active_turn_state')) return state;
  const activeTurnState = event.active_turn_state;
  if (typeof activeTurnState === 'string' && ACTIVE_TURN_HEALTH_STATES.includes(activeTurnState)) {
    const activeTurnId = turnIdentity(event.active_turn_id) ?? true;
    const differentTurn = Boolean(activeTurnId && state.activeTurnId && activeTurnId !== state.activeTurnId);
    if (state.state === TURN_ACTIVITY_PHASES.IDLE || state.state === TURN_ACTIVITY_PHASES.FAILED || !state.activeTurnId || differentTurn) {
      const phase = TOOL_TURN_HEALTH_STATES.has(activeTurnState)
        ? TURN_ACTIVITY_PHASES.TOOL
        : TURN_ACTIVITY_PHASES.THINKING;
      const label = phase === TURN_ACTIVITY_PHASES.TOOL ? 'is using tools...' : 'is thinking...';
      const started = startTurnActivity(state, timestampFromEvent(event) ?? Date.now(), agentLabel(event, label), providerDetail(event), activeTurnId, null);
      started.state = phase;
      started.label = agentLabel(event, label);
      started.detail = providerDetail(event) ?? 'NARS turn state: ' + activeTurnState;
      return started;
    }
    const phase = TOOL_TURN_HEALTH_STATES.has(activeTurnState)
      ? TURN_ACTIVITY_PHASES.TOOL
      : TURN_ACTIVITY_PHASES.THINKING;
    state.state = phase;
    state.label = agentLabel(event, phase === TURN_ACTIVITY_PHASES.TOOL ? 'is using tools...' : 'is thinking...');
    state.detail = providerDetail(event) ?? 'NARS turn state: ' + activeTurnState;
    return state;
  }
  if (typeof activeTurnState !== 'string' || !ACTIVE_TURN_HEALTH_STATES.includes(activeTurnState)) {
    // Health is polled independently from the event stream. An idle sample
    // observed before the current turn started must not erase newer live
    // activity while the next health sample is still in flight.
    if (healthSamplePredatesActivity(state, event)) return state;
    return resetTurnActivity(state, event);
  }
  return state;
}

function applyProviderActivityEvent(state: TurnActivityState, providerEvent: UnknownRecord, envelope: UnknownRecord, timestampMs: number): TurnActivityState {
  if (providerEvent.type === 'turn.started' || providerEvent.type === 'thread.started') {
    if (isLateCompletedActivityEvent(state, envelope)) return state;
    return startTurnActivity(state, timestampMs, agentLabel(envelope, 'is thinking...'), providerDetail(envelope), turnIdentity(envelope.turn_id) ?? state.activeTurnId ?? true, eventRequestId(envelope));
  }
  if (providerEvent.type === 'turn.completed') return resetTurnActivity(state, envelope);
  if (providerEvent.type === 'item.started') {
    const item = objectField(providerEvent, 'item');
    if (item?.type === 'mcp_tool_call') {
      adoptActivityIdentity(state, envelope);
      if (item.id) state.activeToolIds.add(String(item.id));
      recordToolCall(state, toolDetail(item));
      return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.TOOL, timestampMs, agentLabel(envelope, 'is using tools...'), toolProgressDetail(state));
    }
    if (item?.type === 'agent_message') return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.STREAMING, timestampMs, agentLabel(envelope, 'is responding...'), null);
  }
  if (providerEvent.type === 'item.completed') {
    const item = objectField(providerEvent, 'item');
    if (item?.type === 'agent_message') return resetTurnActivity(state, envelope);
    if (item?.type === 'mcp_tool_call') {
      adoptActivityIdentity(state, envelope);
      if (item.id) state.activeToolIds.delete(String(item.id));
      recordToolResult(state, toolDetail(item), Boolean(item.error));
      if (state.activeToolIds.size === 0) return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.THINKING, timestampMs, agentLabel(envelope, 'is thinking...'), toolProgressDetail(state) ?? providerDetail(envelope));
      return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.TOOL, timestampMs, agentLabel(envelope, 'is using tools...'), toolProgressDetail(state));
    }
  }
  return state;
}

function applyTopLevelToolCallActivity(state: TurnActivityState, event: UnknownRecord, timestampMs: number): TurnActivityState {
  adoptActivityIdentity(state, event);
  recordToolCall(state, topLevelToolName(event));
  return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.TOOL, timestampMs, agentLabel(event, 'is using tools...'), toolProgressDetail(state));
}

function applyTopLevelToolResultActivity(state: TurnActivityState, event: UnknownRecord, timestampMs: number): TurnActivityState {
  adoptActivityIdentity(state, event);
  recordToolResult(state, topLevelToolName(event), topLevelToolFailed(event));
  const activeCount = activeToolCount(state);
  if (activeCount > 0) return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.TOOL, timestampMs, agentLabel(event, 'is using tools...'), toolProgressDetail(state));
  return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.THINKING, timestampMs, agentLabel(event, 'is thinking...'), toolProgressDetail(state));
}

function recordToolCall(state: TurnActivityState, toolName: string | null): void {
  state.toolCallCount += 1;
  if (toolName) state.latestToolName = toolName;
}

function recordToolResult(state: TurnActivityState, toolName: string | null, failed: boolean): void {
  state.toolResultCount += 1;
  if (failed) state.toolFailureCount += 1;
  if (toolName) state.latestToolName = toolName;
}

function toolProgressDetail(state: TurnActivityState): string | null {
  if (!state.toolCallCount && !state.toolResultCount) return null;
  const parts = [`${state.toolCallCount} called`, `${state.toolResultCount} completed`];
  const activeCount = activeToolCount(state);
  if (activeCount > 0) parts.push(`${activeCount} running`);
  if (state.toolFailureCount > 0) parts.push(`${state.toolFailureCount} failed`);
  if (state.latestToolName) parts.push(`latest ${state.latestToolName}`);
  return `tools: ${parts.join(' · ')}`;
}

function activeToolCount(state: TurnActivityState): number {
  return Math.max(state.activeToolIds.size, state.toolCallCount - state.toolResultCount, 0);
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

function transitionTurnActivity(
  state: TurnActivityState,
  nextState: ActivitySnapshot['state'],
  timestampMs: number,
  label: string,
  detail: string | null,
  activeTurnId?: string | boolean | null,
): TurnActivityState {
  state.state = nextState;
  state.startedAtMs ??= timestampMs;
  state.label = label;
  state.detail = detail;
  if (activeTurnId !== undefined) state.activeTurnId = activeTurnId;
  return state;
}

function startTurnActivity(state: TurnActivityState, timestampMs: number, label: string, detail: string | null, activeTurnId: string | boolean | null, activeRequestId: string | null): TurnActivityState {
  state.lastTerminalTurnId = null;
  state.lastTerminalRequestId = null;
  state.activeRequestId = activeRequestId ?? null;
  return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.THINKING, timestampMs, label, detail, activeTurnId);
}

function resetTurnActivity(state: TurnActivityState, event: UnknownRecord): TurnActivityState {
  if (isStaleTurnActivityEvent(state, event)) return state;
  const terminalTurnId = activityTurnId(event) ?? (typeof state.activeTurnId === 'string' ? state.activeTurnId : null);
  const terminalRequestId = eventRequestId(event) ?? state.activeRequestId;
  if (terminalTurnId || terminalRequestId) {
    state.lastTerminalTurnId = terminalTurnId ?? null;
    state.lastTerminalRequestId = terminalRequestId ?? null;
  }
  transitionTurnActivity(state, TURN_ACTIVITY_PHASES.IDLE, timestampFromEvent(event) ?? state.startedAtMs ?? Date.now(), 'Idle', null, null);
  state.startedAtMs = null;
  state.activeTurnId = null;
  state.activeRequestId = null;
  state.activeToolIds.clear();
  state.toolCallCount = 0;
  state.toolResultCount = 0;
  state.toolFailureCount = 0;
  state.latestToolName = null;
  return state;
}

function activityTurnId(event: UnknownRecord): string | null {
  const directTurnId = typeof event?.turn_id === 'string' && event.turn_id ? event.turn_id : null;
  if (directTurnId) return directTurnId;
  if (event?.event === 'input_event_completed' || event?.event === 'input_completed') {
    const inputEventId = event.input_event_id ?? event.event_id;
    return typeof inputEventId === 'string' && inputEventId ? inputEventId : null;
  }
  return null;
}

function turnIdentity(value: unknown): string | boolean | null {
  return typeof value === 'string' || typeof value === 'boolean' ? value : null;
}

function agentLabel(event: UnknownRecord, suffix: string): string {
  const agentId = eventAgentDisplay(event) ?? 'Agent';
  return `${agentId} ${suffix}`;
}

function eventAgentDisplay(event: UnknownRecord): string | null {
  return agentIdentityDisplay(event?.agent_identity_ref, event?.agent_id ?? event?.agentId ?? null);
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

function objectField(record: UnknownRecord, field: string): UnknownRecord | null {
  const value = record[field];
  return isRecord(value) ? value : null;
}

function timestampFromEvent(value: unknown): number | null {
  if (!isRecord(value)) return null;
  return parseTimestamp(value.timestamp);
}

function healthSamplePredatesActivity(state: TurnActivityState, event: UnknownRecord): boolean {
  const observedAtMs = parseTimestamp(event?.health_observed_at)
    ?? parseTimestamp(event?.generated_at)
    ?? timestampFromEvent(event);
  return observedAtMs !== null
    && state.startedAtMs !== null
    && state.startedAtMs > observedAtMs;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
