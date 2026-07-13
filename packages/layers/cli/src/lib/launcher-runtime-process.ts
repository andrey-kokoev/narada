import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runGovernedCommandSync, spawnHiddenPostureProcess, startOperatorTerminal } from '@narada2/process-launch-posture';
import type { CommandExecutionResult } from './launcher-contracts.js';

export function isAccessDeniedMessage(message: string): boolean {
  return /\b(access denied|unauthorized|permission denied|requires elevation)\b/i.test(message);
}

export function windowsElevationState(): { elevated: boolean; execution: CommandExecutionResult } {
  const execution = runPowerShell([
    '$identity = [Security.Principal.WindowsIdentity]::GetCurrent()',
    '$principal = [Security.Principal.WindowsPrincipal]::new($identity)',
    '$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
    'if ($isAdmin) { "true" } else { "false" }',
  ]);
  return {
    elevated: execution.status === 'success' && execution.stdout.trim() === 'true',
    execution,
  };
}

export function runPowerShell(commands: string[], env: Record<string, string> = {}): CommandExecutionResult {
  return runProcess('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    commands.join('; '),
  ], process.cwd(), env);
}

export function runProcess(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): CommandExecutionResult {
  const result = runGovernedCommandSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
    env: {
      ...process.env,
      NODE_OPTIONS: appendNodeOption(process.env.NODE_OPTIONS, '--disable-warning=ExperimentalWarning'),
      OUTPUT_FORMAT: 'json',
      ...env,
    },
  });
  const exitCode = result.status ?? (result.error ? 1 : 0);
  return {
    status: exitCode === 0 ? 'success' : 'failed',
    exit_code: exitCode,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim(),
    error: result.error ? result.error.message : undefined,
  };
}

export function runProcessDetachedUntilJson(
  command: string,
  args: string[],
  cwd: string,
  resultPath: string,
  env: Record<string, string> = {},
  timeoutMs = 30_000,
): CommandExecutionResult {
  const logDir = dirname(resultPath);
  mkdirSync(logDir, { recursive: true });
  const stdoutPath = join(logDir, 'detached-stdout.log');
  const stderrPath = join(logDir, 'detached-stderr.log');
  let stdoutFd: number | null = null;
  let stderrFd: number | null = null;
  try {
    stdoutFd = openSync(stdoutPath, 'a');
    stderrFd = openSync(stderrPath, 'a');
    const child = spawnHiddenPostureProcess(command, args, {
      posture: 'provider_subprocess',
      cwd,
      detached: true,
      stdio: ['ignore', stdoutFd, stderrFd],
      env: {
        ...process.env,
        NODE_OPTIONS: appendNodeOption(process.env.NODE_OPTIONS, '--disable-warning=ExperimentalWarning'),
        OUTPUT_FORMAT: 'json',
        ...env,
      },
    });
    child.unref();
  } catch (error) {
    if (stdoutFd !== null) closeSync(stdoutFd);
    if (stderrFd !== null) closeSync(stderrFd);
    return {
      status: 'failed',
      exit_code: 1,
      stdout: '',
      stderr: '',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (stdoutFd !== null) closeSync(stdoutFd);
    if (stderrFd !== null) closeSync(stderrFd);
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const parsed = tryParseJsonFile(resultPath);
    if (parsed && typeof parsed === 'object') {
      return {
        status: 'success',
        exit_code: 0,
        stdout: `detached_stdout=${stdoutPath}`,
        stderr: `detached_stderr=${stderrPath}`,
      };
    }
    sleepSync(100);
  }
  const stderrTail = readTextTail(stderrPath, 2000);
  return {
    status: 'failed',
    exit_code: 1,
    stdout: `detached_stdout=${stdoutPath}`,
    stderr: `timed out waiting for agent-start JSON handoff: ${resultPath}\ndetached_stderr=${stderrPath}\n${stderrTail}`.trim(),
    error: 'agent_start_handoff_timeout',
  };
}

export function runProcessInherited(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): CommandExecutionResult {
  const launch = startOperatorTerminal(command, args, {
    cwd,
    stdio: 'inherit',
    timeout: 0,
    env: {
      ...process.env,
      NODE_OPTIONS: appendNodeOption(process.env.NODE_OPTIONS, '--disable-warning=ExperimentalWarning'),
      OUTPUT_FORMAT: 'json',
      ...env,
    },
  });
  const result = launch.result;
  const exitCode = result.status ?? (result.error ? 1 : 0);
  return {
    status: exitCode === 0 ? 'success' : 'failed',
    exit_code: exitCode,
    stdout: '',
    stderr: '',
    error: result.error ? result.error.message : undefined,
  };
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readTextTail(path: string, maxChars: number): string {
  try {
    if (!existsSync(path)) return '';
    const text = readFileSync(path, 'utf8');
    return text.length > maxChars ? text.slice(text.length - maxChars) : text;
  } catch {
    return '';
  }
}

function tryParseJsonFile(path: string): unknown {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function appendNodeOption(existing: string | undefined, option: string): string {
  const current = String(existing ?? '').trim();
  return current.includes(option) ? current : [current, option].filter(Boolean).join(' ');
}

export function truncateText(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}... [truncated ${value.length - max} chars]`;
}
