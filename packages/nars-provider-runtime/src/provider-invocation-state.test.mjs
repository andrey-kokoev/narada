import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNarsProviderInvocationTransition,
  canTransitionNarsProviderInvocation,
  NARS_PROVIDER_INVOCATION_STATE_SCHEMA,
  normalizeNarsProviderInvocationRecord,
} from './provider-invocation-state.mjs';

test('provider invocation FSM admits the complete successful lifecycle', () => {
  const states = [null, 'requested', 'validated', 'shaped', 'dispatched', 'admitting', 'admitted', 'receiving', 'completed'];
  for (let index = 1; index < states.length; index += 1) {
    assert.equal(canTransitionNarsProviderInvocation(states[index - 1], states[index]), true);
    assert.equal(assertNarsProviderInvocationTransition(states[index - 1], states[index]), states[index]);
  }
});

test('provider invocation FSM exposes terminal outcomes and rejects terminal replay', () => {
  assert.equal(canTransitionNarsProviderInvocation('requested', 'refused'), true);
  assert.equal(canTransitionNarsProviderInvocation('receiving', 'interrupted'), true);
  assert.equal(canTransitionNarsProviderInvocation('receiving', 'failed'), true);
  for (const terminal of ['completed', 'refused', 'interrupted', 'failed']) {
    const replayState = terminal === 'completed' ? 'failed' : 'completed';
    assert.equal(canTransitionNarsProviderInvocation(terminal, replayState), false);
    assert.throws(() => assertNarsProviderInvocationTransition(terminal, replayState), /invalid_nars_provider_invocation_transition/);
  }
});

test('provider invocation FSM rejects skipped or unknown transitions', () => {
  assert.equal(canTransitionNarsProviderInvocation(null, 'validated'), false);
  assert.equal(canTransitionNarsProviderInvocation('validated', 'receiving'), false);
  assert.throws(() => assertNarsProviderInvocationTransition(null, 'validated'), /invalid_nars_provider_invocation_transition/);
  assert.throws(() => assertNarsProviderInvocationTransition('unknown', 'failed'), /invalid_nars_provider_invocation_transition/);
});

test('provider invocation record normalizes correlation and terminal evidence', () => {
  const record = normalizeNarsProviderInvocationRecord({
    provider_invocation_id: 'prov_inv_test',
    provider: 'openai-api',
    adapter_kind: 'openai-compatible-chat-completions',
    transport: 'http',
    turn_id: 'turn-1',
    input_event_id: 'input-1',
    invocation_state: 'failed',
    reason: 'provider_failure',
    error: 'API error 500',
  });
  assert.equal(record.schema, NARS_PROVIDER_INVOCATION_STATE_SCHEMA);
  assert.equal(record.invocation_id, 'prov_inv_test');
  assert.equal(record.terminal_state, 'failed');
  assert.equal(record.turn_id, 'turn-1');
  assert.equal(record.input_event_id, 'input-1');
});
