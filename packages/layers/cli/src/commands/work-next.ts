/**
 * Unified next-action surface for agents and operators.
 *
 * This command composes task execution and inbox handling into one bounded answer
 * so an agent does not need to know which subsystem to query first.
 */

import { resolve } from 'node:path';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  listReportsForTask,
  listReviewsForTask,
  scanTasksByRange,
} from '../lib/task-governance.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import { inboxWorkNextCommand } from './inbox.js';
import { taskDispatchCommand } from './task-dispatch.js';
import { taskWorkNextCommand } from './task-next.js';

export interface WorkNextOptions {
  agent?: string;
  cwd?: string;
  format?: CliFormat;
  startTask?: boolean;
  execTask?: boolean;
}

interface CommandEnvelope {
  exitCode: ExitCode;
  result: unknown;
}

type WorkNextCheckedStatus = 'selected' | 'empty' | 'blocked';

interface WorkNextCheckedZone {
  zone: 'task_work' | 'review_work' | 'inbox_work';
  status: WorkNextCheckedStatus;
  reason?: string;
  selected_ref?: string;
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

function taskSelectedRef(primary: Record<string, unknown>): string | undefined {
  return typeof primary.task_number === 'number'
    ? `task:${primary.task_number}`
    : typeof primary.task_id === 'string'
      ? `task:${primary.task_id}`
      : undefined;
}

function inboxSelectedRef(primary: unknown): string | undefined {
  const record = asRecord(primary);
  return typeof record.envelope_id === 'string' ? `inbox:${record.envelope_id}` : undefined;
}

function emptyReason(result: unknown, fallback: string): string {
  const record = asRecord(result);
  return typeof record.reason === 'string' ? record.reason : fallback;
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
  } else if (result.action_kind === 'review_work') {
    const primary = asRecord(result.primary);
    lines.push(`Task: ${String(primary.task_number ?? 'unknown')}`);
    if (primary.report_id) lines.push(`Report: ${String(primary.report_id)}`);
  } else if (result.reason) {
    lines.push(`Reason: ${String(result.reason)}`);
  }
  const checked = Array.isArray(result.checked) ? result.checked : [];
  if (checked.length > 0) {
    lines.push('Checked:');
    for (const item of checked) {
      const record = asRecord(item);
      const detail = record.selected_ref ?? record.reason;
      lines.push(`- ${String(record.zone)}: ${String(record.status)}${detail ? ` (${String(detail)})` : ''}`);
    }
  }
  if (result.next_step) lines.push(`Next step: ${String(result.next_step)}`);
  return lines.join('\n');
}

async function findReviewWork(cwd: string, agentId: string): Promise<Record<string, unknown> | null> {
  const tasks = await scanTasksByRange(cwd, 1, 999999);
  let store;
  try {
    store = openTaskLifecycleStore(cwd);
  } catch {
    // Markdown scan remains a fallback for test repos without initialized SQLite.
  }
  try {
    const ordered = tasks
      .filter((task) => task.taskNumber !== null)
      .sort((a, b) => (a.taskNumber ?? 0) - (b.taskNumber ?? 0));

    for (const task of ordered) {
      const lifecycleStatus = store?.getLifecycle(task.taskId)?.status;
      const status = lifecycleStatus ?? task.status;
      if (status !== 'in_review') continue;

      const reports = await listReportsForTask(cwd, task.taskId);
      const report = reports[reports.length - 1] ?? null;
      if (report?.agent_id === agentId) continue;

      const reviews = await listReviewsForTask(cwd, task.taskId).catch(() => []);
      if (reviews.some((review) => review.reviewer_agent_id === agentId)) continue;

      return {
        task_id: task.taskId,
        task_number: task.taskNumber,
        status,
        report_id: report?.report_id ?? null,
        reported_by: report?.agent_id ?? null,
        command: `narada task review ${task.taskNumber} --agent ${agentId} --verdict accepted`,
        command_args: ['task', 'review', String(task.taskNumber), '--agent', agentId, '--verdict', 'accepted'],
      };
    }
    return null;
  } finally {
    if (store) store.db.close();
  }
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
  const checked: WorkNextCheckedZone[] = [];

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
    const primary = asRecord(taskRecord.primary ?? taskRecord.packet ?? null);
    checked.push({ zone: 'task_work', status: 'selected', selected_ref: taskSelectedRef(primary) });
    let dispatchResult: unknown = null;
    if (options.startTask) {
      const store = openTaskLifecycleStore(cwd);
      try {
        const taskNumber = primary.task_number;
        if (typeof taskNumber !== 'number') {
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: {
              status: 'error',
              error: 'Cannot start task work without a numeric task_number',
              primary,
            },
          };
        }
        const pickup = await taskDispatchCommand({
          action: 'pickup',
          taskNumber: String(taskNumber),
          agent: options.agent,
          cwd,
          format: 'json',
          store,
        });
        if (pickup.exitCode !== ExitCode.SUCCESS) return pickup;
        const start = await taskDispatchCommand({
          action: 'start',
          agent: options.agent,
          cwd,
          format: 'json',
          exec: options.execTask,
          store,
        });
        if (start.exitCode !== ExitCode.SUCCESS) return start;
        dispatchResult = {
          pickup: pickup.result,
          start: start.result,
        };
      } finally {
        store.db.close();
      }
    }
    const result = {
      status: 'success',
      action_kind: 'task_work',
      agent_id: options.agent,
      primary,
      checked,
      task_result: taskResult.result,
      dispatch_result: dispatchResult,
      next_step: 'Execute the returned task packet through the governed task lifecycle.',
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, formatHuman(result), format),
    };
  }
  checked.push({ zone: 'task_work', status: 'empty', reason: emptyReason(taskResult.result, 'no_admissible_task') });

  const reviewWork = await findReviewWork(cwd, options.agent);
  if (reviewWork) {
    checked.push({ zone: 'review_work', status: 'selected', selected_ref: taskSelectedRef(reviewWork) });
    const result = {
      status: 'success',
      action_kind: 'review_work',
      agent_id: options.agent,
      primary: reviewWork,
      checked,
      next_step: 'Review the task report through the governed task review command.',
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, formatHuman(result), format),
    };
  }
  checked.push({ zone: 'review_work', status: 'empty', reason: 'no_reviewable_task' });

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
    checked.push({ zone: 'inbox_work', status: 'selected', selected_ref: inboxSelectedRef(primary) });
    const result = {
      status: 'success',
      action_kind: 'inbox_work',
      agent_id: options.agent,
      primary,
      checked,
      inbox_result: inboxResult.result,
      next_step: 'Handle the inbox envelope through one of its admissible actions.',
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, formatHuman(result), format),
    };
  }
  checked.push({ zone: 'inbox_work', status: 'empty', reason: emptyReason(inboxResult.result, 'no_matching_inbox_work') });

  const result = {
    status: 'empty',
    action_kind: 'idle',
    agent_id: options.agent,
    primary: null,
    reason: 'no_task_or_inbox_work',
    checked,
    next_step: 'No task or inbox work is currently available for this agent.',
  };
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(result, formatHuman(result), format),
  };
}
