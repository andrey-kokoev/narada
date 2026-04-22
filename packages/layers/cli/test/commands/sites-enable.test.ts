import { describe, expect, it, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  sitesEnableCommand,
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

const mockSupervisor = {
  register: vi.fn(async () => ({ servicePath: '/tmp/linux/test-site.service', timerPath: '/tmp/linux/test-site.timer' })),
};

vi.mock('@narada2/macos-site', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@narada2/macos-site')>();
  return {
    ...mod,
    isMacosSite: vi.fn((_siteId: string) => _siteId.startsWith('macos-')),
    resolveSiteRoot: vi.fn((_siteId: string) => `/tmp/macos/${_siteId}`),
    siteConfigPath: vi.fn((_siteId: string) => `/tmp/macos/${_siteId}/config.json`),
    writeLaunchAgentFiles: vi.fn(async () => ({ plistPath: '/tmp/macos/test.plist', scriptPath: '/tmp/macos/test.sh' })),
  };
});

vi.mock('@narada2/linux-site', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@narada2/linux-site')>();
  return {
    ...mod,
    isLinuxSite: vi.fn((_siteId: string) => _siteId.startsWith('linux-')),
    resolveLinuxSiteMode: vi.fn((_siteId: string) => {
      if (_siteId.startsWith('linux-user-')) return 'user';
      if (_siteId.startsWith('linux-system-')) return 'system';
      return null;
    }),
    resolveSiteRoot: vi.fn((_siteId: string, _mode: string) => `/tmp/linux-${_mode}/${_siteId}`),
    siteConfigPath: vi.fn((_siteId: string, _mode: string) => `/tmp/linux-${_mode}/${_siteId}/config.json`),
    DefaultLinuxSiteSupervisor: vi.fn(() => mockSupervisor),
  };
});

vi.mock('@narada2/windows-site', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@narada2/windows-site')>();
  return {
    ...mod,
    resolveSiteVariant: vi.fn((_siteId: string) => {
      if (_siteId.startsWith('win-native-')) return 'native';
      if (_siteId.startsWith('win-wsl-')) return 'wsl';
      return null;
    }),
    resolveSiteRoot: vi.fn((_siteId: string, variant: string) => `/tmp/windows-${variant}/${_siteId}`),
    siteConfigPath: vi.fn((_siteId: string, variant: string) => `/tmp/windows-${variant}/${_siteId}/config.json`),
    generateRegisterTaskScript: vi.fn(() => '# PowerShell script'),
    writeSystemdUnits: vi.fn(async () => ({ servicePath: '/tmp/wsl/test.service', timerPath: '/tmp/wsl/test.timer' })),
    writeShellScript: vi.fn(async () => '/tmp/wsl/run-cycle.sh'),
  };
});

