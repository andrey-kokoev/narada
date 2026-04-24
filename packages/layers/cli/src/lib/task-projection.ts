/**
 * Task Projection Layer
 *
 * Merged read surface that combines authoritative lifecycle state from
 * SQLite with authored specification from markdown.
 *
 * Design (Decision 547):
 * - SQLite owns lifecycle state (status, assignments, reports, reviews)
 * - Markdown owns authored specification (goal, work, criteria, notes)
 * - No field is independently authoritative in both stores
 * - Projection is read-only; writes are the exclusive concern of
 *   governed operators (task claim, report, review, close)
 */

import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import {
  SqliteTaskLifecycleStore,
  type TaskLifecycleStore,
  type TaskStatus,
} from './task-lifecycle-store.js';
import {
  findTaskFile,
  readTaskFile,
  listReportsForTask,
  listReviewsForTask,
  listClosureDecisionsForTask,
  hasDerivativeFiles,
  hasGovernedProvenance,
  isExecutableTaskFile,
  parseFrontMatter,
  computeTaskAffinity,
  type TaskCompletionEvidence,
  type AssignmentIntent,
  type ChapterTaskInfo,
  type RunnableTask,
  type TaskContinuationAffinity,
} from './task-governance.js';

export function getTaskLifecycleDbPath(cwd: string): string {
  return join(resolve(cwd), '.ai', 'task-lifecycle.db');
}

export async function openTaskLifecycleStore(
  cwd: string,
): Promise<TaskLifecycleStore | null> {
  const dbPath = getTaskLifecycleDbPath(cwd);
  if (!existsSync(dbPath)) {
    return null;
  }
  try {
    const { Database } = await import('@narada2/control-plane');
    const db = new Database(dbPath);
    const store = new SqliteTaskLifecycleStore({ db });
    return store;
  } catch {
    return null;
  }
}

