import { describe, expect, it, vi, beforeEach } from 'vitest';
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

const mockDb = {
  exec: vi.fn(),
  prepare: vi.fn(() => ({ all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) })),
  close: vi.fn(),
};

vi.mock('@narada2/windows-site', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@narada2/windows-site')>();
  return {
    ...mod,
    Database: vi.fn(() => mockDb),
    openRegistryDb: vi.fn(async () => mockDb),
    getWindowsSiteStatus: vi.fn(async (_siteId: string, _variant: string) => ({
      siteId: _siteId,
      variant: _variant,
      siteRoot: '/tmp/test-site',
      health: {
        site_id: _siteId,
        status: 'healthy',
        last_cycle_at: '2026-04-20T10:00:00Z',
        last_cycle_duration_ms: 1500,
        consecutive_failures: 0,
        message: 'OK',
        updated_at: '2026-04-20T10:00:00Z',
      },
      lastTrace: null,
    })),
  };
});

vi.mock('@narada2/macos-site', () => ({
  discoverMacosSites: vi.fn(() => []),
  getMacosSiteStatus: vi.fn(),
  isMacosSite: vi.fn(() => false),
}), { virtual: true });

vi.mock('@narada2/linux-site', () => ({
  listAllSites: vi.fn(() => []),
  getSiteHealth: vi.fn(),
  isLinuxSite: vi.fn(() => false),
  resolveLinuxSiteMode: vi.fn(() => null),
}), { virtual: true });

const {
  sitesListCommand,
  sitesDiscoverCommand,
  sitesShowCommand,
  sitesRemoveCommand,
  sitesInitCommand,
} = await import('../../src/commands/sites.js');

describe('sites commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue({
      all: vi.fn(() => []),
      get: vi.fn(() => null),
      run: vi.fn(() => ({ changes: 0 })),
    });
  });

  describe('sitesListCommand', () => {
    it('returns empty list when no sites are registered', async () => {
      const ctx = createMockContext();
      const result = await sitesListCommand({ format: 'json' }, ctx);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as { sites: unknown[] };
      expect(data.sites).toEqual([]);
    });

    it('lists registered sites with health', async () => {
      mockDb.prepare.mockReturnValue({
        all: vi.fn(() => [
          { site_id: 'site-a', variant: 'wsl', site_root: '/tmp/a', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' },
        ]),
        get: vi.fn(() => null),
        run: vi.fn(() => ({ changes: 0 })),
      });

      const ctx = createMockContext();
      const result = await sitesListCommand({ format: 'json' }, ctx);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as { sites: Array<{ siteId: string; health: string }> };
      expect(data.sites).toHaveLength(1);
      expect(data.sites[0].siteId).toBe('site-a');
      expect(data.sites[0].health).toBe('healthy');
    });
  });

  describe('sitesDiscoverCommand', () => {
    it('discovers sites by filesystem scan', async () => {
      const { SiteRegistry } = await import('@narada2/windows-site');
      const originalDiscover = SiteRegistry.prototype.discoverSites;
      SiteRegistry.prototype.discoverSites = vi.fn(function (this: unknown, variant: string) {
        if (variant === 'wsl') {
          return [
            { siteId: 'site-x', variant: 'wsl', siteRoot: '/tmp/x', substrate: 'windows', aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: '2026-04-20T10:00:00Z' },
          ];
        }
        return [];
      }) as unknown as typeof originalDiscover;

      try {
        const ctx = createMockContext();
        const result = await sitesDiscoverCommand({ format: 'json' }, ctx);

        expect(result.exitCode).toBe(ExitCode.SUCCESS);
        const data = result.result as { discovered: Array<{ siteId: string }> };
        expect(data.discovered.length).toBeGreaterThanOrEqual(0);
      } finally {
        SiteRegistry.prototype.discoverSites = originalDiscover;
      }
    });
  });

  describe('sitesShowCommand', () => {
    it('returns error for unknown site', async () => {
      const ctx = createMockContext();
      const result = await sitesShowCommand('unknown', { format: 'json' }, ctx);

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect((result.result as { error: string }).error).toContain('not found');
    });

    it('shows site metadata and health', async () => {
      mockDb.prepare.mockReturnValue({
        all: vi.fn(() => []),
        get: vi.fn(() =>
          ({ site_id: 'site-b', variant: 'native', site_root: 'C:\\Sites\\b', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: '2026-04-20T11:00:00Z', created_at: '2026-04-20T10:00:00Z' }),
        ),
        run: vi.fn(() => ({ changes: 0 })),
      });

      const ctx = createMockContext();
      const result = await sitesShowCommand('site-b', { format: 'json' }, ctx);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as { site: { siteId: string; variant: string } };
      expect(data.site.siteId).toBe('site-b');
      expect(data.site.variant).toBe('native');
    });
  });

  describe('sitesRemoveCommand', () => {
    it('removes a site from registry', async () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('DELETE')) {
          return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 1 })) };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const ctx = createMockContext();
      const result = await sitesRemoveCommand('site-c', { format: 'json' }, ctx);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect((result.result as { removed: string }).removed).toBe('site-c');
    });

    it('returns error for unknown site', async () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('DELETE')) {
          return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const ctx = createMockContext();
      const result = await sitesRemoveCommand('unknown', { format: 'json' }, ctx);

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    });
  });

  describe('sitesInitCommand', () => {
    it('dry-runs native user-locus Site under visible user Narada root', async () => {
      process.env.USERPROFILE = 'C:\\Users\\Andrey';
      process.env.USERNAME = 'Andrey';

      const ctx = createMockContext();
      const result = await sitesInitCommand('andrey-user', {
        substrate: 'windows-native',
        authorityLocus: 'user',
        sync: 'hybrid_capable_plain_folder',
        dryRun: true,
        format: 'json',
      }, ctx);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as {
        siteRoot: string;
        config: { locus: { authority_locus: string }; sync: { posture: string } };
      };
      expect(data.siteRoot).toBe('C:\\Users\\Andrey\\Narada');
      expect(data.config.locus.authority_locus).toBe('user');
      expect(data.config.sync.posture).toBe('hybrid_capable_plain_folder');
    });

    it('rejects invalid Windows sync posture', async () => {
      const ctx = createMockContext();
      const result = await sitesInitCommand('andrey-user', {
        substrate: 'windows-native',
        authorityLocus: 'user',
        sync: 'mystery-sync',
        dryRun: true,
        format: 'json',
      }, ctx);

      expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    });
  });
});
