/**
 * Task list operator.
 *
 * Inspection: lists runnable tasks sorted by continuation affinity.
 * Pure read — no mutations.
 */

import { resolve } from 'node:path';
import { listRunnableTasks } from '../lib/task-governance.js';
import { listRunnableTasksWithProjection } from '../lib/task-projection.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface TaskListOptions {
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
  range?: string;
  limit?: number;
  all?: boolean;
}

const DEFAULT_TASK_LIST_LIMIT = 20;

function parseRangeFilter(input: string | undefined): { start: number; end: number } | undefined {
  if (!input) return undefined;
  const match = input.match(/^(\d+)-(\d+)$/);
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start > end) return undefined;
  return { start, end };
}

export async function taskListCommand(
  options: TaskListOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const rangeFilter = parseRangeFilter(options.range);
  const explicitLimit = Number.isInteger(options.limit) && Number(options.limit) > 0 ? Number(options.limit) : undefined;
  const limit = options.all ? undefined : (explicitLimit ?? DEFAULT_TASK_LIST_LIMIT);

  let tasks;
  try {
    // Try projection-backed listing first (SQLite lifecycle + markdown spec)
    const projected = await listRunnableTasksWithProjection(cwd, undefined, { rangeFilter });
    if (projected) {
      tasks = projected;
    } else {
      // Fall back to pure markdown listing when SQLite is unavailable
      tasks = await listRunnableTasks(cwd, undefined, { rangeFilter });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to list tasks: ${msg}` },
    };
  }

  const totalCount = tasks.length;
  const visibleTasks = limit === undefined ? tasks : tasks.slice(0, limit);
  const truncated = visibleTasks.length < totalCount;

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        count: visibleTasks.length,
        total_count: totalCount,
        limit: limit ?? null,
        truncated,
        next_step: truncated ? 'Use --limit <n>, --range <start-end>, or --all to admit more output.' : null,
        tasks: visibleTasks.map((t) => ({
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

  if (visibleTasks.length === 0) {
    fmt.message('No runnable tasks found', 'info');
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'success', count: 0, total_count: totalCount, limit: limit ?? null, truncated, tasks: [] },
    };
  }

  fmt.section(truncated
    ? `Runnable Tasks (showing ${visibleTasks.length} of ${totalCount})`
    : `Runnable Tasks (${totalCount})`);

  const rows = visibleTasks.map((t) => {
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

  if (truncated) {
    fmt.message(`Output bounded to ${visibleTasks.length} tasks. Use --limit <n>, --range <start-end>, or --all to admit more output.`, 'info');
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      count: visibleTasks.length,
      total_count: totalCount,
      limit: limit ?? null,
      truncated,
      next_step: truncated ? 'Use --limit <n>, --range <start-end>, or --all to admit more output.' : null,
      tasks: visibleTasks.map((t) => ({
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
