import { existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { scanMaxTaskNumber } from '@narada2/task-governance-core/task-governance';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';

export interface TaskPreflightOptions {
  cwd?: string;
  format?: CliFormat;
}

type LegacySurface = {
  path: string;
  exists: boolean;
  warning: string | null;
};

export interface TaskPreflightResult {
  status: 'success';
  generated_at: string;
  command_authority: {
    read_only: true;
    bounded_output: true;
    mutates_lifecycle_state: false;
  };
  authority: {
    canonical_task_db: { path: string; exists: boolean };
    canonical_task_spec_dir: { path: string; exists: boolean; file_count: number };
    lifecycle_snapshot: { path: string; exists: boolean };
    legacy_surfaces: LegacySurface[];
  };
  allocation: {
    last_allocated_number: number;
    max_task_number: number;
    next_allocatable_number: number;
  };
  lifecycle_summary: {
    total: number;
    by_status: Record<string, number>;
    active_builder_tasks: number[];
    review_tasks: number[];
    deferred_tasks: number[];
  };
  dirty_state: {
    git_available: boolean;
    dirty: boolean;
    entries_shown: number;
    entries: string[];
    truncated: boolean;
  };
  recommended_next_commands: string[];
}

const DIRTY_LIMIT = 12;
const LEGACY_SURFACES = [
  {
    path: '.ai/tasks',
    warning: 'legacy task spec surface; canonical task specs are under .ai/do-not-open/tasks',
  },
  {
    path: '.ai/tasks/task-lifecycle.db',
    warning: 'legacy lifecycle database path; canonical runtime DB is .ai/task-lifecycle.db',
  },
  {
    path: '.ai/tasks/assignments',
    warning: 'legacy assignment projection surface; canonical assignment state is SQLite-backed',
  },
  {
    path: '.ai/agents/roster.json',
    warning: 'compatibility roster projection; canonical roster state is SQLite-backed',
  },
] as const;

export async function taskPreflightCommand(
  options: TaskPreflightOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const store = openTaskLifecycleStore(cwd);
  try {
    const lifecycles = store.getAllLifecycle();
    const canonicalTaskDir = join(cwd, '.ai', 'do-not-open', 'tasks');
    const canonicalDb = join(cwd, '.ai', 'task-lifecycle.db');
    const snapshot = join(cwd, '.ai', 'task-lifecycle-snapshot.json');
    const maxTaskNumber = Math.max(
      await scanMaxTaskNumber(cwd),
      ...lifecycles.map((row) => row.task_number ?? 0),
      0,
    );
    const lastAllocated = store.getLastAllocated();
    const byStatus = lifecycles.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});
    const result: TaskPreflightResult = {
      status: 'success',
      generated_at: new Date().toISOString(),
      command_authority: {
        read_only: true,
        bounded_output: true,
        mutates_lifecycle_state: false,
      },
      authority: {
        canonical_task_db: { path: canonicalDb, exists: existsSync(canonicalDb) },
        canonical_task_spec_dir: {
          path: canonicalTaskDir,
          exists: existsSync(canonicalTaskDir),
          file_count: countMarkdownFiles(canonicalTaskDir),
        },
        lifecycle_snapshot: { path: snapshot, exists: existsSync(snapshot) },
        legacy_surfaces: LEGACY_SURFACES.map((surface) => {
          const path = join(cwd, surface.path);
          const exists = existsSync(path);
          return {
            path,
            exists,
            warning: exists ? surface.warning : null,
          };
        }),
      },
      allocation: {
        last_allocated_number: lastAllocated,
        max_task_number: maxTaskNumber,
        next_allocatable_number: Math.max(lastAllocated, maxTaskNumber) + 1,
      },
      lifecycle_summary: {
        total: lifecycles.length,
        by_status: byStatus,
        active_builder_tasks: taskNumbers(lifecycles
          .filter((row) => ['claimed', 'needs_continuation', 'in_review'].includes(row.status))
          .filter((row) => store.getActiveAssignment(row.task_id)?.agent_id === 'builder')),
        review_tasks: taskNumbers(lifecycles.filter((row) => row.status === 'in_review')),
        deferred_tasks: taskNumbers(lifecycles.filter((row) => row.status === 'deferred')),
      },
      dirty_state: readGitDirtyState(cwd),
      recommended_next_commands: [
        'narada task workboard --format json',
        'narada task lifecycle status --format json',
        'narada task create --title "<title>" --criteria "<criterion>"',
      ],
    };

    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, renderHuman(result), options.format ?? 'auto'),
    };
  } finally {
    store.db.close();
  }
}

function countMarkdownFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  try {
    return readdirSync(dir).filter((entry) => entry.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

function taskNumbers(rows: Array<{ task_number: number | null }>): number[] {
  return rows
    .map((row) => row.task_number)
    .filter((number): number is number => typeof number === 'number')
    .sort((a, b) => a - b);
}

function readGitDirtyState(cwd: string): TaskPreflightResult['dirty_state'] {
  try {
    const stdout = execFileSync('git', ['status', '--short'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const entries = stdout
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean);
    return {
      git_available: true,
      dirty: entries.length > 0,
      entries_shown: Math.min(entries.length, DIRTY_LIMIT),
      entries: entries.slice(0, DIRTY_LIMIT),
      truncated: entries.length > DIRTY_LIMIT,
    };
  } catch {
    return {
      git_available: false,
      dirty: false,
      entries_shown: 0,
      entries: [],
      truncated: false,
    };
  }
}

function renderHuman(result: TaskPreflightResult): string[] {
  const legacyWarnings = result.authority.legacy_surfaces
    .filter((surface) => surface.warning)
    .map((surface) => `  - ${surface.path}: ${surface.warning}`);
  return [
    'Task Authority Preflight',
    `Generated: ${result.generated_at}`,
    `Canonical DB: ${result.authority.canonical_task_db.exists ? 'present' : 'missing'} ${result.authority.canonical_task_db.path}`,
    `Canonical specs: ${result.authority.canonical_task_spec_dir.file_count} file(s) ${result.authority.canonical_task_spec_dir.path}`,
    `Snapshot: ${result.authority.lifecycle_snapshot.exists ? 'present' : 'missing'} ${result.authority.lifecycle_snapshot.path}`,
    `Last allocated: ${result.allocation.last_allocated_number}`,
    `Max task number: ${result.allocation.max_task_number}`,
    `Next allocatable: ${result.allocation.next_allocatable_number}`,
    `Lifecycle rows: ${result.lifecycle_summary.total}`,
    `Dirty state: ${result.dirty_state.dirty ? `${result.dirty_state.entries_shown} shown${result.dirty_state.truncated ? ' (truncated)' : ''}` : 'clean'}`,
    '',
    'Legacy Surface Warnings:',
    ...(legacyWarnings.length > 0 ? legacyWarnings : ['  none']),
    '',
    'Use this bounded preflight instead of raw lifecycle snapshot inspection for commissioning diagnosis.',
  ];
}
