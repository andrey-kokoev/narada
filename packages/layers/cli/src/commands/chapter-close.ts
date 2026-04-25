/**
 * Chapter closure operator.
 *
 * Supports two modes:
 * 1. Legacy chapter-name mode (backward compatible)
 * 2. Range-based mode with --start, --finish, --reopen
 *
 * Enumerates tasks, verifies terminal status, generates closure artifacts,
 * and transitions closed tasks to confirmed.
 */

import { resolve, join } from 'node:path';
import {
  scanTasksByChapter,
  scanTasksByRange,
  readTaskFile,
  writeTaskFile,
  findTaskFile,
  listReviewsForTask,
  atomicWriteFile,
  extractChapter,
  inspectTaskEvidence,
  type ChapterTaskInfo,
} from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { readdir, readFile, stat } from 'node:fs/promises';

export interface ChapterCloseOptions {
  chapterName?: string;
  range?: string;
  start?: boolean;
  finish?: boolean;
  reopen?: boolean;
  template?: string;
  by?: string;
  reason?: string;
  format?: 'json' | 'human' | 'auto';
  dryRun?: boolean;
  cwd?: string;
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

function isTerminalStatus(status: string | undefined): boolean {
  return status === 'closed' || status === 'accepted' || status === 'deferred' || status === 'confirmed';
}

async function findClosureDecisionPaths(
  cwd: string,
  rangeSlug: string,
): Promise<{ draftPath: string | null; decisionPath: string | null }> {
  const decisionsDir = join(cwd, '.ai', 'decisions');
  let draftPath: string | null = null;
  let decisionPath: string | null = null;

  try {
    const files = await readdir(decisionsDir);
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      if (!f.includes(rangeSlug) || !f.includes('chapter-closure')) continue;

      if (f.includes('draft')) {
        draftPath = join(decisionsDir, f);
      } else {
        const content = await readFile(join(decisionsDir, f), 'utf8');
        const fm = content.match(/^---\n([\s\S]*?)\n---/);
        if (fm && fm[1].includes('status: accepted')) {
          decisionPath = join(decisionsDir, f);
        } else if (!f.includes('draft')) {
          draftPath = draftPath || join(decisionsDir, f);
        }
      }
    }
  } catch {
    // Decisions dir may not exist
  }

  return { draftPath, decisionPath };
}

async function gatherReviewFindings(cwd: string, tasks: ChapterTaskInfo[]) {
  const findings: Array<{
    taskId: string;
    reviewId: string;
    verdict: string;
    findings: Array<{ severity: string; description: string; resolved: boolean }>;
  }> = [];

  const terminalTasks = tasks.filter((t) => isTerminalStatus(t.status));

  for (const task of terminalTasks) {
    const taskReviews = await listReviewsForTask(cwd, task.taskId);
    for (const review of taskReviews) {
      findings.push({
        taskId: task.taskId,
        reviewId: review.review_id,
        verdict: review.verdict,
        findings: review.findings.map((f) => ({
          severity: f.severity,
          description: f.description,
          resolved: f.recommended_action !== 'defer' && f.recommended_action !== 'wontfix',
        })),
      });
    }
  }

  const residuals = findings
    .flatMap((r) =>
      r.findings
        .filter((f) => !f.resolved)
        .map((f) => ({
          taskId: r.taskId,
          reviewId: r.reviewId,
          severity: f.severity,
          description: f.description,
        })),
    );

  return { findings, residuals };
}

