import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { resolveAgentStartExecutionPosture, spawnCarrierProcessAndExit, waitForEnterBeforeCarrier } from '../src/carrier-process-launch.js';

test('NARS exec without wait selects hidden detached start posture', () => {
  const posture: any = resolveAgentStartExecutionPosture({
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
  const posture: any = resolveAgentStartExecutionPosture({
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
  const calls: any = [];
  const exits: any = [];
  const outputDir: any = mkdtempSync(join(tmpdir(), 'narada-agent-start-output-'));
  const child: any = new EventEmitter();
  child.pid = 4242;
  child.unrefCalled = false;
  child.unref = () => { child.unrefCalled = true; };
  const spawned: any = [];

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
        spawnImpl(command: any, args: any, options) : any{
          calls.push({ command, args, options });
          return child;
        },
      },
      onSpawn(pid: any, spawnedChild) : any{
        spawned.push({ pid, child: spawnedChild });
      },
      onExit(code) : any{
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
  const exits: any = [];

  spawnCarrierProcessAndExit({
    command: 'node',
    args: ['runtime.js'],
    cwd: 'D:/code/site',
    env: { NARADA_AGENT_ID: 'site.resident' },
    executionMode: 'hidden_detached',
    spawnOptions: {
      spawnImpl() : any{
        throw new Error('spawn should not be reached');
      },
    },
    onExit(code) : any{
      exits.push(code);
    },
    writeStderr() : any{},
  });

  assert.deepEqual(exits, [1]);
});

test('hidden detached carrier start reports asynchronous spawn errors before parent exit', () => {
  const exits: any = [];
  const errors: any = [];
  const outputDir: any = mkdtempSync(join(tmpdir(), 'narada-agent-start-output-'));
  const child: any = new EventEmitter();
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
        spawnImpl() : any{
          return child;
        },
      },
      onExit(code) : any{
        exits.push(code);
      },
      writeStderr(message) : any{
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
  const outputDir: any = mkdtempSync(join(tmpdir(), 'narada-agent-start-output-'));
  const stdoutPath: any = join(outputDir, 'stdout.log');
  const stderrPath: any = join(outputDir, 'stderr.log');
  const exits: any = [];

  try {
    await new Promise((resolve: any) => {
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
        onExit(code) : any{
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

async function waitForFileText(path: any, pattern: any) : Promise<any>{
  const deadline: any = Date.now() + 5000;
  let last: any = '';
  while (Date.now() < deadline) {
    try {
      last = readFileSync(path, 'utf8');
      if (pattern.test(last)) return;
    } catch {
      // File is created by the child process; keep polling until the deadline.
    }
    await new Promise((resolve: any) => setTimeout(resolve, 25));
  }
  assert.fail(`timed out waiting for ${pattern} in ${path}; last content: ${last}`);
}

test('wait prompt passes canonical agent identity ref to renderer', async () => {
  const stdin: any = new PassThrough();
  stdin.isTTY = true;
  const stdout: any = new PassThrough();
  const calls: any = [];
  const agentIdentityRef: any = {
    schema: 'narada.agent_identity_ref.v1',
    site_id: 'sonar',
    local_agent_id: 'resident',
    role: 'resident',
    canonical_agent_id: 'sonar.resident',
    display: 'sonar.resident',
    source_agent_id: 'resident',
    scope: 'site_scoped',
  };

  const waiting: any = waitForEnterBeforeCarrier({
    agentId: 'resident',
    agentIdentityRef,
    carrierName: 'agent-runtime-server',
    stdin,
    stdout,
    writeStdout: async () => {},
    loadAgentStartRenderer: async () => ({
      formatAgentStartWaitPrompt(agentId: any, runtimeName: any, options) : any{
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
