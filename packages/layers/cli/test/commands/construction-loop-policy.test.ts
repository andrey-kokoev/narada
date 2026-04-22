import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  constructionLoopPolicyShowCommand,
  constructionLoopPolicyInitCommand,
  constructionLoopPolicyValidateCommand,
} from '../../src/commands/construction-loop.js';
import {
  defaultPolicy,
  strictPolicy,
  validatePolicyDeep,
  mergePolicy,
} from '../../src/lib/construction-loop-policy.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('construction loop policy library', () => {
  it('defaultPolicy returns valid policy', () => {
    const policy = defaultPolicy();
    const errors = validatePolicyDeep(policy);
    expect(errors).toHaveLength(0);
  });

  it('strictPolicy returns valid policy', () => {
    const policy = strictPolicy();
    const errors = validatePolicyDeep(policy);
    expect(errors).toHaveLength(0);
  });

  it('strictPolicy is stricter than default', () => {
    const def = defaultPolicy();
    const strict = strictPolicy();
    expect(strict.allowed_autonomy_level).toBe('recommend');
    expect(def.allowed_autonomy_level).toBe('plan');
    expect(strict.max_simultaneous_assignments).toBeLessThanOrEqual(def.max_simultaneous_assignments);
    expect(strict.max_tasks_per_agent_per_day).toBeLessThanOrEqual(def.max_tasks_per_agent_per_day);
    expect(strict.max_write_set_risk_severity).toBe('low');
    expect(def.max_write_set_risk_severity).toBe('medium');
  });

  it('validatePolicyDeep rejects invalid version', () => {
    const errors = validatePolicyDeep({ version: 'x' });
    expect(errors.some((e) => e.path === 'version')).toBe(true);
  });

  it('validatePolicyDeep rejects invalid autonomy level', () => {
    const errors = validatePolicyDeep({ ...defaultPolicy(), allowed_autonomy_level: 'full_auto' });
    expect(errors.some((e) => e.path === 'allowed_autonomy_level' && e.message.includes('not yet supported'))).toBe(true);
  });

  it('validatePolicyDeep rejects ccc_influence_weight out of range', () => {
    const errors = validatePolicyDeep({ ...defaultPolicy(), ccc_influence_weight: 1.5 });
    expect(errors.some((e) => e.path === 'ccc_influence_weight')).toBe(true);
  });

  it('validatePolicyDeep rejects stale_agent_timeout_ms too low', () => {
    const errors = validatePolicyDeep({ ...defaultPolicy(), stale_agent_timeout_ms: 1000 });
    expect(errors.some((e) => e.path === 'stale_agent_timeout_ms')).toBe(true);
  });

  it('validatePolicyDeep rejects overlapping blocked_task_ranges', () => {
    const errors = validatePolicyDeep({
      ...defaultPolicy(),
      blocked_task_ranges: [
        { start: 10, end: 20 },
        { start: 15, end: 25 },
      ],
    });
    expect(errors.some((e) => e.path === 'blocked_task_ranges' && e.message.includes('overlap'))).toBe(true);
  });

  it('validatePolicyDeep rejects blocked and preferred agent overlap', () => {
    const errors = validatePolicyDeep({
      ...defaultPolicy(),
      blocked_agent_ids: ['a1'],
      preferred_agent_ids: ['a1'],
    });
    expect(errors.some((e) => e.path === 'preferred_agent_ids' && e.message.includes('blocked'))).toBe(true);
  });

  it('validatePolicyDeep rejects max_simultaneous_assignments < max_tasks_per_cycle', () => {
    const errors = validatePolicyDeep({
      ...defaultPolicy(),
      max_simultaneous_assignments: 1,
      max_tasks_per_cycle: 3,
    });
    expect(errors.some((e) => e.path === 'max_simultaneous_assignments')).toBe(true);
  });

  it('validatePolicyDeep returns all errors, not just first', () => {
    const errors = validatePolicyDeep({
      ...defaultPolicy(),
      version: 'bad',
      ccc_influence_weight: -1,
      max_simultaneous_assignments: 0,
    });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it('mergePolicy applies scalar overrides', () => {
    const base = defaultPolicy();
    const merged = mergePolicy(base, { max_tasks_per_cycle: 5 });
    expect(merged.max_tasks_per_cycle).toBe(5);
    expect(merged.max_simultaneous_assignments).toBe(base.max_simultaneous_assignments);
  });

  it('mergePolicy deep-merges review_separation_rules', () => {
    const base = defaultPolicy();
    const merged = mergePolicy(base, {
      review_separation_rules: { max_reviews_per_reviewer_per_day: 99 },
    });
    expect(merged.review_separation_rules.max_reviews_per_reviewer_per_day).toBe(99);
    expect(merged.review_separation_rules.reviewer_cannot_review_own_work).toBe(
      base.review_separation_rules.reviewer_cannot_review_own_work,
    );
  });

  it('mergePolicy deep-merges stop_conditions', () => {
    const base = defaultPolicy();
    const merged = mergePolicy(base, {
      stop_conditions: { on_all_agents_busy: 'stop' },
    });
    expect(merged.stop_conditions.on_all_agents_busy).toBe('stop');
    expect(merged.stop_conditions.on_no_runnable_tasks).toBe(base.stop_conditions.on_no_runnable_tasks);
  });

  it('mergePolicy replaces arrays', () => {
    const base = defaultPolicy();
    const merged = mergePolicy(base, { blocked_agent_ids: ['x'] });
    expect(merged.blocked_agent_ids).toEqual(['x']);
  });

  it('mergePolicy ignores undefined overrides', () => {
    const base = defaultPolicy();
    const merged = mergePolicy(base, { max_tasks_per_cycle: undefined });
    expect(merged.max_tasks_per_cycle).toBe(base.max_tasks_per_cycle);
  });
});

