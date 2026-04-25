import { resolve } from 'node:path';
import {
  createReportId,
  findReportByAssignmentId,
  findTaskFile,
  getActiveAssignment,
  getActiveContinuation,
  getAssignmentIntent,
  loadAssignment,
  loadRoster,
  readTaskFile,
  saveAssignment,
  saveReport,
  updateAgentRosterEntry,
  writeTaskProjection,
  isValidTransition,
  type WorkResultReport,
  type AssignmentIntent,
} from './task-governance.js';
import { openTaskLifecycleStore, type TaskLifecycleStore } from './task-lifecycle-store.js';
import { ExitCode } from './exit-codes.js';

export interface ReportTaskServiceOptions {
  taskNumber?: string;
  agent?: string;
  summary?: string;
  changedFiles?: string;
  verification?: string;
  residuals?: string;
  cwd?: string;
  store?: TaskLifecycleStore;
}

export interface ReportTaskServiceResult {
  status: 'success' | 'error';
  report_id?: string;
  task_id?: string;
  agent_id?: string;
  new_status?: string;
  note?: string;
  task_number?: number;
  assignment_id?: string;
  error?: string;
  guidance?: never;
}

export interface ReportTaskServiceResponse {
  exitCode: ExitCode;
  result: ReportTaskServiceResult;
}

function parseChangedFiles(value: string | undefined): ReportTaskServiceResponse | null | { ok: true; value: string[] } {
  if (!value) {
    return { ok: true, value: [] };
  }

  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed)) {
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: { status: 'error', error: 'changed_files must be a JSON array or comma-separated list' },
        };
      }
      for (let i = 0; i < parsed.length; i++) {
        if (typeof parsed[i] !== 'string') {
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: { status: 'error', error: `changed_files[${i}] must be a string` },
          };
        }
      }
      return { ok: true, value: parsed as string[] };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Failed to parse changed files: ${msg}` },
      };
    }
  }

  return {
    ok: true,
    value: trimmed.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0),
  };
}

function parseStringJsonArray(value: string | undefined, label: string): ReportTaskServiceResponse | null | { ok: true; value: string[] } {
  if (!value) {
    return { ok: true, value: [] };
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `${label} must be a JSON array` },
      };
    }
    const list: string[] = [];
    for (let i = 0; i < parsed.length; i++) {
      if (typeof parsed[i] !== 'string') {
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: { status: 'error', error: `${label}[${i}] must be a string` },
        };
      }
      list.push(parsed[i] as string);
    }
    return { ok: true, value: list };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to parse ${label}: ${msg}` },
    };
  }
}

function parseVerification(value: string | undefined): ReportTaskServiceResponse | null | { ok: true; value: Array<{ command: string; result: string }> } {
  if (!value) {
    return { ok: true, value: [] };
  }

  try {
    const parsed = JSON.parse(value) as unknown;
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
          result: {
            status: 'error',
            error: `verification[${i}] is not an object`,
          },
        };
      }
      const record = item as Record<string, unknown>;
      if (typeof record.command !== 'string') {
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: {
            status: 'error',
            error: `verification[${i}].command must be a string`,
          },
        };
      }
      if (typeof record.result !== 'string') {
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: {
            status: 'error',
            error: `verification[${i}].result must be a string`,
          },
        };
      }
    }
    return { ok: true, value: parsed as Array<{ command: string; result: string }> };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to parse verification: ${msg}` },
    };
  }
}

export async function reportTaskService(
  options: ReportTaskServiceOptions,
): Promise<ReportTaskServiceResponse> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;
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

  const { frontMatter, body: baseBody } = await readTaskFile(taskFile.path);
  let body = baseBody;

  if (frontMatter.status !== 'claimed') {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskFile.taskId} cannot be reported (status: ${frontMatter.status ?? 'missing'}, expected: claimed)`,
      },
    };
  }

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

  const existingReport = await findReportByAssignmentId(cwd, assignmentId);
  if (existingReport) {
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

  if (!isValidTransition(frontMatter.status as string, 'in_review')) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Transition from '${String(frontMatter.status)}' to 'in_review' is not allowed by the state machine`,
      },
    };
  }

  const parsedChangedFilesResult = parseChangedFiles(options.changedFiles);
  if (parsedChangedFilesResult && 'exitCode' in parsedChangedFilesResult) {
    return parsedChangedFilesResult;
  }
  const changedFiles = parsedChangedFilesResult && 'ok' in parsedChangedFilesResult
    ? parsedChangedFilesResult.value
    : [];

  const parsedResidualsResult = parseStringJsonArray(options.residuals, 'residuals');
  if (parsedResidualsResult && 'exitCode' in parsedResidualsResult) {
    return parsedResidualsResult;
  }
  const knownResiduals = parsedResidualsResult && 'ok' in parsedResidualsResult
    ? parsedResidualsResult.value
    : [];

  const parsedVerificationResult = parseVerification(options.verification);
  if (parsedVerificationResult && 'exitCode' in parsedVerificationResult) {
    return parsedVerificationResult;
  }
  const verification = parsedVerificationResult && 'ok' in parsedVerificationResult
    ? parsedVerificationResult.value
    : [];

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
    activeContinuation!.completed_at = now;
    await saveAssignment(cwd, assignmentRecord);
    if (missingSections.length > 0) {
      await writeTaskProjection(taskFile.path, frontMatter, body);
    }
  } else {
    activeAssignment.released_at = now;
    activeAssignment.release_reason = 'completed';
    await saveAssignment(cwd, assignmentRecord);

    const nextFrontMatter = { ...frontMatter, status: 'in_review' } as typeof frontMatter;
    await writeTaskProjection(taskFile.path, nextFrontMatter, body);

    const store = options.store ?? openTaskLifecycleStore(cwd);
    const closeOwnStore = () => {
      if (!options.store) {
        store.db.close();
      }
    };

    try {
      store.updateStatus(taskFile.taskId, 'in_review', agentId);
      closeOwnStore();
    } catch {
      closeOwnStore();
    }
  }

  await updateAgentRosterEntry(cwd, agentId, {
    status: 'done',
    task: null,
    last_done: Number(taskNumber) || null,
  });

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      report_id: reportId,
      task_id: taskFile.taskId,
      agent_id: agentId,
      new_status: 'in_review',
      assignment_id: assignmentId,
    },
  };
}
