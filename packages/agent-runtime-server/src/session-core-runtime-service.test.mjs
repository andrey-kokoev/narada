import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldPersistNarsRuntimeRequestTransition } from './session-core-runtime-service.mjs';

test('routine session health transitions stay out of the durable session event stream', () => {
  for (const requestState of ['received', 'scheduled', 'running', 'completed']) {
    assert.equal(shouldPersistNarsRuntimeRequestTransition({
      method: 'session.health',
      request_state: requestState,
      terminal_state: requestState === 'completed' ? 'completed' : null,
    }), false, requestState);
  }
});

test('failed health transitions remain durable diagnostics', () => {
  assert.equal(shouldPersistNarsRuntimeRequestTransition({
    method: 'session.health',
    request_state: 'failed',
    terminal_state: 'failed',
  }), true);
  assert.equal(shouldPersistNarsRuntimeRequestTransition({
    method: 'session.health',
    request_state: 'rejected',
    terminal_state: 'rejected',
  }), true);
});

test('non-health request transitions remain durable', () => {
  assert.equal(shouldPersistNarsRuntimeRequestTransition({
    method: 'session.submit',
    request_state: 'completed',
    terminal_state: 'completed',
  }), true);
});
