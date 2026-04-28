import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import {
  sitesLifecycleExecuteAbsorbCommand,
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
  const dir = await mkdtemp(join(tmpdir(), 'narada-sites-absorb-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('sites lifecycle execute absorb', () => {
  it('dry-runs an absorb plan without writing artifacts', async () => {
    const cwd = await tempRepo();
    const result = await sitesLifecycleExecuteAbsorbCommand({
      cwd,
      sourceSite: 'staccato-data',
      targetSite: 'staccato-client-service',
      admittedMaterial: 'kb,runbook',
      evidenceRef: 'inbox:env_197',
      by: 'architect',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { status: string; mutation_performed: boolean; plan_path: string; authority_moved: boolean; config_mutated: boolean };
    expect(data.status).toBe('dry_run');
    expect(data.mutation_performed).toBe(false);
    expect(data.authority_moved).toBe(false);
    expect(data.config_mutated).toBe(false);
    expect(existsSync(data.plan_path)).toBe(false);
  });

  it('executes absorb v0 with plan, lineage, and reciprocal relation read-back', async () => {
    const cwd = await tempRepo();
    const result = await sitesLifecycleExecuteAbsorbCommand({
      cwd,
      sourceSite: 'staccato-data',
      targetSite: 'staccato-client-service',
      admittedMaterial: 'kb,runbook',
      evidenceRef: 'inbox:env_197,task:1023',
      retainedAuthority: 'raw_data,elt_runtime',
      by: 'architect',
      execute: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as {
      mutation_performed: boolean;
      read_back_confirmed: boolean;
      plan_path: string;
      lineage_event_path: string;
      relation_ids: string[];
    };
    expect(data.mutation_performed).toBe(true);
    expect(data.read_back_confirmed).toBe(true);
    expect(existsSync(data.plan_path)).toBe(true);
    expect(existsSync(data.lineage_event_path)).toBe(true);
    expect(data.relation_ids).toHaveLength(2);

    const validation = await sitesRelationValidateCommand({ cwd, format: 'json' }, createMockContext());
    expect(validation.exitCode).toBe(ExitCode.SUCCESS);
  });

  it('refuses unsupported absorb authority modes', async () => {
    const cwd = await tempRepo();
    const result = await sitesLifecycleExecuteAbsorbCommand({
      cwd,
      sourceSite: 'a',
      targetSite: 'b',
      authorityMode: 'authority_migration',
      by: 'architect',
      execute: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((result.result as { error: string }).error).toContain('only supports authority mode admission_review');
  });
});
