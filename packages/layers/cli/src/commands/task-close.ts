/**
 * Governed task close CLI adapter.
 *
 * Domain transition logic lives in @narada2/task-governance.
 */

import { resolve } from 'node:path';
import { closeTaskService } from '@narada2/task-governance/task-close-service';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import type { TaskClosureMode, TaskLifecycleStore } from '../lib/task-lifecycle-store.js';

export interface TaskCloseOptions {
  taskNumber: string;
  by?: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
  store?: TaskLifecycleStore;
  mode: TaskClosureMode;
}

export async function taskCloseCommand(
  options: TaskCloseOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const serviceResult = await closeTaskService({
    taskNumber: options.taskNumber,
    by: options.by,
    cwd,
    store: options.store,
    mode: options.mode,
  });
  const result = serviceResult.result;

  if (fmt.getFormat() !== 'json') {
    if (result.status === 'success') {
      fmt.message(`Closed task ${String(result.task_id)}`, 'success');
      fmt.kv('Closed by', String(result.closed_by));
      fmt.kv('Closure mode', String(result.closure_mode));
      fmt.kv('Closed at', String(result.closed_at));
      if (result.assignment_released) {
        fmt.message('Released active assignment', 'success');
      }
      if (result.roster_reconciled && result.reconciled_agent_id) {
        fmt.message(`Reconciled roster: cleared assignment for ${String(result.reconciled_agent_id)}`, 'success');
      }
    } else if (result.status === 'ok') {
      fmt.message(String(result.message ?? `Task ${String(result.task_id)} is valid by evidence`), 'success');
    } else {
      fmt.message(String(result.error ?? `Cannot close task ${String(result.task_id ?? options.taskNumber)}`), 'error');
      const gateFailures = Array.isArray(result.gate_failures) ? result.gate_failures : [];
      for (const failure of gateFailures) {
        fmt.message(`  X ${String(failure)}`, 'error');
      }
      const remediation = Array.isArray(result.remediation) ? result.remediation : [];
      if (remediation.length > 0) {
        fmt.message('Remediation:', 'info');
        for (const item of remediation) {
          fmt.message(String(item), 'info');
        }
      }
      const violations = Array.isArray(result.violations) ? result.violations : [];
      for (const violation of violations) {
        fmt.message(`  X ${String(violation)}`, 'error');
      }
      const warnings = Array.isArray(result.warnings) ? result.warnings : [];
      for (const warning of warnings) {
        fmt.message(`  ! ${String(warning)}`, 'warning');
      }
    }
  }

  return {
    exitCode: serviceResult.exitCode as unknown as ExitCode,
    result,
  };
}
