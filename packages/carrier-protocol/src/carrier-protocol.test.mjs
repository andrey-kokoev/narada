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
  PROVIDER_REQUEST_PAYLOAD_SCHEMA,
  PROVIDER_OUTPUT_PAYLOAD_SCHEMA,
  CARRIER_DIRECTIVE_EMITTER_REGISTRY,
  NARS_LIFECYCLE_HOOK_SCHEMA,
  NARS_LIFECYCLE_HOOKS,
  NARS_RUNTIME_EVENT_KINDS,
  NARS_SESSION_EVENT_KINDS,
  NARS_SESSION_LIFECYCLE_HOOKS,
  NARS_TURN_EVENT_KINDS,
  NARS_TURN_LIFECYCLE_HOOKS,
  OBSERVER_VISIBILITIES,
  DIRECTIVE_KINDS,
  DIRECTIVE_SUPPRESSION_REASONS,
  DIRECTIVE_TARGET_KINDS,
  DIRECTIVE_TRIGGER_KINDS,
  PAYLOAD_REF_READER_TOOLS,
  SESSION_EVENT_FIXTURE_MANIFEST_SCHEMA,
  SESSION_EVENT_KINDS,
  SESSION_EVENT_SCHEMA,
  TOOL_EFFECT_ADMISSION_ACTIONS,
  TOOL_EFFECT_ADMISSION_CASES_SCHEMA,
  TOOL_EFFECT_ADMISSION_REASONS,
  TOOL_RESULT_STATUSES,
  TURN_TERMINAL_PAYLOAD_SCHEMA,
  assertValidControlInputRecord,
  assertValidInputEvent,
  assertValidPayloadRef,
  assertValidSessionEvent,
  classifyCarrierControlRequest,
  classifyCarrierInputAdmission,
  classifyCarrierInputHold,
  classifyCarrierInputQueueAdmission,
  classifyCarrierInputIntent,
  classifyDirectiveEmissionRequest,
  classifyToolEffectAdmission,
  classifyInputAdmission,
  carrierDirectiveEmitterSpec,
  createCarrierDirectiveInput,
  createCarrierDiagnosticSessionEvent,
  createControlInputRecord,
  createInputEvent,
  createNarsLifecycleHookPayload,
  createInterruptRequestedSessionEvent,
  createPayloadRef,
  createPayloadPolicy,
  createProviderRequestPayload,
  createProviderTextDeltaPayload,
  createProviderToolCallPayload,
  createQueueLifecycleSessionEvent,
  createSessionEvent,
  createToolCallPayload,
  createToolResultPayload,
  createTurnTerminalPayload,
  isStartupNudge,
  isTerminalTurnState,
  classifyCarrierObserverInput,
  narsLifecycleHookPayloadFromEvent,
  narsLifecycleHooksForEvent,
  normalizeNarsRuntimeEventKind,
  normalizeControlInputRecord,
  normalizeInputEvent,
  normalizeLegacyInputRecord,
  observerPayload,
  startupCommandFromLaunchPacket,
  validateControlInputRecord,
  validateInputEvent,
  validateNarsLifecycleHookPayload,
  validatePayloadRef,
  validatePayloadPolicy,
  validateSessionEvent,
  validateSessionEventFixtureManifest,
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

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
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

const sessionEventFixtureManifest = readFixture('session-event-fixtures.json');
const inputPipelineCases = readFixture('carrier-input-pipeline-cases.json');
const directiveEmitterRegistryCases = readFixture('carrier-directive-emitter-registry-cases.json');
const toolEffectAdmissionCases = readFixture('tool-effect-admission-cases.json');

