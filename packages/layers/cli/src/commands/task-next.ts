/**
 * Agent next-task surfaces: peek-next, pull-next, work-next.
 *
 * - peek-next: non-mutating inspection of the next admissible task
 * - pull-next: mutating claim of the next admissible task
 * - work-next: execution packet for the agent's current or next task
 */

import { resolve } from 'node:path';
import {
  findNextTaskForAgent,
  loadRoster,
  findTaskFile,
  readTaskFile,
  loadAssignment,
  getActiveAssignment,
  saveAssignment,
  writeTaskFile,
  isValidTransition,
  checkDependencies,
  updateAgentRosterEntry,
  type NextTaskCandidate,
} from '../lib/task-governance.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface TaskPeekNextOptions {
  agent: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export interface TaskPullNextOptions {
  agent: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export interface TaskWorkNextOptions {
  agent: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Non-mutating next-task inspection.
 * Returns the best admissible task for the agent without claiming, assigning,
 * or creating any dispatch state.
 */
export async function taskPeekNextCommand(
  options: TaskPeekNextOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });

  let store;
  try {
    store = openTaskLifecycleStore(cwd);
  } catch {
    // SQLite may not exist yet
  }

  try {
    const candidate = await findNextTaskForAgent(cwd, options.agent, store);

    if (!candidate) {
      if (fmt.getFormat() === 'json') {
        return {
          exitCode: ExitCode.SUCCESS,
          result: { status: 'empty', agent: options.agent, task: null },
        };
      }
      return {
        exitCode: ExitCode.SUCCESS,
        result: `No admissible next task for ${options.agent}`,
      };
    }

    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'ok',
          agent: options.agent,
          task: {
            task_id: candidate.taskId,
            task_number: candidate.taskNumber,
            title: candidate.title,
            status: candidate.status,
            affinity: candidate.affinity,
            already_claimed: candidate.alreadyClaimed,
            claimed_by: candidate.claimedBy,
          },
        },
      };
    }

    const lines = [
      `Next task for ${options.agent}:`,
      `  Task:    ${candidate.taskNumber} (${candidate.taskId})`,
      `  Title:   ${candidate.title ?? '—'}`,
      `  Status:  ${candidate.status}`,
      `  Affinity: ${candidate.affinity.preferred_agent_id ?? '—'} (${candidate.affinity.affinity_strength})`,
    ];
    if (candidate.alreadyClaimed) {
      lines.push(`  Claimed: yes (by ${candidate.claimedBy})`);
    }
    return {
      exitCode: ExitCode.SUCCESS,
      result: lines.join('\n'),
    };
  } finally {
    if (store) store.db.close();
  }
}

/**
 * Mutating next-task pull.
 * Finds the best admissible task, claims it, updates the roster,
 * and returns the assigned task identity.
 */
