/**
 * Construction loop controller command.
 *
 * Read-only plan command. Composes existing operators into a structured
 * operator plan without mutating any state.
 */

import { resolve } from 'node:path';
import {
  loadPolicy,
  defaultPolicy,
  strictPolicy,
  validatePolicyDeep,
  type ConstructionLoopPolicy,
} from '../lib/construction-loop-policy.js';
import { buildPlan, type ConstructionLoopPlan, type PromotionCandidate } from '../lib/construction-loop-plan.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { writeFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { taskPromoteRecommendationCommand } from './task-promote-recommendation.js';
import { loadRoster, findTaskFile, readTaskFile } from '../lib/task-governance.js';
import {
  auditAutoPromotion,
  computeMetrics,
  type AutoPromotionAuditRecord,
} from '../lib/construction-loop-audit.js';

export interface ConstructionLoopPlanOptions {
  policyPath?: string;
  format?: 'json' | 'human' | 'auto';
  maxTasks?: number;
  cwd?: string;
}

function formatPlanHuman(plan: ConstructionLoopPlan): string {
  const lines: string[] = [];

  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║           Construction Loop Operator Plan                    ║');
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');

  // Status
  if (plan.status === 'paused') {
    lines.push('⏸  Loop is paused');
    for (const w of plan.warnings) lines.push(`   ${w}`);
    lines.push('');
    for (const action of plan.suggested_actions) {
      lines.push(`→ ${action.description}`);
      lines.push(`  ${action.command}`);
    }
    return lines.join('\n');
  }

  // Observations
  lines.push('📋 Roster');
  lines.push(`   Agents: ${plan.observations.agent_count} total`);
  lines.push(`   Idle: ${plan.observations.idle_agents.join(', ') || 'none'}`);
  lines.push(`   Working: ${plan.observations.working_agents.join(', ') || 'none'}`);
  lines.push(`   Reviewing: ${plan.observations.reviewing_agents.join(', ') || 'none'}`);
  lines.push(`   Blocked: ${plan.observations.blocked_agents.join(', ') || 'none'}`);
  lines.push(`   Done: ${plan.observations.done_agents.join(', ') || 'none'}`);
  lines.push(`   Active assignments: ${plan.observations.active_assignment_count}`);
  lines.push('');

  if (plan.observations.stale_agents.length > 0) {
    lines.push('⚠️  Stale Agents');
    for (const stale of plan.observations.stale_agents) {
      lines.push(`   ${stale.agent_id}: ${stale.status} on task ${stale.assigned_task}, ${stale.minutes_since_update}m stale`);
      lines.push(`      → ${stale.suggested_action}`);
    }
    lines.push('');
  }

  // Graph
  lines.push('📊 Task Graph');
  lines.push(`   Total: ${plan.graph_summary.total_tasks}`);
  lines.push(`   Open: ${plan.graph_summary.open_tasks}`);
  lines.push(`   Terminal: ${plan.graph_summary.terminal_tasks}`);
  lines.push('');

  // Evidence
  if (plan.evidence_summary.length > 0) {
    lines.push('📝 Open Task Evidence');
    for (const ev of plan.evidence_summary.slice(0, 10)) {
      lines.push(`   ${ev.task_number} (${ev.task_id}): ${ev.status} → ${ev.verdict}`);
    }
    if (plan.evidence_summary.length > 10) {
      lines.push(`   ... and ${plan.evidence_summary.length - 10} more`);
    }
    lines.push('');
  }

  // Chapters
  if (plan.chapter_summary.length > 0) {
    lines.push('📚 Chapters');
    for (const ch of plan.chapter_summary) {
      const marker = ch.state === 'review_ready' ? '✅' : ch.state === 'executing' ? '🔨' : ch.state === 'closing' ? '🔒' : ch.state === 'closed' ? '✔️' : '📋';
      lines.push(`   ${marker} ${ch.range}: ${ch.state} (${ch.tasks_found} tasks, ${ch.blockers_count} blockers)`);
    }
    lines.push('');
  }

  // Recommendations
  if (plan.recommendations?.primary) {
    const rec = plan.recommendations.primary;
    lines.push('⭐ Top Recommendation');
    lines.push(`   ${rec.task_id} → ${rec.principal_id}`);
    lines.push(`   Score: ${rec.score} (${rec.confidence})`);
    lines.push(`   ${rec.rationale}`);
    lines.push('');
  }

  // Promotion candidates
  if (plan.promotion_candidates.length > 0) {
    lines.push('🚀 Promotion Candidates');
    for (const cand of plan.promotion_candidates.slice(0, 5)) {
      if (cand.blocked_by_policy.length > 0) {
        lines.push(`   🚫 ${cand.task_id} → ${cand.agent_id} (score: ${cand.score})`);
        for (const reason of cand.blocked_by_policy) {
          lines.push(`      blocked: ${reason}`);
        }
      } else {
        const dryRun = cand.dry_run_result as { status?: string } | null;
        const dryRunOk = dryRun?.status === 'dry_run_ok' || dryRun?.status === 'executed';
        const icon = dryRunOk ? '✅' : '⚠️';
        lines.push(`   ${icon} ${cand.task_id} → ${cand.agent_id} (score: ${cand.score}, ${cand.confidence})`);
      }
    }
    lines.push('');
  }

  // Suggested actions
  if (plan.suggested_actions.length > 0) {
    lines.push('→ Suggested Actions');
    for (const action of plan.suggested_actions.slice(0, 10)) {
      lines.push(`   • ${action.description}`);
      lines.push(`     ${action.command}`);
    }
    lines.push('');
  }

  // Warnings
  if (plan.warnings.length > 0) {
    lines.push('⚠️  Warnings');
    for (const w of plan.warnings) {
      lines.push(`   ${w}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function constructionLoopPlanCommand(
  options: ConstructionLoopPlanOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  // Load policy (creates default if missing)
  let policy: ConstructionLoopPolicy;
  let createdDefault: boolean;
  try {
    const loaded = await loadPolicy(cwd, options.policyPath);
    policy = loaded.policy;
    createdDefault = loaded.createdDefault;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Policy validation failed: ${msg}` },
    };
  }

  // Override max_tasks_per_cycle if provided
  if (options.maxTasks != null && options.maxTasks >= 1) {
    policy = { ...policy, max_tasks_per_cycle: options.maxTasks };
  }

  // Build plan
  const plan = await buildPlan({ cwd, policy });

  // Attach default-creation flag
  const planWithMeta = { ...plan, policy_created_default: createdDefault };

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: plan.status === 'ok' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result: { status: plan.status, plan: planWithMeta },
    };
  }

  const output = formatPlanHuman(planWithMeta);
  fmt.message(output, 'info');

  return {
    exitCode: plan.status === 'ok' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: { status: plan.status, plan: planWithMeta },
  };
}

