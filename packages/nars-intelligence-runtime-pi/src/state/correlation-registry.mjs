import { NarsKernelContractError } from '@narada2/nars-intelligence-kernel-contract';

function value(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Bounded correlation state; it is diagnostic state, never session authority. */
export function createCorrelationRegistry({ maxEntries = 2048 } = {}) {
  // Honor the caller's bound, including small bounds used by constrained
  // runtimes and conformance tests. The registry is diagnostic state, so one
  // retained record is the smallest useful limit.
  const limit = Math.max(1, Math.trunc(Number(maxEntries) || 2048));
  const records = new Map();
  let nextSequence = 0;
  function keyFor(record) {
    return value(record.idempotency_key)
      ?? value(record.input_id)
      ?? value(record.turn_id)
      ?? value(record.runtime_request_id)
      ?? `correlation:${++nextSequence}`;
  }
  function register(record = {}) {
    const normalized = {
      runtime_request_id: value(record.runtime_request_id),
      input_id: value(record.input_id),
      idempotency_key: value(record.idempotency_key),
      turn_id: value(record.turn_id),
      turn_attempt: Number.isFinite(Number(record.turn_attempt)) ? Math.trunc(Number(record.turn_attempt)) : 1,
      provider_request_attempt: Number.isFinite(Number(record.provider_request_attempt))
        ? Math.max(0, Math.trunc(Number(record.provider_request_attempt)))
        : null,
      pi_request_id: value(record.pi_request_id),
      pi_session_id: value(record.pi_session_id),
      pi_message_id: value(record.pi_message_id),
      pi_tool_call_id: value(record.pi_tool_call_id),
      registered_at: record.registered_at ?? new Date().toISOString(),
    };
    const key = keyFor(normalized);
    const existing = records.get(key);
    const sameInvocation = existing
      && ['runtime_request_id', 'input_id', 'idempotency_key', 'turn_id', 'pi_session_id']
        .every((field) => existing[field] === normalized[field]);
    if (existing && !sameInvocation) {
      throw new NarsKernelContractError('kernel_correlation_conflict', `Correlation key '${key}' is already bound to a different request.`, { key, existing, candidate: normalized });
    }
    if (existing && sameInvocation) {
      const refreshed = Object.freeze({
        ...existing,
        ...normalized,
        correlation_key: key,
        registered_at: existing.registered_at,
      });
      records.delete(key);
      records.set(key, refreshed);
      return refreshed;
    }
    records.delete(key);
    records.set(key, Object.freeze({ ...normalized, correlation_key: key }));
    while (records.size > limit) records.delete(records.keys().next().value);
    return records.get(key);
  }
  return Object.freeze({
    register,
    get: (key) => records.get(String(key)) ?? null,
    values: () => [...records.values()],
    size: () => records.size,
    clear: () => records.clear(),
  });
}
