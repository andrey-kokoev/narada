/**
 * Assignment promotion operator.
 *
 * Turns an advisory recommendation into a durable task assignment
 * after explicit operator approval and validation.
 *
 * Delegates mutation to taskClaimCommand; adds audit scaffolding.
 */

import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  loadRoster,
  findTaskFile,
  readTaskFile,
  loadAssignment,
  getActiveAssignment,
  checkDependencies,
  atomicWriteFile,
  type TaskFrontMatter,
} from '../lib/task-governance.js';
import { generateRecommendations, type TaskRecommendation, type CandidateAssignment, type RecommendationRisk } from '../lib/task-recommender.js';
import { taskClaimCommand } from './task-claim.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface TaskPromoteRecommendationOptions {
  recommendationId?: string;
  taskNumber?: string;
  agent?: string;
  by?: string;
  overrideRisk?: string;
  dryRun?: boolean;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export interface ValidationResult {
  check: string;
  passed: boolean;
  detail?: string;
}

export interface AssignmentPromotionRequest {
  promotion_id: string;
  recommendation_id: string;
  task_id: string;
  task_number: number | null;
  agent_id: string;
  /** Architect principal ID that produced the recommendation being promoted. */
  architect_id: string | null;
  requested_by: string;
  requested_at: string;
  executed_at: string | null;
  status: 'requested' | 'executed' | 'rejected' | 'stale' | 'failed';
  recommendation_snapshot: {
    generated_at: string;
    recommender_id: string;
    primary: {
      task_id: string;
      principal_id: string;
      score: number;
      confidence: string;
      rationale: string;
    } | null;
  };
  validation_results: ValidationResult[];
  failure_reason?: string;
  override_reason?: string;
  assignment_id?: string;
}

const PROMOTIONS_DIR = '.ai/tasks/promotions';
const RECOMMENDATION_TTL_MS = 60 * 60 * 1000; // 1 hour

