import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import {
  browserOpenCommand,
  normalizeHiddenCommand,
  openBrowserUrl,
  runGovernedCommand,
  spawnHiddenPostureProcess,
  spawnMcpServer,
  spawnProviderSubprocess,
  spawnTestChild,
  startElevatedOrOperatorPrompt,
  startOperatorTerminal,
} from './index.mjs';

test('browserOpenCommand uses hidden helper-compatible Windows command', () => {
  assert.deepEqual(browserOpenCommand('http://127.0.0.1:3000', { platform: 'win32' }), {
    posture: 'browser_open',
    command: 'cmd.exe',
    args: ['/c', 'start', '', 'http://127.0.0.1:3000'],
  });
});

test('named hidden posture wrappers set their posture centrally', () => {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.unref = () => {};
    return child;
  };

  spawnProviderSubprocess('node', ['a'], { spawnImpl });
  spawnMcpServer('node', ['b'], { spawnImpl });
  runGovernedCommand('node', ['c'], { spawnImpl });
  spawnTestChild('node', ['d'], { spawnImpl });

  assert.deepEqual(calls.map((call) => call.options.posture), [
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
  assert.deepEqual(calls.map((call) => call.options.windowsHide), [true, true, true, true]);
});

test('startElevatedOrOperatorPrompt requires a reason and remains visible', () => {
  assert.throws(() => startElevatedOrOperatorPrompt('pwsh', []), /reason_required/);
  const output = startElevatedOrOperatorPrompt('pwsh', ['-NoExit'], {
    reason: 'operator credential entry',
    spawnSyncImpl: (_command, _args, options) => {
      assert.equal('reason' in options, false);
      return { status: 0, signal: null, output: [], pid: 2, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    },
  });
  assert.equal(output.posture, 'elevated_or_operator_prompt');
  assert.equal(output.windowsHide, false);
});

test('hidden posture normalizes Windows batch files through hidden cmd', () => {
  const normalized = normalizeHiddenCommand('C:/tmp/tool.cmd', ['{"ok":true}'], { platform: 'win32' });
  assert.match(normalized.command, /cmd\.exe$/i);
  assert.deepEqual(normalized.args, ['/d', '/s', '/c', 'C:/tmp/tool.cmd', '{"ok":true}']);
});

test('openBrowserUrl forces hidden detached ignored-stdio launch posture', async () => {
  let observed = null;
  const spawnImpl = (command, args, options) => {
    observed = { command, args, options };
    const child = new EventEmitter();
    child.pid = 1234;
    child.unref = () => {};
    queueMicrotask(() => child.emit('spawn'));
    return child;
  };

  const result = await openBrowserUrl('file:///tmp/index.html', { platform: 'win32', spawnImpl });
  assert.equal(result.posture, 'browser_open');
  assert.equal(result.windowsHide, true);
  assert.equal(observed.options.windowsHide, true);
  assert.equal(observed.options.detached, true);
  assert.equal(observed.options.stdio, 'ignore');
});

test('spawnHiddenPostureProcess refuses visible-only posture names', () => {
  assert.throws(() => spawnHiddenPostureProcess('node', ['--version'], { posture: 'operator_terminal' }), /hidden_process_posture_required/);
});

test('startOperatorTerminal makes visibility explicit', () => {
  let observed = null;
  const output = startOperatorTerminal('wt', ['new-tab'], {
    spawnSyncImpl: (command, args, options) => {
      observed = { command, args, options };
      return { status: 0, signal: null, output: [], pid: 1, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    },
  });

  assert.equal(output.posture, 'operator_terminal');
  assert.equal(output.windowsHide, false);
  assert.equal(observed.options.windowsHide, false);
  assert.equal(observed.options.stdio, 'inherit');
});

