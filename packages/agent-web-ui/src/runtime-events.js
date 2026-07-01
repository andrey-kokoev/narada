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
  const narsRuntimeProjection = projectNarsRuntimeEvent(message);
  if (narsRuntimeProjection) return narsRuntimeProjection;
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

function projectNarsRuntimeEvent(message) {
  const event = unwrapRuntimeEvent(message);
  if (!event || typeof event !== 'object') return null;
  if (event.event === 'authority_session_revoked') {
    return projection({
      kind: 'session_revoked',
      label: 'Session revoked',
      tone: 'error',
      summary: event.code ?? 'session_revoked',
      event,
      renderKey: event.session_id ? `authority-session-revoked:${event.session_id}` : null,
    });
  }
  if (event.event === 'conversation_enqueue_requested') {
    const requestId = event.request_id ? String(event.request_id) : 'queued input';
    return projection({
      kind: 'operator_input_queued',
      label: 'Input queued',
      tone: 'operator',
      summary: `${requestId} queued`,
      event,
      renderKey: event.event_sequence == null ? `operator-input-queued:${requestId}` : `sequence:${event.event_sequence}`,
    });
  }
  if (event.event === 'input_queued_for_turn_boundary') {
    const inputEventId = event.input_event_id ? String(event.input_event_id) : 'input queued for turn boundary';
    return projection({
      kind: 'operator_input_queued',
      label: 'Input queued',
      tone: 'operator',
      summary: `${inputEventId} queued for turn boundary`,
      event,
      renderKey: event.event_sequence == null ? `operator-input-boundary:${inputEventId}` : `sequence:${event.event_sequence}`,
    });
  }
  return null;
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

export function shouldRenderRuntimeEvent(message, options = {}) {
  return shouldRenderRuntimeProjection(projectRuntimeEvent(message), options);
}

export function shouldRenderRuntimeProjection(projection, options = {}) {
  const verbosity = normalizeNarsClientProjectionVerbosity(options.verbosity ?? NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY);
  return shouldProjectNarsClientProjection(projection, { ...options, verbosity });
}
