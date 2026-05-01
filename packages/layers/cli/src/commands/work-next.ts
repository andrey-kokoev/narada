/**
 * Unified next-action surface for agents and operators.
 *
 * This command composes task execution and inbox handling into one bounded answer
 * so an agent does not need to know which subsystem to query first.
 */

import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  evaluateAuthorityInversionForChangedFiles,
  summarizeAuthorityInversionWarning,
} from '../lib/authority-inversion.js';
import { inspectAuthorityClonePosture } from '../lib/narada-proper-authority.js';
import {
  findTaskFile,
  loadRoster,
  listReportsForTask,
  listReviewsForTask,
  readTaskFile,
  scanTasksByRange,
} from '../lib/task-governance.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import { inboxWorkNextCommand } from './inbox.js';
import { taskDispatchCommand } from './task-dispatch.js';
import { taskPeekNextCommand, taskWorkNextCommand } from './task-next.js';
import { agentAddressResolutionPublic, resolveAgentAddress } from '../lib/agent-address.js';
import { classifyTaskHandoffActionability } from '../lib/task-actionability.js';
import { operatorSurfaceTaskAuthorityRepair } from '../lib/operator-surface-task-authority.js';
import { parseTaskSpecFromMarkdown } from '../lib/task-spec.js';
import { checkLawAdmission } from '../lib/law-sync.js';
import { evaluateSiteQualification, qualificationBlocksGovernedWork } from '../lib/site-qualification.js';

export interface WorkNextOptions {
  agent?: string;
  cwd?: string;
  format?: CliFormat;
  startTask?: boolean;
  execTask?: boolean;
  peek?: boolean;
}

interface CommandEnvelope {
  exitCode: ExitCode;
  result: unknown;
}

type WorkNextCheckedStatus = 'selected' | 'empty' | 'blocked';

interface WorkNextCheckedZone {
  zone: 'task_work' | 'review_work' | 'inbox_work';
  status: WorkNextCheckedStatus;
  reason?: string;
  selected_ref?: string;
}

interface DoctrineGuardStatus {
  status: 'clear' | 'warning' | 'blocked';
  warnings: unknown[];
  blockers: string[];
  next_commands: string[];
}

