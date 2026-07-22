import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileGoverned, runGovernedCommandSync, spawnHiddenPostureProcess, startOperatorTerminal } from '@narada2/process-launch-posture';
import type { AgentStartExecutionResult, CommandExecutionResult } from './launcher-contracts.js';

export const DEFAULT_AGENT_START_HANDOFF_TIMEOUT_MS = 30_000;

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

/**
 * Async analogue of runProcess for HTTP handlers and other event-loop-sensitive
 * callers: same governed posture, env, and 120s timeout, but the child runs
 * without blocking the loop. Rejections (non-zero exit, timeout) are mapped to
 * a failed CommandExecutionResult with stdout/stderr preserved when present.
 */
export async function runProcessAsync(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): Promise<CommandExecutionResult> {
  try {
    const result = await execFileGoverned(command, args, {
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
    return {
      status: 'success',
      exit_code: 0,
      stdout: String(result.stdout ?? '').trim(),
      stderr: String(result.stderr ?? '').trim(),
    };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { code?: number | string; stdout?: unknown; stderr?: unknown };
    const exitCode = typeof failure.code === 'number' ? failure.code : 1;
    return {
      status: 'failed',
      exit_code: exitCode,
      stdout: String(failure.stdout ?? '').trim(),
      stderr: String(failure.stderr ?? '').trim(),
      error: failure instanceof Error ? failure.message : String(error),
    };
  }
}

export function runProcessDetachedUntilJson(
  command: string,
  args: string[],
  cwd: string,
  resultPath: string,
  env: Record<string, string> = {},
  timeoutMs = DEFAULT_AGENT_START_HANDOFF_TIMEOUT_MS,
): AgentStartExecutionResult {
  const logDir = dirname(resultPath);
  mkdirSync(logDir, { recursive: true });
  const stdoutPath = join(logDir, 'detached-stdout.log');
  const stderrPath = join(logDir, 'detached-stderr.log');
  let stdoutFd: number | null = null;
  let stderrFd: number | null = null;
  let childPid: number | null = null;
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
    childPid = typeof child.pid === 'number' ? child.pid : null;
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
    if (childPid !== null && !isProcessAlive(childPid)) {
      const stdoutTail = readTextTail(stdoutPath, 2000);
      const stderrTail = readTextTail(stderrPath, 2000);
      return {
        status: 'failed',
        exit_code: 1,
        stdout: `detached_stdout=${stdoutPath}\n${stdoutTail}`.trim(),
        stderr: `agent-start process exited before producing its result: ${resultPath}\ndetached_stderr=${stderrPath}\n${stderrTail}`.trim(),
        error: 'agent_start_process_exited_before_result',
      };
    }
    sleepSync(100);
  }
  const stderrTail = readTextTail(stderrPath, 2000);
  return {
    status: 'failed',
    exit_code: 0,
    stdout: `detached_stdout=${stdoutPath}`,
    stderr: `agent-start handoff still pending after ${timeoutMs}ms: ${resultPath}\ndetached_stderr=${stderrPath}\n${stderrTail}`.trim(),
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

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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
