import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CARRIER_DIRECTIVE_EMITTER_REGISTRY,
  DIRECTIVE_KINDS,
  DIRECTIVE_SUPPRESSION_REASONS,
  DIRECTIVE_TARGET_KINDS,
  DIRECTIVE_TRIGGER_KINDS,
  DIRECTIVE_VISIBILITIES,
  OBSERVER_VISIBILITIES,
  PAYLOAD_REF_READER_TOOLS,
  QUEUE_STATES,
  SESSION_EVENT_KINDS,
  TOOL_EFFECT_ADMISSION_ACTIONS,
  TOOL_EFFECT_ADMISSION_CASES_SCHEMA,
  TOOL_EFFECT_ADMISSION_REASONS,
  TOOL_RESULT_STATUSES,
} from '@narada2/carrier-protocol';
import { loadCarrierProtocolContract } from './carrier-protocol-contract.mjs';

test('carrier protocol contract exposes schemas and id prefixes', () => {
  const contract = loadCarrierProtocolContract();
  assert.equal(contract.schema, 'narada.carrier.protocol_contract.v1');
  assert.equal(contract.schemas.input_event, 'narada.carrier.input_event.v1');
  assert.equal(contract.schemas.session_event, 'narada.carrier.session_event.v1');
  assert.equal(contract.schemas.tool_effect_admission_cases, TOOL_EFFECT_ADMISSION_CASES_SCHEMA);
  assert.equal(contract.id_prefixes.input_event, 'input_');
  assert.equal(contract.id_prefixes.control_event, 'control_');
  assert.equal(contract.id_prefixes.session_event, 'session_event_');
  assert.deepEqual(contract.diagnostic.levels, ['debug', 'info', 'warn', 'error']);
  assert.equal(contract.diagnostic.warning_level, 'warn');
  assert.equal(contract.diagnostic.info_level, 'info');
  assert.deepEqual(contract.turn_terminal_status.completed, [
    'completed',
    'completed_after_dispatch',
    'completed_without_provider',
  ]);
  assert.deepEqual(contract.turn_terminal_status.interrupted, ['interrupted']);
  assert.deepEqual(contract.turn_terminal_status.failed, ['failed']);
  assert.deepEqual(contract.terminal_state.values, ['completed', 'interrupted', 'failed']);
  assert.deepEqual(contract.delivery_mode.values, [
    'admit_for_current_turn',
    'admit_after_active_turn',
  ]);
  assert.deepEqual(contract.observer_visibility.values, OBSERVER_VISIBILITIES);
  assert.equal(contract.observer_visibility.default, 'operator_visible');
  assert.deepEqual(contract.directive_visibility.values, DIRECTIVE_VISIBILITIES);
  assert.equal(contract.directive_visibility.default, 'agent_visible');
  assert.deepEqual(contract.directive_kind.values, DIRECTIVE_KINDS);
  assert.equal(contract.directive_kind.basic_test_kind, 'operation_heartbeat');
  assert.deepEqual(contract.directive_target_kind.values, DIRECTIVE_TARGET_KINDS);
  assert.deepEqual(contract.directive_trigger_kind.values, DIRECTIVE_TRIGGER_KINDS);
  assert.deepEqual(contract.directive_emission_suppression_reason.values, DIRECTIVE_SUPPRESSION_REASONS);
  assert.deepEqual(contract.directive_emitter_registry.entries.map((entry) => entry.directive_kind), DIRECTIVE_KINDS);
  for (const entry of contract.directive_emitter_registry.entries) {
    const spec = CARRIER_DIRECTIVE_EMITTER_REGISTRY[entry.directive_kind];
    assert.equal(entry.default_visibility, spec.default_visibility);
    assert.equal(entry.default_cadence, spec.default_cadence);
    assert.equal(entry.trigger_kind, spec.trigger_kind);
    assert.equal(entry.target_kind, spec.target_kind);
  }
  assert.deepEqual(contract.directive_emission_event_kind.values, [
    'directive_emission_authorized',
    'directive_emission_rule_recorded',
    'directive_emitted',
  ]);
  assert.deepEqual(contract.queue_state.values, QUEUE_STATES);
  assert.deepEqual(contract.input_admission_action.values, ['admit', 'queue', 'hold', 'reject']);
  assert.deepEqual(contract.input_hold_action.values, ['hold', 'release', 'none']);
  assert.deepEqual(contract.observer_suppression_reason.values, ['observer_muted']);
  assert.deepEqual(contract.payload_ref_reader_tool.values, PAYLOAD_REF_READER_TOOLS);
  assert.deepEqual(contract.tool_result_status.values, TOOL_RESULT_STATUSES);
  assert.deepEqual(contract.tool_effect_admission_action.values, TOOL_EFFECT_ADMISSION_ACTIONS);
  assert.deepEqual(contract.tool_effect_admission_reason.values, TOOL_EFFECT_ADMISSION_REASONS);
  assert.deepEqual(contract.tool_result_payload.required, ['tool_name', 'status', 'duration_ms', 'result_summary']);
  assert.deepEqual(contract.tool_result_payload.optional, ['admission_action', 'admission_reason', 'capability_ref', 'effect_scope', 'authority_ref', 'result_ref']);
  assert.deepEqual(contract.tool_result_payload.consistency.paired_fields, [['admission_action', 'admission_reason']]);
  assert.deepEqual(contract.tool_result_payload.consistency.admission_action_status.deny, ['denied']);
  assert.deepEqual(contract.tool_result_payload.consistency.admission_action_status.admit, ['ok', 'failed']);
  assert.deepEqual(contract.tool_result_payload.consistency.admission_action_reason.admit, ['read_only_tool_effect_admitted', 'write_tool_effect_admitted']);
  assert.deepEqual(contract.tool_result_payload.consistency.admission_action_reason.deny, ['tool_effect_adapter_unconfigured', 'tool_effect_admission_required', 'unsupported_tool_effect', 'tool_effect_authority_denied']);
  assert.deepEqual([
    ...contract.tool_result_payload.consistency.admission_action_status.deny,
    ...contract.tool_result_payload.consistency.admission_action_status.admit,
  ].sort(), [...TOOL_RESULT_STATUSES].sort());
  assert.deepEqual([
    ...contract.tool_result_payload.consistency.admission_action_reason.admit,
    ...contract.tool_result_payload.consistency.admission_action_reason.deny,
  ].sort(), [...TOOL_EFFECT_ADMISSION_REASONS].sort());
  assert.deepEqual(contract.input_pipeline_event_kind, {
    queue: ['input_queued_for_turn_boundary'],
    admission: [
      'observer_observation_recorded',
      'observer_interjection_proposed',
      'observer_interjection_admitted',
      'observer_interjection_suppressed',
      'directive_receipt_recorded',
      'directive_carrier_accepted_recorded',
      'input_admitted_to_turn',
    ],
    visible: ['observer_interjection_visible'],
    hold: ['system_directive_held'],
    release: ['system_directive_released'],
  });
  assert.deepEqual(contract.carrier_host_command_event_kind.values, [
    'carrier_host_command_requested',
    'carrier_host_command_admitted',
    'carrier_host_command_rejected',
    'carrier_host_command_started',
    'carrier_host_command_completed',
    'carrier_host_command_failed',
  ]);
  for (const eventKind of [
    ...contract.input_pipeline_event_kind.queue,
    ...contract.input_pipeline_event_kind.admission,
    ...contract.directive_emission_event_kind.values,
    ...contract.input_pipeline_event_kind.hold,
    ...contract.input_pipeline_event_kind.release,
    ...contract.carrier_host_command_event_kind.values,
  ]) {
    assert.equal(SESSION_EVENT_KINDS.includes(eventKind), true, eventKind);
  }
});
