/**
 * narada init usc-validate <path>
 *
 * Validates a USC-governed construction repo.
 * Uses the full USC validator when available; falls back to cached schemas
 * when USC packages are not installed.
 */

import { resolve } from 'node:path';
import { validateUscRepo } from '../lib/usc-schema-cache.js';
import { ExitCode } from '../lib/exit-codes.js';

export interface UscValidateOptions {
  path: string;
}

export async function uscValidateCommand(
  options: UscValidateOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const targetPath = options.path;
  if (!targetPath) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Target path is required. Usage: narada init usc-validate <path>' },
    };
  }

  const targetDir = resolve(targetPath);
  const validation = await validateUscRepo(targetDir);

  if (!validation.allPassed) {
    const result = {
      status: 'error',
      allPassed: false,
      results: validation.results,
    };
    return { exitCode: ExitCode.GENERAL_ERROR, result };
  }

  const result = {
    status: 'success',
    allPassed: true,
    results: validation.results,
  };
  return { exitCode: ExitCode.SUCCESS, result };
}
