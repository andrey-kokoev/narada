import { join } from 'node:path';

export interface WorkspaceLaunchRuntimeCommandOptions {
  operatorSurface: string;
  siteRoot: string;
  agent: string;
  targetSiteId: string;
  runtime: string;
  workspaceRoot?: string | null;
  authority: string;
  intelligenceProvider?: string | null;
  mcpScope: string;
  enableNativeShell: boolean;
  launchBindingPath?: string | null;
  launchSessionId?: string | null;
  waitForEnter?: boolean;
}

export type WorkspaceLaunchRuntimeCommandMode = 'execute' | 'dry-run';

export function workspaceLaunchRuntimeArguments(
  options: WorkspaceLaunchRuntimeCommandOptions,
  mode: WorkspaceLaunchRuntimeCommandMode,
): string[] {
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
  if (options.intelligenceProvider) args.push('--intelligence-provider', options.intelligenceProvider);
  args.push('--mcp-scope', options.mcpScope);
  if (options.launchBindingPath) args.push('--launch-binding', options.launchBindingPath);
  if (!options.launchBindingPath) args.push('--launch-session-id', options.launchSessionId ?? '');
  if (options.waitForEnter) args.push('--wait');
  return args;
}

export function workspaceLaunchPnpmNaradaCommand(naradaProper: string, runtimeArguments: string[]): string[] {
  return ['pnpm', '--dir', naradaProper, 'exec', 'narada', ...runtimeArguments];
}

export function workspaceLaunchNodeNaradaCommand(naradaProper: string, runtimeArguments: string[]): string[] {
  return [process.execPath, join(naradaProper, 'packages', 'layers', 'cli', 'dist', 'main.js'), ...runtimeArguments];
}

export function workspaceLaunchSmokeCommand(runtimeArguments: string[]): string[] {
  return ['narada', ...runtimeArguments];
}
