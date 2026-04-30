import { resolve } from 'node:path';
import {
  findTaskFile,
  isValidTransition,
  readTaskFile,
  writeTaskProjection,
} from '../lib/task-governance.js';
import { openTaskLifecycleStore, type TaskStatus } from '../lib/task-lifecycle-store.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  captureTaskLifecycleEvidenceState,
  writeTaskLifecycleMutationEvidence,
} from '../lib/mutation-evidence-writer.js';
import { checkLawAdmission, lawUpdateRequiredResult } from '../lib/law-sync.js';

export interface TaskUnblockOptions {
  taskNumber?: string;
  agent?: string;
  evidence?: string;
  rationale?: string;
  cwd?: string;
  format?: 'json' | 'human' | 'auto';
}

export async function taskUnblockCommand(
  options: TaskUnblockOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;
  const agentId = options.agent;
  const evidence = options.evidence?.trim();
  const rationale = options.rationale?.trim();

  if (!taskNumber || !Number.isFinite(Number(taskNumber))) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: 'Invalid or missing task number' } };
  }
  if (!agentId) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--agent is required' } };
  }
  if (!evidence) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--evidence is required' } };
  }
  if (!rationale) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--rationale is required' } };
  }

  const lawAdmission = await checkLawAdmission(cwd, agentId);
  if (lawAdmission.status === 'blocked') {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: lawUpdateRequiredResult(lawAdmission),
    };
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

    if (currentStatus !== 'deferred') {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: `Task ${taskFile.taskId} is ${currentStatus}; only deferred tasks can be unblocked`,
        },
      };
    }

    if (!isValidTransition(currentStatus, 'opened')) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Transition from '${currentStatus}' to 'opened' is not allowed by the state machine` },
      };
    }

    const unblockPacket = {
      kind: 'task_unblock',
      unblocked_by: agentId,
      unblocked_at: now,
      evidence,
      rationale,
      previous_unblock_condition: frontMatter.unblock_condition ?? null,
    };

    const nextFrontMatter = {
      ...frontMatter,
      status: 'opened',
      unblocked_by: agentId,
      unblocked_at: now,
      unblock_evidence: evidence,
      unblock_rationale: rationale,
      continuation_packet: unblockPacket,
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
    store.updateStatus(taskFile.taskId, 'opened', agentId, {
      continuation_packet_json: JSON.stringify(unblockPacket),
    });

    const after = await captureTaskLifecycleEvidenceState(cwd, taskNumber);
    const result = {
      status: 'success',
      task_id: taskFile.taskId,
      task_number: Number(taskNumber),
      previous_status: currentStatus,
      new_status: 'opened',
      unblocked_by: agentId,
      unblocked_at: now,
      evidence,
      rationale,
    };
    await writeTaskLifecycleMutationEvidence({
      cwd,
      taskNumber,
      command: 'task unblock',
      principal: agentId,
      authorityClass: 'resolve',
      before,
      after,
      result,
    });

    if (fmt.getFormat() === 'json') {
      return { exitCode: ExitCode.SUCCESS, result };
    }
    fmt.message(`Unblocked task ${taskFile.taskId}`, 'success');
    fmt.kv('Evidence', evidence);
    fmt.kv('Rationale', rationale);
    return { exitCode: ExitCode.SUCCESS, result };
  } finally {
    store.db.close();
  }
}
