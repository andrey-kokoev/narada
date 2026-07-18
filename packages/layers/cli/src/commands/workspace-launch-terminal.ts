import { appendFile } from 'node:fs/promises';
import { startOperatorTerminal } from '@narada2/process-launch-posture';

export interface WorkspaceLaunchTerminalTab {
  title: string;
  cwd: string;
  command: string;
  command_argv: string[];
  command_authority: 'projection_only';
  keepOpen: boolean;
}

export function workspaceLaunchTerminalArgs(tabs: WorkspaceLaunchTerminalTab[]): string[] {
  return tabs.flatMap((tab, index) => [
    ...(index === 0 ? [] : [';']),
    ...workspaceLaunchTerminalTabArgs(tab),
  ]);
}

export function workspaceLaunchTerminalTabArgs(tab: WorkspaceLaunchTerminalTab): string[] {
  if (tab.command.includes(';')) throw new Error('workspace_launch_terminal_command_contains_tab_separator');
  return [
    'new-tab',
    '--title', tab.title,
    '-d', tab.cwd,
    'pwsh',
    tab.keepOpen ? '-NoExit' : '-NoProfile',
    '-Command',
    tab.command,
  ];
}

export function workspaceLaunchPowerShellArgument(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function workspaceLaunchPowerShellCommand(args: string[]): string {
  return `& ${args.map(workspaceLaunchPowerShellArgument).join(' ')}`;
}

export function workspaceLaunchPowerShellHostMessage(message: string): string {
  return `Write-Host ${workspaceLaunchPowerShellArgument(message)}`;
}

export function workspaceLaunchRuntimeHandoffCommand(args: string[], qualifiedAgentId: string, waitForEnter: boolean): string {
  const handoffLifetime = waitForEnter
    ? 'This terminal remains open for the configured operator launch wait.'
    : 'This terminal closes when the runtime host exits.';
  return [
    workspaceLaunchPowerShellHostMessage(`agent-runtime-server: starting ${qualifiedAgentId}`),
    workspaceLaunchPowerShellHostMessage(handoffLifetime),
    workspaceLaunchPowerShellCommand(args),
    workspaceLaunchPowerShellHostMessage('agent-runtime-server: launch command completed, closing handoff.'),
  ].join('\n');
}

export function startWorkspaceLaunchWindowsTerminal(args: string[]) {
  return startOperatorTerminal('wt', args).result;
}

export async function captureWorkspaceLaunchTerminalInvocation(path: string, args: string[]): Promise<{ status: number; error?: Error }> {
  await appendFile(path, `${JSON.stringify(args)}\n`, 'utf8');
  return { status: 0 };
}
