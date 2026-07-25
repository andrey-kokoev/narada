import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canTransitionNarsRuntimeRequest,
  createNarsRuntimeRequestRegistry,
  createNarsRuntimeRequestStateMachine,
  NARS_RUNTIME_REQUEST_RETENTION_LIMIT,
} from './runtime-request-state.js';

test('runtime request FSM distinguishes normal execution from close waiting', () => {
  const normal: any = createNarsRuntimeRequestStateMachine({ runtimeRequestId: 'runtime_request_normal', requestId: 'turn-1', method: 'session.submit' });
  assert.deepEqual([
    normal.transition('received').request_state,
    normal.transition('scheduled').request_state,
    normal.transition('running').request_state,
    normal.transition('completed').request_state,
  ], ['received', 'scheduled', 'running', 'completed']);

  const close: any = createNarsRuntimeRequestStateMachine({ runtimeRequestId: 'runtime_request_close', requestId: 'close-1', method: 'session.close' });
  for (const state of ['received', 'scheduled', 'waiting', 'running', 'completed']) close.transition(state);
  assert.equal(close.snapshot().terminal_state, 'completed');
  assert.equal(canTransitionNarsRuntimeRequest('scheduled', 'completed'), false);
});

test('runtime request FSM rejects terminal re-entry and the registry tracks pending operations', async () => {
  const transitions: any = [];
  const registry: any = createNarsRuntimeRequestRegistry({ onTransition: (record: any) => transitions.push(record) });
  const request: any = registry.receive({ requestId: 'health-1', method: 'session.health' });
  request.transition('scheduled');
  const pending: any = new Promise((resolve: any) => setTimeout(resolve, 1));
  registry.track(request.runtimeRequestId, pending);
  assert.equal(registry.snapshot().pending_operation_count, 1);
  await pending;
  assert.equal(registry.snapshot().pending_operation_count, 0);
  request.transition('running');
  request.transition('completed');
  assert.throws(() => request.transition('failed'), /invalid_nars_runtime_request_transition:completed:failed/);
  assert.equal(transitions.at(-1).request_state, 'completed');
});

test('runtime request registry bounds retained terminal requests without evicting active requests', () => {
  const registry: any = createNarsRuntimeRequestRegistry();
  const active: any = registry.receive({ requestId: 'active-request', method: 'session.submit' });
  active.transition('scheduled');
  active.transition('running');
  for (let index = 0; index < NARS_RUNTIME_REQUEST_RETENTION_LIMIT + 5; index += 1) {
    const request: any = registry.receive({ requestId: `request-${index}`, method: 'session.health' });
    request.transition('scheduled');
    request.transition('running');
    request.transition('completed');
  }

  const snapshot: any = registry.snapshot();
  assert.equal(snapshot.request_count, NARS_RUNTIME_REQUEST_RETENTION_LIMIT + 1);
  assert.equal(snapshot.retained_request_count, NARS_RUNTIME_REQUEST_RETENTION_LIMIT + 1);
  assert.equal(snapshot.retention_limit, NARS_RUNTIME_REQUEST_RETENTION_LIMIT);
  assert.equal(snapshot.retention_scope, 'terminal_requests_only');
  assert.equal(snapshot.active_request_count, 1);
  assert.equal(snapshot.terminal_request_count, NARS_RUNTIME_REQUEST_RETENTION_LIMIT);
  assert.equal(snapshot.request_refs.length, NARS_RUNTIME_REQUEST_RETENTION_LIMIT);
  assert.equal(snapshot.request_refs[0].request_id, 'active-request');
  assert.equal(snapshot.request_refs.at(-1).request_id, 'request-104');
  assert.ok(registry.request(active.runtimeRequestId));
  assert.equal(registry.request('runtime_request_2'), null);
  assert.ok(registry.request('runtime_request_106'));
});
