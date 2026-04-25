/**
 * Task continuation / takeover operator.
 *
 * Mutation: assigns a continuation or takeover agent to an already-claimed
 * or continuation-ready task, recording intent durably in assignment history.
 */

import { resolve } from 'node:path';
import {
  loadAssignment,
  saveAssignment,
  writeTaskFile,
  continuationReasonToIntent,
  type TaskAssignmentRecord,
  type TaskAssignment,
  type TaskContinuation,
} from '../lib/task-governance.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import {
  admitAssignmentIntent,
  ensureLifecycleForAssignment,
  recordAssignmentIntentApplied,
  recordAssignmentIntentFailed,
} from '../lib/assignment-intent.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export type ContinuationReason =
  | 'evidence_repair'
  | 'review_fix'
  | 'handoff'
  | 'blocked_agent'
  | 'operator_override';

const ALLOWED_REASONS: ContinuationReason[] = [
  'evidence_repair',
  'review_fix',
  'handoff',
  'blocked_agent',
  'operator_override',
];

export interface TaskContinueOptions {
  taskNumber?: string;
  format?: 'json' | 'human' | 'auto';
  agent?: string;
  reason?: ContinuationReason;
  cwd?: string;
}

export async function taskContinueCommand(
  options: TaskContinueOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = (options as Record<string, unknown>).taskNumber as string | undefined;
  const agentId = options.agent;
  const reason = options.reason;

  if (!taskNumber) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Task number is required' },
    };
  }

  if (!agentId) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--agent is required' },
    };
  }

  if (!reason) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--reason is required' },
    };
  }

  if (!ALLOWED_REASONS.includes(reason)) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Invalid reason: ${reason}. Must be one of: ${ALLOWED_REASONS.join(', ')}`,
      },
    };
  }

  const admission = await admitAssignmentIntent(cwd, {
    kind: 'continue',
    taskNumber: Number(taskNumber),
    agentId,
    requestedBy: agentId,
    reason,
  });
  if (!admission.ok) {
    return { exitCode: admission.exitCode as ExitCode, result: admission.result };
  }

  const { taskFile, frontMatter, body } = admission;
  const currentStatus = admission.currentStatus;
  const existing = await loadAssignment(cwd, taskFile.taskId);
  const active = existing?.assignments.find((a) => a.released_at === null && a.agent_id === admission.previousAgentId);
  if (!active) {
    recordAssignmentIntentFailed(cwd, admission.intent.request_id, 'Active assignment disappeared after admission');
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} has no active assignment to continue from.`,
        assignment_intent_id: admission.intent.request_id,
      },
    };
  }

  const now = new Date().toISOString();
  const record: TaskAssignmentRecord = existing ?? {
    task_id: taskFile.taskId,
    assignments: [],
    continuations: [],
  };

  if (!record.continuations) {
    record.continuations = [];
  }

  const supersedes = admission.supersedes;

  try {
    if (supersedes) {
      active.released_at = now;
      active.release_reason = 'continued';

      const newAssignment: TaskAssignment = {
        agent_id: agentId,
        claimed_at: now,
        claim_context: null,
        released_at: null,
        release_reason: null,
        continuation_reason: reason,
        previous_agent_id: active.agent_id,
        intent: continuationReasonToIntent(reason),
      };
      record.assignments.push(newAssignment);
    } else {
      const continuation: TaskContinuation = {
        agent_id: agentId,
        started_at: now,
        reason,
        previous_agent_id: active.agent_id,
      };
      record.continuations.push(continuation);
    }

    if (currentStatus === 'needs_continuation') {
      frontMatter.status = 'claimed';
      await writeTaskFile(taskFile.path, frontMatter, body);
    }

    const store = openTaskLifecycleStore(cwd);
    try {
      ensureLifecycleForAssignment(store, taskFile.taskId, Number(taskNumber), frontMatter);
      if (currentStatus === 'needs_continuation') {
        store.updateStatus(taskFile.taskId, 'claimed', agentId);
      }
    } finally {
      store.db.close();
    }

    await saveAssignment(cwd, record);

    const assignmentStore = openTaskLifecycleStore(cwd);
    try {
      if (supersedes) {
        const activeRow = assignmentStore.getActiveAssignment(taskFile.taskId);
        if (activeRow) {
          assignmentStore.releaseAssignment(activeRow.assignment_id, 'continued');
        }
        assignmentStore.insertAssignment({
          assignment_id: admission.intent.assignment_id ?? `assign-${taskFile.taskId}-${agentId}-${Date.now()}`,
          task_id: taskFile.taskId,
          agent_id: agentId,
          claimed_at: now,
          released_at: null,
          release_reason: null,
          intent: continuationReasonToIntent(reason),
        });
      }
    } finally {
      assignmentStore.db.close();
    }

    const { updateAgentRosterEntry } = await import('../lib/task-governance.js');
    await updateAgentRosterEntry(cwd, agentId, {
      status: 'working',
      task: Number(taskNumber) || null,
    });

    recordAssignmentIntentApplied(cwd, admission.intent.request_id, {
      lifecycleStatusAfter: frontMatter.status ?? null,
      rosterStatusAfter: 'working',
      assignmentId: admission.intent.assignment_id,
      confirmation: {
        task_id: taskFile.taskId,
        task_number: Number(taskNumber),
        supersedes,
        previous_agent_id: active.agent_id,
        lifecycle_status: frontMatter.status,
        roster_status: 'working',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    recordAssignmentIntentFailed(cwd, admission.intent.request_id, msg);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg, assignment_intent_id: admission.intent.request_id },
    };
  }

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        task_id: taskFile.taskId,
        agent_id: agentId,
        reason,
        supersedes,
        previous_agent_id: active.agent_id,
        task_status: frontMatter.status,
        continued_at: now,
        assignment_intent_id: admission.intent.request_id,
      },
    };
  }

  fmt.message(
    `Continued task ${taskFile.taskId} → ${agentId} (reason: ${reason})`,
    'success',
  );
  if (supersedes) {
    fmt.message(`  Prior assignment by ${active.agent_id} was released (continued).`, 'info');
  } else {
    fmt.message(`  Prior assignment by ${active.agent_id} remains active.`, 'info');
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      task_id: taskFile.taskId,
      agent_id: agentId,
      reason,
      supersedes,
      previous_agent_id: active.agent_id,
      assignment_intent_id: admission.intent.request_id,
    },
  };
}
