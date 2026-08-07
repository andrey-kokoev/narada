import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  browserOpenCommand,
  createOperatorProjectionOpenRequest,
  createScheduledCommandPlaceholderPlan,
  createScheduledCommandLaunchPlan,
  decodeScheduledCommandLaunchArguments,
  admitOperatorProjectionOpenRequest,
  execFileGovernedSync,
  executeOperatorProjectionOpenRequest,
  normalizeHiddenCommand,
  openBrowserUrl,
  processSupervisorEntrypoint,
  scheduledCommandEntrypoint,
  runGovernedCommand,
  runGovernedCommandSync,
  spawnHiddenPostureProcess,
  spawnMcpServer,
  spawnOperatorTerminal,
  spawnProviderSubprocess,
  spawnTestChild,
  startElevatedOrOperatorPrompt,
  startOperatorTerminal,
} from './index.js';

const nativeSupervisorPath = processSupervisorEntrypoint();
const nativeSupervisorAvailable = process.platform === 'win32'
  && nativeSupervisorPath !== null
  && existsSync(nativeSupervisorPath);

test('browserOpenCommand uses hidden helper-compatible Windows command', () => {
  assert.deepEqual(browserOpenCommand('http://127.0.0.1:3000', { platform: 'win32' }), {
    posture: 'browser_open',
    command: 'cmd.exe',
    args: ['/c', 'start', '', 'http://127.0.0.1:3000'],
  });
});

test('scheduled command launch contract round-trips the exact target without a shell', () => {
  const placeholder = createScheduledCommandPlaceholderPlan({ platform: 'win32', env: {} });
  assert.deepEqual(placeholder.launcher_argv, ['--scheduled-noop-v1']);
  assert.equal(placeholder.console_window_policy, 'native_create_no_window');
  const plan = createScheduledCommandLaunchPlan(
    '"C:\\Program Files\\nodejs\\node.exe"',
    '"C:\\workspace\\site\\worker.js" --ticket "ticket 1"',
    { platform: 'win32', env: {} },
  );
  assert.equal(plan.launcher_path, scheduledCommandEntrypoint({ platform: 'win32', env: {} }));
  assert.equal(plan.console_window_policy, 'native_create_no_window');
  assert.deepEqual(decodeScheduledCommandLaunchArguments(plan.launcher_arguments), {
    target_command: 'C:\\Program Files\\nodejs\\node.exe',
    target_arguments: '"C:\\workspace\\site\\worker.js" --ticket "ticket 1"',
  });
});

test('Windows native supervisor is a no-console GUI-subsystem executable', { skip: !nativeSupervisorAvailable }, () => {
  const image = readFileSync(nativeSupervisorPath!);
  const peOffset = image.readUInt32LE(0x3c);
  assert.equal(image.subarray(peOffset, peOffset + 4).toString('binary'), 'PE\0\0');
  const optionalHeaderOffset = peOffset + 24;
  assert.equal(image.readUInt16LE(optionalHeaderOffset + 0x44), 2, 'PE subsystem must be IMAGE_SUBSYSTEM_WINDOWS_GUI');
});