function countUncheckedCriteria(body: string): {
  allChecked: boolean | null;
  unchecked: number;
} {
  const acMatch = body.match(/##\s*Acceptance Criteria\s*\n/i);
  if (!acMatch) {
    return { allChecked: null, unchecked: 0 };
  }
  const startIdx = acMatch.index! + acMatch[0].length;
  const nextHeading = body.slice(startIdx).match(/\n##\s/);
  const sectionEnd = nextHeading
    ? startIdx + nextHeading.index!
    : body.length;
  const section = body.slice(startIdx, sectionEnd);

  const items = section.match(/^\s*-\s+\[[xX ]\]/gm) ?? [];
  if (items.length === 0) {
    return { allChecked: null, unchecked: 0 };
  }
  const unchecked = items.filter((item) => item.includes('[ ]')).length;
  return { allChecked: unchecked === 0, unchecked };
}

/**
 * Inspect task evidence using a merged projection:
 * - SQLite provides lifecycle authority (status, assignments, reports, reviews)
 * - Markdown provides authored specification (criteria, execution notes, verification)
 *
 * Falls back to pure markdown inspection when the SQLite store is unavailable
 * or does not contain the task.
 *
 * @param store Optional pre-opened lifecycle store. When omitted, attempts to open
 *   the store at the standard path.
 */
export async function inspectTaskEvidenceWithProjection(
  cwd: string,
  taskNumber: string,
  store?: TaskLifecycleStore,
): Promise<TaskCompletionEvidence | null> {
  const taskFile = await findTaskFile(cwd, taskNumber);
  if (!taskFile) {
    return null;
  }

  const lifecycleStore = store ?? (await openTaskLifecycleStore(cwd));
  if (!lifecycleStore) {
    return null;
  }

  // Try to find the task in SQLite by task_number first, then by task_id
  let lifecycle = lifecycleStore.getLifecycleByNumber(Number(taskNumber));
  if (!lifecycle) {
    lifecycle = lifecycleStore.getLifecycle(taskFile.taskId);
  }

  if (!lifecycle) {
    return null;
  }

  // Read authored specification from markdown (always required)
  const { frontMatter, body } = await readTaskFile(taskFile.path);
  const criteria = countUncheckedCriteria(body);
  const hasExecutionNotes = /##\s*Execution Notes\s*\n/i.test(body);
  const hasVerification = /##\s*Verification\s*\n/i.test(body);

  // Read durable state from SQLite (authoritative)
  const assignments = lifecycleStore.getAssignments(taskFile.taskId);
  const activeAssignment = assignments.find((a) => a.released_at === null);
  const reports = lifecycleStore.listReports(taskFile.taskId);
  const reviews = lifecycleStore.listReviews(taskFile.taskId);

  const hasReport = reports.length > 0;
  const hasReview = reviews.length > 0;
  const hasAcceptedReview = reviews.some(
    (r) => r.verdict === 'accepted',
  );

  // Closure is authoritative from SQLite lifecycle row
  const hasClosure = lifecycle.closed_at !== null;

  // Derivatives are still filesystem-only (not in SQLite schema)
  const num = Number.isFinite(Number(taskNumber)) ? Number(taskNumber) : null;
  const hasDerivatives =
    num !== null ? await hasDerivativeFiles(cwd, num) : false;

  // Merge SQLite lifecycle into frontmatter for provenance checks
  const mergedFrontMatter = {
    ...frontMatter,
    status: lifecycle.status,
    closed_by: lifecycle.closed_by ?? frontMatter.closed_by,
    closed_at: lifecycle.closed_at ?? frontMatter.closed_at,
    reopened_by: lifecycle.reopened_by ?? frontMatter.reopened_by,
    reopened_at: lifecycle.reopened_at ?? frontMatter.reopened_at,
    governed_by: lifecycle.governed_by ?? frontMatter.governed_by,
  };

  const governedProvenance = hasGovernedProvenance(
    mergedFrontMatter,
    hasReview,
    hasClosure,
  );

  const warnings: string[] = [];
  const violations: string[] = [];

  // Determine verdict using merged data
  let verdict: TaskCompletionEvidence['verdict'] = 'incomplete';
  const status = lifecycle.status;
  const terminalStatuses: Array<string | undefined> = ['closed', 'confirmed'];
  const hasEvidence = hasReport || hasExecutionNotes;

  if (terminalStatuses.includes(status)) {
    if (!hasEvidence) {
      warnings.push(
        'Task is closed/confirmed but lacks execution evidence (report or notes)',
      );
      violations.push('terminal_without_execution_notes');
    }
    if (criteria.allChecked === false) {
      warnings.push(
        `Task is closed/confirmed but ${criteria.unchecked} acceptance criteria remain unchecked`,
      );
      violations.push('terminal_with_unchecked_criteria');
    }
    if (!hasVerification) {
      warnings.push('Task is closed/confirmed but lacks verification notes');
      violations.push('terminal_without_verification');
    }
    if (hasDerivatives) {
      warnings.push('Task is closed/confirmed but derivative task-status files exist');
      violations.push('terminal_with_derivative_files');
    }
    if (!governedProvenance) {
      warnings.push(
        'Task is terminal but lacks governed closure provenance; raw file mutation detected',
      );
      violations.push('terminal_without_governed_provenance');
    }
    if (!hasReview && !hasClosure && !(hasExecutionNotes && hasVerification)) {
      warnings.push(
        'Task is closed/confirmed without review or closure decision; direct closure requires execution notes and verification',
      );
    }
    verdict = warnings.length === 0 ? 'complete' : 'needs_closure';
  } else if (status === 'in_review') {
    if (!hasEvidence) {
      warnings.push('Task is in_review but lacks execution evidence');
    }
    if (criteria.allChecked === false) {
      warnings.push(`${criteria.unchecked} acceptance criteria remain unchecked`);
    }
    if (!hasReview) {
      warnings.push('Task is in_review but has no review artifact');
      verdict = hasEvidence ? 'needs_review' : 'incomplete';
    } else if (hasAcceptedReview) {
      verdict =
        hasEvidence && criteria.allChecked !== false ? 'needs_closure' : 'incomplete';
    } else {
      warnings.push('Task review was rejected; task needs additional work');
      verdict = 'incomplete';
    }
  } else if (
    status === 'opened' ||
    status === 'claimed' ||
    status === 'needs_continuation'
  ) {
    if (hasEvidence || hasReport) {
      verdict = 'attempt_complete';
      if (!hasExecutionNotes) {
        warnings.push('Task has report but no execution notes section');
      }
      if (criteria.allChecked === false) {
        warnings.push(`${criteria.unchecked} acceptance criteria remain unchecked`);
      }
    } else {
      if (criteria.allChecked === false) {
        warnings.push(`${criteria.unchecked} acceptance criteria remain unchecked`);
      }
      verdict = 'incomplete';
    }
  } else {
    verdict = 'unknown';
    warnings.push(`Unexpected task status: ${status ?? 'missing'}`);
  }

  return {
    task_number: num,
    task_id: taskFile.taskId,
    status,
    all_criteria_checked: criteria.allChecked,
    unchecked_count: criteria.unchecked,
    has_execution_notes: hasExecutionNotes,
    has_verification: hasVerification,
    has_report: hasReport,
    has_review: hasReview,
    has_closure: hasClosure,
    has_governed_provenance: governedProvenance,
    verdict,
    warnings,
    violations,
    active_assignment_intent: activeAssignment
      ? (activeAssignment.intent as AssignmentIntent)
      : null,
  };
}

/**
 * List runnable tasks using a merged projection:
 * - SQLite provides authoritative lifecycle state (status)
 * - Markdown provides authored specification (title, affinity, dependencies)
 *
 * Tasks present in both stores use the SQLite status. Tasks only in markdown
 * are included when their frontmatter status is runnable. Tasks only in SQLite
 * are included even when their markdown file is missing (title will be null).
 *
 * Falls back to null when the SQLite store is unavailable, so callers can
 * delegate to the pure-markdown `listRunnableTasks`.
 */
export async function listRunnableTasksWithProjection(
  cwd: string,
  store?: TaskLifecycleStore,
): Promise<RunnableTask[] | null> {
  const lifecycleStore = store ?? (await openTaskLifecycleStore(cwd));
  if (!lifecycleStore) {
    return null;
  }

  const resolvedCwd = resolve(cwd);
  const tasksDir = join(resolvedCwd, '.ai', 'tasks');

  // 1. Query SQLite for all tasks (not just runnable) so we can suppress
  // markdown entries when SQLite has a non-runnable status.
  const allSqliteRows = lifecycleStore.db
    .prepare('select task_id, task_number, status from task_lifecycle')
    .all() as Array<Record<string, unknown>>;

  const sqliteKnown = new Map<
    string,
    { task_id: string; task_number: number; status: TaskStatus }
  >();
  const sqliteRunnable = new Map<
    string,
    { task_id: string; task_number: number; status: TaskStatus }
  >();
  for (const row of allSqliteRows) {
    const taskId = String(row.task_id);
    const entry = {
      task_id: taskId,
      task_number: Number(row.task_number),
      status: String(row.status) as TaskStatus,
    };
    sqliteKnown.set(taskId, entry);
    if (entry.status === 'opened' || entry.status === 'claimed' || entry.status === 'needs_continuation') {
      sqliteRunnable.set(taskId, entry);
    }
  }

  // 2. Scan markdown for executable tasks
  let files: string[] = [];
  try {
    files = await readdir(tasksDir);
  } catch {
    return [];
  }

  const mdFiles = files.filter(isExecutableTaskFile);

  // 3. Build merged task list
  const allTaskInfos = new Map<number, ChapterTaskInfo>();
  const rawTasks: Array<{ info: ChapterTaskInfo; title: string | null }> = [];

  // Process SQLite tasks first (authoritative status)
  for (const [taskId, lifecycle] of sqliteRunnable) {
    const filePath = join(tasksDir, `${taskId}.md`);
    let frontMatter: import('./task-governance.js').TaskFrontMatter = {};
    let body = '';
    let title: string | null = null;

    try {
      const parsed = await readTaskFile(filePath);
      frontMatter = parsed.frontMatter;
      body = parsed.body;
      const titleMatch = body.match(/^#\s+(.+)$/m);
      title = titleMatch ? titleMatch[1].trim() : null;
    } catch {
      // Markdown file missing — include task with null title
    }

    const numMatch = taskId.match(/-(\d+)-/);
    const taskNumber = numMatch
      ? Number(numMatch[1])
      : (typeof frontMatter.task_id === 'number' ? frontMatter.task_id : null);

    const info: ChapterTaskInfo = {
      taskId,
      taskNumber: Number.isFinite(taskNumber) ? taskNumber : null,
      status: lifecycle.status,
      fileName: `${taskId}.md`,
      dependsOn: frontMatter.depends_on as number[] | undefined,
      continuationAffinity: frontMatter.continuation_affinity as
        | TaskContinuationAffinity
        | undefined,
    };

    if (info.taskNumber !== null) {
      allTaskInfos.set(info.taskNumber, info);
    }
    rawTasks.push({ info, title });
  }

  // Process markdown-only tasks with runnable status
  for (const f of mdFiles) {
    const base = f.replace(/\.md$/, '');
    if (sqliteKnown.has(base)) continue;

    const content = await readFile(join(tasksDir, f), 'utf8');
    const { frontMatter, body } = parseFrontMatter(content);
    const status = frontMatter.status as string | undefined;

    if (status !== 'opened' && status !== 'needs_continuation') continue;

    const numMatch = base.match(/-(\d+)-/);
    const taskNumber = numMatch
      ? Number(numMatch[1])
      : (typeof frontMatter.task_id === 'number' ? frontMatter.task_id : null);
    const titleMatch = body.match(/^#\s+(.+)$/m);

    const info: ChapterTaskInfo = {
      taskId: base,
      taskNumber: Number.isFinite(taskNumber) ? taskNumber : null,
      status,
      fileName: f,
      dependsOn: frontMatter.depends_on as number[] | undefined,
      continuationAffinity: frontMatter.continuation_affinity as
        | TaskContinuationAffinity
        | undefined,
    };

    if (info.taskNumber !== null) {
      allTaskInfos.set(info.taskNumber, info);
    }
    rawTasks.push({ info, title: titleMatch ? titleMatch[1].trim() : null });
  }

  // Compute affinity for each task
  const result: RunnableTask[] = [];
  for (const { info, title } of rawTasks) {
    const affinity = await computeTaskAffinity(resolvedCwd, info, allTaskInfos);
    result.push({
      taskId: info.taskId,
      taskNumber: info.taskNumber,
      status: info.status!,
      title,
      affinity,
    });
  }

  // Sort: higher affinity first, then by task number
  result.sort((a, b) => {
    if (b.affinity.affinity_strength !== a.affinity.affinity_strength) {
      return b.affinity.affinity_strength - a.affinity.affinity_strength;
    }
    return (a.taskNumber ?? 0) - (b.taskNumber ?? 0);
  });

  return result;
}