function buildClosureTemplate(options: {
  rangeSlug: string;
  tasks: ChapterTaskInfo[];
  findings: Array<{
    taskId: string;
    reviewId: string;
    verdict: string;
    findings: Array<{ severity: string; description: string; resolved: boolean }>;
  }>;
  residuals: Array<{ taskId: string; reviewId: string; severity: string; description: string }>;
  by?: string;
}): string {
  const { rangeSlug, tasks, findings, residuals, by } = options;
  const datePrefix = new Date().toISOString().slice(0, 10);

  const terminalTasks = tasks.filter((t) => isTerminalStatus(t.status));
  const nonTerminal = tasks.filter((t) => !isTerminalStatus(t.status));

  const taskTable = tasks
    .map((t) => `| ${t.taskNumber ?? '?'} | ${t.taskId} | ${t.status ?? 'unknown'} |`)
    .join('\n');

  const findingsSection = findings.length > 0
    ? findings
        .map(
          (r) =>
            `### ${r.taskId} (${r.reviewId})\n\nVerdict: **${r.verdict}**\n\n${r.findings
              .map((f) => `- [${f.resolved ? 'x' : ' '}] **${f.severity}**: ${f.description}`)
              .join('\n')}`,
        )
        .join('\n\n')
    : '_No review records found._';

  const residualsSection = residuals.length > 0
    ? residuals.map((r) => `- **${r.severity}** (${r.taskId}): ${r.description}`).join('\n')
    : '_No residual gaps identified._';

  return `---
status: draft
closes_tasks: [${tasks.map((t) => t.taskNumber).filter((n): n is number => n !== null).join(', ')}]
range: ${rangeSlug}
---

# Chapter Closure: ${rangeSlug}

**Date**: ${datePrefix}
**Operator**: ${by ?? 'TBD'}
**Tasks in chapter**: ${tasks.length}

## Task-by-Task Assessment

| Task # | Task ID | Status |
|--------|---------|--------|
${taskTable}

## Semantic Drift Check

- [ ] Terminology consistent with SEMANTICS.md
- [ ] No authority boundary violations introduced
- [ ] No substrate/vertical/agent collapse

## Authority Boundary Check

- [ ] All kernel invariants respected
- [ ] No hidden authority in UI or observations
- [ ] Effect execution routed through Intent/OutboundHandoff

## Gap Table

| # | Gap | Severity | Recommended Action |
|---|-----|----------|-------------------|
| 1 | TBD | TBD | TBD |

## CCC Posture Before / After

| Coordinate | Before | After |
|------------|--------|-------|
| semantic_resolution | TBD | TBD |
| invariant_preservation | TBD | TBD |
| constructive_executability | TBD | TBD |
| grounded_universalization | TBD | TBD |
| authority_reviewability | TBD | TBD |
| teleological_pressure | TBD | TBD |

## Review Findings and Resolutions

${findingsSection}

## Residuals (Unresolved Gaps)

${residualsSection}

## Recommended Next Work

- TBD

## Closure Action

- [ ] All tasks terminal
- [ ] Closure decision reviewed
- [ ] Ready to confirm
`;
}

// ── Legacy chapter-name mode ──

