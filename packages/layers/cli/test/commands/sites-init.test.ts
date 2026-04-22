import { describe, expect, it, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  sitesInitCommand,
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
    vol.reset();
    vol.mkdirSync('/tmp', { recursive: true });
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

  it('creates Windows native site and registers in registry', async () => {
    const ctx = createMockContext();
    const result = await sitesInitCommand('test-site', {
      substrate: 'windows-native',
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { config: Record<string, unknown> };
    expect(data.config.variant).toBe('native');
    expect(mockRegistry.registerSite).toHaveBeenCalledWith(
      expect.objectContaining({
        siteId: 'test-site',
        variant: 'native',
        substrate: 'windows-native',
      }),
    );
  });

  it('creates Windows WSL site and registers in registry', async () => {
    const ctx = createMockContext();
    const result = await sitesInitCommand('test-site', {
      substrate: 'windows-wsl',
      format: 'json',
    }, ctx);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { config: Record<string, unknown> };
    expect(data.config.variant).toBe('wsl');
    expect(mockRegistry.registerSite).toHaveBeenCalledWith(
      expect.objectContaining({
        siteId: 'test-site',
        variant: 'wsl',
        substrate: 'windows-wsl',
      }),
    );
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
});
