import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  findTaskFile,
  getActiveAssignment,
  inspectTaskEvidence,
  listReportsForTask,
  loadAssignment,
  loadRoster,
  readTaskFile,
  resolveExecutableTaskNumberOwnership,
  scanTasksByRange,
  updateAgentRosterEntry,
  writeTaskFile,
} from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  openTaskLifecycleStore,
  type TaskClosureMode,
  type ReconciliationFindingRow,
  type ReconciliationRepairRow,
} from '../lib/task-lifecycle-store.js';
import { parseTaskSpecFromMarkdown } from '../lib/task-spec.js';

export interface TaskReconcileInspectOptions {
  cwd?: string;
  format?: 'json' | 'human' | 'auto';
  range?: string;
}

export interface TaskReconcileRecordOptions extends TaskReconcileInspectOptions {
  by?: string;
}

export interface TaskReconcileRepairOptions {
  finding?: string;
  by?: string;
  cwd?: string;
  format?: 'json' | 'human' | 'auto';
}

export interface TaskReconcileClaimOptions {
  taskNumber?: string;
  agent?: string;
  cwd?: string;
  format?: 'json' | 'human' | 'auto';
}

function nowIso(): string {
  return new Date().toISOString();
}

function findingId(kind: string, taskNumber: number | null, identity: unknown = {}): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({ kind, taskNumber, identity }))
    .digest('hex')
    .slice(0, 12);
  return `rf_${kind}_${taskNumber ?? 'repo'}_${digest}`;
}