export async function taskPullNextCommand(
  options: TaskPullNextOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });

  let store;
  try {
    store = openTaskLifecycleStore(cwd);
  } catch {
    // SQLite may not exist yet
  }

  try {
    // 1. Verify agent exists in roster
    let roster: Awaited<ReturnType<typeof loadRoster>>;
    try {
      roster = await loadRoster(cwd);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Failed to load roster: ${msg}` },
      };
    }
    const agent = roster.agents.find((a) => a.agent_id === options.agent);
    if (!agent) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Agent ${options.agent} not found in roster` },
      };
    }

    // 2. Find next admissible task
    const candidate = await findNextTaskForAgent(cwd, options.agent, store);
    if (!candidate) {
      if (fmt.getFormat() === 'json') {
        return {
          exitCode: ExitCode.SUCCESS,
          result: { status: 'empty', agent: options.agent, task: null },
        };
      }
      return {
        exitCode: ExitCode.SUCCESS,
        result: `No admissible next task for ${options.agent}`,
      };
    }

    // 3. If already claimed by this agent, just update roster and return
    if (candidate.alreadyClaimed && candidate.claimedBy === options.agent) {
      await updateAgentRosterEntry(cwd, options.agent, {
        status: 'working',
        task: candidate.taskNumber ?? undefined,
      });
      if (fmt.getFormat() === 'json') {
        return {
          exitCode: ExitCode.SUCCESS,
          result: {
            status: 'ok',
            agent: options.agent,
            task_id: candidate.taskId,
            task_number: candidate.taskNumber,
            pulled: false,
            reason: 'already_claimed',
          },
        };
      }
      return {
        exitCode: ExitCode.SUCCESS,
        result: `Task ${candidate.taskNumber} is already claimed by ${options.agent}`,
      };
    }

    // 4. Claim the task
    const taskFile = await findTaskFile(cwd, String(candidate.taskNumber!));
    if (!taskFile) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Task file not found: ${candidate.taskId}` },
      };
    }
    const { frontMatter, body } = await readTaskFile(taskFile.path);

    // Validate transition
    const currentStatus = frontMatter.status as string | undefined;
    if (!isValidTransition(currentStatus, 'claimed')) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: `Transition from '${currentStatus}' to 'claimed' is not allowed`,
        },
      };
    }

    // Double-check dependencies
    const dependsOn = frontMatter.depends_on as number[] | undefined;
    const { blockedBy } = await checkDependencies(cwd, dependsOn, store);
    if (blockedBy.length > 0) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: `Dependencies unmet: ${blockedBy.join(', ')}`,
        },
      };
    }

    // Create assignment record
    const now = nowIso();
    const existing = await loadAssignment(cwd, taskFile.taskId);
    const record = existing ?? { task_id: taskFile.taskId, assignments: [] };
    record.assignments.push({
      agent_id: options.agent,
      claimed_at: now,
      claim_context: null,
      released_at: null,
      release_reason: null,
      intent: 'primary',
    });
    await saveAssignment(cwd, record);

    // Update task file status
    frontMatter.status = 'claimed';
    await writeTaskFile(taskFile.path, frontMatter, body);

    // Update SQLite lifecycle
    if (store) {
      const lifecycle = store.getLifecycle(taskFile.taskId);
      if (lifecycle) {
        store.updateStatus(taskFile.taskId, 'claimed', options.agent);
      }
    }

    // Update roster
    await updateAgentRosterEntry(cwd, options.agent, {
      status: 'working',
      task: candidate.taskNumber ?? undefined,
    });

    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'ok',
          agent: options.agent,
          task_id: candidate.taskId,
          task_number: candidate.taskNumber,
          pulled: true,
          claimed_at: now,
        },
      };
    }

    return {
      exitCode: ExitCode.SUCCESS,
      result: `Pulled task ${candidate.taskNumber} (${candidate.taskId}) for ${options.agent}`,
    };
  } finally {
    if (store) store.db.close();
  }
}

/**
 * Execution packet surface.
 * Returns the work packet for the agent's current task.
 * If the agent has no current task, attempts pull-next first,
 * then returns the packet for the newly pulled task.
 */
export async function taskWorkNextCommand(
  options: TaskWorkNextOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });

  let store;
  try {
    store = openTaskLifecycleStore(cwd);
  } catch {
    // SQLite may not exist yet
  }

  try {
    // 1. Check if agent already has a current task
    const roster = await loadRoster(cwd);
    const agent = roster.agents.find((a) => a.agent_id === options.agent);
    if (!agent) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Agent ${options.agent} not found in roster` },
      };
    }

    let taskNumber: number | null = agent.task ?? null;
    let pulled = false;

    // 2. If no current task, pull next
    if (taskNumber === null) {
      const pullResult = await taskPullNextCommand({
        agent: options.agent,
        cwd,
        format: 'json',
      });
      if (pullResult.exitCode !== ExitCode.SUCCESS) {
        return pullResult;
      }
      const pullData = pullResult.result as { status: string; task_number?: number | null };
      if (pullData.status === 'empty') {
        if (fmt.getFormat() === 'json') {
          return {
            exitCode: ExitCode.SUCCESS,
            result: { status: 'empty', agent: options.agent, packet: null },
          };
        }
        return {
          exitCode: ExitCode.SUCCESS,
          result: `No work available for ${options.agent}`,
        };
      }
      taskNumber = pullData.task_number ?? null;
      pulled = true;
    }

    if (taskNumber === null) {
      if (fmt.getFormat() === 'json') {
        return {
          exitCode: ExitCode.SUCCESS,
          result: { status: 'empty', agent: options.agent, packet: null },
        };
      }
      return {
        exitCode: ExitCode.SUCCESS,
        result: `No work available for ${options.agent}`,
      };
    }

    if (!store) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: 'Task lifecycle store is unavailable' },
      };
    }

    // 3. Build execution packet
    const taskFile = await findTaskFile(cwd, String(taskNumber));
    if (!taskFile) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Task file not found: ${taskNumber}` },
      };
    }
    const { frontMatter, body } = await readTaskFile(taskFile.path);
    let spec = store.getTaskSpec(taskFile.taskId);
    if (!spec) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Task ${taskNumber} has no SQLite-backed task spec` },
      };
    }

    const assignmentRecord = await loadAssignment(cwd, taskFile.taskId);
    const activeAssignment = assignmentRecord
      ? getActiveAssignment(assignmentRecord)
      : null;

    const packet = {
      task_id: taskFile.taskId,
      task_number: taskNumber,
      title: spec?.title ?? null,
      status: frontMatter.status as string | undefined,
      goal: spec?.goal_markdown ?? null,
      required_work: spec?.required_work_markdown ?? null,
      acceptance_criteria: spec
        ? (JSON.parse(spec.acceptance_criteria_json) as string[]).join('\n')
        : null,
      file_path: taskFile.path,
      assignment: activeAssignment
        ? {
            agent_id: activeAssignment.agent_id,
            claimed_at: activeAssignment.claimed_at,
            intent: activeAssignment.intent,
          }
        : null,
      pulled,
    };

    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'ok',
          agent: options.agent,
          packet,
        },
      };
    }

    const lines = [
      `Work packet for ${options.agent}:`,
      `  Task:     ${packet.task_number} (${packet.task_id})`,
      `  Title:    ${packet.title ?? '—'}`,
      `  Status:   ${packet.status ?? '—'}`,
      `  File:     ${packet.file_path}`,
    ];
    if (pulled) {
      lines.push(`  Action:   pulled this task`);
    }
    if (packet.assignment) {
      lines.push(`  Assigned: ${packet.assignment.agent_id} at ${packet.assignment.claimed_at}`);
    }
    return {
      exitCode: ExitCode.SUCCESS,
      result: lines.join('\n'),
    };
  } finally {
    if (store) store.db.close();
  }
}
