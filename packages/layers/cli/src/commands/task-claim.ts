/**
 * Task claim operator.
 *
 * Mutation: claims a task for an agent, creating an assignment record
 * and updating the task file status to `claimed`.
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
  isValidTransition,
  checkDependencies,
  updateAgentRosterEntry,
  type TaskAssignmentRecord,
} from '../lib/task-governance.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';
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

  // Verify agent exists in roster
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

  // Find task file
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

  // Read task file front-matter
  const { frontMatter, body } = await readTaskFile(taskFile.path);

  // --- SQLite-backed lifecycle path ---
  let store;
  try {
    store = openTaskLifecycleStore(cwd);
  } catch {
    // Store may not exist yet; fallback to markdown-only
  }

  let sqliteStatus: string | undefined;
  if (store) {
    let lifecycle = store.getLifecycle(taskFile.taskId);
    if (!lifecycle) {
      // Backfill: task exists in markdown but not yet in SQLite
      const taskNum = Number(taskNumber);
      if (!Number.isFinite(taskNum)) {
        store.db.close();
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: { status: 'error', error: 'Cannot determine task number for SQLite backfill' },
        };
      }
      const markdownStatus = frontMatter.status as string | undefined;
      if (typeof markdownStatus === 'string') {
        store.upsertLifecycle({
          task_id: taskFile.taskId,
          task_number: taskNum,
          status: markdownStatus as import('../lib/task-lifecycle-store.js').TaskStatus,
          governed_by: (frontMatter.governed_by as string) || null,
          closed_at: (frontMatter.closed_at as string) || null,
          closed_by: (frontMatter.closed_by as string) || null,
          reopened_at: (frontMatter.reopened_at as string) || null,
          reopened_by: (frontMatter.reopened_by as string) || null,
          continuation_packet_json: null,
          updated_at: new Date().toISOString(),
        });
        lifecycle = store.getLifecycle(taskFile.taskId);
      }
    }
    sqliteStatus = lifecycle?.status;
  }

  const currentStatus = sqliteStatus ?? (frontMatter.status as string | undefined);

  // Check task status allows claiming — must be explicitly 'opened' or 'needs_continuation'
  if (currentStatus !== 'opened' && currentStatus !== 'needs_continuation') {
    if (store) store.db.close();
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} is not claimable (status: ${currentStatus ?? 'missing'})`,
      },
    };
  }

  // Validate transition
  if (!isValidTransition(currentStatus, 'claimed')) {
    if (store) store.db.close();
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Transition from '${currentStatus}' to 'claimed' is not allowed by the state machine`,
      },
    };
  }

  // Enforce dependencies at claim time (prefer SQLite-backed status)
  const dependsOn = frontMatter.depends_on as number[] | undefined;
  const { blockedBy, details } = await checkDependencies(cwd, dependsOn, store);
  if (blockedBy.length > 0) {
    if (store) store.db.close();
    const detailMessages = details.map((d) => `${d.taskId}: ${d.reason}`).join('; ');
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} has unmet dependencies: ${blockedBy.join(', ')}. ${detailMessages}`,
      },
    };
  }

  // Check no active assignment exists
  const existing = await loadAssignment(cwd, taskFile.taskId);
  if (existing) {
    const active = getActiveAssignment(existing);
    if (active) {
      if (store) store.db.close();
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: `Task ${taskFile.taskId} is already claimed by ${active.agent_id} at ${active.claimed_at}`,
        },
      };
    }
  }

  // Create assignment record
  const now = new Date().toISOString();
  const record: TaskAssignmentRecord = existing ?? { task_id: taskFile.taskId, assignments: [] };
  record.assignments.push({
    agent_id: agentId,
    claimed_at: now,
    claim_context: reason ?? null,
    released_at: null,
    release_reason: null,
    intent: 'primary',
  });

  await saveAssignment(cwd, record);

  // Update task file status
  frontMatter.status = 'claimed';
  await writeTaskFile(taskFile.path, frontMatter, body);

  // Write authoritative lifecycle and assignment state to SQLite
  if (store) {
    store.updateStatus(taskFile.taskId, 'claimed', agentId);
    store.insertAssignment({
      assignment_id: `assign-${taskFile.taskId}-${agentId}-${Date.now()}`,
      task_id: taskFile.taskId,
      agent_id: agentId,
      claimed_at: now,
      released_at: null,
      release_reason: null,
      intent: 'primary',
    });
  }

  // Update roster to reflect active working assignment
  try {
    await updateAgentRosterEntry(cwd, agentId, {
      status: 'working',
      task: Number(taskNumber),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (store) store.db.close();
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to update roster: ${msg}` },
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

  if (store) store.db.close();

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        task_id: taskFile.taskId,
        agent_id: agentId,
        claimed_at: now,
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
    },
  };
}
