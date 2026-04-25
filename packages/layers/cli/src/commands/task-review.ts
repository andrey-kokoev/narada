import { resolve } from 'node:path';
import { type TaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import { reviewTaskService, type ReviewTaskServiceOptions, type ReviewTaskServiceResponse } from '@narada2/task-governance/task-review-service';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  resolvePrincipalStateDir,
  updatePrincipalRuntimeFromTaskEvent,
} from '../lib/principal-bridge.js';

export interface TaskReviewOptions {
  taskNumber?: string;
  format?: 'json' | 'human' | 'auto';
  agent?: string;
  verdict?: 'accepted' | 'accepted_with_notes' | 'rejected';
  findings?: string;
  report?: string;
  cwd?: string;
  principalStateDir?: string;
  store?: TaskLifecycleStore;
}

export async function taskReviewCommand(
  options: TaskReviewOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  const serviceResult = await reviewTaskService({
    taskNumber: options.taskNumber,
    agent: options.agent,
    verdict: options.verdict,
    findings: options.findings,
    report: options.report,
    cwd,
    store: options.store,
  } as ReviewTaskServiceOptions);

  const result = serviceResult.result;

  if (fmt.getFormat() === 'json') {
    if (result.status === 'success' && result.verdict) {
      try {
        const stateDir = resolvePrincipalStateDir({ cwd, principalStateDir: options.principalStateDir });
        const bridgeResult = await updatePrincipalRuntimeFromTaskEvent(stateDir, {
          type: result.verdict === 'rejected' ? 'task_review_rejected' : 'task_review_accepted',
          agent_id: options.agent ?? '',
          task_id: result.task_id ?? '',
          review_id: result.review_id ?? '',
        });
        if (bridgeResult.warning && !('evidence_blocked' in result)) {
          const output = { ...(result as Record<string, unknown>) } as ReviewTaskServiceResponse['result'] & { warning?: string };
          output.warning = bridgeResult.warning;
          return {
            exitCode: serviceResult.exitCode,
            result: output,
          };
        }
      } catch {
        // advisory only
      }
    }
    return {
      exitCode: serviceResult.exitCode,
      result,
    };
  }

  if (serviceResult.exitCode !== ExitCode.SUCCESS) {
    fmt.message((result as { error?: string }).error ?? 'Review failed', 'error');
  } else if (result.status === 'success' && 'new_status' in result) {
    const target = (result as { verdict: string; new_status: string }).new_status;
    const evidenceBlocked = (result as { evidence_blocked?: boolean }).evidence_blocked;
    if (evidenceBlocked) {
      fmt.message(`Reviewed task ${String((result as { task_id?: string }).task_id)}: ${(result as { verdict: string }).verdict} → ${target} (evidence gate blocked)`, 'warning');
    } else {
      fmt.message(`Reviewed task ${String((result as { task_id?: string }).task_id)}: ${(result as { verdict: string }).verdict} → ${target}`, 'success');
    }
  }

  return {
    exitCode: serviceResult.exitCode,
    result,
  };
}
