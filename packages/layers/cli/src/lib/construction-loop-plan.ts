/**
 * Construction loop plan builder.
 *
 * Composes existing read-only operators into a structured operator plan.
 * Never mutates task files, roster, or assignment state.
 */

import { resolve } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { loadRoster, inspectTaskEvidence, scanTasksByRange, type TaskCompletionEvidence, type AgentRoster } from './task-governance.js';
import { readTaskGraph, type TaskGraph } from './task-graph.js';
import { generateRecommendations, type TaskRecommendation, type CandidateAssignment } from './task-recommender.js';
import { taskPromoteRecommendationCommand } from '../commands/task-promote-recommendation.js';
import { chapterStatusCommand } from '../commands/chapter-status.js';
import type { ConstructionLoopPolicy } from './construction-loop-policy.js';

// ── Plan types ──

export interface StaleAgent {
  agent_id: string;
  status: string;
  assigned_task: number | null;
  minutes_since_update: number;
  suggested_action: string;
}

export interface TaskEvidenceSummary {
  task_number: number;
  task_id: string;
  status: string;
  verdict: string;
}

export interface ChapterSummary {
  range: string;
  state: string;
  tasks_found: number;
  blockers_count: number;
}

export interface PromotionCandidate {
  task_id: string;
  task_number: number | null;
  agent_id: string;
  score: number;
  confidence: string;
  dry_run_result: unknown;
  blocked_by_policy: string[];
}

export interface SuggestedAction {
  description: string;
  command: string;
}

export interface ConstructionLoopPlan {
  status: 'ok' | 'paused' | 'no_agents' | 'no_tasks' | 'policy_error' | 'cycle_limit';
  policy_created_default: boolean;
  observations: {
    agent_count: number;
    idle_agents: string[];
    working_agents: string[];
    reviewing_agents: string[];
    blocked_agents: string[];
    done_agents: string[];
    stale_agents: StaleAgent[];
    active_assignment_count: number;
  };
  graph_summary: {
    total_tasks: number;
    open_tasks: number;
    terminal_tasks: number;
  };
  evidence_summary: TaskEvidenceSummary[];
  chapter_summary: ChapterSummary[];
  recommendations: TaskRecommendation | null;
  promotion_candidates: PromotionCandidate[];
  suggested_actions: SuggestedAction[];
  warnings: string[];
}

// ── Helpers ──

const terminalStatuses = new Set(['closed', 'accepted', 'deferred', 'confirmed']);
const activeRosterStatuses = new Set(['working', 'reviewing']);

function isTerminal(status: string | undefined): boolean {
  return terminalStatuses.has(status ?? '');
}

function groupIntoContiguousRanges(numbers: number[]): Array<{ start: number; end: number }> {
  if (numbers.length === 0) return [];
  const sorted = [...numbers].sort((a, b) => a - b);
  const ranges: Array<{ start: number; end: number }> = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push({ start, end });
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push({ start, end });
  return ranges;
}

async function checkPauseFile(cwd: string): Promise<string | null> {
  try {
    const content = await readFile(resolve(cwd, '.ai', 'construction-loop', 'pause'), 'utf8');
    return content.trim() || 'paused';
  } catch {
    return null;
  }
}

// ── Plan builder ──

export interface BuildPlanOptions {
  cwd: string;
  policy: ConstructionLoopPolicy;
}

