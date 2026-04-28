import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import {
  sitesRelationExplainCommand,
  sitesRelationListCommand,
  sitesRelationRecordCommand,
  sitesRelationValidateCommand,
} from '../../src/commands/sites.js';

function createMockContext(): CommandContext {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  };
  return {
    configPath: '/test/config.json',
    logger: logger as unknown as CommandContext['logger'],
    verbose: false,
  };
}

const tempDirs: string[] = [];

async function tempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'narada-sites-relation-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('sites relation registry', () => {
  it('records, lists, and explains a relation without moving authority', async () => {
    const cwd = await tempRepo();
    const record = await sitesRelationRecordCommand({
      cwd,
      kind: 'absorbed',
      sourceSite: 'staccato-service',
      targetSite: 'narada-proper',
      admittedMaterial: 'docs,cli-pattern',
      evidenceRef: 'inbox:env_c929',
      lineageEventRef: 'lineage:site.absorbed:001',
      by: 'architect',
      format: 'json',
    }, createMockContext());

    expect(record.exitCode).toBe(ExitCode.SUCCESS);
    const relation = (record.result as { relation: { relation_id: string; authority_effect: string }; authority_moved: boolean; config_mutated: boolean }).relation;
    expect((record.result as { authority_moved: boolean }).authority_moved).toBe(false);
    expect((record.result as { config_mutated: boolean }).config_mutated).toBe(false);
    expect(relation.authority_effect).toBe('admission_without_implicit_ownership');
    expect(existsSync(join(cwd, '.ai', 'site-relation-registry.json'))).toBe(true);

    const list = await sitesRelationListCommand({
      cwd,
      kind: 'absorbed',
      format: 'json',
    }, createMockContext());
    expect(list.exitCode).toBe(ExitCode.SUCCESS);
    expect((list.result as { count: number }).count).toBe(1);

    const explain = await sitesRelationExplainCommand({
      cwd,
      relationId: relation.relation_id,
      format: 'json',
    }, createMockContext());
    expect(explain.exitCode).toBe(ExitCode.SUCCESS);
    expect((explain.result as { authority_moving: boolean }).authority_moving).toBe(false);
    expect((explain.result as { evidence_only: boolean }).evidence_only).toBe(true);
  });

  it('fails validation while required reciprocal relation is missing and passes after it is recorded', async () => {
    const cwd = await tempRepo();
    const forward = await sitesRelationRecordCommand({
      cwd,
      kind: 'absorbed',
      sourceSite: 'staccato-service',
      targetSite: 'narada-proper',
      reciprocalRequired: true,
      by: 'architect',
      format: 'json',
    }, createMockContext());
    expect(forward.exitCode).toBe(ExitCode.SUCCESS);

    const invalid = await sitesRelationValidateCommand({
      cwd,
      format: 'json',
    }, createMockContext());
    expect(invalid.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((invalid.result as { issues: Array<{ code: string }> }).issues.some((issue) => issue.code === 'missing_required_reciprocal')).toBe(true);

    const reverse = await sitesRelationRecordCommand({
      cwd,
      kind: 'absorbed_by',
      sourceSite: 'narada-proper',
      targetSite: 'staccato-service',
      by: 'architect',
      format: 'json',
    }, createMockContext());
    expect(reverse.exitCode).toBe(ExitCode.SUCCESS);

    const valid = await sitesRelationValidateCommand({
      cwd,
      format: 'json',
    }, createMockContext());
    expect(valid.exitCode).toBe(ExitCode.SUCCESS);
    expect((valid.result as { valid: boolean }).valid).toBe(true);
  });

  it('rejects unsupported relation kinds', async () => {
    const cwd = await tempRepo();
    const record = await sitesRelationRecordCommand({
      cwd,
      kind: 'owns',
      sourceSite: 'a',
      targetSite: 'b',
      by: 'architect',
      format: 'json',
    }, createMockContext());

    expect(record.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((record.result as { error: string }).error).toContain('Unsupported relation kind');
  });
});
