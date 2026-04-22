/**
 * Task recommendation operator.
 *
 * Read-only advisory command. Never mutates task, roster, assignment,
 * report, review, or PrincipalRuntime state.
 */

import { resolve } from 'node:path';
import { generateRecommendations, type TaskRecommendation } from '../lib/task-recommender.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  recallAcceptedLearning,
  formatGuidanceForHumans,
  formatGuidanceForJson,
} from '../lib/learning-recall.js';

export interface TaskRecommendOptions {
  taskNumber?: string;
  format?: 'json' | 'human' | 'auto';
  agent?: string;
  limit?: number;
  cwd?: string;
}

export async function taskRecommendCommand(
  options: TaskRecommendOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const agentFilter = options.agent;
  const taskFilter = options.taskNumber;
  const limit = options.limit ?? 10;

  const recommendation = await generateRecommendations({
    cwd,
    agentFilter,
    taskFilter,
    limit,
  });

  const { guidance } = await recallAcceptedLearning({
    cwd,
    scopes: ['recommendation', 'assignment', 'task-governance'],
  });

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: recommendation.primary ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result: {
        ...recommendation,
        guidance: formatGuidanceForJson(guidance),
      },
    };
  }

  // Human-readable output
  if (recommendation.primary) {
    fmt.message(`Top recommendation: ${recommendation.primary.task_id} → ${recommendation.primary.principal_id}`, 'success');
    fmt.message(`  Score: ${recommendation.primary.score} (confidence: ${recommendation.primary.confidence})`, 'info');
    fmt.message(`  ${recommendation.primary.rationale}`, 'info');
  } else {
    fmt.message('No recommendations available.', 'warning');
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

  if (guidance.length > 0) {
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
