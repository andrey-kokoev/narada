/**
 * Task governance utilities for claim/release operators.
 *
 * These operate on the repo's `.ai/` directory — not on the Narada control plane.
 * They are operators: explicit state transitions on static task-governance artifacts.
 */

import { readFile, writeFile, readdir, rename, open, unlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';

export interface AgentRosterEntry {
  agent_id: string;
  role: string;
  capabilities: string[];
  first_seen_at: string;
  last_active_at: string;
  // Operational fields (Task 385)
  status?: 'idle' | 'working' | 'reviewing' | 'blocked' | 'done';
  task?: number | null;
  last_done?: number | null;
  updated_at?: string;
}

export interface AgentRoster {
  version: number;
  schema?: string;
  updated_at: string;
  agents: AgentRosterEntry[];
}

export const ASSIGNMENT_INTENTS = ['primary', 'review', 'repair', 'takeover'] as const;
export type AssignmentIntent = typeof ASSIGNMENT_INTENTS[number];

export interface TaskAssignment {
  agent_id: string;
  claimed_at: string;
  claim_context: string | null;
  released_at: string | null;
  release_reason: 'completed' | 'abandoned' | 'superseded' | 'transferred' | 'budget_exhausted' | 'continued' | null;
  /** If this assignment is a continuation/takeover, the reason why. */
  continuation_reason?: 'evidence_repair' | 'review_fix' | 'handoff' | 'blocked_agent' | 'operator_override' | null;
  /** The agent_id of the prior active assignment, if this is a continuation. */
  previous_agent_id?: string | null;
  /** What kind of attachment this is (primary, review, repair, takeover). */
  intent?: AssignmentIntent;
}

export interface TaskContinuation {
  agent_id: string;
  started_at: string;
  reason: 'evidence_repair' | 'review_fix' | 'handoff' | 'blocked_agent' | 'operator_override';
  previous_agent_id: string | null;
  /** Whether the continuation is still active or has been completed. */
  completed_at?: string | null;
}

export interface TaskAssignmentRecord {
  task_id: string;
  assignments: TaskAssignment[];
  /** Secondary agents working on the task without superseding the primary assignment. */
  continuations?: TaskContinuation[];
}

export interface TaskContinuationAffinity {
  preferred_agent_id?: string;
  affinity_strength?: number;
  affinity_reason?: string;
}

export interface TaskFrontMatter {
  task_id?: string | number;
  status?: string;
  depends_on?: number[];
  continuation_affinity?: TaskContinuationAffinity;
  /** Governed closure provenance — set exclusively by governed operators (task_close, task_review, chapter_close) */
  governed_by?: string;
  [key: string]: unknown;
}

const ROSTER_PATH = '.ai/agents/roster.json';
const ROSTER_LOCK_PATH = '.ai/agents/roster.lock';
const ASSIGNMENTS_DIR = '.ai/tasks/assignments';
const TASKS_DIR = '.ai/tasks';
const REVIEWS_DIR = '.ai/reviews';
const REPORTS_DIR = '.ai/tasks/reports';
const REGISTRY_PATH = '.ai/tasks/.registry.json';
const REGISTRY_LOCK_PATH = '.ai/tasks/.registry.lock';

export interface TaskRegistry {
  version: number;
  last_allocated: number;
  reserved: number[];
  released: number[];
  /** Legacy reservations array for backward compatibility (Tasks 450/455 era) */
  reservations?: Array<{
    range_start: number;
    range_end: number;
    purpose?: string;
    reserved_by?: string;
    reserved_at?: string;
    expires_at?: string;
    status?: string;
  }>;
}

export interface ContinuationPacket {
  last_completed_step: string;
  remaining_work: string;
  files_touched: string[];
  verification_run: string;
  known_blockers: string;
  resume_recommendation: string;
}

export interface ReviewFinding {
  finding_id?: string;
  severity: 'blocking' | 'major' | 'minor' | 'note';
  description: string;
  location?: string | null;
  target_task_id?: string | number;
  category?: 'typecheck' | 'test' | 'logic' | 'doc' | 'boundary';
  recommended_action?: 'fix' | 'add_test' | 'rewrite' | 'defer' | 'wontfix';
}

export interface ReviewRecord {
  review_id: string;
  reviewer_agent_id: string;
  task_id: string;
  findings: ReviewFinding[];
  verdict: 'accepted' | 'accepted_with_notes' | 'rejected';
  reviewed_at: string;
  report_id?: string | null;
}

// ── Work Result Reports ──

export interface WorkResultReport {
  report_id: string;
  task_number: number | string;
  task_id: string;
  agent_id: string;
  assignment_id: string;
  reported_at: string;
  summary: string;
  changed_files: string[];
  verification: Array<{ command: string; result: string }>;
  known_residuals: string[];
  ready_for_review: boolean;
  report_status: 'submitted' | 'accepted' | 'rejected' | 'superseded';
}

/**
 * Deterministic hash of a string using djb2.
 * Produces a stable 8-char hex hash for report identity.
 */
function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Create a deterministic report ID from stable fields.
 *
 * Identity is derived from task_id + agent_id + assignment_id so that
 * repeated invocations for the same assignment produce the same report_id.
 */
export function createReportId(taskId: string, agentId: string, assignmentId: string): string {
  const hash = stableHash(`${taskId}:${agentId}:${assignmentId}`);
  return `wrr_${hash}_${taskId}_${agentId}`;
}

/**
 * Find an existing submitted report for a given assignment_id.
 */
export async function findReportByAssignmentId(
  cwd: string,
  assignmentId: string,
): Promise<WorkResultReport | null> {
  const dir = join(resolveRepoPath(cwd), REPORTS_DIR);
  try {
    const files = await readdir(dir);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(dir, f), 'utf8');
        const report = JSON.parse(raw) as WorkResultReport;
        if (report.assignment_id === assignmentId && report.report_status === 'submitted') {
          return report;
        }
      } catch {
        // Skip malformed report files
      }
    }
  } catch {
    // Directory may not exist
  }
  return null;
}

export interface ReportAnomaly {
  type: 'duplicate_report_id' | 'multiple_reports_per_assignment' | 'filename_id_mismatch';
  report_id: string;
  assignment_id?: string;
  detail: string;
}

/**
 * Scan all reports and detect integrity anomalies.
 */
export async function detectReportAnomalies(cwd: string): Promise<ReportAnomaly[]> {
  const dir = join(resolveRepoPath(cwd), REPORTS_DIR);
  const anomalies: ReportAnomaly[] = [];
  const byReportId = new Map<string, WorkResultReport[]>();
  const byAssignment = new Map<string, WorkResultReport[]>();

  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = await readFile(join(dir, f), 'utf8');
      const report = JSON.parse(raw) as WorkResultReport;

      // filename / report_id mismatch
      const expectedFilename = `${report.report_id}.json`;
      if (f !== expectedFilename) {
        anomalies.push({
          type: 'filename_id_mismatch',
          report_id: report.report_id,
          detail: `File ${f} contains report_id ${report.report_id}`,
        });
      }

      // group by report_id
      const idList = byReportId.get(report.report_id) ?? [];
      idList.push(report);
      byReportId.set(report.report_id, idList);

      // group by assignment_id
      const assignList = byAssignment.get(report.assignment_id) ?? [];
      assignList.push(report);
      byAssignment.set(report.assignment_id, assignList);
    } catch {
      // Skip malformed
    }
  }

  for (const [reportId, list] of byReportId) {
    if (list.length > 1) {
      anomalies.push({
        type: 'duplicate_report_id',
        report_id: reportId,
        detail: `${list.length} files share report_id ${reportId}`,
      });
    }
  }

  for (const [assignmentId, list] of byAssignment) {
    const submitted = list.filter((r) => r.report_status === 'submitted');
    if (submitted.length > 1) {
      anomalies.push({
        type: 'multiple_reports_per_assignment',
        report_id: submitted[0]!.report_id,
        assignment_id: assignmentId,
        detail: `${submitted.length} submitted reports for assignment ${assignmentId}`,
      });
    }
  }

  return anomalies;
}

export function getReportPath(cwd: string, reportId: string): string {
  return join(resolveRepoPath(cwd), REPORTS_DIR, `${reportId}.json`);
}

export async function saveReport(cwd: string, report: WorkResultReport): Promise<void> {
  const path = getReportPath(cwd, report.report_id);
  await atomicWriteFile(path, JSON.stringify(report, null, 2) + '\n');
}

export async function loadReport(cwd: string, reportId: string): Promise<WorkResultReport | null> {
  const path = getReportPath(cwd, reportId);
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as WorkResultReport;
  } catch {
    return null;
  }
}

