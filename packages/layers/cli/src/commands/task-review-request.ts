import { resolve, join } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  findTaskFile,
  listReportsForTask,
  loadRoster,
  type WorkResultReport,
} from '@narada2/task-governance-core/task-governance';
import { resolveReviewTargetFromRoster, resolveDefaultReviewerFromRoster } from '@narada2/task-governance-core/task-review-authority';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  openTaskLifecycleStore,
  type TaskLifecycleStore,
} from '../lib/task-lifecycle-store.js';
import { buildAgentIdentityRefV2, resolveAgentIdentityRef } from '@narada2/agent-identity';
import {
  captureTaskLifecycleEvidenceState,
  writeTaskLifecycleMutationEvidence,
} from '../lib/mutation-evidence-writer.js';

export interface TaskReviewRequestOptions {
  taskNumber?: string;
  agent?: string;
  reviewer?: string;
  report?: string;
  cwd?: string;
  format?: 'json' | 'human' | 'auto';
  store?: TaskLifecycleStore;
}

function safeIdPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function reviewTargetIdPart(target: { target_agent_id: string | null; target_role: string | null }): string {
  return target.target_agent_id ?? (target.target_role ? `role_${target.target_role}` : 'unknown');
}

function reviewCommandAgentPlaceholder(target: { target_agent_id: string | null; target_role: string | null }): string {
  return target.target_agent_id ?? `<${target.target_role ?? 'reviewer'}-agent>`;
}

function buildSourceAgentIdentityRef(sourceAgentId: string) {
  const resolved = resolveAgentIdentityRef(sourceAgentId, { role: sourceAgentId });
  if (resolved.status === 'resolved') return resolved.value;
  const localAgentId = sourceAgentId.split('.').filter(Boolean).at(-1) || sourceAgentId;
  return buildAgentIdentityRefV2({
    identity_scope: { kind: 'unscoped' },
    local_agent_id: localAgentId,
    role: localAgentId,
    canonical_agent_id: sourceAgentId,
    display: sourceAgentId,
    legacy_agent_id: sourceAgentId,
  });
}

function selectReport(reports: WorkResultReport[], reportId?: string): WorkResultReport | null {
  if (reportId) return reports.find((report) => report.report_id === reportId) ?? null;
  return reports[reports.length - 1] ?? null;
}

