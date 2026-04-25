/**
 * Task release operator.
 *
 * Mutation: releases a claimed task, setting the assignment record
 * and updating the task file status.
 */

import { resolve } from 'node:path';
import {
  releaseTaskService,
  VALID_RELEASE_REASONS,
} from '@narada2/task-governance/task-assignment-lifecycle-service';
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
  const service = await releaseTaskService({
    taskNumber,
    reason: options.reason,
    continuation: options.continuation,
    cwd,
  });
  const result = service.result;

  // Post-commit advisory PrincipalRuntime update
  if (result.status === 'success' && result.agent_id && result.task_id && result.release_reason) {
    try {
    const stateDir = resolvePrincipalStateDir({ cwd, principalStateDir: options.principalStateDir });
    const bridgeResult = await updatePrincipalRuntimeFromTaskEvent(stateDir, {
      type: 'task_released',
      agent_id: result.agent_id,
      task_id: result.task_id,
      reason: result.release_reason,
    });
    if (bridgeResult.warning) {
      fmt.message(bridgeResult.warning, 'warning');
    }
    } catch {
      // Best-effort advisory update — never fail the command
    }
  }

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: service.exitCode as unknown as ExitCode,
      result,
    };
  }

  if (result.status === 'error') {
    fmt.message(result.error ?? `--reason must be one of: ${VALID_RELEASE_REASONS.join(', ')}`, 'error');
  } else {
    fmt.message(`Released task ${result.task_id} (${result.release_reason})`, 'success');
  }
  return {
    exitCode: service.exitCode as unknown as ExitCode,
    result,
  };
}
