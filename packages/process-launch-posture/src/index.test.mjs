import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import {
  browserOpenCommand,
  createOperatorProjectionOpenRequest,
  admitOperatorProjectionOpenRequest,
  execFileGovernedSync,
  executeOperatorProjectionOpenRequest,
  normalizeHiddenCommand,
  openBrowserUrl,
  runGovernedCommand,
  runGovernedCommandSync,
  spawnHiddenPostureProcess,
  spawnMcpServer,
  spawnOperatorTerminal,
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

test('spawnOperatorTerminal keeps visible terminal posture explicit', () => {
  let observed = null;
  const child = new EventEmitter();
  const result = spawnOperatorTerminal('node', ['x'], {
    cwd: 'C:/tmp',
    spawnImpl: (command, args, options) => {
      observed = { command, args, options };
      return child;
    },
  });

  assert.equal(result, child);
  assert.equal(observed.command, 'node');
  assert.deepEqual(observed.args, ['x']);
  assert.equal(observed.options.cwd, 'C:/tmp');
  assert.equal(observed.options.stdio, 'inherit');
  assert.equal(observed.options.windowsHide, false);
});

test('runGovernedCommandSync forces hidden synchronous execution posture', () => {
  let observed = null;
  const result = runGovernedCommandSync('pwsh', ['-NoProfile'], {
    encoding: 'utf8',
    spawnSyncImpl: (command, args, options) => {
      observed = { command, args, options };
      return { status: 0, signal: null, output: [], pid: 3, stdout: '', stderr: '' };
    },
  });

  assert.equal(result.status, 0);
  assert.equal(observed.command, 'pwsh');
  assert.deepEqual(observed.args, ['-NoProfile']);
  assert.equal(observed.options.windowsHide, true);
});

test('execFileGovernedSync returns captured stdout through governed posture', () => {
  const output = execFileGovernedSync(process.execPath, ['-e', 'process.stdout.write("ok")'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert.equal(output, 'ok');
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

test('OperatorProjectionOpenRequest records browser projection intent as data', () => {
  const request = createOperatorProjectionOpenRequest({
    projection_kind: 'browser_url',
    target_ref: 'http://127.0.0.1:9999/',
    purpose: 'agent_web_ui_attach',
    caller: { package: '@narada2/cli', command: 'agent-web-ui attach' },
    mode: 'plan',
  }, { now: new Date('2026-07-02T00:00:00.000Z') });

  assert.equal(request.schema, 'narada.operator_projection_open_request.v1');
  assert.equal(request.target_ref, 'http://127.0.0.1:9999/');
  assert.equal(request.policy.allow_visible_host_effect, true);
  assert.equal(request.created_at, '2026-07-02T00:00:00.000Z');
});

test('OperatorProjectionOpenRequest plans and suppresses without visible host effects', async () => {
  const plan = await executeOperatorProjectionOpenRequest({
    target_ref: 'http://127.0.0.1:9999/',
    mode: 'plan',
  });
  assert.equal(plan.status, 'planned');
  assert.equal(plan.mutation_performed, false);

  const unresolvedPlan = await executeOperatorProjectionOpenRequest({
    target_ref: null,
    mode: 'plan',
  });
  assert.equal(unresolvedPlan.status, 'planned');
  assert.equal(unresolvedPlan.target_ref, null);

  const suppressed = await executeOperatorProjectionOpenRequest({
    target_ref: 'http://127.0.0.1:9999/',
    policy: { suppress_reason: 'operator_policy:test' },
  });
  assert.equal(suppressed.status, 'suppressed');
  assert.equal(suppressed.admission_reason, 'operator_policy:test');
  assert.equal(suppressed.mutation_performed, false);
});

test('OperatorProjectionOpenRequest refuses missing target and unsupported projection kind', () => {
  assert.equal(admitOperatorProjectionOpenRequest({ target_ref: '' }).status, 'refused');
  const unsupported = admitOperatorProjectionOpenRequest({
    projection_kind: 'terminal_tab',
    target_ref: 'wt://new-tab',
  });
  assert.equal(unsupported.status, 'refused');
  assert.match(unsupported.admission_reason, /unsupported_projection_kind/);
});

test('OperatorProjectionOpenRequest executes through injected browser opener', async () => {
  const calls = [];
  const result = await executeOperatorProjectionOpenRequest({
    target_ref: 'file:///tmp/index.html',
    caller: { package: '@narada2/process-launch-posture', command: 'test' },
  }, {
    env: {},
    openUrl: async (target) => { calls.push(target); },
  });

  assert.equal(result.status, 'opened');
  assert.equal(result.mutation_performed, true);
  assert.deepEqual(calls, ['file:///tmp/index.html']);
});

test('OperatorProjectionOpenRequest reports executor failures as failed outcomes', async () => {
  const result = await executeOperatorProjectionOpenRequest({
    target_ref: 'file:///tmp/index.html',
  }, {
    env: {},
    openBrowserUrl: async () => { throw new Error('boom'); },
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.mutation_performed, false);
  assert.equal(result.error, 'boom');
});

test('spawnHiddenPostureProcess refuses visible-only posture names', () => {
  assert.throws(() => spawnHiddenPostureProcess('node', ['--version'], { posture: 'operator_terminal' }), /hidden_process_posture_required/);
});

test('spawnHiddenPostureProcess admits hidden operator projection host posture', () => {
  let observed = null;
  const child = spawnHiddenPostureProcess('node', ['server.mjs'], {
    posture: 'operator_projection_host',
    spawnImpl: (command, args, options) => {
      observed = { command, args, options };
      return { once() {}, unref() {} };
    },
  });

  assert.ok(child);
  assert.equal(observed.command, 'node');
  assert.deepEqual(observed.args, ['server.mjs']);
  assert.equal(observed.options.windowsHide, true);
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

