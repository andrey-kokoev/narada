import { NarsKernelContractError } from '@narada2/nars-intelligence-kernel-contract';
import { SUPPORTED_PI_EVENT_KINDS } from '../pi/pi-version-capabilities.js';

const EVENT_CLASSIFICATIONS: any = Object.freeze({
  assistant_token: 'assistant_streaming_fragment',
  assistant_message: 'assistant_message_candidate',
  provider_telemetry: 'provider_telemetry',
  usage: 'usage_telemetry',
  usage_update: 'usage_telemetry',
  tool_call: 'tool_request',
  tool_result: 'tool_result_candidate',
  tool_execution: 'tool_execution_telemetry',
  tool_execution_telemetry: 'tool_execution_telemetry',
  retry: 'retry_telemetry',
  compaction: 'compaction_telemetry',
  cancellation: 'cancellation_evidence',
  // A provider failure is evidence that the current turn may fail; only
  // session-core can promote it to the canonical turn_failed event.
  provider_failure: 'turn_failure_candidate',
  turn_failure: 'turn_failure_candidate',
  turn_failure_candidate: 'turn_failure_candidate',
  turn_failed: 'turn_failure_candidate',
  turn_complete: 'turn_completion_candidate',
  process_exit: 'kernel_failure',
});

const EXTERNAL_EVENT_ALIASES: any = Object.freeze({
  message_start: 'provider_telemetry',
  message_end: 'assistant_message',
  turn_start: 'provider_telemetry',
  tool_execution_start: 'tool_execution',
  tool_execution_update: 'tool_execution_telemetry',
  tool_execution_end: 'tool_result',
  auto_retry_start: 'retry',
  auto_retry_end: 'retry',
  summarization_retry_scheduled: 'retry',
  summarization_retry_attempt_start: 'retry',
  summarization_retry_finished: 'retry',
  compaction_start: 'compaction',
  compaction_end: 'compaction',
  turn_end: 'turn_complete',
  agent_end: 'turn_complete',
  agent_start: 'provider_telemetry',
  queue_update: 'provider_telemetry',
  session_shutdown: 'process_exit',
  // Canonical NARS provider adapters deliver these through the same
  // observation sink. They are provider telemetry, not an unsupported Pi
  // event vocabulary, and must remain diagnostic evidence at this boundary.
  provider_invocation_state_transition: 'provider_telemetry',
  agent_settled: 'provider_telemetry',
  turn_failed: 'turn_failure',
});

function eventKind(event: any) {
  const raw: any = String(event?.kind ?? event?.type ?? event?.event ?? '').trim();
  if (raw !== 'message_update') return EXTERNAL_EVENT_ALIASES[raw] ?? raw;
  const messageEventType: any = String(event?.assistantMessageEvent?.type ?? '').trim();
  if (messageEventType === 'text_delta') return 'assistant_token';
  if (messageEventType === 'toolcall_end') return 'tool_call';
  if (messageEventType === 'error') {
    return event?.assistantMessageEvent?.reason === 'aborted' ? 'cancellation' : 'provider_failure';
  }
  if (['done', 'text_end'].includes(messageEventType)) return 'assistant_message';
  return 'provider_telemetry';
}

function normalizedEvent(event: any) {
  const rawKind: any = String(event?.kind ?? event?.type ?? event?.event ?? '').trim();
  const kind: any = eventKind(event);
  if (!rawKind || rawKind === kind) return event;
  const assistantEvent: any = event?.assistantMessageEvent;
  const toolCall: any = assistantEvent?.toolCall ?? assistantEvent?.tool_call;
  return {
    ...event,
    kind,
    source_event_type: rawKind,
    ...(kind === 'assistant_token' && typeof assistantEvent?.delta === 'string'
      ? { content: assistantEvent.delta }
      : {}),
    ...(kind === 'tool_call' && toolCall && typeof toolCall === 'object'
      ? {
        id: event.id ?? toolCall.id ?? event.toolCallId ?? event.tool_call_id ?? null,
        tool_name: event.toolName ?? event.tool_name ?? toolCall.name ?? null,
        arguments: toolCall.arguments ?? toolCall.input ?? null,
      }
      : {}),
    ...(kind === 'assistant_message' && !event.message && assistantEvent?.partial
      ? { message: assistantEvent.partial }
      : {}),
    ...(kind === 'tool_execution' || kind === 'tool_execution_telemetry' || kind === 'tool_result'
      ? {
        // A tool call id correlates lifecycle records; it is not the event
        // identity. Start/update/end records intentionally share it.
        ...(event.id ? { id: event.id } : {}),
        tool_call_id: event.toolCallId ?? event.tool_call_id ?? null,
        tool_name: event.toolName ?? event.tool_name ?? null,
      }
      : {}),
  };
}

const SENSITIVE_KEYS: any = new Set([
  'apikey',
  'accesstoken',
  'clientsecret',
  'authorization',
  'credential',
  'password',
  'refreshtoken',
  'secret',
  'token',
  'privatekey',
]);

function normalizedKey(key: any) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveKey(key: any) {
  const normalized: any = normalizedKey(key);
  return SENSITIVE_KEYS.has(normalized)
    || normalized.includes('apikey')
    || normalized.includes('accesstoken')
    || normalized.includes('refreshtoken')
    || normalized.includes('clientsecret')
    || normalized.includes('privatekey')
    || normalized.includes('accesskey')
    || normalized.includes('secret')
    || normalized.includes('credential')
    || normalized.endsWith('password')
    || normalized.endsWith('token');
}