test('Windows scheduled mode executes the exact target and propagates its exit code', { skip: !nativeSupervisorAvailable }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'narada-scheduled-command-'));
  const scriptPath = join(dir, 'scheduled-child.cjs');
  const markerPath = join(dir, 'marker.txt');
  const token = `scheduled:${Date.now()}`;
  writeFileSync(
    scriptPath,
    "const fs = require('node:fs'); fs.writeFileSync(process.argv[2], process.argv[3], 'utf8'); process.exit(23);\n",
    'utf8',
  );
  const plan = createScheduledCommandLaunchPlan(
    process.execPath,
    [scriptPath, markerPath, token].map(quoteWindowsArgument).join(' '),
    { platform: 'win32' },
  );
  const child = spawn(plan.launcher_path, plan.launcher_argv, { stdio: 'ignore', windowsHide: true });
  const placeholder = createScheduledCommandPlaceholderPlan({ platform: 'win32' });
  const placeholderChild = spawn(placeholder.launcher_path, placeholder.launcher_argv, { stdio: 'ignore', windowsHide: true });
  try {
    const [placeholderCode] = await waitForExit(placeholderChild, 3_000);
    assert.equal(placeholderCode, 0);
    const [code] = await waitForExit(child, 3_000);
    assert.equal(code, 23);
    assert.equal(readFileSync(markerPath, 'utf8'), token);
  } finally {
    if (placeholderChild.exitCode === null) placeholderChild.kill();
    if (child.exitCode === null) child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('spawnOperatorTerminal keeps visible terminal posture explicit', () => {
  let observed: any = null;
  const child: any = new EventEmitter();
  const result = spawnOperatorTerminal('node', ['x'], {
    cwd: 'C:/tmp',
    spawnImpl: (command: any, args: any, options: any) => {
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
  let observed: any = null;
  const result = runGovernedCommandSync('pwsh', ['-NoProfile'], {
    encoding: 'utf8',
    spawnSyncImpl: (command: any, args: any, options: any) => {
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
  const calls: any[] = [];
  const spawnImpl = (command: any, args: any, options: any) => {
    calls.push({ command, args, options });
    const child: any = new EventEmitter();
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
  let observed: any = null;
  const spawnImpl = (command: any, args: any, options: any) => {
    observed = { command, args, options };
    const child: any = new EventEmitter();
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
    caller: { package: '@narada-core/cli', command: 'agent-web-ui attach' },
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
  const calls: any[] = [];
  const result = await executeOperatorProjectionOpenRequest({
    target_ref: 'file:///tmp/index.html',
    caller: { package: '@narada-core/process-launch-posture', command: 'test' },
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
  let observed: any = null;
  const child = spawnHiddenPostureProcess('node', ['server.mjs'], {
    posture: 'operator_projection_host',
    spawnImpl: (command: any, args: any, options: any) => {
      observed = { command, args, options };
      return { once() {}, unref() {} };
    },
  });

  assert.ok(child);
  assert.equal(observed.command, 'node');
  assert.deepEqual(observed.args, ['server.mjs']);
  assert.equal(observed.options.windowsHide, true);
});

test('spawnHiddenPostureProcess admits hidden agent runtime server posture', () => {
  let observed: any = null;
  const child = spawnHiddenPostureProcess('node', ['agent-runtime-server.mjs'], {
    posture: 'agent_runtime_server',
    spawnImpl: (command: any, args: any, options: any) => {
      observed = { command, args, options };
      return { once() {}, unref() {} };
    },
  });

  assert.ok(child);
  assert.equal(observed.command, 'node');
  assert.deepEqual(observed.args, ['agent-runtime-server.mjs']);
  assert.equal(observed.options.windowsHide, true);
});

test('spawnHiddenPostureProcess admits hidden runtime observer posture', () => {
  let observed: any = null;
  const child = spawnHiddenPostureProcess('observer.exe', ['serve'], {
    posture: 'runtime_observer',
    spawnImpl: (command: any, args: any, options: any) => {
      observed = { command, args, options };
      return { once() {}, unref() {} };
    },
  });
  assert.ok(child);
  assert.equal(observed.options.windowsHide, true);
});

test('startOperatorTerminal makes visibility explicit', () => {
  let observed: any = null;
  const output = startOperatorTerminal('wt', ['new-tab'], {
    spawnSyncImpl: (command: any, args: any, options: any) => {
      observed = { command, args, options };
      return { status: 0, signal: null, output: [], pid: 1, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    },
  });

  assert.equal(output.posture, 'operator_terminal');
  assert.equal(output.windowsHide, false);
  assert.equal(observed.options.windowsHide, false);
  assert.equal(observed.options.stdio, 'inherit');
});

test('Windows supervisor preserves stdio and writes identity evidence', { skip: !nativeSupervisorAvailable }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'narada-process-supervisor-'));
  const identityPath = join(dir, 'identity.json');
  const supervisor = spawn(nativeSupervisorPath!, [
    '--identity-path', identityPath,
    '--parent-pid', String(process.pid),
    '--',
    process.execPath,
    '--input-type=module',
    '-e',
    "process.stdin.setEncoding('utf8'); process.stdin.on('data', (chunk) => process.stdout.write('echo:' + chunk));",
  ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

  try {
    const live = await waitForJson(identityPath, (value) => value.state === 'live', 3_000);
    assert.equal(live.schema, 'narada.process_supervisor.identity.v1');
    assert.equal(live.supervisor_pid, supervisor.pid);
    assert.equal(live.parent_pid, process.pid);
    assert.equal(typeof live.managed_child_pid, 'number');

    supervisor.stdin.write('ping');
    const echoed = await readUntil(supervisor.stdout, 'echo:ping', 3_000, () => supervisor.kill());
    supervisor.stdin.end();
    assert.equal(echoed, 'echo:ping');
    const [code] = await waitForExit(supervisor, 3_000);
    assert.equal(code, 0);

    const closed = await waitForJson(identityPath, (value) => value.state === 'closed', 3_000);
    assert.equal(closed.managed_child_pid, live.managed_child_pid);
  } finally {
    if (supervisor.exitCode === null) supervisor.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Windows supervisor terminates the managed child when its parent exits', { skip: !nativeSupervisorAvailable }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'narada-process-supervisor-parent-loss-'));
  const identityPath = join(dir, 'identity.json');
  const parent = spawn(process.execPath, ['-e', 'setInterval(() => {}, 10_000)'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  const supervisor = spawn(nativeSupervisorPath!, [
    '--identity-path', identityPath,
    '--parent-pid', String(parent.pid),
    '--',
    process.execPath,
    '-e',
    'setInterval(() => {}, 10_000)',
  ], { stdio: 'ignore', windowsHide: true });

  try {
    const live = await waitForJson(identityPath, (value) => value.state === 'live', 3_000);
    assert.equal(typeof live.managed_child_pid, 'number');
    parent.kill();
    await waitForExit(parent, 3_000);
    await waitForExit(supervisor, 3_000);
    await waitFor(() => !isProcessAlive(live.managed_child_pid), 3_000);
  } finally {
    if (supervisor.exitCode === null) supervisor.kill();
    if (parent.exitCode === null) parent.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

async function waitFor<T>(predicate: () => T | Promise<T>, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out after ${timeoutMs}ms`);
}

function quoteWindowsArgument(value: string): string {
  if (value.length > 0 && !/[\s"]/u.test(value)) return value;
  let quoted = '"';
  let backslashes = 0;
  for (const character of value) {
    if (character === '\\') {
      backslashes += 1;
      continue;
    }
    if (character === '"') {
      quoted += '\\'.repeat(backslashes * 2 + 1) + '"';
    } else {
      quoted += '\\'.repeat(backslashes) + character;
    }
    backslashes = 0;
  }
  return quoted + '\\'.repeat(backslashes * 2) + '"';
}

async function waitForJson(path: string, predicate: (value: any) => boolean, timeoutMs: number): Promise<any> {
  return waitFor(() => {
    try {
      const value = JSON.parse(readFileSync(path, 'utf8'));
      return predicate(value) ? value : null;
    } catch {
      return null;
    }
  }, timeoutMs);
}

function waitForExit(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<[number | null, NodeJS.Signals | null]> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve([child.exitCode, child.signalCode]);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`child ${child.pid ?? 'unknown'} did not exit within ${timeoutMs}ms`));
    }, timeoutMs);
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      resolve([code, signal]);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off('exit', onExit);
      child.off('error', onError);
    };
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

function readUntil(
  stream: NodeJS.ReadableStream,
  expected: string,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<string> {
  stream.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const timer = setTimeout(() => {
      cleanup();
      onTimeout();
      reject(new Error(`stream did not contain ${expected}`));
    }, timeoutMs);
    const onData = (chunk: string) => {
      value += chunk;
      if (value.includes(expected)) {
        cleanup();
        resolve(value);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      stream.off('data', onData);
      stream.off('error', onError);
    };
    stream.on('data', onData);
    stream.once('error', onError);
  });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
