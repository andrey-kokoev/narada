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

export interface TaskReportOptions {
  taskNumber?: string;
  format?: 'json' | 'human' | 'auto';
  agent?: string;
  summary?: string;
  changedFiles?: string;
  verification?: string;
  residuals?: string;
  cwd?: string;
  principalStateDir?: string;
  verbose?: boolean;
  store?: TaskLifecycleStore;
}

export async function taskReportCommand(
  options: TaskReportOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  const serviceResult = await reportTaskService({
    taskNumber: options.taskNumber,
    agent: options.agent,
    summary: options.summary,
    changedFiles: options.changedFiles,
    verification: options.verification,
    residuals: options.residuals,
    cwd,
    store: options.store,
  } as ReportTaskServiceOptions);

  const result = serviceResult.result;
  if (fmt.getFormat() === 'json') {
    const output: Omit<ReportTaskServiceResponse['result'], 'guidance'> & {
      guidance?: ReturnType<typeof formatGuidanceForJson>;
      warning?: string;
    } = {
      ...result,
      ...(result.status === 'success' && options.verbose ? await (async () => {
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
        const stateDir = resolvePrincipalStateDir({ cwd, principalStateDir: options.principalStateDir });
        const bridgeResult = await updatePrincipalRuntimeFromTaskEvent(stateDir, {
          type: 'task_reported',
          agent_id: options.agent ?? '',
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
  if (options.verbose && (result as { status: string }).status === 'success') {
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
