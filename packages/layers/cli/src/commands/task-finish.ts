import { resolve } from 'node:path';
import { FinishTaskServiceOptions, finishTaskService } from '@narada2/task-governance/task-finish-service';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { type TaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import {
  evaluateAuthorityInversionForChangedFiles,
  formatAuthorityInversionWarning,
  summarizeAuthorityInversionWarning,
} from '../lib/authority-inversion.js';
import {
  captureTaskLifecycleEvidenceState,
  writeTaskLifecycleMutationEvidence,
} from '../lib/mutation-evidence-writer.js';
import { checkLawAdmission, lawUpdateRequiredResult } from '../lib/law-sync.js';
import { mergeTaskReportFileFields, readTaskReportFile } from '../lib/task-report-file.js';

const GENERATED_ARTIFACT_AUTHORITY_HUMAN_NOTE =
  'Generated review/report artifacts are not self-authorizing; authority requires lifecycle admission, reviewer identity, task evidence verdict, and closure status.';

export interface TaskFinishOptions {
  taskNumber?: string;
  agent?: string;
  reviewer?: string;
  summary?: string;
  changedFiles?: string;
  verification?: string;
  residuals?: string;
  reportFile?: string;
  verdict?: 'accepted' | 'accepted_with_notes' | 'rejected';
  findings?: string;
  report?: string;
  allowIncomplete?: boolean;
  close?: boolean;
  proveCriteria?: boolean;
  cwd?: string;
  format?: 'json' | 'human' | 'auto';
  verbose?: boolean;
  store?: TaskLifecycleStore;
}

export async function taskFinishCommand(
  options: TaskFinishOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  let effectiveOptions = options;
  if (options.reportFile) {
    try {
      effectiveOptions = mergeTaskReportFileFields(options, await readTaskReportFile(options.reportFile, cwd));
    } catch (error) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: error instanceof Error ? error.message : String(error) },
      };
    }
  }
  const lawAdmission = await checkLawAdmission(cwd, effectiveOptions.agent);
  if (lawAdmission.status === 'blocked') {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: lawUpdateRequiredResult(lawAdmission),
    };
  }
  const serviceStore = effectiveOptions.store;
  const before = await captureTaskLifecycleEvidenceState(cwd, effectiveOptions.taskNumber, serviceStore);

  const serviceResult = await finishTaskService({
    taskNumber: effectiveOptions.taskNumber,
    agent: effectiveOptions.agent,
    reviewer: effectiveOptions.reviewer,
    summary: effectiveOptions.summary,
    changedFiles: effectiveOptions.changedFiles,
    verification: effectiveOptions.verification,
    residuals: effectiveOptions.residuals,
    verdict: effectiveOptions.verdict,
    findings: effectiveOptions.findings,
    report: effectiveOptions.report,
    allowIncomplete: effectiveOptions.allowIncomplete,
    close: effectiveOptions.close,
    proveCriteria: effectiveOptions.proveCriteria,
    cwd,
    store: serviceStore,
  } as FinishTaskServiceOptions & { store?: TaskLifecycleStore });

  const authorityInversionWarnings = await evaluateAuthorityInversionForChangedFiles(cwd, effectiveOptions.changedFiles);
  const result = authorityInversionWarnings.length > 0 && serviceResult.result && typeof serviceResult.result === 'object'
    ? {
      ...(serviceResult.result as Record<string, unknown>),
      authority_inversion_warnings: authorityInversionWarnings.map(summarizeAuthorityInversionWarning),
      warnings: [
        ...(((serviceResult.result as { warnings?: string[] }).warnings) ?? []),
        ...authorityInversionWarnings.map(formatAuthorityInversionWarning),
      ],
    }
    : serviceResult.result;
  if (serviceResult.exitCode === ExitCode.SUCCESS && result && typeof result === 'object' && (result as { status?: string }).status === 'success') {
    const after = await captureTaskLifecycleEvidenceState(cwd, effectiveOptions.taskNumber, serviceStore);
    await writeTaskLifecycleMutationEvidence({
      cwd,
      taskNumber: effectiveOptions.taskNumber,
      command: 'task finish',
      principal: effectiveOptions.agent,
      authorityClass: 'resolve',
      before,
      after,
      result,
    });
  }

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: serviceResult.exitCode,
      result,
    };
  }

  if (serviceResult.exitCode !== ExitCode.SUCCESS) {
    fmt.message((result as { error?: string }).error ?? 'Finish failed', 'error');
  } else {
    const summaryLines = [
      `Finished task ${(result as { task_id?: string }).task_id}: ${(result as { completion_mode?: string }).completion_mode}`,
      `  Report: ${(result as { report_action?: string }).report_action}${(result as { report_id?: string | null }).report_id ? ` (${String((result as { report_id?: string }).report_id)})` : ''}`,
      `  Review: ${(result as { review_action?: string }).review_action}${(result as { review_id?: string | null }).review_id ? ` (${String((result as { review_id?: string }).review_id)})` : ''}`,
      `  Evidence verdict: ${(result as { evidence_verdict?: string }).evidence_verdict}`,
      `  Roster: ${(result as { roster_transition?: string }).roster_transition}`,
      `  Close action: ${(result as { close_action?: string }).close_action}`,
    ];
    const reviewReusePosture = (result as { review_reuse_posture?: string }).review_reuse_posture;
    if (reviewReusePosture) {
      summaryLines.push(`  Review reuse posture: ${reviewReusePosture}`);
      const ignoredReviewIds = (result as { ignored_review_ids?: string[] }).ignored_review_ids ?? [];
      if (ignoredReviewIds.length > 0) {
        summaryLines.push(`  Ignored stale rejected review ids: ${ignoredReviewIds.join(', ')}`);
      }
    }
    if ((result as { warnings?: string[] }).warnings && (result as { warnings?: string[] }).warnings!.length > 0) {
      summaryLines.push('  Warnings:');
      for (const warning of ((result as { warnings?: string[] }).warnings ?? [])) {
        summaryLines.push(`    ⚠ ${warning}`);
      }
    }
    if (effectiveOptions.allowIncomplete) {
      summaryLines.push('  Incomplete evidence allowed; roster marks agent availability only.');
    }
    summaryLines.push(`  Authority note: ${GENERATED_ARTIFACT_AUTHORITY_HUMAN_NOTE}`);
    fmt.message(summaryLines.join('\n'), serviceResult.exitCode === ExitCode.SUCCESS ? 'success' : 'warning');
  }

  return {
    exitCode: serviceResult.exitCode,
    result,
  };
}
