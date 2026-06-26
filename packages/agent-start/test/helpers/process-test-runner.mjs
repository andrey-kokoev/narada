import { spawn } from 'node:child_process';

export function runProcessTest({ label, command = process.execPath, args, cwd, env = process.env, timeoutMs = 8500 }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const startedAt = performance.now();
    const stdoutChunks = [];
    const stderrChunks = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        label,
        exitCode,
        signal,
        timedOut,
        durationMs: Math.round(performance.now() - startedAt),
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        label,
        exitCode: 1,
        signal: null,
        timedOut,
        durationMs: Math.round(performance.now() - startedAt),
        stdout: '',
        stderr: error.stack ?? String(error),
      });
    });
  });
}

export async function runProcessTests(commands) {
  const results = await Promise.all(commands.map(runProcessTest));
  const failures = results.filter((result) => result.timedOut || result.exitCode !== 0);
  for (const result of results) {
    const state = result.timedOut ? 'timeout' : result.exitCode === 0 ? 'ok' : `exit ${result.exitCode}`;
    console.log(`${result.label}: ${state} (${result.durationMs}ms)`);
  }
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`\n[${failure.label}] failed`);
      if (failure.stdout.trim()) console.error(failure.stdout.trim());
      if (failure.stderr.trim()) console.error(failure.stderr.trim());
    }
    process.exit(1);
  }
}
