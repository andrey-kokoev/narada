/**
 * Task report operator.
 *
 * Mutation: submits a WorkResultReport for a claimed task,
 * transitions task to in_review, releases assignment, and updates roster.
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
  getActiveContinuation,
  getAssignmentIntent,
  isValidTransition,
  updateAgentRosterEntry,
  createReportId,
  saveReport,
  findReportByAssignmentId,
  type WorkResultReport,
} from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  resolvePrincipalStateDir,
  updatePrincipalRuntimeFromTaskEvent,
} from '../lib/principal-bridge.js';
import {
  recallAcceptedLearning,
  formatGuidanceForHumans,
  formatGuidanceForJson,
} from '../lib/learning-recall.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';

export interface TaskReportOptions {
  taskNumber?: string;
  format?: 'json' | 'human' | 'auto';
  agent?: string;
  summary?: string;
  changedFiles?: string;
  verification?: string;
  residuals?: string;
  cwd?: string;
  principalStateDir?: string;
  verbose?: boolean;
}

export async function taskReportCommand(
  options: TaskReportOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = (options as Record<string, unknown>).taskNumber as string | undefined;
  const agentId = options.agent;
  const summary = options.summary;

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

  if (!summary) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--summary is required' },
    };
  }

  // ── Validation phase (no mutations) ──

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

  // Read task file
  const { frontMatter, body: rawBody } = await readTaskFile(taskFile.path);
  let body = rawBody;

  // Task must be claimed
  if (frontMatter.status !== 'claimed') {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} cannot be reported (status: ${frontMatter.status ?? 'missing'}, expected: claimed)`,
      },
    };
  }

  // Load assignment and verify agent has active claim
  const assignmentRecord = await loadAssignment(cwd, taskFile.taskId);
  if (!assignmentRecord) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} has no assignment record`,
      },
    };
  }

  const activeAssignment = getActiveAssignment(assignmentRecord);
  const activeContinuation = getActiveContinuation(assignmentRecord, agentId);

  if (!activeAssignment) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} has no active assignment`,
      },
    };
  }

  const isPrimary = activeAssignment.agent_id === agentId;
  const isContinuation = activeContinuation != null;
  const activeIntent = getAssignmentIntent(activeAssignment);

  // Review-intent agents should submit reviews, not WorkResultReports
  if (activeIntent === 'review' && isPrimary) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Agent ${agentId} has review intent for task ${taskFile.taskId}; use 'narada task review' instead of 'narada task report'.`,
      },
    };
  }

  if (!isPrimary && !isContinuation) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} is claimed by ${activeAssignment.agent_id}, not ${agentId}`,
      },
    };
  }

  const assignmentId = isContinuation
    ? `${taskFile.taskId}-continuation-${activeContinuation!.started_at}`
    : `${taskFile.taskId}-${activeAssignment.claimed_at}`;

  // ── Idempotency check ──
  // Before any mutation or status transition, detect existing report for this assignment.
  const existingReport = await findReportByAssignmentId(cwd, assignmentId);
  if (existingReport) {
    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'success',
          report_id: existingReport.report_id,
          task_id: taskFile.taskId,
          agent_id: agentId,
          new_status: frontMatter.status,
          note: 'Report already exists for this assignment; returning existing report without duplicate.',
        },
      };
    }

    fmt.message(`Report already exists for this assignment: ${existingReport.report_id}`, 'warning');
    fmt.message('Returning existing report without creating a duplicate.', 'info');
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        report_id: existingReport.report_id,
        task_id: taskFile.taskId,
        agent_id: agentId,
        new_status: frontMatter.status,
      },
    };
  }

  // Validate transition
  if (!isValidTransition(frontMatter.status, 'in_review')) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Transition from '${String(frontMatter.status)}' to 'in_review' is not allowed by the state machine`,
      },
    };
  }

  // Parse optional fields
  let changedFiles: string[] = [];
  if (options.changedFiles) {
    changedFiles = options.changedFiles.split(',').map((f) => f.trim()).filter(Boolean);
  }

  let verification: Array<{ command: string; result: string }> = [];
  if (options.verification) {
    try {
      const parsed = JSON.parse(options.verification) as unknown;
      if (!Array.isArray(parsed)) {
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: { status: 'error', error: '--verification must be a JSON array' },
        };
      }
      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i];
        if (typeof item !== 'object' || item === null) {
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: { status: 'error', error: `verification[${i}] is not an object` },
          };
        }
        const v = item as Record<string, unknown>;
        if (typeof v.command !== 'string') {
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: { status: 'error', error: `verification[${i}].command must be a string` },
          };
        }
        if (typeof v.result !== 'string') {
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: { status: 'error', error: `verification[${i}].result must be a string` },
          };
        }
      }
      verification = parsed as Array<{ command: string; result: string }>;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Failed to parse verification: ${msg}` },
      };
    }
  }

  let knownResiduals: string[] = [];
  if (options.residuals) {
    try {
      const parsed = JSON.parse(options.residuals) as unknown;
      if (!Array.isArray(parsed)) {
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: { status: 'error', error: '--residuals must be a JSON array' },
        };
      }
      for (let i = 0; i < parsed.length; i++) {
        if (typeof parsed[i] !== 'string') {
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: { status: 'error', error: `residuals[${i}] must be a string` },
          };
        }
      }
      knownResiduals = parsed as string[];
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Failed to parse residuals: ${msg}` },
      };
    }
  }

  // ── Mutation phase ──

  const now = new Date().toISOString();
  const reportId = createReportId(taskFile.taskId, agentId, assignmentId);

  const report: WorkResultReport = {
    report_id: reportId,
    task_number: taskNumber,
    task_id: taskFile.taskId,
    agent_id: agentId,
    assignment_id: assignmentId,
    reported_at: now,
    summary,
    changed_files: changedFiles,
    verification,
    known_residuals: knownResiduals,
    ready_for_review: true,
    report_status: 'submitted',
  };

  await saveReport(cwd, report);

  // Scaffold missing completion sections into the task file
  const missingSections: string[] = [];
  if (!/##\s*Execution Notes\s*\n/i.test(body)) {
    missingSections.push('## Execution Notes\n\n<!-- Record what was done, decisions made, and files changed. -->\n');
  }
  if (!/##\s*Verification\s*\n/i.test(body)) {
    missingSections.push('## Verification\n\n<!-- Record commands run, results observed, and how correctness was checked. -->\n');
  }
  if (missingSections.length > 0) {
    body = body.trimEnd() + '\n\n' + missingSections.join('\n');
  }

  if (isContinuation) {
    // Mark continuation as completed; do not touch primary assignment or task status
    activeContinuation!.completed_at = now;
    await saveAssignment(cwd, assignmentRecord);
    if (missingSections.length > 0) {
      await writeTaskFile(taskFile.path, frontMatter, body);
    }
  } else {
    // Primary agent: normal release flow
    activeAssignment.released_at = now;
    activeAssignment.release_reason = 'completed';
    await saveAssignment(cwd, assignmentRecord);

    // Update task status
    frontMatter.status = 'in_review';
    await writeTaskFile(taskFile.path, frontMatter, body);
    try {
      const store = openTaskLifecycleStore(cwd);
      try {
        store.updateStatus(taskFile.taskId, 'in_review', agentId);
      } finally {
        store.db.close();
      }
    } catch {
      // Markdown report path remains authoritative only when SQLite is unavailable.
    }
  }

  // Update roster
  await updateAgentRosterEntry(cwd, agentId, {
    status: 'done',
    task: null,
    last_done: Number(taskNumber) || null,
  });

  // Post-commit advisory PrincipalRuntime update
  try {
    const stateDir = resolvePrincipalStateDir({ cwd, principalStateDir: options.principalStateDir });
    const bridgeResult = await updatePrincipalRuntimeFromTaskEvent(stateDir, {
      type: 'task_reported',
      agent_id: agentId,
      task_id: taskFile.taskId,
      report_id: reportId,
    });
    if (bridgeResult.warning) {
      fmt.message(bridgeResult.warning, 'warning');
    }
  } catch {
    // Best-effort advisory update — never fail the command
  }

  const { guidance } = await recallAcceptedLearning({
    cwd,
    scopes: ['report', 'task-governance'],
  });

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        report_id: reportId,
        task_id: taskFile.taskId,
        agent_id: agentId,
        new_status: 'in_review',
        guidance: formatGuidanceForJson(guidance),
      },
    };
  }

  fmt.message(`Reported task ${taskFile.taskId}: in_review`, 'success');
  if (options.verbose && guidance.length > 0) {
    fmt.message('Active guidance:', 'info');
    for (const line of formatGuidanceForHumans(guidance)) {
      fmt.message(line, 'info');
    }
  }
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      report_id: reportId,
      task_id: taskFile.taskId,
      agent_id: agentId,
      new_status: 'in_review',
    },
  };
}
