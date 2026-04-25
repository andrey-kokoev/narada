/**
 * Task number allocator operator.
 *
 * Mutation: atomically reserves the next available task number.
 */

import { resolve } from 'node:path';
import { allocateTaskNumbers, previewNextTaskNumbers } from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface TaskAllocateOptions {
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
  dryRun?: boolean;
  count?: number;
}

export async function taskAllocateCommand(
  options: TaskAllocateOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const count = options.count ?? 1;

  try {
    if (!Number.isInteger(count) || count < 1) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: '--count must be a positive integer' },
      };
    }

    if (options.dryRun) {
      const numbers = await previewNextTaskNumbers(cwd, count);

      if (fmt.getFormat() === 'json') {
        return {
          exitCode: ExitCode.SUCCESS,
          result: { status: 'dry_run', next_number: numbers[0], next_numbers: numbers, count },
        };
      }

      fmt.message(
        count === 1
          ? `Next allocatable number: ${numbers[0]} (dry run - no mutation)`
          : `Next allocatable numbers: ${numbers.join(', ')} (dry run - no mutation)`,
        'info',
      );
      return {
        exitCode: ExitCode.SUCCESS,
        result: { status: 'dry_run', next_number: numbers[0], next_numbers: numbers, count },
      };
    }

    const numbers = await allocateTaskNumbers(cwd, count);

    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: { status: 'success', allocated_number: numbers[0], allocated_numbers: numbers, count },
      };
    }

    fmt.message(
      count === 1
        ? `Allocated task number: ${numbers[0]}`
        : `Allocated task numbers: ${numbers.join(', ')}`,
      'success',
    );
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'success', allocated_number: numbers[0], allocated_numbers: numbers, count },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  }
}
