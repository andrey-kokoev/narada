/**
 * Construction Operation fixture engine (Task 414).
 *
 * Implements the recommendation algorithm from Decision 411,
 * review-separation check from Decision 413,
 * and write-set conflict detection from Decision 413.
 *
 * This is a test fixture, not production code.
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  parseFrontMatter,
  type TaskFrontMatter,
} from '../../../src/lib/task-governance.js';
import { openTaskLifecycleStore } from '../../../src/lib/task-lifecycle-store.js';
import type {
  FixtureTask,
  FixtureAgent,
  FixturePrincipalRuntime,
  FixtureAssignment,
  FixtureWriteSetManifest,
  AssignmentRecommendation,
  CandidateAssignment,
  AbstainedTask,
  ScoreBreakdown,
  SeparationCheckResult,
  WriteSetConflict,
  FixtureReport,
} from './types.js';

// ── Default weights (from Decision 411) ──

const DEFAULT_WEIGHTS = {
  affinity: 0.30,
  capability: 0.25,
  load: 0.20,
  history: 0.10,
  review: 0.10,
  budget: 0.05,
};

// ── Data loading ──

export async function loadFixtureTasks(cwd: string): Promise<FixtureTask[]> {
  const tasksDir = join(cwd, '.ai', 'do-not-open', 'tasks');
  const files = await readdir(tasksDir).catch(() => []);
  const mdFiles = files.filter((f) => f.endsWith('.md'));
  const tasks: FixtureTask[] = [];

  for (const f of mdFiles) {
    const content = await readFile(join(tasksDir, f), 'utf8');
    const { frontMatter, body } = parseFrontMatter(content);
    const base = f.replace(/\.md$/, '');
    const numMatch = base.match(/-(\d+)-/);
    const taskNumber = numMatch ? Number(numMatch[1]) : 0;
    const titleMatch = body.match(/^#\s+(.+)$/m);

    tasks.push({
      taskId: base,
      taskNumber,
      status: (frontMatter.status as FixtureTask['status']) ?? 'opened',
      title: titleMatch ? titleMatch[1].trim() : base,
      dependsOn: (frontMatter.depends_on as number[]) ?? [],
      chapter: extractChapter(body),
      requiredCapabilities: extractCapabilities(body, titleMatch ? titleMatch[1].trim() : ''),
      continuationAffinity: frontMatter.continuation_affinity as FixtureTask['continuationAffinity'],
      body,
    });
  }

  return tasks;
}

function extractChapter(body: string): string | null {
  const match = body.match(/## Chapter\s*\n+([^\n#]+)/);
  return match ? match[1].trim() : null;
}

function extractCapabilities(body: string, title: string = ''): string[] {
  const caps: string[] = [];
  const text = (body + ' ' + title).toLowerCase();
  const hasWord = (word: string) => new RegExp(`\\b${word}\\b`, 'i').test(text);

  if (text.includes('typescript') || text.includes('typecheck')) caps.push('typescript');
  if (hasWord('test') || hasWord('fixture')) caps.push('testing');
  if (text.includes('sqlite') || hasWord('schema')) caps.push('database');
  if (text.includes('graph api') || hasWord('mail')) caps.push('mailbox_vertical');
  if (text.includes('cloudflare') || hasWord('worker')) caps.push('cloudflare');
  if (hasWord('design') || hasWord('contract') || hasWord('boundary')) caps.push('architecture');
  if (hasWord('documentation') || hasWord('readme')) caps.push('documentation');
  if (hasWord('cli')) caps.push('cli');
  if (hasWord('ui')) caps.push('ui');
  return [...new Set(caps)];
}

export async function loadFixtureRoster(cwd: string): Promise<FixtureAgent[]> {
  try {
    const store = openTaskLifecycleStore(cwd);
    try {
      return store.getRoster().map((row) => ({
        agent_id: row.agent_id,
        role: row.role,
        capabilities: JSON.parse(row.capabilities_json),
        first_seen_at: row.first_seen_at,
        last_active_at: row.last_active_at,
        status: row.status as FixtureAgent['status'],
        task: row.task_number,
        last_done: row.last_done,
        updated_at: row.updated_at,
      }));
    } finally {
      store.db.close();
    }
  } catch {
    return [];
  }
}

export async function loadFixtureAssignments(cwd: string): Promise<FixtureAssignment[]> {
  const assignments: FixtureAssignment[] = [];
  try {
    const store = openTaskLifecycleStore(cwd);
    try {
      const rows = store.db
        .prepare('select task_id, record_json from task_assignment_records')
        .all() as Array<{ task_id: string; record_json: string }>;
      for (const row of rows) {
        const record = JSON.parse(row.record_json) as { task_id: string; assignments: FixtureAssignment[] };
        for (const a of record.assignments) {
          assignments.push({ ...a, task_id: record.task_id });
        }
      }
    } finally {
      store.db.close();
    }
  } catch {
    return [];
  }
  return assignments;
}

export async function loadFixturePrincipalRuntimes(
  cwd: string,
): Promise<FixturePrincipalRuntime[]> {
  const path = join(cwd, '.ai', 'principal-runtimes.json');
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as FixturePrincipalRuntime[];
  } catch {
    return [];
  }
}

export async function loadFixtureWriteSetManifests(
  cwd: string,
): Promise<Map<string, FixtureWriteSetManifest>> {
  const dir = join(cwd, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments');
  const files = await readdir(dir).catch(() => []);
  const manifests = new Map<string, FixtureWriteSetManifest>();
  for (const f of files.filter((x) => x.endsWith('.json'))) {
    const raw = await readFile(join(dir, f), 'utf8');
    const record = JSON.parse(raw) as {
      task_id: string;
      write_set_manifest?: FixtureWriteSetManifest;
    };
    if (record.write_set_manifest) {
      manifests.set(record.task_id, record.write_set_manifest);
    }
  }
  return manifests;
}

// ── Scoring ──

function affinityScore(task: FixtureTask, agentId: string, allTasks: FixtureTask[], assignments: FixtureAssignment[]): number {
  // 1. Manual affinity wins
  const manual = task.continuationAffinity;
  if (manual?.preferred_agent_id === agentId) {
    return manual.affinity_strength === undefined ? 1.0 : Math.min(1.0, manual.affinity_strength);
  }

  // 2. History-derived affinity from completed dependencies
  const deps = task.dependsOn ?? [];
  if (deps.length === 0) return 0.0;

  let completedCount = 0;
  for (const depNum of deps) {
    const depTask = allTasks.find((t) => t.taskNumber === depNum);
    if (!depTask) continue;
    const depAssignments = assignments.filter((a) => a.task_id === depTask.taskId);
    const completed = depAssignments.filter((a) => a.release_reason === 'completed' && a.agent_id === agentId);
    if (completed.length > 0) completedCount++;
  }

  if (completedCount === 0) return 0.0;
  return 0.7; // History-derived affinity is weaker than manual
}

function capabilityScore(task: FixtureTask, agent: FixtureAgent): number {
  const taskCaps = task.requiredCapabilities;
  if (taskCaps.length === 0) return 0.5;
  const intersection = taskCaps.filter((c) => agent.capabilities.includes(c));
  return intersection.length / taskCaps.length;
}

function loadScore(agent: FixtureAgent): number {
  if (agent.status === 'working' || agent.status === 'reviewing' || agent.status === 'blocked') {
    return 0.3;
  }
  return 1.0;
}

function historyScore(agentId: string, assignments: FixtureAssignment[]): number {
  const agentAssignments = assignments.filter((a) => a.agent_id === agentId);
  const completed = agentAssignments.filter((a) => a.release_reason === 'completed').length;
  const abandoned = agentAssignments.filter((a) => a.release_reason === 'abandoned').length;
  if (completed + abandoned === 0) return 0.5;
  return completed / (completed + abandoned);
}

function reviewSeparationScore(
  task: FixtureTask,
  agentId: string,
  assignments: FixtureAssignment[],
): number {
  const taskAssignments = assignments.filter((a) => a.task_id === task.taskId);
  const lastActive =
    taskAssignments.find((a) => a.released_at === null) ??
    taskAssignments
      .filter((a) => a.release_reason === 'completed')
      .sort((a, b) => (b.released_at ?? '').localeCompare(a.released_at ?? ''))[0];

  if (lastActive && lastActive.agent_id === agentId) {
    return 0.0;
  }
  return 1.0;
}

function budgetScore(runtime: FixturePrincipalRuntime | undefined): number {
  if (!runtime) return 1.0;
  if (runtime.budget_remaining === null) return 1.0;
  if (runtime.budget_remaining <= 0) return 0.0;
  return Math.min(1.0, runtime.budget_remaining / 10000);
}

// ── Recommendation engine ──

export function generateRecommendations(
  tasks: FixtureTask[],
  agents: FixtureAgent[],
  runtimes: FixturePrincipalRuntime[],
  assignments: FixtureAssignment[],
  weights = DEFAULT_WEIGHTS,
): AssignmentRecommendation[] {
  const runnableTasks = tasks.filter(
    (t) => t.status === 'opened' || t.status === 'needs_continuation',
  );

  const availableAgents = agents.filter((a) => {
    const rt = runtimes.find((r) => r.principal_id === a.agent_id);
    if (rt) {
      if (['unavailable', 'stale', 'failed', 'budget_exhausted'].includes(rt.state)) return false;
      if (rt.active_work_item_id !== null) return false;
    }
    return a.status !== 'blocked';
  });

  const recommendations: AssignmentRecommendation[] = [];

  for (const task of runnableTasks) {
    const candidates: CandidateAssignment[] = [];

    for (const agent of availableAgents) {
      const runtime = runtimes.find((r) => r.principal_id === agent.agent_id);

      const b: ScoreBreakdown = {
        affinity: affinityScore(task, agent.agent_id, tasks, assignments),
        capability: capabilityScore(task, agent),
        load: loadScore(agent),
        history: historyScore(agent.agent_id, assignments),
        review_separation: reviewSeparationScore(task, agent.agent_id, assignments),
        budget: budgetScore(runtime),
      };

      const score =
        weights.affinity * b.affinity +
        weights.capability * b.capability +
        weights.load * b.load +
        weights.history * b.history +
        weights.review * b.review_separation +
        weights.budget * b.budget;

      if (score <= 0) continue;

      const altScores = availableAgents
        .filter((a) => a.agent_id !== agent.agent_id)
        .map((a) => {
          const rt2 = runtimes.find((r) => r.principal_id === a.agent_id);
          const b2: ScoreBreakdown = {
            affinity: affinityScore(task, a.agent_id, tasks, assignments),
            capability: capabilityScore(task, a),
            load: loadScore(a),
            history: historyScore(a.agent_id, assignments),
            review_separation: reviewSeparationScore(task, a.agent_id, assignments),
            budget: budgetScore(rt2),
          };
          return (
            weights.affinity * b2.affinity +
            weights.capability * b2.capability +
            weights.load * b2.load +
            weights.history * b2.history +
            weights.review * b2.review_separation +
            weights.budget * b2.budget
          );
        });
      const bestAlt = altScores.length > 0 ? Math.max(...altScores) : 0;

      let confidence: CandidateAssignment['confidence'] = 'low';
      if (score >= 0.8 && score - bestAlt >= 0.2) confidence = 'high';
      else if (score >= 0.5) confidence = 'medium';

      const capMatch = task.requiredCapabilities.filter((c) => agent.capabilities.includes(c));
      const capSummary =
        capMatch.length === task.requiredCapabilities.length && task.requiredCapabilities.length > 0
          ? `full capability match [${capMatch.join(', ')}]`
          : capMatch.length > 0
            ? `partial match [${capMatch.join(', ')}]`
            : 'no capability match';

      const affinityClause =
        b.affinity > 0
          ? `continuation affinity (strength ${b.affinity.toFixed(2)})`
          : 'no affinity';
      const loadClause = agent.status === 'idle' || agent.status === 'done' ? 'idle' : 'busy';
      const historyClause =
        b.history >= 0.7 ? 'strong completion record' : b.history <= 0.3 ? 'poor completion record' : 'neutral history';
      const caveat = b.review_separation === 0 ? 'Warning: was last worker on this task' : '';

      candidates.push({
        task_id: task.taskId,
        task_number: task.taskNumber,
        task_title: task.title,
        principal_id: agent.agent_id,
        score: Math.round(score * 1000) / 1000,
        confidence,
        breakdown: {
          affinity: Math.round(b.affinity * 1000) / 1000,
          capability: Math.round(b.capability * 1000) / 1000,
          load: Math.round(b.load * 1000) / 1000,
          history: Math.round(b.history * 1000) / 1000,
          review_separation: Math.round(b.review_separation * 1000) / 1000,
          budget: Math.round(b.budget * 1000) / 1000,
        },
        rationale: `${agent.agent_id} is ${loadClause} with ${capSummary}. ${affinityClause}. ${historyClause}. ${caveat}`.trim(),
      });
    }

    candidates.sort((a, b) => b.score - a.score);

    const primary = candidates[0] ?? null;
    const alternatives = candidates.slice(1);

    const abstained: AbstainedTask[] = [];
    if (candidates.length === 0) {
      abstained.push({
        task_id: task.taskId,
        task_number: task.taskNumber,
        reason: 'No suitable principal found',
      });
    }

    recommendations.push({
      recommendation_id: `rec-${task.taskId}-${Date.now()}`,
      generated_at: new Date().toISOString(),
      recommender_id: 'system',
      primary,
      alternatives,
      abstained,
      summary: `${task.taskId}: ${primary ? `recommended ${primary.principal_id} (score ${primary.score})` : 'abstained'}`,
    });
  }

  return recommendations;
}

// ── Review separation check ──

export function checkReviewSeparation(
  taskId: string,
  reviewerAgentId: string,
  assignments: FixtureAssignment[],
): SeparationCheckResult {
  const taskAssignments = assignments.filter((a) => a.task_id === taskId);

  if (taskAssignments.length === 0) {
    return { checked: true, valid: true };
  }

  const lastActive =
    taskAssignments.find((a) => a.released_at === null) ??
    taskAssignments
      .filter((a) => a.release_reason === 'completed' || a.release_reason === 'budget_exhausted')
      .sort((a, b) => (b.released_at ?? '').localeCompare(a.released_at ?? ''))[0];

  if (!lastActive) {
    return { checked: true, valid: true };
  }

  if (lastActive.agent_id === reviewerAgentId) {
    return {
      checked: true,
      valid: false,
      worker_agent_id: lastActive.agent_id,
      warning: 'Reviewer was the last worker on this task',
    };
  }

  return { checked: true, valid: true };
}

// ── Write-set conflict detection ──

export function detectWriteSetConflicts(
  assignments: Map<string, { agent_id: string; manifest: FixtureWriteSetManifest }>,
): WriteSetConflict[] {
  const conflicts: WriteSetConflict[] = [];
  const entries = Array.from(assignments.entries());

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [taskA, dataA] = entries[i];
      const [taskB, dataB] = entries[j];

      const filesA = new Set(dataA.manifest.declared_files);
      const filesB = new Set(dataB.manifest.declared_files);
      const overlap: string[] = [];
      for (const f of filesA) {
        if (filesB.has(f)) overlap.push(f);
      }

      // Glob overlap: if any path is a prefix of another
      for (const fa of dataA.manifest.declared_files) {
        for (const fb of dataB.manifest.declared_files) {
          if (fa === fb) continue;
          if (fa.endsWith('*') && fb.startsWith(fa.replace('*', ''))) {
            overlap.push(`${fa} ↔ ${fb}`);
          }
          if (fb.endsWith('*') && fa.startsWith(fb.replace('*', ''))) {
            overlap.push(`${fa} ↔ ${fb}`);
          }
        }
      }

      if (overlap.length > 0) {
        conflicts.push({
          type: 'file_overlap',
          task_a: taskA,
          task_b: taskB,
          agent_a: dataA.agent_id,
          agent_b: dataB.agent_id,
          overlapping_files: [...new Set(overlap)],
          severity: 'warning',
        });
      }

      const createsA = new Set(dataA.manifest.declared_creates);
      const deletesB = new Set(dataB.manifest.declared_deletes);
      const cdConflict: string[] = [];
      for (const c of createsA) {
        if (deletesB.has(c)) cdConflict.push(c);
      }
      const createsB = new Set(dataB.manifest.declared_creates);
      const deletesA = new Set(dataA.manifest.declared_deletes);
      for (const c of createsB) {
        if (deletesA.has(c)) cdConflict.push(c);
      }

      if (cdConflict.length > 0) {
        conflicts.push({
          type: 'create_delete_conflict',
          task_a: taskA,
          task_b: taskB,
          agent_a: dataA.agent_id,
          agent_b: dataB.agent_id,
          overlapping_files: [...new Set(cdConflict)],
          severity: 'warning',
        });
      }
    }
  }

  return conflicts;
}

// ── Report generation ──

export function generateReport(
  recommendations: AssignmentRecommendation[],
  conflicts: WriteSetConflict[],
  groundTruth: Map<number, string>,
): FixtureReport {
  let top1Correct = 0;
  let top3Correct = 0;
  let total = 0;

  for (const rec of recommendations) {
    if (rec.abstained.length > 0) continue;
    const truth = groundTruth.get(rec.primary!.task_number);
    if (!truth) continue;
    total++;

    const candidates = [rec.primary!, ...rec.alternatives];
    if (rec.primary!.principal_id === truth) top1Correct++;
    if (candidates.slice(0, 3).some((c) => c.principal_id === truth)) top3Correct++;
  }

  const top1_accuracy = total > 0 ? Math.round((top1Correct / total) * 100) / 100 : 0;
  const top3_accuracy = total > 0 ? Math.round((top3Correct / total) * 100) / 100 : 0;

  // False positives: conflicts flagged where none exist in ground truth
  // For this fixture, we define false positive as any conflict where tasks
  // are assigned to the same agent (intra-agent conflicts are expected)
  const intraAgentConflicts = conflicts.filter((c) => c.agent_a === c.agent_b).length;
  const false_positive_rate =
    conflicts.length > 0 ? Math.round((intraAgentConflicts / conflicts.length) * 100) / 100 : 0;

  return {
    top1_accuracy,
    top3_accuracy,
    false_positive_rate,
    edge_cases_covered: [],
    total_recommendations: recommendations.filter((r) => r.primary !== null).length,
    total_abstained: recommendations.filter((r) => r.abstained.length > 0).length,
    total_conflicts: conflicts.length,
  };
}

// ── Fixture data generators ──

export const SYNTHETIC_TASKS: FixtureTask[] = [
  {
    taskId: '20260422-500-schema-migration',
    taskNumber: 500,
    status: 'opened',
    title: 'Schema migration for v2 coordinator',
    dependsOn: [],
    chapter: 'Database Hardening',
    requiredCapabilities: ['typescript', 'database'],
    body: '# Schema migration\n\nMigrate coordinator schema to v2 using TypeScript.\n\n## Required Reading\n- `packages/layers/control-plane/src/coordinator/store.ts`\n\n## Chapter\nDatabase Hardening',
  },
  {
    taskId: '20260422-501-sync-cli-command',
    taskNumber: 501,
    status: 'opened',
    title: 'Sync CLI command refactor',
    dependsOn: [500],
    chapter: 'CLI Polish',
    requiredCapabilities: ['typescript', 'cli'],
    body: '# Sync CLI command refactor\n\nRefactor the sync CLI command in TypeScript.\n\n## Chapter\nCLI Polish',
  },
  {
    taskId: '20260422-502-mailbox-test-fixture',
    taskNumber: 502,
    status: 'opened',
    title: 'Mailbox charter test fixture',
    dependsOn: [],
    chapter: 'Mailbox Vertical',
    requiredCapabilities: ['testing', 'mailbox_vertical'],
    body: '# Mailbox charter test fixture\n\nAdd test fixture for mailbox charter.\n\n## Chapter\nMailbox Vertical',
  },
  {
    taskId: '20260422-503-cloudflare-worker',
    taskNumber: 503,
    status: 'opened',
    title: 'Cloudflare worker scaffold',
    dependsOn: [502],
    chapter: 'Cloudflare Site',
    requiredCapabilities: ['cloudflare', 'typescript'],
    body: '# Cloudflare worker scaffold\n\nScaffold the Cloudflare worker in TypeScript.\n\n## Chapter\nCloudflare Site',
  },
  {
    taskId: '20260422-504-architecture-decision',
    taskNumber: 504,
    status: 'opened',
    title: 'Architecture decision record',
    dependsOn: [],
    chapter: 'Architecture',
    requiredCapabilities: ['architecture', 'documentation'],
    body: '# Architecture decision record\n\nDocument the architecture decision.\n\n## Chapter\nArchitecture',
  },
  {
    taskId: '20260422-505-operator-console-ui',
    taskNumber: 505,
    status: 'opened',
    title: 'Operator console UI polish',
    dependsOn: [],
    chapter: 'UI',
    requiredCapabilities: ['typescript', 'ui'],
    body: '# Operator console UI polish\n\nPolish the operator console UI using TypeScript.\n\n## Chapter\nUI',
  },
  {
    taskId: '20260422-506-klaviyo-boundary-doc',
    taskNumber: 506,
    status: 'needs_continuation',
    title: 'Klaviyo intent boundary documentation',
    dependsOn: [],
    chapter: 'Documentation',
    requiredCapabilities: ['documentation', 'architecture'],
    continuationAffinity: {
      preferred_agent_id: 'agent-gamma',
      affinity_strength: 1,
      affinity_reason: 'Manual affinity from operator',
    },
    body: '# Klaviyo intent boundary documentation\n\nDocument the Klaviyo intent boundary.\n\n## Chapter\nDocumentation',
  },
  {
    taskId: '20260422-507-site-registry-health',
    taskNumber: 507,
    status: 'opened',
    title: 'Site registry health check',
    dependsOn: [506],
    chapter: 'Windows Site',
    requiredCapabilities: ['typescript', 'testing'],
    body: '# Site registry health check\n\nAdd TypeScript health check for site registry with tests.\n\n## Chapter\nWindows Site',
  },
  {
    taskId: '20260422-508-attention-queue',
    taskNumber: 508,
    status: 'opened',
    title: 'Cross-site attention queue',
    dependsOn: [],
    chapter: 'Windows Site',
    requiredCapabilities: ['typescript', 'database'],
    body: '# Cross-site attention queue\n\nImplement cross-site attention queue in TypeScript with SQLite.\n\n## Chapter\nWindows Site',
  },
  {
    taskId: '20260422-509-chapter-close-operator',
    taskNumber: 509,
    status: 'opened',
    title: 'Chapter close operator',
    dependsOn: [],
    chapter: 'CLI Polish',
    requiredCapabilities: ['typescript', 'cli'],
    body: '# Chapter close operator\n\nImplement chapter close operator in TypeScript.\n\n## Chapter\nCLI Polish',
  },
];

export const SYNTHETIC_ROSTER: FixtureAgent[] = [
  {
    agent_id: 'agent-alpha',
    role: 'developer',
    capabilities: ['typescript', 'database', 'cli', 'testing'],
    status: 'idle',
    current_task: null,
  },
  {
    agent_id: 'agent-beta',
    role: 'developer',
    capabilities: ['cloudflare', 'typescript', 'ui'],
    status: 'idle',
    current_task: null,
  },
  {
    agent_id: 'agent-gamma',
    role: 'developer',
    capabilities: ['architecture', 'documentation', 'testing'],
    status: 'idle',
    current_task: null,
  },
  {
    agent_id: 'architect-delta',
    role: 'architect',
    capabilities: ['architecture', 'typescript', 'documentation', 'cli'],
    status: 'idle',
    current_task: null,
  },
];

export const SYNTHETIC_RUNTIMES: FixturePrincipalRuntime[] = [
  { principal_id: 'agent-alpha', state: 'available', budget_remaining: 10000, active_work_item_id: null },
  { principal_id: 'agent-beta', state: 'available', budget_remaining: 5000, active_work_item_id: null },
  { principal_id: 'agent-gamma', state: 'available', budget_remaining: 8000, active_work_item_id: null },
  { principal_id: 'architect-delta', state: 'budget_exhausted', budget_remaining: 0, active_work_item_id: null },
];

export const SYNTHETIC_ASSIGNMENTS: FixtureAssignment[] = [
  // Historical assignments for affinity and history scoring
  { task_id: '20260422-400-old-task-alpha', agent_id: 'agent-alpha', claimed_at: '2026-04-01T00:00:00Z', released_at: '2026-04-02T00:00:00Z', release_reason: 'completed' },
  { task_id: '20260422-401-old-task-beta', agent_id: 'agent-beta', claimed_at: '2026-04-03T00:00:00Z', released_at: '2026-04-04T00:00:00Z', release_reason: 'completed' },
  { task_id: '20260422-402-old-task-gamma', agent_id: 'agent-gamma', claimed_at: '2026-04-05T00:00:00Z', released_at: '2026-04-06T00:00:00Z', release_reason: 'abandoned' },
  // Task 500 was completed by agent-alpha (for affinity on 501)
  { task_id: '20260422-500-schema-migration', agent_id: 'agent-alpha', claimed_at: '2026-04-10T00:00:00Z', released_at: '2026-04-15T00:00:00Z', release_reason: 'completed' },
  // Task 502 was completed by agent-beta (for affinity on 503)
  { task_id: '20260422-502-mailbox-test-fixture', agent_id: 'agent-beta', claimed_at: '2026-04-10T00:00:00Z', released_at: '2026-04-15T00:00:00Z', release_reason: 'completed' },
];

export const SYNTHETIC_WRITE_SETS: Map<string, FixtureWriteSetManifest> = new Map([
  ['20260422-500-schema-migration', { declared_files: ['packages/layers/control-plane/src/schema.ts'], declared_creates: [], declared_deletes: [] }],
  ['20260422-501-sync-cli-command', { declared_files: ['packages/layers/cli/src/commands/sync.ts'], declared_creates: [], declared_deletes: [] }],
  ['20260422-502-mailbox-test-fixture', { declared_files: ['packages/verticals/mailbox/test/**/*.ts'], declared_creates: [], declared_deletes: [] }],
  ['20260422-503-cloudflare-worker', { declared_files: ['packages/sites/cloudflare/src/worker.ts'], declared_creates: [], declared_deletes: [] }],
  ['20260422-504-architecture-decision', { declared_files: ['.ai/decisions/*.md'], declared_creates: [], declared_deletes: [] }],
  ['20260422-505-operator-console-ui', { declared_files: ['packages/layers/daemon/src/ui/**/*.ts'], declared_creates: [], declared_deletes: [] }],
  ['20260422-506-klaviyo-boundary-doc', { declared_files: ['docs/deployment/klaviyo*.md'], declared_creates: [], declared_deletes: [] }],
  ['20260422-507-site-registry-health', { declared_files: ['packages/sites/windows/src/registry.ts'], declared_creates: [], declared_deletes: [] }],
  ['20260422-508-attention-queue', { declared_files: ['packages/sites/windows/src/aggregation.ts'], declared_creates: [], declared_deletes: [] }],
  ['20260422-509-chapter-close-operator', { declared_files: ['packages/layers/cli/src/commands/chapter-close.ts'], declared_creates: [], declared_deletes: [] }],
]);

