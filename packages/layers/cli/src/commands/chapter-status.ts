/**
 * Chapter status inspection operator.
 *
 * Derives chapter state from task statuses in a numeric range.
 * Pure read — no mutations. No persistent chapter state file is created.
 */

import { resolve, join } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { scanTasksByRange, lintTaskFiles, type ChapterTaskInfo } from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface ChapterStatusOptions {
  range: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export type ChapterState =
  | 'proposed'
  | 'shaped'
  | 'executing'
  | 'review_ready'
  | 'closing'
  | 'closed'
  | 'committed';

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

function deriveChapterState(
  tasks: ChapterTaskInfo[],
  rangeStart: number,
  rangeEnd: number,
  closureDraftExists: boolean,
  closureDecisionExists: boolean,
  closureDecisionAgeHours: number | null,
): ChapterState {
  if (tasks.length === 0) return 'proposed';

  const activeStatuses = new Set(['claimed', 'in_progress', 'needs_continuation', 'in_review']);
  const terminalStatuses = new Set(['closed', 'accepted', 'deferred', 'confirmed']);

  const allExist = tasks.length === rangeEnd - rangeStart + 1;
  const hasActive = tasks.some((t) => activeStatuses.has(t.status ?? ''));
  const allTerminal = tasks.every((t) => terminalStatuses.has(t.status ?? ''));

  if (closureDecisionExists && closureDecisionAgeHours !== null && closureDecisionAgeHours >= 24) {
    return 'committed';
  }
  if (closureDecisionExists) {
    return 'closed';
  }
  if (closureDraftExists) {
    return 'closing';
  }
  if (allTerminal) {
    return 'review_ready';
  }
  if (hasActive) {
    return 'executing';
  }
  if (allExist) {
    return 'shaped';
  }
  return 'proposed';
}

export async function chapterStatusCommand(
  options: ChapterStatusOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const range = parseRange(options.range);

  if (!range) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Invalid range format: ${options.range}. Expected NNN or NNN-MMM.` },
    };
  }

  const tasks = await scanTasksByRange(cwd, range.start, range.end);

  // Count by status
  const counts: Record<string, number> = {};
  for (const task of tasks) {
    const s = task.status ?? 'unknown';
    counts[s] = (counts[s] || 0) + 1;
  }

  // Find blockers: tasks in range with non-terminal status
  const blockers = tasks
    .filter((t) => !['closed', 'accepted', 'deferred', 'confirmed'].includes(t.status ?? ''))
    .map((t) => ({ task_number: t.taskNumber, task_id: t.taskId, status: t.status }));

  // Check for closure decision artifacts
  const decisionsDir = join(cwd, '.ai', 'decisions');
  let closureDraftExists = false;
  let closureDecisionExists = false;
  let closureDecisionAgeHours: number | null = null;

  try {
    const decisionFiles = await readdir(decisionsDir);
    const rangeSlug = `${range.start}-${range.end}`;
    for (const f of decisionFiles) {
      if (!f.endsWith('.md')) continue;
      if (f.includes(rangeSlug) && f.includes('chapter-closure')) {
        if (f.includes('draft')) {
          closureDraftExists = true;
        } else {
          const filePath = join(decisionsDir, f);
          const content = await readFile(filePath, 'utf8');
          const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (frontMatterMatch) {
            const fm = frontMatterMatch[1];
            if (fm.includes('status: accepted')) {
              closureDecisionExists = true;
              const s = await stat(filePath);
              closureDecisionAgeHours = (Date.now() - s.mtimeMs) / (1000 * 60 * 60);
            } else if (!f.includes('draft')) {
              // Non-draft, non-accepted = draft-level artifact
              closureDraftExists = true;
            }
          } else {
            // No front matter — treat as draft
            closureDraftExists = true;
          }
        }
      }
    }
  } catch {
    // Decisions dir may not exist
  }

  const state = deriveChapterState(
    tasks,
    range.start,
    range.end,
    closureDraftExists,
    closureDecisionExists,
    closureDecisionAgeHours,
  );

  // Check for tasks outside declared range that reference this range
  const warnings: string[] = [];
  if (tasks.length > 0 && tasks.length !== range.end - range.start + 1) {
    const expectedCount = range.end - range.start + 1;
    warnings.push(`Expected ${expectedCount} tasks in range, found ${tasks.length}`);
  }

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        range: `${range.start}-${range.end}`,
        state,
        tasks_found: tasks.length,
        counts,
        blockers,
        closure_draft_exists: closureDraftExists,
        closure_decision_exists: closureDecisionExists,
        closure_decision_age_hours: closureDecisionAgeHours,
        warnings,
      },
    };
  }

  fmt.section(`Chapter Status: ${range.start}–${range.end}`);
  fmt.kv('State', state);
  fmt.kv('Tasks in range', String(tasks.length));
  if (Object.keys(counts).length > 0) {
    fmt.message('Status breakdown:', 'info');
    for (const [status, count] of Object.entries(counts)) {
      fmt.kv(`  ${status}`, String(count), { indent: 4 });
    }
  }
  if (blockers.length > 0) {
    fmt.message(`Blockers (${blockers.length} non-terminal task(s)):`, 'warning');
    for (const b of blockers) {
      fmt.message(`  - Task ${b.task_number} (${b.task_id}): ${b.status}`, 'warning');
    }
  }
  if (closureDraftExists) {
    fmt.message('Closure decision draft exists', 'info');
  }
  if (closureDecisionExists) {
    const ageStr = closureDecisionAgeHours !== null
      ? ` (${closureDecisionAgeHours.toFixed(1)}h old)`
      : '';
    fmt.message(`Closure decision accepted${ageStr}`, 'success');
  }
  for (const w of warnings) {
    fmt.message(w, 'warning');
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      range: `${range.start}-${range.end}`,
      state,
      tasks_found: tasks.length,
      counts,
      blockers,
      closure_draft_exists: closureDraftExists,
      closure_decision_exists: closureDecisionExists,
      closure_decision_age_hours: closureDecisionAgeHours,
      warnings,
    },
  };
}