// ── Policy subcommands ──

export interface ConstructionLoopPolicyShowOptions {
  policyPath?: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export async function constructionLoopPolicyShowCommand(
  options: ConstructionLoopPolicyShowOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  let policy: ConstructionLoopPolicy;
  try {
    const loaded = await loadPolicy(cwd, options.policyPath);
    policy = loaded.policy;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Policy load failed: ${msg}` },
    };
  }

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'ok', policy },
    };
  }

  const lines: string[] = [];
  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║           Construction Loop Policy                            ║');
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Version:                   ${policy.version}`);
  lines.push(`Autonomy level:            ${policy.allowed_autonomy_level}`);
  lines.push(`Require approval:          ${policy.require_operator_approval_for_promotion}`);
  lines.push(`Dry-run default:           ${policy.dry_run_default}`);
  lines.push(`Auto-review allowed:       ${policy.allow_auto_review}`);
  lines.push(`Max simultaneous:          ${policy.max_simultaneous_assignments}`);
  lines.push(`Max per cycle:             ${policy.max_tasks_per_cycle}`);
  lines.push(`Max per agent/day:         ${policy.max_tasks_per_agent_per_day}`);
  lines.push(`Allowed agents:            ${policy.allowed_agent_ids.join(', ') || '(all)'}`);
  lines.push(`Blocked agents:            ${policy.blocked_agent_ids.join(', ') || '(none)'}`);
  lines.push(`Preferred agents:          ${policy.preferred_agent_ids.join(', ') || '(none)'}`);
  lines.push(`Blocked task ranges:       ${policy.blocked_task_ranges.map((r) => `${r.start}-${r.end}`).join(', ') || '(none)'}`);
  lines.push(`Blocked task numbers:      ${policy.blocked_task_numbers.join(', ') || '(none)'}`);
  lines.push(`Require evidence:          ${policy.require_evidence_before_promotion}`);
  lines.push(`Max write-set risk:        ${policy.max_write_set_risk_severity}`);
  lines.push(`Max recommendation age:    ${policy.max_recommendation_age_minutes} min`);
  lines.push(`Stale agent timeout:       ${policy.stale_agent_timeout_ms} ms`);
  lines.push(`CCC posture path:          ${policy.ccc_posture_path || '(none)'}`);
  lines.push(`CCC influence weight:      ${policy.ccc_influence_weight}`);
  lines.push('');
  lines.push('Review separation rules:');
  lines.push(`  reviewer_cannot_review_own_work: ${policy.review_separation_rules.reviewer_cannot_review_own_work}`);
  lines.push(`  max_reviews_per_reviewer_per_day: ${policy.review_separation_rules.max_reviews_per_reviewer_per_day}`);
  lines.push(`  require_different_agent_for_review: ${policy.review_separation_rules.require_different_agent_for_review}`);
  lines.push('');
  lines.push('Stop conditions:');
  lines.push(`  on_all_agents_busy:      ${policy.stop_conditions.on_all_agents_busy}`);
  lines.push(`  on_no_runnable_tasks:    ${policy.stop_conditions.on_no_runnable_tasks}`);
  lines.push(`  on_cycle_limit_reached:  ${policy.stop_conditions.on_cycle_limit_reached}`);
  lines.push(`  on_policy_violation:     ${policy.stop_conditions.on_policy_violation}`);

  fmt.message(lines.join('\n'), 'info');
  return {
    exitCode: ExitCode.SUCCESS,
    result: { status: 'ok', policy },
  };
}

export interface ConstructionLoopPolicyInitOptions {
  strict?: boolean;
  policyPath?: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export async function constructionLoopPolicyInitCommand(
  options: ConstructionLoopPolicyInitOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const policy = options.strict ? strictPolicy() : defaultPolicy();
  const path = options.policyPath
    ? resolve(cwd, options.policyPath)
    : resolve(cwd, '.ai', 'construction-loop', 'policy.json');

  await mkdir(join(cwd, '.ai', 'construction-loop'), { recursive: true });
  await writeFile(path, JSON.stringify(policy, null, 2) + '\n');

  const mode = options.strict ? 'strict' : 'default';
  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'ok', mode, path, policy },
    };
  }

  fmt.message(`Created ${mode} policy at ${path}`, 'info');
  return {
    exitCode: ExitCode.SUCCESS,
    result: { status: 'ok', mode, path, policy },
  };
}

