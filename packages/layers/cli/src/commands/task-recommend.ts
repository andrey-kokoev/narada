/**
 * Task recommendation operator.
 *
 * Read-only advisory command. Never mutates task, roster, assignment,
 * report, review, or PrincipalRuntime state.
 */

import { resolve } from 'node:path';
import { generateRecommendations, type TaskRecommendation, type CandidateAssignment } from '../lib/task-recommender.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  recallAcceptedLearning,
  formatGuidanceForHumans,
  formatGuidanceForJson,
} from '../lib/learning-recall.js';
import { loadPosture, type CCCPosture } from './posture.js';

export interface TaskRecommendOptions {
  taskNumber?: string;
  format?: 'json' | 'human' | 'auto';
  agent?: string;
  limit?: number;
  ignorePosture?: boolean;
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

export async function taskRecommendCommand(
  options: TaskRecommendOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const agentFilter = options.agent;
  const taskFilter = options.taskNumber;
  const limit = options.limit ?? 10;

  let recommendation = await generateRecommendations({
    cwd,
    agentFilter,
    taskFilter,
    limit,
    architectId: options.architect,
  });

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

  if (fmt.getFormat() === 'json') {
    const result: Record<string, unknown> = {
      ...recommendation,
      guidance: formatGuidanceForJson(guidance),
    };
    if (postureWarning) result.posture_warning = postureWarning;
    if (postureReasons.length > 0) result.posture_adjustments = postureReasons;
    return {
      exitCode: recommendation.primary ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result,
    };
  }

  // Human-readable output
  if (postureWarning) {
    fmt.message(postureWarning, 'warning');
  }

  if (recommendation.primary) {
    fmt.message(`Top recommendation: ${recommendation.primary.task_id} → ${recommendation.primary.principal_id}`, 'success');
    fmt.message(`  Score: ${recommendation.primary.score} (confidence: ${recommendation.primary.confidence})`, 'info');
    fmt.message(`  ${recommendation.primary.rationale}`, 'info');
  } else {
    fmt.message('No recommendations available.', 'warning');
  }

  if (postureReasons.length > 0) {
    fmt.message('\nPosture adjustments:', 'info');
    for (const reason of postureReasons) {
      fmt.message(`  ${reason}`, 'info');
    }
  }

  if (recommendation.alternatives.length > 0) {
    fmt.message(`\nAlternatives (${recommendation.alternatives.length}):`, 'info');
    for (const alt of recommendation.alternatives.slice(0, limit)) {
      fmt.message(`  ${alt.task_id} → ${alt.principal_id} (score: ${alt.score}, ${alt.confidence})`, 'info');
    }
  }

  if (recommendation.abstained.length > 0) {
    fmt.message(`\nAbstained (${recommendation.abstained.length}):`, 'warning');
    for (const abs of recommendation.abstained.slice(0, limit)) {
      fmt.message(`  ${abs.task_id}: ${abs.reason}`, 'warning');
    }
  }

  if (options.verbose && guidance.length > 0) {
    fmt.message('\nActive guidance:', 'info');
    for (const line of formatGuidanceForHumans(guidance)) {
      fmt.message(line, 'info');
    }
  }

  return {
    exitCode: recommendation.primary ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: recommendation,
  };
}
