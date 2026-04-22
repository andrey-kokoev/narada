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
  type TaskAssignmentRecord,
} from '../lib/task-governance.js';
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

  // Check task status allows claiming — must be explicitly 'opened' or 'needs_continuation'
  const currentStatus = frontMatter.status;
  if (currentStatus !== 'opened' && currentStatus !== 'needs_continuation') {
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
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Transition from '${currentStatus}' to 'claimed' is not allowed by the state machine`,
      },
    };
  }

  // Enforce dependencies at claim time
  const dependsOn = frontMatter.depends_on as number[] | undefined;
  const { blockedBy } = await checkDependencies(cwd, dependsOn);
  if (blockedBy.length > 0) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} has unmet dependencies: ${blockedBy.join(', ')}`,
      },
    };
  }

  // Check no active assignment exists
  const existing = await loadAssignment(cwd, taskFile.taskId);
  if (existing) {
    const active = getActiveAssignment(existing);
    if (active) {
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
  });

  await saveAssignment(cwd, record);

  // Update task file status
  frontMatter.status = 'claimed';
  await writeTaskFile(taskFile.path, frontMatter, body);

  // Update roster last_active_at
  agent.last_active_at = now;
  const { join } = await import('node:path');
  const { atomicWriteFile } = await import('../lib/task-governance.js');
  await atomicWriteFile(join(cwd, '.ai/agents/roster.json'), JSON.stringify(roster, null, 2) + '\n');

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
