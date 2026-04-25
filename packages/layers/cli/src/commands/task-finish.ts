/**
 * Task finish operator — canonical agent completion finalizer.
 *
 * Guides agents through report/review → evidence → roster handoff.
 * Makes the normal path easy and makes incomplete handoff explicit.
 */

import { resolve } from 'node:path';
import {
  loadRoster,
  findTaskFile,
  readTaskFile,
  inspectTaskEvidence,
  listReportsForTask,
  listReviewsForTask,
} from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { taskReportCommand } from './task-report.js';
import { taskReviewCommand } from './task-review.js';
import { taskRosterDoneCommand } from './task-roster.js';
import { taskEvidenceAdmitCommand, taskEvidenceProveCriteriaCommand } from './task-evidence.js';
import { taskCloseCommand } from './task-close.js';

export interface TaskFinishOptions {
  taskNumber?: string;
  agent?: string;
  summary?: string;
  changedFiles?: string;
  verification?: string;
  residuals?: string;
  verdict?: 'accepted' | 'accepted_with_notes' | 'rejected';
  findings?: string;
  report?: string;
  allowIncomplete?: boolean;
  close?: boolean;
  proveCriteria?: boolean;
  cwd?: string;
  format?: 'json' | 'human' | 'auto';
  verbose?: boolean;
}