function repairId(findingIdValue: string): string {
  return `rr_${findingIdValue}_${Date.now()}`;
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

function compactDirtyState(cwd: string): Record<string, unknown> {
  const allEntries = gitLines(cwd, ['status', '--porcelain']);
  const entries = allEntries.slice(0, 12);
  const count = allEntries.length;
  return {
    dirty: count > 0,
    count,
    entries,
    truncated: count > entries.length,
  };
}

function latestCommits(cwd: string): Array<{ commit: string; subject: string }> {
  return gitLines(cwd, ['log', '--oneline', '-3']).map((line) => {
    const [commit = '', ...rest] = line.split(/\s+/);
    return { commit, subject: rest.join(' ') };
  });
}

async function resolveClaimTaskNumber(cwd: string, options: TaskReconcileClaimOptions): Promise<number | null> {
  if (options.taskNumber) {
    const parsed = Number(options.taskNumber);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (!options.agent) return null;
  const roster = await loadRoster(cwd);
  const agent = roster.agents.find((entry) => entry.agent_id === options.agent || entry.role === options.agent);
  return agent?.task ?? null;
}

function inferClosureMode(governedBy: string | null | undefined): TaskClosureMode {
  if (governedBy?.startsWith('task_review:')) return 'peer_reviewed';
  if (governedBy?.startsWith('task_finish:')) return 'agent_finish';
  return 'operator_direct';
}

function parseRange(range: string | undefined): { start: number; end: number } {
  if (!range) return { start: 0, end: 999999 };
  const match = range.match(/^(\d+)-(\d+)$/);
  if (!match) {
    throw new Error('--range must use start-end format');
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    throw new Error('--range must use a valid ascending numeric range');
  }
  return { start, end };
}

async function detectReconciliationFindings(
  cwd: string,
  range: { start: number; end: number },
): Promise<ReconciliationFindingRow[]> {
  const findings: ReconciliationFindingRow[] = [];
  const store = openTaskLifecycleStore(cwd);
  try {
    const tasks = await scanTasksByRange(cwd, range.start, range.end);
    for (const task of tasks) {
      if (task.taskNumber === null) continue;
      const lifecycle = store.getLifecycleByNumber(task.taskNumber);
      if (lifecycle && lifecycle.status !== task.status) {
        findings.push({
          finding_id: findingId('lifecycle_frontmatter', task.taskNumber),
          task_id: task.taskId,
          task_number: task.taskNumber,
          surfaces_json: JSON.stringify(['task_lifecycle.status', 'task_frontmatter.status']),
          expected_authority: 'task_lifecycle',
          observed_mismatch_json: JSON.stringify({ sqlite_status: lifecycle.status, frontmatter_status: task.status ?? null }),
          severity: 'warning',
          proposed_repair_json: JSON.stringify({ action: 'project_sqlite_status_to_frontmatter' }),
          status: 'open',
          detected_at: nowIso(),
        });
      }
      if (lifecycle && !store.getTaskSpec(task.taskId)) {
        findings.push({
          finding_id: findingId('missing_task_spec', task.taskNumber),
          task_id: task.taskId,
          task_number: task.taskNumber,
          surfaces_json: JSON.stringify(['task_specs', 'task_markdown_projection']),
          expected_authority: 'task_specs',
          observed_mismatch_json: JSON.stringify({ task_spec_row: null, markdown_projection_exists: true }),
          severity: 'warning',
          proposed_repair_json: JSON.stringify({ action: 'backfill_task_spec_from_projection' }),
          status: 'open',
          detected_at: nowIso(),
        });
      }

      const evidence = await inspectTaskEvidence(cwd, String(task.taskNumber), store);
      if ((task.status === 'closed' || task.status === 'confirmed') && evidence.verdict !== 'complete') {
        findings.push({
          finding_id: findingId('terminal_evidence', task.taskNumber),
          task_id: task.taskId,
          task_number: task.taskNumber,
          surfaces_json: JSON.stringify(['task_lifecycle.status', 'task_evidence']),
          expected_authority: 'evidence_admission',
          observed_mismatch_json: JSON.stringify({ status: task.status, evidence_verdict: evidence.verdict }),
          severity: 'error',
          proposed_repair_json: JSON.stringify({ action: 'reopen_or_repair_evidence' }),
          status: 'open',
          detected_at: nowIso(),
        });
      }
      if (lifecycle && (lifecycle.status === 'closed' || lifecycle.status === 'confirmed') && !lifecycle.closure_mode) {
        findings.push({
          finding_id: findingId('missing_closure_mode', task.taskNumber),
          task_id: task.taskId,
          task_number: task.taskNumber,
          surfaces_json: JSON.stringify(['task_lifecycle.closure_mode']),
          expected_authority: 'task_lifecycle',
          observed_mismatch_json: JSON.stringify({ status: lifecycle.status, governed_by: lifecycle.governed_by, closure_mode: null }),
          severity: 'warning',
          proposed_repair_json: JSON.stringify({ action: 'backfill_closure_mode', inferred_mode: inferClosureMode(lifecycle.governed_by) }),
          status: 'open',
          detected_at: nowIso(),
        });
      }
    }

    const roster = await loadRoster(cwd).catch(() => null);
    if (roster) {
      for (const agent of roster.agents) {
        if (agent.status !== 'working' || agent.task === null || agent.task === undefined) continue;
        if (agent.task < range.start || agent.task > range.end) continue;
        const task = tasks.find((t) => t.taskNumber === agent.task);
        const lifecycle = store.getLifecycleByNumber(agent.task);
        const assignment = task ? await loadAssignment(cwd, task.taskId) : null;
        const active = assignment ? getActiveAssignment(assignment) : null;
        if (!task || !lifecycle || lifecycle.status !== 'claimed' || active?.agent_id !== agent.agent_id) {
          findings.push({
            finding_id: findingId('roster_assignment_lifecycle', agent.task),
            task_id: task?.taskId ?? lifecycle?.task_id ?? null,
            task_number: agent.task,
            surfaces_json: JSON.stringify(['agent_roster', 'task_assignment_record', 'task_lifecycle']),
            expected_authority: 'task_lifecycle + assignment_intent',
            observed_mismatch_json: JSON.stringify({
              roster_agent: agent.agent_id,
              roster_task: agent.task,
              lifecycle_status: lifecycle?.status ?? null,
              active_assignment_agent: active?.agent_id ?? null,
            }),
            severity: 'warning',
            proposed_repair_json: JSON.stringify({ action: 'clear_or_reassign_roster' }),
            status: 'open',
            detected_at: nowIso(),
          });
        }
      }
    }

    const ownership = await resolveExecutableTaskNumberOwnership(cwd, store);
    for (const taskNumber of ownership.conflictedNumbers) {
      if (taskNumber < range.start || taskNumber > range.end) continue;
      findings.push({
        finding_id: findingId('duplicate_task_number', taskNumber),
        task_id: null,
        task_number: taskNumber,
        surfaces_json: JSON.stringify(['task_files', 'task_number_ownership']),
        expected_authority: 'task_number_registry',
        observed_mismatch_json: JSON.stringify({ conflicted_task_number: taskNumber }),
        severity: 'error',
        proposed_repair_json: JSON.stringify({ action: 'choose_single_executable_owner' }),
        status: 'open',
        detected_at: nowIso(),
      });
    }
  } finally {
    store.db.close();
  }
  return findings;
}

export async function taskReconcileInspectCommand(
  options: TaskReconcileInspectOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  let range: { start: number; end: number };
  try {
    range = parseRange(options.range);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: msg } };
  }
  const findings = await detectReconciliationFindings(cwd, range);

  return {
    exitCode: ExitCode.SUCCESS,
    result: { status: 'success', count: findings.length, range, persisted: false, findings },
  };
}

