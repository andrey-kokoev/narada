/**
 * Governed task close CLI adapter.
 *
 * Domain transition logic lives in @narada2/task-governance-core.
 */

import { resolve } from 'node:path';
import { closeTaskService } from '@narada2/task-governance-core/task-close-service';
import { admitTaskEvidence } from '../lib/evidence-admission.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import type { TaskClosureMode, TaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import {
  captureTaskLifecycleEvidenceState,
  writeTaskLifecycleMutationEvidence,
} from '../lib/mutation-evidence-writer.js';
import { enforceBuilderOwnedLifecycleGuard } from '../lib/task-role-guard.js';
import { operatorSurfaceTaskAuthorityRepair } from '../lib/operator-surface-task-authority.js';

export interface TaskCloseOptions {
  taskNumber: string;
  by?: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
  store?: TaskLifecycleStore;
  mode?: TaskClosureMode;
  overrideRationale?: string;
  noContinuationNeeded?: string;
}

export async function taskCloseCommand(
  options: TaskCloseOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskAuthorityRepair = await operatorSurfaceTaskAuthorityRepair(cwd, options.by);
  if (taskAuthorityRepair) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        reason: 'operator_surface_identity_missing_task_authority',
        error: `Operator Surface identity ${taskAuthorityRepair.identity_id} is not admitted to task authority`,
        operator_surface_task_authority: taskAuthorityRepair,
        repair_command: taskAuthorityRepair.repair_command,
      },
    };
  }
  const roleGuard = await enforceBuilderOwnedLifecycleGuard({
    cwd,
    taskNumber: options.taskNumber,
    actor: options.by,
    action: 'close',
    overrideRationale: options.overrideRationale,
  });
  if (!roleGuard.ok) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: roleGuard.error },
    };
  }
  const before = await captureTaskLifecycleEvidenceState(cwd, options.taskNumber, options.store);
  // Ensure an Evidence Admission result exists before attempting close,
  // but do not overwrite an existing (possibly rejected) admission result.
  try {
    const admissionStore = options.store ?? openTaskLifecycleStore(cwd);
    const ownsAdmissionStore = options.store ? null : admissionStore;
    try {
      const lifecycle = admissionStore.getLifecycleByNumber(Number(options.taskNumber));
      const existingAdmission = lifecycle
        ? admissionStore.getLatestEvidenceAdmissionResult(lifecycle.task_id)
        : null;
      const existingMethods: string[] = existingAdmission
        ? (JSON.parse(existingAdmission.methods_json ?? '[]') as string[])
        : [];
      const isCriteriaOnlyProof =
        existingMethods.length === 1 && existingMethods[0] === 'criteria_proof';
      if (!existingAdmission || isCriteriaOnlyProof) {
        await admitTaskEvidence({
          cwd,
          taskNumber: Number(options.taskNumber),
          admittedBy: options.by ?? 'operator',
          methods: ['admission'],
          store: admissionStore,
        });
      }
    } finally {
      if (ownsAdmissionStore) ownsAdmissionStore.db.close();
    }
  } catch {
    // Admission failures are surfaced by closeTaskService's gate checks.
  }
  const serviceResult = await closeTaskService({
    taskNumber: options.taskNumber,
    by: options.by,
    cwd,
    store: options.store,
    mode: options.mode ?? 'operator_direct',
    noContinuationNeeded: options.noContinuationNeeded,
  });
  const result = roleGuard.override
    ? { ...serviceResult.result, role_guard_override: roleGuard.override }
    : serviceResult.result;
  const after = result.status === 'success'
    ? await captureTaskLifecycleEvidenceState(cwd, options.taskNumber, options.store)
    : null;
  if (result.status === 'success') {
    await writeTaskLifecycleMutationEvidence({
      cwd,
      taskNumber: options.taskNumber,
      command: 'task close',
      principal: options.by,
      authorityClass: 'confirm',
      before,
      after,
      result,
    });
  }

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
      const closureClaim = result.closure_claim as { applies?: boolean; capability_complete?: boolean } | undefined;
      if (closureClaim?.applies && closureClaim.capability_complete === false) {
        fmt.message('Closed scope-complete work without claiming capability-complete delivery.', 'warning');
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
      const closureClaim = result.closure_claim as { warning?: string } | undefined;
      if (closureClaim?.warning) {
        fmt.message(`  ! ${closureClaim.warning}`, 'warning');
      }
      fmt.message('Close modes: operator_direct, peer_reviewed, agent_finish, emergency.', 'info');
      fmt.message('If a peer review accepted the report, `narada task review <n> --verdict accepted` may already have closed the task.', 'info');
    }
  }

  return {
    exitCode: serviceResult.exitCode as unknown as ExitCode,
    result,
  };
}
