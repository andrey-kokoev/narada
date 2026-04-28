import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  sitesBootstrapProjectCommand,
  sitesDoctorCommand,
} from '../../src/commands/sites.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';

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

async function tempWorkspace(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  await mkdir(join(dir, '.git'));
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('sitesBootstrapProjectCommand', () => {
  it('dry-runs a contained project Site without writing', async () => {
    const workspace = await tempWorkspace('narada-project-dry-');
    const result = await sitesBootstrapProjectCommand({
      workspace,
      siteId: 'smart-scheduling',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as {
      status: string;
      mutation_performed: boolean;
      site_kind?: string;
      site_root: string;
      sync_posture: string;
      config: { site_kind: string; sync: { posture: string } };
    };
    expect(data.status).toBe('dry_run');
    expect(data.mutation_performed).toBe(false);
    expect(data.site_root).toBe(join(workspace, '.narada'));
    expect(data.sync_posture).toBe('git_backed_project_repo');
    expect(data.config.site_kind).toBe('project');
    expect(data.config.sync.posture).toBe('git_backed_project_repo');
    expect(existsSync(join(workspace, '.narada'))).toBe(false);
  });

  it('executes project Site bootstrap and passes project doctor', async () => {
    const workspace = await tempWorkspace('narada-project-exec-');
    const result = await sitesBootstrapProjectCommand({
      workspace,
      siteId: 'smart-scheduling',
      execute: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(existsSync(join(workspace, '.narada', 'config.json'))).toBe(true);
    const agents = await readFile(join(workspace, '.narada', 'AGENTS.md'), 'utf8');
    expect(agents).toContain('You are `architect`.');
    expect(agents).toContain('The human is `Operator`.');
    expect(agents).toContain('This Site is governed by Narada law.');
    expect(agents).toContain('project-local governance');
    expect(agents).toContain('Treat this file as the Site-local execution contract for fresh architects.');
    expect(agents).toContain('Project code and artifacts outside `site_root` are not Narada knowledge');
    const config = JSON.parse(await readFile(join(workspace, '.narada', 'config.json'), 'utf8')) as {
      governance: {
        governing_law_source: { source_site_id: string; mode: string };
        authority_locus: { locus_kind: string; mutation_policy: string };
        mutation_evidence_locus: { kind: string; path: string };
        federation_policy: { posture: string; admission: string };
      };
    };
    expect(config.governance.governing_law_source.source_site_id).toBe('narada-proper');
    expect(config.governance.governing_law_source.mode).toBe('inherited');
    expect(config.governance.authority_locus.locus_kind).toBe('project');
    expect(config.governance.authority_locus.mutation_policy).toBe('direct_only_at_locus');
    expect(config.governance.mutation_evidence_locus.kind).toBe('git');
    expect(config.governance.mutation_evidence_locus.path).toBe(join(workspace, '.narada'));
    expect(config.governance.federation_policy.posture).toBe('receive_only');
    expect(config.governance.federation_policy.admission).toBe('local_admission_required');

    const doctor = await sitesDoctorCommand('smart-scheduling', {
      kind: 'project',
      root: workspace,
      format: 'json',
    }, createMockContext());
    expect(doctor.exitCode).toBe(ExitCode.SUCCESS);
    const data = doctor.result as { status: string; checks: Array<{ name: string; status: string }> };
    expect(data.status).toBe('passed');
    expect(data.checks.find((check) => check.name === 'site_kind')?.status).toBe('pass');
    expect(data.checks.find((check) => check.name === 'project_sync_posture')?.status).toBe('pass');
  });

  it('refuses non-project sync posture', async () => {
    const workspace = await tempWorkspace('narada-project-bad-');
    const result = await sitesBootstrapProjectCommand({
      workspace,
      siteId: 'smart-scheduling',
      sync: 'local_non_git',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((result.result as { error: string }).error).toContain('Unsupported project sync posture');
  });
});
