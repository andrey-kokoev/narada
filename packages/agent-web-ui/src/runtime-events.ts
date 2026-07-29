import {
  NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY,
  NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS,
  normalizeNarsClientProjectionVerbosity,
  projectNarsClientEvent,
  shouldProjectNarsClientProjection,
  unwrapNarsClientEvent,
} from '@narada2/nars-client-projection-contract';
import { isRecord, type UnknownRecord } from './types.ts';

export {
  NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY,
  NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS,
  normalizeNarsClientProjectionVerbosity,
};

export type RuntimeProjection = {
  kind: string;
  label: string;
  tone: string;
  summary: unknown;
  event: unknown;
  renderKey?: string;
  streamContent?: string;
};

export type RuntimeUiState = {
  activeTurnId: string | boolean | null;
};

export const unwrapRuntimeEvent = (message: unknown): UnknownRecord | null => {
  const event = unwrapNarsClientEvent(message);
  return isRecord(event) ? event : null;
};

export function projectRuntimeEvent(message: unknown): RuntimeProjection {
  return projectNarsClientEvent(message) as RuntimeProjection;
}

export function summarizeRuntimeEvent(message: unknown): unknown {
  return projectRuntimeEvent(message).summary;
}

export function sequenceFromRuntimeMessage(message: unknown): number | null {
  const event = unwrapRuntimeEvent(message);
  const messageRecord = isRecord(message) ? message : null;
  const cursor = messageRecord && isRecord(messageRecord.cursor) ? messageRecord.cursor : null;
  const sequence = cursor?.sequence ?? event?.event_sequence ?? event?.sequence;
  return typeof sequence === 'number' && Number.isFinite(sequence) ? sequence : null;
}

export function isTerminalRuntimeEvent(message: unknown): boolean {
  const event = unwrapRuntimeEvent(message)?.event;
  return event === 'session_closed' || event === 'authority_session_revoked' || event === 'projection_revoked';
}

export function applyRuntimeEventToWebUiState(state: RuntimeUiState, message: unknown): RuntimeUiState {
  const runtimeEvent = unwrapRuntimeEvent(message);
  if (!state || !runtimeEvent || typeof runtimeEvent !== 'object') return state;
  if (runtimeEvent.event=== 'turn_started' || runtimeEvent.event === 'carrier_turn_started') {
    const turnId = runtimeEvent.turn_id;
    state.activeTurnId = typeof turnId === 'string' || typeof turnId === 'boolean' ? turnId : true;
  } else if (isActiveTurnTerminalEvent(runtimeEvent)) {
    const terminalTurnId = runtimeEvent.turn_id ?? runtimeEvent.input_event_id ?? runtimeEvent.event_id ?? null;
    if (!terminalTurnId || state.activeTurnId === terminalTurnId) state.activeTurnId = null;
  } else if (runtimeEvent.event=== 'session_closed') {
    state.activeTurnId = null;
  }
  return state;
}

function isActiveTurnTerminalEvent(event: UnknownRecord): boolean {
  return event.event === 'turn_complete'
    || event.event === 'turn_failed'
    || event.event === 'carrier_turn_completed'
    || event.event === 'carrier_turn_failed'
    || event.event === 'carrier_turn_interrupted'
    || event.event === 'turn_interrupted'
    || event.event === 'input_event_completed'
    || event.event === 'input_completed';
}

export type RuntimeProjectionPolicyOptions = {
  verbosity?: string;
  facets?: readonly string[];
  includeStateSamples?: boolean;
};

export function shouldRenderRuntimeEvent(message: unknown, options: RuntimeProjectionPolicyOptions = {}): boolean {
  return shouldRenderRuntimeProjection(projectRuntimeEvent(message), options);
}

export function shouldRenderRuntimeProjection(projection: RuntimeProjection, options: RuntimeProjectionPolicyOptions = {}): boolean {
  const verbosity = normalizeNarsClientProjectionVerbosity(options.verbosity ?? NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY);
  return shouldProjectNarsClientProjection(projection as Parameters<typeof shouldProjectNarsClientProjection>[0], { ...options, verbosity });
}