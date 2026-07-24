import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { resolveAgentStartExecutionPosture, spawnCarrierProcessAndExit, waitForEnterBeforeCarrier } from '../src/carrier-process-launch.ts';

test('NARS exec without wait selects hidden detached start posture', () => {
  const posture = resolveAgentStartExecutionPosture({
    runtime: 'narada-agent-runtime-server',
    exec: true,
    wait: false,
  });

  assert.equal(posture.agent_start_execution_mode, 'hidden_detached');
  assert.deepEqual(posture.detach_refusal_reasons, []);
  assert.equal(posture.detach_decision.selected, true);
  assert.equal(posture.detach_decision.hidden_posture, 'agent_runtime_server');
});

test('wait and explicit visible terminal refuse hidden detached start posture', () => {
  const posture = resolveAgentStartExecutionPosture({
    runtime: 'narada-agent-runtime-server',
    exec: true,
    wait: true,
    visibleRuntimeTerminal: true,
  });

  assert.equal(posture.agent_start_execution_mode, 'visible_inherited');
  assert.deepEqual(posture.detach_refusal_reasons, [
    'wait_requested',
    'visible_runtime_terminal_requested',
  ]);
  assert.equal(posture.detach_decision.selected, false);
});

test('hidden detached carrier start uses hidden process posture and exits parent after spawn', () => {
  const calls = [];
  const exits = [];
  const outputDir = mkdtempSync(join(tmpdir(), 'narada-agent-start-output-'));
  const child = new EventEmitter();
  child.pid = 4242;
  child.unrefCalled = false;
  child.unref = () => { child.unrefCalled = true; };
  const spawned = [];

  try {
    spawnCarrierProcessAndExit({
      command: 'node',
      args: ['runtime.js'],
      cwd: 'D:/code/site',
      env: { NARADA_AGENT_ID: 'site.resident' },
      executionMode: 'hidden_detached',
      hiddenOutputFiles: {
        stdout_path: join(outputDir, 'stdout.log'),
        stderr_path: join(outputDir, 'stderr.log'),
      },
      spawnOptions: {
        spawnImpl(command, args, options) {
          calls.push({ command, args, options });
          return child;
        },
      },
      onSpawn(pid, spawnedChild) {
        spawned.push({ pid, child: spawnedChild });
      },
      onExit(code) {
        exits.push(code);
      },
    });

    child.emit('spawn');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, 'node');
    assert.deepEqual(calls[0].args, ['runtime.js']);
    assert.equal(calls[0].options.cwd, 'D:/code/site');
    assert.equal(calls[0].options.detached, true);
    assert.equal(calls[0].options.stdio[0], 'ignore');
    assert.equal(typeof calls[0].options.stdio[1], 'number');
    assert.equal(typeof calls[0].options.stdio[2], 'number');
    assert.equal(calls[0].options.windowsHide, true);
    assert.equal(child.unrefCalled, true);
    assert.deepEqual(spawned, [{ pid: 4242, child }]);
    assert.deepEqual(exits, [0]);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test('hidden detached carrier start requires output file locations', () => {
  const exits = [];

  spawnCarrierProcessAndExit({
    command: 'node',
    args: ['runtime.js'],
    cwd: 'D:/code/site',
    env: { NARADA_AGENT_ID: 'site.resident' },
    executionMode: 'hidden_detached',
    spawnOptions: {
      spawnImpl() {
        throw new Error('spawn should not be reached');
      },
    },
    onExit(code) {
      exits.push(code);
    },
    writeStderr() {},
  });

  assert.deepEqual(exits, [1]);
});

test('hidden detached carrier start reports asynchronous spawn errors before parent exit', () => {
  const exits = [];
  const errors = [];
  const outputDir = mkdtempSync(join(tmpdir(), 'narada-agent-start-output-'));
  const child = new EventEmitter();
  child.unref = () => { throw new Error('unref should not be reached'); };

  try {
    spawnCarrierProcessAndExit({
      command: 'missing-runtime',
      args: [],
      cwd: 'D:/code/site',
      env: { NARADA_AGENT_ID: 'site.resident' },
      executionMode: 'hidden_detached',
      hiddenOutputFiles: {
        stdout_path: join(outputDir, 'stdout.log'),
        stderr_path: join(outputDir, 'stderr.log'),
      },
      spawnOptions: {
        spawnImpl() {
          return child;
        },
      },
      onExit(code) {
        exits.push(code);
      },
      writeStderr(message) {
        errors.push(message);
      },
    });

    assert.deepEqual(exits, []);
    child.emit('error', new Error('ENOENT'));
    assert.deepEqual(exits, [1]);
    assert.match(errors[0], /ENOENT/);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test('hidden detached carrier start writes real child output to owned files', async () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'narada-agent-start-output-'));
  const stdoutPath = join(outputDir, 'stdout.log');
  const stderrPath = join(outputDir, 'stderr.log');
  const exits = [];

  try {
    await new Promise((resolve) => {
      spawnCarrierProcessAndExit({
        command: process.execPath,
        args: ['-e', "console.log('hidden stdout ok'); console.error('hidden stderr ok');"],
        cwd: outputDir,
        env: process.env,
        executionMode: 'hidden_detached',
        hiddenOutputFiles: {
          stdout_path: stdoutPath,
          stderr_path: stderrPath,
        },
        onExit(code) {
          exits.push(code);
          resolve();
        },
      });
    });

    assert.deepEqual(exits, [0]);
    await waitForFileText(stdoutPath, /hidden stdout ok/);
    await waitForFileText(stderrPath, /hidden stderr ok/);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

async function waitForFileText(path, pattern) {
  const deadline = Date.now() + 5000;
  let last = '';
  while (Date.now() < deadline) {
    try {
      last = readFileSync(path, 'utf8');
      if (pattern.test(last)) return;
    } catch {
      // File is created by the child process; keep polling until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`timed out waiting for ${pattern} in ${path}; last content: ${last}`);
}

test('wait prompt passes canonical agent identity ref to renderer', async () => {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  const stdout = new PassThrough();
  const calls = [];
  const agentIdentityRef = {
    schema: 'narada.agent_identity_ref.v1',
    site_id: 'sonar',
    local_agent_id: 'resident',
    role: 'resident',
    canonical_agent_id: 'sonar.resident',
    display: 'sonar.resident',
    source_agent_id: 'resident',
    scope: 'site_scoped',
  };

  const waiting = waitForEnterBeforeCarrier({
    agentId: 'resident',
    agentIdentityRef,
    carrierName: 'agent-runtime-server',
    stdin,
    stdout,
    writeStdout: async () => {},
    loadAgentStartRenderer: async () => ({
      formatAgentStartWaitPrompt(agentId, runtimeName, options) {
        calls.push({ agentId, runtimeName, options });
        return 'prompt> ';
      },
    }),
  });

  setImmediate(() => stdin.write('\n'));
  await waiting;

  assert.equal(calls.length, 1);
  assert.equal(calls[0].agentId, 'resident');
  assert.equal(calls[0].runtimeName, 'agent-runtime-server');
  assert.deepEqual(calls[0].options, { agentIdentityRef });
});
