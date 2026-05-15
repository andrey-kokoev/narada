import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ExitCode } from '../lib/exit-codes.js';

export interface CommandEnvelope {
  exitCode: ExitCode;
  result: unknown;
}

export function runNaradaJson(args: string[], cwd: string): CommandEnvelope {
  const env = localNaradaCliEnvironment(cwd);
  const invocation = localNaradaCliInvocation(cwd);
  const commandArgs = [...invocation.args, ...args, '--format', 'json'];
  try {
    const output = execFileSync(invocation.command, commandArgs, {
      cwd,
      env,
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
        command: [invocation.command, ...commandArgs],
        stdout: failed.stdout,
        stderr: failed.stderr,
        message: failed.message,
      },
    };
  }
}

export function localNaradaCliInvocation(cwd: string): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return {
      command: process.execPath,
      args: [join(cwd, 'packages', 'layers', 'cli', 'dist', 'main.js')],
    };
  }

  return {
    command: join(cwd, 'node_modules', '.bin', 'narada'),
    args: [],
  };
}

export function localNaradaCliEnvironment(cwd: string, baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const pathKey = Object.keys(baseEnv).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  const separator = process.platform === 'win32' ? ';' : ':';
  const workspaceBin = join(cwd, 'node_modules', '.bin');
  const existingPath = baseEnv[pathKey] ?? '';
  return {
    ...baseEnv,
    [pathKey]: existingPath.length > 0 ? `${workspaceBin}${separator}${existingPath}` : workspaceBin,
  };
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
