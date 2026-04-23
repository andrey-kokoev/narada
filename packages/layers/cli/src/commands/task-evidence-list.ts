/**
 * Evidence-based task list operator.
 *
 * Read-only: lists tasks classified by completion evidence.
 * Does not mutate any state.
 */

import { resolve } from 'node:path';
import { listEvidenceBasedTasks, type TaskCompletionEvidence } from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export type EvidenceVerdict = TaskCompletionEvidence['verdict'];

export interface TaskEvidenceListOptions {
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
  verdict?: string;
  status?: string;
  range?: string;
}

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

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        count: tasks.length,
        filter: {
          verdict: verdictFilter ?? NOT_COMPLETE_VERDICTS,
          status: statusFilter ?? null,
          range: rangeFilter ?? null,
        },
        tasks: tasks.map((t) => ({
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
        })),
      },
    };
  }

  if (tasks.length === 0) {
    fmt.message('No tasks match the evidence filter', 'info');
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'success', count: 0, tasks: [] },
    };
  }

  const filterDesc = options.verdict
    ? `verdict=${options.verdict}`
    : 'not-complete';
  fmt.section(`Evidence-Based Task List (${tasks.length}) — ${filterDesc}`);

  const rows = tasks.map((t) => {
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

  // Show warnings/violations summary if any
  const tasksWithIssues = tasks.filter((t) => t.warnings.length > 0 || t.violations.length > 0);
  if (tasksWithIssues.length > 0) {
    console.log('');
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
      filter: {
        verdict: verdictFilter ?? NOT_COMPLETE_VERDICTS,
        status: statusFilter ?? null,
        range: rangeFilter ?? null,
      },
      tasks: tasks.map((t) => ({
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
      })),
    },
  };
}
