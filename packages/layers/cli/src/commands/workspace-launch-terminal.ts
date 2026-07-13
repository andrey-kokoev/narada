import { appendFile } from 'node:fs/promises';
import { emitCliOutputAdmission } from '../lib/cli-output.js';
import type {
  WorkspaceLaunchAttemptRecord,
  WorkspaceLaunchResultRecord,
  WorkspaceLauncherOutputProjection,
} from './workspace-launch-types.js';
import { isRecord, stringArray } from './workspace-launch-support.js';

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

