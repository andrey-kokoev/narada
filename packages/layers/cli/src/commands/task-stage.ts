import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import {
  findTaskFile,
  listReportsForTask,
  type WorkResultReport,
} from '@narada2/task-governance/task-governance';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface TaskStageOptions {
  taskNumber?: string;
  agent?: string;
  include?: string[];
  report?: string;
  fromReport?: boolean;
  dryRun?: boolean;
  cwd?: string;
  format?: 'json' | 'human' | 'auto';
}

function gitExecutable(): string {
  if (process.env.NARADA_GIT_BINARY) return process.env.NARADA_GIT_BINARY;
  if (existsSync('/usr/bin/git')) return '/usr/bin/git';
  return 'git';
}

function runGit(repoRoot: string, args: string[]): string {
  const output = execFileSync(gitExecutable(), args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return output.replace(/\r?\n$/, '');
}

function repoRootFrom(cwd: string): string {
  return runGit(cwd, ['rev-parse', '--show-toplevel']);
}

function normalizeInclude(repoRoot: string, value: string): string {
  const abs = isAbsolute(value) ? value : resolve(repoRoot, value);
  const rel = relative(repoRoot, abs).replace(/\\/g, '/');
  if (!rel || rel === '.') return '.';
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Include path escapes repo: ${value}`);
  }
  return rel;
}

function parseStatusPaths(status: string): string[] {
  const paths = new Set<string>();
  for (const line of status.split(/\r?\n/).filter(Boolean)) {
    const raw = line.slice(3).trim();
    const renameParts = raw.split(' -> ');
    paths.add((renameParts[renameParts.length - 1] ?? raw).replace(/\\/g, '/').replace(/^"|"$/g, ''));
  }
  return [...paths].sort();
}

function isSelected(path: string, includes: string[]): boolean {
  return includes.some((include) => include === '.' || path === include || path.startsWith(`${include.replace(/\/$/, '')}/`));
}

function isTaskStageRuntimePath(path: string): boolean {
  return path === '.ai/task-lifecycle.db'
    || path === '.ai/task-lifecycle.db-journal'
    || path === '.ai/task-lifecycle.db-wal'
    || path === '.ai/task-lifecycle.db-shm';
}

function selectReport(reports: WorkResultReport[], reportId?: string): WorkResultReport | null {
  if (reportId) return reports.find((report) => report.report_id === reportId) ?? null;
  return reports[reports.length - 1] ?? null;
}

export async function taskStageCommand(
  options: TaskStageOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  if (!options.taskNumber) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: 'Task number is required' } };
  }
  const taskFile = await findTaskFile(cwd, options.taskNumber);
  if (!taskFile) {
    return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: `Task not found: ${options.taskNumber}` } };
  }

  let repoRoot: string;
  try {
    repoRoot = repoRootFrom(cwd);
  } catch (error) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to resolve Git repo root: ${error instanceof Error ? error.message : String(error)}` },
    };
  }

  const requestedIncludes = [...(options.include ?? [])];
  let report: WorkResultReport | null = null;
  if (options.fromReport || options.report) {
    const reports = await listReportsForTask(cwd, taskFile.taskId);
    report = selectReport(reports, options.report);
    if (!report) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: options.report
            ? `Report not found for task ${options.taskNumber}: ${options.report}`
            : `Task ${options.taskNumber} has no report changed_files to stage`,
        },
      };
    }
    requestedIncludes.push(...report.changed_files);
  }
  if (requestedIncludes.length === 0) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'No declared paths to stage. Use --include <path> or --from-report.' },
    };
  }

  let includes: string[];
  try {
    includes = [...new Set(requestedIncludes.map((value) => normalizeInclude(repoRoot, value)))].sort();
  } catch (error) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: error instanceof Error ? error.message : String(error) },
    };
  }

  const dirtyBefore = parseStatusPaths(runGit(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']))
    .filter((path) => !isTaskStageRuntimePath(path));
  const selectedDirty = dirtyBefore.filter((path) => isSelected(path, includes));
  const excludedDirty = dirtyBefore.filter((path) => !isSelected(path, includes));

  // Guard: fail if the index already contains staged files outside the task scope
  const preStaged = runGit(repoRoot, ['diff', '--cached', '--name-only'])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((path) => path.replace(/\\/g, '/'));
  const foreignStaged = preStaged.filter((path) => !isSelected(path, includes) && !isTaskStageRuntimePath(path));
  if (foreignStaged.length > 0) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Index contains staged files outside task scope: ${foreignStaged.join(', ')}. Reset with 'git reset HEAD' or commit them separately before staging this task.`,
      },
    };
  }

  if (!options.dryRun) {
    runGit(repoRoot, ['add', '--', ...includes]);
  }
  const staged = options.dryRun
    ? selectedDirty
    : runGit(repoRoot, ['diff', '--cached', '--name-only', '--', ...includes])
      .split(/\r?\n/)
      .filter(Boolean)
      .map((path) => path.replace(/\\/g, '/'))
      .sort();

  const result = {
    status: 'success',
    action: options.dryRun ? 'dry_run' : 'staged',
    task_number: Number(options.taskNumber),
    task_id: taskFile.taskId,
    agent_id: options.agent ?? null,
    report_id: report?.report_id ?? null,
    includes,
    staged_files: staged,
    excluded_dirty_files: excludedDirty,
  };
  if (fmt.getFormat() === 'json') return { exitCode: ExitCode.SUCCESS, result };
  fmt.message(`${options.dryRun ? 'Would stage' : 'Staged'} ${staged.length} file(s) for task ${options.taskNumber}; excluded dirty: ${excludedDirty.length}`, 'success');
  return { exitCode: ExitCode.SUCCESS, result };
}
