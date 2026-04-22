/**
 * Task evidence inspection operator.
 *
 * Read-only: inspects a task file and reports completion evidence.
 * Does not mutate any state.
 */

import { resolve } from 'node:path';
import { inspectTaskEvidence, type TaskCompletionEvidence } from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';

export interface TaskEvidenceOptions {
  taskNumber: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export async function taskEvidenceCommand(
  options: TaskEvidenceOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;

  if (!taskNumber || !Number.isFinite(Number(taskNumber))) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Invalid or missing task number' },
    };
  }

  let evidence: TaskCompletionEvidence;
  try {
    evidence = await inspectTaskEvidence(cwd, taskNumber);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to inspect task evidence: ${msg}` },
    };
  }

  const format = options.format === 'json' ? 'json' : 'human';

  if (format === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'ok',
        evidence,
      },
    };
  }

  const lines: string[] = [
    `Task ${evidence.task_number ?? taskNumber} Evidence`,
    '',
    `  status:              ${evidence.status ?? 'missing'}`,
    `  verdict:             ${evidence.verdict}`,
    `  criteria checked:    ${evidence.all_criteria_checked === null ? 'n/a' : evidence.all_criteria_checked ? 'yes' : `no (${evidence.unchecked_count} unchecked)`}`,
    `  execution notes:     ${evidence.has_execution_notes ? 'yes' : 'no'}`,
    `  verification:        ${evidence.has_verification ? 'yes' : 'no'}`,
    `  report:              ${evidence.has_report ? 'yes' : 'no'}`,
    `  review:              ${evidence.has_review ? 'yes' : 'no'}`,
    `  closure:             ${evidence.has_closure ? 'yes' : 'no'}`,
  ];

  if (evidence.violations.length > 0) {
    lines.push('');
    lines.push('Invariant violations:');
    for (const v of evidence.violations) {
      lines.push(`  ❌ ${v}`);
    }
  }

  if (evidence.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of evidence.warnings) {
      lines.push(`  ⚠ ${w}`);
    }
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: lines.join('\n'),
  };
}
