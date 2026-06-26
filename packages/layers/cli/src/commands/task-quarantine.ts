import { resolve } from 'node:path';
import { quarantineWrongLocusTaskService } from '@narada2/task-governance/task-quarantine-service';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import type { TaskLifecycleStore } from '../lib/task-lifecycle-store.js';

export interface TaskQuarantineOptions {
  taskNumber: string;
  by?: string;
  rationale?: string;
  evidenceRef?: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
  store?: TaskLifecycleStore;
}

export async function taskQuarantineCommand(
  options: TaskQuarantineOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const serviceResult = await quarantineWrongLocusTaskService({
    taskNumber: options.taskNumber,
    by: options.by,
    rationale: options.rationale ?? 'wrong-locus task contamination',
    evidenceRef: options.evidenceRef,
    cwd,
    store: options.store,
  });
  const result = serviceResult.result;

  if (fmt.getFormat() !== 'json') {
    if (result.status === 'success') {
      fmt.message(`Quarantined wrong-locus task ${result.task_id}`, 'success');
      fmt.kv('Quarantined by', result.quarantined_by);
      fmt.kv('Evidence', result.evidence_ref ?? 'none');
      if (result.assignment_released && result.reconciled_agent_id) {
        fmt.message(`Released active assignment for ${result.reconciled_agent_id}`, 'success');
      }
    } else {
      fmt.message(result.error, 'error');
    }
  }

  return {
    exitCode: serviceResult.exitCode as unknown as ExitCode,
    result,
  };
}
