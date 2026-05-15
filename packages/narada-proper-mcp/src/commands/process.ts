import { execFileSync } from 'node:child_process';
import { ExitCode } from '../lib/exit-codes.js';

export interface CommandEnvelope {
  exitCode: ExitCode;
  result: unknown;
}

export function runNaradaJson(args: string[], cwd: string): CommandEnvelope {
  try {
    const output = execFileSync('narada', [...args, '--format', 'json'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: ExitCode.SUCCESS, result: parseJsonOutput(output) };
  } catch (error) {
    const failed = error as { status?: number; stdout?: string; stderr?: string; message?: string };
    return {
      exitCode: failed.status === 0 ? ExitCode.SUCCESS : ExitCode.ERROR,
      result: {
        status: 'error',
        command: ['narada', ...args],
        stdout: failed.stdout,
        stderr: failed.stderr,
        message: failed.message,
      },
    };
  }
}

function parseJsonOutput(output: string): unknown {
  const trimmed = output.trim();
  if (trimmed.length === 0) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return { status: 'success', output: trimmed };
  }
}
