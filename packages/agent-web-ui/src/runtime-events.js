import {
  NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY,
  NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS,
  normalizeNarsClientProjectionVerbosity,
  projectNarsClientEvent,
  shouldProjectNarsClientProjection,
  unwrapNarsClientEvent,
} from '@narada2/nars-client-projection-contract';

export {
  NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY,
  NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS,
  normalizeNarsClientProjectionVerbosity,
};

export const unwrapRuntimeEvent = unwrapNarsClientEvent;

export function projectRuntimeEvent(message) {
  const projected = projectNestedProviderEvent(message);
  if (projected) return projected;
  return withRenderIdentity(projectNarsClientEvent(message));
}

export function summarizeRuntimeEvent(message) {
  return projectRuntimeEvent(message).summary;
}

export function sequenceFromRuntimeMessage(message) {
  const event = unwrapRuntimeEvent(message);
  const sequence = message?.cursor?.sequence ?? event?.event_sequence ?? event?.sequence;
  return Number.isFinite(sequence) ? sequence : null;
}

export function applyRuntimeEventToWebUiState(state, message) {
  const runtimeEvent = unwrapRuntimeEvent(message);
  if (!state || !runtimeEvent || typeof runtimeEvent !== 'object') return state;
  if (runtimeEvent.event === 'turn_started') {
    state.activeTurnId = runtimeEvent.turn_id ?? true;
  } else if (runtimeEvent.event === 'turn_complete' || runtimeEvent.event === 'turn_failed') {
    if (!runtimeEvent.turn_id || state.activeTurnId === runtimeEvent.turn_id) state.activeTurnId = null;
  } else if (runtimeEvent.event === 'session_closed') {
    state.activeTurnId = null;
  }
  return state;
}

function projectNestedProviderEvent(message) {
  const event = unwrapRuntimeEvent(message);
  const providerEvent = event?.event;
  if (!providerEvent || typeof providerEvent !== 'object') return null;
  const type = providerEvent.type;
  if (type === 'thread.started') {
    return projection({ kind: 'provider_thread_started', label: 'Thread started', tone: 'session', summary: providerEvent.thread_id ?? 'thread started', event });
  }
  if (type === 'turn.started') {
    return projection({ kind: 'provider_turn_started', label: 'Turn started', tone: 'session', summary: 'provider turn started', event });
  }
  if (type === 'turn.completed') {
    const usage = providerEvent.usage && typeof providerEvent.usage === 'object' ? providerEvent.usage : null;
    const summary = usage ? `input ${usage.input_tokens ?? '?'} · output ${usage.output_tokens ?? '?'}` : 'provider turn completed';
    return projection({ kind: 'provider_turn_completed', label: 'Provider turn complete', tone: 'session', summary, event });
  }
  if (type === 'item.started' || type === 'item.completed') {
    return projectProviderItemEvent(type, providerEvent.item, event);
  }
  return projection({ kind: `provider_${String(type ?? 'event').replace(/[^a-z0-9_]+/gi, '_')}`, label: 'Provider event', tone: 'unknown', summary: safeSummary(providerEvent), event });
}

function projectProviderItemEvent(type, item, event) {
  if (!item || typeof item !== 'object') {
    return projection({ kind: `provider_${type.replace('.', '_')}`, label: 'Provider item', tone: 'unknown', summary: type, event });
  }
  const completed = type === 'item.completed';
  if (item.type === 'mcp_tool_call') {
    const name = [item.server, item.tool].filter(Boolean).join('.') || 'tool call';
    const status = completed ? item.error ? 'failed' : 'complete' : 'running';
    return projection({ kind: completed ? 'tool_result' : 'tool_call', label: completed ? 'Tool result' : 'Tool call', tone: item.error ? 'error' : 'tool', summary: `${name} ${status}`, event, renderKey: providerItemRenderKey(event, item, 'tool') });
  }
  if (item.type === 'agent_message') {
    return projection({ kind: completed ? 'assistant_message' : 'assistant_message_stream', label: 'Agent', tone: 'assistant', summary: String(item.text ?? ''), event, renderKey: providerItemRenderKey(event, item, 'assistant') });
  }
  return projection({ kind: `provider_item_${String(item.type ?? 'unknown').replace(/[^a-z0-9_]+/gi, '_')}`, label: 'Provider item', tone: 'unknown', summary: safeSummary(item), event });
}

function projection({ kind, label, tone, summary, event, renderKey = null }) {
  return { kind, label, tone, summary, event, renderKey };
}

function withRenderIdentity(projected) {
  if (!projected || typeof projected !== 'object') return projected;
  const event = projected.event;
  if (projected.kind === 'assistant_message' || projected.kind === 'assistant_message_stream') {
    const turnId = event?.turn_id ?? event?.turnId ?? null;
    if (turnId) return { ...projected, label: 'Agent', tone: 'assistant', renderKey: `assistant:${turnId}` };
  }
  if (projected.kind === 'user_message' || projected.kind === 'operator_input_submitted') {
    const requestId = event?.request_id ?? null;
    if (requestId) return { ...projected, label: 'Operator', tone: 'operator', renderKey: `operator:${requestId}` };
  }
  return projected;
}

function providerItemRenderKey(event, item, prefix) {
  const itemId = item?.id ?? null;
  if (!itemId) return null;
  return `${prefix}:provider-item:${event?.agent_id ?? 'agent'}:${event?.session_id ?? 'session'}:${itemId}`;
}

function safeSummary(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'object') return String(value);
  if (typeof value.message === 'string') return value.message;
  if (typeof value.text === 'string') return value.text;
  if (typeof value.type === 'string') return value.type;
  return JSON.stringify(value);
}

export function shouldRenderRuntimeEvent(message, options = {}) {
  return shouldRenderRuntimeProjection(projectRuntimeEvent(message), options);
}

export function shouldRenderRuntimeProjection(projection, options = {}) {
  return shouldProjectNarsClientProjection(projection, options);
}
