import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  createOwnedProcess,
  terminateWindowsProcessTree,
  windowsProcessTreeKillArgs,
} from './process-supervisor.mjs';

test('windows process tree cleanup targets the spawned pid recursively and hidden', () => {
  const calls = [];
  const result = terminateWindowsProcessTree(1234, {
    spawnSyncFn: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0 };
    },
  });

  assert.deepEqual(result, { attempted: true, status: 0, error: null });
  assert.deepEqual(calls, [{
    command: 'taskkill.exe',
    args: ['/PID', '1234', '/T', '/F'],
    options: { stdio: 'ignore', windowsHide: true },
  }]);
});

test('owned process terminateTree uses Windows tree cleanup before direct child kill', () => {
  const calls = [];
  const child = new EventEmitter();
  child.pid = 4567;
  child.killed = false;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => {
    child.killed = true;
    calls.push({ command: 'child.kill' });
  };

  const owner = createOwnedProcess(child, {
    owner: 'test-owner',
    platform: 'win32',
    spawnSyncFn: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0 };
    },
  });

  const result = owner.terminateTree('test_abort');

  assert.equal(result.owner, 'test-owner');
  assert.equal(result.reason, 'test_abort');
  assert.equal(result.attempted, true);
  assert.deepEqual(calls[0], {
    command: 'taskkill.exe',
    args: windowsProcessTreeKillArgs(4567),
    options: { stdio: 'ignore', windowsHide: true },
  });
  assert.deepEqual(calls[1], { command: 'child.kill' });
});

test('owned process terminateTree is idempotent', () => {
  let taskkillCount = 0;
  const child = new EventEmitter();
  child.pid = 6789;
  child.killed = false;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => {
    child.killed = true;
  };

  const owner = createOwnedProcess(child, {
    platform: 'win32',
    spawnSyncFn: () => {
      taskkillCount += 1;
      return { status: 0 };
    },
  });

  owner.terminateTree('first');
  const second = owner.terminateTree('second');

  assert.equal(taskkillCount, 1);
  assert.deepEqual(second, {
    owner: 'carrier-runtime',
    reason: 'second',
    attempted: false,
    status: null,
    error: null,
  });
});
