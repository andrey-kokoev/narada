/**
 * Task recommendation operator.
 *
 * Read-only advisory command. Never mutates task, roster, assignment,
 * report, review, or PrincipalRuntime state.
 */

import { resolve } from 'node:path';
import { generateRecommendations, type TaskRecommendation, type CandidateAssignment } from '../lib/task-recommender.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  recallAcceptedLearning,
  formatGuidanceForHumans,
  formatGuidanceForJson,
} from '../lib/learning-recall.js';
import { loadRoster } from '../lib/task-governance.js';
import { loadPosture, type CCCPosture } from './posture.js';

export interface TaskRecommendOptions {
  taskNumber?: string;
  format?: 'json' | 'human' | 'auto';
  agent?: string;
  limit?: number;
  ignorePosture?: boolean;
  full?: boolean;
  abstainedLimit?: number;
  cwd?: string;
  verbose?: boolean;
  /** Architect principal ID that produced this recommendation. */
  architect?: string;
}

// ── Posture-driven score adjustment ──

function isRunnableProofTask(taskId: string, title: string | null): boolean {
  const text = `${taskId} ${title ?? ''}`.toLowerCase();
  return text.includes('test') || text.includes('fixture') || text.includes('verify') || text.includes('proof');
}

function isMetaTask(taskId: string, title: string | null): boolean {
  const text = `${taskId} ${title ?? ''}`.toLowerCase();
  return text.includes('meta') || text.includes('governance') || text.includes('contract') || text.includes('design');
}

function isVerticalTask(taskId: string, title: string | null): boolean {
  const text = `${taskId} ${title ?? ''}`.toLowerCase();
  return text.includes('vertical') || text.includes('mailbox') || text.includes('cloudflare') || text.includes('site');
}

function isObservationSurfaceTask(taskId: string, title: string | null): boolean {
  const text = `${taskId} ${title ?? ''}`.toLowerCase();
  return text.includes('observation') || text.includes('view') || text.includes('ui') || text.includes('console');
}

function isContractOrTerminologyTask(taskId: string, title: string | null): boolean {
  const text = `${taskId} ${title ?? ''}`.toLowerCase();
  return text.includes('contract') || text.includes('terminology') || text.includes('semantics') || text.includes('spec');
}

function isTestOrBoundaryTask(taskId: string, title: string | null): boolean {
  const text = `${taskId} ${title ?? ''}`.toLowerCase();
  return text.includes('test') || text.includes('boundary') || text.includes('invariant') || text.includes('fixture');
}

function isGenericAbstractionTask(taskId: string, title: string | null): boolean {
  const text = `${taskId} ${title ?? ''}`.toLowerCase();
  return text.includes('abstraction') || text.includes('generic') || text.includes('framework') || text.includes('platform');
}

function applyPostureAdjustment(
  candidates: CandidateAssignment[],
  posture: CCCPosture,
): { adjusted: CandidateAssignment[]; reasons: string[] } {
  const reasons: string[] = [];
  const adjusted = candidates.map((c) => ({ ...c, score: c.score }));

  const exec = posture.coordinates.constructive_executability.reading;
  if (exec === 'stalled' || exec === 'weak') {
    for (const c of adjusted) {
      if (isRunnableProofTask(c.task_id, c.task_title)) {
        c.score = Math.min(1.0, c.score * 1.1);
      }
    }
    reasons.push('constructive_executability low: boosted runnable-proof tasks (+10%)');
  }

  const teleo = posture.coordinates.teleological_pressure.reading;
  if (teleo === 'diffuse' || teleo === 'needs_target') {
    for (const c of adjusted) {
      if (isMetaTask(c.task_id, c.task_title)) {
        c.score = c.score * 0.9;
      } else if (isVerticalTask(c.task_id, c.task_title)) {
        c.score = Math.min(1.0, c.score * 1.1);
      }
    }
    reasons.push('teleological_pressure unfocused: penalized meta tasks (-10%), boosted vertical tasks (+10%)');
  }

  const auth = posture.coordinates.authority_reviewability.reading;
  if (auth === 'overweighted') {
    for (const c of adjusted) {
      if (isObservationSurfaceTask(c.task_id, c.task_title)) {
        c.score = c.score * 0.9;
      }
    }
    reasons.push('authority_reviewability overweighted: penalized observation surfaces (-10%)');
  }

  const semantic = posture.coordinates.semantic_resolution.reading;
  if (semantic === 'degraded') {
    for (const c of adjusted) {
      if (isContractOrTerminologyTask(c.task_id, c.task_title)) {
        c.score = Math.min(1.0, c.score * 1.1);
      }
    }
    reasons.push('semantic_resolution unstable: boosted contract/terminology tasks (+10%)');
  }

  const invariant = posture.coordinates.invariant_preservation.reading;
  if (invariant === 'weak') {
    for (const c of adjusted) {
      if (isTestOrBoundaryTask(c.task_id, c.task_title)) {
        c.score = Math.min(1.0, c.score * 1.1);
      }
    }
    reasons.push('invariant_preservation weak: boosted test/boundary tasks (+10%)');
  }

  const universal = posture.coordinates.grounded_universalization.reading;
  if (universal === 'premature') {
    for (const c of adjusted) {
      if (isGenericAbstractionTask(c.task_id, c.task_title)) {
        c.score = c.score * 0.9;
      }
    }
    reasons.push('grounded_universalization premature: penalized generic abstraction tasks (-10%)');
  }

  // Re-sort after adjustment
  adjusted.sort((a, b) => b.score - a.score);

  return { adjusted, reasons };
}

