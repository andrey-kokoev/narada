import {
  classifyCarrierInputHold,
  normalizeInputEvent as normalizeCarrierInputEvent,
  observerMetadata as protocolObserverMetadata,
  observerPayload as protocolObserverPayload,
  observerVisibility as protocolObserverVisibility,
  isObserverInputEvent as isProtocolObserverInputEvent,
} from '@narada2/carrier-protocol';
import {
  assertNarsInputAdmissionTransition,
  NARS_INPUT_ADMISSION_STATE_SCHEMA,
} from './input-admission-state.mjs';

export function shouldDeferQueuedInput(event, { rl, promptState } = {}) {
  return classifyCarrierInputHold(inputWithObserverMetadata(event), {
    composerHasDraft: Boolean(promptState?.active && readlineHasNonWhitespaceInput(rl)),
  }).should_defer;
}

function normalizeIdempotencyKey(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeInputEvent(input, defaults = {}, { randomIdFn = defaultRandomId } = {}) {
  const record = normalizeInputRecord(input);
  const receivedAt = defaults.received_at ?? input?.received_at ?? new Date().toISOString();
  const params = input?.params && typeof input.params === 'object' && !Array.isArray(input.params)
    ? input.params
    : {};
  const inputSource = record.source;
  const protocolSourceKind = input?.source_kind ?? params.source_kind ?? sourceKindForInputSource(inputSource);
  const protocolMetadata = {
    ...(params.metadata ?? {}),
    ...(input?.metadata ?? {}),
    input_source: inputSource,
    ...(protocolSourceKind === 'system' && record.directive_id ? { directive_provenance: { kind: 'system_directive' } } : {}),
    ...(inputSource === 'operator_directive' ? { directive_provenance: { kind: 'explicit_operator_directive_surface' } } : {}),
    ...(inputSource === 'observer' && !input?.metadata?.observer ? { observer: defaultObserverMetadata(input) } : {}),
  };
  const protocolEvent = normalizeCarrierInputEvent({
    schema: 'narada.carrier.input_event.v1',
    event_id: input?.event_id ?? `input_${randomIdFn()}`,
    source_kind: protocolSourceKind,
    source_id: input?.source_id ?? params.source_id ?? sourceIdForInputSource(inputSource),
    transport: input?.transport ?? params.transport ?? defaults.transport ?? transportForInputSource(inputSource),
    delivery_mode: input?.delivery_mode ?? params.delivery_mode ?? deliveryModeForInputSource(inputSource),
    hold_condition: input?.hold_condition ?? params.hold_condition ?? null,
    content: record.content,
    created_at: receivedAt,
    authority_ref: record.authority_ref ?? params.authority_ref ?? null,
    directive_id: input?.directive_id ?? params.directive_id ?? record.directive_id ?? null,
    metadata: protocolMetadata,
  });
  return {
    ...protocolEvent,
    received_at: protocolEvent.created_at,
    content: record.content,
    source: inputSource,
    authority_ref: record.authority_ref,
    directive_id: protocolEvent.directive_id,
    request_id: input?.request_id ?? null,
    idempotency_key: normalizeIdempotencyKey(input?.idempotency_key ?? input?.params?.idempotency_key),
    transport: protocolEvent.transport,
  };
}

export function normalizeInputRecord(input) {
  if (typeof input === 'string') return { content: input, source: 'manual_operator' };
  const params = input?.params && typeof input.params === 'object' && !Array.isArray(input.params)
    ? input.params
    : {};
  const source = input?.source ?? params.source;
  const sourceKind = input?.source_kind ?? params.source_kind;
  const deliveryMode = input?.delivery_mode ?? params.delivery_mode;
  const metadata = input?.metadata ?? params.metadata;
  if (metadata?.observer || source === 'observer') {
    return {
      content: String(input?.content ?? params.content ?? params.message ?? ''),
      source: 'observer',
      authority_ref: input?.authority_ref ?? null,
      directive_id: input?.directive_id ?? null,
    };
  }
  if (sourceKind === 'system' && !source) {
    return {
      content: String(input?.content ?? params.content ?? params.message ?? ''),
      source: 'system_directive',
      authority_ref: input?.authority_ref ?? params.authority_ref ?? null,
      directive_id: input?.directive_id ?? params.directive_id ?? null,
    };
  }
  if (deliveryMode === 'admit_after_active_turn' && !source) {
    return {
      content: String(input?.content ?? params.content ?? params.message ?? ''),
      source: 'operator_steering',
      authority_ref: input?.authority_ref ?? params.authority_ref ?? null,
      directive_id: input?.directive_id ?? params.directive_id ?? null,
    };
  }
  return {
    content: String(input?.content ?? params.content ?? params.message ?? ''),
    source: source ?? 'manual_operator',
    authority_ref: input?.authority_ref ?? params.authority_ref ?? null,
    directive_id: input?.directive_id ?? params.directive_id ?? null,
  };
}

export function isObserverInputEvent(input, record = null) {
  return Boolean(isProtocolObserverInputEvent(input) || input?.source === 'observer' || record?.source === 'observer');
}

export function observerMetadata(input = {}) {
  return protocolObserverMetadata(input) ?? defaultObserverMetadata(input);
}

export function observerVisibility(input = {}) {
  return isProtocolObserverInputEvent(input)
    ? protocolObserverVisibility(input)
    : protocolObserverVisibility(inputWithObserverMetadata(input));
}

export function observerPayload(input = {}, extra = {}) {
  return protocolObserverPayload(inputWithObserverMetadata(input), extra);
}

export function inputWithObserverMetadata(input = {}) {
  if (isProtocolObserverInputEvent(input)) return input;
  if (input?.source !== 'observer') return input;
  return {
    ...input,
    metadata: {
      ...(input.metadata ?? {}),
      observer: defaultObserverMetadata(input),
    },
  };
}

function defaultDirectiveEvidence(event, { agentId = null, carrierSessionId = null } = {}) {
  return {
    input_event_id: event.event_id,
    directive_id: event.directive_id,
    ...(event.request_id ? { request_id: event.request_id } : {}),
    ...(carrierSessionId ? { carrier_session_id: carrierSessionId } : {}),
    ...(agentId ? { agent_id: agentId } : {}),
    ...(event.transport ? { transport: event.transport } : {}),
  };
}

function defaultDirectiveAcceptedEvidence(event, context = {}) {
  return {
    ...defaultDirectiveEvidence(event, context),
    acceptance_semantics: 'carrier_started_directive_turn',
  };
}

export function createInputQueue({
  drain,
  shouldDefer = () => false,
  onDeferred = null,
  appendSessionFn = () => {},
  sessionEventEntryFn = (event, payload) => ({ event, ...payload }),
  carrierSessionEventEntryFn = (event_kind, payload) => ({ event_kind, payload }),
  noteSessionActivityFn = () => {},
  recordObserverInputQueuedFn = () => {},
  onInputAcceptedFn = () => {},
  assertEnqueueAllowedFn = () => {},
  onQueueStateChangedFn = () => {},
  initialPending = [],
  initialIdempotencyRecords = [],
  classifyInputRuntimeQueueAdmissionFn = () => ({ queue_events: [] }),
  classifyInputRuntimeAdmissionFn = () => ({ admission_events: [] }),
  classifyInputRuntimeHoldFn = (event, state) => classifyCarrierInputHold(inputWithObserverMetadata(event), state),
  directiveReceiptEvidenceFn = defaultDirectiveEvidence,
  directiveAcceptedEvidenceFn = defaultDirectiveAcceptedEvidence,
  identity = null,
  session = null,
  transcriptDisplaySettings = {},
  randomIdFn = defaultRandomId,
} = {}) {
  const pending = Array.isArray(initialPending)
    ? initialPending.map((event) => normalizeQueuedInputEvent(event, randomIdFn))
    : [];
  const idempotencyRecords = new Map();
  for (const event of initialIdempotencyRecords ?? []) rememberIdempotencyEvent(event);
  for (const event of pending) {
    if (event.idempotency_key && !idempotencyRecords.has(event.idempotency_key)) {
      idempotencyRecords.set(event.idempotency_key, {
        event_id: event.event_id,
        request_id: event.request_id ?? null,
        idempotency_key: event.idempotency_key,
        terminal_state: null,
      });
    }
  }
  const state = {
    running: false,
    activeDrainPromise: null,
    drainUntilIdlePromise: null,
    deferredNotified: new Set(),
    heldSystemDirectives: new Set(),
  };
  return {
    get isRunning() { return state.running; },
    get pendingCount() { return pending.length; },
    get pendingSystemDirectiveCount() { return pending.filter((event) => event.source === 'system_directive').length; },
    get pendingOperatorDirectiveCount() { return pending.filter((event) => event.source === 'operator_steering').length; },
    get pendingObserverCount() { return pending.filter((event) => isObserverInputEvent(event)).length; },
    enqueue: async (event, options = {}) => {
      assertEnqueueAllowedFn(event, options);
      const normalized = normalizeInputEvent(event, {}, { randomIdFn });
      const existingIdempotency = normalized.idempotency_key ? idempotencyRecords.get(normalized.idempotency_key) : null;
      if (existingIdempotency) {
        appendSessionFn(sessionEventEntryFn('input_event_deduplicated', {
          event_id: normalized.event_id,
          input_event_id: normalized.event_id,
          ...(normalized.request_id ? { request_id: normalized.request_id } : {}),
          method: event?.method ?? 'session.submit',
          idempotency_key: normalized.idempotency_key,
          original_event_id: existingIdempotency.event_id ?? null,
          original_request_id: existingIdempotency.request_id ?? null,
          terminal_state: existingIdempotency.terminal_state ?? null,
          deduplication_state: 'reused_existing_operation',
        }));
        if (options.drain) await waitForIdle();
        const settled = normalized.idempotency_key ? idempotencyRecords.get(normalized.idempotency_key) : existingIdempotency;
        return {
          ...normalized,
          admission_state: 'accepted',
          deduplicated: true,
          original_event_id: settled?.event_id ?? existingIdempotency.event_id ?? null,
          original_request_id: settled?.request_id ?? existingIdempotency.request_id ?? null,
          terminal_state: settled?.terminal_state ?? 'completed',
        };
      }
      normalized.admission_state = null;
      if (normalized.idempotency_key) idempotencyRecords.set(normalized.idempotency_key, {
        event_id: normalized.event_id,
        request_id: normalized.request_id ?? null,
        idempotency_key: normalized.idempotency_key,
        terminal_state: null,
      });
      pending.push(normalized);
      transitionAdmission(normalized, 'accepted', { reason: 'input_received' });
      persistQueueState('accepted', normalized);
      const queuedAdmission = transitionAdmission(normalized, 'queued', { reason: 'queued_for_turn' });
      persistQueueState('queued', normalized);
      noteSessionActivityFn(options.state, 'input_event_queued', normalized.created_at ?? normalized.received_at ?? new Date().toISOString());
      appendSessionFn(sessionEventEntryFn('input_event_queued', {
        event_id: normalized.event_id,
        ...(normalized.request_id ? { request_id: normalized.request_id } : {}),
        source: normalized.source,
        transport: normalized.transport,
        source_kind: normalized.source_kind,
        authority_ref: normalized.authority_ref,
        directive_id: normalized.directive_id,
        idempotency_key: normalized.idempotency_key,
        turn_id: normalized.event_id,
        turn_state: 'accepted',
        admission_state_schema: NARS_INPUT_ADMISSION_STATE_SCHEMA,
        admission_previous_state: queuedAdmission.previous_state,
        admission_state: queuedAdmission.admission_state,
      }));
      onInputAcceptedFn(normalized);
      recordObserverInputQueuedFn(normalized);
      const queueAdmission = classifyInputRuntimeQueueAdmissionFn(normalized, transcriptDisplaySettings, {
        activeTurn: state.running,
      });
      for (const queueEvent of queueAdmission.queue_events ?? []) {
        appendSessionFn(carrierSessionEventEntryFn(queueEvent.event_kind, {
          ...queueEvent.payload,
          ...(normalized.request_id ? { request_id: normalized.request_id } : {}),
        }));
      }
      if (options.drain) await drainUntilIdle();
      return normalized;
    },
    drainOnce,
    drainUntilIdle,
    waitForIdle,
    state: queueSnapshot,
    items: queueItems,
    admissionState: (eventId) => pending.find((event) => event.event_id === eventId)?.admission_state ?? null,
    clearOperatorInput,
    dropOperatorInput,
    clearOperatorSteering,
    dropOperatorSteering,
    finalizeSession,
  };

  function queueSnapshot() {
    return {
      running: state.running,
      pendingCount: pending.length,
      pendingSystemDirectiveCount: pending.filter((event) => event.source === 'system_directive').length,
      pendingOperatorDirectiveCount: pending.filter((event) => event.source === 'operator_steering').length,
      pendingObserverCount: pending.filter((event) => isObserverInputEvent(event)).length,
    };
  }

  function queueItems() {
    return pending.map((event, index) => ({
      index: index + 1,
      event_id: event.event_id,
      request_id: event.request_id ?? null,
      directive_id: event.directive_id ?? null,
      source: event.source,
      source_kind: event.source_kind,
      source_id: event.source_id,
      transport: event.transport,
      delivery_mode: event.delivery_mode,
      idempotency_key: event.idempotency_key ?? null,
      hold_condition: event.hold_condition ?? null,
      admission_state: event.admission_state ?? null,
      created_at: event.created_at,
      received_at: event.received_at,
      content: event.content,
    }));
  }

  function clearOperatorSteering() {
    const dropped = [];
    for (let index = pending.length - 1; index >= 0; index--) {
      if (pending[index].source !== 'operator_steering') continue;
      if (state.running && pending[index] === pending[0]) continue;
      const [event] = pending.splice(index, 1);
      const admission = transitionAdmission(event, 'dropped', { reason: 'queue_clear' });
      dropped.unshift({ event, admission });
    }
    for (const entry of dropped) recordDroppedByOperator(entry.event, 'queue_clear', entry.admission);
    if (dropped.length > 0) persistQueueState('queue_clear', dropped.at(-1).event);
    return dropped.map((entry) => entry.event);
  }

  function dropOperatorSteering(index) {
    const operatorSteering = pending
      .map((event, pendingIndex) => ({ event, pendingIndex }))
      .filter(({ event }) => event.source === 'operator_steering');
    const target = operatorSteering[index - 1];
    if (!target) return null;
    if (state.running && target.pendingIndex === 0) return null;
    const [event] = pending.splice(target.pendingIndex, 1);
    const admission = transitionAdmission(event, 'dropped', { reason: 'queue_drop' });
    recordDroppedByOperator(event, 'queue_drop', admission);
    persistQueueState('queue_drop', event);
    return event;
  }

  function clearOperatorInput() {
    const dropped = [];
    for (let index = pending.length - 1; index >= 0; index--) {
      if (!isOperatorQueuedInput(pending[index])) continue;
      if (state.running && pending[index] === pending[0]) continue;
      const [event] = pending.splice(index, 1);
      const admission = transitionAdmission(event, 'dropped', { reason: 'queue_clear' });
      dropped.unshift({ event, admission });
    }
    for (const entry of dropped) recordDroppedByOperator(entry.event, 'queue_clear', entry.admission);
    if (dropped.length > 0) persistQueueState('queue_clear', dropped.at(-1).event);
    return dropped.map((entry) => entry.event);
  }

  function dropOperatorInput(index) {
    const operatorInput = pending
      .map((event, pendingIndex) => ({ event, pendingIndex }))
      .filter(({ event }) => isOperatorQueuedInput(event));
    const target = operatorInput[index - 1];
    if (!target) return null;
    if (state.running && target.pendingIndex === 0) return null;
    const [event] = pending.splice(target.pendingIndex, 1);
    const admission = transitionAdmission(event, 'dropped', { reason: 'queue_drop' });
    recordDroppedByOperator(event, 'queue_drop', admission);
    persistQueueState('queue_drop', event);
    return event;
  }

  function recordDroppedByOperator(event, dropReason, admission) {
    appendSessionFn(carrierSessionEventEntryFn('input_dropped_by_operator', {
      input_event_id: event.event_id,
      ...(event.idempotency_key ? { idempotency_key: event.idempotency_key } : {}),
      drop_reason: dropReason,
      admission_state_schema: NARS_INPUT_ADMISSION_STATE_SCHEMA,
      admission_previous_state: admission.previous_state,
      admission_state: admission.admission_state,
    }));
  }

  function finalizeSession() {
    const abandoned = pending.splice(state.running ? 1 : 0, pending.length);
    for (const event of abandoned) {
      const admission = transitionAdmission(event, 'abandoned', { reason: 'session_finalize' });
      appendSessionFn(carrierSessionEventEntryFn('input_abandoned_on_session_end', {
        input_event_id: event.event_id,
        ...(event.idempotency_key ? { idempotency_key: event.idempotency_key } : {}),
        admission_state_schema: NARS_INPUT_ADMISSION_STATE_SCHEMA,
        admission_previous_state: admission.previous_state,
        admission_state: admission.admission_state,
      }));
      state.deferredNotified.delete(event.event_id);
      state.heldSystemDirectives.delete(event.event_id);
    }
    if (abandoned.length > 0) persistQueueState('session_finalize', abandoned.at(-1));
    return abandoned;
  }

  async function drainOnce() {
    if (state.running || pending.length === 0) return null;
    const operation = drainOnceInternal();
    state.activeDrainPromise = operation;
    try {
      return await operation;
    } finally {
      if (state.activeDrainPromise === operation) state.activeDrainPromise = null;
    }
  }

  async function drainOnceInternal() {
    if (state.running || pending.length === 0) return null;
    const event = pending[0];
    if (event.admission_state === 'accepted') {
      transitionAdmission(event, 'queued', { reason: 'recovery_queue_resume' });
      persistQueueState('queued', event);
    }
    if (event.admission_state === 'admitted') {
      transitionAdmission(event, 'queued', { reason: 'recovery_requeue_after_admission', recovery: true });
      persistQueueState('recovery_requeued', event);
    }
    if (shouldDefer(event)) {
      if (event && !state.deferredNotified.has(event.event_id)) {
        state.deferredNotified.add(event.event_id);
        const admission = transitionAdmission(event, 'held', { reason: 'input_hold' });
        persistQueueState('held', event);
        recordSystemDirectiveHeld(event, admission);
        onDeferred?.(event, queueSnapshot());
      }
      return null;
    }
    let admission = null;
    if (event.admission_state === 'held') {
      admission = transitionAdmission(event, 'queued', { reason: 'hold_released' });
      persistQueueState('hold_released', event);
      recordSystemDirectiveReleased(event, admission);
    }
    admission = transitionAdmission(event, 'admitted', { reason: 'input_admitted_to_turn' });
    persistQueueState('admitted_to_turn', event);
    state.deferredNotified.delete(event.event_id);
    state.running = true;
    try {
      appendSessionFn(sessionEventEntryFn('input_event_started', {
        event_id: event.event_id,
        ...(event.request_id ? { request_id: event.request_id } : {}),
        source: event.source,
        transport: event.transport,
        authority_ref: event.authority_ref,
        directive_id: event.directive_id,
        idempotency_key: event.idempotency_key ?? null,
        admission_state_schema: NARS_INPUT_ADMISSION_STATE_SCHEMA,
        admission_previous_state: admission.previous_state,
        admission_state: admission.admission_state,
      }));
      const runtimeAdmission = classifyInputRuntimeAdmissionFn(event);
      for (const admissionEvent of runtimeAdmission.admission_events ?? []) {
        if (admissionEvent.event_kind === 'input_admitted_to_turn') {
          appendSessionFn(carrierSessionEventEntryFn(admissionEvent.event_kind, {
            ...admissionEvent.payload,
            admission_state_schema: NARS_INPUT_ADMISSION_STATE_SCHEMA,
            admission_state: event.admission_state,
          }));
        }
      }
      if (event.source === 'system_directive' && event.directive_id) {
        appendSessionFn(sessionEventEntryFn('directive_receipt_recorded', directiveReceiptEvidenceFn(event, {
          agentId: identity,
          carrierSessionId: session,
        })));
        appendSessionFn(sessionEventEntryFn('directive_carrier_accepted_recorded', directiveAcceptedEvidenceFn(event, {
          agentId: identity,
          carrierSessionId: session,
        })));
      }
      const result = await drain(event);
      appendSessionFn(sessionEventEntryFn('input_event_completed', {
        event_id: event.event_id,
        ...(event.request_id ? { request_id: event.request_id } : {}),
        terminal_state: result?.terminal_state ?? 'completed',
        idempotency_key: event.idempotency_key ?? null,
        admission_state_schema: NARS_INPUT_ADMISSION_STATE_SCHEMA,
        admission_state: event.admission_state,
      }));
      appendSessionFn(carrierSessionEventEntryFn('input_completed', {
        input_event_id: event.event_id,
        ...(event.request_id ? { request_id: event.request_id } : {}),
        terminal_state: result?.terminal_state ?? 'completed',
        ...(event.idempotency_key ? { idempotency_key: event.idempotency_key } : {}),
        admission_state_schema: NARS_INPUT_ADMISSION_STATE_SCHEMA,
        admission_state: event.admission_state,
      }));
      pending.shift();
      if (event.idempotency_key) {
        const idempotencyRecord = idempotencyRecords.get(event.idempotency_key);
        if (idempotencyRecord) idempotencyRecord.terminal_state = result?.terminal_state ?? 'completed';
      }
      persistQueueState('completed', event);
      return result;
    } finally {
      state.running = false;
    }
  }

  function recordSystemDirectiveHeld(event, admission) {
    if (state.heldSystemDirectives.has(event.event_id)) return;
    const hold = classifyInputRuntimeHoldFn(event, {
      composerHasDraft: true,
      alreadyHeld: false,
      occurredAt: new Date().toISOString(),
    });
    if (hold.hold_action !== 'hold') return;
    state.heldSystemDirectives.add(event.event_id);
    for (const holdEvent of hold.hold_events ?? []) {
      appendSessionFn(carrierSessionEventEntryFn(holdEvent.event_kind, {
        ...holdEvent.payload,
        admission_state_schema: NARS_INPUT_ADMISSION_STATE_SCHEMA,
        admission_previous_state: admission.previous_state,
        admission_state: admission.admission_state,
      }));
    }
  }

  function recordSystemDirectiveReleased(event, admission) {
    if (!state.heldSystemDirectives.has(event.event_id)) return;
    const release = classifyInputRuntimeHoldFn(event, {
      release: true,
      alreadyHeld: true,
      occurredAt: new Date().toISOString(),
    });
    state.heldSystemDirectives.delete(event.event_id);
    for (const releaseEvent of release.release_events ?? []) {
      appendSessionFn(carrierSessionEventEntryFn(releaseEvent.event_kind, {
        ...releaseEvent.payload,
        admission_state_schema: NARS_INPUT_ADMISSION_STATE_SCHEMA,
        admission_previous_state: admission.previous_state,
        admission_state: admission.admission_state,
      }));
    }
  }

  async function drainUntilIdle() {
    if (state.drainUntilIdlePromise) return state.drainUntilIdlePromise;
    const operation = drainUntilIdleInternal();
    state.drainUntilIdlePromise = operation;
    try {
      return await operation;
    } finally {
      if (state.drainUntilIdlePromise === operation) state.drainUntilIdlePromise = null;
    }
  }

  async function drainUntilIdleInternal() {
    let last = null;
    while (!state.running && pending.length > 0 && !shouldDefer(pending[0])) {
      last = await drainOnce();
    }
    if (!state.running && pending.length > 0 && shouldDefer(pending[0])) await drainOnce();
    return last;
  }

  async function waitForIdle() {
    while (state.running || state.activeDrainPromise || state.drainUntilIdlePromise) {
      const operation = state.activeDrainPromise ?? state.drainUntilIdlePromise;
      if (operation) await operation.catch(() => {});
      else await Promise.resolve();
    }
    return queueSnapshot();
  }

  function persistQueueState(transition, event = null) {
    onQueueStateChangedFn({
      snapshot: queueSnapshot(),
      pending: queueItems().map((item) => pending[item.index - 1] ?? item),
      items: queueItems(),
      transition,
      event,
    });
  }

  function transitionAdmission(event, nextState, evidence = {}) {
    const previousState = event.admission_state ?? null;
    assertNarsInputAdmissionTransition(previousState, nextState, evidence);
    if (previousState === nextState) {
      return {
        schema: NARS_INPUT_ADMISSION_STATE_SCHEMA,
        input_event_id: event.event_id,
        previous_state: previousState,
        admission_state: nextState,
        reason: evidence.reason ?? null,
        recovery: evidence.recovery === true,
      };
    }
    event.admission_state = nextState;
    return {
      schema: NARS_INPUT_ADMISSION_STATE_SCHEMA,
      input_event_id: event.event_id,
      previous_state: previousState,
      admission_state: nextState,
      reason: evidence.reason ?? null,
      recovery: evidence.recovery === true,
    };
  }

  function rememberIdempotencyEvent(event) {
    const key = normalizeIdempotencyKey(event?.idempotency_key ?? event?.params?.idempotency_key);
    if (!key) return;
    const existing = idempotencyRecords.get(key) ?? {};
    const isDeduplicationRecord = event?.event === 'input_event_deduplicated' || event?.event_kind === 'input_event_deduplicated';
    idempotencyRecords.set(key, {
      event_id: isDeduplicationRecord
        ? event?.original_event_id ?? existing.event_id ?? null
        : event?.event_id ?? event?.input_event_id ?? existing.event_id ?? null,
      request_id: isDeduplicationRecord
        ? event?.original_request_id ?? existing.request_id ?? null
        : event?.request_id ?? existing.request_id ?? null,
      idempotency_key: key,
      terminal_state: event?.terminal_state ?? existing.terminal_state ?? null,
    });
  }
}

function isOperatorQueuedInput(event = {}) {
  if (event.source_kind === 'operator') return true;
  return ['manual_operator', 'programmatic_operator', 'operator_directive', 'operator_steering'].includes(event.source);
}

export function readlineHasPartialInput(rl) {
  return Boolean(rl && typeof rl.line === 'string' && rl.line.length > 0);
}

export function readlineHasNonWhitespaceInput(rl) {
  return Boolean(rl && typeof rl.line === 'string' && rl.line.trim().length > 0);
}

function transportForInputSource(source) {
  if (source === 'automation_jsonl') return 'control_jsonl';
  if (source === 'observer') return 'control_jsonl';
  if (source === 'programmatic_operator' || source === 'operator_directive' || source === 'system_directive') return 'carrier_server_api';
  return 'interactive_terminal';
}

function sourceKindForInputSource(source) {
  if (source === 'system_directive') return 'system';
  if (source === 'observer') return 'agent';
  return 'operator';
}

function sourceIdForInputSource(source) {
  if (source === 'system_directive') return 'narada.carrier-runtime.system_directive';
  if (source === 'observer') return 'narada.observer';
  return 'operator';
}

function deliveryModeForInputSource(source) {
  if (source === 'operator_steering' || source === 'observer') return 'admit_after_active_turn';
  return 'admit_for_current_turn';
}

function defaultObserverMetadata(input = {}) {
  return {
    role: 'observer',
    rule_id: input?.rule_id ?? 'manual-observer-interjection',
    visibility: input?.visibility ?? 'operator_visible',
    ...(input?.confidence ? { confidence: input.confidence } : {}),
  };
}

function defaultRandomId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeQueuedInputEvent(event, randomIdFn) {
  const normalized = normalizeInputEvent(event, {}, { randomIdFn });
  normalized.admission_state = event?.admission_state ?? 'queued';
  return normalized;
}
