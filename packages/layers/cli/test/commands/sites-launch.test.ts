import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExitCode } from '../../src/lib/exit-codes.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { sitesLaunchCommand } from '../../src/commands/sites-launch.js';

const getManagedSite = vi.fn();
const runSiteCliCommand = vi.fn();
const runSiteCliCommandAsync = vi.fn();
const getSchedulerSiteDaemonStatus = vi.fn();
const loadSiteMcpFabric = vi.fn();

vi.mock('@narada2/windows-site', () => ({
  resolveRegistryDbPathByLocus: vi.fn(() => '/tmp/test-registry.db'),
  openRegistryDb: vi.fn(async () => ({})),
  SiteRegistry: vi.fn(() => ({
    getManagedSite,
    close: vi.fn(),
  })),
}));

vi.mock('../../src/lib/launcher-runtime-site-command.js', () => ({
  runSiteCliCommand: (...args: unknown[]) => runSiteCliCommand(...args),
  runSiteCliCommandAsync: (...args: unknown[]) => runSiteCliCommandAsync(...args),
}));

vi.mock('../../src/lib/launcher-runtime-scheduler.js', () => ({
  getSchedulerSiteDaemonStatus: (...args: unknown[]) => getSchedulerSiteDaemonStatus(...args),
}));

// Hermetic fabric check: sites-launch resolves @narada2/mcp-fabric via a
// computed dynamic import; vitest still intercepts by resolved module id.
vi.mock('@narada2/mcp-fabric', () => ({
  loadSiteMcpFabric: (...args: unknown[]) => loadSiteMcpFabric(...args),
}));

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  };
}

function createMockContext(): CommandContext {
  return {
    configPath: '/test/config.json',
    logger: createMockLogger() as unknown as CommandContext['logger'],
    verbose: false,
  };
}

interface LaunchResultShape {
  schema: string;
  status: string;
  dry_run: boolean;
  mutation_performed: boolean;
  site_id: string;
  site_root: string | null;
  checks: Array<{ id: string; status: string; summary: string; detail?: string; next_command?: string }>;
  actions: string[];
  console_url: string;
}

let tmpRoot: string;

