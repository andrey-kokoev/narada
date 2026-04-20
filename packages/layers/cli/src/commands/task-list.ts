/**
 * Task list operator.
 *
 * Inspection: lists runnable tasks sorted by continuation affinity.
 * Pure read — no mutations.
 */

import { resolve } from 'node:path';
import { listRunnableTasks } from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface TaskListOptions {
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export async function taskListCommand(
  options: TaskListOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  let tasks;
  try {
    tasks = await listRunnableTasks(cwd);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to list tasks: ${msg}` },
    };
  }

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        count: tasks.length,
        tasks: tasks.map((t) => ({
          task_id: t.taskId,
          task_number: t.taskNumber,
          status: t.status,
          title: t.title,
          affinity: {
            preferred_agent_id: t.affinity.preferred_agent_id,
            strength: t.affinity.affinity_strength,
            reason: t.affinity.affinity_reason,
            source: t.affinity.source,
          },
        })),
      },
    };
  }

  if (tasks.length === 0) {
    fmt.message('No runnable tasks found', 'info');
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'success', count: 0, tasks: [] },
    };
  }

  fmt.section(`Runnable Tasks (${tasks.length})`);

  const rows = tasks.map((t) => {
    const affinityStr = t.affinity.preferred_agent_id
      ? `${t.affinity.preferred_agent_id} (${t.affinity.affinity_strength})`
      : '—';
    return {
      task: t.taskNumber?.toString() ?? t.taskId,
      status: t.status,
      title: t.title ?? '—',
      affinity: affinityStr,
    };
  });

  fmt.table(
    [
      { key: 'task' as const, label: 'Task' },
      { key: 'status' as const, label: 'Status' },
      { key: 'title' as const, label: 'Title' },
      { key: 'affinity' as const, label: 'Affinity' },
    ],
    rows,
  );

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      count: tasks.length,
      tasks: tasks.map((t) => ({
        task_id: t.taskId,
        task_number: t.taskNumber,
        status: t.status,
        title: t.title,
        affinity: {
          preferred_agent_id: t.affinity.preferred_agent_id,
          strength: t.affinity.affinity_strength,
          reason: t.affinity.affinity_reason,
          source: t.affinity.source,
        },
      })),
    },
  };
}
