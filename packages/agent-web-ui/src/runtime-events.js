import { projectNarsClientEvent, unwrapNarsClientEvent } from '@narada2/nars-client-projection-contract';

export const unwrapRuntimeEvent = unwrapNarsClientEvent;

export function projectRuntimeEvent(message) {
  return projectNarsClientEvent(message);
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
