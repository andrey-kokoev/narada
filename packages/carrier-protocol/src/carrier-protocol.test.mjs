import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CARRIER_PROTOCOL_SCHEMAS,
  CONTROL_INPUT_EVENT_SCHEMA,
  INPUT_EVENT_SCHEMA,
  PAYLOAD_REF_SCHEMA,
  PAYLOAD_POLICY_SCHEMA,
  SESSION_EVENT_SCHEMA,
  TURN_TERMINAL_PAYLOAD_SCHEMA,
  assertValidControlInputRecord,
  assertValidInputEvent,
  assertValidPayloadRef,
  assertValidSessionEvent,
  classifyInputAdmission,
  createCarrierDiagnosticSessionEvent,
  createControlInputRecord,
  createInputEvent,
  createInterruptRequestedSessionEvent,
  createPayloadRef,
  createPayloadPolicy,
  createQueueLifecycleSessionEvent,
  createSessionEvent,
  isTerminalTurnState,
  normalizeControlInputRecord,
  normalizeInputEvent,
  normalizeLegacyInputRecord,
  validateControlInputRecord,
  validateInputEvent,
  validatePayloadRef,
  validatePayloadPolicy,
  validateSessionEvent,
} from './carrier-protocol.mjs';

function thrownMessage(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function readFixture(name) {
  const path = join(fileURLToPath(new URL('../fixtures', import.meta.url)), name);
  return JSON.parse(readFileSync(path, 'utf8'));
}

const baseInput = {
  event_id: 'input_test_1',
  source_kind: 'operator',
  source_id: 'operator',
  transport: 'interactive_terminal',
  delivery_mode: 'admit_for_current_turn',
  content: 'run startup sequence',
  created_at: '2026-05-30T00:00:00.000Z',
};

assert.equal(CARRIER_PROTOCOL_SCHEMAS.input_event.schema, INPUT_EVENT_SCHEMA);
assert.deepEqual(validateInputEvent(readFixture('input-event.json')), []);
assert.deepEqual(validateControlInputRecord(readFixture('control-input-event.json')), []);
assert.deepEqual(validateSessionEvent(readFixture('session-event.json')), []);
assert.deepEqual(validatePayloadRef(readFixture('payload-ref.json')), []);
assert.deepEqual(validatePayloadPolicy(readFixture('payload-policy.json')), []);

const input = createInputEvent(baseInput);
assert.equal(input.schema, INPUT_EVENT_SCHEMA);
assert.equal(input.hold_condition, null);
assert.deepEqual(validateInputEvent(input), []);
assert.doesNotThrow(() => assertValidInputEvent(input));
assert.equal(createInputEvent({ ...baseInput, event_id: undefined }).event_id.startsWith('input_'), true);

assert.match(thrownMessage(() => createInputEvent({ ...baseInput, created_at: '2026-05-30' })), /invalid_created_at/);
assert.match(thrownMessage(() => createInputEvent({ ...baseInput, metadata: [] })), /invalid_metadata/);
assert.match(thrownMessage(() => createInputEvent({ ...baseInput, authority_ref: 1 })), /invalid_authority_ref/);
assert.match(thrownMessage(() => createInputEvent({ ...baseInput, hold_condition: 'wait' })), /invalid_hold_condition/);

const legacyTransport = normalizeInputEvent({ ...input, event_id: 'input_test_legacy', transport: 'agent_cli_server_api' });
assert.equal(legacyTransport.transport, 'carrier_server_api');

assert.deepEqual(
  classifyInputAdmission(input, { activeTurn: false, composerHasDraft: false }),
  { action: 'admit', reason: 'no_active_turn', event: input },
);
assert.deepEqual(
  classifyInputAdmission(input, { activeTurn: true, composerHasDraft: false }),
  { action: 'reject', reason: 'active_turn', event: input },
);

const steering = createInputEvent({
  ...baseInput,
  event_id: 'input_test_steering',
  delivery_mode: 'admit_after_active_turn',
});
assert.deepEqual(
  classifyInputAdmission(steering, { activeTurn: true, composerHasDraft: false }),
  { action: 'queue', reason: 'active_turn', queue_state: 'queued_for_turn_boundary', event: steering },
);

const heldSystem = createInputEvent({
  ...baseInput,
  event_id: 'input_test_system',
  source_kind: 'system',
  source_id: 'narada-proper.system.directive_emitter',
  transport: 'control_jsonl',
  hold_condition: 'composer_clear_required',
  directive_id: 'dir_test',
  authority_ref: 'auth_test',
});
assert.deepEqual(
  classifyInputAdmission(heldSystem, { activeTurn: false, composerHasDraft: true }),
  { action: 'hold', reason: 'composer_nonempty', event: heldSystem },
);
assert.deepEqual(
  classifyInputAdmission(heldSystem, { activeTurn: false, composerHasDraft: false }),
  { action: 'admit', reason: 'no_active_turn', event: heldSystem },
);

assert.match(thrownMessage(() => createInputEvent({ ...baseInput, event_id: 'input_bad_directive', directive_id: 'dir_bad' })), /directive_id_incompatible_with_source/);
assert.match(thrownMessage(() => createInputEvent({ ...baseInput, event_id: 'input_bad_operator_directive', directive_id: 'dir_bad', authority_ref: 'auth' })), /directive_id_incompatible_with_source/);
assert.doesNotThrow(() => createInputEvent({
  ...baseInput,
  event_id: 'input_operator_directive',
  directive_id: 'dir_ok',
  authority_ref: 'auth',
  metadata: { directive_provenance: { kind: 'explicit_operator_directive_surface' } },
}));

assert.match(thrownMessage(() => createInputEvent({ ...baseInput, event_id: 'input_agent_bad', source_kind: 'agent', source_id: 'sonar.resident' })), /agent_source_requires_agent_control_input_metadata/);
assert.doesNotThrow(() => createInputEvent({ ...baseInput, event_id: 'input_agent_ok', source_kind: 'agent', source_id: 'sonar.resident', metadata: { agent_control_input: true } }));
assert.match(thrownMessage(() => createInputEvent({ ...baseInput, event_id: 'input_external_bad', source_kind: 'external', source_id: 'mailbox:x' })), /external_source_requires_admitted_by_metadata/);
assert.doesNotThrow(() => createInputEvent({ ...baseInput, event_id: 'input_external_ok', source_kind: 'external', source_id: 'mailbox:x', metadata: { admitted_by: 'narada-proper.system.mailbox_adapter' } }));

const legacyInput = normalizeLegacyInputRecord({ content: 'steer', source: 'operator_steering' }, { transport: 'control_jsonl' });
assert.equal(legacyInput.delivery_mode, 'admit_after_active_turn');
assert.equal(legacyInput.transport, 'control_jsonl');
assert.equal(legacyInput.metadata.legacy_source, 'operator_steering');

const control = createControlInputRecord({
  control_event_id: 'control_test_1',
  written_at: '2026-05-30T00:00:01.000Z',
  input: heldSystem,
});
assert.equal(control.schema, CONTROL_INPUT_EVENT_SCHEMA);
assert.equal(control.input_event_id, heldSystem.event_id);
assert.doesNotThrow(() => assertValidControlInputRecord(control));
assert.match(thrownMessage(() => assertValidControlInputRecord({ ...control, input_event_id: 'wrong' })), /invalid_input_event_id/);
assert.match(thrownMessage(() => assertValidControlInputRecord({ ...control, input_event_id: 'input_wrong' })), /input_event_id_mismatch/);
const normalizedLegacyControl = normalizeControlInputRecord({ content: 'legacy', source: 'manual_operator', transport: 'control_jsonl' });
assert.equal(normalizedLegacyControl.schema, CONTROL_INPUT_EVENT_SCHEMA);
assert.equal(normalizedLegacyControl.input.content, 'legacy');

const payloadRef = createPayloadRef({ payload_ref: 'mcp_payload:payload_test@v1', summary: 'large result' });
assert.equal(payloadRef.schema, PAYLOAD_REF_SCHEMA);
assert.deepEqual(validatePayloadRef(payloadRef), []);
assert.doesNotThrow(() => assertValidPayloadRef(payloadRef));
assert.match(thrownMessage(() => createPayloadRef({ payload_ref: 'bad', summary: 'x' })), /invalid_payload_ref/);
const payloadPolicy = createPayloadPolicy({ max_inline_chars: 200, max_inline_bytes: 1024 });
assert.equal(payloadPolicy.schema, PAYLOAD_POLICY_SCHEMA);
assert.deepEqual(validatePayloadPolicy(payloadPolicy), []);
assert.match(thrownMessage(() => createPayloadPolicy({ max_inline_chars: -1 })), /invalid_max_inline_chars/);

const sessionBase = {
  carrier_session_id: 'carrier_test',
  agent_id: 'sonar.resident',
  site_id: 'narada-sonar',
  site_root: 'D:/code/narada.sonar',
};
const sessionEvent = createSessionEvent({
  event_kind: 'input_admitted_to_turn',
  event_id: 'session_event_test_1',
  occurred_at: '2026-05-30T00:00:02.000Z',
  ...sessionBase,
  payload: { input_event_id: input.event_id },
});
assert.equal(sessionEvent.schema, SESSION_EVENT_SCHEMA);
assert.doesNotThrow(() => assertValidSessionEvent(sessionEvent));
assert.match(thrownMessage(() => createSessionEvent({ ...sessionEvent, event_kind: 'unknown' })), /invalid_event_kind/);
assert.match(thrownMessage(() => createSessionEvent({ ...sessionBase, event_kind: 'input_admitted_to_turn', payload: {} })), /payload.missing_required_field:input_event_id/);
const completedTurn = createSessionEvent({
  ...sessionBase,
  event_kind: 'turn_completed',
  payload: {
    schema: TURN_TERMINAL_PAYLOAD_SCHEMA,
    turn_id: 'turn_test',
    terminal_status: 'completed_without_provider',
    provider_request_status: 'recorded_not_dispatched',
    provider_execution_enabled: false,
  },
});
assert.deepEqual(validateSessionEvent(completedTurn), []);
assert.match(thrownMessage(() => createSessionEvent({
  ...sessionBase,
  event_kind: 'turn_completed',
  payload: {
    schema: TURN_TERMINAL_PAYLOAD_SCHEMA,
    turn_id: 'turn_test',
    terminal_status: 'failed',
    provider_request_status: 'recorded_not_dispatched',
    provider_execution_enabled: false,
  },
})), /payload.invalid_terminal_status:failed/);
assert.match(thrownMessage(() => createSessionEvent({
  ...sessionBase,
  event_kind: 'turn_failed',
  payload: {
    schema: TURN_TERMINAL_PAYLOAD_SCHEMA,
    turn_id: 'turn_test',
    terminal_status: 'failed',
    provider_request_status: 'failed',
    provider_execution_enabled: true,
  },
})), /payload.invalid_error_summary/);

const queuedEvent = createQueueLifecycleSessionEvent({
  ...sessionBase,
  lifecycle: 'queued_for_turn_boundary',
  input_event_id: steering.event_id,
});
assert.equal(queuedEvent.event_kind, 'input_queued_for_turn_boundary');
assert.equal(queuedEvent.payload.queue_state, 'queued_for_turn_boundary');
const droppedEvent = createQueueLifecycleSessionEvent({
  ...sessionBase,
  lifecycle: 'dropped_by_operator',
  input_event_id: steering.event_id,
});
assert.equal(droppedEvent.payload.drop_reason, 'operator_requested');

const interruptEvent = createInterruptRequestedSessionEvent({
  ...sessionBase,
  turn_id: 'turn_test',
});
assert.equal(interruptEvent.event_kind, 'interrupt_requested');
assert.equal(interruptEvent.payload.turn_id, 'turn_test');

const heldEvent = createSessionEvent({
  ...sessionBase,
  event_kind: 'system_directive_held',
  payload: {
    input_event_id: heldSystem.event_id,
    directive_id: heldSystem.directive_id,
    held_at: '2026-05-30T00:00:03.000Z',
    held_reason: 'composer_nonempty',
    original_delivery_mode: heldSystem.delivery_mode,
  },
});
assert.deepEqual(validateSessionEvent(heldEvent), []);
assert.match(thrownMessage(() => createSessionEvent({
  ...sessionBase,
  event_kind: 'system_directive_held',
  payload: {
    input_event_id: heldSystem.event_id,
    held_at: '2026-05-30',
    held_reason: 'other',
    original_delivery_mode: 'later',
  },
})), /payload.invalid_held_at/);

const releasedEvent = createSessionEvent({
  ...sessionBase,
  event_kind: 'system_directive_released',
  payload: {
    input_event_id: heldSystem.event_id,
    directive_id: heldSystem.directive_id,
    released_at: '2026-05-30T00:00:04.000Z',
  },
});
assert.deepEqual(validateSessionEvent(releasedEvent), []);

const diagnosticEvent = createCarrierDiagnosticSessionEvent({
  ...sessionBase,
  level: 'info',
  message: 'suppressed known MCP stderr',
  suppression_count: 3,
  suppression_policy: 'known_node_sqlite_warning',
});
assert.equal(diagnosticEvent.event_kind, 'carrier_diagnostic_recorded');
assert.deepEqual(validateSessionEvent(diagnosticEvent), []);
assert.match(thrownMessage(() => createCarrierDiagnosticSessionEvent({ ...sessionBase, level: 'loud', message: 'x' })), /payload.invalid_level/);

const toolCall = createSessionEvent({
  ...sessionBase,
  event_kind: 'tool_call_requested',
  payload: {
    tool_name: 'site_loop_run_once',
    arguments_summary: '{}',
    arguments_ref: payloadRef,
    requesting_agent_id: 'sonar.resident',
  },
});
assert.deepEqual(validateSessionEvent(toolCall), []);
const toolResult = createSessionEvent({
  ...sessionBase,
  event_kind: 'tool_result_received',
  payload: {
    tool_name: 'site_loop_run_once',
    status: 'ok',
    duration_ms: 12,
    result_summary: 'ok',
    result_ref: payloadRef,
  },
});
assert.deepEqual(validateSessionEvent(toolResult), []);
assert.match(thrownMessage(() => createSessionEvent({ ...sessionBase, event_kind: 'tool_result_received', payload: { tool_name: 'x', status: 'ok', duration_ms: -1, result_summary: '' } })), /payload.invalid_duration_ms/);

assert.equal(isTerminalTurnState('completed'), true);
assert.equal(isTerminalTurnState('active'), false);

console.log('carrier protocol tests PASSED.');
