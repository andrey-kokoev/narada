import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { scanMaxTaskNumber } from '@narada2/task-governance/task-governance';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { openTaskLifecycleStore, type TaskLifecycleRow } from '../lib/task-lifecycle-store.js';

export interface TaskLifecycleStatusOptions {
  cwd?: string;
  format?: CliFormat;
}

type DriftKind = 'none' | 'sequence_lags_tasks' | 'sequence_ahead_of_tasks';

export interface TaskLifecycleStatus {
  status: 'success';
  generated_at: string;
  command_authority: {
    read_only: true;
    mutates_lifecycle_state: false;
    dry_run_allocation_would_mutate: false;
  };
  allocation: {
    max_task_number: number;
    max_sources: {
      task_files: number;
      task_specs: number;
      task_lifecycle: number;
    };
    last_allocated_number: number;
    next_allocatable_number: number;
    sequence_drift: {
      kind: DriftKind;
      amount: number;
      description: string;
    };
  };
  builder_done_posture: {
    open_task_count: number;
    in_progress_task_count: number;
    review_requested_or_handoff_needed_count: number;
    blocked_or_deferred_count: number;
    lifecycle_vocabulary: string[];
    current_builder_work_packet_clean_to_hand_back: boolean;
    residuals: string[];
  };
  evidence: {
    task_lifecycle_db_path: string;
    snapshot_path: string;
    snapshot_exists: boolean;
    db_mtime_ms: number | null;
    snapshot_mtime_ms: number | null;
    snapshot_freshness: 'snapshot_missing' | 'db_missing' | 'snapshot_fresh' | 'snapshot_stale';
    direct_sqlite_reads_posture: string;
  };
}

const OPEN_STATUSES = new Set(['opened']);
const IN_PROGRESS_STATUSES = new Set(['claimed', 'needs_continuation']);
const REVIEW_STATUSES = new Set(['in_review']);
const BLOCKED_OR_DEFERRED_STATUSES = new Set(['blocked', 'deferred']);
const LIFECYCLE_VOCABULARY = [
  'opened',
  'claimed',
  'needs_continuation',
  'in_review',
  'blocked',
  'deferred',
  'closed',
  'confirmed',
];

export async function taskLifecycleStatusCommand(
  options: TaskLifecycleStatusOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const store = openTaskLifecycleStore(cwd);
  try {
    const lifecycles = store.getAllLifecycle();
    const maxTaskFiles = await scanMaxTaskNumber(cwd);
    const maxTaskSpecs = maxNumber(store.db
      .prepare('select max(task_number) as max_task_number from task_specs')
      .get() as { max_task_number?: number | null } | undefined);
    const maxLifecycle = Math.max(0, ...lifecycles.map((row) => row.task_number ?? 0));
    const maxTaskNumber = Math.max(maxTaskFiles, maxTaskSpecs, maxLifecycle);
    const lastAllocated = store.getLastAllocated();
    const driftAmount = lastAllocated - maxTaskNumber;
    const result: TaskLifecycleStatus = {
      status: 'success',
      generated_at: new Date().toISOString(),
      command_authority: {
        read_only: true,
        mutates_lifecycle_state: false,
        dry_run_allocation_would_mutate: false,
      },
      allocation: {
        max_task_number: maxTaskNumber,
        max_sources: {
          task_files: maxTaskFiles,
          task_specs: maxTaskSpecs,
          task_lifecycle: maxLifecycle,
        },
        last_allocated_number: lastAllocated,
        next_allocatable_number: Math.max(maxTaskNumber, lastAllocated) + 1,
        sequence_drift: describeDrift(driftAmount),
      },
      builder_done_posture: summarizeBuilderPosture(store, lifecycles),
      evidence: summarizeEvidence(cwd),
    };

    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, renderHuman(result), options.format ?? 'auto'),
    };
  } finally {
    store.db.close();
  }
}

