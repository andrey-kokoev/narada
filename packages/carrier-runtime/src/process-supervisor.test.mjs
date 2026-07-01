import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  createOwnedProcess,
  spawnOwnedProcess,
  terminateOwnedProcessRegistry,
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

test('spawnOwnedProcess forces hidden provider subprocess posture', () => {
  const owner = spawnOwnedProcess(process.execPath, ['--version'], {
    stdio: 'ignore',
  }, {
    owner: 'provider-test',
  });

  assert.equal(typeof owner.pid, 'number');
  const result = owner.terminateTree('test_cleanup');
  assert.equal(result.owner, 'provider-test');
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

test('owned process registry removes children after normal exit', () => {
  const registry = new Set();
  const processTarget = new EventEmitter();
  const child = new EventEmitter();
  child.pid = 1111;
  child.killed = false;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => {
    child.killed = true;
  };

  createOwnedProcess(child, { registry, processTarget });
  assert.equal(registry.size, 1);

  child.emit('exit', 0);
  assert.equal(registry.size, 0);
});

test('owned process registry cleans live children on process exit', () => {
  const registry = new Set();
  const processTarget = new EventEmitter();
  const calls = [];
  const child = new EventEmitter();
  child.pid = 2222;
  child.killed = false;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => {
    child.killed = true;
    calls.push({ command: 'child.kill' });
  };

  createOwnedProcess(child, {
    registry,
    processTarget,
    platform: 'win32',
    spawnSyncFn: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0 };
    },
  });

  assert.equal(registry.size, 1);
  processTarget.emit('exit');

  assert.equal(registry.size, 0);
  assert.deepEqual(calls[0], {
    command: 'taskkill.exe',
    args: windowsProcessTreeKillArgs(2222),
    options: { stdio: 'ignore', windowsHide: true },
  });
  assert.deepEqual(calls[1], { command: 'child.kill' });
});

test('terminateOwnedProcessRegistry clears and reports attempted owners', () => {
  const registry = new Set();
  const calls = [];
  registry.add({ terminateTree: (reason) => calls.push(reason) });
  registry.add({ terminateTree: (reason) => calls.push(reason) });

  const result = terminateOwnedProcessRegistry('test_exit', { registry });

  assert.deepEqual(result, { reason: 'test_exit', attempted: 2 });
  assert.deepEqual(calls, ['test_exit', 'test_exit']);
  assert.equal(registry.size, 0);
});