export async function taskFinishCommand(
  options: TaskFinishOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;
  const agentId = options.agent;

  if (!taskNumber) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Task number is required' },
    };
  }

  if (!agentId) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--agent is required' },
    };
  }

  // ── Load roster and confirm agent exists ──
  let roster;
  try {
    roster = await loadRoster(cwd);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to load agent roster: ${msg}` },
    };
  }

  const agent = roster.agents.find((a) => a.agent_id === agentId);
  if (!agent) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Agent not found in roster: ${agentId}` },
    };
  }

  // ── Find task file ──
  let taskFile;
  try {
    taskFile = await findTaskFile(cwd, taskNumber);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  }

  if (!taskFile) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Task not found: ${taskNumber}` },
    };
  }

  const { frontMatter } = await readTaskFile(taskFile.path);
  const taskStatus = frontMatter.status as string | undefined;

  // ── Assignment-intent handling from current task state and explicit inputs ──
  let reportAction: 'submitted' | 'reused' | 'skipped' | null = null;
  let reviewAction: 'submitted' | 'reused' | 'skipped' | null = null;
  let reportId: string | null = null;
  let reviewId: string | null = null;
  const existingReviews = await listReviewsForTask(cwd, taskFile.taskId);
  const existingReports = await listReportsForTask(cwd, taskFile.taskId);
  const myReview = existingReviews.find((r) => r.reviewer_agent_id === agentId);
  const myReport = existingReports.find((r) => r.agent_id === agentId);
  const completionMode = options.verdict !== undefined || myReview || (!myReport && taskStatus === 'in_review')
    ? 'review'
    : 'report';

  if (completionMode === 'review') {
    if (myReview) {
      reviewAction = 'reused';
      reviewId = myReview.review_id;
    } else {
      if (taskStatus !== 'in_review') {
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: {
            status: 'error',
            error: `Task ${taskFile.taskId} is in status '${taskStatus ?? 'missing'}'; review finish requires in_review.`,
          },
        };
      }
      if (!options.verdict) {
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: {
            status: 'error',
            error: 'Review finish requires --verdict (accepted, accepted_with_notes, or rejected)',
          },
        };
      }
      const reviewResult = await taskReviewCommand({
        taskNumber,
        agent: agentId,
        verdict: options.verdict,
        findings: options.findings,
        report: options.report,
        cwd,
        format: 'json',
      });
      if (reviewResult.exitCode !== ExitCode.SUCCESS) {
        return reviewResult;
      }
      reviewAction = 'submitted';
      const reviewResultData = reviewResult.result as { review_id?: string } | undefined;
      reviewId = reviewResultData?.review_id ?? null;
    }
    reportAction = myReport ? 'reused' : 'skipped';
    reportId = myReport?.report_id ?? null;
  } else {
    if (myReport) {
      reportAction = 'reused';
      reportId = myReport.report_id;
    } else if (taskStatus === 'claimed') {
      if (!options.summary) {
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: {
            status: 'error',
            error: 'Report finish requires --summary when no report exists. Run with --summary, changed-files, verification, and residuals.',
          },
        };
      }
      const reportResult = await taskReportCommand({
        taskNumber,
        agent: agentId,
        summary: options.summary,
        changedFiles: options.changedFiles,
        verification: options.verification,
        residuals: options.residuals,
        cwd,
        format: 'json',
      });
      if (reportResult.exitCode !== ExitCode.SUCCESS) {
        return reportResult;
      }
      reportAction = 'submitted';
      const reportResultData = reportResult.result as { report_id?: string } | undefined;
      reportId = reportResultData?.report_id ?? null;
    } else if (taskStatus === 'in_review') {
      reportAction = 'skipped';
    } else {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: `Task ${taskFile.taskId} is in status '${taskStatus ?? 'missing'}'; cannot finish from this state.`,
        },
      };
    }
    reviewAction = myReview ? 'reused' : 'skipped';
    reviewId = myReview?.review_id ?? null;
  }

  // ── Evidence inspection after report/review ──
  let evidence = await inspectTaskEvidence(cwd, taskNumber);
  let criteriaProofAction: 'proved' | 'skipped' | 'blocked' = 'skipped';
  let criteriaProofBlockers: string[] = [];
  if (options.proveCriteria) {
    const proofResult = await taskEvidenceProveCriteriaCommand({
      taskNumber,
      by: agentId,
      cwd,
      format: 'json',
      noRunRationale: 'Proved through task finish orchestration; verification evidence remains separately admitted.',
    });
    if (proofResult.exitCode === ExitCode.SUCCESS) {
      criteriaProofAction = 'proved';
      evidence = await inspectTaskEvidence(cwd, taskNumber);
    } else {
      criteriaProofAction = 'blocked';
      const proofData = proofResult.result as { blockers?: string[]; error?: string };
      criteriaProofBlockers = proofData.blockers ?? [proofData.error ?? 'Criteria proof failed'];
    }
  }
  let admissionId: string | null = null;
  let closeAction: 'closed' | 'blocked' | 'skipped' = 'skipped';
  let closeBlockers: string[] = [];

  if (options.close && criteriaProofAction === 'blocked') {
    closeAction = 'blocked';
    closeBlockers = ['Criteria proof failed before evidence admission'];
  } else if (options.close) {
    const admitResult = await taskEvidenceAdmitCommand({
      taskNumber,
      by: agentId,
      cwd,
      format: 'json',
    });
    const admitData = admitResult.result as {
      blockers?: string[];
      admission_result?: { admission_id?: string };
    };
    admissionId = admitData.admission_result?.admission_id ?? null;

    if (admitResult.exitCode !== ExitCode.SUCCESS) {
      closeAction = 'blocked';
      closeBlockers = admitData.blockers ?? ['Evidence admission failed'];
    } else {
      const closeResult = await taskCloseCommand({
        taskNumber,
        by: agentId,
        cwd,
        format: 'json',
        mode: 'agent_finish',
      });
      if (closeResult.exitCode === ExitCode.SUCCESS) {
        closeAction = 'closed';
        evidence = await inspectTaskEvidence(cwd, taskNumber);
      } else {
        closeAction = 'blocked';
        const closeData = closeResult.result as { gate_failures?: string[]; error?: string };
        closeBlockers = closeData.gate_failures ?? [closeData.error ?? 'Lifecycle close failed'];
      }
    }
  }

  // ── Roster done ──
  const rosterResult = await taskRosterDoneCommand({
    taskNumber,
    agent: agentId,
    allowIncomplete: options.allowIncomplete,
    cwd,
    format: 'json',
    verbose: options.verbose,
  });

  if (rosterResult.exitCode !== ExitCode.SUCCESS && !options.allowIncomplete) {
    return rosterResult;
  }

  // ── Output ──
  const rosterData = rosterResult.result as {
    status?: string;
    warnings?: string[];
    allow_incomplete?: boolean;
  } | undefined;

  const output: Record<string, unknown> = {
    status: rosterResult.exitCode === ExitCode.SUCCESS ? 'success' : 'incomplete',
    completion_mode: completionMode,
    task_id: taskFile.taskId,
    agent_id: agentId,
    report_action: reportAction,
    review_action: reviewAction,
    report_id: reportId,
    review_id: reviewId,
    evidence_verdict: evidence.verdict,
    roster_transition: rosterData?.status === 'ok' ? 'done' : 'blocked',
    close_action: closeAction,
    criteria_proof_action: criteriaProofAction,
  };

  if (admissionId) {
    output.admission_id = admissionId;
  }
  if (closeBlockers.length > 0) {
    output.close_blockers = closeBlockers;
  }
  if (criteriaProofBlockers.length > 0) {
    output.criteria_proof_blockers = criteriaProofBlockers;
  }
  if (rosterData?.warnings && rosterData.warnings.length > 0) {
    output.warnings = rosterData.warnings;
  }
  if (options.allowIncomplete) {
    output.allow_incomplete = true;
  }
  if (evidence.warnings.length > 0) {
    output.evidence_warnings = evidence.warnings;
  }

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: rosterResult.exitCode,
      result: output,
    };
  }

  // Human output
  const lines: string[] = [];
  lines.push(`Finished task ${taskFile.taskId} via ${completionMode}`);

  if (reportAction) {
    lines.push(`  Report: ${reportAction}${reportId ? ` (${reportId})` : ''}`);
  }
  if (reviewAction) {
    lines.push(`  Review: ${reviewAction}${reviewId ? ` (${reviewId})` : ''}`);
  }

  lines.push(`  Evidence verdict: ${evidence.verdict}`);
  lines.push(`  Roster: ${output.roster_transition}`);

  if (rosterData?.warnings && rosterData.warnings.length > 0) {
    lines.push('  Warnings:');
    for (const w of rosterData.warnings) {
      lines.push(`    ⚠ ${w}`);
    }
  }

  if (options.allowIncomplete) {
    lines.push('  Incomplete evidence was explicitly allowed; roster records availability only.');
  }

  if (rosterResult.exitCode !== ExitCode.SUCCESS) {
    fmt.message(lines.join('\n'), 'warning');
  } else {
    fmt.message(lines.join('\n'), 'success');
  }

  return {
    exitCode: rosterResult.exitCode,
    result: output,
  };
}