assert.equal(CARRIER_PROTOCOL_SCHEMAS.input_event.schema, INPUT_EVENT_SCHEMA);
assert.equal(CARRIER_PROTOCOL_SCHEMAS.session_event_fixture_manifest.schema, SESSION_EVENT_FIXTURE_MANIFEST_SCHEMA);
assert.equal(CARRIER_PROTOCOL_SCHEMAS.tool_effect_admission_cases.schema, TOOL_EFFECT_ADMISSION_CASES_SCHEMA);
assert.deepEqual(OBSERVER_VISIBILITIES, ['record_only', 'operator_visible', 'agent_visible', 'conversation_visible']);
assert.deepEqual(DIRECTIVE_KINDS, ['operation_heartbeat', 'operation_attention']);
assert.deepEqual(DIRECTIVE_TARGET_KINDS, ['carrier_session', 'operation', 'site', 'operator', 'observer']);
assert.deepEqual(DIRECTIVE_TRIGGER_KINDS, ['cadence', 'runtime_trigger', 'operator_authorized']);
assert.deepEqual(DIRECTIVE_SUPPRESSION_REASONS, ['directive_emission_disabled', 'directive_emission_rule_inactive', 'directive_emission_target_missing', 'directive_emission_unsupported_kind']);
assert.deepEqual(PAYLOAD_REF_READER_TOOLS, ['mcp_payload_read', 'mcp_payload_show', 'mcp_output_show', 'carrier_host_command_output_read']);
assert.deepEqual(TOOL_RESULT_STATUSES, ['ok', 'denied', 'failed']);
assert.deepEqual(TOOL_EFFECT_ADMISSION_ACTIONS, ['admit', 'deny']);
assert.deepEqual(TOOL_EFFECT_ADMISSION_REASONS, ['read_only_tool_effect_admitted', 'tool_effect_adapter_unconfigured', 'tool_effect_admission_required', 'unsupported_tool_effect', 'tool_effect_authority_denied', 'write_tool_effect_admitted']);
assert.equal(CARRIER_PROTOCOL_SCHEMAS.nars_lifecycle_hook.schema, NARS_LIFECYCLE_HOOK_SCHEMA);
assert.deepEqual(NARS_SESSION_LIFECYCLE_HOOKS, ['beforeSessionBind', 'afterSessionStarted', 'afterSessionStatus', 'beforeSessionClose', 'afterSessionClosed', 'onSessionError']);
assert.deepEqual(NARS_TURN_LIFECYCLE_HOOKS, ['beforeDirectiveAccept', 'afterDirectiveAccepted', 'beforeTurnStart', 'onAssistantMessage', 'onToolCall', 'onToolResult', 'onCommandResult', 'afterTurnComplete', 'onRuntimeError']);
assert.deepEqual(NARS_LIFECYCLE_HOOKS, [...NARS_SESSION_LIFECYCLE_HOOKS, ...NARS_TURN_LIFECYCLE_HOOKS]);
assert.deepEqual(NARS_SESSION_EVENT_KINDS, ['session_started', 'session_status', 'session_health', 'session_closed', 'runtime_error']);
assert.deepEqual(NARS_TURN_EVENT_KINDS, ['directive_received', 'directive_receipt_recorded', 'directive_carrier_accepted_recorded', 'turn_started', 'assistant_message', 'assistant_message_stream', 'tool_call', 'tool_result', 'command_result', 'turn_complete', 'turn_interrupted', 'turn_failed', 'runtime_error']);
assert.equal(NARS_RUNTIME_EVENT_KINDS.includes('command_result'), true);
assert.equal(normalizeNarsRuntimeEventKind('carrier_command_result'), 'command_result');
assert.equal(normalizeNarsRuntimeEventKind('directive_complete'), 'turn_complete');
assert.deepEqual(narsLifecycleHooksForEvent({ event: 'tool_call' }), ['onToolCall']);
assert.deepEqual(narsLifecycleHooksForEvent({ event: 'carrier_command_result' }), ['onCommandResult']);
assert.deepEqual(narsLifecycleHooksForEvent({ event: 'session_health' }), ['afterSessionStatus']);
assert.deepEqual(narsLifecycleHooksForEvent({ event: 'session_closed' }), ['beforeSessionClose', 'afterSessionClosed']);
const hookPayload = createNarsLifecycleHookPayload({
  hook: 'onToolResult',
  agent_id: 'sonar.resident',
  session_id: 'carrier_test',
  request_id: 'input_test',
  turn_id: 'turn_test',
  event_kind: 'tool_result',
  timestamp: '2026-06-23T00:00:00.000Z',
  terminal_state: 'completed',
});
assert.equal(hookPayload.schema, NARS_LIFECYCLE_HOOK_SCHEMA);
assert.equal(hookPayload.hook_kind, 'turn');
assert.deepEqual(validateNarsLifecycleHookPayload(hookPayload), []);
assert.deepEqual(narsLifecycleHookPayloadFromEvent({
  hook: 'onRuntimeError',
  event: {
    event: 'error',
    agent_id: 'sonar.resident',
    session_id: 'carrier_test',
    request_id: 'input_test',
    timestamp: '2026-06-23T00:00:01.000Z',
    code: 'provider_failed',
    message: 'provider failed',
  },
}), {
  schema: NARS_LIFECYCLE_HOOK_SCHEMA,
  hook: 'onRuntimeError',
  hook_kind: 'turn',
  agent_id: 'sonar.resident',
  session_id: 'carrier_test',
  timestamp: '2026-06-23T00:00:01.000Z',
  event_kind: 'runtime_error',
  request_id: 'input_test',
  error: { code: 'provider_failed', message: 'provider failed' },
  source_event: {
    event: 'error',
    agent_id: 'sonar.resident',
    session_id: 'carrier_test',
    request_id: 'input_test',
    timestamp: '2026-06-23T00:00:01.000Z',
    code: 'provider_failed',
    message: 'provider failed',
  },
});
assert.match(thrownMessage(() => createNarsLifecycleHookPayload({
  hook: 'onToolCall',
  agent_id: 'sonar.resident',
  session_id: 'carrier_test',
  timestamp: '2026-06-23T00:00:00.000Z',
  terminal_state: 'closed',
})), /invalid_terminal_state:closed/);
assert.equal(toolEffectAdmissionCases.schema, TOOL_EFFECT_ADMISSION_CASES_SCHEMA);
for (const fixtureCase of toolEffectAdmissionCases.cases) {
  assert.deepEqual(classifyToolEffectAdmission(fixtureCase.tool_call, fixtureCase.state), fixtureCase.expected, fixtureCase.name);
}
assert.equal(directiveEmitterRegistryCases.schema, 'narada.carrier.directive_emitter_registry_cases.v1');
for (const fixtureCase of directiveEmitterRegistryCases.cases) {
  const decision = classifyDirectiveEmissionRequest({
    directive_kind: fixtureCase.directive_kind,
    enabled: fixtureCase.enabled ?? true,
    target: fixtureCase.target,
  });
  assert.equal(decision.action, fixtureCase.expected.emission_action, fixtureCase.name);
  if (decision.action === 'suppress') {
    assert.equal(decision.reason, fixtureCase.expected.suppression_reason, fixtureCase.name);
    continue;
  }
  const spec = carrierDirectiveEmitterSpec(fixtureCase.directive_kind);
  assert.equal(spec.default_visibility, fixtureCase.expected.default_visibility, fixtureCase.name);
  assert.equal(spec.default_cadence, fixtureCase.expected.default_cadence, fixtureCase.name);
  assert.equal(spec.trigger_kind, fixtureCase.expected.trigger_kind, fixtureCase.name);
  assert.equal(spec.target_kind, fixtureCase.expected.target_kind, fixtureCase.name);
  const input = createCarrierDirectiveInput({
    directive_kind: fixtureCase.directive_kind,
    operation_id: fixtureCase.operation_id,
    carrier_session_id: fixtureCase.target.kind === 'carrier_session' ? fixtureCase.target.id : null,
    target: fixtureCase.target,
  });
  assert.equal(input.metadata.directive.kind, fixtureCase.directive_kind, fixtureCase.name);
  assert.equal(input.metadata.directive.visibility, fixtureCase.expected.default_visibility, fixtureCase.name);
  assert.equal(input.metadata.directive.trigger_kind, fixtureCase.expected.trigger_kind, fixtureCase.name);
  assert.deepEqual(input.metadata.directive.target, fixtureCase.target, fixtureCase.name);
}
assert.deepEqual(classifyCarrierControlRequest({ id: 'status-1', method: 'session.status' }), {
  request_id: 'status-1',
  method: 'session.status',
  concurrent_allowed: false,
  allowed_when_closed: true,
  native_control_input: false,
  observer_action: null,
  error: null,
  method_kind: 'session_status',
});
assert.deepEqual(classifyCarrierControlRequest({ id: 'health-1', method: 'session.health' }), {
  request_id: 'health-1',
  method: 'session.health',
  concurrent_allowed: true,
  allowed_when_closed: true,
  native_control_input: false,
  observer_action: null,
  error: null,
  method_kind: 'session_health',
});
assert.deepEqual(classifyCarrierControlRequest({ id: 'events-1', method: 'session.events.subscribe' }), {
  request_id: 'events-1',
  method: 'session.events.subscribe',
  concurrent_allowed: true,
  allowed_when_closed: true,
  native_control_input: false,
  observer_action: null,
  error: null,
  method_kind: 'session_events_subscribe',
});
assert.deepEqual(classifyCarrierControlRequest({ id: 'recovery-1', method: 'session.recovery' }), {
  request_id: 'recovery-1',
  method: 'session.recovery',
  concurrent_allowed: false,
  allowed_when_closed: false,
  native_control_input: false,
  observer_action: null,
  error: null,
  method_kind: 'session_recovery',
});
assert.deepEqual(classifyCarrierControlRequest({ id: 'ops-1', method: 'session.operations' }), {
  request_id: 'ops-1',
  method: 'session.operations',
  concurrent_allowed: false,
  allowed_when_closed: false,
  native_control_input: false,
  observer_action: null,
  error: null,
  method_kind: 'session_operations',
});
assert.deepEqual(classifyCarrierControlRequest({ id: 'preflight-recovery-1', method: 'preflight.recovery' }), {
  request_id: 'preflight-recovery-1',
  method: 'preflight.recovery',
  concurrent_allowed: false,
  allowed_when_closed: false,
  native_control_input: false,
  observer_action: null,
  error: null,
  method_kind: 'preflight_recovery',
});
assert.deepEqual(classifyCarrierControlRequest({ id: 'sync-1', method: 'session.sync' }), {
  request_id: 'sync-1',
  method: 'session.sync',
  concurrent_allowed: false,
  allowed_when_closed: false,
  native_control_input: false,
  observer_action: null,
  error: null,
  method_kind: 'session_sync',
});
assert.equal(classifyCarrierControlRequest({ id: 'interrupt-1', method: 'conversation.interrupt' }).method_kind, 'conversation_interrupt');
assert.equal(classifyCarrierControlRequest({ id: 'interrupt-1', method: 'conversation.interrupt' }).concurrent_allowed, true);
assert.deepEqual(classifyCarrierControlRequest({ id: 'command-1', method: 'carrier.command.execute' }), {
  request_id: 'command-1',
  method: 'carrier.command.execute',
  concurrent_allowed: false,
  allowed_when_closed: false,
  native_control_input: false,
  observer_action: null,
  error: null,
  method_kind: 'carrier_command_execute',
  compatibility_alias: null,
});
assert.deepEqual(classifyCarrierControlRequest({ id: 'legacy-command-1', method: 'agent-cli.command' }), {
  request_id: 'legacy-command-1',
  method: 'agent-cli.command',
  concurrent_allowed: false,
  allowed_when_closed: false,
  native_control_input: false,
  observer_action: null,
  error: null,
  method_kind: 'carrier_command_execute',
  compatibility_alias: 'agent-cli.command',
});
assert.deepEqual(classifyCarrierControlRequest({ id: 'observer-mute-1', method: 'observer.mute' }), {
  request_id: 'observer-mute-1',
  method: 'observer.mute',
  concurrent_allowed: false,
  allowed_when_closed: false,
  native_control_input: false,
  observer_action: 'mute',
  error: null,
  method_kind: 'observer_set_muted',
});
assert.deepEqual(classifyCarrierControlRequest({
  schema: CONTROL_INPUT_EVENT_SCHEMA,
  control_event_id: 'control_1',
}), {
  request_id: 'control_1',
  method: 'carrier.input.deliver',
  concurrent_allowed: false,
  allowed_when_closed: false,
  native_control_input: true,
  observer_action: null,
  error: null,
  method_kind: 'carrier_input_deliver',
});
assert.deepEqual(classifyCarrierControlRequest({ id: 'bad-1', method: 'bad.method' }), {
  request_id: 'bad-1',
  method: 'bad.method',
  concurrent_allowed: false,
  allowed_when_closed: false,
  native_control_input: false,
  observer_action: null,
  error: {
    code: 'unsupported_method',
    message: 'Unsupported method: bad.method',
  },
  method_kind: 'unsupported',
});
assert.deepEqual(validateSessionEventFixtureManifest(sessionEventFixtureManifest), []);
assert.deepEqual(sessionEventFixtureManifest.fixtures.map((entry) => entry.event_kind), SESSION_EVENT_KINDS);
for (const entry of sessionEventFixtureManifest.fixtures) {
  assert.equal(typeof entry.fixture, 'string');
  const fixture = readFixture(entry.fixture);
  assert.equal(fixture.event_kind, entry.event_kind);
  assert.deepEqual(validateSessionEvent(fixture), []);
}
const transcriptProjectionCases = readFixture('transcript-projection-cases.json');
assert.equal(transcriptProjectionCases.schema, 'narada.carrier.transcript_projection_cases.v1');
for (const entry of transcriptProjectionCases.cases) {
  assert.equal(typeof entry.fixture, 'string');
  assert.deepEqual(validateSessionEvent(readFixture(entry.fixture)), [], entry.name);
  assert.equal(typeof entry.expected_kind, 'string');
  assert.equal(typeof entry.expected_actor, 'string');
  assert.equal(typeof entry.expected_text, 'string');
}
assert.equal(inputPipelineCases.schema, 'narada.carrier.input_pipeline_cases.v1');
for (const entry of inputPipelineCases.cases) {
  const input = normalizeInputEvent(entry.input);
  const queueAdmission = classifyCarrierInputQueueAdmission(input, entry.state);
  const hold = classifyCarrierInputHold(input, entry.state);
  assert.equal(queueAdmission.admission_action, entry.expected.admission_action, entry.name);
  if (hasOwn(entry.expected, 'queue_state')) assert.equal(queueAdmission.queue_state, entry.expected.queue_state, entry.name);
  assert.equal(queueAdmission.creates_turn, entry.expected.creates_turn, entry.name);
  assert.equal(queueAdmission.complete_without_provider, entry.expected.complete_without_provider, entry.name);
  assert.equal(queueAdmission.dispatch_to_provider, entry.expected.dispatch_to_provider, entry.name);
  if (hasOwn(entry.expected, 'visible_to_operator')) assert.equal(queueAdmission.visible_to_operator, entry.expected.visible_to_operator, entry.name);
  if (hasOwn(entry.expected, 'directive_visibility')) assert.equal(queueAdmission.directive_visibility, entry.expected.directive_visibility, entry.name);
  if (hasOwn(entry.expected, 'suppression_reason')) assert.equal(queueAdmission.suppression_reason, entry.expected.suppression_reason, entry.name);
  assert.deepEqual(queueAdmission.queue_events.map((event) => event.event_kind), entry.expected.queue_event_kinds, entry.name);
  assert.deepEqual(queueAdmission.admission_events.map((event) => event.event_kind), entry.expected.admission_event_kinds, entry.name);
  assert.deepEqual(queueAdmission.visible_events.map((event) => event.event_kind), entry.expected.visible_event_kinds ?? [], entry.name);
  assert.equal(hold.hold_action, entry.expected.hold_action, entry.name);
  assert.equal(hold.should_defer, entry.expected.should_defer, entry.name);
  assert.deepEqual(hold.hold_events.map((event) => event.event_kind), entry.expected.hold_event_kinds ?? [], entry.name);
}
assert.deepEqual(validateInputEvent(readFixture('input-event.json')), []);
assert.deepEqual(validateControlInputRecord(readFixture('control-input-event.json')), []);
for (const fixtureName of [
  'input-queued-session-event.json',
  'input-dropped-session-event.json',
  'input-abandoned-session-event.json',
  'input-completed-session-event.json',
  'turn-started-session-event.json',
  'interrupt-requested-session-event.json',
]) {
  assert.deepEqual(validateSessionEvent(readFixture(fixtureName)), []);
}
const turnTerminalFixture = readFixture('turn-terminal-session-event.json');
assert.deepEqual(validateSessionEvent(turnTerminalFixture), []);
assert.deepEqual(turnTerminalFixture.payload, createTurnTerminalPayload({
  turn_id: 'turn_fixture_1',
  terminal_status: 'completed_without_provider',
  provider_request_status: 'recorded_not_dispatched',
  provider_execution_enabled: false,
}));
const turnInterruptedFixture = readFixture('turn-interrupted-session-event.json');
assert.deepEqual(validateSessionEvent(turnInterruptedFixture), []);
assert.deepEqual(turnInterruptedFixture.payload, createTurnTerminalPayload({
  turn_id: 'turn_fixture_1',
  input_event_id: 'input_fixture_1',
  terminal_status: 'interrupted',
  provider_request_status: 'interrupted',
  provider_execution_enabled: true,
}));
const turnFailedFixture = readFixture('turn-failed-session-event.json');
assert.deepEqual(validateSessionEvent(turnFailedFixture), []);
assert.deepEqual(turnFailedFixture.payload, createTurnTerminalPayload({
  turn_id: 'turn_fixture_1',
  input_event_id: 'input_fixture_1',
  terminal_status: 'failed',
  provider_request_status: 'failed',
  provider_execution_enabled: true,
  error_summary: 'provider dispatch failed',
}));
const providerRequestFixture = readFixture('provider-request-session-event.json');
assert.deepEqual(validateSessionEvent(providerRequestFixture), []);
assert.deepEqual(providerRequestFixture.payload, createProviderRequestPayload({
  turn_id: 'turn_fixture_1',
  input_event_id: 'input_fixture_1',
  provider_request_status: 'recorded_not_dispatched',
  provider_execution_enabled: false,
  provider_runtime_status: 'configured',
  provider_adapter_admission_status: 'configured_without_adapter',
  provider: 'codex-subscription',
  model: 'gpt-5.5',
  thinking: 'medium',
  stream: true,
  provider_streaming_contract: 'requested_but_not_dispatched',
  provider_adapter_refusal_reason: 'provider_adapter_not_configured',
  content_preview: 'inspect the workboard',
}));
const providerTextDeltaFixture = readFixture('provider-text-delta-session-event.json');
assert.deepEqual(validateSessionEvent(providerTextDeltaFixture), []);
assert.deepEqual(providerTextDeltaFixture.payload, createProviderTextDeltaPayload({
  turn_id: 'turn_fixture_1',
  sequence: 1,
  text_delta: 'Startup sequence completed.',
}));
const providerToolCallFixture = readFixture('provider-tool-call-session-event.json');
assert.deepEqual(validateSessionEvent(providerToolCallFixture), []);
assert.deepEqual(providerToolCallFixture.payload, createProviderToolCallPayload({
  turn_id: 'turn_fixture_1',
  sequence: 2,
  tool_name: 'site_loop_run_once',
  arguments_summary: '{}',
}));
const toolCallFixture = readFixture('tool-call-session-event.json');
assert.deepEqual(validateSessionEvent(toolCallFixture), []);
assert.equal(toolCallFixture.event_kind, 'tool_call_requested');
assert.equal(toolCallFixture.payload.tool_name, 'site_loop_run_once');
assert.deepEqual(toolCallFixture.payload, createToolCallPayload({
  tool_name: 'site_loop_run_once',
  arguments_summary: '{}',
  requesting_agent_id: 'sonar.resident',
}));
const toolResultFixture = readFixture('tool-result-session-event.json');
assert.deepEqual(validateSessionEvent(toolResultFixture), []);
assert.equal(toolResultFixture.event_kind, 'tool_result_received');
assert.equal(toolResultFixture.payload.status, 'ok');
assert.deepEqual(toolResultFixture.payload, createToolResultPayload({
  tool_name: 'site_loop_run_once',
  status: 'ok',
  duration_ms: 12,
  result_summary: 'ok',
}));
const admittedToolResultFixture = readFixture('tool-result-admitted-session-event.json');
assert.deepEqual(validateSessionEvent(admittedToolResultFixture), []);
assert.equal(admittedToolResultFixture.payload.status, 'ok');
assert.equal(admittedToolResultFixture.payload.admission_action, 'admit');
assert.equal(admittedToolResultFixture.payload.admission_reason, 'read_only_tool_effect_admitted');
assert.equal(admittedToolResultFixture.payload.capability_ref, 'cloudflare-carrier:capability/runtime-metadata-read:v1');
assert.equal(admittedToolResultFixture.payload.effect_scope, 'cloudflare-carrier/runtime-metadata:read-only');
assert.deepEqual(admittedToolResultFixture.payload, createToolResultPayload({
  tool_name: 'cloudflare_carrier_runtime_metadata_read',
  status: 'ok',
  admission_action: 'admit',
  admission_reason: 'read_only_tool_effect_admitted',
  capability_ref: 'cloudflare-carrier:capability/runtime-metadata-read:v1',
  effect_scope: 'cloudflare-carrier/runtime-metadata:read-only',
  duration_ms: 3,
  result_summary: 'runtime metadata read',
}));
const deniedToolResultFixture = readFixture('tool-result-denied-session-event.json');
assert.deepEqual(validateSessionEvent(deniedToolResultFixture), []);
assert.equal(deniedToolResultFixture.payload.status, 'denied');
assert.equal(deniedToolResultFixture.payload.admission_action, 'deny');
assert.equal(deniedToolResultFixture.payload.admission_reason, 'tool_effect_adapter_unconfigured');
assert.deepEqual(deniedToolResultFixture.payload, createToolResultPayload({
  tool_name: 'cloudflare_carrier_runtime_metadata_read',
  status: 'denied',
  admission_action: 'deny',
  admission_reason: 'tool_effect_adapter_unconfigured',
  duration_ms: 0,
  result_summary: 'tool_effect_adapter_unconfigured',
}));
const failedToolResultFixture = readFixture('tool-result-failed-session-event.json');
assert.deepEqual(validateSessionEvent(failedToolResultFixture), []);
assert.equal(failedToolResultFixture.payload.status, 'failed');
assert.equal(failedToolResultFixture.payload.admission_action, 'admit');
assert.equal(failedToolResultFixture.payload.admission_reason, 'write_tool_effect_admitted');
assert.equal(failedToolResultFixture.payload.capability_ref, 'cloudflare-carrier:capability/kv-put:v1');
assert.equal(failedToolResultFixture.payload.effect_scope, 'cloudflare-kv:write:put');
assert.equal(failedToolResultFixture.payload.authority_ref, 'principal:admin');
assert.deepEqual(failedToolResultFixture.payload, createToolResultPayload({
  tool_name: 'cloudflare_carrier_kv_put',
  status: 'failed',
  admission_action: 'admit',
  admission_reason: 'write_tool_effect_admitted',
  capability_ref: 'cloudflare-carrier:capability/kv-put:v1',
  effect_scope: 'cloudflare-kv:write:put',
  authority_ref: 'principal:admin',
  duration_ms: 1,
  result_summary: 'cloudflare_kv_put_requires_key',
}));
assert.ok(validateSessionEvent({
  ...failedToolResultFixture,
  payload: createToolResultPayload({
    tool_name: 'cloudflare_carrier_kv_put',
    status: 'ok',
    admission_action: 'deny',
    admission_reason: 'tool_effect_adapter_unconfigured',
    duration_ms: 1,
    result_summary: 'impossible',
  }),
}).includes('payload.admission_action_status_mismatch'));
assert.ok(validateSessionEvent({
  ...failedToolResultFixture,
  payload: createToolResultPayload({
    tool_name: 'cloudflare_carrier_kv_put',
    status: 'denied',
    admission_action: 'admit',
    admission_reason: 'write_tool_effect_admitted',
    duration_ms: 1,
    result_summary: 'impossible',
  }),
}).includes('payload.admission_action_status_mismatch'));
assert.ok(validateSessionEvent({
  ...failedToolResultFixture,
  payload: createToolResultPayload({
    tool_name: 'cloudflare_carrier_kv_put',
    status: 'failed',
    admission_action: 'admit',
    admission_reason: 'tool_effect_adapter_unconfigured',
    duration_ms: 1,
    result_summary: 'impossible',
  }),
}).includes('payload.admission_reason_action_mismatch'));
assert.ok(validateSessionEvent({
  ...failedToolResultFixture,
  payload: createToolResultPayload({
    tool_name: 'cloudflare_carrier_kv_put',
    status: 'failed',
    admission_action: 'admit',
    duration_ms: 1,
    result_summary: 'partial admission evidence',
  }),
}).includes('payload.missing_admission_reason'));
assert.ok(validateSessionEvent({
  ...failedToolResultFixture,
  payload: createToolResultPayload({
    tool_name: 'cloudflare_carrier_kv_put',
    status: 'failed',
    admission_reason: 'write_tool_effect_admitted',
    duration_ms: 1,
    result_summary: 'partial admission evidence',
  }),
}).includes('payload.missing_admission_action'));
const carrierCommandFixture = readFixture('carrier-command-session-event.json');
assert.deepEqual(validateSessionEvent(carrierCommandFixture), []);
assert.equal(carrierCommandFixture.event_kind, 'carrier_command_executed');
assert.equal(carrierCommandFixture.payload.command, 'queue_show');
const carrierDiagnosticFixture = readFixture('carrier-diagnostic-session-event.json');
assert.deepEqual(validateSessionEvent(carrierDiagnosticFixture), []);
assert.equal(carrierDiagnosticFixture.event_kind, 'carrier_diagnostic_recorded');
assert.equal(carrierDiagnosticFixture.payload.level, 'warn');
const directiveReceiptFixture = readFixture('directive-receipt-session-event.json');
assert.deepEqual(validateSessionEvent(directiveReceiptFixture), []);
assert.equal(directiveReceiptFixture.event_kind, 'directive_receipt_recorded');
const directiveAcceptedFixture = readFixture('directive-carrier-accepted-session-event.json');
assert.deepEqual(validateSessionEvent(directiveAcceptedFixture), []);
assert.equal(directiveAcceptedFixture.event_kind, 'directive_carrier_accepted_recorded');
const systemDirectiveHeldFixture = readFixture('system-directive-held-session-event.json');
assert.deepEqual(validateSessionEvent(systemDirectiveHeldFixture), []);
assert.equal(systemDirectiveHeldFixture.payload.held_reason, 'composer_nonempty');
const systemDirectiveReleasedFixture = readFixture('system-directive-released-session-event.json');
assert.deepEqual(validateSessionEvent(systemDirectiveReleasedFixture), []);
assert.equal(systemDirectiveReleasedFixture.payload.released_at, '2026-05-30T00:00:13.000Z');
assert.deepEqual(validatePayloadRef(readFixture('payload-ref.json')), []);
assert.deepEqual(validatePayloadPolicy(readFixture('payload-policy.json')), []);
assert.deepEqual(validateSessionEventFixtureManifest({ schema: SESSION_EVENT_FIXTURE_MANIFEST_SCHEMA, fixtures: [{ event_kind: 'missing', fixture: 'x.json' }] }), [
  'fixtures.0.invalid_event_kind:missing',
  'fixtures.missing_event_kind:carrier_session_started',
  'fixtures.missing_event_kind:input_queued_for_turn_boundary',
  'fixtures.missing_event_kind:input_admitted_to_turn',
  'fixtures.missing_event_kind:input_dropped_by_operator',
  'fixtures.missing_event_kind:input_abandoned_on_session_end',
  'fixtures.missing_event_kind:input_completed',
  'fixtures.missing_event_kind:system_directive_held',
  'fixtures.missing_event_kind:system_directive_released',
  'fixtures.missing_event_kind:directive_emission_authorized',
  'fixtures.missing_event_kind:directive_emission_rule_recorded',
  'fixtures.missing_event_kind:directive_emitted',
  'fixtures.missing_event_kind:directive_receipt_recorded',
  'fixtures.missing_event_kind:directive_carrier_accepted_recorded',
  'fixtures.missing_event_kind:turn_started',
  'fixtures.missing_event_kind:provider_request_recorded',
  'fixtures.missing_event_kind:provider_text_delta_recorded',
  'fixtures.missing_event_kind:provider_tool_call_requested',
  'fixtures.missing_event_kind:turn_completed',
  'fixtures.missing_event_kind:turn_interrupted',
  'fixtures.missing_event_kind:turn_failed',
  'fixtures.missing_event_kind:interrupt_requested',
  'fixtures.missing_event_kind:tool_call_requested',
  'fixtures.missing_event_kind:tool_result_received',
  'fixtures.missing_event_kind:observer_observation_recorded',
  'fixtures.missing_event_kind:observer_interjection_proposed',
  'fixtures.missing_event_kind:observer_interjection_admitted',
  'fixtures.missing_event_kind:observer_interjection_visible',
  'fixtures.missing_event_kind:observer_interjection_suppressed',
  'fixtures.missing_event_kind:carrier_host_command_requested',
  'fixtures.missing_event_kind:carrier_host_command_admitted',
  'fixtures.missing_event_kind:carrier_host_command_rejected',
  'fixtures.missing_event_kind:carrier_host_command_started',
  'fixtures.missing_event_kind:carrier_host_command_completed',
  'fixtures.missing_event_kind:carrier_host_command_failed',
  'fixtures.missing_event_kind:carrier_command_executed',
  'fixtures.missing_event_kind:carrier_diagnostic_recorded',
  'fixtures.missing_event_kind:carrier_session_closed',
]);

