import { describe, expect, it, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  sitesInitCommand,
  sitesBootstrapWindowsCommand,
  sitesAgentBootstrapCommand,
} from '../../src/commands/sites.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  };
}

function createMockContext(overrides?: Partial<CommandContext>): CommandContext {
  return {
    configPath: '/test/config.json',
    logger: createMockLogger() as unknown as CommandContext['logger'],
    verbose: false,
    ...overrides,
  };
}

const mockRegistry = {
  registerSite: vi.fn(),
  close: vi.fn(),
};

vi.mock('@narada2/windows-site', async (importOriginal) => {
  const { vol } = await import('memfs');
  const mod = await importOriginal<typeof import('@narada2/windows-site')>();
  return {
    ...mod,
    resolveSiteRoot: vi.fn((_siteId: string, variant: string) => `/tmp/windows-${variant}/${_siteId}`),
    ensureSiteDir: vi.fn((_siteId: string, variant: string) => {
      vol.mkdirSync(`/tmp/windows-${variant}/${_siteId}`, { recursive: true });
      return Promise.resolve();
    }),
    siteConfigPath: vi.fn((_siteId: string, variant: string) => `/tmp/windows-${variant}/${_siteId}/config.json`),
    SiteRegistry: vi.fn(() => mockRegistry),
    openRegistryDb: vi.fn(async () => ({})),
    resolveRegistryDbPath: vi.fn(() => '/tmp/registry.db'),
  };
});

vi.mock('@narada2/macos-site', async (importOriginal) => {
  const { vol } = await import('memfs');
  const mod = await importOriginal<typeof import('@narada2/macos-site')>();
  return {
    ...mod,
    resolveSiteRoot: vi.fn((_siteId: string) => `/tmp/macos/${_siteId}`),
    ensureSiteDir: vi.fn((_siteId: string) => {
      vol.mkdirSync(`/tmp/macos/${_siteId}`, { recursive: true });
      return Promise.resolve();
    }),
    siteConfigPath: vi.fn((_siteId: string) => `/tmp/macos/${_siteId}/config.json`),
  };
});

vi.mock('@narada2/linux-site', async (importOriginal) => {
  const { vol } = await import('memfs');
  const mod = await importOriginal<typeof import('@narada2/linux-site')>();
  return {
    ...mod,
    resolveSiteRoot: vi.fn((_siteId: string, _mode: string) => `/tmp/linux-${_mode}/${_siteId}`),
    ensureSiteDir: vi.fn((_siteId: string, _mode: string) => {
      vol.mkdirSync(`/tmp/linux-${_mode}/${_siteId}`, { recursive: true });
      return Promise.resolve();
    }),
    siteConfigPath: vi.fn((_siteId: string, _mode: string) => `/tmp/linux-${_mode}/${_siteId}/config.json`),
  };
});

