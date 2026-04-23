/**
 * Task review operator.
 *
 * Mutation: creates a review record and transitions task status
 * based on the verdict.
 */

import { resolve } from 'node:path';
import {
  loadRoster,
  findTaskFile,
  loadReview,
  saveReview,
  readTaskFile,
  writeTaskFile,
  isValidTransition,
  loadReport,
  saveReport,
  type ReviewFinding,
} from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  resolvePrincipalStateDir,
  updatePrincipalRuntimeFromTaskEvent,
} from '../lib/principal-bridge.js';

export interface TaskReviewOptions {
  taskNumber?: string;
  format?: 'json' | 'human' | 'auto';
  agent?: string;
  verdict?: 'accepted' | 'accepted_with_notes' | 'rejected';
  findings?: string;
  report?: string;
  cwd?: string;
  principalStateDir?: string;
}

export async function taskReviewCommand(
  options: TaskReviewOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = (options as Record<string, unknown>).taskNumber as string | undefined;
  const agentId = options.agent;
  const verdict = options.verdict;
  const findingsRaw = options.findings;

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

  if (!verdict) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--verdict is required (accepted, accepted_with_notes, rejected)' },
    };
  }

  const VALID_VERDICTS = ['accepted', 'accepted_with_notes', 'rejected'] as const;
  if (!VALID_VERDICTS.includes(verdict as typeof VALID_VERDICTS[number])) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `--verdict must be one of: ${VALID_VERDICTS.join(', ')}` },
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

  // Read task file
  const { frontMatter, body } = await readTaskFile(taskFile.path);

  // Task must be in_review to be reviewed
  if (frontMatter.status !== 'in_review') {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} cannot be reviewed (status: ${frontMatter.status ?? 'missing'}, expected: in_review)`,
      },
    };
  }

  // Determine new status based on verdict
  let newStatus = verdict === 'rejected' ? 'opened' : 'closed';

  // Evidence gate: accepted verdict only closes if all closure gates are satisfied
  let evidenceBlocked = false;
  let evidenceReason: string | undefined;
  if (verdict !== 'rejected') {
    const { inspectTaskEvidence } = await import('../lib/task-governance.js');
    const evidence = await inspectTaskEvidence(cwd, taskNumber);
    if (evidence.all_criteria_checked === false) {
      evidenceBlocked = true;
      evidenceReason = `${evidence.unchecked_count} acceptance criteria remain unchecked`;
    } else if (!evidence.has_report && !evidence.has_execution_notes) {
      evidenceBlocked = true;
      evidenceReason = 'Task lacks execution evidence (no report or execution notes)';
    } else if (!evidence.has_verification) {
      evidenceBlocked = true;
      evidenceReason = 'Task lacks verification notes';
    } else if (evidence.violations.includes('terminal_with_derivative_files')) {
      evidenceBlocked = true;
      evidenceReason = 'Derivative task-status files exist';
    }
    if (evidenceBlocked) {
      newStatus = 'in_review'; // Keep in review so evidence can be added
    }
  }

  // Validate transition (allow same-status when evidence gate blocked)
  if (newStatus !== frontMatter.status && !isValidTransition(frontMatter.status, newStatus)) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Transition from '${String(frontMatter.status)}' to '${newStatus}' is not allowed by the state machine`,
      },
    };
  }

  // Parse and shape-validate findings
  let findings: ReviewFinding[] = [];
  if (findingsRaw) {
    try {
      const parsed = JSON.parse(findingsRaw) as unknown;
      if (!Array.isArray(parsed)) {
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: { status: 'error', error: 'Findings must be a JSON array' },
        };
      }
      const VALID_SEVERITIES = ['blocking', 'major', 'minor', 'note'] as const;
      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i];
        if (typeof item !== 'object' || item === null) {
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: { status: 'error', error: `Findings[${i}] is not an object` },
          };
        }
        const f = item as Record<string, unknown>;
        if (!VALID_SEVERITIES.includes(f.severity as typeof VALID_SEVERITIES[number])) {
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: { status: 'error', error: `Findings[${i}].severity must be one of: ${VALID_SEVERITIES.join(', ')}` },
          };
        }
        if (typeof f.description !== 'string') {
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: { status: 'error', error: `Findings[${i}].description must be a string` },
          };
        }
        if (f.location !== undefined && f.location !== null && typeof f.location !== 'string') {
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: { status: 'error', error: `Findings[${i}].location must be a string or null` },
          };
        }
      }
      findings = parsed as ReviewFinding[];
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Failed to parse findings: ${msg}` },
      };
    }
  }

  // If --report is provided, validate it belongs to this task
  let linkedReport = null;
  if (options.report) {
    linkedReport = await loadReport(cwd, options.report);
    if (!linkedReport) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: `Report not found: ${options.report}` },
      };
    }
    if (linkedReport.task_id !== taskFile.taskId) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: `Report ${options.report} belongs to task ${linkedReport.task_id}, not ${taskFile.taskId}`,
        },
      };
    }
  }

  // Create review record
  const now = new Date().toISOString();
  const reviewId = `review-${taskFile.taskId}-${Date.now()}`;
  const reviewRecord = {
    review_id: reviewId,
    reviewer_agent_id: agentId,
    task_id: taskFile.taskId,
    findings,
    verdict,
    reviewed_at: now,
    report_id: options.report ?? null,
  };

  await saveReview(cwd, reviewRecord);

  // Update linked report status if applicable
  if (linkedReport) {
    linkedReport.report_status = verdict === 'rejected' ? 'rejected' : 'accepted';
    await saveReport(cwd, linkedReport);
  }

  // Update task status
  frontMatter.status = newStatus;
  if (newStatus === 'closed') {
    frontMatter.governed_by = `task_review:${agentId}`;
    frontMatter.closed_at = new Date().toISOString();
    frontMatter.closed_by = agentId;
  }
  await writeTaskFile(taskFile.path, frontMatter, body);

  // Post-commit advisory PrincipalRuntime update
  try {
    const stateDir = resolvePrincipalStateDir({ cwd, principalStateDir: options.principalStateDir });
    const bridgeResult = await updatePrincipalRuntimeFromTaskEvent(stateDir, {
      type: verdict === 'rejected' ? 'task_review_rejected' : 'task_review_accepted',
      agent_id: agentId,
      task_id: taskFile.taskId,
      review_id: reviewId,
    });
    if (bridgeResult.warning) {
      fmt.message(bridgeResult.warning, 'warning');
    }
  } catch {
    // Best-effort advisory update — never fail the command
  }

  // Update roster last_active_at
  agent.last_active_at = now;
  const { join } = await import('node:path');
  const { atomicWriteFile } = await import('../lib/task-governance.js');
  await atomicWriteFile(join(cwd, '.ai/agents/roster.json'), JSON.stringify(roster, null, 2) + '\n');

  if (fmt.getFormat() === 'json') {
    const result: Record<string, unknown> = {
      status: 'success',
      review_id: reviewId,
      task_id: taskFile.taskId,
      verdict,
      new_status: newStatus,
    };
    if (evidenceBlocked) {
      result.evidence_blocked = true;
      result.evidence_reason = evidenceReason;
    }
    return {
      exitCode: ExitCode.SUCCESS,
      result,
    };
  }

  if (evidenceBlocked) {
    fmt.message(`Reviewed task ${taskFile.taskId}: ${verdict} → ${newStatus} (evidence gate blocked: ${evidenceReason})`, 'warning');
  } else {
    fmt.message(`Reviewed task ${taskFile.taskId}: ${verdict} → ${newStatus}`, 'success');
  }
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      review_id: reviewId,
      task_id: taskFile.taskId,
      verdict,
      new_status: newStatus,
      ...(evidenceBlocked ? { evidence_blocked: true, evidence_reason: evidenceReason } : {}),
    },
  };
}
