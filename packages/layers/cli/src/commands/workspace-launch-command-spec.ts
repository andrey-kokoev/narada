import { join } from 'node:path';

export interface WorkspaceLaunchCommandSpec {
  executable: string;
  args: string[];
  cwd?: string | null;
}

export interface WorkspaceLaunchRuntimeCommandOptions {
  operatorSurface: string;
  siteRoot: string;
  agent: string;
  targetSiteId: string;
  runtime: string;
  workspaceRoot?: string | null;
  authority: string;
  mcpScope: string;
  enableNativeShell: boolean;
  launchBindingPath?: string | null;
  launchSessionId?: string | null;
  waitForEnter?: boolean;
}

export type WorkspaceLaunchRuntimeCommandMode = 'execute' | 'dry-run';

export function workspaceLaunchRuntimeCommandSpec(
  options: WorkspaceLaunchRuntimeCommandOptions,
  mode: WorkspaceLaunchRuntimeCommandMode,
): WorkspaceLaunchCommandSpec {
  const args = [
    'operator-surface', 'runtime', 'start', options.operatorSurface,
    '--site-root', options.siteRoot,
    '--agent', options.agent,
    '--target-site-id', options.targetSiteId,
    '--runtime', options.runtime,
    ...(mode === 'execute' ? ['--exec', '--format', 'human'] : ['--dry-run', '--format', 'json']),
  ];
  if (options.workspaceRoot) args.push('--workspace-root', options.workspaceRoot);
  if (options.enableNativeShell) args.push('--enable-native-shell');
  args.push('--authority', options.authority);
  args.push('--mcp-scope', options.mcpScope);
  if (options.launchBindingPath) args.push('--launch-binding', options.launchBindingPath);
  if (!options.launchBindingPath) args.push('--launch-session-id', options.launchSessionId ?? '');
  if (options.waitForEnter) args.push('--wait');
  return { executable: 'narada', args };
}

export function workspaceLaunchPnpmNaradaCommandSpec(
  naradaProper: string,
  runtimeCommand: WorkspaceLaunchCommandSpec,
): WorkspaceLaunchCommandSpec {
  return {
    executable: 'pnpm',
    args: ['--dir', naradaProper, 'exec', runtimeCommand.executable, ...runtimeCommand.args],
    cwd: runtimeCommand.cwd,
  };
}

export function workspaceLaunchNodeNaradaCommandSpec(
  naradaProper: string,
  runtimeCommand: WorkspaceLaunchCommandSpec,
): WorkspaceLaunchCommandSpec {
  return {
    executable: process.execPath,
    args: [join(naradaProper, 'packages', 'layers', 'cli', 'dist', 'main.js'), ...runtimeCommand.args],
    cwd: runtimeCommand.cwd,
  };
}

export function workspaceLaunchSmokeCommandSpec(runtimeCommand: WorkspaceLaunchCommandSpec): WorkspaceLaunchCommandSpec {
  return {
    executable: runtimeCommand.executable,
    args: [...runtimeCommand.args],
    cwd: runtimeCommand.cwd,
  };
}

export function workspaceLaunchCommandArgv(command: WorkspaceLaunchCommandSpec): string[] {
  return [command.executable, ...command.args];
}
