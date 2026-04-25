/**
 * Task read operator.
 *
 * Canonical observation operator for reading a single task.
 * Merges authoritative lifecycle state from SQLite with authored
 * specification from markdown. The caller never needs to know which
 * substrate provided which field.
 *
 * Read-only: no mutations.
 */

import { resolve } from 'node:path';
import {
  findTaskFile,
  readTaskFile,
  listReportsForTask,
  listReviewsForTask,
  listClosureDecisionsForTask,
  hasDerivativeFiles,
  hasGovernedProvenance,
  loadAssignment,
  getActiveAssignment,
  getAssignmentIntent,
  type TaskFrontMatter,
} from '../lib/task-governance.js';
import { openTaskLifecycleStore } from '../lib/task-projection.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  extractProjectionSections,
  mergeAcceptanceCriteriaState,
} from '../lib/task-spec.js';

export interface TaskReadOptions {
  taskNumber: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
  verbose?: boolean;
}

export interface TaskReadResult {
  task_id: string;
  task_number: number | null;
  title: string;
  status: string | undefined;
  goal: string | null;
  context: string | null;
  required_work: string | null;
  non_goals: string | null;
  acceptance_criteria: Array<{ text: string; checked: boolean }>;
  execution_notes: string | null;
  verification: string | null;
  dependencies: number[];
  assignment: {
    agent_id: string | null;
    intent: string | null;
    claimed_at: string | null;
  } | null;
  reports: Array<{ report_id: string; agent_id: string; submitted_at: string }>;
  reviews: Array<{ review_id: string; reviewer_agent_id: string; verdict: string }>;
  closure: {
    closed_at: string | null;
    closed_by: string | null;
    governed_by: string | null;
  } | null;
  evidence: {
    has_execution_notes: boolean;
    has_verification: boolean;
    has_report: boolean;
    has_review: boolean;
    has_closure: boolean;
    has_governed_provenance: boolean;
    all_criteria_checked: boolean | null;
    unchecked_count: number;
  };
  warnings: string[];
}

function countUncheckedCriteria(
  items: Array<{ text: string; checked: boolean }>,
): { allChecked: boolean | null; unchecked: number } {
  if (items.length === 0) return { allChecked: null, unchecked: 0 };
  const unchecked = items.filter((i) => !i.checked).length;
  return { allChecked: unchecked === 0, unchecked };
}

function truncate(text: string | null, maxLines: number): string | null {
  if (!text) return null;
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n') + `\n… (${lines.length - maxLines} more lines)`;
}

