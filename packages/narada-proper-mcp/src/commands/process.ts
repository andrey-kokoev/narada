import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, extname, join } from 'node:path';
import { ExitCode } from '../lib/exit-codes.js';

export interface CommandEnvelope {
  exitCode: ExitCode;
  result: unknown;
}

export function runNaradaJson(args: string[], cwd: string): CommandEnvelope {
  const env = localNaradaCliEnvironment(cwd);
  const invocation = localNaradaCliInvocation(cwd, env);
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

export function localNaradaCliInvocation(
  cwd: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } {
  const commandPath = resolveCommandFromPath('narada', localNaradaCliEnvironment(cwd, baseEnv, platform), platform);
  if (platform === 'win32' && commandPath) {
    const extension = extname(commandPath).toLowerCase();
    if (extension === '.ps1') {
      return {
        command: resolveCommandFromPath('pwsh', baseEnv, platform)
          ?? resolveCommandFromPath('powershell', baseEnv, platform)
          ?? 'powershell.exe',
        args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', commandPath],
      };
    }
    if (extension === '.cmd' || extension === '.bat') {
      return {
        command: baseEnv.ComSpec ?? baseEnv.comspec ?? 'cmd.exe',
        args: ['/d', '/s', '/c', commandPath],
      };
    }
  }

  return {
    command: commandPath ?? 'narada',
    args: [],
  };
}

export function localNaradaCliEnvironment(
  cwd: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const pathKey = Object.keys(baseEnv).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  const separator = platform === 'win32' ? ';' : delimiter;
  const workspaceBin = join(cwd, 'node_modules', '.bin');
  const existingPath = baseEnv[pathKey] ?? '';
  return {
    ...baseEnv,
    [pathKey]: existingPath.length > 0 ? `${workspaceBin}${separator}${existingPath}` : workspaceBin,
  };
}

function resolveCommandFromPath(
  command: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const pathKey = Object.keys(baseEnv).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  const pathValue = baseEnv[pathKey] ?? '';
  const separator = platform === 'win32' ? ';' : delimiter;
  const names = platform === 'win32'
    ? [`${command}.cmd`, `${command}.exe`, `${command}.bat`, `${command}.ps1`, command]
    : [command];

  for (const directory of pathValue.split(separator).filter((part) => part.length > 0)) {
    for (const name of names) {
      const candidate = join(directory, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
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
