/**
 * Unified next-action surface for agents and operators.
 *
 * This command composes task execution and inbox handling into one bounded answer
 * so an agent does not need to know which subsystem to query first.
 */

import { resolve } from 'node:path';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { inboxWorkNextCommand } from './inbox.js';
import { taskWorkNextCommand } from './task-next.js';

export interface WorkNextOptions {
  agent?: string;
  cwd?: string;
  format?: CliFormat;
}

interface CommandEnvelope {
  exitCode: ExitCode;
  result: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isEmptyTaskResult(result: unknown): boolean {
  const record = asRecord(result);
  return record.status === 'empty' && record.reason === 'no_admissible_task';
}

function isAgentNotFound(result: unknown): boolean {
  const record = asRecord(result);
  return record.status === 'error' && record.reason === 'agent_not_found';
}

function formatHuman(result: Record<string, unknown>): string {
  const lines = [
    `Next action: ${String(result.action_kind)}`,
    `Agent: ${String(result.agent_id)}`,
  ];
  if (result.action_kind === 'task_work') {
    const primary = asRecord(result.primary);
    lines.push(`Task: ${String(primary.task_number ?? 'unknown')}`);
    if (primary.title) lines.push(`Title: ${String(primary.title)}`);
  } else if (result.action_kind === 'inbox_work') {
    const primary = asRecord(result.primary);
    lines.push(`Envelope: ${String(primary.envelope_id ?? 'unknown')}`);
    if (primary.kind) lines.push(`Kind: ${String(primary.kind)}`);
  } else if (result.reason) {
    lines.push(`Reason: ${String(result.reason)}`);
  }
  if (result.next_step) lines.push(`Next step: ${String(result.next_step)}`);
  return lines.join('\n');
}

export async function workNextCommand(options: WorkNextOptions): Promise<CommandEnvelope> {
  if (!options.agent) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--agent is required', primary: null },
    };
  }

  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const format = options.format ?? 'auto';

  const taskResult = await taskWorkNextCommand({
    agent: options.agent,
    cwd,
    format: 'json',
  });

  if (isAgentNotFound(taskResult.result)) {
    return taskResult;
  }

  if (taskResult.exitCode !== ExitCode.SUCCESS) {
    return taskResult;
  }

  if (taskResult.exitCode === ExitCode.SUCCESS && !isEmptyTaskResult(taskResult.result)) {
    const taskRecord = asRecord(taskResult.result);
    const result = {
      status: 'success',
      action_kind: 'task_work',
      agent_id: options.agent,
      primary: taskRecord.primary ?? taskRecord.packet ?? null,
      task_result: taskResult.result,
      next_step: 'Execute the returned task packet through the governed task lifecycle.',
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, formatHuman(result), format),
    };
  }

  const inboxResult = await inboxWorkNextCommand({
    cwd,
    format: 'json',
    claim: true,
    by: options.agent,
  });

  if (inboxResult.exitCode !== ExitCode.SUCCESS) {
    return inboxResult;
  }

  const inboxRecord = asRecord(inboxResult.result);
  const primary = inboxRecord.primary ?? null;
  if (primary) {
    const result = {
      status: 'success',
      action_kind: 'inbox_work',
      agent_id: options.agent,
      primary,
      inbox_result: inboxResult.result,
      next_step: 'Handle the inbox envelope through one of its admissible actions.',
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, formatHuman(result), format),
    };
  }

  const result = {
    status: 'empty',
    action_kind: 'idle',
    agent_id: options.agent,
    primary: null,
    reason: 'no_task_or_inbox_work',
    next_step: 'No task or inbox work is currently available for this agent.',
  };
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(result, formatHuman(result), format),
  };
}
