import { resolve } from 'node:path';
import {
  findTaskFile,
  isValidTransition,
  loadAssignment,
  loadReport,
  loadRoster,
  type WorkResultReport,
  readTaskFile,
  saveReport,
  saveReview,
  updateAgentRosterEntry,
  writeTaskProjection,
  type ReviewFinding,
  inspectTaskEvidence,
} from './task-governance.js';
import { admitTaskEvidence } from './evidence-admission.js';
import { openTaskLifecycleStore, type TaskLifecycleStore, type TaskStatus } from './task-lifecycle-store.js';
import { closeTaskService } from './task-close-service.js';
import { ExitCode } from './exit-codes.js';

export interface ReviewTaskServiceOptions {
  taskNumber?: string;
  agent?: string;
  verdict?: 'accepted' | 'accepted_with_notes' | 'rejected';
  findings?: string;
  report?: string;
  cwd?: string;
  store?: TaskLifecycleStore;
}

export interface ReviewTaskServiceResponse {
  exitCode: ExitCode;
  result: {
    status: 'success' | 'error';
    review_id?: string;
    task_id?: string;
    verdict?: 'accepted' | 'accepted_with_notes' | 'rejected';
    review_verdict_status?: 'accepted' | 'rejected';
    lifecycle_status?: string;
    new_status?: string;
    admission_id?: string;
    close_action?: 'closed' | 'blocked' | 'skipped';
    close_blockers?: string[];
    evidence_blocked?: boolean;
    evidence_reason?: string;
    error?: string;
  };
}