function writeLoopDeclaration(siteRoot: string): void {
  const dir = join(siteRoot, '.narada', 'capabilities');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'site-loop-config.json'),
    JSON.stringify({
      schema: 'narada.site_loop.config.v1',
      loop_id: 'test.loop',
      resident: { agent_id: 'resident', role: 'resident' },
      scheduler: { default_task_name: 'Narada-Test-Daemon' },
    }),
  );
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'sites-launch-'));
  getManagedSite.mockReset();
  runSiteCliCommand.mockReset();
  runSiteCliCommandAsync.mockReset();
  getSchedulerSiteDaemonStatus.mockReset();
  loadSiteMcpFabric.mockReset();
  getSchedulerSiteDaemonStatus.mockReturnValue({
    schema: 'narada.scheduler.site_daemon.status.v0',
    status: 'ok',
    mutation_performed: false,
    site_root: tmpRoot,
    task_name: 'Narada-Test-Daemon',
  });
  loadSiteMcpFabric.mockReturnValue({
    servers: { 'test-server': {} },
    registry_validation: { status: 'ok' },
  });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('sitesLaunchCommand', () => {
  it('fails when the site is not in the registry', async () => {
    getManagedSite.mockReturnValue(null);
    const { exitCode, result } = await sitesLaunchCommand({ siteId: 'missing-site', format: 'json' }, createMockContext());
    const shaped = result as LaunchResultShape;
    expect(exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(shaped.schema).toBe('narada.sites.launch.result.v0');
    expect(shaped.status).toBe('failed');
    expect(shaped.checks[0]).toMatchObject({ id: 'site_resolution', status: 'fail' });
    expect(shaped.checks[0]!.summary).toContain('not found');
  });

  it('distinguishes a registry read error from a missing site', async () => {
    getManagedSite.mockImplementation(() => {
      throw new Error('db corrupt');
    });
    const { exitCode, result } = await sitesLaunchCommand({ siteId: 'any-site', format: 'json' }, createMockContext());
    const shaped = result as LaunchResultShape;
    expect(exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(shaped.status).toBe('failed');
    expect(shaped.checks[0]).toMatchObject({ id: 'site_resolution', status: 'fail' });
    expect(shaped.checks[0]!.summary).toContain('could not be read');
    expect(shaped.checks[0]!.detail).toContain('db corrupt');
  });

  it('plans without mutation in dry-run mode when a loop declares a resident', async () => {
    writeLoopDeclaration(tmpRoot);
    getManagedSite.mockReturnValue({ siteId: 'test-site', siteRoot: tmpRoot });
    const { exitCode, result } = await sitesLaunchCommand({ siteId: 'test-site', dryRun: true, format: 'json' }, createMockContext());
    const shaped = result as LaunchResultShape;
    expect(exitCode).toBe(ExitCode.SUCCESS);
    expect(shaped.status).toBe('dry_run');
    expect(shaped.mutation_performed).toBe(false);
    expect(runSiteCliCommandAsync).not.toHaveBeenCalled();
    const byId = new Map(shaped.checks.map((check) => [check.id, check]));
    expect(byId.get('site_resolution')?.status).toBe('pass');
    expect(byId.get('mcp_surface_materialization')?.status).toBe('pass');
    expect(byId.get('site_loop_declaration')?.status).toBe('pass');
    expect(byId.get('resident_ensure')?.status).toBe('planned');
    expect(byId.get('resident_ensure')?.summary).toContain('bounded site-loop pass');
    expect(byId.get('scheduler_posture')?.status).toBe('pass');
    expect(shaped.console_url).toContain('/console/registry');
  });

  it('ensures the resident via the site CLI async path when applying', async () => {
    writeLoopDeclaration(tmpRoot);
    getManagedSite.mockReturnValue({ siteId: 'test-site', siteRoot: tmpRoot });
    runSiteCliCommandAsync.mockReturnValue({
      schema: 'narada.site_command_result.v0',
      status: 'success',
      mutation_performed: true,
      site_root: tmpRoot,
      command: [],
    });
    const { exitCode, result } = await sitesLaunchCommand({ siteId: 'test-site', format: 'json' }, createMockContext());
    const shaped = result as LaunchResultShape;
    expect(exitCode).toBe(ExitCode.SUCCESS);
    expect(shaped.status).toBe('ok');
    expect(shaped.mutation_performed).toBe(true);
    expect(runSiteCliCommandAsync).toHaveBeenCalledWith(tmpRoot, ['loop', 'run', 'test.loop', '--once', '--ensure-resident']);
    expect(shaped.actions.join('\n')).toContain('ensured resident carrier');
    const byId = new Map(shaped.checks.map((check) => [check.id, check]));
    expect(byId.get('resident_ensure')?.status).toBe('pass');
  });

  it('fails when the resident ensure fails', async () => {
    writeLoopDeclaration(tmpRoot);
    getManagedSite.mockReturnValue({ siteId: 'test-site', siteRoot: tmpRoot });
    runSiteCliCommandAsync.mockReturnValue({
      schema: 'narada.site_command_result.v0',
      status: 'failed',
      mutation_performed: false,
      site_root: tmpRoot,
      command: [],
      error: 'boom',
    });
    const { exitCode, result } = await sitesLaunchCommand({ siteId: 'test-site', format: 'json' }, createMockContext());
    const shaped = result as LaunchResultShape;
    expect(exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(shaped.status).toBe('failed');
    expect(shaped.mutation_performed).toBe(false);
    const byId = new Map(shaped.checks.map((check) => [check.id, check]));
    expect(byId.get('resident_ensure')?.status).toBe('fail');
  });

  it('reports mutation_performed when the ensure mutates but then fails', async () => {
    writeLoopDeclaration(tmpRoot);
    getManagedSite.mockReturnValue({ siteId: 'test-site', siteRoot: tmpRoot });
    runSiteCliCommandAsync.mockReturnValue({
      schema: 'narada.site_command_result.v0',
      status: 'failed',
      mutation_performed: true,
      site_root: tmpRoot,
      command: [],
      error: 'loop pass ensured the resident, then exploded',
    });
    const { exitCode, result } = await sitesLaunchCommand({ siteId: 'test-site', format: 'json' }, createMockContext());
    const shaped = result as LaunchResultShape;
    expect(exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(shaped.status).toBe('failed');
    expect(shaped.mutation_performed).toBe(true);
  });

  it('skips loop checks when no loop is declared', async () => {
    getManagedSite.mockReturnValue({ siteId: 'test-site', siteRoot: tmpRoot });
    expect(existsSync(join(tmpRoot, '.narada'))).toBe(false);
    const { exitCode, result } = await sitesLaunchCommand({ siteId: 'test-site', dryRun: true, format: 'json' }, createMockContext());
    const shaped = result as LaunchResultShape;
    expect(exitCode).toBe(ExitCode.SUCCESS);
    const byId = new Map(shaped.checks.map((check) => [check.id, check]));
    expect(byId.get('site_loop_declaration')?.status).toBe('skipped');
    expect(byId.has('resident_ensure')).toBe(false);
    expect(byId.has('scheduler_posture')).toBe(false);
  });

  it('warns when the loop declaration is not valid JSON', async () => {
    const dir = join(tmpRoot, '.narada', 'capabilities');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'site-loop-config.json'), '{not valid json');
    getManagedSite.mockReturnValue({ siteId: 'test-site', siteRoot: tmpRoot });
    const { exitCode, result } = await sitesLaunchCommand({ siteId: 'test-site', dryRun: true, format: 'json' }, createMockContext());
    const shaped = result as LaunchResultShape;
    expect(exitCode).toBe(ExitCode.SUCCESS);
    const byId = new Map(shaped.checks.map((check) => [check.id, check]));
    expect(byId.get('site_loop_declaration')?.status).toBe('warn');
    expect(byId.get('site_loop_declaration')?.summary).toContain('not valid JSON');
    expect(byId.has('resident_ensure')).toBe(false);
    expect(byId.has('scheduler_posture')).toBe(false);
  });
});