export async function taskReconcileClaimCommand(
  options: TaskReconcileClaimOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = await resolveClaimTaskNumber(cwd, options);
  if (taskNumber === null) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        reason: 'task_or_agent_required',
        error: 'Provide --task <number> or --agent <id> whose roster entry has a current task.',
      },
    };
  }

  const store = openTaskLifecycleStore(cwd);
  try {
    const taskFile = await findTaskFile(cwd, String(taskNumber));
    const lifecycle = store.getLifecycleByNumber(taskNumber);
    const evidence = await inspectTaskEvidence(cwd, String(taskNumber), store);
    const reports = evidence.task_id ? await listReportsForTask(cwd, evidence.task_id) : [];
    const verificationRuns = evidence.task_id ? store.listVerificationRunsForTask(evidence.task_id) : [];
    const dirty = compactDirtyState(cwd);
    const blockers: string[] = [];
    if (lifecycle?.status !== 'in_review' && lifecycle?.status !== 'closed' && lifecycle?.status !== 'confirmed') {
      blockers.push(`lifecycle_status:${lifecycle?.status ?? evidence.status ?? 'unknown'}`);
    }
    if (!evidence.all_criteria_checked) blockers.push(`unchecked_criteria:${evidence.unchecked_count}`);
    if (!evidence.has_report) blockers.push('missing_report');
    if (!evidence.has_verification && verificationRuns.length === 0) blockers.push('missing_verification');
    if (dirty.dirty) blockers.push(`dirty_worktree:${dirty.count}`);

    const ready = blockers.length === 0 && ['needs_review', 'needs_closure', 'complete'].includes(evidence.verdict);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mutation_performed: false,
        claim_authority: 'observation_only',
        task_number: taskNumber,
        task_id: evidence.task_id,
        task_file: taskFile?.path ?? null,
        lifecycle: {
          status: lifecycle?.status ?? evidence.status ?? null,
          governed_by: lifecycle?.governed_by ?? null,
          updated_at: lifecycle?.updated_at ?? null,
        },
        evidence: {
          verdict: evidence.verdict,
          all_criteria_checked: evidence.all_criteria_checked,
          unchecked_count: evidence.unchecked_count,
          has_execution_notes: evidence.has_execution_notes,
          has_report: evidence.has_report,
          has_review: evidence.has_review,
          has_verification: evidence.has_verification,
          has_governed_provenance: evidence.has_governed_provenance,
          warnings: evidence.warnings,
          violations: evidence.violations,
        },
        reports: {
          count: reports.length,
          latest: reports[reports.length - 1]?.report_id ?? null,
          latest_by: reports[reports.length - 1]?.agent_id ?? null,
        },
        verification_runs: {
          count: verificationRuns.length,
          latest: verificationRuns[verificationRuns.length - 1]?.run_id ?? null,
          latest_status: verificationRuns[verificationRuns.length - 1]?.status ?? null,
        },
        dirty_state: dirty,
        latest_commits: latestCommits(cwd),
        blockers,
        recommended_action: ready ? 'review_ready' : 'return_to_builder',
        recommended_command: ready
          ? `narada task review ${taskNumber} --agent architect --verdict accepted`
          : `narada task work-next --agent ${options.agent ?? '<builder-agent>'}`,
        guidance: 'Treat chat/operator-surface completion claims as observations. Reconcile durable lifecycle, evidence, verification, and git state before review.',
      },
    };
  } finally {
    store.db.close();
  }
}

export async function taskReconcileRecordCommand(
  options: TaskReconcileRecordOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  let range: { start: number; end: number };
  try {
    range = parseRange(options.range);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: msg } };
  }
  const findings = await detectReconciliationFindings(cwd, range);
  const store = openTaskLifecycleStore(cwd);
  try {
    for (const finding of findings) {
      store.upsertReconciliationFinding(finding);
    }
  } finally {
    store.db.close();
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      count: findings.length,
      range,
      persisted: true,
      recorded_by: options.by ?? 'operator',
      finding_ids: findings.map((finding) => finding.finding_id),
      findings,
    },
  };
}