export async function reviewTaskService(
  options: ReviewTaskServiceOptions,
): Promise<ReviewTaskServiceResponse> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;
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

  const agent = roster.agents.find((entry) => entry.agent_id === agentId);
  if (!agent) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Agent not found in roster: ${agentId}` },
    };
  }

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
  const ownStore = options.store ? null : openTaskLifecycleStore(cwd);
  const closeOwnStore = () => {
    if (ownStore) ownStore.db.close();
  };
  const store = options.store ?? ownStore ?? undefined;

  let sqliteStatus: string | undefined;
  if (store) {
    let lifecycle = store.getLifecycle(taskFile.taskId);
    if (!lifecycle) {
      const taskNum = Number(taskNumber);
      if (!Number.isFinite(taskNum)) {
        closeOwnStore();
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: { status: 'error', error: 'Cannot determine task number for SQLite backfill' },
        };
      }
      store.upsertLifecycle({
        task_id: taskFile.taskId,
        task_number: taskNum,
        status: (frontMatter.status as TaskStatus) || 'opened',
        governed_by: (frontMatter.governed_by as string) || null,
        closed_at: (frontMatter.closed_at as string) || null,
        closed_by: (frontMatter.closed_by as string) || null,
        reopened_at: (frontMatter.reopened_at as string) || null,
        reopened_by: (frontMatter.reopened_by as string) || null,
        continuation_packet_json: null,
        closure_mode: (frontMatter.closure_mode as Parameters<typeof store.upsertLifecycle>[0]['closure_mode']) || null,
        updated_at: new Date().toISOString(),
      });
      lifecycle = store.getLifecycle(taskFile.taskId)!;
    }
    sqliteStatus = lifecycle.status;
  }

  let currentStatus = sqliteStatus ?? (frontMatter.status as string | undefined);
  if (store && sqliteStatus === 'claimed' && frontMatter.status === 'in_review') {
    try {
      store.updateStatus(taskFile.taskId, 'in_review', agentId);
      currentStatus = 'in_review';
    } catch {
      // ignore
    }
  }

  if (currentStatus !== 'in_review') {
    closeOwnStore();
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} cannot be reviewed (status: ${currentStatus ?? 'missing'}, expected: in_review)`,
      },
    };
  }

  let newStatus: TaskStatus | 'in_review' = verdict === 'rejected' ? 'opened' : 'closed';
  let evidenceBlocked = false;
  let evidenceReason: string | undefined;

  if (verdict !== 'rejected') {
    const existing = await inspectTaskEvidence(cwd, taskNumber, store);
    if (existing.all_criteria_checked === false) {
      evidenceBlocked = true;
      evidenceReason = `${existing.unchecked_count} acceptance criteria remain unchecked`;
    } else if (!existing.has_report && !existing.has_execution_notes) {
      evidenceBlocked = true;
      evidenceReason = 'Task lacks execution evidence (no report or execution notes)';
    } else if (!existing.has_verification) {
      evidenceBlocked = true;
      evidenceReason = 'Task lacks verification notes';
    } else if (existing.violations.includes('terminal_with_derivative_files')) {
      evidenceBlocked = true;
      evidenceReason = 'Derivative task-status files exist';
    }
    if (evidenceBlocked) {
      newStatus = 'in_review';
    }
  }

  if (newStatus !== currentStatus && !isValidTransition(currentStatus, newStatus)) {
    closeOwnStore();
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Transition from '${String(currentStatus)}' to '${newStatus}' is not allowed by the state machine`,
      },
    };
  }

  let findings: ReviewFinding[] = [];
  if (findingsRaw) {
    try {
      const parsed = JSON.parse(findingsRaw) as unknown;
      if (!Array.isArray(parsed)) {
        closeOwnStore();
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: { status: 'error', error: 'Findings must be a JSON array' },
        };
      }
      const validSeverities = ['blocking', 'major', 'minor', 'note'] as const;
      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i];
        if (typeof item !== 'object' || item === null) {
          closeOwnStore();
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: { status: 'error', error: `Findings[${i}] is not an object` },
          };
        }
        const finding = item as Record<string, unknown>;
        if (!validSeverities.includes(finding.severity as typeof validSeverities[number])) {
          closeOwnStore();
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: {
              status: 'error',
              error: `Findings[${i}].severity must be one of: ${validSeverities.join(', ')}`,
            },
          };
        }
        if (typeof finding.description !== 'string') {
          closeOwnStore();
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: {
              status: 'error',
              error: `Findings[${i}].description must be a string`,
            },
          };
        }
        if (finding.location !== undefined && finding.location !== null && typeof finding.location !== 'string') {
          closeOwnStore();
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: {
              status: 'error',
              error: `Findings[${i}].location must be a string or null`,
            },
          };
        }
      }
      findings = parsed as ReviewFinding[];
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      closeOwnStore();
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Failed to parse findings: ${msg}` },
      };
    }
  }

  let linkedReport = null;
  if (options.report) {
    linkedReport = await loadReport(cwd, options.report);
    if (!linkedReport) {
      closeOwnStore();
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: `Report not found: ${options.report}` },
      };
    }
    if (linkedReport.task_id !== taskFile.taskId) {
      closeOwnStore();
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: `Report ${options.report} belongs to task ${linkedReport.task_id}, not ${taskFile.taskId}`,
        },
      };
    }
  }

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

  if (store) {
    store.insertReview({
      review_id: reviewId,
      reviewer_agent_id: agentId,
      task_id: taskFile.taskId,
      findings_json: findings.length > 0 ? JSON.stringify(findings) : null,
      verdict: verdict === 'accepted_with_notes' ? 'accepted' : verdict,
      reviewed_at: now,
    });
  } else {
    await saveReview(cwd, reviewRecord);
  }

  const admission = await admitTaskEvidence({
    cwd,
    taskNumber: Number(taskNumber),
    admittedBy: agentId,
    methods: ['review'],
    requireReview: verdict !== 'rejected',
    store,
  });

  if (verdict !== 'rejected' && admission.result.verdict === 'rejected') {
    evidenceBlocked = true;
    evidenceReason = admission.blockers.join('; ');
    newStatus = 'in_review';
  }

  if (store && newStatus === 'opened') {
    try {
      store.updateStatus(taskFile.taskId, 'opened', agentId);
    } catch {
      // fallback through projection if needed
      frontMatter.status = 'opened';
      await writeTaskProjection(taskFile.path, frontMatter, body);
    }
  }

  if (linkedReport) {
    const updatedReport: WorkResultReport = {
      ...linkedReport,
      report_status: verdict === 'rejected' ? 'rejected' : 'accepted',
    };
    if (store) {
      const existing = store.getReportRecord(linkedReport.report_id);
      if (existing) {
        try {
          const parsed = JSON.parse(existing.report_json) as WorkResultReport;
          const next = {
            ...parsed,
            report_status: updatedReport.report_status,
          };
          store.upsertReportRecord({
            task_id: next.task_id,
            report_id: next.report_id,
            report_json: JSON.stringify(next),
          } as Parameters<typeof store.upsertReportRecord>[0]);
        } catch {
          await saveReport(cwd, updatedReport);
        }
      } else {
        await saveReport(cwd, updatedReport);
      }
    } else {
      await saveReport(cwd, updatedReport);
    }
  }

  let closeAction: 'closed' | 'blocked' | 'skipped' = 'skipped';
  let closeBlockers: string[] = [];

  if (newStatus === 'closed') {
    const closeResult = await closeTaskService({
      taskNumber,
      by: agentId,
      cwd,
      store,
      mode: 'peer_reviewed',
    });
    if (closeResult.exitCode === ExitCode.SUCCESS) {
      closeAction = 'closed';
    } else {
      closeAction = 'blocked';
      newStatus = 'in_review';
      evidenceBlocked = true;
      const blockedResult = closeResult.result as { gate_failures?: string[]; error?: string };
      closeBlockers = blockedResult.gate_failures ?? [blockedResult.error ?? 'Lifecycle close failed'];
      evidenceReason = closeBlockers.join('; ');
    }
  } else {
    const nextFrontMatter = { ...frontMatter, status: newStatus } as typeof frontMatter;
    await writeTaskProjection(taskFile.path, nextFrontMatter, body);
  }

  await updateAgentRosterEntry(cwd, agentId, {});

  const result: ReviewTaskServiceResponse['result'] = {
    status: 'success',
    review_id: reviewId,
    task_id: taskFile.taskId,
    verdict,
    review_verdict_status: verdict === 'rejected' ? 'rejected' : 'accepted',
    lifecycle_status: newStatus,
    new_status: newStatus,
    admission_id: admission.result.admission_id,
    close_action: closeAction,
  };

  if (closeBlockers.length > 0) {
    result.close_blockers = closeBlockers;
  }
  if (evidenceBlocked) {
    result.evidence_blocked = true;
    if (evidenceReason) {
      result.evidence_reason = evidenceReason;
    }
  }

  closeOwnStore();
  return {
    exitCode: ExitCode.SUCCESS,
    result,
  };
}