function agentNotFoundResult(agent: string): {
  status: 'error';
  reason: 'agent_not_found';
  agent: string;
  action: 'recommend';
  error: string;
  next_step: string;
} {
  return {
    status: 'error',
    reason: 'agent_not_found',
    agent,
    action: 'recommend',
    error: `Agent ${agent} not found in roster`,
    next_step: 'Ask the operator to admit this agent to the roster before claiming work.',
  };
}

function boundRecommendationOutput(
  recommendation: TaskRecommendation,
  options: { limit: number; abstainedLimit?: number; full?: boolean },
): TaskRecommendation {
  const abstainedTotal = recommendation.abstained.length;
  const abstainedBound = options.full ? abstainedTotal : Math.max(0, options.abstainedLimit ?? options.limit);
  const returnedAbstained = options.full ? recommendation.abstained : recommendation.abstained.slice(0, abstainedBound);
  const alternativesTotal = recommendation.alternatives.length;
  const alternativesBound = options.full ? alternativesTotal : Math.max(0, options.limit - (recommendation.primary ? 1 : 0));
  const returnedAlternatives = options.full ? recommendation.alternatives : recommendation.alternatives.slice(0, alternativesBound);
  return {
    ...recommendation,
    alternatives: returnedAlternatives,
    alternatives_total: alternativesTotal,
    alternatives_returned: returnedAlternatives.length,
    alternatives_truncated: returnedAlternatives.length < alternativesTotal,
    alternatives_limit: options.full ? null : alternativesBound,
    abstained: returnedAbstained,
    abstained_total: abstainedTotal,
    abstained_returned: returnedAbstained.length,
    abstained_truncated: returnedAbstained.length < abstainedTotal,
    abstained_limit: options.full ? null : abstainedBound,
  };
}

