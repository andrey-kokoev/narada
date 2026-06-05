import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTranscriptClassifiersContract } from './carrier-rendering-contract.mjs';

test('transcript classifiers contract exposes render classification tokens', () => {
  const contract = loadTranscriptClassifiersContract();
  assert.equal(contract.schema, 'narada.carrier.transcript_rendering_classifiers.v1');
  assert.equal(contract.turn_state.active_display, 'thinking');
  assert.deepEqual(contract.turn_state.suppressed_markers, ['idle', 'active']);
  assert.deepEqual(contract.turn_state.positive_values, ['active', 'working']);
  assert.deepEqual(contract.turn_state.positive_prefixes, ['active ', 'calling ']);
  assert.deepEqual(contract.turn_state.negative_values, ['failed', 'interrupted']);
  assert.deepEqual(contract.turn_state.duration_phases, ['thinking', 'calling']);
  assert.deepEqual(contract.turn_state.operator_activity_actions, ['typing', 'queued']);
  assert.equal(contract.turn_state.operator_activity_actor, 'operator');
  assert.deepEqual(contract.terminal_status.positive, ['completed', 'completed_without_provider']);
  assert.deepEqual(contract.tool_result.positive_prefixes, ['ok', 'success']);
  assert.deepEqual(contract.tool_result.negative_prefixes, ['failed', 'error', 'refused']);
  assert.deepEqual(contract.tool_result.positive_summaries, ['ok', 'success', 'completed']);
  assert.deepEqual(contract.tool_result.negative_summaries, [
    'failed',
    'failure',
    'error',
    'refused',
    'interrupted',
  ]);
  assert.deepEqual(contract.semantic_status_value.positive, [
    'ok',
    'success',
    'succeeded',
    'passed',
    'ready',
    'aligned',
    'true',
    'yes',
  ]);
  assert.deepEqual(contract.semantic_status_value.negative, [
    'failed',
    'failure',
    'error',
    'refused',
    'missing',
  ]);
  assert.deepEqual(contract.semantic_status_value.warning, [
    'warning',
    'warn',
    'blocked',
    'partial',
    'stale',
    'pending',
  ]);
  assert.deepEqual(contract.semantic_status_value.muted, ['false', 'no', 'none', 'null']);
  assert.deepEqual(contract.runtime_status.positive, ['configured', 'admitted', 'idle', 'working']);
  assert.deepEqual(contract.runtime_status.warning_prefixes, ['configured_']);
  assert.deepEqual(contract.runtime_status.negative_prefixes, ['refused', 'failed', 'error']);
  assert.deepEqual(contract.runtime_status.muted, ['disabled', 'none']);
  assert.equal(contract.diagnostic.prefix, 'diagnostic ');
  assert.deepEqual(contract.diagnostic.warning_severities, ['warn', 'warning']);
  assert.deepEqual(contract.diagnostic.negative_severities, ['error', 'failed', 'failure']);
  assert.deepEqual(contract.diagnostic.positive_severities, ['ok', 'success']);
});
