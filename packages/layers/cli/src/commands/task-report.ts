import { resolve } from 'node:path';
import { reportTaskService, type ReportTaskServiceResponse, type ReportTaskServiceOptions } from '@narada2/task-governance/task-report-service';
import {
  recallAcceptedLearning,
  formatGuidanceForHumans,
  formatGuidanceForJson,
} from '../lib/learning-recall.js';
import {
  resolvePrincipalStateDir,
  updatePrincipalRuntimeFromTaskEvent,
} from '../lib/principal-bridge.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { type TaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import {
  captureTaskLifecycleEvidenceState,
  writeTaskLifecycleMutationEvidence,
} from '../lib/mutation-evidence-writer.js';
import { enforceBuilderOwnedLifecycleGuard } from '../lib/task-role-guard.js';
import { mergeTaskReportFileFields, readTaskReportFile } from '../lib/task-report-file.js';

export interface TaskReportOptions {
  taskNumber?: string;
  format?: 'json' | 'human' | 'auto';
  agent?: string;
  reviewer?: string;
  summary?: string;
  changedFiles?: string;
  verification?: string;
  residuals?: string;
  reportFile?: string;
  cwd?: string;
  principalStateDir?: string;
  verbose?: boolean;
  store?: TaskLifecycleStore;
  overrideRationale?: string;
}

export async function taskReportCommand(
  options: TaskReportOptions,
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
  const roleGuard = await enforceBuilderOwnedLifecycleGuard({
    cwd,
    taskNumber: effectiveOptions.taskNumber,
    actor: effectiveOptions.agent,
    action: 'report',
    overrideRationale: effectiveOptions.overrideRationale,
  });
  if (!roleGuard.ok) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: roleGuard.error },
    };
  }
  const before = await captureTaskLifecycleEvidenceState(cwd, effectiveOptions.taskNumber, effectiveOptions.store);
  const serviceAgent = roleGuard.override?.owner_agent_id ?? effectiveOptions.agent;

  const serviceResult = await reportTaskService({
    taskNumber: effectiveOptions.taskNumber,
    agent: serviceAgent,
    reviewer: effectiveOptions.reviewer,
    summary: effectiveOptions.summary,
    changedFiles: effectiveOptions.changedFiles,
    verification: effectiveOptions.verification,
    residuals: effectiveOptions.residuals,
    cwd,
    store: effectiveOptions.store,
  } as ReportTaskServiceOptions);

  const result = roleGuard.override
    ? { ...serviceResult.result, role_guard_override: roleGuard.override }
    : serviceResult.result;
  const after = result.status === 'success'
    ? await captureTaskLifecycleEvidenceState(cwd, effectiveOptions.taskNumber, effectiveOptions.store)
    : null;
  if (result.status === 'success') {
    await writeTaskLifecycleMutationEvidence({
      cwd,
      taskNumber: effectiveOptions.taskNumber,
      command: 'task report',
      principal: effectiveOptions.agent,
      authorityClass: 'resolve',
      before,
      after,
      result,
    });
  }
  if (fmt.getFormat() === 'json') {
    const output: Omit<ReportTaskServiceResponse['result'], 'guidance'> & {
      guidance?: ReturnType<typeof formatGuidanceForJson>;
      warning?: string;
    } = {
      ...result,
      ...(result.status === 'success' && effectiveOptions.verbose ? await (async () => {
        const guidanceResponse = await recallAcceptedLearning({
          cwd,
          scopes: ['report', 'task-governance'],
        });
        return guidanceResponse.guidance.length > 0
          ? { guidance: formatGuidanceForJson(guidanceResponse.guidance) }
          : {};
      })() : {}),
    };

    if (result.status === 'success' && result.report_id) {
      try {
        const stateDir = resolvePrincipalStateDir({ cwd, principalStateDir: effectiveOptions.principalStateDir });
        const bridgeResult = await updatePrincipalRuntimeFromTaskEvent(stateDir, {
          type: 'task_reported',
          agent_id: effectiveOptions.agent ?? '',
          task_id: result.task_id ?? '',
          report_id: result.report_id,
        });
        if (bridgeResult.warning && fmt.getFormat() === 'json') {
          output.warning = bridgeResult.warning;
        }
      } catch {
        // advisory only
      }
    }

    return {
      exitCode: serviceResult.exitCode,
      result: output,
    };
  }

  if (serviceResult.exitCode !== ExitCode.SUCCESS) {
    fmt.message((result as { error?: string }).error ?? 'Report failed', 'error');
    return {
      exitCode: serviceResult.exitCode,
      result: result,
    };
  }

  if (result.new_status) {
    fmt.message(`Reported task ${result.task_id}: ${result.new_status}`, 'success');
  }
  if (effectiveOptions.verbose && (result as { status: string }).status === 'success') {
    const guidanceResponse = await recallAcceptedLearning({
      cwd,
      scopes: ['report', 'task-governance'],
    });
    if (guidanceResponse.guidance.length > 0) {
      fmt.message('Active guidance:', 'info');
      for (const line of formatGuidanceForHumans(guidanceResponse.guidance)) {
        fmt.message(line, 'info');
      }
    }
  }

  return {
    exitCode: serviceResult.exitCode,
    result,
  };
}
