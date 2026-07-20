const TASK_EXECUTABILITY_FOLLOW_UP_SCHEMA = 'narada.task.executability.follow_up.v1';
const MAX_TRACKED_REQUESTS = 256;
const MAX_ID_LENGTH = 160;
const MAX_DIGEST_LENGTH = 128;
const SUCCESS_STATUSES = new Set(['completed', 'ok', 'success']);

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function boundedString(value, maxLength) {
  return typeof value === 'string' && value.trim() && value.length <= maxLength ? value.trim() : null;
}

function validDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{32,128}$/iu.test(value);
}

function structuredResultCandidates(result) {
  if (!isObject(result)) return [];
  return [
    result.structuredContent,
    result.structured_content,
    isObject(result.result) ? result.result.structuredContent : null,
    isObject(result.result) ? result.result.structured_content : null,
  ].filter(isObject);
}

function followUpFromResult(result) {
  for (const candidate of structuredResultCandidates(result)) {
    if (candidate.schema === TASK_EXECUTABILITY_FOLLOW_UP_SCHEMA) return candidate;
    if (candidate.schema === 'narada.task.create.v0' && isObject(candidate.follow_up)) return candidate.follow_up;
  }
  return null;
}

function successfulToolResultFromEvent(event) {
  if (!isObject(event)) return null;
  if (event.event === 'item.completed') {
    if (event.item?.type !== 'mcp_tool_call' || !SUCCESS_STATUSES.has(String(event.item.status ?? 'completed'))) return null;
    return event.item.result;
  }
  if (event.event === 'tool_result') {
    const status = event.status ?? event.terminal_state ?? 'completed';
    if (!SUCCESS_STATUSES.has(String(status))) return null;
    return event.result ?? event.structuredContent ?? event.structured_content ?? event.payload ?? null;
  }
  return null;
}

function validateFollowUp(candidate) {
  if (!isObject(candidate)) return null;
  if (candidate.schema !== TASK_EXECUTABILITY_FOLLOW_UP_SCHEMA || candidate.version !== 1) return null;
  if (candidate.source?.surface !== 'task_lifecycle' || candidate.source?.operation !== 'task_lifecycle_create') return null;
  if (candidate.trigger !== 'on_create' || !['enqueued', 'existing'].includes(candidate.status)) return null;
  const requestId = boundedString(candidate.request_id, MAX_ID_LENGTH);
  const taskId = boundedString(candidate.task_id, MAX_ID_LENGTH);
  const taskSpecDigest = boundedString(candidate.task_spec_digest, MAX_DIGEST_LENGTH);
  const environmentDigest = boundedString(candidate.environment_digest, MAX_DIGEST_LENGTH);
  const evaluatorProfile = boundedString(candidate.evaluator_profile, MAX_ID_LENGTH);
  const evaluatorProfileVersion = boundedString(candidate.evaluator_profile_version, MAX_ID_LENGTH);
  if (!requestId || !taskId || !validDigest(taskSpecDigest) || !validDigest(environmentDigest)
    || !evaluatorProfile || !evaluatorProfileVersion || !Number.isInteger(candidate.task_number) || candidate.task_number < 1) {
    return null;
  }
  return {
    schema: candidate.schema,
    version: candidate.version,
    source: { surface: candidate.source.surface, operation: candidate.source.operation },
    trigger: candidate.trigger,
    status: candidate.status,
    request_id: requestId,
    task_id: taskId,
    task_number: candidate.task_number,
    task_spec_digest: taskSpecDigest,
    environment_digest: environmentDigest,
    evaluator_profile: evaluatorProfile,
    evaluator_profile_version: evaluatorProfileVersion,
  };
}

function boundedError(error) {
  return String(error instanceof Error ? error.message : error ?? 'unknown_error').slice(0, 240);
}

function dispatchKey(followUp) {
  return [followUp.request_id, followUp.task_spec_digest, followUp.environment_digest].join(':');
}

/**
 * Create the NARS-side asynchronous adapter for durable task-assessment requests.
 * The dispatch callback is the authority boundary: NARS schedules it but never
 * reads or mutates Task Lifecycle state itself.
 */
export function createNarsTaskExecutabilityDispatchHook({
  dispatch,
  emit = () => {},
  schedule = (callback) => queueMicrotask(callback),
  clock = () => new Date().toISOString(),
  maxTracked = MAX_TRACKED_REQUESTS,
} = {}) {
  if (typeof dispatch !== 'function') throw new TypeError('task_executability_dispatch_callback_required');
  const tracked = new Set();
  const pending = new Map();
  const deferred = new Set();
  let closed = false;

  const emitPosture = (event, followUp, extra = {}) => {
    emit({
      schema: 'narada.nars.task_executability_dispatch.v1',
      event,
      timestamp: clock(),
      request_id: followUp.request_id,
      task_id: followUp.task_id,
      task_number: followUp.task_number,
      ...extra,
    });
  };

  const run = async (key, followUp, lifecyclePayload) => {
    pending.delete(key);
    if (deferred.delete(key)) {
      return { status: 'deferred_to_reconciliation', request_id: followUp.request_id };
    }
    if (closed) {
      return { status: 'deferred_to_reconciliation', request_id: followUp.request_id };
    }
    emitPosture('task_executability_assessment_dispatched', followUp);
    try {
      const result = await dispatch({
        follow_up: followUp,
        lifecycle_payload: lifecyclePayload,
      });
      emitPosture('task_executability_assessment_completed', followUp, { result: isObject(result) ? result : { value: result } });
      return { status: 'completed', request_id: followUp.request_id, result };
    } catch (error) {
      emitPosture('task_executability_assessment_failed', followUp, { error: boundedError(error) });
      return { status: 'failed', request_id: followUp.request_id, error: boundedError(error) };
    }
  };

  return {
    onToolResult(payload) {
      const sourceEvent = payload?.source_event;
      const followUp = validateFollowUp(followUpFromResult(successfulToolResultFromEvent(sourceEvent)));
      if (!followUp) return { status: 'ignored', reason: 'structured_follow_up_not_admitted' };
      const key = dispatchKey(followUp);
      if (tracked.has(key) || pending.has(key)) return { status: 'duplicate', request_id: followUp.request_id };
      tracked.add(key);
      while (tracked.size > Math.max(1, Math.min(Number(maxTracked) || MAX_TRACKED_REQUESTS, MAX_TRACKED_REQUESTS))) {
        tracked.delete(tracked.values().next().value);
      }
      emitPosture('task_executability_assessment_accepted', followUp);
      const scheduled = () => { void run(key, followUp, payload); };
      try {
        pending.set(key, followUp);
        schedule(scheduled);
      } catch (error) {
        pending.delete(key);
        emitPosture('task_executability_assessment_failed', followUp, { error: boundedError(error) });
        return { status: 'failed', request_id: followUp.request_id, error: boundedError(error) };
      }
      return { status: 'accepted', request_id: followUp.request_id };
    },
    async close({ reason = 'runtime_shutdown' } = {}) {
      if (closed) return { status: 'already_closed' };
      closed = true;
      for (const [key, followUp] of pending.entries()) {
        deferred.add(key);
        emitPosture('task_executability_assessment_deferred_to_reconciliation', followUp, { reason });
      }
      pending.clear();
      return { status: 'closed' };
    },
    get pendingCount() {
      return pending.size;
    },
    get closed() {
      return closed;
    },
  };
}

export {
  TASK_EXECUTABILITY_FOLLOW_UP_SCHEMA,
  validateFollowUp,
};