function safePayload(value: any, seen: any = new Set(), key: any = null) {
  // Keep provider message candidates as diagnostic payloads; recursively
  // sanitize their fields instead of dropping the whole candidate. They are
  // still observations, never canonical NARS assistant events.
  if (key && (isSensitiveKey(key) || normalizedKey(key) === 'raw')) {
    return undefined;
  }
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'object' || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    return undefined;
  }
  if (seen.has(value)) return undefined;
  seen.add(value);
  let result: any;
  if (Array.isArray(value)) {
    result = value.map((item: any) => safePayload(item, seen)).filter((item: any) => item !== undefined);
  } else {
    result = {};
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      const safeValue: any = safePayload(nestedValue, seen, nestedKey);
      if (safeValue !== undefined) result[nestedKey] = safeValue;
    }
  }
  seen.delete(value);
  return result;
}

/**
 * Translate one Pi observation into diagnostic NARS-kernel evidence. This
 * function intentionally never returns a canonical user/assistant/tool event.
 */
export function normalizePiEvent(event: any, {
  turnId = null,
  inputId = null,
  sequence = 0,
  seenEventIds = new Set(),
}: any = {}) {
  const projectedEvent: any = normalizedEvent(event);
  const kind: any = eventKind(projectedEvent);
  const eventId: any = typeof projectedEvent?.id === 'string' && projectedEvent.id.trim() ? projectedEvent.id.trim() : null;
  if (!kind) {
    return {
      duplicate: false,
      out_of_order: false,
      classification: 'malformed_event',
      observation: {
        kind: 'pi_event_malformed',
        turn_id: turnId,
        input_id: inputId,
        observed_sequence: sequence,
        reason: 'event_kind_missing',
      },
    };
  }
  if (eventId && seenEventIds.has(eventId)) {
    return {
      duplicate: true,
      out_of_order: false,
      classification: 'duplicate_event',
      observation: {
        kind: 'pi_event_duplicate',
        turn_id: turnId,
        input_id: inputId,
        event_id: eventId,
        observed_sequence: sequence,
      },
    };
  }
  if (eventId) seenEventIds.add(eventId);
  const unsupported: any = !SUPPORTED_PI_EVENT_KINDS.includes(kind);
  const sourceSequence: any = Number.isFinite(Number(projectedEvent?.sequence)) ? Number(projectedEvent.sequence) : null;
  const outOfOrder: any = sourceSequence != null && sourceSequence < sequence;
  return {
    duplicate: false,
    out_of_order: outOfOrder,
    classification: unsupported ? 'unsupported_event' : EVENT_CLASSIFICATIONS[kind],
    observation: {
      kind: unsupported ? 'pi_event_unsupported' : 'pi_event_observed',
      turn_id: turnId,
      input_id: inputId,
      pi_event_kind: kind,
      pi_event_id: eventId,
      pi_sequence: sourceSequence,
      observed_sequence: sequence,
      classification: unsupported ? 'unsupported_event' : EVENT_CLASSIFICATIONS[kind],
      out_of_order: outOfOrder,
      payload: safePayload(projectedEvent),
    },
  };
}

export function createPiEventAdapter({ eventSink = async () => {}, onObservation = async () => {}, now = () => new Date().toISOString() }: any = {}) {
  let sequence: any = 0;
  let lastSourceSequence: any = null;
  const seenEventIds: any = new Set();
  // Pi SDK event callbacks are allowed to arrive concurrently.  Serialize
  // normalization and emission so the durable observation order is the
  // adapter's input order rather than whichever callback happens to finish
  // first.  A rejected observation must not poison the queue for later
  // observations.
  let observationTail: any = Promise.resolve();

  const observeOne: any = async (event: any, context: any, nextSequence: any) => {
    const normalized: any = normalizePiEvent(event, { ...context, sequence: lastSourceSequence ?? nextSequence, seenEventIds });
    const sourceSequence: any = Number.isFinite(Number(event?.sequence)) ? Number(event.sequence) : null;
    if (sourceSequence != null) {
      lastSourceSequence = lastSourceSequence == null
        ? sourceSequence
        : Math.max(lastSourceSequence, sourceSequence);
    }
    if (normalized.duplicate) {
      await eventSink({
        ...normalized.observation,
        kernel_observation_sequence: nextSequence,
        timestamp: now(),
      });
      await onObservation(normalized);
      return normalized;
    }
    await eventSink({
      ...normalized.observation,
      kernel_observation_sequence: nextSequence,
      timestamp: now(),
    });
    await onObservation(normalized);
    return normalized;
  };

  return Object.freeze({
    async observe(event: any, context: any = {}) {
      const nextSequence: any = ++sequence;
      const observation: any = observationTail.then(() => observeOne(event, context, nextSequence));
      observationTail = observation.catch(() => {});
      return observation;
    },
    sequence: () => sequence,
    reset() {
      sequence = 0;
      lastSourceSequence = null;
      seenEventIds.clear();
      observationTail = Promise.resolve();
    },
  });
}

export function assertNoCanonicalPiEvent(event: any) {
  if (['user_message', 'assistant_message', 'tool_requested', 'tool_admitted', 'tool_refused', 'turn_complete'].includes(event?.kind)) {
    throw new NarsKernelContractError('pi_canonical_event_forbidden', `Pi event '${event.kind}' cannot be emitted as a canonical NARS event.`);
  }
  return event;
}

export { EVENT_CLASSIFICATIONS };
