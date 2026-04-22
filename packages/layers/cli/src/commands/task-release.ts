/**
 * Task release operator.
 *
 * Mutation: releases a claimed task, setting the assignment record
 * and updating the task file status.
 */

import { resolve } from 'node:path';
import {
  findTaskFile,
  loadAssignment,
  saveAssignment,
  readTaskFile,
  writeTaskFile,
  getActiveAssignment,
  isValidTransition,
  type ContinuationPacket,
} from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  resolvePrincipalStateDir,
  updatePrincipalRuntimeFromTaskEvent,
} from '../lib/principal-bridge.js';

export interface TaskReleaseOptions {
  taskNumber?: string;
  format?: 'json' | 'human' | 'auto';
  reason?: 'completed' | 'abandoned' | 'superseded' | 'transferred' | 'budget_exhausted';
  continuation?: string;
  cwd?: string;
  principalStateDir?: string;
}

export async function taskReleaseCommand(
  options: TaskReleaseOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = (options as Record<string, unknown>).taskNumber as string | undefined;
  const releaseReason = options.reason;

  if (!taskNumber) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Task number is required' },
    };
  }

  const VALID_RELEASE_REASONS = ['completed', 'abandoned', 'superseded', 'transferred', 'budget_exhausted'] as const;

  if (!releaseReason || !VALID_RELEASE_REASONS.includes(releaseReason as typeof VALID_RELEASE_REASONS[number])) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `--reason must be one of: ${VALID_RELEASE_REASONS.join(', ')}` },
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

  // Load assignment record
  const record = await loadAssignment(cwd, taskFile.taskId);
  if (!record) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Task ${taskFile.taskId} has no assignment record` },
    };
  }

  const active = getActiveAssignment(record);
  if (!active) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Task ${taskFile.taskId} has no active assignment` },
    };
  }

  // Verify task file status is actually 'claimed' (consistency check)
  const { frontMatter, body } = await readTaskFile(taskFile.path);
  if (frontMatter.status !== 'claimed') {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} consistency error: assignment is active but task status is '${String(frontMatter.status ?? 'missing')}', expected 'claimed'`,
      },
    };
  }

  // Determine new status
  let newStatus: string;
  if (releaseReason === 'completed') {
    newStatus = 'in_review';
  } else if (releaseReason === 'abandoned') {
    newStatus = 'opened';
  } else if (releaseReason === 'budget_exhausted') {
    newStatus = 'needs_continuation';
  } else {
    // superseded, transferred
    newStatus = 'opened';
  }

  // Validate transition before any mutation
  if (!isValidTransition(frontMatter.status, newStatus)) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Transition from '${String(frontMatter.status)}' to '${newStatus}' is not allowed by the state machine`,
      },
    };
  }

  // Require and validate continuation packet for budget_exhausted releases
  let continuationPacket: ContinuationPacket | undefined;
  if (releaseReason === 'budget_exhausted') {
    const continuationPath = options.continuation;
    if (!continuationPath) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: '--continuation <path> is required when releasing with reason budget_exhausted',
        },
      };
    }
    try {
      const { readFile } = await import('node:fs/promises');
      const raw = await readFile(continuationPath, 'utf8');
      continuationPacket = JSON.parse(raw) as ContinuationPacket;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Failed to read continuation packet: ${msg}` },
      };
    }
  }

  // All validation complete — mutate assignment and task file
  const now = new Date().toISOString();
  active.released_at = now;
  active.release_reason = releaseReason;

  await saveAssignment(cwd, record);

  frontMatter.status = newStatus;
  if (continuationPacket) {
    frontMatter.continuation_packet = continuationPacket;
  }

  await writeTaskFile(taskFile.path, frontMatter, body);

  // Post-commit advisory PrincipalRuntime update
  try {
    const stateDir = resolvePrincipalStateDir({ cwd, principalStateDir: options.principalStateDir });
    const bridgeResult = await updatePrincipalRuntimeFromTaskEvent(stateDir, {
      type: 'task_released',
      agent_id: active.agent_id,
      task_id: taskFile.taskId,
      reason: releaseReason,
    });
    if (bridgeResult.warning) {
      fmt.message(bridgeResult.warning, 'warning');
    }
  } catch {
    // Best-effort advisory update — never fail the command
  }

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        task_id: taskFile.taskId,
        agent_id: active.agent_id,
        released_at: now,
        release_reason: releaseReason,
        new_status: frontMatter.status,
      },
    };
  }

  fmt.message(`Released task ${taskFile.taskId} (${releaseReason})`, 'success');
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      task_id: taskFile.taskId,
      agent_id: active.agent_id,
      released_at: now,
      release_reason: releaseReason,
      new_status: frontMatter.status,
    },
  };
}
