import assert from 'node:assert/strict';
import { test } from 'node:test';
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
});