function maxNumber(row: { max_task_number?: number | null } | undefined): number {
  const value = row?.max_task_number;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function describeDrift(amount: number): TaskLifecycleStatus['allocation']['sequence_drift'] {
  if (amount === 0) {
    return {
      kind: 'none',
      amount: 0,
      description: 'task number sequence matches the highest known task number',
    };
  }
  if (amount < 0) {
    return {
      kind: 'sequence_lags_tasks',
      amount: Math.abs(amount),
      description: 'task number sequence is behind existing task rows/files; the next mutating allocation will advance the sequence floor',
    };
  }
  return {
    kind: 'sequence_ahead_of_tasks',
    amount,
    description: 'task number sequence is ahead of existing task rows/files; previously allocated numbers may not have materialized as tasks',
  };
}

function summarizeBuilderPosture(
  store: ReturnType<typeof openTaskLifecycleStore>,
  lifecycles: TaskLifecycleRow[],
): TaskLifecycleStatus['builder_done_posture'] {
  const open = lifecycles.filter((row) => OPEN_STATUSES.has(row.status)).length;
  const inProgress = lifecycles.filter((row) => IN_PROGRESS_STATUSES.has(row.status)).length;
  const review = lifecycles.filter((row) => REVIEW_STATUSES.has(row.status)).length;
  const blockedOrDeferred = lifecycles.filter((row) => BLOCKED_OR_DEFERRED_STATUSES.has(row.status)).length;
  const builderActive = lifecycles
    .filter((row) => IN_PROGRESS_STATUSES.has(row.status) || REVIEW_STATUSES.has(row.status))
    .filter((row) => store.getActiveAssignment(row.task_id)?.agent_id === 'builder')
    .map((row) => row.task_number)
    .filter((number): number is number => typeof number === 'number')
    .sort((a, b) => a - b);
  const residuals = builderActive.map((number) => `builder has active or review-pending task ${number}`);
  if (review > 0) {
    residuals.push(`${review} task(s) are waiting for review or closure handoff`);
  }
  return {
    open_task_count: open,
    in_progress_task_count: inProgress,
    review_requested_or_handoff_needed_count: review,
    blocked_or_deferred_count: blockedOrDeferred,
    lifecycle_vocabulary: LIFECYCLE_VOCABULARY,
    current_builder_work_packet_clean_to_hand_back: residuals.length === 0,
    residuals,
  };
}

function summarizeEvidence(cwd: string): TaskLifecycleStatus['evidence'] {
  const dbPath = join(cwd, '.ai', 'task-lifecycle.db');
  const snapshotPath = join(cwd, '.ai', 'task-lifecycle-snapshot.json');
  const dbMtime = mtimeMs(dbPath);
  const snapshotMtime = mtimeMs(snapshotPath);
  return {
    task_lifecycle_db_path: dbPath,
    snapshot_path: snapshotPath,
    snapshot_exists: snapshotMtime !== null,
    db_mtime_ms: dbMtime,
    snapshot_mtime_ms: snapshotMtime,
    snapshot_freshness: snapshotFreshness(dbMtime, snapshotMtime),
    direct_sqlite_reads_posture: 'diagnostic-only under explicit admitted repair or diagnosis tasks; use narada task lifecycle status for normal allocation/posture questions',
  };
}

function mtimeMs(path: string): number | null {
  if (!existsSync(path)) return null;
  return statSync(path).mtimeMs;
}

function snapshotFreshness(
  dbMtime: number | null,
  snapshotMtime: number | null,
): TaskLifecycleStatus['evidence']['snapshot_freshness'] {
  if (snapshotMtime === null) return 'snapshot_missing';
  if (dbMtime === null) return 'db_missing';
  return snapshotMtime >= dbMtime ? 'snapshot_fresh' : 'snapshot_stale';
}

function renderHuman(result: TaskLifecycleStatus): string[] {
  return [
    'Task Lifecycle Status',
    `Generated: ${result.generated_at}`,
    `Max task number: ${result.allocation.max_task_number}`,
    `Last allocated: ${result.allocation.last_allocated_number}`,
    `Next allocatable: ${result.allocation.next_allocatable_number}`,
    `Sequence drift: ${result.allocation.sequence_drift.kind} (${result.allocation.sequence_drift.amount})`,
    `Dry-run allocation mutates: ${result.command_authority.dry_run_allocation_would_mutate ? 'yes' : 'no'}`,
    '',
    'Builder Done Posture:',
    `  Open tasks: ${result.builder_done_posture.open_task_count}`,
    `  In progress: ${result.builder_done_posture.in_progress_task_count}`,
    `  Review/handoff needed: ${result.builder_done_posture.review_requested_or_handoff_needed_count}`,
    `  Blocked/deferred: ${result.builder_done_posture.blocked_or_deferred_count}`,
    `  Clean to hand back: ${result.builder_done_posture.current_builder_work_packet_clean_to_hand_back ? 'yes' : 'no'}`,
    '',
    'Evidence:',
    `  Snapshot: ${result.evidence.snapshot_freshness}`,
    `  Direct SQLite reads: ${result.evidence.direct_sqlite_reads_posture}`,
  ];
}
