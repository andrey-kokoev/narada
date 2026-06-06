import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OBSERVER_VISIBILITIES,
  PAYLOAD_REF_READER_TOOLS,
  QUEUE_STATES,
  SESSION_EVENT_KINDS,
} from '../../carrier-protocol/src/carrier-protocol.mjs';
import { loadCarrierProtocolContract } from './carrier-protocol-contract.mjs';

test('carrier protocol contract exposes schemas and id prefixes', () => {
  const contract = loadCarrierProtocolContract();
  assert.equal(contract.schema, 'narada.carrier.protocol_contract.v1');
  assert.equal(contract.schemas.input_event, 'narada.carrier.input_event.v1');
  assert.equal(contract.schemas.session_event, 'narada.carrier.session_event.v1');
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
  assert.deepEqual(contract.queue_state.values, QUEUE_STATES);
  assert.deepEqual(contract.input_admission_action.values, ['admit', 'queue', 'hold', 'reject']);
  assert.deepEqual(contract.input_hold_action.values, ['hold', 'release', 'none']);
  assert.deepEqual(contract.observer_suppression_reason.values, ['observer_muted']);
  assert.deepEqual(contract.payload_ref_reader_tool.values, PAYLOAD_REF_READER_TOOLS);
  assert.deepEqual(contract.input_pipeline_event_kind, {
    queue: ['input_queued_for_turn_boundary'],
    admission: [
      'observer_observation_recorded',
      'observer_interjection_proposed',
      'observer_interjection_admitted',
      'observer_interjection_suppressed',
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
    ...contract.input_pipeline_event_kind.hold,
    ...contract.input_pipeline_event_kind.release,
    ...contract.carrier_host_command_event_kind.values,
  ]) {
    assert.equal(SESSION_EVENT_KINDS.includes(eventKind), true, eventKind);
  }
});
