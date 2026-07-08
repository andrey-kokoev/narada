import { unwrapRuntimeEvent } from './runtime-events.js';
import { agentIdentityDisplay } from '@narada2/agent-identity';

export const IDLE_ACTIVITY = Object.freeze({
  active: false,
  state: 'idle',
  label: 'Idle',
  detail: null,
  elapsedSeconds: 0,
  startedAtMs: null,
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

export function createActivityAccumulator() {
  return {
    state: 'idle',
    startedAtMs: null,
    label: 'Idle',
    detail: null,
    activeTurnId: null,
    activeToolIds: new Set(),
    toolCallCount: 0,
    toolResultCount: 0,
    toolFailureCount: 0,
    latestToolName: null,
  };
}

export function applyActivityEvent(state, message) {
  const event = unwrapRuntimeEvent(message);
  const timestampMs = timestampFromEvent(event) ?? timestampFromEvent(message) ?? state.startedAtMs ?? Date.now();
  if (!event || typeof event !== 'object') return state;
  if (event.event === 'operator_input_submitted') return startActivity(state, 'queued', timestampMs, 'Waiting for agent...', null);
  if (event.event === 'directive_received' || event.event === 'directive_carrier_accepted_recorded') return startActivity(state, 'queued', timestampMs, 'Waiting for agent...', 'directive accepted');
  if (event.event === 'turn_started') return Object.assign(startActivity(state, 'thinking', timestampMs, agentLabel(event, 'is thinking...'), providerDetail(event)), { activeTurnId: event.turn_id ?? true });
  if (event.event === 'assistant_message_stream') return startActivity(state, 'streaming', timestampMs, agentLabel(event, 'is responding...'), null);
  if (event.event === 'session_health') return applyHealthActivityEvent(state, event);
  if (event.event === 'tool_call') return applyTopLevelToolCallActivity(state, event, timestampMs);
  if (event.event === 'tool_result') return applyTopLevelToolResultActivity(state, event, timestampMs);
  if (event.event === 'assistant_message' || event.event === 'turn_complete' || event.event === 'turn_interrupted' || event.event === 'directive_complete' || event.event === 'session_closed') return clearActivity(state, event);
  if (event.event === 'turn_failed') return startActivity(state, 'failed', timestampMs, 'Turn failed', terminalDetail(event));
  const providerEvent = event.event;
  if (providerEvent && typeof providerEvent === 'object') return applyProviderActivityEvent(state, providerEvent, event, timestampMs);
  return state;
}

export function materializeActivity(state, nowMs) {
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

function applyHealthActivityEvent(state, event) {
  const activeTurnState = typeof event.active_turn_state === 'string' ? event.active_turn_state : null;
  if (activeTurnState && activeTurnState !== 'running') return clearActivity(state, {});
  return state;
}

function applyProviderActivityEvent(state, providerEvent, envelope, timestampMs) {
  if (providerEvent.type === 'turn.started' || providerEvent.type === 'thread.started') return startActivity(state, 'thinking', timestampMs, agentLabel(envelope, 'is thinking...'), providerDetail(envelope));
  if (providerEvent.type === 'turn.completed') return clearActivity(state, envelope);
  if (providerEvent.type === 'item.started') {
    const item = objectField(providerEvent, 'item');
    if (item?.type === 'mcp_tool_call') {
      if (item.id) state.activeToolIds.add(String(item.id));
      recordToolCall(state, toolDetail(item));
      return startActivity(state, 'tool', timestampMs, agentLabel(envelope, 'is using tools...'), toolProgressDetail(state));
    }
    if (item?.type === 'agent_message') return startActivity(state, 'streaming', timestampMs, agentLabel(envelope, 'is responding...'), null);
  }
  if (providerEvent.type === 'item.completed') {
    const item = objectField(providerEvent, 'item');
    if (item?.type === 'agent_message') return clearActivity(state, envelope);
    if (item?.type === 'mcp_tool_call') {
      if (item.id) state.activeToolIds.delete(String(item.id));
      recordToolResult(state, toolDetail(item), Boolean(item.error));
      if (state.activeToolIds.size === 0) return startActivity(state, 'thinking', timestampMs, agentLabel(envelope, 'is thinking...'), toolProgressDetail(state) ?? providerDetail(envelope));
      return startActivity(state, 'tool', timestampMs, agentLabel(envelope, 'is using tools...'), toolProgressDetail(state));
    }
  }
  return state;
}

function applyTopLevelToolCallActivity(state, event, timestampMs) {
  recordToolCall(state, topLevelToolName(event));
  return startActivity(state, 'tool', timestampMs, agentLabel(event, 'is using tools...'), toolProgressDetail(state));
}

function applyTopLevelToolResultActivity(state, event, timestampMs) {
  recordToolResult(state, topLevelToolName(event), topLevelToolFailed(event));
  const activeCount = activeToolCount(state);
  if (activeCount > 0) return startActivity(state, 'tool', timestampMs, agentLabel(event, 'is using tools...'), toolProgressDetail(state));
  return startActivity(state, 'thinking', timestampMs, agentLabel(event, 'is thinking...'), toolProgressDetail(state));
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

