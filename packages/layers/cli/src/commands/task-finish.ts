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
  store?: TaskLifecycleStore;
}

export async function taskFinishCommand(
  options: TaskFinishOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const lawAdmission = await checkLawAdmission(cwd, options.agent);
  if (lawAdmission.status === 'blocked') {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: lawUpdateRequiredResult(lawAdmission),
    };
  }
  const serviceStore = options.store;
  const before = await captureTaskLifecycleEvidenceState(cwd, options.taskNumber, serviceStore);

  const serviceResult = await finishTaskService({
    taskNumber: options.taskNumber,
    agent: options.agent,
    summary: options.summary,
    changedFiles: options.changedFiles,
    verification: options.verification,
    residuals: options.residuals,
    verdict: options.verdict,
    findings: options.findings,
    report: options.report,
    allowIncomplete: options.allowIncomplete,
    close: options.close,
    proveCriteria: options.proveCriteria,
    cwd,
    store: serviceStore,
  } as FinishTaskServiceOptions & { store?: TaskLifecycleStore });

  const authorityInversionWarnings = await evaluateAuthorityInversionForChangedFiles(cwd, options.changedFiles);
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
    const after = await captureTaskLifecycleEvidenceState(cwd, options.taskNumber, serviceStore);
    await writeTaskLifecycleMutationEvidence({
      cwd,
      taskNumber: options.taskNumber,
      command: 'task finish',
      principal: options.agent,
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
    if ((result as { warnings?: string[] }).warnings && (result as { warnings?: string[] }).warnings!.length > 0) {
      summaryLines.push('  Warnings:');
      for (const warning of ((result as { warnings?: string[] }).warnings ?? [])) {
        summaryLines.push(`    ⚠ ${warning}`);
      }
    }
    if (options.allowIncomplete) {
      summaryLines.push('  Incomplete evidence allowed; roster marks agent availability only.');
    }
    fmt.message(summaryLines.join('\n'), serviceResult.exitCode === ExitCode.SUCCESS ? 'success' : 'warning');
  }

  return {
    exitCode: serviceResult.exitCode,
    result,
  };
}
