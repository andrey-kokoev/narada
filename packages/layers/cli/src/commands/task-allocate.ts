/**
 * Task number allocator operator.
 *
 * Mutation: atomically reserves the next available task number.
 */

import { resolve } from 'node:path';
import { allocateTaskNumber } from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface TaskAllocateOptions {
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export async function taskAllocateCommand(
  options: TaskAllocateOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  try {
    const number = await allocateTaskNumber(cwd);

    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: { status: 'success', allocated_number: number },
      };
    }

    fmt.message(`Allocated task number: ${number}`, 'success');
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'success', allocated_number: number },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  }
}
