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
}

export interface AgentRoster {
  version: number;
  schema?: string;
  updated_at: string;
  agents: AgentRosterEntry[];
}

export interface TaskAssignment {
  agent_id: string;
  claimed_at: string;
  claim_context: string | null;
  released_at: string | null;
  release_reason: 'completed' | 'abandoned' | 'superseded' | 'transferred' | 'budget_exhausted' | null;
}

export interface TaskAssignmentRecord {
  task_id: string;
  assignments: TaskAssignment[];
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
  [key: string]: unknown;
}

const ROSTER_PATH = '.ai/agents/roster.json';
const ASSIGNMENTS_DIR = '.ai/tasks/assignments';
const TASKS_DIR = '.ai/tasks';
const REVIEWS_DIR = '.ai/reviews';
const REGISTRY_PATH = '.ai/tasks/.registry.json';
const REGISTRY_LOCK_PATH = '.ai/tasks/.registry.lock';

export interface TaskRegistry {
  version: number;
  last_allocated: number;
  reserved: number[];
  released: number[];
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
}

function resolveRepoPath(cwd: string): string {
  return resolve(cwd);
}

export async function loadRoster(cwd: string): Promise<AgentRoster> {
  const path = join(resolveRepoPath(cwd), ROSTER_PATH);
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as AgentRoster;
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
    // Match patterns like 20260420-260-... or 260 anywhere in the filename
    return base.includes(`-${taskNumber}-`) || base === taskNumber || base.endsWith(`-${taskNumber}`);
  });

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
  if (/^-?\d+$/.test(rawValue)) return Number(rawValue);
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
      // Possible nested object — peek ahead for indented lines
      const nested: Record<string, unknown> = {};
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        if (!nextLine.startsWith('  ') && !nextLine.startsWith('\t')) break;
        const nextTrimmed = nextLine.trimStart();
        const nextColon = nextTrimmed.indexOf(':');
        if (nextColon === -1) break;
        const nestedKey = nextTrimmed.slice(0, nextColon).trim();
        const nestedValue = nextTrimmed.slice(nextColon + 1).trim();
        nested[nestedKey] = parseScalar(nestedValue);
        j++;
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
  opened: ['claimed'],
  claimed: ['in_review', 'opened', 'needs_continuation'],
  needs_continuation: ['claimed', 'opened'],
  in_review: ['closed', 'opened'],
  closed: ['confirmed'],
  confirmed: [],
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
 * Check that all dependency tasks are in a terminal or near-terminal state.
 * Returns the list of blocking dependency task IDs.
 */
export async function checkDependencies(
  cwd: string,
  dependsOn: number[] | undefined,
): Promise<{ blockedBy: string[] }> {
  if (!dependsOn || dependsOn.length === 0) return { blockedBy: [] };

  const blockedBy: string[] = [];
  const dir = join(resolveRepoPath(cwd), TASKS_DIR);
  const files = await readdir(dir);

  for (const depNum of dependsOn) {
    // Find the task file for this dependency number
    const candidates = files.filter((f) => {
      if (!f.endsWith('.md')) return false;
      const base = f.replace(/\.md$/, '');
      return base.includes(`-${depNum}-`) || base === String(depNum) || base.endsWith(`-${depNum}`);
    });

    if (candidates.length !== 1) {
      // Cannot resolve dependency — treat as blocking to be safe
      blockedBy.push(String(depNum));
      continue;
    }

    const taskPath = join(dir, candidates[0]!);
    const content = await readFile(taskPath, 'utf8');
    const { frontMatter } = parseFrontMatter(content);
    const depStatus = frontMatter.status;

    if (depStatus !== 'closed' && depStatus !== 'confirmed') {
      blockedBy.push(candidates[0]!.replace(/\.md$/, ''));
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
 */
export async function loadRegistry(cwd: string): Promise<TaskRegistry> {
  const path = join(resolveRepoPath(cwd), REGISTRY_PATH);
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as TaskRegistry;
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

  for (const f of mdFiles) {
    const base = f.replace(/\.md$/, '');
    allTaskIds.add(base);

    const content = await readFile(join(dir, f), 'utf8');
    const { frontMatter } = parseFrontMatter(content);

    // Filename-based number extraction (always runs for duplicate detection)
    const filenameMatch = base.match(/-(\d+)-/);
    const filenameNum = filenameMatch ? Number(filenameMatch[1]) : null;

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