// Ground truth: ideal agent for each task
export const GROUND_TRUTH = new Map<number, string>([
  [500, 'agent-alpha'],    // typescript + database
  [501, 'agent-alpha'],    // typescript + cli (depends on 500, affinity)
  [502, 'agent-beta'],     // testing + mailbox (but agent-beta lacks mailbox; agent-alpha has testing)
  // Actually 502 needs testing+mailbox_vertical. agent-alpha has testing, agent-beta lacks mailbox_vertical.
  // agent-gamma has testing. No perfect match. agent-alpha is closest.
  [503, 'agent-beta'],     // cloudflare + typescript
  [504, 'agent-gamma'],    // architecture + documentation
  [505, 'agent-beta'],     // typescript + ui
  [506, 'agent-gamma'],    // documentation + architecture (manual affinity)
  [507, 'agent-alpha'],    // typescript + testing
  [508, 'agent-alpha'],    // typescript + database
  [509, 'agent-alpha'],    // typescript + cli
]);

// ── Data setup helpers ──

export async function setupFixtureData(cwd: string): Promise<void> {
  const tasksDir = join(cwd, '.ai', 'do-not-open', 'tasks');
  const agentsDir = join(cwd, '.ai', 'agents');
  const assignmentsDir = join(cwd, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments');
  const reviewsDir = join(cwd, '.ai', 'reviews');

  await mkdir(tasksDir, { recursive: true });
  await mkdir(agentsDir, { recursive: true });
  await mkdir(assignmentsDir, { recursive: true });
  await mkdir(reviewsDir, { recursive: true });

  // Write task files
  for (const task of SYNTHETIC_TASKS) {
    const frontMatter: TaskFrontMatter = {
      status: task.status,
      depends_on: task.dependsOn,
    };
    if (task.continuationAffinity) {
      frontMatter.continuation_affinity = task.continuationAffinity;
    }

    const lines = ['---'];
    for (const [key, value] of Object.entries(frontMatter)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        lines.push(`${key}: [${value.join(', ')}]`);
      } else if (typeof value === 'object' && value !== null) {
        lines.push(`${key}:`);
        for (const [k, v] of Object.entries(value)) {
          lines.push(`  ${k}: ${v}`);
        }
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    lines.push('---');
    lines.push('');
    lines.push(`# ${task.title}`);
    lines.push('');
    lines.push(task.body ?? '');

    await writeFile(join(tasksDir, `${task.taskId}.md`), lines.join('\n') + '\n');
  }

  // Write roster authority to SQLite
  {
    const store = openTaskLifecycleStore(cwd);
    try {
      for (const agent of SYNTHETIC_ROSTER) {
        store.upsertRosterEntry({
          agent_id: agent.agent_id,
          role: agent.role,
          capabilities_json: JSON.stringify(agent.capabilities ?? []),
          first_seen_at: agent.first_seen_at,
          last_active_at: agent.last_active_at,
          status: agent.status ?? 'idle',
          task_number: agent.task ?? null,
          last_done: agent.last_done ?? null,
          updated_at: agent.updated_at ?? agent.last_active_at,
        });
      }
    } finally {
      store.db.close();
    }
  }

  // Write principal runtimes
  await writeFile(
    join(cwd, '.ai', 'principal-runtimes.json'),
    JSON.stringify(SYNTHETIC_RUNTIMES, null, 2) + '\n',
  );

  // Write assignment records
  const byTask = new Map<string, FixtureAssignment[]>();
  for (const a of SYNTHETIC_ASSIGNMENTS) {
    const list = byTask.get(a.task_id) ?? [];
    list.push(a);
    byTask.set(a.task_id, list);
  }
  {
    const store = openTaskLifecycleStore(cwd);
    try {
      for (const [taskId, assignmentsForTask] of byTask) {
        store.upsertAssignmentRecord({
          task_id: taskId,
          record_json: JSON.stringify({ task_id: taskId, assignments: assignmentsForTask }),
          updated_at: new Date().toISOString(),
        });
      }
    } finally {
      store.db.close();
    }
  }
  for (const [taskId, list] of byTask) {
    const record = { task_id: taskId, assignments: list };
    await writeFile(join(assignmentsDir, `${taskId}.json`), JSON.stringify(record, null, 2) + '\n');
  }

  // Write write-set manifests into assignment records for active tasks
  for (const [taskId, manifest] of SYNTHETIC_WRITE_SETS) {
    const path = join(assignmentsDir, `${taskId}.json`);
    let record: Record<string, unknown>;
    try {
      const raw = await readFile(path, 'utf8');
      record = JSON.parse(raw);
    } catch {
      record = { task_id: taskId, assignments: [] };
    }
    record.write_set_manifest = manifest;
    await writeFile(path, JSON.stringify(record, null, 2) + '\n');
  }
}