export async function taskRecommendCommand(
  options: TaskRecommendOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
    const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
    const agentFilter = options.agent;
    const taskFilter = options.taskNumber;
    const limit = options.limit ?? 10;

    if (agentFilter) {
      try {
        const roster = await loadRoster(cwd);
        if (!roster.agents.some((agent) => agent.agent_id === agentFilter)) {
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: agentNotFoundResult(agentFilter),
          };
        }
      } catch (error) {
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: {
            status: 'error',
            reason: 'roster_unavailable',
            agent: agentFilter,
            action: 'recommend',
            error: `Failed to load roster: ${error instanceof Error ? error.message : String(error)}`,
          },
        };
      }
    }

    let store;
    try {
      store = openTaskLifecycleStore(cwd);
    } catch {
      // Store may not exist yet; fallback to markdown-only reads
    }

    let recommendation = await generateRecommendations({
      cwd,
      agentFilter,
      taskFilter,
      limit,
      architectId: options.architect,
      store,
    });

    if (store) store.db.close();

    const { guidance } = await recallAcceptedLearning({
      cwd,
      scopes: ['recommendation', 'assignment', 'task-governance'],
    });

    // ── CCC Posture integration ──
    let postureWarning: string | null = null;
    let postureReasons: string[] = [];

    if (!options.ignorePosture) {
      const posture = await loadPosture(cwd);
      if (posture) {
        const expired = new Date(posture.expires_at) < new Date();
        if (!expired) {
          const allCandidates = recommendation.primary
            ? [recommendation.primary, ...recommendation.alternatives]
            : recommendation.alternatives;

          const { adjusted, reasons } = applyPostureAdjustment(allCandidates, posture);
          postureReasons = reasons;

          if (adjusted.length > 0) {
            recommendation = {
              ...recommendation,
              primary: adjusted[0] ?? null,
              alternatives: adjusted.slice(1),
            };
          }
        } else {
          postureWarning = 'CCC posture has expired; using local heuristics';
        }
      } else {
        postureWarning = 'No active CCC posture; recommendations use local heuristics only.';
      }
    }

    const outputRecommendation = boundRecommendationOutput(recommendation, {
      limit,
      abstainedLimit: options.abstainedLimit,
      full: options.full,
    });

    if (fmt.getFormat() === 'json') {
      const result: Record<string, unknown> = {
        ...outputRecommendation,
        guidance: formatGuidanceForJson(guidance),
      };
      if (postureWarning) result.posture_warning = postureWarning;
      if (postureReasons.length > 0) result.posture_adjustments = postureReasons;
      return {
        exitCode: outputRecommendation.primary ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
        result,
      };
    }

    // Human-readable output
    if (postureWarning) {
      fmt.message(postureWarning, 'warning');
    }

    if (outputRecommendation.primary) {
      fmt.message(`Top recommendation: ${outputRecommendation.primary.task_id} → ${outputRecommendation.primary.principal_id}`, 'success');
      fmt.message(`  Score: ${outputRecommendation.primary.score} (confidence: ${outputRecommendation.primary.confidence})`, 'info');
      fmt.message(`  ${outputRecommendation.primary.rationale}`, 'info');
    } else {
      fmt.message('No recommendations available.', 'warning');
    }

    if (postureReasons.length > 0) {
      fmt.message('\nPosture adjustments:', 'info');
      for (const reason of postureReasons) {
        fmt.message(`  ${reason}`, 'info');
      }
    }

    if (outputRecommendation.alternatives.length > 0) {
      fmt.message(`\nAlternatives (${outputRecommendation.alternatives.length}):`, 'info');
      for (const alt of outputRecommendation.alternatives.slice(0, limit)) {
        fmt.message(`  ${alt.task_id} → ${alt.principal_id} (score: ${alt.score}, ${alt.confidence})`, 'info');
      }
      if (outputRecommendation.alternatives_truncated) {
        fmt.message('  Alternatives truncated; pass --full for the complete diagnostic list.', 'info');
      }
    }

    if (outputRecommendation.abstained.length > 0) {
      const total = outputRecommendation.abstained_total ?? outputRecommendation.abstained.length;
      fmt.message(`\nAbstained (${outputRecommendation.abstained.length}/${total} shown):`, 'warning');
      for (const abs of outputRecommendation.abstained) {
        const blockedDetail = abs.blocked_by && abs.blocked_by.length > 0
          ? `: ${abs.blocked_by.join(', ')}`
          : '';
        const agentDetail = abs.blocked_by_agents && abs.blocked_by_agents.length > 0
          ? ` [${abs.blocked_by_agents.map((b) => `${b.task_number}→${b.agent_id}`).join(', ')}]`
          : '';
        fmt.message(`  ${abs.task_id}: ${abs.reason}${blockedDetail}${agentDetail}`, 'warning');
      }
      if (outputRecommendation.abstained_truncated) {
        fmt.message('  Abstentions truncated; pass --full for the complete diagnostic list.', 'warning');
      }
    }

    if (options.verbose && guidance.length > 0) {
      fmt.message('\nActive guidance:', 'info');
      for (const line of formatGuidanceForHumans(guidance)) {
        fmt.message(line, 'info');
      }
    }

    return {
      exitCode: outputRecommendation.primary ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result: outputRecommendation,
    };
  } catch (err) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { error: (err as Error).message },
    };
  }
}
