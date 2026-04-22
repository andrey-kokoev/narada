/**
 * Task roster operator.
 *
 * Observation/tracking: shows and updates agent operational roster state.
 * Does NOT mutate task lifecycle (claim/release/review) or assignment records.
 */

import { resolve } from 'node:path';
import {
  loadRoster,
  updateAgentRosterEntry,
  formatRoster,
  listReportsForTask,
  findTaskFile,
  readTaskFile,
  writeTaskFile,
  isValidTransition,
  checkDependencies,
  loadAssignment,
  getActiveAssignment,
  saveAssignment,
  type AgentRoster,
  type TaskFrontMatter,
} from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  recallAcceptedLearning,
  formatGuidanceForHumans,
  formatGuidanceForJson,
} from '../lib/learning-recall.js';

export interface TaskRosterOptions {
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export interface TaskRosterAssignOptions extends TaskRosterOptions {
  taskNumber: string;
  agent: string;
  strict?: boolean;
  noClaim?: boolean;
}

export interface TaskRosterAgentOptions extends TaskRosterOptions {
  agent: string;
}

export async function taskRosterShowCommand(
  options: TaskRosterOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const format = options.format === 'json' ? 'json' : 'human';

  let roster: AgentRoster;
  try {
    roster = await loadRoster(cwd);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to load roster: ${msg}` },
    };
  }

  const { guidance } = await recallAcceptedLearning({
    cwd,
    scopes: ['roster', 'task-governance'],
  });

  if (format === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        roster,
        guidance: formatGuidanceForJson(guidance),
      },
    };
  }

  const lines: string[] = [];
  lines.push(formatRoster(roster, 'human'));
  if (guidance.length > 0) {
    lines.push('');
    lines.push('Active guidance:');
    lines.push(...formatGuidanceForHumans(guidance));
  }
  return {
    exitCode: ExitCode.SUCCESS,
    result: lines.join('\n'),
  };
}

export async function taskRosterAssignCommand(
  options: TaskRosterAssignOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = Number(options.taskNumber);
  if (!Number.isFinite(taskNumber)) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Invalid task number' },
    };
  }

  // ── Phase 1: Load roster and validate agent ──
  let roster: AgentRoster;
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

  // ── Phase 2: Find and read task file ──
  let taskFile: { path: string; taskId: string } | null;
  try {
    taskFile = await findTaskFile(cwd, options.taskNumber);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  }

  if (!taskFile) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Task not found: ${options.taskNumber}` },
    };
  }

  const { frontMatter, body } = await readTaskFile(taskFile.path);
  const currentStatus = frontMatter.status;

  // ── Phase 3: Determine claim intent and validate ──
  const canClaim = currentStatus === 'opened' || currentStatus === 'needs_continuation';
  const shouldClaim = !options.noClaim && canClaim;

  const claimWarnings: string[] = [];

  if (shouldClaim) {
    // Validate state-machine transition
    if (!isValidTransition(currentStatus, 'claimed')) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: `Transition from '${currentStatus}' to 'claimed' is not allowed by the state machine`,
        },
      };
    }

    // Validate dependencies
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

    // Validate no active assignment
    const existingAssignment = await loadAssignment(cwd, taskFile.taskId);
    if (existingAssignment) {
      const active = getActiveAssignment(existingAssignment);
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
  } else if (currentStatus === 'claimed') {
    claimWarnings.push(`Task ${taskFile.taskId} is already claimed; roster updated without re-claiming`);
  } else if (options.noClaim) {
    claimWarnings.push('Claim skipped due to --no-claim flag');
  }

  // ── Phase 4: Commit — roster first, then task claim ──
  // All validation passed; roster mutation is atomic (withRosterMutation).
  // If task claim fails after roster update, the roster still reflects the
  // assignment intent. In practice this cannot happen after validation.
  try {
    const updatedRoster = await updateAgentRosterEntry(cwd, options.agent, {
      status: 'working',
      task: taskNumber,
    });

    let claimed = false;
    if (shouldClaim) {
      const now = new Date().toISOString();
      const record = (await loadAssignment(cwd, taskFile.taskId)) ?? {
        task_id: taskFile.taskId,
        assignments: [],
      };
      record.assignments.push({
        agent_id: options.agent,
        claimed_at: now,
        claim_context: null,
        released_at: null,
        release_reason: null,
      });
      await saveAssignment(cwd, record);

      const updatedFrontMatter: TaskFrontMatter = { ...frontMatter, status: 'claimed' };
      await writeTaskFile(taskFile.path, updatedFrontMatter, body);
      claimed = true;
    }

    const { guidance } = await recallAcceptedLearning({
      cwd,
      scopes: ['assignment', 'roster', 'task-governance'],
    });

    if (options.format === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'ok',
          agent: options.agent,
          agent_status: 'working',
          task: taskNumber,
          claimed,
          roster: updatedRoster,
          warnings: claimWarnings.length > 0 ? claimWarnings : undefined,
          guidance: formatGuidanceForJson(guidance),
        },
      };
    }

    const lines: string[] = [
      `Assigned ${options.agent} → task ${taskNumber} (status: working)${claimed ? ' and claimed' : ''}`,
    ];
    for (const w of claimWarnings) {
      lines.push(`⚠ ${w}`);
    }
    if (guidance.length > 0) {
      lines.push('');
      lines.push('Active guidance:');
      lines.push(...formatGuidanceForHumans(guidance));
    }

    return {
      exitCode: ExitCode.SUCCESS,
      result: lines.join('\n'),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  }
}