interface PendingReviewWork {
  task_number: number | null;
  task_id: string;
  title: string | null;
  status: string;
  report_id: string | null;
  reported_by: string | null;
  suggested_owner: string;
  suggested_command: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isEmptyTaskResult(result: unknown): boolean {
  const record = asRecord(result);
  return record.status === 'empty' && record.reason === 'no_admissible_task';
}

function isAgentNotFound(result: unknown): boolean {
  const record = asRecord(result);
  return record.status === 'error'
    && (record.reason === 'agent_not_in_roster' || record.reason === 'agent_not_found');
}

function taskSelectedRef(primary: Record<string, unknown>): string | undefined {
  return typeof primary.task_number === 'number'
    ? `task:${primary.task_number}`
    : typeof primary.task_id === 'string'
      ? `task:${primary.task_id}`
      : undefined;
}

function inboxSelectedRef(primary: unknown): string | undefined {
  const record = asRecord(primary);
  return typeof record.envelope_id === 'string' ? `inbox:${record.envelope_id}` : undefined;
}

function emptyReason(result: unknown, fallback: string): string {
  const record = asRecord(result);
  return typeof record.reason === 'string' ? record.reason : fallback;
}

function formatHuman(result: Record<string, unknown>): string {
  const lines = [
    `Next action: ${String(result.action_kind)}`,
    `Agent: ${String(result.agent_id)}`,
  ];
  if (result.action_kind === 'task_work') {
    const primary = asRecord(result.primary);
    lines.push(`Task: ${String(primary.task_number ?? 'unknown')}`);
    if (primary.title) lines.push(`Title: ${String(primary.title)}`);
  } else if (result.action_kind === 'inbox_work') {
    const primary = asRecord(result.primary);
    lines.push(`Envelope: ${String(primary.envelope_id ?? 'unknown')}`);
    if (primary.kind) lines.push(`Kind: ${String(primary.kind)}`);
  } else if (result.action_kind === 'review_work') {
    const primary = asRecord(result.primary);
    lines.push(`Task: ${String(primary.task_number ?? 'unknown')}`);
    if (primary.report_id) lines.push(`Report: ${String(primary.report_id)}`);
  } else if (result.reason) {
    lines.push(`Reason: ${String(result.reason)}`);
  }
  const checked = Array.isArray(result.checked) ? result.checked : [];
  if (checked.length > 0) {
    lines.push('Checked:');
    for (const item of checked) {
      const record = asRecord(item);
      const detail = record.selected_ref ?? record.reason;
      lines.push(`- ${String(record.zone)}: ${String(record.status)}${detail ? ` (${String(detail)})` : ''}`);
    }
  }
  if (result.next_step) lines.push(`Next step: ${String(result.next_step)}`);
  const hidden = asRecord(result.blocked_or_hidden_work);
  const hiddenRows = Array.isArray(hidden.items) ? hidden.items : [];
  if (hiddenRows.length > 0) {
    lines.push('Blocked or hidden work:');
    for (const item of hiddenRows.slice(0, 5)) {
      const record = asRecord(item);
      lines.push(`- task ${String(record.task_number)}: ${String(record.reason)}`);
    }
  }
  const architectLoop = asRecord(result.architect_duty_loop);
  const pendingReviews = Array.isArray(architectLoop.pending_reviews) ? architectLoop.pending_reviews : [];
  if (pendingReviews.length > 0) {
    lines.push('Architect duty loop:');
    for (const item of pendingReviews.slice(0, 5)) {
      const record = asRecord(item);
      lines.push(`- review task ${String(record.task_number)}: owner ${String(record.suggested_owner)}`);
    }
  }
  const doctrineGuard = asRecord(result.doctrine_guard);
  if (doctrineGuard.status && doctrineGuard.status !== 'clear') {
    lines.push(`Doctrine guard: ${String(doctrineGuard.status)}`);
    const commands = Array.isArray(doctrineGuard.next_commands) ? doctrineGuard.next_commands : [];
    for (const command of commands.slice(0, 3)) lines.push(`- ${String(command)}`);
  }
  return lines.join('\n');
}

function canOwnReviewWork(role: string | undefined, agentId: string): boolean {
  const normalized = `${role ?? ''} ${agentId}`.toLowerCase();
  return /\b(reviewer|operator|admin)\b/.test(normalized);
}

function taskTitleFromStore(store: ReturnType<typeof openTaskLifecycleStore>, taskNumber: number): string | null {
  return store.getTaskSpecByNumber(taskNumber)?.title ?? null;
}

function blockingWorkForAgent(
  store: ReturnType<typeof openTaskLifecycleStore>,
  agentId: string,
): Array<Record<string, unknown>> {
  const rows = store.getAllLifecycle();
  return rows
    .filter((row) => row.task_number !== null)
    .filter((row) => ['claimed', 'needs_continuation', 'in_review'].includes(row.status))
    .filter((row) => store.getActiveAssignment(row.task_id)?.agent_id === agentId || store.getRosterEntry(agentId)?.task_number === row.task_number)
    .map((row) => ({
      task_number: row.task_number,
      task_id: row.task_id,
      title: row.task_number === null ? null : taskTitleFromStore(store, row.task_number),
      status: row.status,
      assigned_agent: agentId,
    }));
}

function summarizeBlockedOrHiddenWork(cwd: string, agentId: string, limit = 5): Record<string, unknown> {
  const store = openTaskLifecycleStore(cwd);
  try {
    const blockers = blockingWorkForAgent(store, agentId);
    const rows = store.getAllLifecycle()
      .filter((row) => row.task_number !== null)
      .filter((row) => row.status === 'opened' || row.status === 'needs_continuation')
      .sort((a, b) => (a.task_number ?? 0) - (b.task_number ?? 0))
      .slice(0, limit)
      .map((row) => ({
        task_number: row.task_number,
        task_id: row.task_id,
        title: row.task_number === null ? null : taskTitleFromStore(store, row.task_number),
        status: row.status,
        reason: blockers.length > 0
          ? 'agent_has_active_or_review_pending_work'
          : 'not_selected_by_task_recommender_or_dependency_filter',
        blocking_owner: blockers.length > 0 ? agentId : null,
        blocking_tasks: blockers.map((blocker) => ({
          task_number: blocker.task_number,
          title: blocker.title,
          status: blocker.status,
          owner: blocker.assigned_agent,
        })),
        suggested_next_command: blockers.length > 0
          ? `finish, report, or request review/closure for task ${blockers[0]?.task_number}`
          : `narada task recommend --agent ${agentId} --format json`,
      }));
    return {
      status: rows.length > 0 ? 'open_work_suppressed_or_hidden' : 'none',
      count: rows.length,
      limit,
      items: rows,
    };
  } finally {
    store.db.close();
  }
}

async function summarizeArchitectDutyLoop(cwd: string, limit = 5): Promise<Record<string, unknown>> {
  const pendingReviews = await listPendingReviewWork(cwd, limit);
  const checklist = [
    'Check pending reviews and closures before treating Builder no-work as system idle.',
    'Check blocked tasks and underspecified handoffs.',
    'Nudge the owner shown by blocking_owner/suggested_owner, or run the suggested review command.',
  ];
  return {
    status: pendingReviews.length > 0 ? 'review_or_closure_pending' : 'clear',
    pending_reviews: pendingReviews,
    blocked_tasks: [],
    underspecified_handoffs: [],
    checklist,
    next_command: pendingReviews[0]?.suggested_command ?? 'narada work-next --agent architect --peek --format json',
  };
}

async function listPendingReviewWork(cwd: string, limit = 5): Promise<PendingReviewWork[]> {
  const tasks = await scanTasksByRange(cwd, 1, 999999);
  let store;
  try {
    store = openTaskLifecycleStore(cwd);
  } catch {
    // Markdown scan remains a fallback for test repos without initialized SQLite.
  }
  try {
    const rows: PendingReviewWork[] = [];
    const ordered = tasks
      .filter((task) => task.taskNumber !== null)
      .sort((a, b) => (a.taskNumber ?? 0) - (b.taskNumber ?? 0));

    for (const task of ordered) {
      const lifecycleStatus = store?.getLifecycle(task.taskId)?.status;
      const status = lifecycleStatus ?? task.status;
      if (status !== 'in_review') continue;

      const reports = await listReportsForTask(cwd, task.taskId);
      const report = reports[reports.length - 1] ?? null;
      const reviews = await listReviewsForTask(cwd, task.taskId).catch(() => []);
      if (reviews.length > 0) continue;

      rows.push({
        task_id: task.taskId,
        task_number: task.taskNumber,
        title: store && task.taskNumber !== null ? taskTitleFromStore(store, task.taskNumber) : null,
        status,
        report_id: report?.report_id ?? null,
        reported_by: report?.agent_id ?? null,
        suggested_owner: 'operator',
        suggested_command: task.taskNumber === null
          ? null
          : `narada task review ${task.taskNumber} --agent operator --verdict accepted`,
      });
      if (rows.length >= limit) break;
    }
    return rows;
  } finally {
    if (store) store.db.close();
  }
}

async function buildDoctrineGuard(cwd: string): Promise<DoctrineGuardStatus> {
  const changedFiles = currentChangedFiles(cwd);
  const authorityWarnings = await evaluateAuthorityInversionForChangedFiles(cwd, changedFiles.join(','));
  const posture = inspectAuthorityClonePosture(cwd);
  const blockers: string[] = [];
  const nextCommands: string[] = [];

  if (posture.configured && posture.status !== 'authority_clone') {
    blockers.push(`authority_locus:${posture.status}`);
    if (posture.next_safe_command) nextCommands.push(posture.next_safe_command);
  }

  if (authorityWarnings.length > 0) {
    nextCommands.push('narada coherence scan --module authority_inversion --submit');
  }

  const warnings = authorityWarnings.map((warning) => ({
    ...summarizeAuthorityInversionWarning(warning),
    next_command: warning.recommended_follow_up ?? 'narada coherence scan --module authority_inversion --submit',
  }));

  return {
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'clear',
    warnings,
    blockers,
    next_commands: [...new Set(nextCommands)],
  };
}

function currentChangedFiles(cwd: string): string[] {
  const tracked = gitLines(cwd, ['diff', '--name-only']);
  const staged = gitLines(cwd, ['diff', '--name-only', '--cached']);
  const untracked = gitLines(cwd, ['ls-files', '--others', '--exclude-standard']);
  return [...new Set([...tracked, ...staged, ...untracked])].sort();
}

function gitLines(cwd: string, args: string[]): string[] {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function findReviewWork(cwd: string, agentId: string, role?: string): Promise<Record<string, unknown> | null> {
  if (!canOwnReviewWork(role, agentId)) return null;
  const tasks = await scanTasksByRange(cwd, 1, 999999);
  let store;
  try {
    store = openTaskLifecycleStore(cwd);
  } catch {
    // Markdown scan remains a fallback for test repos without initialized SQLite.
  }
  try {
    const ordered = tasks
      .filter((task) => task.taskNumber !== null)
      .sort((a, b) => (a.taskNumber ?? 0) - (b.taskNumber ?? 0));

    for (const task of ordered) {
      const lifecycleStatus = store?.getLifecycle(task.taskId)?.status;
      const status = lifecycleStatus ?? task.status;
      if (status !== 'in_review') continue;

      const reports = await listReportsForTask(cwd, task.taskId);
      const report = reports[reports.length - 1] ?? null;
      if (report?.agent_id === agentId) continue;

      const reviews = await listReviewsForTask(cwd, task.taskId).catch(() => []);
      if (reviews.some((review) => review.reviewer_agent_id === agentId)) continue;

      return {
        task_id: task.taskId,
        task_number: task.taskNumber,
        status,
        report_id: report?.report_id ?? null,
        reported_by: report?.agent_id ?? null,
        command: `narada task review ${task.taskNumber} --agent ${agentId} --verdict accepted`,
        command_args: ['task', 'review', String(task.taskNumber), '--agent', agentId, '--verdict', 'accepted'],
      };
    }
    return null;
  } finally {
    if (store) store.db.close();
  }
}

async function findCurrentTaskWork(cwd: string, agentId: string): Promise<Record<string, unknown> | null> {
  const roster = await loadRoster(cwd);
  const agent = roster.agents.find((entry) => entry.agent_id === agentId);
  const taskNumber = agent?.task ?? null;
  if (taskNumber === null) return null;
  const taskFile = await findTaskFile(cwd, String(taskNumber));
  if (!taskFile) {
    return {
      task_number: taskNumber,
      task_id: null,
      title: null,
      status: 'unknown',
      current: true,
    };
  }
  const { frontMatter, body } = await readTaskFile(taskFile.path);
  const title = /^#\s+(.+)$/m.exec(body)?.[1] ?? null;
  const spec = parseTaskSpecFromMarkdown({
    taskId: taskFile.taskId,
    taskNumber,
    frontMatter,
    body,
  });
  const handoffActionability = classifyTaskHandoffActionability({
    taskNumber,
    status: frontMatter.status as string | undefined,
    requiredWork: spec.required_work,
  });
  return {
    task_id: taskFile.taskId,
    task_number: taskNumber,
    title,
    status: frontMatter.status ?? 'claimed',
    handoff_actionability: handoffActionability,
    file_path: taskFile.path,
    current: true,
  };
}

export async function workNextCommand(options: WorkNextOptions): Promise<CommandEnvelope> {
  if (!options.agent) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--agent is required', primary: null },
    };
  }
  if (options.peek && (options.startTask || options.execTask)) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--peek cannot be combined with --start-task or --exec-task', primary: null },
    };
  }

  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const format = options.format ?? 'auto';
  const checked: WorkNextCheckedZone[] = [];
  const doctrineGuard = await buildDoctrineGuard(cwd);
  const roster = await loadRoster(cwd);
  const agentResolution = resolveAgentAddress(roster, options.agent);
  if (!agentResolution.resolved_agent) {
    const taskAuthorityRepair = await operatorSurfaceTaskAuthorityRepair(cwd, options.agent);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        reason: agentResolution.status === 'multi_match' ? 'agent_address_ambiguous' : 'agent_not_in_roster',
        agent_id: options.agent,
        requested_agent: options.agent,
        resolved_agent: null,
        agent_address_resolution: agentAddressResolutionPublic(agentResolution),
        error: 'error' in agentResolution ? agentResolution.error : `Agent ${options.agent} not found in roster`,
        repair_command: taskAuthorityRepair?.repair_command ?? ('repair_command' in agentResolution ? agentResolution.repair_command : `narada task roster add ${options.agent}`),
        operator_surface_task_authority: taskAuthorityRepair,
        primary: null,
      },
    };
  }
  const requestedAgent = options.agent;
  const resolvedAgent = agentResolution.resolved_agent;
  const agentAddressResolution = agentAddressResolutionPublic(agentResolution);
  const resolvedRosterEntry = roster.agents.find((entry) => entry.agent_id === resolvedAgent);
  const roleId = resolvedRosterEntry?.role ?? null;
  const lawAdmission = await checkLawAdmission(cwd, resolvedAgent, roleId ?? undefined);
  const taskConstructionQualification = evaluateSiteQualification({
    cwd,
    principalId: resolvedAgent,
    roleId,
    workClass: 'task_construction',
    lawAdmission,
  });
  if (qualificationBlocksGovernedWork(taskConstructionQualification)) {
    checked.push({ zone: 'task_work', status: 'blocked', reason: taskConstructionQualification.state });
    const result = {
      status: 'blocked',
      reason: 'qualification_required_for_task_construction',
      action_kind: 'qualification_block',
      agent_id: resolvedAgent,
      requested_agent: requestedAgent,
      resolved_agent: resolvedAgent,
      agent_address_resolution: agentAddressResolution,
      primary: null,
      checked,
      qualification: taskConstructionQualification,
      law_admission: lawAdmission,
      doctrine_guard: doctrineGuard,
      safe_actions: taskConstructionQualification.allowed_safe_actions,
      next_step: taskConstructionQualification.commands.effectiveness_check
        ?? taskConstructionQualification.commands.absorption
        ?? taskConstructionQualification.commands.receipt
        ?? taskConstructionQualification.commands.repair,
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, formatHuman(result), format),
    };
  }

  const currentTask = await findCurrentTaskWork(cwd, resolvedAgent);
  if (currentTask) {
    checked.push({ zone: 'task_work', status: 'selected', selected_ref: taskSelectedRef(currentTask) });
    const handoffActionability = asRecord(currentTask.handoff_actionability);
    if (handoffActionability.status === 'underspecified') {
      const result = {
        status: 'blocked',
        reason: 'task_handoff_underspecified',
        action_kind: 'task_work',
        agent_id: resolvedAgent,
        requested_agent: requestedAgent,
        resolved_agent: resolvedAgent,
        agent_address_resolution: agentAddressResolution,
        primary: currentTask,
        checked,
        doctrine_guard: doctrineGuard,
        repair_command: handoffActionability.repair_command,
        next_step: handoffActionability.repair_command,
      };
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: formattedResult(result, formatHuman(result), format),
      };
    }
    const result = {
      status: 'success',
      action_kind: 'task_work',
      agent_id: resolvedAgent,
      requested_agent: requestedAgent,
      resolved_agent: resolvedAgent,
      agent_address_resolution: agentAddressResolution,
      primary: currentTask,
      checked,
      task_result: {
        status: 'ok',
        agent: resolvedAgent,
        agent_id: resolvedAgent,
        requested_agent: requestedAgent,
        resolved_agent: resolvedAgent,
        agent_address_resolution: agentAddressResolution,
        action: options.peek ? 'peek_current' : 'continue_current',
        primary: currentTask,
        task: currentTask,
      },
      dispatch_result: null,
      doctrine_guard: doctrineGuard,
      next_step: options.peek
        ? 'Inspect only; this agent already has current task work.'
        : 'Continue the current claimed task before requesting new work.',
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, formatHuman(result), format),
    };
  }

  const taskResult = options.peek ? await taskPeekNextCommand({
    agent: resolvedAgent,
    cwd,
    format: 'json',
  }) : await taskWorkNextCommand({
    agent: resolvedAgent,
    cwd,
    format: 'json',
  });

  if (isAgentNotFound(taskResult.result)) {
    return taskResult;
  }

  if (taskResult.exitCode !== ExitCode.SUCCESS) {
    return taskResult;
  }

  if (taskResult.exitCode === ExitCode.SUCCESS && !isEmptyTaskResult(taskResult.result)) {
    const taskRecord = asRecord(taskResult.result);
    const primary = asRecord(taskRecord.primary ?? taskRecord.packet ?? null);
    checked.push({ zone: 'task_work', status: 'selected', selected_ref: taskSelectedRef(primary) });
    let dispatchResult: unknown = null;
    if (options.startTask) {
      const store = openTaskLifecycleStore(cwd);
      try {
        const taskNumber = primary.task_number;
        if (typeof taskNumber !== 'number') {
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: {
              status: 'error',
              error: 'Cannot start task work without a numeric task_number',
              primary,
            },
          };
        }
        const pickup = await taskDispatchCommand({
          action: 'pickup',
          taskNumber: String(taskNumber),
      agent: resolvedAgent,
          cwd,
          format: 'json',
          store,
        });
        if (pickup.exitCode !== ExitCode.SUCCESS) return pickup;
        const start = await taskDispatchCommand({
          action: 'start',
          agent: resolvedAgent,
          cwd,
          format: 'json',
          exec: options.execTask,
          store,
        });
        if (start.exitCode !== ExitCode.SUCCESS) return start;
        dispatchResult = {
          pickup: pickup.result,
          start: start.result,
        };
      } finally {
        store.db.close();
      }
    }
    const result = {
      status: 'success',
      action_kind: 'task_work',
      agent_id: resolvedAgent,
      requested_agent: requestedAgent,
      resolved_agent: resolvedAgent,
      agent_address_resolution: agentAddressResolution,
      primary,
      checked,
      task_result: taskResult.result,
      dispatch_result: dispatchResult,
      doctrine_guard: doctrineGuard,
      next_step: options.peek
        ? 'Inspect only; rerun without --peek to claim or execute the selected work.'
        : 'Execute the returned task packet through the governed task lifecycle.',
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, formatHuman(result), format),
    };
  }
  checked.push({ zone: 'task_work', status: 'empty', reason: emptyReason(taskResult.result, 'no_admissible_task') });
  const blockedOrHiddenWork = summarizeBlockedOrHiddenWork(cwd, resolvedAgent);
  const architectDutyLoop = await summarizeArchitectDutyLoop(cwd);

  const reviewWork = await findReviewWork(cwd, resolvedAgent, resolvedRosterEntry?.role);
  if (reviewWork) {
    checked.push({ zone: 'review_work', status: 'selected', selected_ref: taskSelectedRef(reviewWork) });
    const result = {
      status: 'success',
      action_kind: 'review_work',
      agent_id: resolvedAgent,
      requested_agent: requestedAgent,
      resolved_agent: resolvedAgent,
      agent_address_resolution: agentAddressResolution,
      primary: reviewWork,
      checked,
      blocked_or_hidden_work: blockedOrHiddenWork,
      architect_duty_loop: architectDutyLoop,
      doctrine_guard: doctrineGuard,
      next_step: 'Review the task report through the governed task review command.',
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, formatHuman(result), format),
    };
  }
  checked.push({ zone: 'review_work', status: 'empty', reason: 'no_reviewable_task' });

  const inboxResult = await inboxWorkNextCommand({
    cwd,
    format: 'json',
    claim: !options.peek,
    by: options.peek ? undefined : resolvedAgent,
  });

  if (inboxResult.exitCode !== ExitCode.SUCCESS) {
    return inboxResult;
  }

  const inboxRecord = asRecord(inboxResult.result);
  const primary = inboxRecord.primary ?? null;
  if (primary) {
    checked.push({ zone: 'inbox_work', status: 'selected', selected_ref: inboxSelectedRef(primary) });
    const result = {
      status: 'success',
      action_kind: 'inbox_work',
      agent_id: resolvedAgent,
      requested_agent: requestedAgent,
      resolved_agent: resolvedAgent,
      agent_address_resolution: agentAddressResolution,
      primary,
      checked,
      inbox_result: inboxResult.result,
      doctrine_guard: doctrineGuard,
      next_step: options.peek
        ? 'Inspect only; rerun inbox claim or work-next without --peek to take the work.'
        : 'Handle the inbox envelope through one of its admissible actions.',
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, formatHuman(result), format),
    };
  }
  checked.push({ zone: 'inbox_work', status: 'empty', reason: emptyReason(inboxResult.result, 'no_matching_inbox_work') });

  const result = {
    status: 'empty',
    action_kind: 'idle',
    agent_id: resolvedAgent,
    requested_agent: requestedAgent,
    resolved_agent: resolvedAgent,
    agent_address_resolution: agentAddressResolution,
    primary: null,
    reason: 'no_task_or_inbox_work',
    checked,
    blocked_or_hidden_work: blockedOrHiddenWork,
    architect_duty_loop: architectDutyLoop,
    doctrine_guard: doctrineGuard,
    next_step: (asRecord(blockedOrHiddenWork).status === 'open_work_suppressed_or_hidden')
      ? 'Open task work exists but is suppressed for this agent; inspect blocked_or_hidden_work for the blocker and repair command.'
      : (asRecord(architectDutyLoop).status === 'review_or_closure_pending')
        ? 'Builder no-work is not system idle; Architect/reviewer must clear pending review or closure work.'
      : 'No task or inbox work is currently available for this agent.',
  };
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(result, formatHuman(result), format),
  };
}
