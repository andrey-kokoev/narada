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
  listReviewsForTask,
  findTaskFile,
  writeTaskFile,
  loadAssignment,
  saveAssignment,
  type AgentRoster,
  type TaskFrontMatter,
} from '../lib/task-governance.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import {
  admitAssignmentIntent,
  ensureLifecycleForAssignment,
  recordAssignmentIntentApplied,
  recordAssignmentIntentFailed,
} from '../lib/assignment-intent.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  recallAcceptedLearning,
  formatGuidanceForHumans,
  formatGuidanceForJson,
} from '../lib/learning-recall.js';

export interface TaskRosterOptions {
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
  verbose?: boolean;
}

export interface TaskRosterAssignOptions extends TaskRosterOptions {
  taskNumber: string;
  agent: string;
  strict?: boolean;
  allowIncomplete?: boolean;
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
  if (options.verbose && guidance.length > 0) {
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

  const admission = await admitAssignmentIntent(cwd, {
    kind: 'roster_assign',
    taskNumber,
    agentId: options.agent,
    requestedBy: options.agent,
    noClaim: Boolean(options.noClaim),
  });
  if (!admission.ok) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: admission.result };
  }

  const { taskFile, frontMatter, body } = admission;
  try {
    const updatedRoster = await updateAgentRosterEntry(cwd, options.agent, {
      status: 'working',
      task: taskNumber,
    });

    let claimed = false;
    let assignmentBackfilled = false;
    if (admission.shouldClaim || admission.shouldBackfillAssignment) {
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
        intent: 'primary',
      });
      assignmentBackfilled = admission.shouldBackfillAssignment;

      const lifecycleStore = openTaskLifecycleStore(cwd);
      try {
        ensureLifecycleForAssignment(lifecycleStore, taskFile.taskId, taskNumber, frontMatter);
        lifecycleStore.updateStatus(taskFile.taskId, 'claimed', options.agent);
      } finally {
        lifecycleStore.db.close();
      }

      await saveAssignment(cwd, record);

      const assignmentStore = openTaskLifecycleStore(cwd);
      try {
        assignmentStore.insertAssignment({
          assignment_id: admission.intent.assignment_id ?? `assign-${taskFile.taskId}-${options.agent}-${Date.now()}`,
          task_id: taskFile.taskId,
          agent_id: options.agent,
          claimed_at: now,
          released_at: null,
          release_reason: null,
          intent: 'primary',
        });
      } finally {
        assignmentStore.db.close();
      }

      if (admission.shouldClaim) {
        const updatedFrontMatter: TaskFrontMatter = { ...frontMatter, status: 'claimed' };
        await writeTaskFile(taskFile.path, updatedFrontMatter, body);
        claimed = true;
      }
    }

    recordAssignmentIntentApplied(cwd, admission.intent.request_id, {
      lifecycleStatusAfter: claimed || assignmentBackfilled ? 'claimed' : (admission.currentStatus ?? null),
      rosterStatusAfter: 'working',
      assignmentId: admission.intent.assignment_id,
      warnings: admission.warnings,
      confirmation: {
        task_id: taskFile.taskId,
        task_number: taskNumber,
        claimed,
        assignment_backfilled: assignmentBackfilled,
        roster_status: 'working',
      },
    });

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
          assignment_backfilled: assignmentBackfilled || undefined,
          assignment_intent_id: admission.intent.request_id,
          roster_updated_at: updatedRoster.updated_at,
          warnings: admission.warnings.length > 0 ? admission.warnings : undefined,
          ...(options.verbose && guidance.length > 0 ? { guidance: formatGuidanceForJson(guidance) } : {}),
        },
      };
    }

    const lines: string[] = [
      `Assigned ${options.agent} → task ${taskNumber} (status: working)${claimed ? ' and claimed' : ''}`,
    ];
    for (const w of admission.warnings) {
      lines.push(`⚠ ${w}`);
    }
    if (options.verbose && guidance.length > 0) {
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
    recordAssignmentIntentFailed(cwd, admission.intent.request_id, msg);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg, assignment_intent_id: admission.intent.request_id },
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

    // Find task file for assignment recording
    const taskFile = await findTaskFile(cwd, options.taskNumber);
    if (taskFile) {
      const now = new Date().toISOString();
      const lifecycleStore = openTaskLifecycleStore(cwd);
      try {
        const existingLifecycle = lifecycleStore.getLifecycle(taskFile.taskId);
        if (!existingLifecycle) {
          lifecycleStore.upsertLifecycle({
            task_id: taskFile.taskId,
            task_number: taskNumber,
            status: 'in_review',
            governed_by: null,
            closed_at: null,
            closed_by: null,
            reopened_at: null,
            reopened_by: null,
            continuation_packet_json: null,
            updated_at: now,
          });
        }
      } finally {
        lifecycleStore.db.close();
      }
      // Record review intent as a released assignment (review is parallel, not an active claim)
      const assignmentRecord = (await loadAssignment(cwd, taskFile.taskId)) ?? {
        task_id: taskFile.taskId,
        assignments: [],
      };
      assignmentRecord.assignments.push({
        agent_id: options.agent,
        claimed_at: now,
        claim_context: null,
        released_at: now,
        release_reason: 'completed',
        intent: 'review',
      });
      await saveAssignment(cwd, assignmentRecord);
    }

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
          roster_updated_at: roster.updated_at,
          intent: 'review',
          ...(options.verbose && guidance.length > 0 ? { guidance: formatGuidanceForJson(guidance) } : {}),
        },
      };
    }

    const lines: string[] = [
      `Assigned ${options.agent} → review task ${taskNumber} (status: reviewing, intent: review)`,
    ];
    if (options.verbose && guidance.length > 0) {
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
    let evidenceError: string | null = null;
    try {
      evidence = await inspectTaskEvidence(cwd, String(taskNumber));
    } catch (error) {
      evidence = null;
      evidenceError = error instanceof Error ? error.message : String(error);
    }

    const roster = await loadRoster(cwd);
    const agent = roster.agents.find((a) => a.agent_id === options.agent);
    if (!agent) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Agent ${options.agent} not found in roster` },
      };
    }

    const warnings: string[] = [];

    if (!evidence) {
      warnings.push(
        `Task ${taskNumber} evidence could not be inspected${evidenceError ? `: ${evidenceError}` : ''}.`,
      );
    } else {
      const reports = evidence.task_id ? await listReportsForTask(cwd, evidence.task_id) : [];
      const reviews = evidence.task_id ? await listReviewsForTask(cwd, evidence.task_id) : [];
      const hasAgentReport = reports.some((report) => report.agent_id === options.agent);
      const hasAgentReview = reviews.some((review) => review.reviewer_agent_id === options.agent);
      const completionHandoffSatisfied =
        evidence.verdict === 'complete'
        || hasAgentReport
        || hasAgentReview;

      if (!completionHandoffSatisfied) {
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
        if (!evidence.has_verification) {
          warnings.push(`Task ${taskNumber} has no verification notes.`);
        }
        if (evidence.verdict === 'needs_review' && !evidence.has_review) {
          warnings.push(`Task ${taskNumber} still requires review before it is complete.`);
        }
        if (evidence.verdict === 'needs_closure') {
          warnings.push(`Task ${taskNumber} is not complete by evidence and still needs closure repair.`);
        }
      }
    }

    const shouldFailOnWarnings = warnings.length > 0 && !options.allowIncomplete;
    if (shouldFailOnWarnings) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: `${warnings.join('\n')}\nSubmit the missing report/review evidence first, or rerun with --allow-incomplete to record roster availability only.`,
          strict: options.strict ?? true,
          allow_incomplete: false,
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
          roster_updated_at: updatedRoster.updated_at,
          warnings: warnings.length > 0 ? warnings : undefined,
          allow_incomplete: options.allowIncomplete || undefined,
          ...(options.verbose && guidance.length > 0 ? { guidance: formatGuidanceForJson(guidance) } : {}),
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
      if (options.verbose) {
        lines.push(`Run \`narada task evidence ${taskNumber}\` for details.`);
      } else {
        lines.push(`Run \`narada task evidence ${taskNumber}\` for details, or use --verbose for guidance.`);
      }
      if (options.allowIncomplete) {
        lines.push('Incomplete evidence was explicitly allowed; this records roster availability only.');
      }
    }
    if (options.verbose && guidance.length > 0) {
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
          roster_updated_at: roster.updated_at,
          ...(options.verbose && guidance.length > 0 ? { guidance: formatGuidanceForJson(guidance) } : {}),
        },
      };
    }

    const lines: string[] = [
      `Marked ${options.agent} as idle`,
    ];
    if (options.verbose && guidance.length > 0) {
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