const input = createInputEvent(baseInput);
assert.equal(input.schema, INPUT_EVENT_SCHEMA);
assert.equal(input.hold_condition, null);
assert.deepEqual(validateInputEvent(input), []);
assert.doesNotThrow(() => assertValidInputEvent(input));
assert.equal(createInputEvent({ ...baseInput, event_id: undefined }).event_id.startsWith('input_'), true);
assert.equal(isStartupNudge('run startup sequence'), true);
assert.equal(isStartupNudge('please start up'), true);
assert.equal(isStartupNudge('inspect startup files'), false);
assert.deepEqual(startupCommandFromLaunchPacket({}), { name: 'agent_context_startup_sequence', arguments: {} });
assert.deepEqual(startupCommandFromLaunchPacket({ startup_command: { name: 'startup_sequence', arguments: {} } }), { name: 'agent_context_startup_sequence', arguments: {} });
assert.deepEqual(classifyCarrierInputIntent(input, {
  startup_command: { name: 'agent_context_startup_sequence', arguments: {} },
}), {
  intent: 'startup_command',
  provider_dispatch_allowed: false,
  command: { name: 'agent_context_startup_sequence', arguments: {} },
  rule: 'startup_nudge_uses_launch_packet_mcp_affordance',
});
assert.deepEqual(classifyCarrierInputIntent(createInputEvent({ ...baseInput, event_id: 'input_provider', content: 'fix the dashboard' })), {
  intent: 'provider_turn',
  provider_dispatch_allowed: true,
});

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
assert.deepEqual(classifyCarrierInputHold(heldSystem, {
  composerHasDraft: true,
  occurredAt: '2026-05-30T00:00:01.000Z',
}), {
  input_event_id: 'input_test_system',
  is_system_directive: true,
  hold_action: 'hold',
  hold_reason: 'composer_nonempty',
  should_defer: true,
  hold_events: [{
    event_kind: 'system_directive_held',
    payload: {
      input_event_id: 'input_test_system',
      directive_id: 'dir_test',
      held_at: '2026-05-30T00:00:01.000Z',
      held_reason: 'composer_nonempty',
      original_delivery_mode: 'admit_for_current_turn',
    },
  }],
  release_events: [],
  events: [{
    event_kind: 'system_directive_held',
    payload: {
      input_event_id: 'input_test_system',
      directive_id: 'dir_test',
      held_at: '2026-05-30T00:00:01.000Z',
      held_reason: 'composer_nonempty',
      original_delivery_mode: 'admit_for_current_turn',
    },
  }],
  event: heldSystem,
});
assert.equal(classifyCarrierInputHold(heldSystem, { composerHasDraft: false }).hold_action, 'none');
assert.equal(classifyCarrierInputHold(baseInput, { composerHasDraft: true }).hold_action, 'none');
assert.deepEqual(classifyCarrierInputHold(heldSystem, {
  release: true,
  alreadyHeld: true,
  occurredAt: '2026-05-30T00:00:02.000Z',
}).release_events, [{
  event_kind: 'system_directive_released',
  payload: {
    input_event_id: 'input_test_system',
    directive_id: 'dir_test',
    released_at: '2026-05-30T00:00:02.000Z',
  },
}]);
const admittedOperator = classifyCarrierInputAdmission(baseInput, { activeTurn: false });
assert.equal(admittedOperator.is_observer, false);
assert.equal(admittedOperator.creates_turn, true);
assert.equal(admittedOperator.dispatch_to_provider, false);
assert.deepEqual(admittedOperator.admission_events, [{
  event_kind: 'input_admitted_to_turn',
  payload: { input_event_id: 'input_test_1' },
}]);
const agentVisibleDirectiveInput = createInputEvent({
  ...baseInput,
  event_id: 'input_agent_visible_directive',
  source_kind: 'system',
  source_id: 'narada-proper.system.directive_emitter',
  directive_id: 'dir_agent_visible',
  authority_ref: 'authority:system-directive',
  metadata: {
    directive_provenance: { kind: 'system_directive' },
    directive: {
      kind: 'operation_update_request',
      visibility: 'agent_visible',
      content_kind: 'operation_update_request',
    },
  },
});
const agentVisibleDirectiveAdmission = classifyCarrierInputAdmission(agentVisibleDirectiveInput, { activeTurn: false });
assert.equal(agentVisibleDirectiveAdmission.is_observer, false);
assert.equal(agentVisibleDirectiveAdmission.is_directive, true);
assert.equal(agentVisibleDirectiveAdmission.directive_visibility, 'agent_visible');
assert.equal(agentVisibleDirectiveAdmission.directive_render_to_agent, true);
assert.equal(agentVisibleDirectiveAdmission.creates_turn, true);
assert.equal(agentVisibleDirectiveAdmission.dispatch_to_provider, true);

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
const observerInput = createInputEvent({
  ...baseInput,
  event_id: 'input_observer_ok',
  source_kind: 'agent',
  source_id: 'narada.observer',
  delivery_mode: 'admit_after_active_turn',
  metadata: {
    observer: {
      role: 'observer',
      rule_id: 'hesitation-source-check',
      visibility: 'operator_visible',
      confidence: 'medium',
    },
  },
});
assert.equal(observerInput.metadata.observer.visibility, 'operator_visible');
assert.deepEqual(classifyCarrierObserverInput(observerInput), {
  is_observer: true,
  visibility: 'operator_visible',
  observer_muted: false,
  suppressed: false,
  suppression_reason: null,
  visible_to_operator: true,
  dispatch_to_agent: false,
  creates_turn: false,
  completes_without_provider: true,
  handle_outside_turn: true,
  payload: observerPayload(observerInput),
});
const operatorVisibleAdmission = classifyCarrierInputAdmission(observerInput, { activeTurn: false });
assert.equal(operatorVisibleAdmission.creates_turn, false);
assert.equal(operatorVisibleAdmission.complete_without_provider, true);
assert.deepEqual(operatorVisibleAdmission.visible_events, [{
  event_kind: 'observer_interjection_visible',
  payload: observerPayload(observerInput),
}]);
assert.equal(operatorVisibleAdmission.admission_events.some((event) => event.event_kind === 'observer_interjection_admitted'), true);
const recordOnlyObserverInput = createInputEvent({
  ...baseInput,
  event_id: 'input_observer_record_only',
  source_kind: 'agent',
  source_id: 'narada.observer',
  delivery_mode: 'admit_after_active_turn',
  metadata: {
    observer: {
      role: 'observer',
      rule_id: 'record-only-check',
      visibility: 'record_only',
    },
  },
});
const recordOnlyAdmission = classifyCarrierInputAdmission(recordOnlyObserverInput, { activeTurn: false });
assert.equal(recordOnlyAdmission.creates_turn, false);
assert.equal(recordOnlyAdmission.complete_without_provider, true);
assert.deepEqual(recordOnlyAdmission.visible_events, []);
assert.deepEqual(recordOnlyAdmission.admission_events.map((event) => event.event_kind), ['observer_observation_recorded']);
const agentObserverInput = createInputEvent({
  ...baseInput,
  event_id: 'input_observer_agent_visible',
  source_kind: 'agent',
  source_id: 'narada.observer',
  delivery_mode: 'admit_after_active_turn',
  metadata: {
    observer: {
      role: 'observer',
      rule_id: 'agent-visible-check',
      visibility: 'agent_visible',
    },
  },
});
const agentVisibleAdmission = classifyCarrierInputAdmission(agentObserverInput, { activeTurn: false });
assert.equal(agentVisibleAdmission.creates_turn, true);
assert.equal(agentVisibleAdmission.dispatch_to_provider, true);
assert.deepEqual(agentVisibleAdmission.visible_events, []);
assert.equal(agentVisibleAdmission.admission_events.some((event) => event.event_kind === 'input_admitted_to_turn'), true);
const conversationObserverInput = createInputEvent({
  ...baseInput,
  event_id: 'input_observer_conversation',
  source_kind: 'agent',
  source_id: 'narada.observer',
  delivery_mode: 'admit_after_active_turn',
  metadata: {
    observer: {
      role: 'observer',
      rule_id: 'conversation-visible-check',
      visibility: 'conversation_visible',
    },
  },
});
assert.equal(classifyCarrierObserverInput(conversationObserverInput).creates_turn, true);
assert.equal(classifyCarrierObserverInput(conversationObserverInput).dispatch_to_agent, true);
assert.equal(classifyCarrierObserverInput(conversationObserverInput).visible_to_operator, true);
const conversationVisibleAdmission = classifyCarrierInputAdmission(conversationObserverInput, { activeTurn: false });
assert.equal(conversationVisibleAdmission.creates_turn, true);
assert.equal(conversationVisibleAdmission.dispatch_to_provider, true);
assert.deepEqual(conversationVisibleAdmission.visible_events, [{
  event_kind: 'observer_interjection_visible',
  payload: observerPayload(conversationObserverInput),
}]);
assert.deepEqual(classifyCarrierObserverInput(conversationObserverInput, { observerMuted: true }), {
  is_observer: true,
  visibility: 'conversation_visible',
  observer_muted: true,
  suppressed: true,
  suppression_reason: 'observer_muted',
  visible_to_operator: false,
  dispatch_to_agent: false,
  creates_turn: false,
  completes_without_provider: true,
  handle_outside_turn: true,
  payload: observerPayload(conversationObserverInput, { suppression_reason: 'observer_muted' }),
});
const mutedAdmission = classifyCarrierInputAdmission(conversationObserverInput, { activeTurn: false, observerMuted: true });
assert.equal(mutedAdmission.creates_turn, false);
assert.equal(mutedAdmission.dispatch_to_provider, false);
assert.equal(mutedAdmission.complete_without_provider, true);
assert.equal(mutedAdmission.suppression_reason, 'observer_muted');
assert.deepEqual(mutedAdmission.visible_events, []);
assert.equal(mutedAdmission.admission_events.some((event) => event.event_kind === 'observer_interjection_suppressed'), true);
const queuedSteeringAdmission = classifyCarrierInputQueueAdmission(steering, { activeTurn: true });
assert.equal(queuedSteeringAdmission.admission_action, 'queue');
assert.equal(queuedSteeringAdmission.queue_action, 'enqueue');
assert.equal(queuedSteeringAdmission.queue_state, 'queued_for_turn_boundary');
assert.deepEqual(queuedSteeringAdmission.queue_events, [{
  event_kind: 'input_queued_for_turn_boundary',
  payload: {
    input_event_id: steering.event_id,
    queue_state: 'queued_for_turn_boundary',
  },
}]);
const idleSteeringQueueAdmission = classifyCarrierInputQueueAdmission(steering, { activeTurn: false });
assert.equal(idleSteeringQueueAdmission.admission_action, 'admit');
assert.equal(idleSteeringQueueAdmission.queue_action, 'enqueue');
assert.equal(idleSteeringQueueAdmission.queue_state, 'queued_for_turn_boundary');
assert.deepEqual(idleSteeringQueueAdmission.queue_events, [{
  event_kind: 'input_queued_for_turn_boundary',
  payload: {
    input_event_id: steering.event_id,
    queue_state: 'queued_for_turn_boundary',
  },
}]);
assert.deepEqual(
  idleSteeringQueueAdmission.admission_events.map((event) => event.event_kind),
  ['input_admitted_to_turn'],
);
assert.equal(classifyCarrierObserverInput({ ...baseInput, metadata: {} }).is_observer, false);
assert.equal(classifyCarrierObserverInput({ ...baseInput, metadata: {} }).creates_turn, true);
assert.match(thrownMessage(() => createInputEvent({
  ...baseInput,
  event_id: 'input_observer_source_bad',
  source_kind: 'agent',
  source_id: 'sonar.resident',
  metadata: {
    observer: {
      role: 'observer',
      rule_id: 'hesitation-source-check',
      visibility: 'operator_visible',
    },
  },
})), /observer.source_id_not_observer/);
assert.match(thrownMessage(() => createInputEvent({
  ...baseInput,
  event_id: 'input_observer_agent_control_bad',
  source_kind: 'agent',
  source_id: 'narada.observer',
  metadata: {
    agent_control_input: true,
    observer: {
      role: 'observer',
      rule_id: 'hesitation-source-check',
      visibility: 'operator_visible',
    },
  },
})), /observer.cannot_be_agent_control_input/);
assert.match(thrownMessage(() => createInputEvent({
  ...baseInput,
  event_id: 'input_observer_operator_bad',
  source_kind: 'operator',
  source_id: 'operator',
  metadata: {
    observer: {
      role: 'observer',
      rule_id: 'hesitation-source-check',
      visibility: 'operator_visible',
    },
  },
})), /observer_metadata_requires_agent_source/);
assert.match(thrownMessage(() => createInputEvent({
  ...baseInput,
  event_id: 'input_observer_impersonation_bad',
  source_kind: 'agent',
  source_id: 'narada.observer',
  metadata: {
    observer: {
      role: 'observer',
      rule_id: 'hidden-system-injection',
      visibility: 'agent_visible',
      confidence: 'high',
      impersonates_system: true,
    },
  },
})), /observer.observer_impersonation_forbidden/);
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
const normalizedProtocolControl = normalizeControlInputRecord(agentVisibleDirectiveInput, { transport: 'control_jsonl' });
assert.equal(normalizedProtocolControl.schema, CONTROL_INPUT_EVENT_SCHEMA);
assert.equal(normalizedProtocolControl.input.source_kind, 'system');
assert.equal(normalizedProtocolControl.input.directive_id, 'dir_agent_visible');
const normalizedWrappedProtocolControl = normalizeControlInputRecord({
  control_event_id: 'control_wrapped_protocol_1',
  written_at: '2026-05-30T00:00:03.000Z',
  input: agentVisibleDirectiveInput,
});
assert.equal(normalizedWrappedProtocolControl.input.source_kind, 'system');
assert.equal(normalizedWrappedProtocolControl.input.directive_id, 'dir_agent_visible');