export interface ConstructionLoopPolicyValidateOptions {
  policyPath?: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export async function constructionLoopPolicyValidateCommand(
  options: ConstructionLoopPolicyValidateOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const path = options.policyPath
    ? resolve(cwd, options.policyPath)
    : resolve(cwd, '.ai', 'construction-loop', 'policy.json');

  let raw: string;
  try {
    const { readFile } = await import('node:fs/promises');
    raw = await readFile(path, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      const msg = `No policy file found at ${path}. Run 'narada construction-loop policy init' to create one.`;
      if (fmt.getFormat() === 'json') {
        return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: msg } };
      }
      fmt.message(msg, 'error');
      return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: msg } };
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const msg = `Invalid JSON at ${path}`;
    if (fmt.getFormat() === 'json') {
      return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: msg } };
    }
    fmt.message(msg, 'error');
    return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: msg } };
  }

  const errors = validatePolicyDeep(parsed);

  if (errors.length === 0) {
    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: { status: 'ok', valid: true, path },
      };
    }
    fmt.message(`Policy at ${path} is valid.`, 'info');
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'ok', valid: true, path },
    };
  }

  const result = {
    status: 'error',
    valid: false,
    path,
    errors: errors.map((e) => ({ path: e.path, message: e.message })),
  };

  if (fmt.getFormat() === 'json') {
    return { exitCode: ExitCode.INVALID_CONFIG, result };
  }

  fmt.message(`Policy at ${path} has ${errors.length} error(s):`, 'error');
  for (const e of errors) {
    fmt.message(`  [${e.path}] ${e.message}`, 'error');
  }
  return { exitCode: ExitCode.INVALID_CONFIG, result };
}

// ── Hard gates ──

export interface GateResult {
  gate: string;
  passed: boolean;
  detail?: string;
}