async function runLegacyClose(
  options: ChapterCloseOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const chapterName = options.chapterName!;
  const dryRun = options.dryRun ?? false;

  let tasks: ChapterTaskInfo[];
  try {
    tasks = await scanTasksByChapter(cwd, chapterName);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to scan tasks: ${msg}` },
    };
  }

  if (tasks.length === 0) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `No tasks found for chapter: ${chapterName}` },
    };
  }

  const completed = tasks.filter((t) => t.status === 'closed');
  const confirmed = tasks.filter((t) => t.status === 'confirmed');
  const nonTerminal = tasks.filter((t) => !isTerminalStatus(t.status));

  const { findings, residuals } = await gatherReviewFindings(cwd, tasks);

  const datePrefix = new Date().toISOString().slice(0, 10);
  const chapterSlug = chapterName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const artifactPath = join(cwd, '.ai', 'decisions', `${datePrefix}-${chapterSlug}-closure.md`);

  const artifactBody = `# Chapter Closure: ${chapterName}

**Date**: ${new Date().toISOString()}
**Tasks in chapter**: ${tasks.length}
**Dry run**: ${dryRun ? 'yes' : 'no'}

## Summary

| Category | Count |
|----------|-------|
| Confirmed | ${confirmed.length} |
| Closed (pending confirmation) | ${completed.length} |
| Non-terminal | ${nonTerminal.length} |

## Completed Tasks

${[...confirmed, ...completed].map((t) => `- ${t.taskId}${t.taskNumber ? ` (Task ${t.taskNumber})` : ''} — status: ${t.status}`).join('\n') || '_None_'}

## Tasks Not Terminal

${nonTerminal.length > 0
    ? nonTerminal.map((t) => `- ${t.taskId}${t.taskNumber ? ` (Task ${t.taskNumber})` : ''} — status: ${t.status}`).join('\n')
    : '_All tasks are terminal._'}

## Review Findings and Resolutions

${findings.length > 0
    ? findings
        .map(
          (r) =>
            `### ${r.taskId} (${r.reviewId})\n\nVerdict: **${r.verdict}**\n\n${r.findings
              .map((f) => `- [${f.resolved ? 'x' : ' '}] **${f.severity}**: ${f.description}`)
              .join('\n')}`,
        )
        .join('\n\n')
    : '_No review records found._'}

## Residuals (Unresolved Gaps)

${residuals.length > 0
    ? residuals.map((r) => `- **${r.severity}** (${r.taskId}): ${r.description}`).join('\n')
    : '_No residual gaps identified._'}

## Closure Action

${dryRun ? '**Dry run** — no mutations performed.' : 'Chapter closure artifact written. All closed tasks transitioned to confirmed.'}
`;

  if (dryRun) {
    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'dry_run',
          chapter: chapterName,
          tasks: tasks.length,
          non_terminal: nonTerminal.map((t) => t.taskId),
          completed: [...confirmed, ...completed].map((t) => t.taskId),
          residuals: residuals.length,
          artifact_would_be_written: artifactPath,
        },
      };
    }

    fmt.message(`Dry run: ${tasks.length} tasks in chapter "${chapterName}"`, 'info');
    fmt.kv('Confirmed', String(confirmed.length));
    fmt.kv('Closed', String(completed.length));
    fmt.kv('Non-terminal', String(nonTerminal.length));
    if (nonTerminal.length > 0) {
      fmt.message(`Warning: ${nonTerminal.length} task(s) are not terminal`, 'warning');
      for (const t of nonTerminal) {
        fmt.message(`  - ${t.taskId} (${t.status})`, 'warning');
      }
    }
    fmt.message(`Artifact would be written to: ${artifactPath}`, 'info');
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'dry_run',
        chapter: chapterName,
        tasks: tasks.length,
        non_terminal: nonTerminal.map((t) => t.taskId),
        completed: [...confirmed, ...completed].map((t) => t.taskId),
        residuals: residuals.length,
        artifact_would_be_written: artifactPath,
      },
    };
  }

  if (nonTerminal.length > 0) {
    const nonTerminalList = nonTerminal.map((t) => `${t.taskId} (${t.status})`).join(', ');
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Cannot close chapter "${chapterName}" — ${nonTerminal.length} task(s) are not terminal: ${nonTerminalList}`,
      },
    };
  }

  // Validate closure invariant for all terminal tasks
  const invalidTasks: Array<{ taskId: string; violations: string[] }> = [];
  for (const task of tasks.filter((t) => isTerminalStatus(t.status))) {
    const taskNum = task.taskNumber;
    if (taskNum === null) continue;
    const evidence = await inspectTaskEvidence(cwd, String(taskNum));
    if (evidence.violations.length > 0) {
      invalidTasks.push({ taskId: task.taskId, violations: evidence.violations });
    }
  }
  if (invalidTasks.length > 0) {
    const details = invalidTasks
      .map((t) => `  - ${t.taskId}: ${t.violations.join(', ')}`)
      .join('\n');
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Cannot close chapter "${chapterName}" — ${invalidTasks.length} terminal task(s) violate the closure invariant:\n${details}`,
      },
    };
  }

  try {
    await atomicWriteFile(artifactPath, artifactBody);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to write closure artifact: ${msg}` },
    };
  }

  const transitioned: string[] = [];
  for (const task of completed) {
    const taskFile = await findTaskFile(cwd, task.taskId);
    if (!taskFile) continue;
    const { frontMatter, body } = await readTaskFile(taskFile.path);
    if (frontMatter.status === 'closed') {
      frontMatter.status = 'confirmed';
      frontMatter.governed_by = `chapter_close:${options.by ?? 'operator'}`;
      await writeTaskFile(taskFile.path, frontMatter, body);
      transitioned.push(task.taskId);
    }
  }

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        chapter: chapterName,
        artifact_path: artifactPath,
        tasks_in_chapter: tasks.length,
        transitioned_to_confirmed: transitioned,
        non_terminal_remaining: nonTerminal.map((t) => t.taskId),
        residuals: residuals.length,
      },
    };
  }

  fmt.message(`Closed chapter "${chapterName}"`, 'success');
  fmt.kv('Artifact', artifactPath);
  fmt.kv('Tasks', String(tasks.length));
  fmt.kv('Transitioned to confirmed', String(transitioned.length));

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      chapter: chapterName,
      artifact_path: artifactPath,
      tasks_in_chapter: tasks.length,
      transitioned_to_confirmed: transitioned,
      non_terminal_remaining: nonTerminal.map((t) => t.taskId),
      residuals: residuals.length,
    },
  };
}