describe('construction loop policy CLI', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-policy-'));
    mkdirSync(join(tempDir, '.ai', 'construction-loop'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('show returns policy as json', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'construction-loop', 'policy.json'),
      JSON.stringify(defaultPolicy()),
    );

    const result = await constructionLoopPolicyShowCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { status: string; policy: { version: number } };
    expect(r.status).toBe('ok');
    expect(r.policy.version).toBe(1);
  });

  it('show creates default if missing', async () => {
    const result = await constructionLoopPolicyShowCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { status: string; policy: { version: number } };
    expect(r.policy.version).toBe(1);
    expect(readFileSync(join(tempDir, '.ai', 'construction-loop', 'policy.json'), 'utf8')).toContain('"version": 1');
  });

  it('init creates default policy', async () => {
    const result = await constructionLoopPolicyInitCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { status: string; mode: string };
    expect(r.status).toBe('ok');
    expect(r.mode).toBe('default');

    const content = readFileSync(join(tempDir, '.ai', 'construction-loop', 'policy.json'), 'utf8');
    expect(JSON.parse(content).allowed_autonomy_level).toBe('plan');
  });

  it('init --strict creates strict policy', async () => {
    const result = await constructionLoopPolicyInitCommand({ cwd: tempDir, strict: true, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { status: string; mode: string };
    expect(r.mode).toBe('strict');

    const content = readFileSync(join(tempDir, '.ai', 'construction-loop', 'policy.json'), 'utf8');
    const policy = JSON.parse(content);
    expect(policy.allowed_autonomy_level).toBe('recommend');
    expect(policy.max_write_set_risk_severity).toBe('low');
  });

  it('validate reports valid policy', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'construction-loop', 'policy.json'),
      JSON.stringify(defaultPolicy()),
    );

    const result = await constructionLoopPolicyValidateCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { status: string; valid: boolean };
    expect(r.valid).toBe(true);
  });

  it('validate reports all errors for invalid policy', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'construction-loop', 'policy.json'),
      JSON.stringify({
        ...defaultPolicy(),
        version: 'bad',
        ccc_influence_weight: -1,
        max_simultaneous_assignments: 0,
        blocked_task_ranges: [
          { start: 10, end: 20 },
          { start: 15, end: 25 },
        ],
      }),
    );

    const result = await constructionLoopPolicyValidateCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    const r = result.result as { valid: boolean; errors: Array<{ path: string; message: string }> };
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(4);
    expect(r.errors.some((e) => e.path === 'version')).toBe(true);
    expect(r.errors.some((e) => e.path === 'ccc_influence_weight')).toBe(true);
    expect(r.errors.some((e) => e.path === 'max_simultaneous_assignments')).toBe(true);
    expect(r.errors.some((e) => e.path === 'blocked_task_ranges')).toBe(true);
  });

  it('validate fails when policy file is missing', async () => {
    const result = await constructionLoopPolicyValidateCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    const r = result.result as { status: string; error: string };
    expect(r.status).toBe('error');
    expect(r.error).toContain('No policy file found');
  });

  it('validate fails for invalid JSON', async () => {
    writeFileSync(join(tempDir, '.ai', 'construction-loop', 'policy.json'), 'not json');
    const result = await constructionLoopPolicyValidateCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    const r = result.result as { status: string; error: string };
    expect(r.error).toContain('Invalid JSON');
  });
});