interface GateContext {
  policy: ConstructionLoopPolicy;
  plan: ConstructionLoopPlan;
  candidate: PromotionCandidate;
  rosterAgent?: { status: string; updated_at: string };
  taskStatus?: string;
  todaysPromotionsForAgent: number;
}

export function checkHardGates(ctx: GateContext): GateResult[] {
  const { policy, plan, candidate, rosterAgent, taskStatus, todaysPromotionsForAgent } = ctx;
  const results: GateResult[] = [];

  // Gate 1: allowed_autonomy_level === 'bounded_auto'
  results.push({
    gate: 'autonomy_level',
    passed: policy.allowed_autonomy_level === 'bounded_auto',
    detail: policy.allowed_autonomy_level !== 'bounded_auto'
      ? `policy level is ${policy.allowed_autonomy_level}`
      : undefined,
  });

  // Gate 2: require_operator_approval_for_promotion === false
  results.push({
    gate: 'operator_approval_disabled',
    passed: policy.require_operator_approval_for_promotion === false,
    detail: policy.require_operator_approval_for_promotion
      ? 'operator approval is required'
      : undefined,
  });

  // Gate 3: All Task 468 validation checks pass (dry_run_ok)
  const dryRun = candidate.dry_run_result as { status?: string } | null;
  const dryRunOk = dryRun?.status === 'dry_run_ok';
  results.push({
    gate: 'task_468_validation',
    passed: dryRunOk,
    detail: dryRunOk ? undefined : `dry-run status: ${dryRun?.status ?? 'unknown'}`,
  });

  // Gate 4: Write-set risk severity ≤ low
  const severityRank: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };
  // Write-set risk info is embedded in the candidate's blocked_by_policy from plan builder,
  // but for hard gate we need independent check. We look for any write-set risk > low.
  // Since the plan builder already computed dry_run_result which includes risk validation,
  // and candidates with dry_run_ok passed all checks, this gate is effectively redundant
  // with gate 3 for high-blocking risks. We still enforce it explicitly.
  const writeSetBlocked = candidate.blocked_by_policy.some((r) => r.includes('write-set'));
  results.push({
    gate: 'write_set_risk_low',
    passed: !writeSetBlocked,
    detail: writeSetBlocked ? 'write-set risk exceeds low' : undefined,
  });

  // Gate 5: Recommendation age ≤ 15 minutes
  const recAge = plan.recommendations
    ? (Date.now() - new Date(plan.recommendations.generated_at).getTime()) / 60000
    : Infinity;
  results.push({
    gate: 'recommendation_freshness',
    passed: recAge <= 15,
    detail: recAge > 15 ? `recommendation is ${Math.round(recAge)}m old` : undefined,
  });

  // Gate 6: Task status is opened (not needs_continuation)
  const isOpened = taskStatus === 'opened';
  results.push({
    gate: 'task_status_opened',
    passed: isOpened,
    detail: taskStatus ? `task status is ${taskStatus}` : 'task status unknown',
  });

  // Gate 7: Agent roster status is idle or done for ≥ 5 minutes
  let agentIdleLongEnough = false;
  let agentIdleDetail: string | undefined;
  if (rosterAgent) {
    const idleStatuses = ['idle', 'done'];
    const isIdleStatus = idleStatuses.includes(rosterAgent.status);
    if (isIdleStatus) {
      const updatedAt = new Date(rosterAgent.updated_at).getTime();
      const minutesInStatus = (Date.now() - updatedAt) / 60000;
      agentIdleLongEnough = minutesInStatus >= 5;
      agentIdleDetail = agentIdleLongEnough
        ? undefined
        : `agent in ${rosterAgent.status} for ${Math.round(minutesInStatus)}m (need 5m)`;
    } else {
      agentIdleDetail = `agent status is ${rosterAgent.status}`;
    }
  } else {
    agentIdleDetail = 'agent not found in roster';
  }
  results.push({
    gate: 'agent_idle_duration',
    passed: agentIdleLongEnough,
    detail: agentIdleDetail,
  });

  // Gate 8: Current active assignments < max_simultaneous_assignments
  const activeAssignments = plan.observations.active_assignment_count;
  results.push({
    gate: 'max_simultaneous',
    passed: activeAssignments < policy.max_simultaneous_assignments,
    detail: activeAssignments >= policy.max_simultaneous_assignments
      ? `active assignments ${activeAssignments} >= max ${policy.max_simultaneous_assignments}`
      : undefined,
  });

  // Gate 9: Task number not blocked
  const taskBlocked = candidate.blocked_by_policy.some(
    (r) => r.includes('blocked') && (r.includes('task') || r.includes('range')),
  );
  results.push({
    gate: 'task_not_blocked',
    passed: !taskBlocked,
    detail: taskBlocked ? 'task is in blocked list or range' : undefined,
  });

  // Gate 10: Agent not blocked
  const agentBlocked = candidate.blocked_by_policy.some(
    (r) => r.includes('blocked') && r.includes('agent'),
  );
  results.push({
    gate: 'agent_not_blocked',
    passed: !agentBlocked,
    detail: agentBlocked ? 'agent is in blocked list' : undefined,
  });

  // Gate 11: Not paused (checked at plan level, but gate it anyway)
  const isPaused = plan.status === 'paused';
  results.push({
    gate: 'not_paused',
    passed: !isPaused,
    detail: isPaused ? 'construction loop is paused' : undefined,
  });

  // Gate 12: Daily task count for agent < max_tasks_per_agent_per_day
  const underDailyLimit = todaysPromotionsForAgent < policy.max_tasks_per_agent_per_day;
  results.push({
    gate: 'daily_agent_limit',
    passed: underDailyLimit,
    detail: underDailyLimit
      ? undefined
      : `agent already promoted ${todaysPromotionsForAgent} times today (max ${policy.max_tasks_per_agent_per_day})`,
  });

  return results;
}

