/**
 * Task claim operator.
 *
 * Mutation: claims a task for an agent, creating an assignment record
 * and updating the task file status to `claimed`.
 */

import { resolve } from 'node:path';
import { claimTaskService } from '@narada2/task-governance/task-assignment-lifecycle-service';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  resolvePrincipalStateDir,
  updatePrincipalRuntimeFromTaskEvent,
} from '../lib/principal-bridge.js';

export interface TaskClaimOptions {
  taskNumber?: string;
  format?: 'json' | 'human' | 'auto';
  agent?: string;
  reason?: string;
  cwd?: string;
  updatePrincipalRuntime?: boolean;
  principalStateDir?: string;
}

export async function taskClaimCommand(
  options: TaskClaimOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = (options as Record<string, unknown>).taskNumber as string | undefined;
  const agentId = options.agent;
  const service = await claimTaskService({
    taskNumber,
    agent: agentId,
    reason: options.reason,
    cwd,
  });
  const result = service.result;

  // Post-commit advisory PrincipalRuntime update
  if (result.status === 'success' && options.updatePrincipalRuntime && agentId && result.task_id) {
    try {
      const stateDir = resolvePrincipalStateDir({ cwd, principalStateDir: options.principalStateDir });
      const bridgeResult = await updatePrincipalRuntimeFromTaskEvent(stateDir, {
        type: 'task_claimed',
        agent_id: agentId,
        task_id: result.task_id,
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
    fmt.message(result.error ?? 'Task claim failed', 'error');
  } else {
    fmt.message(`Claimed task ${result.task_id} for ${result.agent_id}`, 'success');
  }
  return {
    exitCode: service.exitCode as unknown as ExitCode,
    result,
  };
}
