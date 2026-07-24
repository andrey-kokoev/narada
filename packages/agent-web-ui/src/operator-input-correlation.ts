import { isRecord, type UnknownRecord } from './types.ts';

const REQUEST_ID_FIELDS = Object.freeze(['request_id', 'requestId', 'input_request_id', 'authority_request_id']);
const INPUT_EVENT_ID_FIELDS = Object.freeze(['input_event_id', 'inputEventId', 'input_id', 'inputId', 'event_id']);
const SESSION_ID_FIELDS = Object.freeze(['session_id', 'sessionId', 'runtime_session_id', 'carrier_session_id']);
const OPERATOR_INPUT_METHODS = new Set(['session.submit', 'conversation.send', 'conversation.enqueue', 'conversation.steer', 'session.close']);

export type InputCorrelation = {
  requestId: string | null;
  inputEventId: string | null;
  sessionId: string | null;
  method: string | null;
};

export type CorrelationRecord = UnknownRecord;

export type CorrelationMatch = {
  record: CorrelationRecord | null;
  matchedBy: string | null;
  ambiguous: boolean;
};

export function normalizeInputCorrelationId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function inputCorrelationFromEvent(value: unknown): InputCorrelation {
  return inputCorrelationFromValue(value);
}

export function findCorrelatedInput(
  records: Iterable<CorrelationRecord> | null | undefined,
  event: unknown,
  {
    allowUniqueMethod = false,
    activeOnly = () => true,
  }: {
    allowUniqueMethod?: boolean;
    activeOnly?: (record: CorrelationRecord) => boolean;
  } = {},
): CorrelationMatch {
  const correlation = inputCorrelationFromEvent(event);
  const candidates = Array.from(records ?? []).filter((record) => record && activeOnly(record));

  const requestMatches = correlation.requestId
    ? candidates.filter((record) => {
      const candidateCorrelation = inputCorrelationFromValue(record);
      return candidateCorrelation.requestId === correlation.requestId
        && sessionsCompatible(candidateCorrelation.sessionId, correlation.sessionId);
    })
    : [];
  const requestResult = selectCorrelationMatch(requestMatches, 'request_id');
  if (requestResult) return requestResult;

  const inputEventMatches = correlation.inputEventId
    ? candidates.filter((record) => {
      const candidateCorrelation = inputCorrelationFromValue(record);
      return candidateCorrelation.inputEventId === correlation.inputEventId
        && sessionsCompatible(candidateCorrelation.sessionId, correlation.sessionId);
    })
    : [];
  const inputEventResult = selectCorrelationMatch(inputEventMatches, 'input_event_id');
  if (inputEventResult) return inputEventResult;

  if (allowUniqueMethod && correlation.method) {
    const methodMatches = candidates.filter((record) => {
      const candidateCorrelation = inputCorrelationFromValue(record);
      return methodsCompatible(candidateCorrelation.method, correlation.method)
        && sessionsCompatible(candidateCorrelation.sessionId, correlation.sessionId);
    });
    if (methodMatches.length === 1) return { record: methodMatches[0], matchedBy: 'unique_method', ambiguous: false };
    if (methodMatches.length > 1) return { record: null, matchedBy: 'unique_method', ambiguous: true };
  }

  return { record: null, matchedBy: null, ambiguous: false };
}

export function mergeInputCorrelation(
  target: CorrelationRecord,
  event: unknown,
  { requestKey, inputEventKey, sessionKey }: {
    requestKey?: string;
    inputEventKey?: string;
    sessionKey?: string;
  } = {},
): CorrelationRecord {
  const correlation = inputCorrelationFromEvent(event);
  const resolvedRequestKey = requestKey ?? (Object.prototype.hasOwnProperty.call(target, 'request_id') ? 'request_id' : 'requestId');
  const resolvedInputEventKey = inputEventKey ?? (Object.prototype.hasOwnProperty.call(target, 'input_event_id') ? 'input_event_id' : 'inputEventId');
  const resolvedSessionKey = sessionKey ?? (Object.prototype.hasOwnProperty.call(target, 'session_id') ? 'session_id' : 'sessionId');
  if (correlation.requestId && !target[resolvedRequestKey]) target[resolvedRequestKey] = correlation.requestId;
  if (correlation.inputEventId && !target[resolvedInputEventKey]) target[resolvedInputEventKey] = correlation.inputEventId;
  if (correlation.sessionId && !target[resolvedSessionKey]) target[resolvedSessionKey] = correlation.sessionId;
  return target;
}

function inputCorrelationFromValue(value: unknown): InputCorrelation {
  const candidate: UnknownRecord = isRecord(value) ? value : {};
  return {
    requestId: firstNormalized(candidate, REQUEST_ID_FIELDS),
    inputEventId: firstNormalized(candidate, INPUT_EVENT_ID_FIELDS),
    sessionId: firstNormalized(candidate, SESSION_ID_FIELDS),
    method: normalizeMethod(candidate.method),
  };
}

function firstNormalized(candidate: UnknownRecord, fields: readonly string[]): string | null {
  for (const field of fields) {
    const value = normalizeInputCorrelationId(candidate[field]);
    if (value) return value;
  }
  return null;
}

function normalizeMethod(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function methodsCompatible(left: string | null, right: string | null): boolean {
  if (left === right) return true;
  return Boolean(left && right && OPERATOR_INPUT_METHODS.has(left) && OPERATOR_INPUT_METHODS.has(right));
}

function sessionsCompatible(left: string | null, right: string | null): boolean {
  return !left || !right || left === right;
}

function selectCorrelationMatch(matches: CorrelationRecord[], matchedBy: string): CorrelationMatch | null {
  if (matches.length === 1) return { record: matches[0], matchedBy, ambiguous: false };
  if (matches.length > 1) return { record: null, matchedBy, ambiguous: true };
  return null;
}
