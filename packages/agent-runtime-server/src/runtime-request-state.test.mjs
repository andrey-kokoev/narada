import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canTransitionNarsRuntimeRequest,
  createNarsRuntimeRequestRegistry,
  createNarsRuntimeRequestStateMachine,
} from './runtime-request-state.mjs';

test('runtime request FSM distinguishes normal execution from close waiting', () => {
  const normal = createNarsRuntimeRequestStateMachine({ runtimeRequestId: 'runtime_request_normal', requestId: 'turn-1', method: 'session.submit' });
  assert.deepEqual([
    normal.transition('received').request_state,
    normal.transition('scheduled').request_state,
    normal.transition('running').request_state,
    normal.transition('completed').request_state,
  ], ['received', 'scheduled', 'running', 'completed']);

  const close = createNarsRuntimeRequestStateMachine({ runtimeRequestId: 'runtime_request_close', requestId: 'close-1', method: 'session.close' });
  for (const state of ['received', 'scheduled', 'waiting', 'running', 'completed']) close.transition(state);
  assert.equal(close.snapshot().terminal_state, 'completed');
  assert.equal(canTransitionNarsRuntimeRequest('scheduled', 'completed'), false);
});

test('runtime request FSM rejects terminal re-entry and the registry tracks pending operations', async () => {
  const transitions = [];
  const registry = createNarsRuntimeRequestRegistry({ onTransition: (record) => transitions.push(record) });
  const request = registry.receive({ requestId: 'health-1', method: 'session.health' });
  request.transition('scheduled');
  const pending = new Promise((resolve) => setTimeout(resolve, 1));
  registry.track(request.runtimeRequestId, pending);
  assert.equal(registry.snapshot().pending_operation_count, 1);
  await pending;
  assert.equal(registry.snapshot().pending_operation_count, 0);
  request.transition('running');
  request.transition('completed');
  assert.throws(() => request.transition('failed'), /invalid_nars_runtime_request_transition:completed:failed/);
  assert.equal(transitions.at(-1).request_state, 'completed');
});
