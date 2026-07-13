import { unwrapRuntimeEvent } from './runtime-events.js';
import { agentIdentityDisplay } from '@narada2/agent-identity';

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

export function createInitialHealthState() {
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

function eventRequestId(event) {
  const requestId = event?.request_id ?? event?.requestId;
  return typeof requestId === 'string' && requestId ? requestId : null;
}

export function reduceHealthState(state, message) {
  const event = unwrapRuntimeEvent(message);
  if (!event || typeof event !== 'object' || event.event !== 'session_health') return;
  const status = String(event.status ?? 'unknown');
  state.status = status;
  state.agentId = eventAgentDisplay(event) ?? state.agentId;
  state.sessionId = event.session_id ?? state.sessionId;
  state.lastSeenAt = event.timestamp ?? new Date().toISOString();
  state.lastEvent = event;
  state.text = `${status} · ${state.agentId ?? 'agent'} · ${state.sessionId ?? 'session'}`;
  if (isRoutineHealthySessionHealth(event)) state.healthySampleCount += 1;
  else state.degradedSampleCount += 1;
}

export function isRoutineHealthySessionHealth(event) {
  if (!event || event.event !== 'session_health') return false;
  const status = String(event.status ?? '').toLowerCase();
  const mcpState = String(event.mcp?.operational_state ?? event.mcp_operational_state ?? '').toLowerCase();
  const startupFailures = Number(event.mcp_startup_failure_count ?? event.mcp?.startup_failure_count ?? 0);
  const runtimeFaults = Number(event.mcp_runtime_fault_count ?? event.mcp?.runtime_fault_count ?? 0);
  return status === 'healthy' && (mcpState === '' || mcpState === 'healthy') && startupFailures === 0 && runtimeFaults === 0;
}

export function createTurnActivityState() {
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
export function reduceTurnActivity(state, message) {
  const event = unwrapRuntimeEvent(message);
  const timestampMs = timestampFromEvent(event) ?? timestampFromEvent(message) ?? state.startedAtMs ?? Date.now();
  if (!event || typeof event !== 'object') return state;
  if (event.event === 'operator_input_submitted') return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.QUEUED, timestampMs, 'Waiting for agent...', null);
  if (event.event === 'directive_received' || event.event === 'directive_carrier_accepted_recorded') return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.QUEUED, timestampMs, 'Waiting for agent...', 'directive accepted');
  if (event.event === 'turn_started') {
    if (isLateCompletedActivityEvent(state, event)) return state;
    return startTurnActivity(state, timestampMs, agentLabel(event, 'is thinking...'), providerDetail(event), event.turn_id ?? true, eventRequestId(event));
  }
  if (event.event === 'assistant_message_stream') {
    if (isStaleTurnActivityEvent(state, event)) return state;
    adoptActivityIdentity(state, event);
    return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.STREAMING, timestampMs, agentLabel(event, 'is responding...'), null);
  }
  if (event.event === 'session_health') return reconcileTurnActivityWithHealth(state, event);
  const providerEvent = event.event;
  if (providerEvent && typeof providerEvent === 'object') {
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
  if (event.event === 'turn_complete' || event.event === 'turn_interrupted' || event.event === 'directive_complete' || event.event === 'session_closed') return resetTurnActivity(state, event);
  if (event.event === 'turn_failed') return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.FAILED, timestampMs, 'Turn failed', terminalDetail(event), event.turn_id ?? state.activeTurnId);
  return state;
}

function adoptActivityIdentity(state, event) {
  const turnId = typeof event?.turn_id === 'string' && event.turn_id ? event.turn_id : null;
  const requestId = eventRequestId(event);
  if (turnId && !state.activeTurnId) state.activeTurnId = turnId;
  if (requestId && !state.activeRequestId) state.activeRequestId = requestId;
}

function isLateCompletedActivityEvent(state, event) {
  const turnId = typeof event?.turn_id === 'string' && event.turn_id ? event.turn_id : null;
  const requestId = eventRequestId(event);
  return Boolean((turnId && turnId === state.lastTerminalTurnId) || (requestId && requestId === state.lastTerminalRequestId));
}

function isStaleTurnActivityEvent(state, event) {
  if (isLateCompletedActivityEvent(state, event)) return true;
  const turnId = typeof event?.turn_id === 'string' && event.turn_id ? event.turn_id : null;
  const requestId = eventRequestId(event);
  if (state.activeTurnId && turnId && turnId !== state.activeTurnId) return true;
  if (state.activeRequestId && requestId && requestId !== state.activeRequestId) return true;
  return false;
}

// Compatibility aliases for callers that still import the pre-state-machine names.
export const createActivityAccumulator = createTurnActivityState;
export const applyActivityEvent = reduceTurnActivity;
export const materializeActivity = materializeTurnActivity;

