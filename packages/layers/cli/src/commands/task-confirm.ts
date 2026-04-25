/**
 * Task confirm operator.
 *
 * Finalizes a closed task by transitioning it to `confirmed`.
 * Confirmation is the terminal lifecycle step that signals the task
 * has been reviewed and accepted as complete. It may be performed
 * individually or as part of chapter closure.
 *
 * Mutation: updates task status to `confirmed`, records provenance.
 */

import { resolve } from 'node:path';
import { findTaskFile, readTaskFile, writeTaskFile } from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface TaskConfirmOptions {
  taskNumber: string;
  by?: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export async function taskConfirmCommand(
  options: TaskConfirmOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;
  const confirmedBy = options.by ?? 'operator';

  if (!taskNumber || !Number.isFinite(Number(taskNumber))) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Invalid or missing task number' },
    };
  }

  // Find task file
  let taskFile;
  try {
    taskFile = await findTaskFile(cwd, taskNumber);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  }

  if (!taskFile) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Task not found: ${taskNumber}` },
    };
  }

  const { frontMatter, body } = await readTaskFile(taskFile.path);
  const currentStatus = frontMatter.status as string | undefined;

  // Must be closed to confirm
  if (currentStatus !== 'closed') {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} cannot be confirmed (status: ${currentStatus ?? 'missing'}, expected: closed)`,
      },
    };
  }

  // Require governed provenance
  if (!frontMatter.closed_by || !frontMatter.governed_by) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} lacks governed closure provenance (closed_by / governed_by). Close through a governed operator before confirming.`,
      },
    };
  }

  // Transition
  frontMatter.status = 'confirmed';
  frontMatter.confirmed_by = confirmedBy;
  frontMatter.confirmed_at = new Date().toISOString();

  await writeTaskFile(taskFile.path, frontMatter, body);

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        task_id: taskFile.taskId,
        task_number: Number(taskNumber),
        previous_status: 'closed',
        new_status: 'confirmed',
        confirmed_by: confirmedBy,
        confirmed_at: frontMatter.confirmed_at,
      },
    };
  }

  fmt.message(`Confirmed task ${taskFile.taskId}`, 'success');
  fmt.kv('Confirmed by', confirmedBy);
  fmt.kv('Confirmed at', String(frontMatter.confirmed_at));

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      task_id: taskFile.taskId,
      task_number: Number(taskNumber),
      new_status: 'confirmed',
      confirmed_by: confirmedBy,
      confirmed_at: frontMatter.confirmed_at,
    },
  };
}