const payloadRef = createPayloadRef({ payload_ref: 'mcp_payload:payload_test@v1', summary: 'large result' });
assert.equal(payloadRef.schema, PAYLOAD_REF_SCHEMA);
assert.equal(payloadRef.reader_tool, 'mcp_payload_show');
assert.deepEqual(validatePayloadRef(payloadRef), []);
assert.doesNotThrow(() => assertValidPayloadRef(payloadRef));
const legacyPayloadRef = createPayloadRef({ payload_ref: 'mcp_payload:payload_legacy@v1', reader_tool: 'mcp_payload_read', summary: 'legacy payload' });
assert.deepEqual(validatePayloadRef(legacyPayloadRef), []);
const outputRef = createPayloadRef({ payload_ref: 'mcp_output:o_test', reader_tool: 'mcp_output_show', summary: 'large tool output' });
assert.equal(outputRef.schema, PAYLOAD_REF_SCHEMA);
assert.deepEqual(validatePayloadRef(outputRef), []);
assert.doesNotThrow(() => assertValidPayloadRef(outputRef));
assert.match(thrownMessage(() => createPayloadRef({ payload_ref: 'mcp_output:o_test', summary: 'x' })), /invalid_payload_ref/);
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
const providerRequestPayload = createProviderRequestPayload({
  turn_id: 'turn_test',
  input_event_id: input.event_id,
  provider_request_status: 'recorded_not_dispatched',
  provider_execution_enabled: false,
  provider_runtime_status: 'configured',
  provider_adapter_admission_status: 'configured_without_adapter',
  provider: 'codex-subscription',
  model: 'gpt-5.5',
  stream: true,
  provider_streaming_contract: 'requested_but_not_dispatched',
  provider_adapter_refusal_reason: 'provider_adapter_not_configured',
  provider_adapter_refusal_reason: 'provider_adapter_not_configured',
  content_preview: input.content,
});
assert.equal(providerRequestPayload.schema, PROVIDER_REQUEST_PAYLOAD_SCHEMA);
assert.deepEqual(validateSessionEvent(createSessionEvent({
  ...sessionBase,
  event_kind: 'provider_request_recorded',
  payload: providerRequestPayload,
})), []);
assert.match(thrownMessage(() => createSessionEvent({
  ...sessionBase,
  event_kind: 'provider_request_recorded',
  payload: { ...providerRequestPayload, stream: 'yes' },
})), /payload.invalid_stream/);
const providerTextDeltaPayload = createProviderTextDeltaPayload({
  turn_id: 'turn_test',
  sequence: 1,
  text_delta: 'hello',
});
assert.equal(providerTextDeltaPayload.schema, PROVIDER_OUTPUT_PAYLOAD_SCHEMA);
assert.deepEqual(validateSessionEvent(createSessionEvent({
  ...sessionBase,
  event_kind: 'provider_text_delta_recorded',
  payload: providerTextDeltaPayload,
})), []);
assert.match(thrownMessage(() => createSessionEvent({
  ...sessionBase,
  event_kind: 'provider_text_delta_recorded',
  payload: { ...providerTextDeltaPayload, sequence: -1 },
})), /payload.invalid_sequence/);
const providerToolCallPayload = createProviderToolCallPayload({
  turn_id: 'turn_test',
  sequence: 2,
  tool_name: 'site_loop_run_once',
  arguments_summary: '{}',
});
assert.equal(providerToolCallPayload.schema, PROVIDER_OUTPUT_PAYLOAD_SCHEMA);
assert.deepEqual(validateSessionEvent(createSessionEvent({
  ...sessionBase,
  event_kind: 'provider_tool_call_requested',
  payload: providerToolCallPayload,
})), []);
assert.match(thrownMessage(() => createSessionEvent({
  ...sessionBase,
  event_kind: 'provider_tool_call_requested',
  payload: { ...providerToolCallPayload, provider_output_kind: 'text_delta' },
})), /payload.invalid_provider_output_kind:text_delta/);
const completedTurnPayload = createTurnTerminalPayload({
  turn_id: 'turn_test',
  input_event_id: input.event_id,
  terminal_status: 'completed_without_provider',
  provider_request_status: 'recorded_not_dispatched',
  provider_execution_enabled: false,
});
assert.equal(completedTurnPayload.schema, TURN_TERMINAL_PAYLOAD_SCHEMA);
assert.equal(completedTurnPayload.input_event_id, input.event_id);
const completedTurn = createSessionEvent({
  ...sessionBase,
  event_kind: 'turn_completed',
  payload: completedTurnPayload,
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
assert.match(thrownMessage(() => createSessionEvent({ ...sessionBase, event_kind: 'tool_result_received', payload: { tool_name: 'x', status: 'unknown', duration_ms: 0, result_summary: '' } })), /payload.invalid_status:unknown/);
assert.match(thrownMessage(() => createSessionEvent({ ...sessionBase, event_kind: 'tool_result_received', payload: { tool_name: 'x', status: 'denied', admission_action: 'maybe', duration_ms: 0, result_summary: '' } })), /payload.invalid_admission_action:maybe/);
assert.match(thrownMessage(() => createSessionEvent({ ...sessionBase, event_kind: 'tool_result_received', payload: { tool_name: 'x', status: 'denied', admission_reason: 'unknown_reason', duration_ms: 0, result_summary: '' } })), /payload.invalid_admission_reason:unknown_reason/);
assert.match(thrownMessage(() => createSessionEvent({ ...sessionBase, event_kind: 'tool_result_received', payload: { tool_name: 'x', status: 'ok', capability_ref: '', duration_ms: 0, result_summary: '' } })), /payload.invalid_capability_ref/);
assert.match(thrownMessage(() => createSessionEvent({ ...sessionBase, event_kind: 'tool_result_received', payload: { tool_name: 'x', status: 'ok', effect_scope: '', duration_ms: 0, result_summary: '' } })), /payload.invalid_effect_scope/);
assert.match(thrownMessage(() => createSessionEvent({ ...sessionBase, event_kind: 'tool_result_received', payload: { tool_name: 'x', status: 'ok', authority_ref: '', duration_ms: 0, result_summary: '' } })), /payload.invalid_authority_ref/);

assert.equal(isTerminalTurnState('completed'), true);
assert.equal(isTerminalTurnState('active'), false);

console.log('carrier protocol tests PASSED.');