export function materializeTurnActivity(state, nowMs) {
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

export function reconcileTurnActivityWithHealth(state, event) {
  if (!event || typeof event !== 'object') return state;
  const activeTurnState = typeof event.active_turn_state === 'string' ? event.active_turn_state : null;
  if (activeTurnState === 'running') {
    const activeTurnId = event.active_turn_id ?? true;
    const differentTurn = event.active_turn_id && state.activeTurnId && event.active_turn_id !== state.activeTurnId;
    if (state.state === TURN_ACTIVITY_PHASES.IDLE || state.state === TURN_ACTIVITY_PHASES.FAILED || !state.activeTurnId || differentTurn) {
      return startTurnActivity(state, timestampFromEvent(event) ?? Date.now(), agentLabel(event, 'is thinking...'), providerDetail(event), activeTurnId, null);
    }
  }
  if (activeTurnState && activeTurnState !== 'running') return resetTurnActivity(state, {});
  return state;
}

function applyProviderActivityEvent(state, providerEvent, envelope, timestampMs) {
  if (providerEvent.type === 'turn.started' || providerEvent.type === 'thread.started') {
    if (isLateCompletedActivityEvent(state, envelope)) return state;
    return startTurnActivity(state, timestampMs, agentLabel(envelope, 'is thinking...'), providerDetail(envelope), envelope.turn_id ?? state.activeTurnId ?? true, eventRequestId(envelope));
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

function applyTopLevelToolCallActivity(state, event, timestampMs) {
  adoptActivityIdentity(state, event);
  recordToolCall(state, topLevelToolName(event));
  return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.TOOL, timestampMs, agentLabel(event, 'is using tools...'), toolProgressDetail(state));
}

function applyTopLevelToolResultActivity(state, event, timestampMs) {
  adoptActivityIdentity(state, event);
  recordToolResult(state, topLevelToolName(event), topLevelToolFailed(event));
  const activeCount = activeToolCount(state);
  if (activeCount > 0) return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.TOOL, timestampMs, agentLabel(event, 'is using tools...'), toolProgressDetail(state));
  return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.THINKING, timestampMs, agentLabel(event, 'is thinking...'), toolProgressDetail(state));
}

function recordToolCall(state, toolName) {
  state.toolCallCount += 1;
  if (toolName) state.latestToolName = toolName;
}

function recordToolResult(state, toolName, failed) {
  state.toolResultCount += 1;
  if (failed) state.toolFailureCount += 1;
  if (toolName) state.latestToolName = toolName;
}

function toolProgressDetail(state) {
  if (!state.toolCallCount && !state.toolResultCount) return null;
  const parts = [`${state.toolCallCount} called`, `${state.toolResultCount} completed`];
  const activeCount = activeToolCount(state);
  if (activeCount > 0) parts.push(`${activeCount} running`);
  if (state.toolFailureCount > 0) parts.push(`${state.toolFailureCount} failed`);
  if (state.latestToolName) parts.push(`latest ${state.latestToolName}`);
  return `tools: ${parts.join(' · ')}`;
}

function activeToolCount(state) {
  return Math.max(state.activeToolIds.size, state.toolCallCount - state.toolResultCount, 0);
}

function topLevelToolName(event) {
  const direct = event.tool_name ?? event.tool;
  if (typeof direct === 'string' && direct) return direct;
  const server = typeof event.server === 'string' && event.server ? event.server : null;
  const tool = typeof event.tool === 'string' && event.tool ? event.tool : null;
  return [server, tool].filter(Boolean).join('.') || null;
}

function topLevelToolFailed(event) {
  if (event.error) return true;
  const status = typeof event.status === 'string' ? event.status.toLowerCase() : '';
  return status === 'failed' || status === 'error';
}

function transitionTurnActivity(state, nextState, timestampMs, label, detail, activeTurnId) {
  state.state = nextState;
  state.startedAtMs ??= timestampMs;
  state.label = label;
  state.detail = detail;
  if (activeTurnId !== undefined) state.activeTurnId = activeTurnId;
  return state;
}

function startTurnActivity(state, timestampMs, label, detail, activeTurnId, activeRequestId) {
  state.lastTerminalTurnId = null;
  state.lastTerminalRequestId = null;
  state.activeRequestId = activeRequestId ?? null;
  return transitionTurnActivity(state, TURN_ACTIVITY_PHASES.THINKING, timestampMs, label, detail, activeTurnId);
}

function resetTurnActivity(state, event) {
  if (isStaleTurnActivityEvent(state, event)) return state;
  const terminalTurnId = event.turn_id ?? state.activeTurnId;
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

function agentLabel(event, suffix) {
  const agentId = eventAgentDisplay(event) ?? 'Agent';
  return `${agentId} ${suffix}`;
}

function eventAgentDisplay(event) {
  return agentIdentityDisplay(event?.agent_identity_ref, event?.agent_id ?? event?.agentId ?? null);
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

