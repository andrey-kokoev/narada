/**
 * Task number allocator operator.
 *
 * Mutation: atomically reserves the next available task number.
 */

import { resolve } from 'node:path';
import { allocateTaskNumbersService } from '@narada2/task-governance/task-allocate-service';
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
  const service = await allocateTaskNumbersService({
    cwd,
    dryRun: options.dryRun,
    count: options.count,
  });
  const result = service.result;

  if (fmt.getFormat() !== 'json' && result.status !== 'error') {
    const numbers = result.status === 'dry_run' ? result.next_numbers ?? [] : result.allocated_numbers ?? [];
    if (result.status === 'dry_run') {
      fmt.message(
        numbers.length === 1
          ? `Next allocatable number: ${numbers[0]} (dry run - no mutation)`
          : `Next allocatable numbers: ${numbers.join(', ')} (dry run - no mutation)`,
        'info',
      );
    } else {
      fmt.message(
        numbers.length === 1
          ? `Allocated task number: ${numbers[0]}`
          : `Allocated task numbers: ${numbers.join(', ')}`,
        'success',
      );
    }
  }

  return {
    exitCode: service.exitCode as unknown as ExitCode,
    result,
  };
}
