import { appendFile } from 'node:fs/promises';
import { spawnHiddenPostureProcess } from '@narada2/process-launch-posture';
import type { WorkspaceLaunchProcessLaunch } from './workspace-launch-types.js';

export async function workspaceLaunchStartHiddenRuntimeHost(commandArgs: string[], cwd: string): Promise<WorkspaceLaunchProcessLaunch> {
  const captureLog = process.env.NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG;
  if (captureLog) {
    const redactedArgs = redactWorkspaceLaunchArgv(commandArgs);
    await appendFile(captureLog, `${JSON.stringify({ command: redactedArgs, cwd })}\n`, 'utf8');
    return {
      posture: 'agent_runtime_server',
      command: 'capture',
      args: redactedArgs,
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      pid: null,
      capture_log: captureLog,
    };
  }
  const [command, ...args] = commandArgs;
  if (!command) throw new Error('narada_workspace_plan_empty_hidden_runtime_command');
  const child = spawnHiddenPostureProcess(command, args, {
    posture: 'agent_runtime_server',
    cwd,
    detached: true,
    stdio: 'ignore',
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('spawn', () => resolvePromise());
  });
  child.unref();
  return {
    posture: 'agent_runtime_server',
    command,
    args: redactWorkspaceLaunchArgv(args),
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    pid: typeof child.pid === 'number' ? child.pid : null,
  };
}

export async function workspaceLaunchStartHiddenProjectionHost(command: string, cwd: string): Promise<WorkspaceLaunchProcessLaunch> {
  const hostCommand = process.platform === 'win32' ? 'pwsh' : 'sh';
  const hostArgs = process.platform === 'win32'
    ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command]
    : ['-lc', command];
  const child = spawnHiddenPostureProcess(hostCommand, hostArgs, {
    posture: 'operator_projection_host',
    cwd,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('spawn', () => resolvePromise());
  });
  child.unref();
  return {
    posture: 'operator_projection_host',
    command: hostCommand,
    args: redactWorkspaceLaunchArgv(hostArgs),
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    pid: typeof child.pid === 'number' ? child.pid : null,
  };
}

export function redactWorkspaceLaunchArgv(args: string[]): string[] {
  return args.map((arg) => /api[_-]?key|token|secret|password/i.test(arg) ? '<redacted>' : arg);
}

export function redactWorkspaceLaunchCommand(command: string): string {
  return redactWorkspaceLaunchArgv([command])[0] ?? '<redacted>';
}
