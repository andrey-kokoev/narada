import { resolve } from 'node:path';
import { ExitCode } from './exit-codes.js';
import type { TaskLifecycleStore } from './task-lifecycle-store.js';
import { openTaskLifecycleStore } from './task-lifecycle-store.js';
import {
  findTaskFile,
  getActiveAssignment,
  isValidTransition,
  loadAssignment,
  readTaskFile,
  saveAssignment,
  updateAgentRosterEntry,
  writeTaskFile,
  type TaskFrontMatter,
} from './task-governance.js';

export interface QuarantineTaskServiceOptions {
  taskNumber: string;
  by?: string;
  rationale: string;
  evidenceRef?: string;
  cwd?: string;
  store?: TaskLifecycleStore;
}

export type QuarantineTaskServiceResult =
  | {
      status: 'success';
      task_id: string;
      task_number: number;
      previous_status: string | undefined;
      new_status: 'quarantined';
      quarantined_by: string;
      quarantined_at: string;
      evidence_ref: string | null;
      assignment_released: boolean;
      roster_reconciled: boolean;
      reconciled_agent_id: string | null;
    }
  | {
      status: 'error';
      task_id?: string;
      task_number: number | null;
      error: string;
      current_status?: string;
    };

function appendQuarantineNote(body: string, details: {
  by: string;
  at: string;
  rationale: string;
  evidenceRef: string | null;
}): string {
  const section = [
    '## Wrong-Locus Quarantine',
    '',
    `- quarantined_by: ${details.by}`,
    `- quarantined_at: ${details.at}`,
    `- rationale: ${details.rationale}`,
    `- evidence_ref: ${details.evidenceRef ?? 'none'}`,
    '',
    'This task was removed from active executable workboards without marking its original acceptance criteria complete.',
    '',
  ].join('\n');

  return body.includes('## Wrong-Locus Quarantine')
    ? body
    : `${body.trimEnd()}\n\n${section}`;
}

export async function quarantineWrongLocusTaskService(
  options: QuarantineTaskServiceOptions,
): Promise<{ exitCode: ExitCode; result: QuarantineTaskServiceResult }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const actor = options.by ?? 'operator';
  const taskNumber = Number(options.taskNumber);
  if (!Number.isFinite(taskNumber)) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        task_number: null,
        error: `Invalid task number: ${options.taskNumber}`,
      },
    };
  }

  const taskFile = await findTaskFile(cwd, options.taskNumber);
  if (!taskFile) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        task_number: taskNumber,
        error: `Task file not found: ${options.taskNumber}`,
      },
    };
  }

  const { frontMatter, body } = await readTaskFile(taskFile.path);
  const currentStatus = frontMatter.status as string | undefined;
  if (!isValidTransition(currentStatus, 'quarantined')) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        task_id: taskFile.taskId,
        task_number: taskNumber,
        current_status: currentStatus,
        error: `Task ${taskFile.taskId} cannot be quarantined from status '${currentStatus ?? 'missing'}'`,
      },
    };
  }

  const now = new Date().toISOString();
  const evidenceRef = options.evidenceRef ?? null;
  const packet = {
    disposition: 'wrong_locus',
    quarantined_by: actor,
    quarantined_at: now,
    rationale: options.rationale,
    evidence_ref: evidenceRef,
  };

  const nextFrontMatter: TaskFrontMatter = {
    ...frontMatter,
    status: 'quarantined',
    governed_by: `wrong_locus:${actor}`,
    wrong_locus_quarantined_at: now,
    wrong_locus_quarantined_by: actor,
    wrong_locus_evidence_ref: evidenceRef,
  };
  const nextBody = appendQuarantineNote(body, {
    by: actor,
    at: now,
    rationale: options.rationale,
    evidenceRef,
  });

  let assignmentReleased = false;
  let rosterReconciled = false;
  let reconciledAgentId: string | null = null;

  const assignment = await loadAssignment(cwd, taskFile.taskId);
  const active = assignment ? getActiveAssignment(assignment) : null;
  if (assignment && active) {
    active.released_at = now;
    active.release_reason = 'wrong_locus';
    await saveAssignment(cwd, assignment);
    assignmentReleased = true;
    reconciledAgentId = active.agent_id;
    try {
      await updateAgentRosterEntry(cwd, active.agent_id, {
        status: 'idle',
        task: null,
        last_done: null,
      });
      rosterReconciled = true;
    } catch {
      rosterReconciled = false;
    }
  }

  await writeTaskFile(taskFile.path, nextFrontMatter, nextBody);

  const store = options.store ?? openTaskLifecycleStore(cwd);
  try {
    if (!store.getLifecycle(taskFile.taskId)) {
      store.upsertLifecycle({
        task_id: taskFile.taskId,
        task_number: taskNumber,
        status: currentStatus === 'claimed' ? 'claimed' : 'opened',
        governed_by: typeof frontMatter.governed_by === 'string' ? frontMatter.governed_by : null,
        closed_at: typeof frontMatter.closed_at === 'string' ? frontMatter.closed_at : null,
        closed_by: typeof frontMatter.closed_by === 'string' ? frontMatter.closed_by : null,
        closure_mode: null,
        reopened_at: typeof frontMatter.reopened_at === 'string' ? frontMatter.reopened_at : null,
        reopened_by: typeof frontMatter.reopened_by === 'string' ? frontMatter.reopened_by : null,
        continuation_packet_json: null,
        updated_at: now,
      });
    }
    const activeSqlite = store.getActiveAssignment(taskFile.taskId);
    if (activeSqlite) {
      store.releaseAssignment(activeSqlite.assignment_id, 'wrong_locus');
      assignmentReleased = true;
      if (!reconciledAgentId) {
        reconciledAgentId = activeSqlite.agent_id;
      }
      if (!rosterReconciled) {
        try {
          await updateAgentRosterEntry(cwd, activeSqlite.agent_id, {
            status: 'idle',
            task: null,
            last_done: null,
          });
          rosterReconciled = true;
        } catch {
          rosterReconciled = false;
        }
      }
    }
    store.updateStatus(taskFile.taskId, 'quarantined', actor, {
      governed_by: `wrong_locus:${actor}`,
      continuation_packet_json: JSON.stringify(packet),
    });
  } finally {
    if (!options.store) store.db.close();
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      task_id: taskFile.taskId,
      task_number: taskNumber,
      previous_status: currentStatus,
      new_status: 'quarantined',
      quarantined_by: actor,
      quarantined_at: now,
      evidence_ref: evidenceRef,
      assignment_released: assignmentReleased,
      roster_reconciled: rosterReconciled,
      reconciled_agent_id: reconciledAgentId,
    },
  };
}