describe('sitesInitCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vol.reset();
    vol.mkdirSync('/tmp', { recursive: true });
    delete process.env.NARADA_EXECUTOR_RUNTIME;
    delete process.env.COMPUTERNAME;
    delete process.env.HOSTNAME;
    delete process.env.NARADA_WINDOWS_TOOL_WINDOWS_TERMINAL;
    delete process.env.NARADA_WINDOWS_TOOL_KOMOREBI;
    delete process.env.NARADA_WINDOWS_TOOL_YASB;
    delete process.env.NARADA_WINDOWS_TOOL_POWERSHELL;
    process.env.USERPROFILE = 'C:\\Users\\Andrey';
    process.env.USERNAME = 'Andrey';
  });

  it('rejects invalid substrate', async () => {
    const ctx = createMockContext();
    const result = await sitesInitCommand('test-site', { substrate: 'invalid', format: 'json' }, ctx);

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((result.result as { error: string }).error).toContain('Unsupported substrate');
  });

  it('dry run does not write files', async () => {
    const ctx = createMockContext();
    const result = await sitesInitCommand('test-site', {
      substrate: 'linux-user',
      dryRun: true,
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.result as { dryRun: boolean }).dryRun).toBe(true);

    // Nothing should be written to memfs
    const files = vol.toJSON();
    expect(Object.keys(files)).toEqual(['/tmp']);
  });

  it('creates Linux user site', async () => {
    const ctx = createMockContext();
    const result = await sitesInitCommand('test-site', {
      substrate: 'linux-user',
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { siteId: string; substrate: string; config: Record<string, unknown> };
    expect(data.siteId).toBe('test-site');
    expect(data.substrate).toBe('linux-user');
    expect(data.config.mode).toBe('user');
    expect(data.config.site_id).toBe('test-site');

    // Config file should be written
    const files = vol.toJSON();
    expect(files['/tmp/linux-user/test-site/config.json']).toBeDefined();
    const agents = files['/tmp/linux-user/test-site/AGENTS.md'];
    expect(agents).toContain('You are either `architect`, `builder`, or `observer`, as assigned by the Operator.');
    expect(agents).toContain('You are `architect`.');
    expect(agents).toContain('You are `builder`.');
    expect(agents).toContain('You are `observer`.');
    expect(agents).toContain('## Architect Thread Bootstrap');
    expect(agents).toContain('## Builder Thread Bootstrap');
    expect(agents).toContain('## Observer Thread Bootstrap');
    expect(agents).toContain('The human is `Operator`.');
    expect(agents).toContain('This Site is governed by Narada law.');
    expect(agents).toContain('Treat this file as the Site-local execution contract for fresh Architect, Builder, and Observer threads.');
    expect(agents).toContain('Do not build, assign, implement, review, accept, reject, close, or mutate tasks.');
    expect(agents).toContain('site_kind: linux-user');
    expect(agents).not.toContain('inspector');
    expect(agents).not.toContain('superintendent');
  });

  it('returns bounded Architect bootstrap text without mutation', async () => {
    const ctx = createMockContext();
    await sitesInitCommand('test-site', {
      substrate: 'linux-user',
      format: 'json',
    }, ctx);

    const result = await sitesAgentBootstrapCommand('/tmp/linux-user/test-site', {
      role: 'architect',
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as {
      mutation_performed: boolean;
      role: string;
      section_title: string;
      bootstrap_text: string;
      agents_path: string;
    };
    expect(data.mutation_performed).toBe(false);
    expect(data.role).toBe('architect');
    expect(data.section_title).toBe('Architect Thread Bootstrap');
    expect(data.agents_path).toBe('/tmp/linux-user/test-site/AGENTS.md');
    expect(data.bootstrap_text).toContain('You are `architect`.');
    expect(data.bootstrap_text).toContain('Interpret Operator pressure into governed work packages.');
    expect(data.bootstrap_text).not.toContain('## Builder Thread Bootstrap');
    expect(data.bootstrap_text).not.toContain('You are `builder`.');
  });

  it('returns bounded Observer bootstrap text without lifecycle review authority', async () => {
    const ctx = createMockContext();
    await sitesInitCommand('test-site', {
      substrate: 'linux-user',
      format: 'json',
    }, ctx);

    const result = await sitesAgentBootstrapCommand('/tmp/linux-user/test-site', {
      role: 'observer',
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as {
      mutation_performed: boolean;
      role: string;
      section_title: string;
      bootstrap_text: string;
    };
    expect(data.mutation_performed).toBe(false);
    expect(data.role).toBe('observer');
    expect(data.section_title).toBe('Observer Thread Bootstrap');
    expect(data.bootstrap_text).toContain('You are `observer`.');
    expect(data.bootstrap_text).toContain('Observe whether Site work preserves Narada law');
    expect(data.bootstrap_text).toContain('Do not build, assign, implement, review, accept, reject, close, or mutate tasks.');
    expect(data.bootstrap_text).not.toContain('## Architect Thread Bootstrap');
    expect(data.bootstrap_text).not.toContain('You are `architect`.');
  });

  it('returns distinct Builder bootstrap text from contained workspace root', async () => {
    const ctx = createMockContext();
    vol.mkdirSync('/tmp/project/.narada', { recursive: true });
    vol.writeFileSync('/tmp/project/.narada/config.json', JSON.stringify({
      site_id: 'project-site',
    }, null, 2));
    vol.writeFileSync('/tmp/project/.narada/AGENTS.md', [
      '# AGENTS.md',
      '',
      '## Architect Thread Bootstrap',
      '',
      'You are `architect`.',
      '',
      '- Draft the work package.',
      '',
      '## Builder Thread Bootstrap',
      '',
      'You are `builder`.',
      '',
      '- Execute approved local work packages within their accepted scope.',
      '',
      '## Standing Rules',
      '',
      '- Preserve authority.',
      '',
    ].join('\n'));

    const result = await sitesAgentBootstrapCommand('/tmp/project', {
      role: 'builder',
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as {
      mutation_performed: boolean;
      role: string;
      site_id: string;
      site_root: string;
      bootstrap_text: string;
    };
    expect(data.mutation_performed).toBe(false);
    expect(data.role).toBe('builder');
    expect(data.site_id).toBe('project-site');
    expect(data.site_root).toBe('/tmp/project/.narada');
    expect(data.bootstrap_text).toContain('You are `builder`.');
    expect(data.bootstrap_text).toContain('Execute approved local work packages');
    expect(data.bootstrap_text).not.toContain('You are `architect`.');
  });

  it('rejects unknown bootstrap roles without fallback', async () => {
    const ctx = createMockContext();
    const result = await sitesAgentBootstrapCommand('/tmp/linux-user/test-site', {
      role: 'inspector',
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    const data = result.result as {
      status: string;
      error: string;
      allowed_roles: string[];
      mutation_performed: boolean;
    };
    expect(data.status).toBe('error');
    expect(data.error).toContain('Unsupported agent role');
    expect(data.allowed_roles).toEqual(['architect', 'builder', 'observer']);
    expect(data.mutation_performed).toBe(false);
  });

  it('creates Linux system site', async () => {
    const ctx = createMockContext();
    const result = await sitesInitCommand('test-site', {
      substrate: 'linux-system',
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { config: Record<string, unknown> };
    expect(data.config.mode).toBe('system');
  });

  it('creates macOS site', async () => {
    const ctx = createMockContext();
    const result = await sitesInitCommand('test-site', {
      substrate: 'macos',
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { config: Record<string, unknown> };
    expect(data.config.site_id).toBe('test-site');
    expect(data.config).not.toHaveProperty('mode');
    expect(data.config).not.toHaveProperty('variant');
  });

  it('dry-runs Windows native site config', async () => {
    const ctx = createMockContext();
    const result = await sitesInitCommand('test-site', {
      substrate: 'windows-native',
      root: '/tmp/windows-native/test-site',
      dryRun: true,
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { config: Record<string, unknown> };
    expect(data.config.variant).toBe('native');
    expect(mockRegistry.registerSite).not.toHaveBeenCalled();
  });

  it('infers wsl_assisted only for a WSL executor targeting a Windows authority locus', async () => {
    process.env.NARADA_EXECUTOR_RUNTIME = 'wsl';
    const ctx = createMockContext();
    const result = await sitesInitCommand('test-site', {
      substrate: 'windows-native',
      authorityLocus: 'pc',
      dryRun: true,
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as {
      config: {
        site_root: string;
        execution: {
          surface: string;
          inferred: boolean;
          executor_runtime: string;
          target_authority_locus: string;
          target_root: string;
          executor_root: string;
          path_translation: { kind: string; windows_path: string; wsl_path: string };
          permission_posture: string;
          mutation_evidence_locus: string;
          rationale: string;
        };
      };
    };
    expect(data.config.execution.surface).toBe('wsl_assisted');
    expect(data.config.execution.inferred).toBe(true);
    expect(data.config.execution.executor_runtime).toBe('wsl');
    expect(data.config.execution.target_authority_locus).toBe('windows_pc');
    expect(data.config.execution.target_root).toBe(data.config.site_root);
    expect(data.config.execution.executor_root).toBeTruthy();
    expect(data.config.execution.path_translation.kind).toBe('windows_drive_to_wsl_mount');
    expect(data.config.execution.path_translation.windows_path).toBe('C:\\ProgramData\\Narada\\sites\\pc\\test-site');
    expect(data.config.execution.path_translation.wsl_path).toBe('/mnt/c/ProgramData/Narada/sites/pc/test-site');
    expect(data.config.execution.permission_posture).toBe('pc_locus_programdata_write_required');
    expect(data.config.execution.mutation_evidence_locus).toBe('executor_wsl_repo_and_target_windows_site');
    expect(data.config.execution.rationale).toContain('preserving target authority locus');
  });

  it('does not infer wsl_assisted for a WSL executor targeting a Linux user Site', async () => {
    process.env.NARADA_EXECUTOR_RUNTIME = 'wsl';
    const ctx = createMockContext();
    const result = await sitesInitCommand('test-site', {
      substrate: 'linux-user',
      dryRun: true,
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as {
      config: { execution: { surface: string; target_authority_locus: string; path_translation: { kind: string }; permission_posture: string; rationale: string } };
    };
    expect(data.config.execution.surface).toBe('wsl_native');
    expect(data.config.execution.target_authority_locus).toBe('linux-user');
    expect(data.config.execution.path_translation.kind).toBe('not_required');
    expect(data.config.execution.permission_posture).toBe('substrate_local_write_required');
    expect(data.config.execution.rationale).toContain('not wsl_assisted');
  });

  it('accepts an explicit execution surface without treating it as inferred', async () => {
    process.env.NARADA_EXECUTOR_RUNTIME = 'wsl';
    const ctx = createMockContext();
    const result = await sitesInitCommand('test-site', {
      substrate: 'linux-user',
      executionSurface: 'linux_user',
      dryRun: true,
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { config: { execution: { surface: string; inferred: boolean; rationale: string } } };
    expect(data.config.execution.surface).toBe('linux_user');
    expect(data.config.execution.inferred).toBe(false);
    expect(data.config.execution.rationale).toContain('explicitly set');
  });

  it('rejects invalid execution surface', async () => {
    const ctx = createMockContext();
    const result = await sitesInitCommand('test-site', {
      substrate: 'linux-user',
      executionSurface: 'mystery',
      dryRun: true,
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((result.result as { error: string }).error).toContain('Unsupported execution surface');
  });

  it('dry-runs Windows WSL site config', async () => {
    const ctx = createMockContext();
    const result = await sitesInitCommand('test-site', {
      substrate: 'windows-wsl',
      root: '/tmp/windows-wsl/test-site',
      dryRun: true,
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { config: Record<string, unknown> };
    expect(data.config.variant).toBe('wsl');
    expect(mockRegistry.registerSite).not.toHaveBeenCalled();
  });

  it('binds operation when --operation is provided', async () => {
    const ctx = createMockContext();
    const result = await sitesInitCommand('test-site', {
      substrate: 'linux-user',
      operation: 'help@example.com',
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.result as { siteId: string }).siteId).toBe('test-site');
  });

  it('returns next steps in result', async () => {
    const ctx = createMockContext();
    const result = await sitesInitCommand('test-site', {
      substrate: 'linux-user',
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { nextSteps: string[] };
    expect(data.nextSteps).toContain('narada doctor --site test-site');
    expect(data.nextSteps).toContain('narada cycle --site test-site');
    expect(data.nextSteps).toContain('narada sites enable test-site');
  });

  it('dry-runs paired Windows User and PC Site bootstrap with WSL-assisted execution coordinates', async () => {
    process.env.NARADA_EXECUTOR_RUNTIME = 'wsl';
    process.env.COMPUTERNAME = 'DESKTOP-SUNROOM';
    const ctx = createMockContext();
    const result = await sitesBootstrapWindowsCommand({
      userSiteId: 'andrey-user',
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as {
      status: string;
      mutation_performed: boolean;
      plan_kind: string;
      user_site_id: string;
      pc_site_id: string;
      pc_identity_source: string;
      validation_commands: string[];
      substrate_readiness: Array<{
        name: string;
        status: string;
        authority_locus: string;
        unblock_command?: string;
        command_resolution?: { status: string; command: string | null; candidates: string[]; probe: string };
        semantic_readiness?: { status: string; reason: string };
      }>;
      adapter_plan: Array<{ adapter: string; authority_locus: string; dry_run: boolean; execute_required: boolean; mutation_performed: boolean }>;
      evidence: { bounded: boolean; raw_sqlite_read: boolean; direct_task_file_inspection: boolean; residual_manual_steps: unknown[] };
      user: { config: { locus: { authority_locus: string }; sync: { posture: string }; execution: { surface: string; target_authority_locus: string } } };
      pc: { config: { locus: { authority_locus: string }; execution: { surface: string; target_authority_locus: string; path_translation: { wsl_path: string }; permission_posture: string } } };
    };
    expect(data.status).toBe('dry_run');
    expect(data.mutation_performed).toBe(false);
    expect(data.plan_kind).toBe('paired_windows_user_pc_site_bootstrap');
    expect(data.user_site_id).toBe('andrey-user');
    expect(data.pc_site_id).toBe('desktop-sunroom');
    expect(data.pc_identity_source).toBe('computer_name');
    expect(data.user.config.locus.authority_locus).toBe('user');
    expect(data.user.config.sync.posture).toBe('hybrid_capable_plain_folder');
    expect(data.user.config.execution.surface).toBe('wsl_assisted');
    expect(data.user.config.execution.target_authority_locus).toBe('windows_user');
    expect(data.pc.config.locus.authority_locus).toBe('pc');
    expect(data.pc.config.execution.surface).toBe('wsl_assisted');
    expect(data.pc.config.execution.target_authority_locus).toBe('windows_pc');
    expect(data.pc.config.execution.path_translation.wsl_path).toBe('/mnt/c/ProgramData/Narada/sites/pc/desktop-sunroom');
    expect(data.pc.config.execution.permission_posture).toBe('pc_locus_programdata_write_required');
    expect(data.validation_commands).toEqual([
      'narada sites doctor andrey-user --authority-locus user',
      'narada sites doctor desktop-sunroom --authority-locus pc',
      'narada doctor --bootstrap --format json',
      'narada operator-surface labels build --site <site-id-or-root> --format json',
    ]);
    expect(data.substrate_readiness.map((check) => check.name)).toEqual([
      'windows_terminal_available',
      'komorebi_available',
      'yasb_available',
      'powershell_available',
      'powershell_execution_policy_posture',
      'wsl_path_translation',
      'narada_cli_readiness',
    ]);
    const powershell = data.substrate_readiness.find((check) => check.name === 'powershell_available');
    expect(powershell?.command_resolution).toBeDefined();
    expect(powershell?.semantic_readiness).toBeDefined();
    expect(data.adapter_plan).toEqual(expect.arrayContaining([
      expect.objectContaining({ adapter: 'windows_terminal_profile', authority_locus: 'windows_user', dry_run: true, execute_required: true, mutation_performed: false }),
      expect.objectContaining({ adapter: 'komorebi_focus_rule', authority_locus: 'windows_pc', dry_run: true, execute_required: true, mutation_performed: false }),
      expect.objectContaining({ adapter: 'yasb_focus_affordance', authority_locus: 'windows_user', dry_run: true, execute_required: true, mutation_performed: false }),
    ]));
    expect(data.evidence).toMatchObject({ bounded: true, raw_sqlite_read: false, direct_task_file_inspection: false });
    expect(mockRegistry.registerSite).not.toHaveBeenCalled();
  });

  it('reports exact Windows onboarding unblocks for missing Komorebi and YASB', async () => {
    process.env.NARADA_EXECUTOR_RUNTIME = 'wsl';
    process.env.COMPUTERNAME = 'DESKTOP-SUNROOM';
    process.env.NARADA_WINDOWS_TOOL_WINDOWS_TERMINAL = 'present';
    process.env.NARADA_WINDOWS_TOOL_KOMOREBI = 'missing';
    process.env.NARADA_WINDOWS_TOOL_YASB = 'missing';
    process.env.NARADA_WINDOWS_TOOL_POWERSHELL = 'present';

    const result = await sitesBootstrapWindowsCommand({ format: 'json' }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { substrate_readiness: Array<{ name: string; status: string; authority_locus: string; unblock_command?: string }> };
    expect(data.substrate_readiness.find((check) => check.name === 'komorebi_available')).toMatchObject({
      status: 'fail',
      authority_locus: 'windows_pc',
      unblock_command: 'Install or repair Komorebi in the PC Site, then rerun narada sites bootstrap-windows --format json.',
      command_resolution: {
        status: 'missing',
        command: null,
        candidates: ['komorebic'],
        probe: 'env:NARADA_WINDOWS_TOOL_*',
      },
      semantic_readiness: {
        status: 'not_ready',
        reason: 'Command resolution failed.',
      },
    });
    expect(data.substrate_readiness.find((check) => check.name === 'yasb_available')).toMatchObject({
      status: 'fail',
      authority_locus: 'windows_user',
      unblock_command: 'Install or repair YASB in the Windows User Site, then rerun narada sites bootstrap-windows --format json.',
    });
  });

  it('separates found command resolution from unknown semantic readiness', async () => {
    process.env.COMPUTERNAME = 'DESKTOP-SUNROOM';
    process.env.NARADA_WINDOWS_TOOL_WINDOWS_TERMINAL = 'present';
    process.env.NARADA_WINDOWS_TOOL_KOMOREBI = 'present';
    process.env.NARADA_WINDOWS_TOOL_YASB = 'present';
    process.env.NARADA_WINDOWS_TOOL_POWERSHELL = 'present';

    const result = await sitesBootstrapWindowsCommand({ format: 'json' }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { substrate_readiness: Array<{ name: string; status: string; command_resolution?: { status: string; command: string | null; probe: string }; semantic_readiness?: { status: string; reason: string } }> };
    expect(data.substrate_readiness.find((check) => check.name === 'windows_terminal_available')).toMatchObject({
      status: 'pass',
      command_resolution: { status: 'found', command: 'wt', probe: 'env:NARADA_WINDOWS_TOOL_*' },
      semantic_readiness: {
        status: 'unknown',
        reason: 'Command resolution succeeded; semantic readiness requires adapter-specific read-back in the owning Windows locus.',
      },
    });
  });

  it('reports ambiguous command resolution without claiming semantic readiness', async () => {
    process.env.COMPUTERNAME = 'DESKTOP-SUNROOM';
    process.env.NARADA_WINDOWS_TOOL_YASB = 'ambiguous';

    const result = await sitesBootstrapWindowsCommand({ format: 'json' }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { substrate_readiness: Array<{ name: string; status: string; command_resolution?: { status: string; candidates: string[] }; semantic_readiness?: { status: string } }> };
    expect(data.substrate_readiness.find((check) => check.name === 'yasb_available')).toMatchObject({
      status: 'warn',
      command_resolution: { status: 'ambiguous', candidates: ['yasbc', 'yasb'] },
      semantic_readiness: { status: 'unknown' },
    });
  });

  it('keeps adapter mutations dry-run by default for existing paired Windows Sites', async () => {
    process.env.NARADA_EXECUTOR_RUNTIME = 'wsl';
    process.env.COMPUTERNAME = 'DESKTOP-SUNROOM';
    vol.mkdirSync('C:\\Users\\Andrey\\Narada', { recursive: true });
    vol.mkdirSync('C:\\ProgramData\\Narada\\sites\\pc\\desktop-sunroom', { recursive: true });

    const result = await sitesBootstrapWindowsCommand({
      userSiteId: 'andrey-user',
      pcSiteId: 'desktop-sunroom',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as {
      mutation_performed: boolean;
      adapter_plan: Array<{ dry_run: boolean; mutation_performed: boolean; authority_locus: string }>;
      evidence: { site_creation: string };
    };
    expect(data.mutation_performed).toBe(false);
    expect(data.adapter_plan.every((entry) => entry.dry_run && !entry.mutation_performed)).toBe(true);
    expect(data.adapter_plan.map((entry) => entry.authority_locus)).toContain('windows_pc');
    expect(data.evidence.site_creation).toBe('dry-run plan only');
  });

  it.each([
    ['narada proper'],
    ['user Site'],
    ['pc Site'],
    ['unrelated cwd'],
  ])('resolves bootstrap Windows CLI readiness independently of cwd: %s', async (_label) => {
    process.env.NARADA_EXECUTOR_RUNTIME = 'wsl';
    process.env.COMPUTERNAME = 'DESKTOP-SUNROOM';
    const cwd = `/tmp/${String(_label).replace(/\s+/g, '-').toLowerCase()}`;
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);

    const result = await sitesBootstrapWindowsCommand({ format: 'json' }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { substrate_readiness: Array<{ name: string; status: string; detail: string; unblock_command?: string }> };
    const cli = data.substrate_readiness.find((check) => check.name === 'narada_cli_readiness');
    expect(cli).toBeDefined();
    expect(cli?.detail).toContain('package_root=');
    expect(cli?.detail).toContain('packages/layers/cli/dist/main.js');
    expect(cli?.detail).not.toContain(`${cwd}/packages/layers/cli/dist/main.js`);
    if (cli?.status === 'fail') {
      expect(cli.unblock_command).toBe('pnpm --filter @narada2/cli build && pnpm run narada:install-shim');
    }
  });

  it('honors explicit PC Site id and execution surface in paired Windows bootstrap', async () => {
    process.env.NARADA_EXECUTOR_RUNTIME = 'wsl';
    process.env.COMPUTERNAME = 'DESKTOP-SUNROOM';
    const ctx = createMockContext();
    const result = await sitesBootstrapWindowsCommand({
      pcSiteId: 'desktop-sunroom-2',
      executionSurface: 'windows_native',
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as {
      user_site_id: string;
      pc_site_id: string;
      pc_identity_source: string;
      user: { config: { execution: { surface: string; inferred: boolean } } };
      pc: { config: { execution: { surface: string; inferred: boolean } } };
    };
    expect(data.user_site_id).toBe('current-user');
    expect(data.pc_site_id).toBe('desktop-sunroom-2');
    expect(data.pc_identity_source).toBe('explicit');
    expect(data.user.config.execution.surface).toBe('windows_native');
    expect(data.user.config.execution.inferred).toBe(false);
    expect(data.pc.config.execution.surface).toBe('windows_native');
    expect(data.pc.config.execution.inferred).toBe(false);
  });

  it('uses a WSL-safe default Windows user root when USERPROFILE is absent', async () => {
    process.env.NARADA_EXECUTOR_RUNTIME = 'wsl';
    process.env.COMPUTERNAME = 'DESKTOP-SUNROOM';
    delete process.env.USERPROFILE;
    delete process.env.USERNAME;
    process.env.USER = 'andrey';
    const ctx = createMockContext();
    const result = await sitesBootstrapWindowsCommand({ format: 'json' }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as {
      user: { config: { site_root: string; locus: { principal: { windows_user_profile: string; username: string } }; execution: { path_translation: { wsl_path: string } } } };
    };
    expect(data.user.config.site_root).toBe('C:\\Users\\andrey\\Narada');
    expect(data.user.config.locus.principal.windows_user_profile).toBe('C:\\Users\\andrey');
    expect(data.user.config.locus.principal.username).toBe('andrey');
    expect(data.user.config.execution.path_translation.wsl_path).toBe('/mnt/c/Users/andrey/Narada');
  });

  it('does not warn about WSL path translation for native Windows execution', async () => {
    process.env.COMPUTERNAME = 'DESKTOP-SUNROOM';

    const result = await sitesBootstrapWindowsCommand({
      executionSurface: 'windows_native',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { substrate_readiness: Array<{ name: string; status: string; detail: string; unblock_command?: string }> };
    expect(data.substrate_readiness.find((check) => check.name === 'wsl_path_translation')).toMatchObject({
      status: 'pass',
      detail: 'Native Windows execution uses native paths directly; WSL path translation is not required.',
    });
    expect(data.substrate_readiness.find((check) => check.name === 'wsl_path_translation')?.unblock_command).toBeUndefined();
  });

  it('validates WSL-assisted execution path translation posture', async () => {
    process.env.NARADA_EXECUTOR_RUNTIME = 'wsl';
    process.env.COMPUTERNAME = 'DESKTOP-SUNROOM';

    const result = await sitesBootstrapWindowsCommand({
      executionSurface: 'wsl_assisted',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { substrate_readiness: Array<{ name: string; status: string; detail: string }> };
    expect(data.substrate_readiness.find((check) => check.name === 'wsl_path_translation')).toMatchObject({
      status: 'pass',
      detail: 'WSL-assisted execution surface validates Windows/WSL path translation.',
    });
  });

  it('uses WSL-assisted path translation posture when inferred from runtime', async () => {
    process.env.NARADA_EXECUTOR_RUNTIME = 'wsl';
    process.env.COMPUTERNAME = 'DESKTOP-SUNROOM';

    const result = await sitesBootstrapWindowsCommand({ format: 'json' }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { substrate_readiness: Array<{ name: string; status: string; detail: string }> };
    expect(data.substrate_readiness.find((check) => check.name === 'wsl_path_translation')).toMatchObject({
      status: 'pass',
      detail: 'WSL-assisted execution surface validates Windows/WSL path translation.',
    });
  });

  it('reports unknown Windows execution surfaces with bounded unblock guidance', async () => {
    process.env.COMPUTERNAME = 'DESKTOP-SUNROOM';

    const result = await sitesBootstrapWindowsCommand({
      executionSurface: 'unknown_surface',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { substrate_readiness: Array<{ name: string; status: string; detail: string; unblock_command?: string }> };
    expect(data.substrate_readiness.find((check) => check.name === 'wsl_path_translation')).toMatchObject({
      status: 'warn',
      detail: 'Unsupported execution surface for Windows bootstrap readiness: unknown_surface',
      unblock_command: 'Use --execution-surface windows_native or --execution-surface wsl_assisted.',
    });
  });
});
