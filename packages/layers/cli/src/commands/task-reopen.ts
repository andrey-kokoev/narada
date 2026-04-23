/**
 * Task reopen repair operator.
 *
 * Provides a bounded repair path for tasks that are terminal-by-front-matter
 * but invalid-by-governance provenance. Transitions the task back to a
 * non-terminal state so it can be re-closed through a governed operator.
 */

import { resolve } from 'node:path';
import {
  findTaskFile,
  readTaskFile,
  writeTaskFile,
  inspectTaskEvidence,
  isValidTransition,
} from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface TaskReopenOptions {
  taskNumber: string;
  by?: string;
  force?: boolean;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export async function taskReopenCommand(
  options: TaskReopenOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;
  const reopenedBy = options.by ?? 'operator';

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

  // Must be terminal to reopen
  if (currentStatus !== 'closed' && currentStatus !== 'confirmed') {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} is not terminal (status: ${currentStatus ?? 'missing'}); nothing to reopen`,
      },
    };
  }

  // Inspect evidence
  const evidence = await inspectTaskEvidence(cwd, taskNumber);

  // By default, only reopen if there are governance violations
  const hasViolations = evidence.violations.length > 0;
  if (!hasViolations && !options.force) {
    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          task_id: taskFile.taskId,
          task_number: Number(taskNumber),
          current_status: currentStatus,
          error: 'Task is terminal and valid by evidence. Use --force to reopen anyway.',
        },
      };
    }

    fmt.message(`Task ${taskFile.taskId} is terminal and valid by evidence`, 'warning');
    fmt.message('Use --force to reopen anyway', 'info');
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        task_id: taskFile.taskId,
        task_number: Number(taskNumber),
        current_status: currentStatus,
        error: 'Task is terminal and valid by evidence. Use --force to reopen anyway.',
      },
    };
  }

  // Determine target status
  // If the task has an accepted review, return to in_review so it can be re-closed via review.
  // Otherwise, return to opened so it can be re-claimed and re-closed via task close.
  const targetStatus = evidence.has_review ? 'in_review' : 'opened';

  if (!isValidTransition(currentStatus, targetStatus)) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Transition from '${currentStatus}' to '${targetStatus}' is not allowed by the state machine`,
      },
    };
  }

  // Clear terminal markers
  frontMatter.status = targetStatus;
  frontMatter.reopened_at = new Date().toISOString();
  frontMatter.reopened_by = reopenedBy;
  // Preserve historical closed_by/closed_at as audit trail; clear governed_by
  delete frontMatter.governed_by;

  await writeTaskFile(taskFile.path, frontMatter, body);

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        task_id: taskFile.taskId,
        task_number: Number(taskNumber),
        previous_status: currentStatus,
        new_status: targetStatus,
        reopened_by: reopenedBy,
        reopened_at: frontMatter.reopened_at,
        violations_cleared: evidence.violations,
        note: `Re-close through governed operator: narada task close ${taskNumber} --by <id> or narada task review ${taskNumber} --agent <id> --verdict accepted`,
      },
    };
  }

  fmt.message(`Reopened task ${taskFile.taskId} → ${targetStatus}`, 'success');
  fmt.kv('Reopened by', reopenedBy);
  fmt.kv('Reopened at', String(frontMatter.reopened_at));
  if (evidence.violations.length > 0) {
    fmt.message('Cleared violations:', 'info');
    for (const v of evidence.violations) {
      fmt.message(`  ❌ ${v}`, 'warning');
    }
  }
  fmt.message('Re-close through a governed operator:', 'info');
  fmt.message(`  narada task close ${taskNumber} --by <operator>`, 'info');
  if (evidence.has_review) {
    fmt.message(`  narada task review ${taskNumber} --agent <id> --verdict accepted`, 'info');
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      task_id: taskFile.taskId,
      task_number: Number(taskNumber),
      previous_status: currentStatus,
      new_status: targetStatus,
      reopened_by: reopenedBy,
      reopened_at: frontMatter.reopened_at,
      violations_cleared: evidence.violations,
    },
  };
}
