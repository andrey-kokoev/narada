/**
 * Task continuation / takeover operator.
 *
 * Mutation: assigns a continuation or takeover agent to an already-claimed
 * or continuation-ready task, recording intent durably in assignment history.
 */

import { resolve } from 'node:path';
import {
  loadRoster,
  findTaskFile,
  loadAssignment,
  saveAssignment,
  readTaskFile,
  writeTaskFile,
  getActiveAssignment,
  continuationReasonToIntent,
  type TaskAssignmentRecord,
  type TaskAssignment,
  type TaskContinuation,
} from '../lib/task-governance.js';
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

/** Reasons that supersede the prior active assignment. */
const SUPERSEDE_REASONS: ContinuationReason[] = ['handoff', 'blocked_agent', 'operator_override'];

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

  // ── Load and validate roster ──
  let roster;
  try {
    roster = await loadRoster(cwd);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to load agent roster: ${msg}` },
    };
  }

  const agent = roster.agents.find((a) => a.agent_id === agentId);
  if (!agent) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Agent not found in roster: ${agentId}` },
    };
  }

  // ── Find and read task file ──
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
  const currentStatus = frontMatter.status;

  // ── Validate task status ──
  if (currentStatus === 'opened') {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} is opened, not claimed. Use 'narada task claim' or 'narada task roster assign' instead of 'task continue'.`,
      },
    };
  }

  if (currentStatus !== 'claimed' && currentStatus !== 'needs_continuation') {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} cannot be continued (status: ${currentStatus ?? 'missing'}). Only 'claimed' and 'needs_continuation' tasks support continuation.`,
      },
    };
  }

  // ── Load assignment and determine semantics ──
  const existing = await loadAssignment(cwd, taskFile.taskId);
  const active = existing ? getActiveAssignment(existing) : null;

  if (!active) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} has no active assignment to continue from.`,
      },
    };
  }

  if (active.agent_id === agentId) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Agent ${agentId} is already the active assignee for task ${taskFile.taskId}.`,
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

  const supersedes = SUPERSEDE_REASONS.includes(reason);

  if (supersedes) {
    // Release prior active assignment
    active.released_at = now;
    active.release_reason = 'continued';

    // Create new primary assignment
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

    // Transition needs_continuation → claimed
    if (currentStatus === 'needs_continuation') {
      frontMatter.status = 'claimed';
      await writeTaskFile(taskFile.path, frontMatter, body);
    }
  } else {
    // evidence_repair or review_fix: keep prior active, add continuation
    const continuation: TaskContinuation = {
      agent_id: agentId,
      started_at: now,
      reason,
      previous_agent_id: active.agent_id,
    };
    record.continuations.push(continuation);

    // Transition needs_continuation → claimed
    if (currentStatus === 'needs_continuation') {
      frontMatter.status = 'claimed';
      await writeTaskFile(taskFile.path, frontMatter, body);
    }
  }

  await saveAssignment(cwd, record);

  // Update roster
  const { updateAgentRosterEntry } = await import('../lib/task-governance.js');
  await updateAgentRosterEntry(cwd, agentId, {
    status: 'working',
    task: Number(taskNumber) || null,
  });

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
    },
  };
}
