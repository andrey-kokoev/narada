/**
 * Chapter closure operator.
 *
 * Enumerates all tasks in a chapter, verifies terminal status,
 * generates a closure artifact, and transitions closed tasks to confirmed.
 */

import { resolve, join } from 'node:path';
import {
  scanTasksByChapter,
  readTaskFile,
  writeTaskFile,
  findTaskFile,
  loadAssignment,
  loadReview,
  atomicWriteFile,
  extractChapter,
  type ChapterTaskInfo,
} from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { readdir } from 'node:fs/promises';

export interface ChapterCloseOptions {
  chapterName?: string;
  format?: 'json' | 'human' | 'auto';
  dryRun?: boolean;
  cwd?: string;
}

export async function chapterCloseCommand(
  options: ChapterCloseOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const chapterName = (options as Record<string, unknown>).chapterName as string | undefined;
  const dryRun = options.dryRun ?? false;

  if (!chapterName) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Chapter name is required' },
    };
  }

  // Scan tasks for this chapter
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

  // Categorize tasks
  const completed: ChapterTaskInfo[] = [];
  const confirmed: ChapterTaskInfo[] = [];
  const inReview: ChapterTaskInfo[] = [];
  const inProgress: ChapterTaskInfo[] = [];
  const runnable: ChapterTaskInfo[] = [];
  const notStarted: ChapterTaskInfo[] = [];
  const deferred: ChapterTaskInfo[] = [];

  for (const task of tasks) {
    switch (task.status) {
      case 'confirmed':
        confirmed.push(task);
        break;
      case 'closed':
        completed.push(task);
        break;
      case 'in_review':
        inReview.push(task);
        break;
      case 'claimed':
        inProgress.push(task);
        break;
      case 'opened':
      case 'needs_continuation':
        runnable.push(task);
        break;
      case 'draft':
        notStarted.push(task);
        break;
      default:
        deferred.push(task);
    }
  }

  // Collect non-terminal tasks
  const nonTerminal = [...inReview, ...inProgress, ...runnable, ...notStarted, ...deferred];

  // Gather review findings for completed/closed tasks
  const findings: Array<{
    taskId: string;
    reviewId: string;
    verdict: string;
    findings: Array<{ severity: string; description: string; resolved: boolean }>;
  }> = [];

  const reviewsDir = join(cwd, '.ai', 'reviews');
  let reviewFiles: string[] = [];
  try {
    reviewFiles = await readdir(reviewsDir);
  } catch {
    // Directory may not exist
  }

  for (const task of [...completed, ...confirmed]) {
    // Find reviews for this task
    const taskReviews = reviewFiles.filter((f) => f.includes(task.taskId));
    for (const reviewFile of taskReviews) {
      const review = await loadReview(cwd, reviewFile.replace(/\.json$/, ''));
      if (review) {
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
  }

  // Identify residuals: unresolved findings marked as defer/wontfix
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

  // Build closure artifact
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
| In review | ${inReview.length} |
| In progress | ${inProgress.length} |
| Runnable | ${runnable.length} |
| Draft / not started | ${notStarted.length} |

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
    fmt.kv('In review', String(inReview.length));
    fmt.kv('In progress', String(inProgress.length));
    fmt.kv('Runnable', String(runnable.length));
    fmt.kv('Not started', String(notStarted.length));
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

  // Non-dry-run: enforce closure preconditions
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

  // Write artifact and transition closed → confirmed
  try {
    await atomicWriteFile(artifactPath, artifactBody);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to write closure artifact: ${msg}` },
    };
  }

  // Transition closed tasks to confirmed
  const transitioned: string[] = [];
  for (const task of completed) {
    const taskFile = await findTaskFile(cwd, task.taskId);
    if (!taskFile) continue;
    const { frontMatter, body } = await readTaskFile(taskFile.path);
    if (frontMatter.status === 'closed') {
      frontMatter.status = 'confirmed';
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