export async function listReportsForTask(cwd: string, taskId: string): Promise<WorkResultReport[]> {
  const dir = join(resolveRepoPath(cwd), REPORTS_DIR);
  try {
    const files = await readdir(dir);
    const reports: WorkResultReport[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(dir, f), 'utf8');
        const report = JSON.parse(raw) as WorkResultReport;
        if (report.task_id === taskId) {
          reports.push(report);
        }
      } catch {
        // Skip malformed report files
      }
    }
    reports.sort((a, b) => a.reported_at.localeCompare(b.reported_at));
    return reports;
  } catch {
    return [];
  }
}

export async function listReviewsForTask(cwd: string, taskId: string): Promise<ReviewRecord[]> {
  const dir = join(resolveRepoPath(cwd), REVIEWS_DIR);
  try {
    const files = await readdir(dir);
    const reviews: ReviewRecord[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(dir, f), 'utf8');
        const review = JSON.parse(raw) as ReviewRecord;
        if (review.task_id === taskId) {
          reviews.push(review);
        }
      } catch {
        // Skip malformed review files
      }
    }
    reviews.sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at));
    return reviews;
  } catch {
    return [];
  }
}

export async function listClosureDecisionsForTask(cwd: string, taskNumber: number): Promise<Array<{ file: string; closes_tasks: number[] }>> {
  const dir = join(resolveRepoPath(cwd), '.ai', 'decisions');
  const results: Array<{ file: string; closes_tasks: number[] }> = [];
  try {
    const files = await readdir(dir);
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      try {
        const raw = await readFile(join(dir, f), 'utf8');
        const { frontMatter, body } = parseFrontMatter(raw);
        const closesTasks = frontMatter.closes_tasks as number[] | undefined;
        if (Array.isArray(closesTasks) && closesTasks.includes(taskNumber)) {
          results.push({ file: f, closes_tasks: closesTasks });
          continue;
        }
        // Body fallback: look for explicit task references
        const bodyRefs = extractTaskRefsFromBody(body);
        if (bodyRefs.includes(taskNumber)) {
          results.push({ file: f, closes_tasks: [] });
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Decisions dir may not exist
  }
  return results;
}

// ── Task Completion Evidence ──

export interface TaskCompletionEvidence {
  task_number: number | null;
  task_id: string | null;
  status: string | undefined;
  all_criteria_checked: boolean | null;
  unchecked_count: number;
  has_execution_notes: boolean;
  has_verification: boolean;
  has_report: boolean;
  has_review: boolean;
  has_closure: boolean;
  has_governed_provenance: boolean;
  verdict: 'complete' | 'attempt_complete' | 'needs_review' | 'needs_closure' | 'incomplete' | 'unknown';
  warnings: string[];
  violations: string[];
  active_assignment_intent: AssignmentIntent | null;
}

function countUncheckedCriteria(body: string): { allChecked: boolean | null; unchecked: number } {
  const acMatch = body.match(/##\s*Acceptance Criteria\s*\n/i);
  if (!acMatch) {
    return { allChecked: null, unchecked: 0 };
  }
  const startIdx = acMatch.index! + acMatch[0].length;
  const nextHeading = body.slice(startIdx).match(/\n##\s/);
  const sectionEnd = nextHeading ? startIdx + nextHeading.index! : body.length;
  const section = body.slice(startIdx, sectionEnd);

  const items = section.match(/^\s*-\s+\[[xX ]\]/gm) ?? [];
  if (items.length === 0) {
    return { allChecked: null, unchecked: 0 };
  }
  const unchecked = items.filter((item) => item.includes('[ ]')).length;
  return { allChecked: unchecked === 0, unchecked };
}

const DERIVATIVE_SUFFIXES = ['-EXECUTED.md', '-DONE.md', '-RESULT.md', '-FINAL.md', '-SUPERSEDED.md'];

/**
 * Determine whether a terminal task has governed provenance.
 *
 * A task may enter terminal state (closed/confirmed) only through a governed operator.
 * Valid provenance markers:
 * 1. `governed_by` field set by a governed operator (task_close, task_review, chapter_close)
 * 2. `closed_by` + `closed_at` front matter (pre-task-501 task_close backward compatibility)
 * 3. Review record exists and status is closed (pre-task-501 task_review backward compatibility)
 * 4. Closure decision exists and status is confirmed (pre-task-501 chapter_close backward compatibility)
 *
 * Raw markdown edits that set `status: closed` without any of these markers are invalid.
 */
export function hasGovernedProvenance(
  frontMatter: TaskFrontMatter,
  hasReview: boolean,
  hasClosure: boolean,
): boolean {
  // New explicit governed-by marker
  if (typeof frontMatter.governed_by === 'string' && frontMatter.governed_by.length > 0) {
    return true;
  }

  // If the task was reopened after its last closure, stale provenance markers
  // from the prior closure must not count as valid. Governed re-closure requires
  // a fresh governed_by marker.
  const closedAt = typeof frontMatter.closed_at === 'string' ? frontMatter.closed_at : null;
  const reopenedAt = typeof frontMatter.reopened_at === 'string' ? frontMatter.reopened_at : null;
  if (closedAt && reopenedAt && reopenedAt > closedAt) {
    // Stale: reopened after closure. Require governed_by (checked above).
    return false;
  }

  // Pre-501 backward compatibility: task_close left closed_by + closed_at
  if (
    typeof frontMatter.closed_by === 'string' && frontMatter.closed_by.length > 0 &&
    closedAt !== null
  ) {
    return true;
  }

  // Pre-501 backward compatibility: task_review left a review record
  if (hasReview && frontMatter.status === 'closed') {
    return true;
  }

  // Pre-501 backward compatibility: chapter_close left a closure decision
  if (hasClosure && frontMatter.status === 'confirmed') {
    return true;
  }

  return false;
}

export async function hasDerivativeFiles(cwd: string, taskNumber: number): Promise<boolean> {
  const dir = join(resolveRepoPath(cwd), TASKS_DIR);
  try {
    const files = await readdir(dir);
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const base = f.replace(/\.md$/, '');
      // Check if any derivative suffix is present and the filename references this task number
      for (const suffix of DERIVATIVE_SUFFIXES) {
        const suffixBase = suffix.replace(/\.md$/, '');
        if (base.includes(suffixBase)) {
          // Also verify the task number is referenced in the filename
          const numMatch = base.match(/-(\d+)-/);
          const fileNum = numMatch ? Number(numMatch[1]) : null;
          if (fileNum === taskNumber || base === String(taskNumber) || base.endsWith(`-${taskNumber}`)) {
            return true;
          }
        }
      }
    }
  } catch {
    // Directory may not exist
  }
  return false;
}

export async function inspectTaskEvidence(cwd: string, taskNumber: string): Promise<TaskCompletionEvidence> {
  let taskFile;
  try {
    taskFile = await findTaskFile(cwd, taskNumber);
  } catch {
    // Ignore ambiguity errors; treat as not found
  }

  if (!taskFile) {
    return {
      task_number: Number.isFinite(Number(taskNumber)) ? Number(taskNumber) : null,
      task_id: null,
      status: undefined,
      all_criteria_checked: null,
      unchecked_count: 0,
      has_execution_notes: false,
      has_verification: false,
      has_report: false,
      has_review: false,
      has_closure: false,
      has_governed_provenance: false,
      verdict: 'unknown',
      warnings: [`Task file not found for ${taskNumber}`],
      violations: [],
      active_assignment_intent: null,
    };
  }

  const { frontMatter, body } = await readTaskFile(taskFile.path);
  const status = frontMatter.status as string | undefined;
  const num = Number.isFinite(Number(taskNumber)) ? Number(taskNumber) : null;

  const criteria = countUncheckedCriteria(body);
  const hasExecutionNotes = /##\s*Execution Notes\s*\n/i.test(body);
  const hasVerification = /##\s*Verification\s*\n/i.test(body);

  const reports = await listReportsForTask(cwd, taskFile.taskId);
  const hasReport = reports.length > 0;

  const reviews = await listReviewsForTask(cwd, taskFile.taskId);
  const hasReview = reviews.length > 0;
  const hasAcceptedReview = reviews.some((r) => r.verdict === 'accepted' || r.verdict === 'accepted_with_notes');

  const closures = num !== null ? await listClosureDecisionsForTask(cwd, num) : [];
  const hasClosure = closures.length > 0;
  const hasDerivatives = num !== null ? await hasDerivativeFiles(cwd, num) : false;
  const hasGovernedProvenanceValue = hasGovernedProvenance(frontMatter, hasReview, hasClosure);

  // Determine active assignment intent
  let activeAssignmentIntent: AssignmentIntent | null = null;
  const assignmentRecord = await loadAssignment(cwd, taskFile.taskId);
  if (assignmentRecord) {
    const active = getActiveAssignment(assignmentRecord);
    if (active) {
      activeAssignmentIntent = getAssignmentIntent(active);
    }
  }

  const warnings: string[] = [];
  const violations: string[] = [];

  // Determine verdict
  let verdict: TaskCompletionEvidence['verdict'] = 'incomplete';

  const terminalStatuses: Array<string | undefined> = ['closed', 'confirmed'];

  const hasEvidence = hasReport || hasExecutionNotes;
  const governedProvenance = hasGovernedProvenance(frontMatter, hasReview, hasClosure);

  if (terminalStatuses.includes(status)) {
    if (!hasEvidence) {
      warnings.push('Task is closed/confirmed but lacks execution evidence (report or notes)');
      violations.push('terminal_without_execution_notes');
    }
    if (criteria.allChecked === false) {
      warnings.push(`Task is closed/confirmed but ${criteria.unchecked} acceptance criteria remain unchecked`);
      violations.push('terminal_with_unchecked_criteria');
    }
    if (!hasVerification) {
      warnings.push('Task is closed/confirmed but lacks verification notes');
      violations.push('terminal_without_verification');
    }
    if (hasDerivatives) {
      warnings.push('Task is closed/confirmed but derivative task-status files exist');
      violations.push('terminal_with_derivative_files');
    }
    if (!governedProvenance) {
      warnings.push('Task is terminal but lacks governed closure provenance; raw file mutation detected');
      violations.push('terminal_without_governed_provenance');
    }
    if (!hasReview && !hasClosure && !(hasExecutionNotes && hasVerification)) {
      warnings.push('Task is closed/confirmed without review or closure decision; direct closure requires execution notes and verification');
    }
    verdict = warnings.length === 0 ? 'complete' : 'needs_closure';
  } else if (status === 'in_review') {
    if (!hasEvidence) {
      warnings.push('Task is in_review but lacks execution evidence');
    }
    if (criteria.allChecked === false) {
      warnings.push(`${criteria.unchecked} acceptance criteria remain unchecked`);
    }
    if (!hasReview) {
      warnings.push('Task is in_review but has no review artifact');
      verdict = hasEvidence ? 'needs_review' : 'incomplete';
    } else if (hasAcceptedReview) {
      verdict = hasEvidence && criteria.allChecked !== false ? 'needs_closure' : 'incomplete';
    } else {
      // Review was rejected — task needs more work before it can be completed
      warnings.push('Task review was rejected; task needs additional work');
      verdict = 'incomplete';
    }
  } else if (status === 'opened' || status === 'claimed' || status === 'needs_continuation') {
    if (hasEvidence || hasReport) {
      verdict = 'attempt_complete';
      if (!hasExecutionNotes) {
        warnings.push('Task has report but no execution notes section');
      }
      if (criteria.allChecked === false) {
        warnings.push(`${criteria.unchecked} acceptance criteria remain unchecked`);
      }
    } else {
      if (criteria.allChecked === false) {
        warnings.push(`${criteria.unchecked} acceptance criteria remain unchecked`);
      }
      verdict = 'incomplete';
    }
  } else {
    verdict = 'unknown';
    warnings.push(`Unexpected task status: ${status ?? 'missing'}`);
  }

  return {
    task_number: num,
    task_id: taskFile.taskId,
    status,
    all_criteria_checked: criteria.allChecked,
    unchecked_count: criteria.unchecked,
    has_execution_notes: hasExecutionNotes,
    has_verification: hasVerification,
    has_report: hasReport,
    has_review: hasReview,
    has_closure: hasClosure,
    has_governed_provenance: governedProvenance,
    verdict,
    warnings,
    violations,
    active_assignment_intent: activeAssignmentIntent,
  };
}

function resolveRepoPath(cwd: string): string {
  return resolve(cwd);
}

export async function loadRoster(cwd: string): Promise<AgentRoster> {
  const path = join(resolveRepoPath(cwd), ROSTER_PATH);
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as AgentRoster;
}

export async function saveRoster(cwd: string, roster: AgentRoster): Promise<void> {
  const path = join(resolveRepoPath(cwd), ROSTER_PATH);
  roster.updated_at = new Date().toISOString();
  await atomicWriteFile(path, JSON.stringify(roster, null, 2) + '\n');
}

// ── Roster mutation lock ──

const STALE_LOCK_MS = 30_000; // 30 seconds
const LOCK_MAX_RETRIES = 20;
const LOCK_RETRY_DELAY_MS = 25;

async function acquireRosterLock(cwd: string): Promise<string> {
  const lockPath = join(resolveRepoPath(cwd), ROSTER_LOCK_PATH);

  for (let attempt = 0; attempt < LOCK_MAX_RETRIES; attempt++) {
    try {
      const fh = await open(lockPath, 'wx');
      // Write lock metadata for stale detection
      await fh.writeFile(
        JSON.stringify({
          pid: process.pid,
          created_at: new Date().toISOString(),
        }) + '\n',
      );
      await fh.close();
      return lockPath;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'EEXIST') {
        // Stale lock recovery
        if (attempt === 0 || attempt === Math.floor(LOCK_MAX_RETRIES / 2)) {
          try {
            const stat = await import('node:fs/promises').then((m) => m.stat(lockPath));
            const ageMs = Date.now() - stat.mtimeMs;
            if (ageMs > STALE_LOCK_MS) {
              await unlink(lockPath);
              continue; // Retry immediately after removing stale lock
            }
          } catch {
            // Lock may have been removed by another process; retry immediately
            continue;
          }
        }
        if (attempt < LOCK_MAX_RETRIES - 1) {
          await new Promise((res) => setTimeout(res, LOCK_RETRY_DELAY_MS));
          continue;
        }
      }
      throw new Error(
        `Unable to acquire roster lock after ${LOCK_MAX_RETRIES} attempts: ${code ?? err}`,
      );
    }
  }
  throw new Error(`Unable to acquire roster lock after ${LOCK_MAX_RETRIES} attempts`);
}

async function releaseRosterLock(lockPath: string): Promise<void> {
  try {
    await unlink(lockPath);
  } catch {
    // Ignore errors during cleanup
  }
}

export interface RosterMutationFn {
  (roster: AgentRoster): AgentRoster | Promise<AgentRoster>;
}

/**
 * Execute a roster mutation under an exclusive file lock.
 *
 * Guarantees:
 * - Lock is acquired before reading roster state.
 * - Latest roster is read while holding the lock.
 * - Mutation is applied.
 * - Roster shape is validated.
 * - Write is atomic (temp file + rename).
 * - Lock is released in `finally`.
 * - Stale locks (older than 30s) are recovered automatically.
 */
export async function withRosterMutation(
  cwd: string,
  mutationFn: RosterMutationFn,
): Promise<AgentRoster> {
  const lockPath = await acquireRosterLock(cwd);
  try {
    const roster = await loadRoster(cwd);
    const mutated = await mutationFn(roster);

    // Validate roster shape
    if (!mutated.agents || !Array.isArray(mutated.agents)) {
      throw new Error('Roster mutation produced invalid agents array');
    }
    if (typeof mutated.version !== 'number') {
      throw new Error('Roster mutation produced invalid version');
    }

    await saveRoster(cwd, mutated);
    return mutated;
  } finally {
    await releaseRosterLock(lockPath);
  }
}

export async function updateAgentRosterEntry(
  cwd: string,
  agentId: string,
  update: Partial<Pick<AgentRosterEntry, 'status' | 'task' | 'last_done'>>,
): Promise<AgentRoster> {
  return withRosterMutation(cwd, (roster) => {
    const entry = roster.agents.find((a) => a.agent_id === agentId);
    if (!entry) {
      throw new Error(`Agent ${agentId} not found in roster`);
    }
    const now = new Date().toISOString();
    if (update.status !== undefined) entry.status = update.status;
    if (update.task !== undefined) entry.task = update.task;
    if (update.last_done !== undefined) entry.last_done = update.last_done;
    entry.last_active_at = now;
    entry.updated_at = now;
    return roster;
  });
}

export function formatRoster(roster: AgentRoster, format: 'json' | 'human' = 'human'): string {
  if (format === 'json') {
    return JSON.stringify(roster, null, 2);
  }
  const lines: string[] = [];
  lines.push(`Agent Roster (updated ${roster.updated_at})`);
  lines.push('');
  for (const a of roster.agents) {
    const status = a.status ?? 'idle';
    const task = a.task != null ? String(a.task) : '—';
    const lastDone = a.last_done != null ? String(a.last_done) : '—';
    const updated = a.updated_at ? ` (updated ${a.updated_at})` : '';
    lines.push(`  ${a.agent_id.padEnd(16)} ${status.padEnd(10)} task=${task.padEnd(6)} last_done=${lastDone}${updated}`);
  }
  return lines.join('\n');
}

export async function loadAssignment(cwd: string, taskId: string): Promise<TaskAssignmentRecord | null> {
  const path = join(resolveRepoPath(cwd), ASSIGNMENTS_DIR, `${taskId}.json`);
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as TaskAssignmentRecord;
  } catch {
    return null;
  }
}

export async function loadReview(cwd: string, reviewId: string): Promise<ReviewRecord | null> {
  const path = join(resolveRepoPath(cwd), REVIEWS_DIR, `${reviewId}.json`);
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as ReviewRecord;
  } catch {
    return null;
  }
}

