import { resolve } from 'node:path';
import {
  createReportId,
  findTaskFile,
  getActiveAssignment,
  isValidTransition,
  loadAssignment,
  readTaskFile,
  saveAssignment,
  saveReport,
  updateAgentRosterEntry,
  writeTaskProjection,
  type WorkResultReport,
} from '../lib/task-governance.js';
import { openTaskLifecycleStore, type TaskStatus } from '../lib/task-lifecycle-store.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  captureTaskLifecycleEvidenceState,
  writeTaskLifecycleMutationEvidence,
} from '../lib/mutation-evidence-writer.js';

export interface TaskDeferOptions {
  taskNumber?: string;
  agent?: string;
  reason?: string;
  unblock?: string;
  residuals?: string;
  cwd?: string;
  format?: 'json' | 'human' | 'auto';
}

function parseResiduals(value: string | undefined): string[] {
  if (!value || value.trim().length === 0) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      throw new Error('residuals must be a JSON array of strings');
    }
    return parsed as string[];
  }
  return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
}

export async function taskDeferCommand(
  options: TaskDeferOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;
  const agentId = options.agent;
  const reason = options.reason?.trim();
  const unblock = options.unblock?.trim();

  if (!taskNumber || !Number.isFinite(Number(taskNumber))) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: 'Invalid or missing task number' } };
  }
  if (!agentId) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--agent is required' } };
  }
  if (!reason) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--reason is required' } };
  }
  if (!unblock) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--unblock is required' } };
  }

  let residuals: string[];
  try {
    residuals = parseResiduals(options.residuals);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: msg } };
  }

  const taskFile = await findTaskFile(cwd, taskNumber);
  if (!taskFile) {
    return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: `Task not found: ${taskNumber}` } };
  }

  const before = await captureTaskLifecycleEvidenceState(cwd, taskNumber);
  const { frontMatter, body } = await readTaskFile(taskFile.path);
  const now = new Date().toISOString();
  const store = openTaskLifecycleStore(cwd);

  try {
    const lifecycle = store.getLifecycleByNumber(Number(taskNumber)) ?? store.getLifecycle(taskFile.taskId);
    const currentStatus = (lifecycle?.status ?? frontMatter.status ?? 'opened') as string;

    if (currentStatus === 'deferred') {
      const result = {
        status: 'success',
        task_id: taskFile.taskId,
        task_number: Number(taskNumber),
        previous_status: currentStatus,
        new_status: 'deferred',
        mutation_performed: false,
        reason: 'Task is already deferred',
      };
      return { exitCode: ExitCode.SUCCESS, result };
    }

    if (currentStatus === 'closed' || currentStatus === 'confirmed') {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Task ${taskFile.taskId} is terminal (${currentStatus}); reopen before deferring` },
      };
    }

    if (!isValidTransition(currentStatus, 'deferred')) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Transition from '${currentStatus}' to 'deferred' is not allowed by the state machine` },
      };
    }

    const deferredPacket = {
      kind: 'task_defer',
      deferred_by: agentId,
      deferred_at: now,
      reason,
      unblock_condition: unblock,
      residuals,
    };

    const assignmentRecord = await loadAssignment(cwd, taskFile.taskId);
    const activeAssignment = assignmentRecord ? getActiveAssignment(assignmentRecord) : null;
    if (activeAssignment) {
      activeAssignment.released_at = now;
      activeAssignment.release_reason = 'deferred';
      await saveAssignment(cwd, assignmentRecord!);
    }

    const activeSqliteAssignment = store.getActiveAssignment(taskFile.taskId);
    if (activeSqliteAssignment) {
      store.releaseAssignment(activeSqliteAssignment.assignment_id, 'deferred');
    }

    const nextFrontMatter = {
      ...frontMatter,
      status: 'deferred',
      deferred_by: agentId,
      deferred_at: now,
      defer_reason: reason,
      unblock_condition: unblock,
      continuation_packet: deferredPacket,
    };
    await writeTaskProjection(taskFile.path, nextFrontMatter, body);

    if (!lifecycle) {
      store.upsertLifecycle({
        task_id: taskFile.taskId,
        task_number: Number(taskNumber),
        status: currentStatus as TaskStatus,
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: now,
      });
    }
    store.updateStatus(taskFile.taskId, 'deferred', agentId, {
      continuation_packet_json: JSON.stringify(deferredPacket),
    });
    const agentRole = store.getRosterEntry(agentId)?.role ?? null;
    const deferredObligations = store.listDirectedObligationsForTask(taskFile.taskId, 'open')
      .filter((obligation) => obligation.target_agent_id === agentId || (agentRole !== null && obligation.target_role === agentRole));
    for (const obligation of deferredObligations) {
      store.transitionDirectedObligation(obligation.obligation_id, 'deferred', agentId, `task-defer:${taskFile.taskId}`);
    }

    const assignmentId = activeSqliteAssignment?.assignment_id
      ?? (activeAssignment ? `assign-${taskFile.taskId}-${activeAssignment.agent_id}-${activeAssignment.claimed_at}` : null)
      ?? `defer-${taskFile.taskId}-${now}`;
    const report: WorkResultReport = {
      report_id: createReportId(taskFile.taskId, agentId, assignmentId),
      task_number: Number(taskNumber),
      task_id: taskFile.taskId,
      agent_id: agentId,
      assignment_id: assignmentId,
      reported_at: now,
      summary: `Deferred: ${reason}`,
      changed_files: [],
      verification: [
        { command: 'narada task defer', result: `Deferred until: ${unblock}` },
      ],
      known_residuals: residuals,
      ready_for_review: false,
      report_status: 'submitted',
    };
    await saveReport(cwd, report);

    try {
      await updateAgentRosterEntry(cwd, agentId, {
        status: 'done',
        task: null,
      });
    } catch {
      // Roster projection is advisory for deferral; lifecycle mutation remains authoritative.
    }

    const after = await captureTaskLifecycleEvidenceState(cwd, taskNumber);
    const result = {
      status: 'success',
      task_id: taskFile.taskId,
      task_number: Number(taskNumber),
      previous_status: currentStatus,
      new_status: 'deferred',
      deferred_by: agentId,
      deferred_at: now,
      report_id: report.report_id,
      unblock_condition: unblock,
      residuals,
      directed_obligations: {
        deferred: deferredObligations.map((obligation) => obligation.obligation_id),
        consumption_kind: 'defer',
      },
    };
    await writeTaskLifecycleMutationEvidence({
      cwd,
      taskNumber,
      command: 'task defer',
      principal: agentId,
      authorityClass: 'resolve',
      before,
      after,
      result,
    });

    if (fmt.getFormat() === 'json') {
      return { exitCode: ExitCode.SUCCESS, result };
    }
    fmt.message(`Deferred task ${taskFile.taskId}`, 'success');
    fmt.kv('Reason', reason);
    fmt.kv('Unblock', unblock);
    return { exitCode: ExitCode.SUCCESS, result };
  } finally {
    store.db.close();
  }
}
