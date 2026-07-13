import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNarsRuntimeHostTransition,
  canTransitionNarsRuntimeHost,
  createNarsRuntimeHostStateMachine,
} from '../src/runtime-host-state.mjs';

test('runtime host FSM owns process and projection lifecycle only', () => {
  const records = [];
  const host = createNarsRuntimeHostStateMachine({
    metadata: { session_id: 'runtime-host-test' },
    now: () => '2026-07-13T00:00:00.000Z',
    onTransition: (record) => records.push(record),
  });

  assert.equal(host.state, 'created');
  host.transition('binding', { reason: 'session_binding_ready' });
  host.transition('projections_ready', { health_enabled: true, events_enabled: true });
  host.transition('serving', { reason: 'runtime_service_started' });
  host.transition('closing', { reason: 'runtime_service_stopped' });
  host.transition('stopped', { reason: 'projections_closed' });
  assert.equal(host.snapshot().runtime_host_state, 'stopped');
  assert.deepEqual(records.map((record) => record.runtime_host_state), [
    'binding',
    'projections_ready',
    'serving',
    'closing',
    'stopped',
  ]);
  assert.throws(() => host.transition('serving'), /invalid_nars_runtime_host_transition/);
});

test('runtime host failure can still be cleaned up', () => {
  assert.equal(canTransitionNarsRuntimeHost('serving', 'failed'), true);
  assert.equal(canTransitionNarsRuntimeHost('failed', 'closing'), true);
  assert.equal(canTransitionNarsRuntimeHost('stopped', 'failed'), false);
  assert.throws(
    () => assertNarsRuntimeHostTransition('created', 'serving'),
    /invalid_nars_runtime_host_transition/,
  );
  const host = createNarsRuntimeHostStateMachine();
  host.transition('binding');
  host.transition('failed', { reason: 'projection_start_failed' });
  host.transition('closing');
  host.transition('stopped');
  assert.equal(host.state, 'stopped');
});