export async function taskReconcileRepairCommand(
  options: TaskReconcileRepairOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const findingIdValue = options.finding;
  const repairedBy = options.by ?? 'operator';
  if (!findingIdValue) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--finding is required' } };
  }

  const store = openTaskLifecycleStore(cwd);
  try {
    const finding = store.getReconciliationFinding(findingIdValue);
    if (!finding) {
      return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: `Finding not found: ${findingIdValue}` } };
    }
    const proposed = JSON.parse(finding.proposed_repair_json) as { action?: string };

    if (proposed.action === 'choose_single_executable_owner') {
      const repair: ReconciliationRepairRow = {
        repair_id: repairId(finding.finding_id),
        finding_id: finding.finding_id,
        applied: 0,
        changed_surfaces_json: JSON.stringify([]),
        before_json: finding.observed_mismatch_json,
        after_json: finding.observed_mismatch_json,
        verification_json: JSON.stringify({ non_auto_repairable: true, reason: 'duplicate task ownership requires operator-selected canonical owner' }),
        repaired_at: nowIso(),
        repaired_by: repairedBy,
      };
      store.upsertReconciliationRepair(repair);
      store.upsertReconciliationFinding({ ...finding, status: 'ignored' });
      return { exitCode: ExitCode.SUCCESS, result: { status: 'deferred', repair, reason: 'duplicate ownership is explicitly non-auto-repairable' } };
    }

    if (finding.task_number === null || finding.task_id === null) {
      return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: 'Only task-scoped findings are repairable in v0' } };
    }

    if (proposed.action === 'clear_or_reassign_roster') {
      const observed = JSON.parse(finding.observed_mismatch_json) as { roster_agent?: string | null; roster_task?: number | null };
      if (!observed.roster_agent) {
        return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: 'Roster repair lacks roster_agent evidence' } };
      }
      const before = observed;
      const roster = await updateAgentRosterEntry(cwd, observed.roster_agent, {
        status: 'idle',
        task: null,
      });
      const after = roster.agents.find((agent) => agent.agent_id === observed.roster_agent) ?? null;
      const repair: ReconciliationRepairRow = {
        repair_id: repairId(finding.finding_id),
        finding_id: finding.finding_id,
        applied: 1,
        changed_surfaces_json: JSON.stringify(['agent_roster']),
        before_json: JSON.stringify(before),
        after_json: JSON.stringify(after),
        verification_json: JSON.stringify({ roster_agent: observed.roster_agent, roster_task: after?.task ?? null, roster_status: after?.status ?? null }),
        repaired_at: nowIso(),
        repaired_by: repairedBy,
      };
      store.upsertReconciliationRepair(repair);
      store.upsertReconciliationFinding({ ...finding, status: 'repaired' });
      return { exitCode: ExitCode.SUCCESS, result: { status: 'success', repair } };
    }

    if (proposed.action === 'reopen_or_repair_evidence') {
      const lifecycle = store.getLifecycle(finding.task_id);
      const taskFile = await findTaskFile(cwd, String(finding.task_number));
      if (!lifecycle || !taskFile) {
        return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: 'Cannot repair missing lifecycle or task file' } };
      }
      const { frontMatter, body } = await readTaskFile(taskFile.path);
      const before = { lifecycle_status: lifecycle.status, frontmatter_status: frontMatter.status ?? null };
      store.updateStatus(finding.task_id, 'needs_continuation', repairedBy, {
        governed_by: `task_reconcile:${repairedBy}`,
      });
      frontMatter.status = 'needs_continuation';
      frontMatter.governed_by = `task_reconcile:${repairedBy}`;
      await writeTaskFile(taskFile.path, frontMatter, body);
      const after = { lifecycle_status: 'needs_continuation', frontmatter_status: 'needs_continuation' };
      const repair: ReconciliationRepairRow = {
        repair_id: repairId(finding.finding_id),
        finding_id: finding.finding_id,
        applied: 1,
        changed_surfaces_json: JSON.stringify(['task_lifecycle.status', 'task_frontmatter.status']),
        before_json: JSON.stringify(before),
        after_json: JSON.stringify(after),
        verification_json: JSON.stringify({ continuation_required: true }),
        repaired_at: nowIso(),
        repaired_by: repairedBy,
      };
      store.upsertReconciliationRepair(repair);
      store.upsertReconciliationFinding({ ...finding, status: 'repaired' });
      return { exitCode: ExitCode.SUCCESS, result: { status: 'success', repair } };
    }

    if (proposed.action === 'backfill_closure_mode') {
      const lifecycle = store.getLifecycle(finding.task_id);
      if (!lifecycle) {
        return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: 'Cannot repair missing lifecycle' } };
      }
      const before = { closure_mode: lifecycle.closure_mode ?? null, governed_by: lifecycle.governed_by };
      const inferred = (proposed as { inferred_mode?: TaskClosureMode }).inferred_mode ?? inferClosureMode(lifecycle.governed_by);
      store.upsertLifecycle({
        ...lifecycle,
        closure_mode: inferred,
        updated_at: nowIso(),
      });
      const after = { closure_mode: store.getLifecycle(finding.task_id)?.closure_mode ?? null };
      const repair: ReconciliationRepairRow = {
        repair_id: repairId(finding.finding_id),
        finding_id: finding.finding_id,
        applied: 1,
        changed_surfaces_json: JSON.stringify(['task_lifecycle.closure_mode']),
        before_json: JSON.stringify(before),
        after_json: JSON.stringify(after),
        verification_json: JSON.stringify({ closure_mode_backfilled: after.closure_mode === inferred }),
        repaired_at: nowIso(),
        repaired_by: repairedBy,
      };
      store.upsertReconciliationRepair(repair);
      store.upsertReconciliationFinding({ ...finding, status: 'repaired' });
      return { exitCode: ExitCode.SUCCESS, result: { status: 'success', repair } };
    }

    if (proposed.action === 'backfill_task_spec_from_projection') {
      const taskFile = await findTaskFile(cwd, String(finding.task_number));
      if (!taskFile) {
        return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: 'Cannot repair missing task file' } };
      }
      const { frontMatter, body } = await readTaskFile(taskFile.path);
      const before = { task_spec_row: store.getTaskSpec(taskFile.taskId) ?? null };
      const spec = parseTaskSpecFromMarkdown({
        taskId: taskFile.taskId,
        taskNumber: finding.task_number,
        frontMatter,
        body,
      });
      store.upsertTaskSpec({
        task_id: spec.task_id,
        task_number: spec.task_number,
        title: spec.title,
        chapter_markdown: spec.chapter,
        goal_markdown: spec.goal,
        context_markdown: spec.context,
        required_work_markdown: spec.required_work,
        non_goals_markdown: spec.non_goals,
        acceptance_criteria_json: JSON.stringify(spec.acceptance_criteria),
        dependencies_json: JSON.stringify(spec.dependencies),
        updated_at: nowIso(),
      });
      const after = { task_spec_row: store.getTaskSpec(taskFile.taskId) ?? null };
      const repair: ReconciliationRepairRow = {
        repair_id: repairId(finding.finding_id),
        finding_id: finding.finding_id,
        applied: 1,
        changed_surfaces_json: JSON.stringify(['task_specs']),
        before_json: JSON.stringify(before),
        after_json: JSON.stringify(after),
        verification_json: JSON.stringify({ task_spec_backfilled: after.task_spec_row !== null }),
        repaired_at: nowIso(),
        repaired_by: repairedBy,
      };
      store.upsertReconciliationRepair(repair);
      store.upsertReconciliationFinding({ ...finding, status: 'repaired' });
      return { exitCode: ExitCode.SUCCESS, result: { status: 'success', repair } };
    }

    if (proposed.action !== 'project_sqlite_status_to_frontmatter') {
      return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: `Unsupported repair action: ${proposed.action ?? 'unknown'}` } };
    }
    const lifecycle = store.getLifecycle(finding.task_id);
    const taskFile = await findTaskFile(cwd, String(finding.task_number));
    if (!lifecycle || !taskFile) {
      return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: 'Cannot repair missing lifecycle or task file' } };
    }
    const { frontMatter, body } = await readTaskFile(taskFile.path);
    const before = { frontmatter_status: frontMatter.status ?? null, sqlite_status: lifecycle.status };
    frontMatter.status = lifecycle.status;
    await writeTaskFile(taskFile.path, frontMatter, body);
    const after = { frontmatter_status: lifecycle.status, sqlite_status: lifecycle.status };
    const repair: ReconciliationRepairRow = {
      repair_id: repairId(finding.finding_id),
      finding_id: finding.finding_id,
      applied: 1,
      changed_surfaces_json: JSON.stringify(['task_frontmatter.status']),
      before_json: JSON.stringify(before),
      after_json: JSON.stringify(after),
      verification_json: JSON.stringify({ read_back_status: lifecycle.status }),
      repaired_at: nowIso(),
      repaired_by: repairedBy,
    };
    store.upsertReconciliationRepair(repair);
    store.upsertReconciliationFinding({ ...finding, status: 'repaired' });
    return { exitCode: ExitCode.SUCCESS, result: { status: 'success', repair } };
  } finally {
    store.db.close();
  }
}