export async function saveReview(cwd: string, record: ReviewRecord): Promise<void> {
  const path = join(resolveRepoPath(cwd), REVIEWS_DIR, `${record.review_id}.json`);
  await atomicWriteFile(path, JSON.stringify(record, null, 2) + '\n');
}

/**
 * Atomically write a file by writing to a temp file in the same directory
 * and renaming over the target.
 */
export async function atomicWriteFile(targetPath: string, data: string): Promise<void> {
  const dir = dirname(targetPath);
  const tmpPath = join(dir, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await writeFile(tmpPath, data);
  await rename(tmpPath, targetPath);
}

export async function saveAssignment(cwd: string, record: TaskAssignmentRecord): Promise<void> {
  const path = join(resolveRepoPath(cwd), ASSIGNMENTS_DIR, `${record.task_id}.json`);
  await atomicWriteFile(path, JSON.stringify(record, null, 2) + '\n');
}

export async function findTaskFile(cwd: string, taskNumber: string): Promise<{ path: string; taskId: string } | null> {
  const dir = join(resolveRepoPath(cwd), TASKS_DIR);
  const files = await readdir(dir);

  // Try exact match first (full task ID like 20260420-260-...)
  const exactMatch = files.find((f) => f === `${taskNumber}.md` || f === taskNumber);
  if (exactMatch) {
    return { path: join(dir, exactMatch), taskId: exactMatch.replace(/\.md$/, '') };
  }

  // Try short number match (e.g., "260" matches "20260420-260-...")
  const candidates = files.filter((f) => {
    if (!f.endsWith('.md')) return false;
    const base = f.replace(/\.md$/, '');
    // Exclude derivative status files from matching
    for (const suffix of DERIVATIVE_SUFFIXES) {
      if (base.includes(suffix.replace(/\.md$/, ''))) return false;
    }
    // Match patterns like 20260420-260-... or 260 anywhere in the filename
    // Also handle zero-padded numbers (e.g., 050 matches 50)
    const numMatch = base.match(/-(\d+)-/);
    const fileNum = numMatch ? Number(numMatch[1]) : null;
    return fileNum === Number(taskNumber) || base.includes(`-${taskNumber}-`) || base === taskNumber || base.endsWith(`-${taskNumber}`);
  });

  const executableCandidates: string[] = [];
  for (const candidate of candidates) {
    try {
      const content = await readFile(join(dir, candidate), 'utf8');
      if (content.match(new RegExp(`^# Task ${taskNumber}\\b`, 'm'))) {
        executableCandidates.push(candidate);
      }
    } catch {
      // Ignore unreadable candidates and fall back to the existing ambiguity logic.
    }
  }

  if (executableCandidates.length === 1) {
    return {
      path: join(dir, executableCandidates[0]!),
      taskId: executableCandidates[0]!.replace(/\.md$/, ''),
    };
  }

  if (executableCandidates.length > 1) {
    throw new Error(`Ambiguous task number ${taskNumber}: matches ${executableCandidates.join(', ')}`);
  }

  if (candidates.length === 1) {
    return { path: join(dir, candidates[0]!), taskId: candidates[0]!.replace(/\.md$/, '') };
  }

  if (candidates.length > 1) {
    throw new Error(`Ambiguous task number ${taskNumber}: matches ${candidates.join(', ')}`);
  }

  return null;
}

function parseScalar(rawValue: string): unknown {
  if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
    try {
      return JSON.parse(rawValue.replace(/'/g, '"'));
    } catch {
      return rawValue;
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(rawValue)) return Number(rawValue);
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  if (rawValue === 'null') return null;
  return rawValue;
}

export function parseFrontMatter(content: string): { frontMatter: TaskFrontMatter; body: string } {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) {
    return { frontMatter: {}, body: content };
  }

  const endIdx = trimmed.indexOf('\n---', 3);
  if (endIdx === -1) {
    return { frontMatter: {}, body: content };
  }

  const yamlBlock = trimmed.slice(3, endIdx).trim();
  const body = trimmed.slice(endIdx + 4).trimStart();
  const frontMatter: TaskFrontMatter = {};

  const lines = yamlBlock.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      i++;
      continue;
    }
    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();

    if (rawValue === '') {
      // Possible nested object or list — peek ahead for indented lines
      const nested: Record<string, unknown> = {};
      const listItems: unknown[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        if (!nextLine.startsWith('  ') && !nextLine.startsWith('\t')) break;
        const nextTrimmed = nextLine.trimStart();

        // YAML list item
        if (nextTrimmed.startsWith('- ')) {
          const itemValue = nextTrimmed.slice(2).trim();
          listItems.push(parseScalar(itemValue));
          j++;
          continue;
        }

        // Nested object key:value
        const nextColon = nextTrimmed.indexOf(':');
        if (nextColon === -1) break;
        const nestedKey = nextTrimmed.slice(0, nextColon).trim();
        const nestedValue = nextTrimmed.slice(nextColon + 1).trim();
        nested[nestedKey] = parseScalar(nestedValue);
        j++;
      }
      if (listItems.length > 0) {
        frontMatter[key] = listItems;
        i = j;
        continue;
      }
      if (Object.keys(nested).length > 0) {
        frontMatter[key] = nested;
        i = j;
        continue;
      }
    }

    frontMatter[key] = parseScalar(rawValue);
    i++;
  }

  return { frontMatter, body };
}

function serializeValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (typeof value === 'object' && value !== null) {
    // Only one level of nesting is supported
    const lines: string[] = [];
    for (const [k, v] of Object.entries(value)) {
      lines.push(`  ${k}: ${serializeValue(v)}`);
    }
    return '\n' + lines.join('\n');
  }
  return String(value);
}

export function serializeFrontMatter(frontMatter: TaskFrontMatter, body: string): string {
  const lines: string[] = ['---'];
  for (const [key, value] of Object.entries(frontMatter)) {
    const serialized = serializeValue(value);
    if (serialized.startsWith('\n')) {
      lines.push(`${key}:${serialized}`);
    } else {
      lines.push(`${key}: ${serialized}`);
    }
  }
  lines.push('---');
  lines.push('');
  lines.push(body.trimStart());
  return lines.join('\n') + '\n';
}

export async function readTaskFile(path: string): Promise<{ frontMatter: TaskFrontMatter; body: string }> {
  const content = await readFile(path, 'utf8');
  return parseFrontMatter(content);
}

export async function writeTaskFile(path: string, frontMatter: TaskFrontMatter, body: string): Promise<void> {
  await atomicWriteFile(path, serializeFrontMatter(frontMatter, body));
}

/**
 * Valid task statuses per the state machine schema.
 */