export async function buildPlan(options: BuildPlanOptions): Promise<ConstructionLoopPlan> {
  const { cwd, policy } = options;
  const warnings: string[] = [];

  // ── Step 1: Check pause ──
  const pauseReason = await checkPauseFile(cwd);
  if (pauseReason) {
    return {
      status: 'paused',
      policy_created_default: false,
      observations: { agent_count: 0, idle_agents: [], working_agents: [], reviewing_agents: [], blocked_agents: [], done_agents: [], stale_agents: [], active_assignment_count: 0 },
      graph_summary: { total_tasks: 0, open_tasks: 0, terminal_tasks: 0 },
      evidence_summary: [],
      chapter_summary: [],
      recommendations: null,
      promotion_candidates: [],
      suggested_actions: [{ description: 'Resume construction loop', command: 'narada construction-loop resume' }],
      warnings: [`Construction loop is paused: ${pauseReason}`],
    };
  }

  // ── Step 2: Observe roster ──
  let roster: AgentRoster;
  try {
    roster = await loadRoster(cwd);
  } catch {
    roster = { version: 1, updated_at: new Date().toISOString(), agents: [] };
  }

  const idleAgents = roster.agents.filter((a) => a.status === 'idle');
  const workingAgents = roster.agents.filter((a) => a.status === 'working');
  const reviewingAgents = roster.agents.filter((a) => a.status === 'reviewing');
  const blockedAgents = roster.agents.filter((a) => a.status === 'blocked');
  const doneAgents = roster.agents.filter((a) => a.status === 'done');
  const activeAssignmentCount = workingAgents.length + reviewingAgents.length;

  // Stale agent detection
  const staleAgents: StaleAgent[] = [];
  const now = Date.now();
  for (const agent of roster.agents) {
    if (!activeRosterStatuses.has(agent.status ?? '')) continue;
    const updatedAt = agent.updated_at ? new Date(agent.updated_at).getTime() : 0;
    if (updatedAt > 0 && now - updatedAt > policy.stale_agent_timeout_ms) {
      const minutes = Math.round((now - updatedAt) / 60000);
      staleAgents.push({
        agent_id: agent.agent_id,
        status: agent.status ?? 'unknown',
        assigned_task: agent.task ?? null,
        minutes_since_update: minutes,
        suggested_action: agent.task != null
          ? `narada task roster done ${agent.agent_id} --task ${agent.task}`
          : `narada task roster idle ${agent.agent_id}`,
      });
    }
  }

  // ── Step 3: Observe graph ──
  let graph: TaskGraph;
  try {
    graph = await readTaskGraph({ cwd, includeClosed: true });
  } catch {
    graph = { nodes: [], edges: [] };
  }

  const openTasks = graph.nodes.filter((n) => !isTerminal(n.status));
  const terminalTasks = graph.nodes.filter((n) => isTerminal(n.status));

  // ── Step 4: Inspect evidence for open tasks ──
  const evidenceSummaries: TaskEvidenceSummary[] = [];
  for (const task of openTasks) {
    try {
      const evidence = await inspectTaskEvidence(cwd, String(task.taskNumber));
      evidenceSummaries.push({
        task_number: task.taskNumber,
        task_id: task.file,
        status: evidence.status ?? 'unknown',
        verdict: evidence.verdict,
      });
    } catch {
      evidenceSummaries.push({
        task_number: task.taskNumber,
        task_id: task.file,
        status: task.status,
        verdict: 'unknown',
      });
    }
  }

  // Crossing regime heuristic: warn if open tasks look like boundary work
  // but lack crossing regime declaration references.
  const crossingKeywords =
    /\b(new\s+durable|authority\s+owner|boundary\s+crossing|crossing\s+artifact|new\s+boundary|new\s+crossing)\b/i;
  const regimeReferences =
    /\b(crossing\s+regime|SEMANTICS\.md\s+§2\.15|Task\s+49[567])\b/i;
  for (const task of openTasks) {
    try {
      const content = await readFile(resolve(cwd, '.ai', 'tasks', task.file), 'utf8');
      if (crossingKeywords.test(content) && !regimeReferences.test(content)) {
        warnings.push(
          `Task ${task.taskNumber} appears to introduce a durable boundary but lacks a crossing regime declaration reference (SEMANTICS.md §2.15).`,
        );
      }
    } catch {
      // Ignore unreadable task files
    }
  }

  // ── Step 5: Derive chapter states ──
  const chapterSummaries: ChapterSummary[] = [];
  const allTaskNumbers = graph.nodes.map((n) => n.taskNumber).filter((n) => n != null);
  const ranges = groupIntoContiguousRanges(allTaskNumbers);
  for (const range of ranges) {
    if (range.end - range.start + 1 < 2) continue; // Skip singletons as chapters
    try {
      const result = await chapterStatusCommand({
        range: `${range.start}-${range.end}`,
        cwd,
        format: 'json',
      });
      const r = result.result as { state: string; tasks_found: number; blockers: unknown[] };
      chapterSummaries.push({
        range: `${range.start}-${range.end}`,
        state: r.state,
        tasks_found: r.tasks_found,
        blockers_count: r.blockers?.length ?? 0,
      });
    } catch {
      // Skip ranges that fail
    }
  }

  // ── Step 6: Generate recommendations ──
  let recommendations: TaskRecommendation | null = null;
  try {
    const rec = await generateRecommendations({ cwd, limit: 10 });
    recommendations = rec;
  } catch (err) {
    warnings.push(`Recommendation generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Step 7: Produce promotion candidates (policy-filtered) ──
  const promotionCandidates: PromotionCandidate[] = [];
  const severityRank: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };
  const maxSeverityRank = severityRank[policy.max_write_set_risk_severity] ?? 2;

  if (recommendations) {
    const allCandidates: CandidateAssignment[] = recommendations.primary
      ? [recommendations.primary, ...recommendations.alternatives]
      : [...recommendations.alternatives];

    for (const candidate of allCandidates) {
      const blockedReasons: string[] = [];

      // Agent blocked
      if (policy.blocked_agent_ids.includes(candidate.principal_id)) {
        blockedReasons.push(`agent ${candidate.principal_id} is blocked`);
      }

      // Agent not in allowed list (if restricted)
      if (policy.allowed_agent_ids.length > 0 && !policy.allowed_agent_ids.includes(candidate.principal_id)) {
        blockedReasons.push(`agent ${candidate.principal_id} not in allowed_agent_ids`);
      }

      // Task blocked
      if (candidate.task_number != null) {
        if (policy.blocked_task_numbers.includes(candidate.task_number)) {
          blockedReasons.push(`task ${candidate.task_number} is blocked`);
        }
        for (const range of policy.blocked_task_ranges) {
          if (candidate.task_number >= range.start && candidate.task_number <= range.end) {
            blockedReasons.push(`task ${candidate.task_number} is in blocked range ${range.start}-${range.end}`);
          }
        }
      }

      // Write-set risk
      const writeSetRisks = candidate.risks.filter((r) => r.category === 'write_set');
      for (const risk of writeSetRisks) {
        if ((severityRank[risk.severity] ?? 0) > maxSeverityRank) {
          blockedReasons.push(`write-set risk ${risk.severity} exceeds policy max ${policy.max_write_set_risk_severity}`);
        }
      }

      // Recommendation age
      const recAge = (Date.now() - new Date(recommendations.generated_at).getTime()) / 60000;
      if (recAge > policy.max_recommendation_age_minutes) {
        blockedReasons.push(`recommendation is ${Math.round(recAge)}m old (max ${policy.max_recommendation_age_minutes}m)`);
      }

      // Max simultaneous assignments
      if (activeAssignmentCount >= policy.max_simultaneous_assignments) {
        blockedReasons.push(`active assignments (${activeAssignmentCount}) >= max (${policy.max_simultaneous_assignments})`);
      }

      // Dry-run promotion (only if not blocked by policy)
      let dryRunResult: unknown = null;
      if (blockedReasons.length === 0 && candidate.task_number != null) {
        try {
          const dryRun = await taskPromoteRecommendationCommand({
            cwd,
            taskNumber: String(candidate.task_number),
            agent: candidate.principal_id,
            by: 'construction-loop',
            dryRun: true,
            format: 'json',
          });
          dryRunResult = dryRun.result;
        } catch (err) {
          dryRunResult = { status: 'dry_run_error', error: err instanceof Error ? err.message : String(err) };
        }
      }

      promotionCandidates.push({
        task_id: candidate.task_id,
        task_number: candidate.task_number,
        agent_id: candidate.principal_id,
        score: candidate.score,
        confidence: candidate.confidence,
        dry_run_result: dryRunResult,
        blocked_by_policy: blockedReasons,
      });
    }
  }

  // ── Step 8: Suggested actions ──
  const suggestedActions: SuggestedAction[] = [];

  if (idleAgents.length === 0) {
    if (policy.stop_conditions.on_all_agents_busy === 'wait') {
      suggestedActions.push({ description: 'All agents are busy', command: 'Wait for agents to become idle' });
    }
  }

  if (openTasks.length === 0) {
    if (policy.stop_conditions.on_no_runnable_tasks === 'suggest_closure') {
      const readyChapters = chapterSummaries.filter((c) => c.state === 'review_ready');
      for (const ch of readyChapters) {
        suggestedActions.push({
          description: `Chapter ${ch.range} is ready for closure`,
          command: `narada chapter close ${ch.range} --start`,
        });
      }
    }
  }

  for (const candidate of promotionCandidates) {
    if (candidate.blocked_by_policy.length === 0 && candidate.task_number != null) {
      suggestedActions.push({
        description: `Promote ${candidate.task_id} → ${candidate.agent_id}`,
        command: `narada task promote-recommendation --task ${candidate.task_number} --agent ${candidate.agent_id} --by <operator>`,
      });
    }
  }

  for (const stale of staleAgents) {
    suggestedActions.push({
      description: `Stale agent ${stale.agent_id} (${stale.minutes_since_update}m since update)`,
      command: stale.suggested_action,
    });
  }

  // ── Step 9: Determine plan status ──
  let status: ConstructionLoopPlan['status'] = 'ok';
  if (idleAgents.length === 0) {
    status = 'no_agents';
  } else if (openTasks.length === 0) {
    status = 'no_tasks';
  }

  return {
    status,
    policy_created_default: false,
    observations: {
      agent_count: roster.agents.length,
      idle_agents: idleAgents.map((a) => a.agent_id),
      working_agents: workingAgents.map((a) => a.agent_id),
      reviewing_agents: reviewingAgents.map((a) => a.agent_id),
      blocked_agents: blockedAgents.map((a) => a.agent_id),
      done_agents: doneAgents.map((a) => a.agent_id),
      stale_agents: staleAgents,
      active_assignment_count: activeAssignmentCount,
    },
    graph_summary: {
      total_tasks: graph.nodes.length,
      open_tasks: openTasks.length,
      terminal_tasks: terminalTasks.length,
    },
    evidence_summary: evidenceSummaries,
    chapter_summary: chapterSummaries,
    recommendations,
    promotion_candidates: promotionCandidates,
    suggested_actions: suggestedActions,
    warnings,
  };
}