// ── Range-based mode ──

async function runRangeClose(
  options: ChapterCloseOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const range = parseRange(options.range!);

  if (!range) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Invalid range format: ${options.range}. Expected NNN or NNN-MMM.` },
    };
  }

  const tasks = await scanTasksByRange(cwd, range.start, range.end);
  const rangeSlug = `${range.start}-${range.end}`;
  const nonTerminal = tasks.filter((t) => !isTerminalStatus(t.status));
  const { findings, residuals } = await gatherReviewFindings(cwd, tasks);

  const datePrefix = new Date().toISOString().slice(0, 10);
  const draftPath = join(cwd, '.ai', 'decisions', `${datePrefix}-${rangeSlug}-chapter-closure-draft.md`);

  // ── --start ──
  if (options.start) {
    if (nonTerminal.length > 0) {
      const nonTerminalList = nonTerminal.map((t) => `${t.taskId} (${t.status})`).join(', ');
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: `Cannot start closure for ${rangeSlug} — ${nonTerminal.length} task(s) are not terminal: ${nonTerminalList}`,
        },
      };
    }

    const template = buildClosureTemplate({
      rangeSlug,
      tasks,
      findings,
      residuals,
      by: options.by,
    });

    try {
      await atomicWriteFile(draftPath, template);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Failed to write closure draft: ${msg}` },
      };
    }

    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'success',
          range: rangeSlug,
          draft_path: draftPath,
          tasks_in_chapter: tasks.length,
        },
      };
    }

    fmt.message(`Closure draft written for ${rangeSlug}`, 'success');
    fmt.kv('Draft', draftPath);
    fmt.kv('Tasks', String(tasks.length));
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        range: rangeSlug,
        draft_path: draftPath,
        tasks_in_chapter: tasks.length,
      },
    };
  }

  // ── --finish ──
  if (options.finish) {
    const { draftPath: existingDraft } = await findClosureDecisionPaths(cwd, rangeSlug);

    if (!existingDraft) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: `No closure draft found for ${rangeSlug}. Run 'narada chapter close ${rangeSlug} --start' first.`,
        },
      };
    }

    // Verify draft has required sections
    const draftContent = await readFile(existingDraft, 'utf8');
    const requiredSections = [
      'Task-by-Task Assessment',
      'Semantic Drift Check',
      'Authority Boundary Check',
      'Gap Table',
      'Closure Action',
    ];
    const missingSections = requiredSections.filter((s) => !draftContent.includes(s));
    if (missingSections.length > 0) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: `Closure draft is incomplete. Missing sections: ${missingSections.join(', ')}`,
        },
      };
    }

    if (nonTerminal.length > 0) {
      const nonTerminalList = nonTerminal.map((t) => `${t.taskId} (${t.status})`).join(', ');
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: `Cannot finish closure for ${rangeSlug} — ${nonTerminal.length} task(s) are not terminal: ${nonTerminalList}`,
        },
      };
    }

    // Validate closure invariant for all terminal tasks
    const invalidTasks: Array<{ taskId: string; violations: string[] }> = [];
    for (const task of tasks.filter((t) => isTerminalStatus(t.status))) {
      const taskNum = task.taskNumber;
      if (taskNum === null) continue;
      const evidence = await inspectTaskEvidence(cwd, String(taskNum));
      if (evidence.violations.length > 0) {
        invalidTasks.push({ taskId: task.taskId, violations: evidence.violations });
      }
    }
    if (invalidTasks.length > 0) {
      const details = invalidTasks
        .map((t) => `  - ${t.taskId}: ${t.violations.join(', ')}`)
        .join('\n');
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: `Cannot finish closure for ${rangeSlug} — ${invalidTasks.length} terminal task(s) violate the closure invariant:\n${details}`,
        },
      };
    }

    // Mark decision as accepted by rewriting the file
    const acceptedContent = draftContent.replace(/^status: draft/m, 'status: accepted');
    const acceptedPath = existingDraft.replace('-draft.md', '.md');

    try {
      await atomicWriteFile(acceptedPath, acceptedContent);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Failed to write closure decision: ${msg}` },
      };
    }

    // Transition closed tasks to confirmed
    const transitioned: string[] = [];
    for (const task of tasks.filter((t) => t.status === 'closed')) {
      const taskFile = await findTaskFile(cwd, task.taskId);
      if (!taskFile) continue;
      const { frontMatter, body } = await readTaskFile(taskFile.path);
      if (frontMatter.status === 'closed') {
        frontMatter.status = 'confirmed';
        frontMatter.governed_by = `chapter_close:${options.by ?? 'operator'}`;
        await writeTaskFile(taskFile.path, frontMatter, body);
        transitioned.push(task.taskId);
      }
    }

    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'success',
          range: rangeSlug,
          decision_path: acceptedPath,
          tasks_in_chapter: tasks.length,
          transitioned_to_confirmed: transitioned,
        },
      };
    }

    fmt.message(`Closure accepted for ${rangeSlug}`, 'success');
    fmt.kv('Decision', acceptedPath);
    fmt.kv('Tasks', String(tasks.length));
    fmt.kv('Transitioned to confirmed', String(transitioned.length));
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        range: rangeSlug,
        decision_path: acceptedPath,
        tasks_in_chapter: tasks.length,
        transitioned_to_confirmed: transitioned,
      },
    };
  }

  // ── --reopen ──
  if (options.reopen) {
    const { draftPath: existingDraft, decisionPath: existingDecision } = await findClosureDecisionPaths(
      cwd,
      rangeSlug,
    );

    if (!existingDraft && !existingDecision) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: `No closure draft or decision found for ${rangeSlug}. Nothing to reopen.`,
        },
      };
    }

    // Chapter returns to executing state
    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'success',
          range: rangeSlug,
          previous_state: existingDecision ? 'closed' : 'closing',
          new_state: 'executing',
          reason: options.reason ?? null,
          note: 'Create corrective tasks for any gaps found, then re-close when ready.',
        },
      };
    }

    fmt.message(`Reopened chapter ${rangeSlug}`, 'warning');
    fmt.kv('Previous state', existingDecision ? 'closed' : 'closing');
    fmt.kv('New state', 'executing');
    if (options.reason) {
      fmt.kv('Reason', options.reason);
    }
    fmt.message('Create corrective tasks for any gaps found, then re-close when ready.', 'info');
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        range: rangeSlug,
        previous_state: existingDecision ? 'closed' : 'closing',
        new_state: 'executing',
        reason: options.reason ?? null,
      },
    };
  }

  return {
    exitCode: ExitCode.GENERAL_ERROR,
    result: {
      status: 'error',
      error: 'No action specified. Use --start, --finish, or --reopen with a range.',
    },
  };
}

// ── Entry point ──

export async function chapterCloseCommand(
  options: ChapterCloseOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  // Backward compatibility: if chapterName is provided, use legacy mode
  if (options.chapterName) {
    return runLegacyClose(options);
  }

  // Range-based mode
  if (options.range) {
    return runRangeClose(options);
  }

  return {
    exitCode: ExitCode.GENERAL_ERROR,
    result: { status: 'error', error: 'Chapter name or range is required.' },
  };
}