function generatePromotionId(): string {
  return `promotion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getPromotionPath(cwd: string, promotionId: string): string {
  return join(resolve(cwd), PROMOTIONS_DIR, `${promotionId}.json`);
}

async function ensurePromotionsDir(cwd: string): Promise<void> {
  await mkdir(join(resolve(cwd), PROMOTIONS_DIR), { recursive: true });
}

async function savePromotionRequest(cwd: string, request: AssignmentPromotionRequest): Promise<void> {
  await ensurePromotionsDir(cwd);
  const path = getPromotionPath(cwd, request.promotion_id);
  await atomicWriteFile(path, JSON.stringify(request, null, 2) + '\n');
}

function findCandidateInRecommendation(
  rec: TaskRecommendation,
  taskId: string,
  agentId: string,
): CandidateAssignment | null {
  const all = rec.primary ? [rec.primary, ...rec.alternatives] : rec.alternatives;
  return all.find((c) => c.task_id === taskId && c.principal_id === agentId) ?? null;
}

function isWriteSetRiskBlocking(risks: RecommendationRisk[]): boolean {
  return risks.some((r) => r.category === 'write_set' && r.severity === 'high');
}

function isRecommendationExpired(rec: TaskRecommendation, overrideReason?: string): { expired: boolean; detail?: string } {
  if (overrideReason) {
    return { expired: false };
  }
  const generatedAt = new Date(rec.generated_at).getTime();
  const now = Date.now();
  if (now - generatedAt > RECOMMENDATION_TTL_MS) {
    return {
      expired: true,
      detail: `Recommendation generated at ${rec.generated_at} (>${Math.round((now - generatedAt) / 60000)}m ago)`,
    };
  }
  return { expired: false };
}

export async function taskPromoteRecommendationCommand(
  options: TaskPromoteRecommendationOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;
  const agentId = options.agent;
  const operatorId = options.by;
  const overrideReason = options.overrideRisk;
  const dryRun = options.dryRun ?? false;

  // ── Input validation ──
  if (!taskNumber) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--task <task-number> is required' },
    };
  }
  if (!agentId) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--agent <agent-id> is required' },
    };
  }
  if (!operatorId) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--by <operator-id> is required' },
    };
  }

  // ── Find task file ──
  let taskFile;
  try {
    taskFile = await findTaskFile(cwd, taskNumber);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  }

  if (!taskFile) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Task not found: ${taskNumber}` },
    };
  }

  // ── Load task state ──
  const { frontMatter } = await readTaskFile(taskFile.path);
  const currentStatus = frontMatter.status;
  const dependsOn = frontMatter.depends_on as number[] | undefined;

  // ── Load roster ──
  let roster;
  try {
    roster = await loadRoster(cwd);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to load agent roster: ${msg}` },
    };
  }

  const agent = roster.agents.find((a) => a.agent_id === agentId);

  // ── Build validation results incrementally ──
  const validationResults: ValidationResult[] = [];
  const now = new Date().toISOString();
  const promotionId = generatePromotionId();
  const recommendationId = options.recommendationId ?? `rec-${Date.now()}`;

  // Check 1: Task exists
  validationResults.push({ check: 'task_exists', passed: true });

  // Check 2: Task status is claimable
  const claimableStatuses = ['opened', 'needs_continuation'];
  const statusClaimable = claimableStatuses.includes(currentStatus as string);
  validationResults.push({
    check: 'task_status',
    passed: statusClaimable,
    detail: statusClaimable ? undefined : `status is ${currentStatus ?? 'missing'}`,
  });

  // Check 3: Dependencies satisfied
  let depsSatisfied = true;
  let depsDetail: string | undefined;
  if (dependsOn && dependsOn.length > 0) {
    const { blockedBy } = await checkDependencies(cwd, dependsOn);
    depsSatisfied = blockedBy.length === 0;
    depsDetail = depsSatisfied ? undefined : `blocked by ${blockedBy.join(', ')}`;
  }
  validationResults.push({
    check: 'dependencies',
    passed: depsSatisfied,
    detail: depsDetail,
  });

  // Check 4: Agent exists
  const agentExists = !!agent;
  validationResults.push({
    check: 'agent_exists',
    passed: agentExists,
    detail: agentExists ? undefined : `agent ${agentId} not found in roster`,
  });

  // Check 5: Agent is assignable
  const assignableStatuses: Array<string | undefined> = ['idle', 'done'];
  const agentAssignable = agentExists && assignableStatuses.includes(agent!.status);
  validationResults.push({
    check: 'agent_available',
    passed: agentAssignable,
    detail: agentExists ? `status is ${agent!.status}` : undefined,
  });

  // Check 6: No active assignment
  const existingAssignment = await loadAssignment(cwd, taskFile.taskId);
  const activeAssignment = existingAssignment ? getActiveAssignment(existingAssignment) : null;
  validationResults.push({
    check: 'no_active_assignment',
    passed: !activeAssignment,
    detail: activeAssignment ? `claimed by ${activeAssignment.agent_id} at ${activeAssignment.claimed_at}` : undefined,
  });

  // ── Recompute recommendation to get current risks ──
  let recomputedRec: TaskRecommendation | null = null;
  let candidate: CandidateAssignment | null = null;
  try {
    recomputedRec = await generateRecommendations({
      cwd,
      taskFilter: taskNumber,
      agentFilter: agentId,
      limit: 1,
    });
    candidate = findCandidateInRecommendation(recomputedRec, taskFile.taskId, agentId);
  } catch {
    // Graceful degradation: if recompute fails, we'll note it
  }

  // Check 7: Write-set risk
  let writeSetBlocking = false;
  let writeSetDetail: string | undefined;
  if (candidate) {
    const writeSetRisks = candidate.risks.filter((r) => r.category === 'write_set');
    writeSetBlocking = isWriteSetRiskBlocking(writeSetRisks);
    if (writeSetBlocking) {
      writeSetDetail = writeSetRisks.map((r) => r.description).join('; ');
    }
  }
  // If override is provided, write-set risk becomes a warning (still recorded as passed=false with override)
  validationResults.push({
    check: 'write_set_risk',
    passed: !writeSetBlocking || !!overrideReason,
    detail: writeSetDetail,
  });

  // Check 8: Recommendation freshness / validity
  let staleDetail: string | undefined;
  let isStale = false;
  if (!candidate) {
    isStale = true;
    staleDetail = 'Task+agent pair is no longer recommended (recompute did not produce this candidate)';
  } else if (recomputedRec) {
    const expiry = isRecommendationExpired(recomputedRec, overrideReason);
    isStale = expiry.expired;
    staleDetail = expiry.detail;
  }
  validationResults.push({
    check: 'recommendation_fresh',
    passed: !isStale || !!overrideReason,
    detail: staleDetail,
  });

  // Check 9: PrincipalRuntime state (advisory, degrades gracefully)
  let principalUnavailable = false;
  let principalDetail: string | undefined;
  if (candidate) {
    const unavailableRisk = candidate.risks.find(
      (r) => r.category === 'availability' && r.severity === 'high',
    );
    if (unavailableRisk) {
      principalUnavailable = true;
      principalDetail = unavailableRisk.description;
    }
  }
  validationResults.push({
    check: 'principal_unavailable',
    passed: !principalUnavailable,
    detail: principalDetail,
  });

  // ── Determine if any hard failures exist ──
  const hardFailures = validationResults.filter((v) => {
    if (v.passed) return false;
    // Override only covers write_set and recommendation_fresh
    if (v.check === 'write_set_risk' && overrideReason) return false;
    if (v.check === 'recommendation_fresh' && overrideReason) return false;
    return true;
  });

  // ── Build snapshot ──
  const snapshot = {
    generated_at: recomputedRec?.generated_at ?? now,
    recommender_id: recomputedRec?.recommender_id ?? 'unknown',
    primary: candidate
      ? {
          task_id: candidate.task_id,
          principal_id: candidate.principal_id,
          score: candidate.score,
          confidence: candidate.confidence,
          rationale: candidate.rationale,
        }
      : null,
  };

  // ── Dry run: preview only ──
  if (dryRun) {
    const result = {
      status: hardFailures.length === 0 ? 'dry_run_ok' : 'dry_run_rejected',
      promotion_id: promotionId,
      recommendation_id: recommendationId,
      task_id: taskFile.taskId,
      agent_id: agentId,
      requested_by: operatorId,
      validation_results: validationResults,
      override_reason: overrideReason ?? null,
      would_mutate: hardFailures.length === 0,
    };

    if (fmt.getFormat() === 'json') {
      return { exitCode: ExitCode.SUCCESS, result };
    }

    fmt.message(`Dry run: ${hardFailures.length === 0 ? 'would execute' : 'would reject'}`, hardFailures.length === 0 ? 'success' : 'warning');
    for (const v of validationResults) {
      const icon = v.passed ? '✓' : v.check === 'write_set_risk' && overrideReason ? '⚠ (overridden)' : '✗';
      fmt.message(`  ${icon} ${v.check}${v.detail ? `: ${v.detail}` : ''}`, v.passed ? 'info' : 'warning');
    }
    return { exitCode: ExitCode.SUCCESS, result };
  }

  // ── If hard failures, write rejected/stale record and fail ──
  if (hardFailures.length > 0) {
    const failureReason = hardFailures.map((f) => `${f.check}: ${f.detail ?? 'failed'}`).join('; ');
    // Status selection: dependencies_unmet → rejected; task_status_changed → stale;
    // recommendation_fresh failure alone → stale; everything else → rejected
    let status: AssignmentPromotionRequest['status'] = 'rejected';
    const hasDepFailure = validationResults.some((v) => v.check === 'dependencies' && !v.passed);
    const hasTaskStatusFailure = validationResults.some((v) => v.check === 'task_status' && !v.passed);
    const hasFreshnessFailure = validationResults.some(
      (v) => v.check === 'recommendation_fresh' && !v.passed && !overrideReason,
    );
    if (hasDepFailure) {
      status = 'rejected';
    } else if (hasTaskStatusFailure) {
      status = 'stale';
    } else if (hasFreshnessFailure) {
      status = 'stale';
    } else {
      status = 'rejected';
    }

    const request: AssignmentPromotionRequest = {
      promotion_id: promotionId,
      recommendation_id: recommendationId,
      task_id: taskFile.taskId,
      task_number: Number.isFinite(Number(taskNumber)) ? Number(taskNumber) : null,
      agent_id: agentId,
      architect_id: snapshot.recommender_id,
      requested_by: operatorId,
      requested_at: now,
      executed_at: null,
      status,
      recommendation_snapshot: snapshot,
      validation_results: validationResults,
      failure_reason: failureReason,
      override_reason: overrideReason,
    };

    await savePromotionRequest(cwd, request);

    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status,
        promotion_id: promotionId,
        error: failureReason,
        validation_results: validationResults,
      },
    };
  }

  // ── All validations passed: delegate to task claim ──
  const claimResult = await taskClaimCommand({
    cwd,
    taskNumber,
    agent: agentId,
    reason: `Promoted by ${operatorId}${overrideReason ? ` (override: ${overrideReason})` : ''}`,
    format: 'json',
    updatePrincipalRuntime: false,
  });

  if (claimResult.exitCode !== 0) {
    // Claim failed — write failed record
    const failureReason = (claimResult.result as { error?: string }).error ?? 'task claim failed';
    const request: AssignmentPromotionRequest = {
      promotion_id: promotionId,
      recommendation_id: recommendationId,
      task_id: taskFile.taskId,
      task_number: Number.isFinite(Number(taskNumber)) ? Number(taskNumber) : null,
      agent_id: agentId,
      architect_id: snapshot.recommender_id,
      requested_by: operatorId,
      requested_at: now,
      executed_at: null,
      status: 'failed',
      recommendation_snapshot: snapshot,
      validation_results: validationResults,
      failure_reason: failureReason,
      override_reason: overrideReason,
    };
    await savePromotionRequest(cwd, request);

    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'failed',
        promotion_id: promotionId,
        error: failureReason,
        validation_results: validationResults,
      },
    };
  }

  // ── Success: write executed record ──
  const assignmentId = (claimResult.result as { task_id?: string; agent_id?: string }).task_id ?? taskFile.taskId;
  const request: AssignmentPromotionRequest = {
    promotion_id: promotionId,
    recommendation_id: recommendationId,
    task_id: taskFile.taskId,
    task_number: Number.isFinite(Number(taskNumber)) ? Number(taskNumber) : null,
    agent_id: agentId,
    architect_id: snapshot.recommender_id,
    requested_by: operatorId,
    requested_at: now,
    executed_at: now,
    status: 'executed',
    recommendation_snapshot: snapshot,
    validation_results: validationResults,
    override_reason: overrideReason,
    assignment_id: assignmentId,
  };
  await savePromotionRequest(cwd, request);

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'executed',
        promotion_id: promotionId,
        recommendation_id: recommendationId,
        task_id: taskFile.taskId,
        agent_id: agentId,
        requested_by: operatorId,
        requested_at: now,
        executed_at: now,
        validation_results: validationResults,
        override_reason: overrideReason ?? null,
        assignment_id: assignmentId,
      },
    };
  }

  fmt.message(`Promoted and claimed task ${taskFile.taskId} for ${agentId}`, 'success');
  if (overrideReason) {
    fmt.message(`Override reason: ${overrideReason}`, 'warning');
  }
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'executed',
      promotion_id: promotionId,
      task_id: taskFile.taskId,
      agent_id: agentId,
    },
  };
}