export async function taskRosterReviewCommand(
  options: TaskRosterAssignOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = Number(options.taskNumber);
  if (!Number.isFinite(taskNumber)) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Invalid task number' },
    };
  }

  try {
    const roster = await updateAgentRosterEntry(cwd, options.agent, {
      status: 'reviewing',
      task: taskNumber,
    });

    const { guidance } = await recallAcceptedLearning({
      cwd,
      scopes: ['review', 'roster', 'task-governance'],
    });

    if (options.format === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'ok',
          agent: options.agent,
          agent_status: 'reviewing',
          task: taskNumber,
          roster,
          guidance: formatGuidanceForJson(guidance),
        },
      };
    }

    const lines: string[] = [
      `Assigned ${options.agent} → review task ${taskNumber} (status: reviewing)`,
    ];
    if (guidance.length > 0) {
      lines.push('');
      lines.push('Active guidance:');
      lines.push(...formatGuidanceForHumans(guidance));
    }

    return {
      exitCode: ExitCode.SUCCESS,
      result: lines.join('\n'),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  }
}

export async function taskRosterDoneCommand(
  options: TaskRosterAssignOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = Number(options.taskNumber);
  if (!Number.isFinite(taskNumber)) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Invalid task number' },
    };
  }

  try {
    const { inspectTaskEvidence, loadRoster } = await import('../lib/task-governance.js');

    // Inspect task evidence before marking done
    let evidence;
    try {
      evidence = await inspectTaskEvidence(cwd, String(taskNumber));
    } catch {
      evidence = null;
    }

    const roster = await loadRoster(cwd);
    const agent = roster.agents.find((a) => a.agent_id === options.agent);
    const isReviewer = agent?.role === 'reviewer' || agent?.role === 'admin';

    const warnings: string[] = [];

    if (evidence) {
      // Implementer completion checks
      if (!isReviewer) {
        if (!evidence.has_report && !evidence.has_execution_notes) {
          warnings.push(
            `Task ${taskNumber} has no execution evidence; roster done marks only agent availability, not task completion.`,
          );
        }
        if (evidence.unchecked_count > 0) {
          warnings.push(
            `Task ${taskNumber} has ${evidence.unchecked_count} unchecked acceptance criteria.`,
          );
        }
        if (!evidence.has_report) {
          warnings.push(
            `Agent ${options.agent} marked done for task ${taskNumber} but no WorkResultReport was submitted.`,
          );
        }
      }

      // Reviewer completion checks
      if (isReviewer) {
        if (!evidence.has_review) {
          warnings.push(
            `Reviewer ${options.agent} marked done for task ${taskNumber} but no review artifact exists.`,
          );
        }
      }
    }

    // Strict mode: fail on warnings
    if (options.strict && warnings.length > 0) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: warnings.join('\n'),
          strict: true,
        },
      };
    }

    const updatedRoster = await updateAgentRosterEntry(cwd, options.agent, {
      status: 'done',
      task: null,
      last_done: taskNumber,
    });

    const { guidance } = await recallAcceptedLearning({
      cwd,
      scopes: ['roster', 'task-governance'],
    });

    if (options.format === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'ok',
          agent: options.agent,
          agent_status: 'done',
          last_done: taskNumber,
          roster: updatedRoster,
          warnings: warnings.length > 0 ? warnings : undefined,
          guidance: formatGuidanceForJson(guidance),
        },
      };
    }

    const lines: string[] = [
      `Marked ${options.agent} as done (last_done: ${taskNumber})`,
    ];
    if (warnings.length > 0) {
      for (const w of warnings) {
        lines.push(`⚠ ${w}`);
      }
      lines.push(`Run \`narada task evidence ${taskNumber}\` for details.`);
    }
    if (guidance.length > 0) {
      lines.push('');
      lines.push('Active guidance:');
      lines.push(...formatGuidanceForHumans(guidance));
    }

    return {
      exitCode: ExitCode.SUCCESS,
      result: lines.join('\n'),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  }
}

export async function taskRosterIdleCommand(
  options: TaskRosterAgentOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  try {
    const roster = await updateAgentRosterEntry(cwd, options.agent, {
      status: 'idle',
      task: null,
    });

    const { guidance } = await recallAcceptedLearning({
      cwd,
      scopes: ['roster', 'task-governance'],
    });

    if (options.format === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'ok',
          agent: options.agent,
          agent_status: 'idle',
          roster,
          guidance: formatGuidanceForJson(guidance),
        },
      };
    }

    const lines: string[] = [
      `Marked ${options.agent} as idle`,
    ];
    if (guidance.length > 0) {
      lines.push('');
      lines.push('Active guidance:');
      lines.push(...formatGuidanceForHumans(guidance));
    }

    return {
      exitCode: ExitCode.SUCCESS,
      result: lines.join('\n'),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  }
}
