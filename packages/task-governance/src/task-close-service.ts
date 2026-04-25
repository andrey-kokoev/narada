import { resolve } from 'node:path';
import {
  findTaskFile,
  readTaskFile,
  writeTaskProjection,
  inspectTaskEvidence,
  isValidTransition,
  hasDerivativeFiles,
  loadRoster,
  updateAgentRosterEntry,
  loadAssignment,
  getActiveAssignment,
  saveAssignment,
} from './task-governance.js';
import { ExitCode } from './exit-codes.js';
import {
  openTaskLifecycleStore,
  type TaskClosureMode,
  type TaskLifecycleStore,
  type TaskStatus,
} from './task-lifecycle-store.js';

export interface CloseTaskServiceOptions {
  taskNumber: string;
  by?: string;
  cwd?: string;
  store?: TaskLifecycleStore;
  mode: TaskClosureMode;
}

export async function closeTaskService(
  options: CloseTaskServiceOptions,
): Promise<{ exitCode: ExitCode; result: Record<string, unknown> }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;
  const closedBy = options.by ?? 'operator';
  const closureMode = options.mode;

  if (!taskNumber || !Number.isFinite(Number(taskNumber))) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Invalid or missing task number' },
    };
  }

  if (!closureMode || !['operator_direct', 'peer_reviewed', 'agent_finish', 'emergency'].includes(closureMode)) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Invalid closure mode: ${closureMode}` },
    };
  }

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

  const { frontMatter, body } = await readTaskFile(taskFile.path);
  const ownStore = options.store ? null : openTaskLifecycleStore(cwd);
  const closeOwnStore = () => {
    if (ownStore) ownStore.db.close();
  };
  const store = options.store ?? ownStore ?? undefined;

  let sqliteStatus: string | undefined;
  if (store) {
    let lifecycle = store.getLifecycle(taskFile.taskId);
    if (!lifecycle) {
      const taskNum = Number(taskNumber);
      if (!Number.isFinite(taskNum)) {
        closeOwnStore();
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: { status: 'error', error: 'Cannot determine task number for SQLite backfill' },
        };
      }
      store.upsertLifecycle({
        task_id: taskFile.taskId,
        task_number: taskNum,
        status: (frontMatter.status as TaskStatus) ?? 'opened',
        governed_by: (frontMatter.governed_by as string) || null,
        closed_at: (frontMatter.closed_at as string) || null,
        closed_by: (frontMatter.closed_by as string) || null,
        reopened_at: (frontMatter.reopened_at as string) || null,
        reopened_by: (frontMatter.reopened_by as string) || null,
        continuation_packet_json: null,
        updated_at: new Date().toISOString(),
      });
      lifecycle = store.getLifecycle(taskFile.taskId)!;
    }
    sqliteStatus = lifecycle.status;
  }

  const currentStatus = sqliteStatus ?? (frontMatter.status as string | undefined);
  const evidence = await inspectTaskEvidence(cwd, taskNumber);

  if (currentStatus === 'closed' || currentStatus === 'confirmed') {
    const isValid = evidence.violations.length === 0;
    closeOwnStore();
    return {
      exitCode: isValid ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result: {
        status: isValid ? 'ok' : 'error',
        task_id: taskFile.taskId,
        task_number: Number(taskNumber),
        current_status: currentStatus,
        valid: isValid,
        ...(isValid
          ? { message: `Task ${taskFile.taskId} is ${currentStatus} and valid by evidence` }
          : { violations: evidence.violations, warnings: evidence.warnings }),
      },
    };
  }

  if (!isValidTransition(currentStatus, 'closed')) {
    closeOwnStore();
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Transition from '${String(currentStatus)}' to 'closed' is not allowed by the state machine`,
      },
    };
  }

  const num = Number.isFinite(Number(taskNumber)) ? Number(taskNumber) : null;
  const admission = store?.getLatestEvidenceAdmissionResult(taskFile.taskId);
  const gateFailures: string[] = [];
  if (!admission) {
    gateFailures.push('Task lacks an Evidence Admission result; run `narada task evidence admit <task-number> --by <id>` first');
  } else if (admission.verdict !== 'admitted') {
    gateFailures.push(`Latest Evidence Admission result is ${admission.verdict}`);
  } else if (admission.lifecycle_eligible_status !== 'closed') {
    gateFailures.push('Latest Evidence Admission result is not eligible for lifecycle close');
  }
  if (num !== null && await hasDerivativeFiles(cwd, num) && !gateFailures.includes('Derivative task-status files exist')) {
    gateFailures.push('Derivative task-status files exist');
  }

  if (gateFailures.length > 0) {
    const remediation: string[] = [];
    if (evidence.all_criteria_checked === false) {
      remediation.push('  -> Check all acceptance criteria: replace `- [ ]` with `- [x]` in `## Acceptance Criteria`');
    }
    if (!evidence.has_execution_notes) {
      remediation.push('  -> Add `## Execution Notes` section describing what was done and why');
    }
    if (!evidence.has_verification) {
      remediation.push('  -> Add `## Verification` section with commands run and results observed');
    }
    if (num !== null && await hasDerivativeFiles(cwd, num)) {
      remediation.push('  -> Remove derivative task-status files (`-EXECUTED.md`, `-DONE.md`, etc.)');
    }

    closeOwnStore();
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        task_id: taskFile.taskId,
        task_number: Number(taskNumber),
        current_status: currentStatus,
        gate_failures: gateFailures,
        admission_result: admission ?? null,
        remediation,
        violations: evidence.violations,
      },
    };
  }

  const now = new Date().toISOString();
  if (store) {
    store.updateStatus(taskFile.taskId, 'closed', closedBy, {
      closed_at: now,
      closed_by: closedBy,
      governed_by: `task_close:${closedBy}`,
      closure_mode: closureMode,
    });
  }

  frontMatter.status = 'closed';
  frontMatter.closed_at = now;
  frontMatter.closed_by = closedBy;
  frontMatter.governed_by = `task_close:${closedBy}`;
  frontMatter.closure_mode = closureMode;
  await writeTaskProjection(taskFile.path, frontMatter, body);

  let assignmentReleased = false;
  try {
    const assignmentRecord = await loadAssignment(cwd, taskFile.taskId);
    if (assignmentRecord) {
      const active = getActiveAssignment(assignmentRecord);
      if (active) {
        active.released_at = now;
        active.release_reason = 'completed';
        await saveAssignment(cwd, assignmentRecord);
        assignmentReleased = true;
      }
    }
  } catch {
    // Best-effort: lifecycle closure remains authoritative.
  }

  let rosterReconciled = false;
  let reconciledAgentId: string | null = null;
  try {
    const roster = await loadRoster(cwd);
    const assignedAgent = roster.agents.find((a) => a.task === num);
    if (assignedAgent) {
      await updateAgentRosterEntry(cwd, assignedAgent.agent_id, {
        status: 'done',
        task: null,
        last_done: num,
      });
      rosterReconciled = true;
      reconciledAgentId = assignedAgent.agent_id;
    }
  } catch {
    // Best-effort compatibility projection.
  }

  closeOwnStore();
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      task_id: taskFile.taskId,
      task_number: Number(taskNumber),
      new_status: 'closed',
      closed_by: closedBy,
      closure_mode: closureMode,
      closed_at: frontMatter.closed_at,
      admission_id: admission?.admission_id,
      assignment_released: assignmentReleased,
      roster_reconciled: rosterReconciled,
      ...(reconciledAgentId ? { reconciled_agent_id: reconciledAgentId } : {}),
    },
  };
}
