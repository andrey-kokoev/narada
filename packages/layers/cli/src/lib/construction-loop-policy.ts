/**
 * Construction loop policy loader, validator, and defaults.
 *
 * Operator-owned configuration for the construction loop controller.
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type AutonomyLevel = 'inspect' | 'recommend' | 'plan' | 'bounded_auto' | 'full_auto';

export interface ConstructionLoopPolicy {
  version: number;
  allowed_autonomy_level: AutonomyLevel;
  require_operator_approval_for_promotion: boolean;
  dry_run_default: boolean;
  allow_auto_review: boolean;
  max_simultaneous_assignments: number;
  max_tasks_per_cycle: number;
  max_tasks_per_agent_per_day: number;
  allowed_agent_ids: string[];
  blocked_agent_ids: string[];
  preferred_agent_ids: string[];
  blocked_task_ranges: Array<{ start: number; end: number }>;
  blocked_task_numbers: number[];
  require_evidence_before_promotion: boolean;
  review_separation_rules: {
    reviewer_cannot_review_own_work: boolean;
    max_reviews_per_reviewer_per_day: number;
    require_different_agent_for_review: boolean;
  };
  max_write_set_risk_severity: 'none' | 'low' | 'medium' | 'high';
  max_recommendation_age_minutes: number;
  stale_agent_timeout_ms: number;
  stop_conditions: {
    on_all_agents_busy: 'wait' | 'recommend_anyway' | 'stop';
    on_no_runnable_tasks: 'suggest_closure' | 'suggest_new_tasks' | 'stop';
    on_cycle_limit_reached: 'stop' | 'queue_for_next_cycle';
    on_policy_violation: 'warn_and_continue' | 'stop' | 'escalate';
  };
  ccc_posture_path?: string;
  ccc_influence_weight: number;
}

export interface PolicyValidationError {
  path: string;
  message: string;
}

const POLICY_DIR = '.ai/construction-loop';
const DEFAULT_POLICY_FILE = 'policy.json';

export function defaultPolicy(): ConstructionLoopPolicy {
  return {
    version: 1,
    allowed_autonomy_level: 'plan',
    require_operator_approval_for_promotion: true,
    dry_run_default: true,
    allow_auto_review: false,
    max_simultaneous_assignments: 2,
    max_tasks_per_cycle: 1,
    max_tasks_per_agent_per_day: 3,
    allowed_agent_ids: [],
    blocked_agent_ids: [],
    preferred_agent_ids: [],
    blocked_task_ranges: [],
    blocked_task_numbers: [],
    require_evidence_before_promotion: false,
    review_separation_rules: {
      reviewer_cannot_review_own_work: true,
      max_reviews_per_reviewer_per_day: 3,
      require_different_agent_for_review: true,
    },
    max_write_set_risk_severity: 'medium',
    max_recommendation_age_minutes: 60,
    stale_agent_timeout_ms: 30 * 60 * 1000,
    stop_conditions: {
      on_all_agents_busy: 'wait',
      on_no_runnable_tasks: 'suggest_closure',
      on_cycle_limit_reached: 'stop',
      on_policy_violation: 'stop',
    },
    ccc_posture_path: '.ai/ccc/posture.json',
    ccc_influence_weight: 0.3,
  };
}

export function validatePolicyDeep(policy: unknown): PolicyValidationError[] {
  const errors: PolicyValidationError[] = [];

  if (typeof policy !== 'object' || policy === null) {
    return [{ path: '', message: 'Policy must be an object' }];
  }

  const p = policy as Record<string, unknown>;

  // version
  if (typeof p.version !== 'number') {
    errors.push({ path: 'version', message: 'version must be a number' });
  }

  // allowed_autonomy_level
  const validLevels: AutonomyLevel[] = ['inspect', 'recommend', 'plan', 'bounded_auto', 'full_auto'];
  if (!validLevels.includes(p.allowed_autonomy_level as AutonomyLevel)) {
    errors.push({ path: 'allowed_autonomy_level', message: `must be one of ${validLevels.join(', ')}` });
  }
  if (p.allowed_autonomy_level === 'full_auto') {
    errors.push({ path: 'allowed_autonomy_level', message: 'full_auto is not yet supported in v0' });
  }

  // booleans
  for (const key of ['require_operator_approval_for_promotion', 'dry_run_default', 'allow_auto_review', 'require_evidence_before_promotion']) {
    if (typeof p[key] !== 'boolean') {
      errors.push({ path: key, message: `${key} must be a boolean` });
    }
  }

  // numbers
  for (const [key, min] of [
    ['max_simultaneous_assignments', 1],
    ['max_tasks_per_cycle', 1],
    ['max_tasks_per_agent_per_day', 1],
    ['max_recommendation_age_minutes', 1],
    ['stale_agent_timeout_ms', 60000],
  ] as const) {
    if (typeof p[key] !== 'number' || (p[key] as number) < min) {
      errors.push({ path: key, message: `${key} must be a number >= ${min}` });
    }
  }

  // ccc_influence_weight
  const cccWeight = p.ccc_influence_weight;
  if (typeof cccWeight !== 'number' || cccWeight < 0 || cccWeight > 1) {
    errors.push({ path: 'ccc_influence_weight', message: 'ccc_influence_weight must be a number between 0.0 and 1.0' });
  }

  // string arrays
  for (const key of ['allowed_agent_ids', 'blocked_agent_ids', 'preferred_agent_ids']) {
    if (!Array.isArray(p[key]) || !(p[key] as unknown[]).every((v) => typeof v === 'string')) {
      errors.push({ path: key, message: `${key} must be an array of strings` });
    }
  }

  // blocked_task_ranges
  const ranges = p.blocked_task_ranges;
  if (!Array.isArray(ranges)) {
    errors.push({ path: 'blocked_task_ranges', message: 'must be an array' });
  } else {
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i] as unknown;
      if (typeof r !== 'object' || r === null) {
        errors.push({ path: `blocked_task_ranges[${i}]`, message: 'each range must be an object with start and end' });
        continue;
      }
      const rv = r as Record<string, unknown>;
      if (typeof rv.start !== 'number' || typeof rv.end !== 'number' || rv.start > rv.end) {
        errors.push({ path: `blocked_task_ranges[${i}]`, message: 'range must have numeric start <= end' });
      }
    }
    // Overlap check
    const sorted = [...ranges].sort((a, b) => (a as { start: number }).start - (b as { start: number }).start);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1] as { start: number; end: number };
      const curr = sorted[i] as { start: number; end: number };
      if (curr.start <= prev.end) {
        errors.push({ path: `blocked_task_ranges`, message: `ranges ${prev.start}-${prev.end} and ${curr.start}-${curr.end} overlap` });
      }
    }
  }

  // blocked_task_numbers
  if (!Array.isArray(p.blocked_task_numbers) || !(p.blocked_task_numbers as unknown[]).every((v) => typeof v === 'number')) {
    errors.push({ path: 'blocked_task_numbers', message: 'must be an array of numbers' });
  }

  // review_separation_rules
  const rs = p.review_separation_rules;
  if (typeof rs !== 'object' || rs === null) {
    errors.push({ path: 'review_separation_rules', message: 'must be an object' });
  } else {
    const rsv = rs as Record<string, unknown>;
    if (typeof rsv.reviewer_cannot_review_own_work !== 'boolean') {
      errors.push({ path: 'review_separation_rules.reviewer_cannot_review_own_work', message: 'must be a boolean' });
    }
    if (typeof rsv.max_reviews_per_reviewer_per_day !== 'number' || (rsv.max_reviews_per_reviewer_per_day as number) < 1) {
      errors.push({ path: 'review_separation_rules.max_reviews_per_reviewer_per_day', message: 'must be a number >= 1' });
    }
    if (typeof rsv.require_different_agent_for_review !== 'boolean') {
      errors.push({ path: 'review_separation_rules.require_different_agent_for_review', message: 'must be a boolean' });
    }
  }

  // max_write_set_risk_severity
  const validSeverities = ['none', 'low', 'medium', 'high'];
  if (!validSeverities.includes(p.max_write_set_risk_severity as string)) {
    errors.push({ path: 'max_write_set_risk_severity', message: `must be one of ${validSeverities.join(', ')}` });
  }

  // stop_conditions
  const sc = p.stop_conditions;
  if (typeof sc !== 'object' || sc === null) {
    errors.push({ path: 'stop_conditions', message: 'must be an object' });
  } else {
    const scv = sc as Record<string, unknown>;
    const scFields: Array<[string, string[]]> = [
      ['on_all_agents_busy', ['wait', 'recommend_anyway', 'stop']],
      ['on_no_runnable_tasks', ['suggest_closure', 'suggest_new_tasks', 'stop']],
      ['on_cycle_limit_reached', ['stop', 'queue_for_next_cycle']],
      ['on_policy_violation', ['warn_and_continue', 'stop', 'escalate']],
    ];
    for (const [field, valid] of scFields) {
      if (!valid.includes(scv[field] as string)) {
        errors.push({ path: `stop_conditions.${field}`, message: `must be one of ${valid.join(', ')}` });
      }
    }
  }

  // Cross-field: blocked_agent_ids and preferred_agent_ids should be disjoint
  const blocked = new Set((p.blocked_agent_ids as string[]) ?? []);
  const preferred = (p.preferred_agent_ids as string[]) ?? [];
  for (const id of preferred) {
    if (blocked.has(id)) {
      errors.push({ path: 'preferred_agent_ids', message: `agent ${id} is also in blocked_agent_ids` });
    }
  }

  // Cross-field: max_simultaneous_assignments >= max_tasks_per_cycle
  if (
    typeof p.max_simultaneous_assignments === 'number' &&
    typeof p.max_tasks_per_cycle === 'number' &&
    p.max_simultaneous_assignments < p.max_tasks_per_cycle
  ) {
    errors.push({ path: 'max_simultaneous_assignments', message: 'must be >= max_tasks_per_cycle' });
  }

  return errors;
}

export function validatePolicy(policy: unknown): PolicyValidationError[] {
  return validatePolicyDeep(policy);
}

export function strictPolicy(): ConstructionLoopPolicy {
  return {
    version: 1,
    allowed_autonomy_level: 'recommend',
    require_operator_approval_for_promotion: true,
    dry_run_default: true,
    allow_auto_review: false,
    max_simultaneous_assignments: 1,
    max_tasks_per_cycle: 1,
    max_tasks_per_agent_per_day: 2,
    allowed_agent_ids: [],
    blocked_agent_ids: [],
    preferred_agent_ids: [],
    blocked_task_ranges: [],
    blocked_task_numbers: [],
    require_evidence_before_promotion: true,
    review_separation_rules: {
      reviewer_cannot_review_own_work: true,
      max_reviews_per_reviewer_per_day: 2,
      require_different_agent_for_review: true,
    },
    max_write_set_risk_severity: 'low',
    max_recommendation_age_minutes: 30,
    stale_agent_timeout_ms: 30 * 60 * 1000,
    stop_conditions: {
      on_all_agents_busy: 'stop',
      on_no_runnable_tasks: 'stop',
      on_cycle_limit_reached: 'stop',
      on_policy_violation: 'escalate',
    },
    ccc_posture_path: '.ai/ccc/posture.json',
    ccc_influence_weight: 0.5,
  };
}

export function mergePolicy(
  base: ConstructionLoopPolicy,
  overrides: Partial<ConstructionLoopPolicy>,
): ConstructionLoopPolicy {
  const merged: ConstructionLoopPolicy = { ...base };

  for (const key of Object.keys(overrides) as Array<keyof ConstructionLoopPolicy>) {
    const value = overrides[key];
    if (value === undefined) continue;

    if (key === 'review_separation_rules' && typeof value === 'object' && value !== null) {
      merged.review_separation_rules = {
        ...merged.review_separation_rules,
        ...(value as ConstructionLoopPolicy['review_separation_rules']),
      };
    } else if (key === 'stop_conditions' && typeof value === 'object' && value !== null) {
      merged.stop_conditions = {
        ...merged.stop_conditions,
        ...(value as ConstructionLoopPolicy['stop_conditions']),
      };
    } else if (key === 'blocked_task_ranges' && Array.isArray(value)) {
      merged.blocked_task_ranges = [...value] as ConstructionLoopPolicy['blocked_task_ranges'];
    } else if (key === 'blocked_task_numbers' && Array.isArray(value)) {
      merged.blocked_task_numbers = [...value] as ConstructionLoopPolicy['blocked_task_numbers'];
    } else if (
      (key === 'allowed_agent_ids' || key === 'blocked_agent_ids' || key === 'preferred_agent_ids') &&
      Array.isArray(value)
    ) {
      merged[key] = [...value] as string[];
    } else {
      // @ts-expect-error — safe assignment for scalar fields
      merged[key] = value;
    }
  }

  return merged;
}

export async function loadPolicy(
  cwd: string,
  policyPath?: string,
): Promise<{ policy: ConstructionLoopPolicy; createdDefault: boolean }> {
  const resolvedPath = policyPath
    ? resolve(cwd, policyPath)
    : resolve(cwd, POLICY_DIR, DEFAULT_POLICY_FILE);

  try {
    const raw = await readFile(resolvedPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const errors = validatePolicy(parsed);
    if (errors.length > 0) {
      throw new Error(`Invalid policy at ${resolvedPath}:\n${errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`);
    }
    return { policy: parsed as ConstructionLoopPolicy, createdDefault: false };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // Create default policy
      const policy = defaultPolicy();
      const dir = join(cwd, POLICY_DIR);
      await mkdir(dir, { recursive: true });
      await writeFile(resolvedPath, JSON.stringify(policy, null, 2) + '\n');
      return { policy, createdDefault: true };
    }
    throw err;
  }
}
