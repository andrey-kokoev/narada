import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { AiProcessInvocationRefusalError, spawnAiProcessInvocation } from '@narada2/carrier-provider-support/ai-process-invocation';
import { spawnHiddenPostureProcess, spawnOperatorTerminal } from '@narada2/process-launch-posture';

export function resolveAgentStartExecutionPosture({ runtime, exec, wait, visibleRuntimeTerminal = false } = {}) {
  const detachRefusalReasons = [];
  if (runtime !== 'narada-agent-runtime-server') detachRefusalReasons.push('runtime_not_narada_agent_runtime_server');
  if (exec !== true) detachRefusalReasons.push('exec_not_requested');
  if (wait === true) detachRefusalReasons.push('wait_requested');
  if (visibleRuntimeTerminal === true) detachRefusalReasons.push('visible_runtime_terminal_requested');

  const hiddenDetached = detachRefusalReasons.length === 0;
  const agentStartExecutionMode = hiddenDetached
    ? 'hidden_detached'
    : exec === true
      ? 'visible_inherited'
      : 'sync';

  return {
    agent_start_execution_mode: agentStartExecutionMode,
    detach_refusal_reasons: detachRefusalReasons,
    detach_decision: {
      schema: 'narada.agent_start.detach_decision.v1',
      status: hiddenDetached ? 'selected' : 'not_selected',
      selected: hiddenDetached,
      rule: 'runtime=narada-agent-runtime-server exec=true wait!=true visible_runtime_terminal!=true',
      runtime: runtime ?? null,
      exec: exec === true,
      wait: wait === true,
      visible_runtime_terminal: visibleRuntimeTerminal === true,
      execution_mode: agentStartExecutionMode,
      hidden_posture: hiddenDetached ? 'agent_runtime_server' : null,
      refusal_reasons: detachRefusalReasons,
    },
  };
}

export async function waitForEnterBeforeCarrier({
  agentId,
  agentIdentityRef = null,
  carrierName,
  stdin = process.stdin,
  stdout = process.stdout,
  writeStdout,
  loadAgentStartRenderer,
}) {
  if (!stdin.isTTY) {
    await writeStdout(`agent_start_wait_skipped: stdin is not a terminal; starting ${carrierName}\n`);
    return;
  }
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const { formatAgentStartWaitPrompt } = await loadAgentStartRenderer();
    await rl.question(formatAgentStartWaitPrompt(agentId, carrierName, { agentIdentityRef }));
  } finally {
    rl.close();
  }
}

export function spawnCarrierProcessAndExit({ command, args, cwd, env, spawnOptions = {}, aiProcessInvocation = null, executionMode = 'visible_inherited', hiddenOutputFiles = null, writeStderr = console.error, onExit = process.exit }) {
  let child;
  let stdoutFd = null;
  let stderrFd = null;
  try {
    const resolvedSpawnOptions = {
      stdio: 'inherit',
      cwd,
      env,
      ...spawnOptions,
    };
    if (executionMode === 'hidden_detached') {
      if (!hiddenOutputFiles?.stdout_path || !hiddenOutputFiles?.stderr_path) throw new Error('hidden_runtime_output_files_required');
      mkdirSync(dirname(hiddenOutputFiles.stdout_path), { recursive: true });
      mkdirSync(dirname(hiddenOutputFiles.stderr_path), { recursive: true });
      stdoutFd = openSync(hiddenOutputFiles.stdout_path, 'a');
      stderrFd = openSync(hiddenOutputFiles.stderr_path, 'a');
      child = spawnHiddenPostureProcess(command, args, {
        ...resolvedSpawnOptions,
        posture: 'agent_runtime_server',
        detached: true,
        stdio: ['ignore', stdoutFd, stderrFd],
      });
      closeSync(stdoutFd);
      closeSync(stderrFd);
      stdoutFd = null;
      stderrFd = null;
      let finished = false;
      child.once('error', (err) => {
        if (finished) return;
        finished = true;
        writeStderr(`[FAIL] Failed to spawn runtime process: ${err.message}`);
        onExit(1);
      });
      child.once('spawn', () => {
        if (finished) return;
        finished = true;
        child.unref();
        onExit(0);
      });
      return;
    }
    if (aiProcessInvocation) {
      const owner = spawnAiProcessInvocation({
        ...aiProcessInvocation,
        cwd,
        command,
        argv: args,
        env,
      }, {
        spawnProcess: (spawnCommand, spawnArgs, options) => ({ child: spawnOperatorTerminal(spawnCommand, spawnArgs, options) }),
        spawnOptions: resolvedSpawnOptions,
      });
      child = owner.child;
    } else {
      child = spawnOperatorTerminal(command, args, resolvedSpawnOptions);
    }
  } catch (error) {
    if (error instanceof AiProcessInvocationRefusalError) {
      writeStderr(`[FAIL] ai_process_invocation_refused: ${error.admission.reason}`);
      if (error.admission.artifact_path) writeStderr(`artifact: ${error.admission.artifact_path}`);
    } else {
      writeStderr(`[FAIL] Failed to spawn runtime process: ${error instanceof Error ? error.message : String(error)}`);
    }
    onExit(1);
    if (stdoutFd !== null) closeSync(stdoutFd);
    if (stderrFd !== null) closeSync(stderrFd);
    return;
  }

  child.on('error', (err) => {
    writeStderr(`[FAIL] Failed to spawn runtime process: ${err.message}`);
    onExit(1);
  });

  child.on('close', (code) => {
    onExit(code ?? 0);
  });
}
