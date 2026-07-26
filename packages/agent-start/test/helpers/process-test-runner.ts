import { spawnTestChild } from '@narada2/process-launch-posture';

export function runProcessTest({ label, command = process.execPath, args, cwd, env = process.env, timeoutMs = 8500 }: any) : any{
  return new Promise((resolve: any) => {
    const child: any = spawnTestChild(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const startedAt: any = performance.now();
    const stdoutChunks: any = [];
    const stderrChunks: any = [];
    let timedOut: any = false;
    const timer: any = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on('data', (chunk: any) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: any) => stderrChunks.push(chunk));
    child.on('close', (exitCode: any, signal: any) => {
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
    child.on('error', (error: any) => {
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

export async function runProcessTests(commands: any) : Promise<any>{
  const results: any = await Promise.all(commands.map(runProcessTest));
  const failures: any = results.filter((result: any) => result.timedOut || result.exitCode !== 0);
  for (const result of results) {
    const state: any = result.timedOut ? 'timeout' : result.exitCode === 0 ? 'ok' : `exit ${result.exitCode}`;
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
