import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { AiProcessInvocationRefusalError, spawnAiProcessInvocation } from '@narada2/carrier-provider-support/ai-process-invocation';

export async function waitForEnterBeforeCarrier({
  agentId,
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
    await rl.question(formatAgentStartWaitPrompt(agentId, carrierName));
  } finally {
    rl.close();
  }
}

export function spawnCarrierProcessAndExit({ command, args, cwd, env, spawnOptions = {}, aiProcessInvocation = null, onExit = process.exit }) {
  let child;
  try {
    const resolvedSpawnOptions = {
      stdio: 'inherit',
      cwd,
      env,
      ...spawnOptions,
    };
    if (aiProcessInvocation) {
      const owner = spawnAiProcessInvocation({
        ...aiProcessInvocation,
        cwd,
        command,
        argv: args,
        env,
      }, {
        spawnProcess: (spawnCommand, spawnArgs, options) => ({ child: spawn(spawnCommand, spawnArgs, options) }),
        spawnOptions: resolvedSpawnOptions,
      });
      child = owner.child;
    } else {
      child = spawn(command, args, resolvedSpawnOptions);
    }
  } catch (error) {
    if (error instanceof AiProcessInvocationRefusalError) {
      console.error(`[FAIL] ai_process_invocation_refused: ${error.admission.reason}`);
      if (error.admission.artifact_path) console.error(`artifact: ${error.admission.artifact_path}`);
    } else {
      console.error(`[FAIL] Failed to spawn runtime process: ${error instanceof Error ? error.message : String(error)}`);
    }
    onExit(1);
    return;
  }

  child.on('error', (err) => {
    console.error(`[FAIL] Failed to spawn runtime process: ${err.message}`);
    onExit(1);
  });

  child.on('close', (code) => {
    onExit(code ?? 0);
  });
}
