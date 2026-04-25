/**
 * Task claim operator.
 *
 * Mutation: claims a task for an agent, creating an assignment record
 * and updating the task file status to `claimed`.
 */

import { resolve } from 'node:path';
import {
  loadAssignment,
  saveAssignment,
  writeTaskFile,
  updateAgentRosterEntry,
  type TaskAssignmentRecord,
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
import {
  resolvePrincipalStateDir,
  updatePrincipalRuntimeFromTaskEvent,
} from '../lib/principal-bridge.js';

export interface TaskClaimOptions {
  taskNumber?: string;
  format?: 'json' | 'human' | 'auto';
  agent?: string;
  reason?: string;
  cwd?: string;
  updatePrincipalRuntime?: boolean;
  principalStateDir?: string;
}

export async function taskClaimCommand(
  options: TaskClaimOptions,
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

  const admission = await admitAssignmentIntent(cwd, {
    kind: 'claim',
    taskNumber: Number(taskNumber),
    agentId,
    requestedBy: agentId,
    reason: reason ?? null,
  });
  if (!admission.ok) {
    return {
      exitCode: admission.exitCode as ExitCode,
      result: admission.result,
    };
  }

  const { taskFile, frontMatter, body } = admission;
  const now = new Date().toISOString();
  const existing = await loadAssignment(cwd, taskFile.taskId);
  const record: TaskAssignmentRecord = existing ?? { task_id: taskFile.taskId, assignments: [] };
  record.assignments.push({
    agent_id: agentId,
    claimed_at: now,
    claim_context: reason ?? null,
    released_at: null,
    release_reason: null,
    intent: 'primary',
  });

  try {
    const store = openTaskLifecycleStore(cwd);
    try {
      ensureLifecycleForAssignment(store, taskFile.taskId, Number(taskNumber), frontMatter);
      store.updateStatus(taskFile.taskId, 'claimed', agentId);
    } finally {
      store.db.close();
    }

    await saveAssignment(cwd, record);

    frontMatter.status = 'claimed';
    await writeTaskFile(taskFile.path, frontMatter, body);

    const assignmentStore = openTaskLifecycleStore(cwd);
    try {
      assignmentStore.insertAssignment({
        assignment_id: admission.intent.assignment_id ?? `assign-${taskFile.taskId}-${agentId}-${Date.now()}`,
        task_id: taskFile.taskId,
        agent_id: agentId,
        claimed_at: now,
        released_at: null,
        release_reason: null,
        intent: 'primary',
      });
    } finally {
      assignmentStore.db.close();
    }

    await updateAgentRosterEntry(cwd, agentId, {
      status: 'working',
      task: Number(taskNumber),
    });

    recordAssignmentIntentApplied(cwd, admission.intent.request_id, {
      lifecycleStatusAfter: 'claimed',
      rosterStatusAfter: 'working',
      assignmentId: admission.intent.assignment_id,
      confirmation: {
        task_id: taskFile.taskId,
        task_number: Number(taskNumber),
        lifecycle_status: 'claimed',
        roster_status: 'working',
        assignment_record_agent_id: agentId,
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

  // Post-commit advisory PrincipalRuntime update
  if (options.updatePrincipalRuntime && agentId) {
    try {
      const stateDir = resolvePrincipalStateDir({ cwd, principalStateDir: options.principalStateDir });
      const bridgeResult = await updatePrincipalRuntimeFromTaskEvent(stateDir, {
        type: 'task_claimed',
        agent_id: agentId,
        task_id: taskFile.taskId,
      });
      if (bridgeResult.warning) {
        fmt.message(bridgeResult.warning, 'warning');
      }
    } catch {
      // Best-effort advisory update — never fail the command
    }
  }

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        task_id: taskFile.taskId,
        agent_id: agentId,
        claimed_at: now,
        assignment_intent_id: admission.intent.request_id,
      },
    };
  }

  fmt.message(`Claimed task ${taskFile.taskId} for ${agentId}`, 'success');
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      task_id: taskFile.taskId,
      agent_id: agentId,
      claimed_at: now,
      assignment_intent_id: admission.intent.request_id,
    },
  };
}