describe('sitesEnableCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vol.reset();
    vol.mkdirSync('/tmp', { recursive: true });
  });

  it('returns error for unknown site', async () => {
    const ctx = createMockContext();
    const result = await sitesEnableCommand('unknown-site', { format: 'json' }, ctx);

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('not found');
  });

  it('dry run does not write files for Linux user site', async () => {
    const ctx = createMockContext();
    const result = await sitesEnableCommand('linux-user-test', {
      dryRun: true,
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.result as { dryRun: boolean }).dryRun).toBe(true);
    expect(mockSupervisor.register).not.toHaveBeenCalled();
  });

  it('enables Linux user site supervisor', async () => {
    const ctx = createMockContext();
    const result = await sitesEnableCommand('linux-user-test', {
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { substrate: string; registration: unknown };
    expect(data.substrate).toBe('linux-user');
    expect(mockSupervisor.register).toHaveBeenCalled();
  });

  it('enables Linux system site supervisor', async () => {
    const ctx = createMockContext();
    const result = await sitesEnableCommand('linux-system-test', {
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { substrate: string };
    expect(data.substrate).toBe('linux-system');
  });

  it('enables macOS site supervisor', async () => {
    // Create config file so macOS path is found
    vol.mkdirSync('/tmp/macos/macos-test', { recursive: true });
    vol.writeFileSync('/tmp/macos/macos-test/config.json', JSON.stringify({
      site_id: 'macos-test',
      site_root: '/tmp/macos/macos-test',
      config_path: '/tmp/macos/macos-test/config.json',
      cycle_interval_minutes: 5,
      lock_ttl_ms: 310000,
      ceiling_ms: 300000,
    }));

    const ctx = createMockContext();
    const result = await sitesEnableCommand('macos-test', {
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { substrate: string };
    expect(data.substrate).toBe('macos');
  });

  it('enables Windows native site supervisor', async () => {
    // Create config file so Windows path is found
    vol.mkdirSync('/tmp/windows-native/win-native-test', { recursive: true });
    vol.writeFileSync('/tmp/windows-native/win-native-test/config.json', JSON.stringify({
      site_id: 'win-native-test',
      variant: 'native',
      site_root: '/tmp/windows-native/win-native-test',
      config_path: '/tmp/windows-native/win-native-test/config.json',
      cycle_interval_minutes: 5,
      lock_ttl_ms: 310000,
      ceiling_ms: 300000,
    }));

    const ctx = createMockContext();
    const result = await sitesEnableCommand('win-native-test', {
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { substrate: string };
    expect(data.substrate).toBe('windows-native');
  });

  it('enables Windows WSL site supervisor', async () => {
    // Create config file so Windows path is found
    vol.mkdirSync('/tmp/windows-wsl/win-wsl-test', { recursive: true });
    vol.writeFileSync('/tmp/windows-wsl/win-wsl-test/config.json', JSON.stringify({
      site_id: 'win-wsl-test',
      variant: 'wsl',
      site_root: '/tmp/windows-wsl/win-wsl-test',
      config_path: '/tmp/windows-wsl/win-wsl-test/config.json',
      cycle_interval_minutes: 5,
      lock_ttl_ms: 310000,
      ceiling_ms: 300000,
    }));

    const ctx = createMockContext();
    const result = await sitesEnableCommand('win-wsl-test', {
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { substrate: string };
    expect(data.substrate).toBe('windows-wsl');
  });

  it('dry run does not call macOS supervisor', async () => {
    const { writeLaunchAgentFiles } = await import('@narada2/macos-site');
    const ctx = createMockContext();
    const result = await sitesEnableCommand('macos-test', {
      dryRun: true,
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.result as { dryRun: boolean }).dryRun).toBe(true);
    expect(writeLaunchAgentFiles).not.toHaveBeenCalled();
  });

  it('dry run does not call Windows native supervisor', async () => {
    const { generateRegisterTaskScript } = await import('@narada2/windows-site');
    const ctx = createMockContext();
    const result = await sitesEnableCommand('win-native-test', {
      dryRun: true,
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.result as { dryRun: boolean }).dryRun).toBe(true);
    // generateRegisterTaskScript is called even in dry-run (it only generates a string)
    // but no files are written
    expect((result.result as { scriptPath: unknown }).scriptPath).toBeNull();
  });

  it('dry run does not call Windows WSL supervisor', async () => {
    const { writeSystemdUnits, writeShellScript } = await import('@narada2/windows-site');
    const ctx = createMockContext();
    const result = await sitesEnableCommand('win-wsl-test', {
      dryRun: true,
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.result as { dryRun: boolean }).dryRun).toBe(true);
    expect(writeSystemdUnits).not.toHaveBeenCalled();
    expect(writeShellScript).not.toHaveBeenCalled();
  });

  it('uses custom interval minutes', async () => {
    const ctx = createMockContext();
    const result = await sitesEnableCommand('linux-user-test', {
      intervalMinutes: 10,
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.result as { intervalMinutes: number }).intervalMinutes).toBe(10);
  });
});
