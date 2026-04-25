/**
 * Task continuation / takeover operator.
 *
 * Mutation: assigns a continuation or takeover agent to an already-claimed
 * or continuation-ready task, recording intent durably in assignment history.
 */

import { resolve } from 'node:path';
import {
  continueTaskService,
  type ContinuationReason,
} from '@narada2/task-governance/task-assignment-lifecycle-service';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface TaskContinueOptions {
  taskNumber?: string;
  format?: 'json' | 'human' | 'auto';
  agent?: string;
  reason?: ContinuationReason;
  cwd?: string;
}

export async function taskContinueCommand(
  options: TaskContinueOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = (options as Record<string, unknown>).taskNumber as string | undefined;
  const service = await continueTaskService({
    taskNumber,
    agent: options.agent,
    reason: options.reason,
    cwd,
  });
  const result = service.result;

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: service.exitCode as unknown as ExitCode,
      result,
    };
  }

  if (result.status === 'error') {
    fmt.message(result.error ?? 'Task continue failed', 'error');
  } else {
    fmt.message(
      `Continued task ${result.task_id} -> ${result.agent_id} (reason: ${result.reason})`,
      'success',
    );
    if (result.supersedes) {
      fmt.message(`  Prior assignment by ${result.previous_agent_id} was released (continued).`, 'info');
    } else {
      fmt.message(`  Prior assignment by ${result.previous_agent_id} remains active.`, 'info');
    }
  }

  return {
    exitCode: service.exitCode as unknown as ExitCode,
    result,
  };
}
