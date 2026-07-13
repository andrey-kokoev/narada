import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertNarsOwnedProcessTransition,
  canTransitionNarsOwnedProcess,
  createNarsOwnedProcessStateMachine,
} from './owned-process-state.mjs';
import { createOwnedProcess } from './process-supervisor.mjs';

test('owned process FSM separates termination from release', () => {
  const machine = createNarsOwnedProcessStateMachine();
  machine.transition('running', { pid: 42 });
  machine.transition('terminating', { reason: 'session_close' });
  machine.transition('exited', { exit_code: 0 });
  machine.transition('released', { reason: 'child_closed' });
  assert.equal(machine.state, 'released');
  assert.deepEqual(machine.history.map((entry) => entry.state), ['created', 'running', 'terminating', 'exited', 'released']);
});

test('process supervisor exposes owned child termination and registry release states', () => {
  const listeners = new Map();
  let killCount = 0;
  const child = {
    pid: 42,
    killed: false,
    exitCode: null,
    signalCode: null,
    kill() { killCount += 1; },
    once(event, handler) { listeners.set(event, handler); },
  };
  const registry = new Set();
  const owner = createOwnedProcess(child, {
    registry,
    processTarget: { once() {} },
    platform: 'linux',
  });
  assert.equal(owner.state, 'running');
  assert.equal(registry.has(owner), true);
  owner.terminateTree('test_close');
  assert.equal(owner.state, 'terminating');
  assert.equal(killCount, 1);
  listeners.get('exit')(0, null);
  listeners.get('close')(0, null);
  assert.equal(owner.state, 'released');
  assert.equal(registry.has(owner), false);
  assert.deepEqual(owner.stateHistory.map((entry) => entry.state), ['created', 'running', 'terminating', 'exited', 'released']);
});

test('owned process FSM rejects termination after ownership release', () => {
  assert.equal(canTransitionNarsOwnedProcess('released', 'terminating'), false);
  assert.throws(
    () => assertNarsOwnedProcessTransition('released', 'running'),
    /invalid_nars_owned_process_transition:released:running/,
  );
});

