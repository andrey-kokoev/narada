/**
 * Evidence-based task list operator.
 *
 * Read-only: lists tasks classified by completion evidence.
 * Does not mutate any state.
 */

import { resolve } from 'node:path';
import {
  listEvidenceBasedTasks,
  type TaskCompletionEvidence,
  type EvidenceBasedTaskEntry,
} from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { createObservationArtifact } from '../lib/observation-artifact.js';

export type EvidenceVerdict = TaskCompletionEvidence['verdict'];

export interface TaskEvidenceListOptions {
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
  verdict?: string;
  status?: string;
  range?: string;
  limit?: string | number;
  full?: boolean;
}

export interface TaskEvidenceAssertCompleteOptions {
  range: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

interface TaskEvidenceAssertCompleteResult {
  status: 'success' | 'error';
  range: { start: number; end: number };
  checked_count: number;
  incomplete_count: number;
  tasks: Array<{
    task_number: number | null;
    task_id: string;
    status: string | null;
    verdict: EvidenceVerdict;
    unchecked_criteria: number;
    warnings: string[];
    violations: string[];
  }>;
}

const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 100;

const ALL_VERDICTS: EvidenceVerdict[] = [
  'complete',
  'attempt_complete',
  'needs_review',
  'needs_closure',
  'incomplete',
  'unknown',
];

const NOT_COMPLETE_VERDICTS: EvidenceVerdict[] = [
  'incomplete',
  'attempt_complete',
  'needs_review',
  'needs_closure',
];

function parseVerdictFilter(input: string | undefined): EvidenceVerdict[] | undefined {
  if (!input) return undefined;
  const parts = input.split(',').map((s) => s.trim());
  const valid = parts.filter((p): p is EvidenceVerdict => ALL_VERDICTS.includes(p as EvidenceVerdict));
  return valid.length > 0 ? valid : undefined;
}

function parseStatusFilter(input: string | undefined): string[] | undefined {
  if (!input) return undefined;
  return input.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseRangeFilter(input: string | undefined): { start: number; end: number } | undefined {
  if (!input) return undefined;
  const match = input.match(/^(\d+)-(\d+)$/);
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start > end) return undefined;
  return { start, end };
}

function parseRequiredRange(input: string): { start: number; end: number } | null {
  return parseRangeFilter(input) ?? null;
}

function isNumberedTaskId(taskId: string, taskNumber: number): boolean {
  return new RegExp(`^[0-9]{8}-${taskNumber}(?!-[0-9]+)-`).test(taskId);
}

function parseLimit(input: string | number | undefined): number {
  if (typeof input === 'number' && Number.isInteger(input) && input > 0) {
    return Math.min(input, MAX_LIST_LIMIT);
  }
  if (typeof input === 'string') {
    const parsed = Number.parseInt(input, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return Math.min(parsed, MAX_LIST_LIMIT);
    }
  }
  return DEFAULT_LIST_LIMIT;
}

function buildVerdictSummary(tasks: Array<{ verdict: EvidenceVerdict }>): Record<EvidenceVerdict, number> {
  const summary = Object.fromEntries(ALL_VERDICTS.map((verdict) => [verdict, 0])) as Record<
    EvidenceVerdict,
    number
  >;
  for (const task of tasks) {
    summary[task.verdict] += 1;
  }
  return summary;
}

function serializeTaskEvidence(t: EvidenceBasedTaskEntry) {
  return {
    task_number: t.task_number,
    task_id: t.task_id,
    title: t.title,
    status: t.status,
    verdict: t.verdict,
    missing: {
      unchecked_criteria: t.unchecked_count,
      execution_notes: !t.has_execution_notes,
      verification: !t.has_verification,
      report: !t.has_report,
      review: !t.has_review,
      closure: !t.has_closure,
    },
    warnings: t.warnings,
    violations: t.violations,
    assigned_agent: t.assigned_agent,
    active_assignment_intent: t.active_assignment_intent,
  };
}

export async function taskEvidenceListCommand(
  options: TaskEvidenceListOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  const verdictFilter = parseVerdictFilter(options.verdict);
  const statusFilter = parseStatusFilter(options.status);
  const rangeFilter = parseRangeFilter(options.range);

  let tasks;
  try {
    tasks = await listEvidenceBasedTasks(cwd, {
      verdictFilter,
      statusFilter,
      rangeFilter,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to list tasks by evidence: ${msg}` },
    };
  }

  const full = options.full === true;
  const limit = full ? tasks.length : parseLimit(options.limit);
  const visibleTasks = full ? tasks : tasks.slice(0, limit);
  const truncated = visibleTasks.length < tasks.length;
  const verdictSummary = buildVerdictSummary(tasks);
  const filter = {
    verdict: verdictFilter ?? NOT_COMPLETE_VERDICTS,
    status: statusFilter ?? null,
    range: rangeFilter ?? null,
  };
  const fullPayload = {
    status: 'success',
    count: tasks.length,
    filter,
    summary: { verdicts: verdictSummary },
    tasks: tasks.map(serializeTaskEvidence),
  };
  const observation = await createObservationArtifact({
    cwd,
    artifactType: 'task_evidence_list',
    sourceOperator: 'task_evidence_list',
    extension: 'json',
    content: JSON.stringify(fullPayload, null, 2),
    admittedView: {
      count: tasks.length,
      returned_count: visibleTasks.length,
      truncated,
      limit: full ? null : limit,
      filter,
      summary: { verdicts: verdictSummary },
    },
  });

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        count: tasks.length,
        returned_count: visibleTasks.length,
        truncated,
        limit: full ? null : limit,
        full,
        filter,
        summary: {
          verdicts: verdictSummary,
        },
        observation: observation.view,
        tasks: visibleTasks.map(serializeTaskEvidence),
      },
    };
  }

  if (tasks.length === 0) {
    fmt.message('No tasks match the evidence filter', 'info');
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'success', count: 0, returned_count: 0, truncated: false, tasks: [] },
    };
  }

  const filterDesc = options.verdict
    ? `verdict=${options.verdict}`
    : 'not-complete';
  const title = truncated
    ? `Evidence-Based Task List (${visibleTasks.length} of ${tasks.length}) — ${filterDesc}`
    : `Evidence-Based Task List (${tasks.length}) — ${filterDesc}`;
  fmt.section(title);

  const rows = visibleTasks.map((t) => {
    const missingFlags: string[] = [];
    if (t.unchecked_count > 0) missingFlags.push(`-${t.unchecked_count} criteria`);
    if (!t.has_execution_notes) missingFlags.push('no-notes');
    if (!t.has_verification) missingFlags.push('no-verify');
    if (!t.has_report) missingFlags.push('no-report');
    if (!t.has_review) missingFlags.push('no-review');
    if (!t.has_closure) missingFlags.push('no-closure');

    const flagStr = missingFlags.length > 0 ? missingFlags.join(', ') : '—';
    const agentStr = t.assigned_agent ?? '—';

    // Highlight closed-but-invalid
    const statusDisplay =
      (t.status === 'closed' || t.status === 'confirmed') && t.verdict !== 'complete'
        ? `${t.status} ⚠`
        : t.status ?? '—';

    return {
      task: t.task_number?.toString() ?? t.task_id,
      status: statusDisplay,
      verdict: t.verdict,
      title: t.title ?? '—',
      missing: flagStr,
      agent: agentStr,
    };
  });

  fmt.table(
    [
      { key: 'task' as const, label: 'Task', width: 6 },
      { key: 'status' as const, label: 'Status', width: 14 },
      { key: 'verdict' as const, label: 'Verdict', width: 16 },
      { key: 'title' as const, label: 'Title', width: 28 },
      { key: 'missing' as const, label: 'Missing', width: 24 },
      { key: 'agent' as const, label: 'Agent', width: 8 },
    ],
    rows,
  );

  if (truncated) {
    fmt.message(
      `Showing ${visibleTasks.length} of ${tasks.length} tasks. Use --full for the complete list or --limit <n> to adjust the preview.`,
      'info',
    );
  }
  fmt.kv('Observation artifact', observation.view.artifact_uri);

  // Show warnings/violations summary if any
  const tasksWithIssues = visibleTasks.filter((t) => t.warnings.length > 0 || t.violations.length > 0);
  if (tasksWithIssues.length > 0) {
    fmt.message('');
    for (const t of tasksWithIssues) {
      const label = t.task_number?.toString() ?? t.task_id;
      for (const v of t.violations) {
        fmt.message(`Task ${label}: ${v}`, 'error');
      }
      for (const w of t.warnings) {
        fmt.message(`Task ${label}: ${w}`, 'warning');
      }
    }
  }

  return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        count: tasks.length,
        returned_count: visibleTasks.length,
        truncated,
        limit: full ? null : limit,
        full,
        filter,
        summary: {
          verdicts: verdictSummary,
        },
        observation: observation.view,
        tasks: visibleTasks.map(serializeTaskEvidence),
      },
  };
}

export async function taskEvidenceAssertCompleteCommand(
  options: TaskEvidenceAssertCompleteOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const range = parseRequiredRange(options.range);

  if (!range) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Invalid range. Expected <start>-<end>.' },
    };
  }

  let tasks: EvidenceBasedTaskEntry[];
  try {
    tasks = await listEvidenceBasedTasks(cwd, {
      verdictFilter: ALL_VERDICTS,
      rangeFilter: range,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to inspect task range: ${msg}` },
    };
  }

  const rangeTaskMap = new Map<string, EvidenceBasedTaskEntry>();
  for (const task of tasks) {
    if (task.task_number === null) continue;
    if (task.task_number < range.start || task.task_number > range.end) continue;
    if (!isNumberedTaskId(task.task_id, task.task_number)) continue;
    rangeTaskMap.set(task.task_id, task);
  }
  const rangeTasks = Array.from(rangeTaskMap.values()).sort((a, b) => (a.task_number ?? 0) - (b.task_number ?? 0));
  const incomplete = rangeTasks.filter((task) => task.verdict !== 'complete');
  const rows = incomplete.map((task) => ({
    task_number: task.task_number,
    task_id: task.task_id,
    status: task.status ?? null,
    verdict: task.verdict,
    unchecked_criteria: task.unchecked_count,
    warnings: task.warnings.slice(0, 3),
    violations: task.violations.slice(0, 3),
  }));
  const ok = incomplete.length === 0;
  const result: TaskEvidenceAssertCompleteResult = {
    status: ok ? 'success' : 'error',
    range,
    checked_count: rangeTasks.length,
    incomplete_count: incomplete.length,
    tasks: rows,
  };

  if (options.format === 'json') {
    return {
      exitCode: ok ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result,
    };
  }

  const formatted = ok
    ? `Range ${range.start}-${range.end} complete (${rangeTasks.length} tasks checked)`
    : [
        `Range ${range.start}-${range.end} has ${incomplete.length} incomplete task(s)`,
        'Task  Status        Verdict          Unchecked',
        '----  ------------  ---------------  ---------',
        ...rows.map((task) =>
          `${String(task.task_number ?? task.task_id).padEnd(4)}  ${(task.status ?? 'missing').padEnd(12)}  ${task.verdict.padEnd(15)}  ${task.unchecked_criteria}`,
        ),
      ].join('\n');

  return {
    exitCode: ok ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: { ...result, _formatted: formatted },
  };
}