// ── Run command ──

export interface ConstructionLoopRunOptions {
  policyPath?: string;
  maxTasks?: number;
  dryRun?: boolean;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export async function constructionLoopRunCommand(
  options: ConstructionLoopRunOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  // Load and validate policy
  let policy: ConstructionLoopPolicy;
  try {
    const loaded = await loadPolicy(cwd, options.policyPath);
    policy = loaded.policy;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Policy load failed: ${msg}` },
    };
  }

  // Override max_tasks_per_cycle if provided
  if (options.maxTasks != null && options.maxTasks >= 1) {
    policy = { ...policy, max_tasks_per_cycle: options.maxTasks };
  }

  // Build plan
  const plan = await buildPlan({ cwd, policy });

  if (plan.status === 'paused') {
    const record: AutoPromotionAuditRecord = {
      timestamp: new Date().toISOString(),
      promotion_id: `run-${Date.now()}`,
      task_id: 'N/A',
      task_number: null,
      agent_id: 'N/A',
      policy_version: policy.version,
      gate_results: [{ gate: 'not_paused', passed: false, detail: plan.warnings[0] }],
      operator_overrideable: false,
      dry_run: options.dryRun ?? false,
      status: 'paused',
      detail: plan.warnings[0],
    };
    await auditAutoPromotion(cwd, record);

    if (fmt.getFormat() === 'json') {
      return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'paused', warnings: plan.warnings } };
    }
    fmt.message('Construction loop is paused. Run `narada construction-loop resume` to continue.', 'warning');
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'paused', warnings: plan.warnings } };
  }

  // Pre-check: policy must allow bounded_auto
  if (policy.allowed_autonomy_level !== 'bounded_auto') {
    const record: AutoPromotionAuditRecord = {
      timestamp: new Date().toISOString(),
      promotion_id: `run-${Date.now()}`,
      task_id: 'N/A',
      task_number: null,
      agent_id: 'N/A',
      policy_version: policy.version,
      gate_results: [{ gate: 'autonomy_level', passed: false, detail: `level is ${policy.allowed_autonomy_level}` }],
      operator_overrideable: false,
      dry_run: options.dryRun ?? false,
      status: 'policy_error',
      detail: `Autonomy level ${policy.allowed_autonomy_level} does not permit auto-promotion`,
    };
    await auditAutoPromotion(cwd, record);

    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'policy_error', error: record.detail },
      };
    }
    fmt.message(`Auto-promotion blocked: ${record.detail}`, 'error');
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'policy_error', error: record.detail },
    };
  }

  // Load roster for gate checking
  let roster;
  try {
    roster = await loadRoster(cwd);
  } catch {
    roster = { version: 1, updated_at: new Date().toISOString(), agents: [] };
  }

  // Find promotable candidates
  const promotable = plan.promotion_candidates.filter(
    (c) => c.blocked_by_policy.length === 0 && c.task_number != null,
  );

  const promoted: Array<{ task_id: string; agent_id: string; promotion_id: string }> = [];
  const rejected: Array<{ task_id: string; agent_id: string; gate_results: GateResult[] }> = [];
  let promotionsThisRun = 0;
  const maxPromotions = policy.max_tasks_per_cycle;

  for (const candidate of promotable) {
    if (promotionsThisRun >= maxPromotions) break;

    const rosterAgent = roster.agents.find((a) => a.agent_id === candidate.agent_id);

    // Load task status for gate 6
    let taskStatus: string | undefined;
    try {
      const taskFile = await findTaskFile(cwd, String(candidate.task_number));
      if (taskFile) {
        const { frontMatter } = await readTaskFile(taskFile.path);
        taskStatus = frontMatter.status as string;
      }
    } catch {
      // ignore
    }

    // Count today's promotions for this agent (gate 12)
    // We'll compute this on the fly from audit logs
    let todaysPromotionsForAgent = 0;
    try {
      const { readAuditLog } = await import('../lib/construction-loop-audit.js');
      const todayRecords = await readAuditLog(cwd);
      todaysPromotionsForAgent = todayRecords.filter(
        (r) => r.agent_id === candidate.agent_id && r.status === 'promoted',
      ).length;
    } catch {
      // ignore
    }

    const gateResults = checkHardGates({
      policy,
      plan,
      candidate,
      rosterAgent: rosterAgent
        ? { status: rosterAgent.status ?? 'unknown', updated_at: rosterAgent.updated_at ?? new Date().toISOString() }
        : undefined,
      taskStatus,
      todaysPromotionsForAgent,
    });

    const allPassed = gateResults.every((g) => g.passed);
    const promotionId = `promotion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (!allPassed) {
      const record: AutoPromotionAuditRecord = {
        timestamp: new Date().toISOString(),
        promotion_id: promotionId,
        task_id: candidate.task_id,
        task_number: candidate.task_number,
        agent_id: candidate.agent_id,
        policy_version: policy.version,
        gate_results: gateResults,
        operator_overrideable: false,
        dry_run: options.dryRun ?? false,
        status: 'rejected',
        detail: gateResults.filter((g) => !g.passed).map((g) => `${g.gate}: ${g.detail}`).join('; '),
      };
      await auditAutoPromotion(cwd, record);
      rejected.push({ task_id: candidate.task_id, agent_id: candidate.agent_id, gate_results: gateResults });
      continue;
    }

    // All gates passed — promote live (or dry-run preview)
    if (options.dryRun) {
      const record: AutoPromotionAuditRecord = {
        timestamp: new Date().toISOString(),
        promotion_id: promotionId,
        task_id: candidate.task_id,
        task_number: candidate.task_number,
        agent_id: candidate.agent_id,
        policy_version: policy.version,
        gate_results: gateResults,
        operator_overrideable: false,
        dry_run: true,
        status: 'promoted',
        detail: 'dry-run preview — no mutation',
      };
      await auditAutoPromotion(cwd, record);
      promoted.push({ task_id: candidate.task_id, agent_id: candidate.agent_id, promotion_id: promotionId });
      promotionsThisRun++;
      continue;
    }

    // Live promotion
    const promoteResult = await taskPromoteRecommendationCommand({
      cwd,
      taskNumber: String(candidate.task_number),
      agent: candidate.agent_id,
      by: 'construction-loop',
      dryRun: false,
      format: 'json',
    });

    if (promoteResult.exitCode !== 0) {
      const record: AutoPromotionAuditRecord = {
        timestamp: new Date().toISOString(),
        promotion_id: promotionId,
        task_id: candidate.task_id,
        task_number: candidate.task_number,
        agent_id: candidate.agent_id,
        policy_version: policy.version,
        gate_results: gateResults,
        operator_overrideable: false,
        dry_run: false,
        status: 'error',
        detail: (promoteResult.result as { error?: string }).error ?? 'promotion command failed',
      };
      await auditAutoPromotion(cwd, record);
      rejected.push({
        task_id: candidate.task_id,
        agent_id: candidate.agent_id,
        gate_results: [...gateResults, { gate: 'live_promotion', passed: false, detail: record.detail }],
      });
      continue;
    }

    const record: AutoPromotionAuditRecord = {
      timestamp: new Date().toISOString(),
      promotion_id: promotionId,
      task_id: candidate.task_id,
      task_number: candidate.task_number,
      agent_id: candidate.agent_id,
      policy_version: policy.version,
      gate_results: gateResults,
      operator_overrideable: false,
      dry_run: false,
      status: 'promoted',
    };
    await auditAutoPromotion(cwd, record);
    promoted.push({ task_id: candidate.task_id, agent_id: candidate.agent_id, promotion_id: promotionId });
    promotionsThisRun++;
  }

  const result = {
    status: promoted.length > 0 ? 'ok' : rejected.length > 0 ? 'rejected' : 'no_candidates',
    promoted,
    rejected: rejected.map((r) => ({
      task_id: r.task_id,
      agent_id: r.agent_id,
      failed_gates: r.gate_results.filter((g) => !g.passed).map((g) => ({ gate: g.gate, detail: g.detail })),
    })),
    dry_run: options.dryRun ?? false,
  };

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: promoted.length > 0 ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result,
    };
  }

  if (result.status === 'ok') {
    fmt.message(`Auto-promoted ${promoted.length} task(s):`, 'success');
    for (const p of promoted) {
      fmt.message(`  ✓ ${p.task_id} → ${p.agent_id}`, 'success');
    }
  } else if (rejected.length > 0) {
    fmt.message(`${rejected.length} candidate(s) rejected by hard gates:`, 'warning');
    for (const r of rejected) {
      const failed = r.gate_results.filter((g) => !g.passed);
      fmt.message(`  ✗ ${r.task_id} → ${r.agent_id} (${failed.map((g) => g.gate).join(', ')})`, 'warning');
    }
  } else {
    fmt.message('No promotion candidates found.', 'info');
  }

  return {
    exitCode: promoted.length > 0 ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result,
  };
}