export const TASK_STATUSES = ['draft', 'opened', 'claimed', 'needs_continuation', 'in_review', 'closed', 'confirmed'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

/**
 * Allowed transitions per the state machine schema.
 */
const ALLOWED_TRANSITIONS: Record<string, TaskStatus[]> = {
  draft: ['opened'],
  opened: ['claimed', 'closed'],
  claimed: ['in_review', 'opened', 'needs_continuation'],
  needs_continuation: ['claimed', 'opened'],
  in_review: ['closed', 'opened'],
  closed: ['confirmed', 'opened', 'in_review'],
  confirmed: ['opened', 'in_review'],
};

export function isValidTransition(from: string | undefined, to: string): boolean {
  const allowed = ALLOWED_TRANSITIONS[from ?? ''];
  if (!allowed) return false;
  return allowed.includes(to as TaskStatus);
}

export function getActiveAssignment(record: TaskAssignmentRecord): TaskAssignment | null {
  return record.assignments.find((a) => a.released_at === null) ?? null;
}

/**
 * Find an active continuation for a specific agent.
 * A continuation is active if it has no completed_at timestamp.
 */
export function getActiveContinuation(
  record: TaskAssignmentRecord,
  agentId: string,
): TaskContinuation | null {
  return record.continuations?.find((c) => c.agent_id === agentId && !c.completed_at) ?? null;
}

/**
 * Map a continuation reason to its canonical assignment intent.
 */
export function continuationReasonToIntent(
  reason: TaskAssignment['continuation_reason'],
): AssignmentIntent {
  switch (reason) {
    case 'evidence_repair':
    case 'review_fix':
      return 'repair';
    case 'handoff':
    case 'blocked_agent':
    case 'operator_override':
      return 'takeover';
    default:
      return 'primary';
  }
}

/**
 * Return the canonical intent for an assignment.
 *
 * Backward compatibility: if `intent` is not explicitly set, infer it from
 * `continuation_reason` or default to `primary`.
 */
export function getAssignmentIntent(assignment: TaskAssignment): AssignmentIntent {
  if (assignment.intent) return assignment.intent;
  if (assignment.continuation_reason) {
    return continuationReasonToIntent(assignment.continuation_reason);
  }
  return 'primary';
}

/**
 * Check that all dependency tasks are in a terminal or near-terminal state.
 * Returns the list of blocking dependency task IDs.
 */
export async function checkDependencies(
  cwd: string,
  dependsOn: number[] | undefined,
): Promise<{ blockedBy: string[] }> {
  if (!dependsOn || dependsOn.length === 0) return { blockedBy: [] };

  const blockedBy: string[] = [];

  for (const depNum of dependsOn) {
    let taskFile: { path: string; taskId: string } | null = null;
    try {
      taskFile = await findTaskFile(cwd, String(depNum));
    } catch {
      // Ambiguous dependency resolution remains blocking to be safe.
    }

    if (!taskFile) {
      blockedBy.push(String(depNum));
      continue;
    }

    const content = await readFile(taskFile.path, 'utf8');
    const { frontMatter } = parseFrontMatter(content);
    const depStatus = frontMatter.status;

    if (depStatus !== 'closed' && depStatus !== 'confirmed') {
      blockedBy.push(taskFile.taskId);
    }
  }

  return { blockedBy };
}

/**
 * Scan task files to extract the maximum task number.
 */
export async function scanMaxTaskNumber(cwd: string): Promise<number> {
  const dir = join(resolveRepoPath(cwd), TASKS_DIR);
  const files = await readdir(dir);
  let max = 0;

  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    const base = f.replace(/\.md$/, '');
    // Extract the number portion from filenames like 20260420-260-agent-roster...
    const match = base.match(/-(\d+)-/);
    if (match) {
      const num = Number(match[1]);
      if (num > max) max = num;
    } else {
      // Try simple numeric filenames
      const simple = Number(base);
      if (!Number.isNaN(simple) && simple > max) max = simple;
    }
  }

  return max;
}

/**
 * Load or create the task number registry.
 *
 * Tolerant of two shapes:
 * - Legacy: { version, last_allocated, reserved: number[], released: number[] }
 * - Reservation-era: { version, last_allocated, reservations: [...] }
 *
 * When reservations exist but reserved/released are missing, derives them
 * from the reservations array so allocateTaskNumber can operate normally.
 */
export async function loadRegistry(cwd: string): Promise<TaskRegistry> {
  const path = join(resolveRepoPath(cwd), REGISTRY_PATH);
  try {
    const raw = await readFile(path, 'utf8');
    const data = JSON.parse(raw) as TaskRegistry;

    // Defensive: ensure arrays exist even on malformed files
    const reserved = Array.isArray(data.reserved) ? data.reserved : [];
    const released = Array.isArray(data.released) ? data.released : [];

    // If we have reservations but no direct reserved/released, derive them.
    // Reservation-era "released" status means the reservation was closed,
    // NOT that the number should be reused. Only active (non-released)
    // reservations map to the allocator's reserved list.
    if (data.reservations && data.reservations.length > 0 && reserved.length === 0 && released.length === 0) {
      const derivedReserved: number[] = [];
      for (const r of data.reservations) {
        if (r.status !== 'released') {
          for (let n = r.range_start; n <= r.range_end; n++) {
            derivedReserved.push(n);
          }
        }
      }
      return {
        version: data.version,
        last_allocated: data.last_allocated,
        reserved: derivedReserved,
        released: [],
        reservations: data.reservations,
      };
    }

    return {
      version: data.version,
      last_allocated: data.last_allocated,
      reserved,
      released,
      reservations: data.reservations,
    };
  } catch {
    const max = await scanMaxTaskNumber(cwd);
    return { version: 1, last_allocated: max, reserved: [], released: [] };
  }
}

export async function saveRegistry(cwd: string, registry: TaskRegistry): Promise<void> {
  const path = join(resolveRepoPath(cwd), REGISTRY_PATH);
  await atomicWriteFile(path, JSON.stringify(registry, null, 2) + '\n');
}

/**
 * Preview the next allocatable number without mutating the registry.
 */
export async function previewNextTaskNumber(cwd: string): Promise<number> {
  const registry = await loadRegistry(cwd);
  const currentMax = await scanMaxTaskNumber(cwd);
  const baseline = Math.max(registry.last_allocated, currentMax);

  if (registry.released.length > 0) {
    return registry.released.sort((a, b) => a - b)[0]!;
  }

  return baseline + 1;
}

/**
 * Acquire a local exclusive lock for registry allocation.
 * Uses `open` with `wx` flag (fail if exists) with bounded retry.
 */
async function acquireRegistryLock(cwd: string, maxRetries = 10, delayMs = 50): Promise<string> {
  const lockPath = join(resolveRepoPath(cwd), REGISTRY_LOCK_PATH);
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const fh = await open(lockPath, 'wx');
      await fh.close();
      return lockPath;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'EEXIST') {
        if (attempt < maxRetries - 1) {
          await new Promise((res) => setTimeout(res, delayMs));
          continue;
        }
      }
      throw new Error(`Unable to acquire registry lock after ${maxRetries} attempts: ${code ?? err}`);
    }
  }
  throw new Error(`Unable to acquire registry lock after ${maxRetries} attempts`);
}

