import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

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

export function spawnCarrierProcessAndExit({ command, args, cwd, env, spawnOptions = {}, onExit = process.exit }) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    cwd,
    env,
    ...spawnOptions,
  });

  child.on('error', (err) => {
    console.error(`[FAIL] Failed to spawn carrier process: ${err.message}`);
    onExit(1);
  });

  child.on('exit', (code) => {
    onExit(code ?? 0);
  });
}