// ── Pause / Resume ──

export interface ConstructionLoopPauseOptions {
  reason?: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export async function constructionLoopPauseCommand(
  options: ConstructionLoopPauseOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const pausePath = resolve(cwd, '.ai', 'construction-loop', 'pause');

  await mkdir(resolve(cwd, '.ai', 'construction-loop'), { recursive: true });
  const content = `${options.reason ?? 'operator requested pause'}\npaused_at: ${new Date().toISOString()}\n`;
  await writeFile(pausePath, content);

  if (fmt.getFormat() === 'json') {
    return { exitCode: ExitCode.SUCCESS, result: { status: 'ok', paused: true, reason: options.reason } };
  }
  fmt.message(`Construction loop paused: ${options.reason ?? 'operator requested'}`, 'info');
  return { exitCode: ExitCode.SUCCESS, result: { status: 'ok', paused: true } };
}

export interface ConstructionLoopResumeOptions {
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export async function constructionLoopResumeCommand(
  options: ConstructionLoopResumeOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const pausePath = resolve(cwd, '.ai', 'construction-loop', 'pause');

  try {
    await unlink(pausePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  if (fmt.getFormat() === 'json') {
    return { exitCode: ExitCode.SUCCESS, result: { status: 'ok', resumed: true } };
  }
  fmt.message('Construction loop resumed.', 'info');
  return { exitCode: ExitCode.SUCCESS, result: { status: 'ok', resumed: true } };
}

// ── Metrics ──

export interface ConstructionLoopMetricsOptions {
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export async function constructionLoopMetricsCommand(
  options: ConstructionLoopMetricsOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  const metrics = await computeMetrics(cwd);

  if (fmt.getFormat() === 'json') {
    return { exitCode: ExitCode.SUCCESS, result: { status: 'ok', metrics } };
  }

  const lines: string[] = [];
  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║           Construction Loop Metrics                           ║');
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Auto-promotions total:     ${metrics.auto_promotions_total}`);
  lines.push(`Auto-promotions failed:    ${metrics.auto_promotions_failed}`);
  lines.push(`Operator overrides total:  ${metrics.operator_overrides_total}`);
  lines.push('');
  lines.push('Gate rejections by reason:');
  const reasons = Object.entries(metrics.gate_rejections_by_reason);
  if (reasons.length === 0) {
    lines.push('  (none)');
  } else {
    for (const [reason, count] of reasons) {
      lines.push(`  ${reason}: ${count}`);
    }
  }

  fmt.message(lines.join('\n'), 'info');
  return { exitCode: ExitCode.SUCCESS, result: { status: 'ok', metrics } };
}