async function releaseRegistryLock(lockPath: string): Promise<void> {
  try {
    await unlink(lockPath);
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Atomically allocate the next task number.
 *
 * Uses a local file lock to prevent race conditions under concurrent agents.
 * The critical section includes: load registry, reconcile with current max,
 * select next number, write registry.
 */
export async function allocateTaskNumber(cwd: string): Promise<number> {
  const lockPath = await acquireRegistryLock(cwd);

  try {
    const registry = await loadRegistry(cwd);

    // Reconcile: ensure last_allocated never falls behind current max
    const currentMax = await scanMaxTaskNumber(cwd);
    if (currentMax > registry.last_allocated) {
      registry.last_allocated = currentMax;
    }

    // Reuse released numbers if any
    if (registry.released.length > 0) {
      const num = registry.released.sort((a, b) => a - b)[0]!;
      registry.released = registry.released.filter((n) => n !== num);
      registry.reserved.push(num);
      await saveRegistry(cwd, registry);
      return num;
    }

    const next = registry.last_allocated + 1;
    registry.last_allocated = next;
    registry.reserved.push(next);
    await saveRegistry(cwd, registry);
    return next;
  } finally {
    await releaseRegistryLock(lockPath);
  }
}

/**
 * Lint task files for structural issues.
 * Pure tool/compiler: no mutations.
 */
export async function lintTaskFiles(cwd: string): Promise<{
  issues: Array<{ type: string; file: string; detail: string }>;
  ok: boolean;
}> {
  const issues: Array<{ type: string; file: string; detail: string }> = [];
  const dir = join(resolveRepoPath(cwd), TASKS_DIR);
  const files = await readdir(dir);
  const mdFiles = files.filter((f) => f.endsWith('.md'));
  const seenNumbers = new Map<number, string>();
  const allTaskIds = new Set<string>();
  const taskByNumber = new Map<number, { filename: string; frontMatter: TaskFrontMatter }>();

  for (const f of mdFiles) {
    const base = f.replace(/\.md$/, '');
    allTaskIds.add(base);

    const content = await readFile(join(dir, f), 'utf8');
    const { frontMatter } = parseFrontMatter(content);

    // Filename-based number extraction (always runs for duplicate detection)
    const filenameMatch = base.match(/-(\d+)-/);
    const filenameNum = filenameMatch ? Number(filenameMatch[1]) : null;

    if (filenameNum !== null) {
      taskByNumber.set(filenameNum, { filename: f, frontMatter });
    }

    // Duplicate number detection based on filename (regardless of front matter)
    if (filenameNum !== null) {
      if (seenNumbers.has(filenameNum)) {
        issues.push({
          type: 'duplicate_number',
          file: f,
          detail: `Duplicate task number ${filenameNum} (also in ${seenNumbers.get(filenameNum)})`,
        });
      } else {
        seenNumbers.set(filenameNum, f);
      }
    }

    // Check task_id matches filename
    if (frontMatter.task_id !== undefined) {
      const expectedFile = `${frontMatter.task_id}.md`;
      // Only flag if task_id is a simple number that doesn't match
      if (typeof frontMatter.task_id === 'number') {
        if (filenameNum !== null && filenameNum !== frontMatter.task_id) {
          issues.push({
            type: 'task_id_mismatch',
            file: f,
            detail: `task_id ${frontMatter.task_id} does not match filename number`,
          });
        }
      }
    }

    // Check depends_on references exist
    const dependsOn = frontMatter.depends_on as number[] | undefined;
    if (dependsOn) {
      for (const depNum of dependsOn) {
        const depExists = mdFiles.some((df) => {
          const db = df.replace(/\.md$/, '');
          return db.includes(`-${depNum}-`) || db === String(depNum) || db.endsWith(`-${depNum}`);
        });
        if (!depExists) {
          issues.push({
            type: 'broken_dependency',
            file: f,
            detail: `depends_on ${depNum} does not match any task file`,
          });
        }
      }
    }

    // Crossing regime declaration heuristic
    // Tasks that mention new durable boundaries should reference the crossing regime contract.
    // This is a warning, not an error, to avoid theater on unrelated tasks.
    const crossingKeywords =
      /\b(new\s+durable|authority\s+owner|boundary\s+crossing|crossing\s+artifact|new\s+boundary|new\s+crossing|durable\s+artifact\s+(from|across|between))\b/i;
    const regimeReferences =
      /\b(crossing\s+regime|SEMANTICS\.md\s+§2\.15|Task\s+49[567])\b/i;
    if (crossingKeywords.test(content) && !regimeReferences.test(content)) {
      issues.push({
        type: 'crossing_regime_missing_declaration',
        file: f,
        detail:
          'Task appears to introduce a durable authority-changing boundary but does not reference the crossing regime declaration contract. If this is a false positive, it may be ignored.',
      });
    }
  }

  // ── Review / closure checks ──
  const repoPath = resolveRepoPath(cwd);
  const reviewsDir = join(repoPath, '.ai', 'reviews');
  const decisionsDir = join(repoPath, '.ai', 'decisions');

  const tasksWithReviews = new Set<number>();
  const tasksWithClosures = new Set<number>();

  // Scan reviews
  try {
    const reviewFiles = (await readdir(reviewsDir)).filter((f) => f.endsWith('.md'));
    for (const rf of reviewFiles) {
      const rcontent = await readFile(join(reviewsDir, rf), 'utf8');
      const { frontMatter: rfm } = parseFrontMatter(rcontent);

      // Front matter review_of
      if (typeof rfm.review_of === 'number') {
        if (!taskByNumber.has(rfm.review_of)) {
          issues.push({
            type: 'stale_review_reference',
            file: rf,
            detail: `Review references non-existent task ${rfm.review_of}`,
          });
        } else {
          tasksWithReviews.add(rfm.review_of);
        }
      }

      // Body text fallback
      const bodyRefs = extractTaskRefsFromBody(rcontent);
      for (const num of bodyRefs) {
        if (!taskByNumber.has(num)) {
          issues.push({
            type: 'stale_review_reference',
            file: rf,
            detail: `Review references non-existent task ${num}`,
          });
        } else {
          tasksWithReviews.add(num);
        }
      }
    }
  } catch {
    // Reviews dir may not exist
  }

  // Scan decisions/closures
  try {
    const decisionFiles = (await readdir(decisionsDir)).filter((f) => f.endsWith('.md'));
    for (const df of decisionFiles) {
      const dcontent = await readFile(join(decisionsDir, df), 'utf8');
      const { frontMatter: dfm } = parseFrontMatter(dcontent);

      // Front matter closes_tasks
      const closesTasks = dfm.closes_tasks as number[] | undefined;
      if (Array.isArray(closesTasks)) {
        for (const ct of closesTasks) {
          const num = typeof ct === 'number' ? ct : typeof ct === 'string' ? parseInt(ct, 10) : null;
          if (num !== null) {
            if (!taskByNumber.has(num)) {
              issues.push({
                type: 'stale_closure_reference',
                file: df,
                detail: `Closure decision references non-existent task ${num}`,
              });
            } else {
              tasksWithClosures.add(num);
            }
          }
        }
      }

      // Body text fallback
      const bodyRefs = extractTaskRefsFromBody(dcontent);
      for (const num of bodyRefs) {
        if (!taskByNumber.has(num)) {
          issues.push({
            type: 'stale_closure_reference',
            file: df,
            detail: `Closure decision references non-existent task ${num}`,
          });
        } else {
          tasksWithClosures.add(num);
        }
      }
    }
  } catch {
    // Decisions dir may not exist
  }

  // Orphan checks and terminal-with-unchecked-criteria checks
  for (const [num, task] of taskByNumber.entries()) {
    const status = task.frontMatter.status;
    if (status === 'in_review' && !tasksWithReviews.has(num)) {
      issues.push({
        type: 'orphan_review',
        file: task.filename,
        detail: `Task ${num} is in_review but has no matching review file`,
      });
    }
    if (status === 'closed' && !tasksWithClosures.has(num)) {
      issues.push({
        type: 'orphan_closure',
        file: task.filename,
        detail: `Task ${num} is closed but has no matching closure decision`,
      });
    }
    // Closure invariant: terminal tasks must have checked criteria
    if (status === 'closed' || status === 'confirmed') {
      const { body } = parseFrontMatter(await readFile(join(dir, task.filename), 'utf8'));
      const criteria = countUncheckedCriteria(body);
      if (criteria.allChecked === false) {
        issues.push({
          type: 'terminal_with_unchecked_criteria',
          file: task.filename,
          detail: `Task ${num} is ${status} but ${criteria.unchecked} acceptance criteria remain unchecked`,
        });
      }
      const hasExecutionNotes = /##\s*Execution Notes\s*\n/i.test(body);
      if (!hasExecutionNotes) {
        issues.push({
          type: 'terminal_without_execution_notes',
          file: task.filename,
          detail: `Task ${num} is ${status} but lacks execution notes`,
        });
      }
      const hasVerification = /##\s*Verification\s*\n/i.test(body);
      if (!hasVerification) {
        issues.push({
          type: 'terminal_without_verification',
          file: task.filename,
          detail: `Task ${num} is ${status} but lacks verification notes`,
        });
      }
      const hasReview = tasksWithReviews.has(num);
      const hasClosure = tasksWithClosures.has(num);
      if (!hasGovernedProvenance(task.frontMatter, hasReview, hasClosure)) {
        issues.push({
          type: 'terminal_without_governed_provenance',
          file: task.filename,
          detail: `Task ${num} is ${status} but lacks governed closure provenance (raw file mutation suspected)`,
        });
      }
    }
  }

  return { issues, ok: issues.length === 0 };
}

/**
 * Lint task files scoped to a chapter range.
 * Pure tool/compiler: no mutations.
 */
export async function lintTaskFilesForRange(
  cwd: string,
  rangeStart: number,
  rangeEnd: number,
): Promise<{
  issues: Array<{ type: string; file: string; detail: string }>;
  ok: boolean;
}> {
  const issues: Array<{ type: string; file: string; detail: string }> = [];
  const dir = join(resolveRepoPath(cwd), TASKS_DIR);
  const files = await readdir(dir).catch(() => [] as string[]);
  const mdFiles = files.filter((f) => f.endsWith('.md'));

  const rangeNumbers = new Set<number>();
  for (let n = rangeStart; n <= rangeEnd; n++) rangeNumbers.add(n);

  const tasksInRange: Array<{ filename: string; frontMatter: TaskFrontMatter; body: string }> = [];
  const taskNumbersInRange = new Set<number>();

  // Scan reviews and closures for governed-provenance checks
  const repoPath = resolveRepoPath(cwd);
  const reviewsDir = join(repoPath, '.ai', 'reviews');
  const decisionsDir = join(repoPath, '.ai', 'decisions');
  const tasksWithReviews = new Set<number>();
  const tasksWithClosures = new Set<number>();

  try {
    const reviewFiles = (await readdir(reviewsDir)).filter((f) => f.endsWith('.json'));
    for (const rf of reviewFiles) {
      try {
        const raw = await readFile(join(reviewsDir, rf), 'utf8');
        const review = JSON.parse(raw) as { task_id?: string };
        const taskNum = extractTaskNumberFromFileName(review.task_id ?? rf);
        if (taskNum !== null && rangeNumbers.has(taskNum)) {
          tasksWithReviews.add(taskNum);
        }
      } catch {
        // Skip malformed
      }
    }
  } catch {
    // Reviews dir may not exist
  }

  try {
    const decisionFiles = (await readdir(decisionsDir)).filter((f) => f.endsWith('.md'));
    for (const df of decisionFiles) {
      try {
        const raw = await readFile(join(decisionsDir, df), 'utf8');
        const { frontMatter: dfm } = parseFrontMatter(raw);
        const closesTasks = dfm.closes_tasks as number[] | undefined;
        if (Array.isArray(closesTasks)) {
          for (const ct of closesTasks) {
            if (rangeNumbers.has(ct)) tasksWithClosures.add(ct);
          }
        }
      } catch {
        // Skip malformed
      }
    }
  } catch {
    // Decisions dir may not exist
  }

  for (const f of mdFiles) {
    const taskNumber = extractTaskNumberFromFileName(f);
    if (taskNumber === null) continue;
    if (taskNumber < rangeStart || taskNumber > rangeEnd) continue;

    const content = await readFile(join(dir, f), 'utf8');
    const { frontMatter, body } = parseFrontMatter(content);
    tasksInRange.push({ filename: f, frontMatter, body });

    // Check task_id matches filename
    if (typeof frontMatter.task_id === 'number') {
      if (taskNumber !== frontMatter.task_id) {
        issues.push({
          type: 'task_id_mismatch',
          file: f,
          detail: `task_id ${frontMatter.task_id} does not match filename number`,
        });
      }
    }

    // Check status is valid
    const status = frontMatter.status as string | undefined;
    if (status && !TASK_STATUSES.includes(status as TaskStatus)) {
      issues.push({
        type: 'invalid_status',
        file: f,
        detail: `Status "${status}" is not a valid task status`,
      });
    }
  }

  // Range completeness check
  const foundNumbers = new Set(tasksInRange.map((t) => extractTaskNumberFromFileName(t.filename)!));
  for (let n = rangeStart; n <= rangeEnd; n++) {
    if (!foundNumbers.has(n)) {
      issues.push({
        type: 'missing_task_in_range',
        file: '—',
        detail: `Task ${n} is missing from chapter range ${rangeStart}-${rangeEnd}`,
      });
    }
  }

  // Cross-boundary checks
  for (const { filename, frontMatter } of tasksInRange) {
    const dependsOn = frontMatter.depends_on as unknown[] | undefined;
    if (dependsOn) {
      for (const depNum of dependsOn) {
        // External dependencies are allowed
        if (typeof depNum === 'string' && depNum.startsWith('ext:')) continue;
        if (typeof depNum !== 'number') continue;

        if (!rangeNumbers.has(depNum)) {
          issues.push({
            type: 'cross_chapter_dependency',
            file: filename,
            detail: `depends_on ${depNum} crosses chapter boundary ${rangeStart}-${rangeEnd}`,
          });
        }

        // Check dependency exists
        const depExists = mdFiles.some((df) => {
          const dn = extractTaskNumberFromFileName(df);
          return dn === depNum;
        });
        if (!depExists) {
          issues.push({
            type: 'broken_dependency',
            file: filename,
            detail: `depends_on ${depNum} does not match any task file`,
          });
        }
      }
    }

    const blockedBy = frontMatter.blocked_by as number[] | undefined;
    if (blockedBy) {
      for (const blockerNum of blockedBy) {
        if (typeof blockerNum !== 'number') continue;
        const blockerExists = mdFiles.some((df) => {
          const dn = extractTaskNumberFromFileName(df);
          return dn === blockerNum;
        });
        if (!blockerExists) {
          issues.push({
            type: 'stale_blocker',
            file: filename,
            detail: `blocked_by ${blockerNum} does not match any task file`,
          });
        }
      }
    }
  }

  // Missing acceptance criteria check and terminal invariant check
  for (const { filename, body, frontMatter } of tasksInRange) {
    if (!body.includes('## Acceptance Criteria')) {
      issues.push({
        type: 'missing_acceptance_criteria',
        file: filename,
        detail: 'Task file is missing an ## Acceptance Criteria section',
      });
    }
    const status = frontMatter.status as string | undefined;
    const taskNumber = extractTaskNumberFromFileName(filename);
    if ((status === 'closed' || status === 'confirmed') && taskNumber !== null) {
      const criteria = countUncheckedCriteria(body);
      if (criteria.allChecked === false) {
        issues.push({
          type: 'terminal_with_unchecked_criteria',
          file: filename,
          detail: `Task ${taskNumber} is ${status} but ${criteria.unchecked} acceptance criteria remain unchecked`,
        });
      }
      const hasExecutionNotes = /##\s*Execution Notes\s*\n/i.test(body);
      if (!hasExecutionNotes) {
        issues.push({
          type: 'terminal_without_execution_notes',
          file: filename,
          detail: `Task ${taskNumber} is ${status} but lacks execution notes`,
        });
      }
      const hasVerification = /##\s*Verification\s*\n/i.test(body);
      if (!hasVerification) {
        issues.push({
          type: 'terminal_without_verification',
          file: filename,
          detail: `Task ${taskNumber} is ${status} but lacks verification notes`,
        });
      }
      const hasReview = tasksWithReviews.has(taskNumber);
      const hasClosure = tasksWithClosures.has(taskNumber);
      if (!hasGovernedProvenance(frontMatter, hasReview, hasClosure)) {
        issues.push({
          type: 'terminal_without_governed_provenance',
          file: filename,
          detail: `Task ${taskNumber} is ${status} but lacks governed closure provenance (raw file mutation suspected)`,
        });
      }
    }
  }

  return { issues, ok: issues.length === 0 };
}

// ── Chapter scanning ──

export interface ChapterTaskInfo {
  taskId: string;
  taskNumber: number | null;
  status: string | undefined;
  fileName: string;
  dependsOn: number[] | undefined;
  continuationAffinity: TaskContinuationAffinity | undefined;
}

/**
 * Extract the chapter name from a task body.
 * Looks for `## Chapter\n<name>` pattern.
 */
export function extractChapter(body: string): string | null {
  const match = body.match(/## Chapter\s*\n+([^\n#]+)/);
  return match ? match[1].trim() : null;
}

export function extractTaskRefsFromBody(body: string): number[] {
  const refs: number[] = [];
  const seen = new Set<number>();
  const re = /\b[Tt]ask\s+(\d{3,})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const n = parseInt(m[1], 10);
    if (!seen.has(n)) {
      seen.add(n);
      refs.push(n);
    }
  }
  return refs;
}

/**
 * Scan all task files and return those belonging to a given chapter.
 */
export async function scanTasksByChapter(
  cwd: string,
  chapterName: string,
): Promise<ChapterTaskInfo[]> {
  const dir = join(resolveRepoPath(cwd), TASKS_DIR);
  const files = await readdir(dir);
  const mdFiles = files.filter((f) => f.endsWith('.md'));
  const tasks: ChapterTaskInfo[] = [];

  for (const f of mdFiles) {
    const content = await readFile(join(dir, f), 'utf8');
    const { frontMatter, body } = parseFrontMatter(content);
    const chapter = extractChapter(body);
    if (chapter === chapterName) {
      const base = f.replace(/\.md$/, '');
      const numMatch = base.match(/-(\d+)-/);
      tasks.push({
        taskId: base,
        taskNumber: numMatch ? Number(numMatch[1]) : (typeof frontMatter.task_id === 'number' ? frontMatter.task_id : null),
        status: frontMatter.status as string | undefined,
        fileName: f,
        dependsOn: frontMatter.depends_on as number[] | undefined,
        continuationAffinity: frontMatter.continuation_affinity as TaskContinuationAffinity | undefined,
      });
    }
  }

  return tasks;
}

/**
 * Extract the task number from a task filename.
 * Handles patterns like YYYYMMDD-NNN-slug.md or simple NNN.md.
 */
export function extractTaskNumberFromFileName(fileName: string): number | null {
  const base = fileName.replace(/\.md$/, '');
  const match = base.match(/-(\d+)-/);
  if (match) return Number(match[1]);
  const simple = Number(base);
  if (!Number.isNaN(simple)) return simple;
  return null;
}

/**
 * Scan all task files and return those with task numbers in the given range.
 */
export async function scanTasksByRange(
  cwd: string,
  rangeStart: number,
  rangeEnd: number,
): Promise<ChapterTaskInfo[]> {
  const dir = join(resolveRepoPath(cwd), TASKS_DIR);
  const files = await readdir(dir).catch(() => [] as string[]);
  const mdFiles = files.filter((f) => f.endsWith('.md'));
  const tasks: ChapterTaskInfo[] = [];

  for (const f of mdFiles) {
    const taskNumber = extractTaskNumberFromFileName(f);
    if (taskNumber === null) continue;
    if (taskNumber < rangeStart || taskNumber > rangeEnd) continue;

    const content = await readFile(join(dir, f), 'utf8');
    const { frontMatter, body } = parseFrontMatter(content);

    tasks.push({
      taskId: f.replace(/\.md$/, ''),
      taskNumber,
      status: frontMatter.status as string | undefined,
      fileName: f,
      dependsOn: frontMatter.depends_on as number[] | undefined,
      continuationAffinity: frontMatter.continuation_affinity as TaskContinuationAffinity | undefined,
    });
  }

  return tasks;
}

// ── Affinity computation ──

export interface ComputedAffinity {
  preferred_agent_id: string | null;
  affinity_strength: number;
  affinity_reason: string | null;
  source: 'manual' | 'history' | 'none';
}

/**
 * Compute the effective affinity for a task.
 * Manual affinity in the task file overrides history-derived affinity.
 */
export async function computeTaskAffinity(
  cwd: string,
  taskInfo: ChapterTaskInfo,
  allTasks: Map<number, ChapterTaskInfo>,
): Promise<ComputedAffinity> {
  // 1. Manual affinity wins
  const manual = taskInfo.continuationAffinity;
  if (manual?.preferred_agent_id) {
    return {
      preferred_agent_id: manual.preferred_agent_id,
      affinity_strength: manual.affinity_strength ?? 1,
      affinity_reason: manual.affinity_reason ?? 'Manual affinity in task file',
      source: 'manual',
    };
  }

  // 2. Compute from assignment history
  const deps = taskInfo.dependsOn ?? [];
  if (deps.length === 0) {
    return {
      preferred_agent_id: null,
      affinity_strength: 0,
      affinity_reason: null,
      source: 'none',
    };
  }

  // Find the most recent dependency that was completed by an agent
  const agentCompletionCounts = new Map<string, number>();
  for (const depNum of deps) {
    const depTask = allTasks.get(depNum);
    if (!depTask) continue;

    const assignment = await loadAssignment(cwd, depTask.taskId);
    if (!assignment) continue;

    // Find the assignment that was released as completed
    for (const a of assignment.assignments) {
      if (a.release_reason === 'completed') {
        agentCompletionCounts.set(a.agent_id, (agentCompletionCounts.get(a.agent_id) ?? 0) + 1);
      }
    }
  }

  if (agentCompletionCounts.size === 0) {
    return {
      preferred_agent_id: null,
      affinity_strength: 0,
      affinity_reason: null,
      source: 'none',
    };
  }

  // Pick the agent with the most completed dependencies
  let bestAgent: string | null = null;
  let bestCount = 0;
  for (const [agentId, count] of agentCompletionCounts) {
    if (count > bestCount) {
      bestAgent = agentId;
      bestCount = count;
    }
  }

  return {
    preferred_agent_id: bestAgent,
    affinity_strength: 1,
    affinity_reason: `Completed ${bestCount} prerequisite task${bestCount > 1 ? 's' : ''}`,
    source: 'history',
  };
}

// ── Evidence-based task listing ──

export interface EvidenceBasedTaskEntry {
  task_number: number | null;
  task_id: string;
  title: string | null;
  status: string | undefined;
  verdict: TaskCompletionEvidence['verdict'];
  unchecked_count: number;
  has_execution_notes: boolean;
  has_verification: boolean;
  has_report: boolean;
  has_review: boolean;
  has_closure: boolean;
  warnings: string[];
  violations: string[];
  assigned_agent: string | null;
  active_assignment_intent: AssignmentIntent | null;
}

const NOT_COMPLETE_VERDICTS: TaskCompletionEvidence['verdict'][] = [
  'incomplete',
  'attempt_complete',
  'needs_review',
  'needs_closure',
];

/**
 * List tasks with evidence-based completion classification.
 *
 * Read-only: scans task files and inspects evidence. Does not mutate.
 *
 * @param verdictFilter - If provided, only include tasks with these verdicts.
 *                        If omitted, defaults to not-complete verdicts.
 * @param statusFilter - If provided, only include tasks with these statuses.
 * @param rangeFilter - If provided, only include tasks in [start, end].
 */
export async function listEvidenceBasedTasks(
  cwd: string,
  options?: {
    verdictFilter?: TaskCompletionEvidence['verdict'][];
    statusFilter?: string[];
    rangeFilter?: { start: number; end: number };
  },
): Promise<EvidenceBasedTaskEntry[]> {
  const dir = join(resolveRepoPath(cwd), TASKS_DIR);
  const files = await readdir(dir).catch(() => [] as string[]);
  const mdFiles = files.filter((f) => f.endsWith('.md'));

  // Load roster once for assignment lookup
  let roster: AgentRoster | null = null;
  try {
    roster = await loadRoster(cwd);
  } catch {
    // Roster may not exist
  }

  const entries: EvidenceBasedTaskEntry[] = [];

  for (const f of mdFiles) {
    const base = f.replace(/\.md$/, '');
    const taskNumber = extractTaskNumberFromFileName(f);

    // Exclude derivative status files
    const isDerivative = DERIVATIVE_SUFFIXES.some((suffix) =>
      base.includes(suffix.replace(/\.md$/, '')),
    );
    if (isDerivative) continue;

    // Range filter
    if (options?.rangeFilter && taskNumber !== null) {
      if (taskNumber < options.rangeFilter.start || taskNumber > options.rangeFilter.end) {
        continue;
      }
    }

    const evidence = await inspectTaskEvidence(cwd, taskNumber !== null ? String(taskNumber) : base);

    // Status filter
    if (options?.statusFilter && evidence.status !== undefined) {
      if (!options.statusFilter.includes(evidence.status)) continue;
    }

    // Verdict filter
    const effectiveVerdictFilter = options?.verdictFilter ?? NOT_COMPLETE_VERDICTS;
    if (!effectiveVerdictFilter.includes(evidence.verdict)) continue;

    // Find assigned agent from roster
    let assignedAgent: string | null = null;
    if (roster && taskNumber !== null) {
      const agent = roster.agents.find((a) => a.task === taskNumber);
      if (agent) assignedAgent = agent.agent_id;
    }

    // Extract title from body
    const content = await readFile(join(dir, f), 'utf8');
    const { body } = parseFrontMatter(content);
    const titleMatch = body.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : null;

    entries.push({
      task_number: evidence.task_number,
      task_id: evidence.task_id ?? base,
      title,
      status: evidence.status,
      verdict: evidence.verdict,
      unchecked_count: evidence.unchecked_count,
      has_execution_notes: evidence.has_execution_notes,
      has_verification: evidence.has_verification,
      has_report: evidence.has_report,
      has_review: evidence.has_review,
      has_closure: evidence.has_closure,
      warnings: evidence.warnings,
      violations: evidence.violations,
      assigned_agent: assignedAgent,
      active_assignment_intent: evidence.active_assignment_intent,
    });
  }

  // Sort by task number ascending
  entries.sort((a, b) => (a.task_number ?? 0) - (b.task_number ?? 0));

  return entries;
}

// ── Task listing with affinity ──

export interface RunnableTask {
  taskId: string;
  taskNumber: number | null;
  status: string;
  title: string | null;
  affinity: ComputedAffinity;
}

/**
 * List all runnable (opened / needs_continuation) tasks sorted by affinity.
 */
export async function listRunnableTasks(cwd: string): Promise<RunnableTask[]> {
  const dir = join(resolveRepoPath(cwd), TASKS_DIR);
  const files = await readdir(dir);
  const mdFiles = files.filter((f) => f.endsWith('.md'));

  // First pass: collect all task info
  const allTaskInfos = new Map<number, ChapterTaskInfo>();
  const rawTasks: Array<{ info: ChapterTaskInfo; title: string | null }> = [];

  for (const f of mdFiles) {
    const content = await readFile(join(dir, f), 'utf8');
    const { frontMatter, body } = parseFrontMatter(content);
    const status = frontMatter.status as string | undefined;
    if (status !== 'opened' && status !== 'needs_continuation') continue;

    const base = f.replace(/\.md$/, '');
    const numMatch = base.match(/-(\d+)-/);
    const taskNumber = numMatch ? Number(numMatch[1]) : (typeof frontMatter.task_id === 'number' ? frontMatter.task_id : null);
    const titleMatch = body.match(/^#\s+(.+)$/m);

    const info: ChapterTaskInfo = {
      taskId: base,
      taskNumber,
      status,
      fileName: f,
      dependsOn: frontMatter.depends_on as number[] | undefined,
      continuationAffinity: frontMatter.continuation_affinity as TaskContinuationAffinity | undefined,
    };

    if (taskNumber !== null) {
      allTaskInfos.set(taskNumber, info);
    }
    rawTasks.push({ info, title: titleMatch ? titleMatch[1].trim() : null });
  }

  // Second pass: compute affinity for each
  const result: RunnableTask[] = [];
  for (const { info, title } of rawTasks) {
    const affinity = await computeTaskAffinity(cwd, info, allTaskInfos);
    result.push({
      taskId: info.taskId,
      taskNumber: info.taskNumber,
      status: info.status!,
      title,
      affinity,
    });
  }

  // Sort: higher affinity first, then by task number
  result.sort((a, b) => {
    if (b.affinity.affinity_strength !== a.affinity.affinity_strength) {
      return b.affinity.affinity_strength - a.affinity.affinity_strength;
    }
    return (a.taskNumber ?? 0) - (b.taskNumber ?? 0);
  });

  return result;
}