export async function taskReadCommand(
  options: TaskReadOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;

  if (!taskNumber || !Number.isFinite(Number(taskNumber))) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Invalid or missing task number' },
    };
  }

  const taskNum = Number(taskNumber);
  const taskFile = await findTaskFile(cwd, taskNumber);

  const store = await openTaskLifecycleStore(cwd);
  const lifecycleByNumber = store ? store.getLifecycleByNumber(taskNum) : undefined;
  const specByNumber = store ? store.getTaskSpecByNumber(taskNum) : undefined;

  if (!taskFile && !lifecycleByNumber && !specByNumber) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Task ${taskNumber} not found` },
    };
  }

  const taskId = taskFile?.taskId ?? lifecycleByNumber?.task_id ?? specByNumber?.task_id ?? `task-${taskNumber}`;
  const taskNumberValue = taskFile ? taskNum : (lifecycleByNumber?.task_number ?? specByNumber?.task_number ?? null);
  let frontMatter: TaskFrontMatter = {};
  let body = '';
  if (taskFile) {
    const read = await readTaskFile(taskFile.path);
    frontMatter = read.frontMatter;
    body = read.body;
  }

  const specRow = specByNumber ?? (store ? store.getTaskSpec(taskId) : undefined);
  if (!specRow) {
    if (store) {
      try { store.db.close(); } catch { /* ignore */ }
    }
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Task ${taskNumber} has no SQLite-backed task spec` },
    };
  }

  const projectionSections = extractProjectionSections(body);
  const specCriteria = specRow ? JSON.parse(specRow.acceptance_criteria_json) as string[] : [];
  const acceptanceCriteria = mergeAcceptanceCriteriaState(
    specCriteria,
    projectionSections.acceptanceCriteriaState,
  );

  // Lifecycle state — prefer SQLite, fallback to markdown
  let status: string | undefined;
  let sqliteLifecycle: {
    closed_at: string | null;
    closed_by: string | null;
    governed_by: string | null;
  } | null = null;
  let sqliteAssignments: Array<{
    assignment_id: string;
    agent_id: string;
    claimed_at: string;
    released_at: string | null;
    intent: string;
  }> = [];
  let sqliteReports: Array<{
    report_id: string;
    agent_id: string;
    submitted_at: string;
  }> = [];
  let sqliteReviews: Array<{
    review_id: string;
    reviewer_agent_id: string;
    verdict: string;
  }> = [];

  if (store) {
    try {
      const lifecycle = store.getLifecycleByNumber(taskNum) ?? store.getLifecycle(taskId);
      if (lifecycle) {
        status = lifecycle.status;
        sqliteLifecycle = {
          closed_at: lifecycle.closed_at,
          closed_by: lifecycle.closed_by,
          governed_by: lifecycle.governed_by,
        };
      }
      sqliteAssignments = store.getAssignments(taskId);
      sqliteReports = store.listReports(taskId);
      sqliteReviews = store.listReviews(taskId);
    } catch {
      // SQLite error — fall through to markdown
    } finally {
      try { store.db.close(); } catch { /* ignore */ }
    }
  }

  // Fallback to markdown front matter if SQLite has no record
  if (status === undefined) {
    status = frontMatter.status as string | undefined;
  }

  const dependsOn = JSON.parse(specRow.dependencies_json) as number[];

  // Assignment state
  let assignment: TaskReadResult['assignment'] = null;
  const activeSqliteAssignment = sqliteAssignments.find((a) => a.released_at === null);
  if (activeSqliteAssignment) {
    assignment = {
      agent_id: activeSqliteAssignment.agent_id,
      intent: activeSqliteAssignment.intent,
      claimed_at: activeSqliteAssignment.claimed_at,
    };
  } else {
    const assignmentRecord = await loadAssignment(cwd, taskId);
    if (assignmentRecord) {
      const active = getActiveAssignment(assignmentRecord);
      if (active) {
        assignment = {
          agent_id: active.agent_id,
          intent: getAssignmentIntent(active),
          claimed_at: active.claimed_at,
        };
      }
    }
  }

  // Reports
  const reports: TaskReadResult['reports'] = sqliteReports.length > 0
    ? sqliteReports.map((r) => ({ report_id: r.report_id, agent_id: r.agent_id, submitted_at: r.submitted_at }))
    : (await listReportsForTask(cwd, taskId)).map((r) => ({
        report_id: r.report_id,
        agent_id: r.agent_id,
        submitted_at: r.reported_at,
      }));

  // Reviews
  const reviews: TaskReadResult['reviews'] = sqliteReviews.length > 0
    ? sqliteReviews.map((r) => ({ review_id: r.review_id, reviewer_agent_id: r.reviewer_agent_id, verdict: r.verdict }))
    : (await listReviewsForTask(cwd, taskId)).map((r) => ({
        review_id: r.review_id,
        reviewer_agent_id: r.reviewer_agent_id,
        verdict: r.verdict,
      }));

  // Closure
  const num = taskNumberValue;
  const closures = num !== null ? await listClosureDecisionsForTask(cwd, num) : [];
  const hasClosure = sqliteLifecycle
    ? sqliteLifecycle.closed_at !== null
    : closures.length > 0;

  const closure: TaskReadResult['closure'] = sqliteLifecycle
    ? {
        closed_at: sqliteLifecycle.closed_at,
        closed_by: sqliteLifecycle.closed_by,
        governed_by: sqliteLifecycle.governed_by,
      }
    : (closures.length > 0
        ? { closed_at: null, closed_by: null, governed_by: null }
        : null);

  // Evidence posture
  const criteria = countUncheckedCriteria(acceptanceCriteria);
  const hasExecutionNotes = projectionSections.executionNotes !== null;
  const hasVerification = projectionSections.verification !== null;
  const hasReport = reports.length > 0;
  const hasReview = reviews.length > 0;

  const mergedFrontMatter: TaskFrontMatter = {
    ...frontMatter,
    status,
    closed_by: sqliteLifecycle?.closed_by ?? frontMatter.closed_by,
    closed_at: sqliteLifecycle?.closed_at ?? frontMatter.closed_at,
    governed_by: sqliteLifecycle?.governed_by ?? frontMatter.governed_by,
  };

  const hasDerivatives = num !== null ? await hasDerivativeFiles(cwd, num) : false;
  const governedProvenance = hasGovernedProvenance(mergedFrontMatter, hasReview, hasClosure, status);

  const warnings: string[] = [];
  if (status === 'closed' || status === 'confirmed') {
    if (criteria.allChecked === false) {
      warnings.push(`${criteria.unchecked} acceptance criteria remain unchecked`);
    }
    if (!hasExecutionNotes) {
      warnings.push('Task is terminal but lacks execution notes');
    }
    if (!hasVerification) {
      warnings.push('Task is terminal but lacks verification notes');
    }
    if (!governedProvenance) {
      warnings.push('Task is terminal but lacks governed closure provenance');
    }
    if (hasDerivatives) {
      warnings.push('Derivative task-status files exist');
    }
  }

  const result: TaskReadResult = {
    task_id: taskId,
    task_number: num,
    title: specRow?.title ?? taskId,
    status,
    goal: specRow?.goal_markdown ?? null,
    context: specRow?.context_markdown ?? null,
    required_work: specRow?.required_work_markdown ?? null,
    non_goals: specRow?.non_goals_markdown ?? null,
    acceptance_criteria: acceptanceCriteria,
    execution_notes: projectionSections.executionNotes,
    verification: projectionSections.verification,
    dependencies: dependsOn,
    assignment,
    reports,
    reviews,
    closure,
    evidence: {
      has_execution_notes: hasExecutionNotes,
      has_verification: hasVerification,
      has_report: hasReport,
      has_review: hasReview,
      has_closure: hasClosure,
      has_governed_provenance: governedProvenance,
      all_criteria_checked: criteria.allChecked,
      unchecked_count: criteria.unchecked,
    },
    warnings,
  };

  const format = options.format === 'json' ? 'json' : 'human';

  if (format === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'ok',
        task: result,
      },
    };
  }

  // Human output — structured but concise
  const lines: string[] = [
    `${result.title}`,
    '',
  ];

  lines.push(`  Task:        ${result.task_number ?? result.task_id}`);
  lines.push(`  Status:      ${result.status ?? 'unknown'}`);
  if (result.assignment?.agent_id) {
    lines.push(`  Assigned:    ${result.assignment.agent_id} (${result.assignment.intent ?? 'primary'})`);
  }
  if (result.dependencies.length > 0) {
    lines.push(`  Depends on:  ${result.dependencies.join(', ')}`);
  }
  lines.push('');

  if (result.goal) {
    lines.push('Goal:');
    const goalText = options.verbose ? result.goal : truncate(result.goal, 5);
    for (const line of (goalText ?? '').split('\n')) {
      lines.push(`  ${line}`);
    }
    lines.push('');
  }

  if (result.context && options.verbose) {
    lines.push('Context:');
    for (const line of result.context.split('\n')) {
      lines.push(`  ${line}`);
    }
    lines.push('');
  }

  if (result.required_work) {
    lines.push('Required Work:');
    const workText = options.verbose ? result.required_work : truncate(result.required_work, 8);
    for (const line of (workText ?? '').split('\n')) {
      lines.push(`  ${line}`);
    }
    lines.push('');
  }

  if (result.non_goals && options.verbose) {
    lines.push('Non-Goals:');
    for (const line of result.non_goals.split('\n')) {
      lines.push(`  ${line}`);
    }
    lines.push('');
  }

  if (result.acceptance_criteria.length > 0) {
    lines.push('Acceptance Criteria:');
    for (const ac of result.acceptance_criteria) {
      const mark = ac.checked ? '[x]' : '[ ]';
      lines.push(`  ${mark} ${ac.text}`);
    }
    lines.push('');
  }

  // Evidence summary
  lines.push('Evidence:');
  lines.push(`  Execution notes: ${result.evidence.has_execution_notes ? 'yes' : 'no'}`);
  lines.push(`  Verification:    ${result.evidence.has_verification ? 'yes' : 'no'}`);
  lines.push(`  Report:          ${result.evidence.has_report ? 'yes' : 'no'}`);
  lines.push(`  Review:          ${result.evidence.has_review ? 'yes' : 'no'}`);
  lines.push(`  Closure:         ${result.evidence.has_closure ? 'yes' : 'no'}`);
  if (result.evidence.all_criteria_checked !== null) {
    lines.push(`  Criteria:        ${result.evidence.unchecked_count === 0 ? 'all checked' : `${result.evidence.unchecked_count} unchecked`}`);
  }
  lines.push('');

  if (result.reports.length > 0) {
    lines.push(`Reports (${result.reports.length}):`);
    for (const r of result.reports) {
      lines.push(`  ${r.report_id} by ${r.agent_id} at ${r.submitted_at}`);
    }
    lines.push('');
  }

  if (result.reviews.length > 0) {
    lines.push(`Reviews (${result.reviews.length}):`);
    for (const r of result.reviews) {
      lines.push(`  ${r.review_id} by ${r.reviewer_agent_id}: ${r.verdict}`);
    }
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push('Warnings:');
    for (const w of result.warnings) {
      lines.push(`  ⚠ ${w}`);
    }
    lines.push('');
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: lines.join('\n'),
  };
}
