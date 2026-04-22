/**
 * Task lint tool.
 *
 * Pure tool/compiler: checks task files for structural issues without mutating state.
 */

import { resolve } from 'node:path';
import { lintTaskFiles, lintTaskFilesForRange } from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface TaskLintOptions {
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
  chapter?: string;
}

function parseRange(range: string): { start: number; end: number } | null {
  const singleMatch = range.match(/^(\d+)$/);
  if (singleMatch) {
    const n = Number(singleMatch[1]);
    return { start: n, end: n };
  }
  const rangeMatch = range.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (start <= end) return { start, end };
  }
  return null;
}

export async function taskLintCommand(
  options: TaskLintOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  try {
    let issues: Array<{ type: string; file: string; detail: string }>;
    let ok: boolean;

    if (options.chapter) {
      const range = parseRange(options.chapter);
      if (!range) {
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: { status: 'error', error: `Invalid chapter range: ${options.chapter}. Expected NNN or NNN-MMM.` },
        };
      }
      const result = await lintTaskFilesForRange(cwd, range.start, range.end);
      issues = result.issues;
      ok = result.ok;
    } else {
      const result = await lintTaskFiles(cwd);
      issues = result.issues;
      ok = result.ok;
    }

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
