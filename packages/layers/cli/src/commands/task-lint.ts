/**
 * Task lint tool.
 *
 * Pure tool/compiler: checks task files for structural issues without mutating state.
 */

import { resolve } from 'node:path';
import { lintTaskFiles } from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface TaskLintOptions {
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export async function taskLintCommand(
  options: TaskLintOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  try {
    const { issues, ok } = await lintTaskFiles(cwd);

    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ok ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
        result: { status: ok ? 'success' : 'error', issues },
      };
    }

    if (ok) {
      fmt.message('No task lint issues found', 'success');
    } else {
      fmt.message(`Found ${issues.length} task lint issue(s)`, 'error');
      for (const issue of issues) {
        fmt.kv(`${issue.type} (${issue.file})`, issue.detail);
      }
    }

    return {
      exitCode: ok ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result: { status: ok ? 'success' : 'error', issues },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  }
}
