import { appendFile } from 'node:fs/promises';
import { startOperatorTerminal } from '@narada2/process-launch-posture';
import { emitCliOutputAdmission } from '../lib/cli-output.js';
import type {
  WorkspaceLaunchAttemptRecord,
  WorkspaceLaunchResultRecord,
  WorkspaceLauncherOutputProjection,
} from './workspace-launch-types.js';
import { isRecord, stringArray } from './workspace-launch-support.js';

export interface WorkspaceLaunchTerminalTab {
  title: string;
  cwd: string;
  command: string;
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

export function workspaceLaunchTerminalHandoffArgs(record: WorkspaceLaunchResultRecord): string[] {
  const topLevel = stringArray(record.wt_args);
  if (topLevel.length > 0) return topLevel;
  const terminalHandoff = isRecord(record.operator_terminal_handoff) ? record.operator_terminal_handoff : null;
  return terminalHandoff ? stringArray(terminalHandoff.wt_args) : [];
}

export async function captureWorkspaceLaunchTerminalInvocation(path: string, args: string[]): Promise<{ status: number; error?: Error }> {
  await appendFile(path, `${JSON.stringify(args)}\n`, 'utf8');
  return { status: 0 };
}

function launcherOutputHas(outputs: WorkspaceLauncherOutputProjection[], projection: WorkspaceLauncherOutputProjection): boolean {
  return !outputs.includes('quiet') && outputs.includes(projection);
}

function formatWorkspaceLaunchCommand(args: string[]): string {
  return args.map((arg) => /\s/.test(arg) ? `'${arg.replace(/'/g, "''")}'` : arg).join(' ');
}

export function writeWorkspaceLaunchCommandOutput(outputs: WorkspaceLauncherOutputProjection[], attempt: WorkspaceLaunchAttemptRecord): void {
  if (!launcherOutputHas(outputs, 'commands')) return;
  const lines: string[] = [];
  for (const handoff of attempt.handoffs) {
    if (handoff.argv_redacted.length > 0) {
      lines.push(`[launcher:command] ${formatWorkspaceLaunchCommand(handoff.argv_redacted)}`);
    }
  }
  if (lines.length > 0) emitCliOutputAdmission({ zone: 'finite', lines });
}