export async function taskReviewRequestCommand(
  options: TaskReviewRequestOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  if (!options.taskNumber) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: 'Task number is required' } };
  }
  if (!options.agent) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--agent is required' } };
  }
  const before = await captureTaskLifecycleEvidenceState(cwd, options.taskNumber, options.store);
  const taskFile = await findTaskFile(cwd, options.taskNumber);
  if (!taskFile) {
    return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: `Task not found: ${options.taskNumber}` } };
  }

  const reports = await listReportsForTask(cwd, taskFile.taskId);
  const report = selectReport(reports, options.report);
  if (!report) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: options.report
          ? `Report not found for task ${options.taskNumber}: ${options.report}`
          : `Task ${options.taskNumber} has no report to request review for`,
      },
    };
  }
  if (report.agent_id !== options.agent) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Report ${report.report_id} belongs to ${report.agent_id}, not ${options.agent}` },
    };
  }

  const roster = await loadRoster(cwd);
  let target = resolveReviewTargetFromRoster(roster, options.reviewer, { taskNumber: options.taskNumber });
  if (!target && !options.reviewer) {
    // No reviewer specified; try to resolve site default reviewer role
    let defaultRole: string | undefined;
    try {
      const configPath = join(cwd, 'config.json');
      const raw = readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw) as Record<string, unknown>;
      const governance = config?.task_governance as Record<string, unknown> | undefined;
      defaultRole = typeof governance?.default_reviewer_role === 'string'
        ? governance.default_reviewer_role
        : undefined;
    } catch {
      defaultRole = undefined;
    }
    if (defaultRole) {
      target = resolveDefaultReviewerFromRoster(roster, defaultRole);
    }
  }
  if (!target) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--reviewer is required when no site default_reviewer_role is configured' } };
  }
  if (!target.ok) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: target.error,
        review_authority_repair: target.review_authority_repair,
      },
    };
  }

  const store = options.store ?? openTaskLifecycleStore(cwd);
  const closeStore = !options.store;
  try {
    const taskNumber = Number(options.taskNumber);
    const obligationId = `obl_review_${safeIdPart(taskFile.taskId)}_${safeIdPart(report.report_id)}_${safeIdPart(reviewTargetIdPart(target))}`;
    const existing = store.listDirectedObligationsForTask(taskFile.taskId, 'open')
      .find((obligation) => obligation.source_kind === 'task_report'
        && obligation.source_ref === report.report_id
        && obligation.target_agent_id === target.target_agent_id
        && obligation.target_role === target.target_role
        && obligation.kind === 'review_request');
    if (existing) {
      const result = {
        status: 'success',
        action: 'reused',
        obligation_id: existing.obligation_id,
        task_id: taskFile.taskId,
        task_number: taskNumber,
        report_id: report.report_id,
        review_target: target,
        source_agent_identity_ref: buildSourceAgentIdentityRef(options.agent),
      };
      if (fmt.getFormat() === 'json') return { exitCode: ExitCode.SUCCESS, result };
      fmt.message(`Review request already exists for task ${options.taskNumber}: ${existing.obligation_id}`, 'success');
      return { exitCode: ExitCode.SUCCESS, result };
    }

    const spec = store.getTaskSpecByNumber(taskNumber) ?? store.getTaskSpec(taskFile.taskId);
    const now = new Date().toISOString();
    const sourceAgentIdentityRef = buildSourceAgentIdentityRef(options.agent);
    store.upsertDirectedObligation({
      obligation_id: obligationId,
      source_kind: 'task_report',
      source_ref: report.report_id,
      source_agent_id: options.agent,
      target_agent_id: target.target_agent_id,
      target_role: target.target_role,
      target_ref: target.requested,
      kind: 'review_request',
      status: 'open',
      task_id: taskFile.taskId,
      task_number: taskNumber,
      evidence_json: JSON.stringify({
        report_id: report.report_id,
        task_number: taskNumber,
        task_title: spec?.title ?? null,
        report_summary: report.summary,
        changed_files: report.changed_files,
        verification: report.verification,
        residuals: report.known_residuals,
        requested_target: target.requested,
        target_resolution: target.resolution,
        source_agent_identity_ref: sourceAgentIdentityRef,
      }),
      consumption_rule_json: JSON.stringify({
        consume_on: ['task_review', 'task_defer', 'delegation', 'rejection', 'completion'],
        review_command: `narada task review ${options.taskNumber} --agent ${reviewCommandAgentPlaceholder(target)} --verdict accepted --report ${report.report_id}`,
      }),
      created_at: now,
      updated_at: now,
      consumed_at: null,
      consumed_by: null,
      consumption_ref: null,
    });
    const after = await captureTaskLifecycleEvidenceState(cwd, options.taskNumber, store);
    const result = {
      status: 'success',
      action: 'created',
      obligation_id: obligationId,
      task_id: taskFile.taskId,
      task_number: taskNumber,
      report_id: report.report_id,
      review_target: target,
      source_agent_identity_ref: sourceAgentIdentityRef,
      review_command: `narada task review ${options.taskNumber} --agent ${reviewCommandAgentPlaceholder(target)} --verdict accepted --report ${report.report_id}`,
    };
    await writeTaskLifecycleMutationEvidence({
      cwd,
      taskNumber: options.taskNumber,
      command: 'task review-request',
      principal: options.agent,
      authorityClass: 'resolve',
      before,
      after,
      result,
    });
    if (fmt.getFormat() === 'json') return { exitCode: ExitCode.SUCCESS, result };
    fmt.message(`Review request created for task ${options.taskNumber}: ${obligationId}`, 'success');
    return { exitCode: ExitCode.SUCCESS, result };
  } finally {
    if (closeStore) store.db.close();
  }
}