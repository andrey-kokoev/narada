/**
 * Corrective task derivation operator.
 *
 * Mutation: generates a new task file from a review finding.
 */

import { resolve, join } from 'node:path';
import {
  loadReview,
  findTaskFile,
  readTaskFile,
  allocateTaskNumber,
  atomicWriteFile,
  type ReviewFinding,
} from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface TaskDeriveOptions {
  findingId?: string;
  format?: 'json' | 'human' | 'auto';
  review?: string;
  cwd?: string;
}

export async function taskDeriveFromFindingCommand(
  options: TaskDeriveOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const findingId = (options as Record<string, unknown>).findingId as string | undefined;
  const reviewId = options.review;

  if (!findingId) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Finding ID is required' },
    };
  }

  if (!reviewId) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--review is required' },
    };
  }

  // Load review record
  const review = await loadReview(cwd, reviewId);
  if (!review) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Review not found: ${reviewId}` },
    };
  }

  // Find the specific finding
  const finding = review.findings.find((f: ReviewFinding) => f.finding_id === findingId);
  if (!finding) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Finding ${findingId} not found in review ${reviewId}` },
    };
  }

  // Determine target task
  const targetTaskId = finding.target_task_id ? String(finding.target_task_id) : review.task_id;
  const targetTask = await findTaskFile(cwd, targetTaskId);
  if (!targetTask) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Target task not found: ${targetTaskId}` },
    };
  }

  // Read target task for context
  const { frontMatter: targetFm } = await readTaskFile(targetTask.path);

  // Resolve target task number for depends_on
  const targetTaskNumber = Number(targetFm.task_id ?? targetTaskId.match(/-(\d+)-/)?.[1] ?? NaN);
  if (Number.isNaN(targetTaskNumber) || targetTaskNumber === 0) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Could not resolve target task number from ${targetTaskId}` },
    };
  }

  // Allocate task number
  const taskNumber = await allocateTaskNumber(cwd);

  // Generate task file
  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const taskFileName = `${datePrefix}-${taskNumber}-corrective-${finding.category ?? 'fix'}-${targetTaskId}.md`;
  const taskPath = join(cwd, '.ai', 'do-not-open', 'tasks', taskFileName);

  const frontMatter = {
    task_id: taskNumber,
    status: 'opened',
    depends_on: [targetTaskNumber],
  };

  const body = `# Task ${taskNumber}: Corrective — ${finding.description}

## Context

Derived from finding \`${findingId}\` in review \`${reviewId}\`.

Target task: ${targetTaskId}
Severity: ${finding.severity}
Category: ${finding.category ?? 'unspecified'}

## Why

${finding.description}

## Recommended Action

${finding.recommended_action ?? 'fix'}

## Acceptance Criteria

- [ ] Issue described in finding ${findingId} is resolved.
- [ ] Original review ${reviewId} is referenced in verification.
`;

  const content = `---\n${Object.entries(frontMatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.join(', ')}]`;
      return `${k}: ${v}`;
    })
    .join('\n')}\n---\n\n${body}`;

  await atomicWriteFile(taskPath, content);

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        task_number: taskNumber,
        task_file: taskFileName,
        target_task: targetTaskId,
        finding_id: findingId,
        review_id: reviewId,
      },
    };
  }

  fmt.message(`Derived corrective task ${taskNumber}: ${taskFileName}`, 'success');
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      task_number: taskNumber,
      task_file: taskFileName,
      target_task: targetTaskId,
      finding_id: findingId,
      review_id: reviewId,
    },
  };
}
