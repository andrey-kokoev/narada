import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  consoleStatusCommand,
  consoleAttentionCommand,
  consoleControlCommand,
} from '../../src/commands/console.js';
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

const mockControlClient = {
  executeControlRequest: vi.fn(),
};

const mockCloudflareControlClient = {
  executeControlRequest: vi.fn(),
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
    windowsSiteAdapter: {
      supports: vi.fn((site: { variant: string }) => site.variant === 'native' || site.variant === 'wsl'),
      createObservationApi: vi.fn((site: { siteId: string; variant: string }) => ({
        getHealth: async () => ({
          site_id: site.siteId,
          status: 'healthy',
          last_cycle_at: '2026-04-20T10:00:00Z',
          last_cycle_duration_ms: 1500,
          consecutive_failures: 0,
          message: 'OK',
          updated_at: '2026-04-20T10:00:00Z',
        }),
        getStuckWorkItems: async () => [
          { work_item_id: 'wi-1', scope_id: 'scope-1', status: 'failed_retryable' as const, context_id: 'ctx-1', last_updated_at: '2026-04-20T10:00:00Z', summary: 'Failed' },
        ],
        getPendingOutboundCommands: async () => [
          { outbound_id: 'ob-1', scope_id: 'scope-1', context_id: 'ctx-1', action_type: 'send_reply', status: 'pending', created_at: '2026-04-20T10:00:00Z', summary: 'Pending' },
        ],
        getPendingDrafts: async () => [
          { draft_id: 'draft-1', scope_id: 'scope-1', context_id: 'ctx-1', status: 'draft_ready' as const, created_at: '2026-04-20T10:00:00Z', summary: 'Draft ready' },
        ],
        getCredentialRequirements: async () => [],
      })),
      createControlClient: vi.fn((site: { siteId: string }) => {
        if (site.siteId === 'site-live' || site.siteId === 'site-x') {
          return mockControlClient;
        }
        return undefined;
      }),
    },
  };
});

vi.mock('@narada2/cloudflare-site', () => ({
  cloudflareSiteAdapter: {
    supports: vi.fn((site: { variant: string; substrate: string }) =>
      site.variant === 'cloudflare' || site.substrate === 'cloudflare'
    ),
    createObservationApi: vi.fn(() => ({
      getHealth: async () => ({
        site_id: 'cf-site',
        status: 'healthy',
        last_cycle_at: '2026-04-20T10:00:00Z',
        last_cycle_duration_ms: 1200,
        consecutive_failures: 0,
        message: 'OK',
        updated_at: '2026-04-20T10:00:00Z',
      }),
      getStuckWorkItems: async () => [],
      getPendingOutboundCommands: async () => [],
      getPendingDrafts: async () => [],
      getCredentialRequirements: async () => [],
    })),
    createControlClient: vi.fn((site: { siteId: string }) => {
      if (site.siteId === 'cf-live') {
        return mockCloudflareControlClient;
      }
      return undefined;
    }),
  },
}));

describe('console commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockControlClient.executeControlRequest.mockReset();
    mockCloudflareControlClient.executeControlRequest.mockReset();
    mockDb.prepare.mockReturnValue({
      all: vi.fn(() => []),
      get: vi.fn(() => null),
      run: vi.fn(() => ({ changes: 0 })),
    });
  });

  describe('consoleStatusCommand', () => {
    it('returns empty summary when no sites are registered', async () => {
      const ctx = createMockContext();
      const result = await consoleStatusCommand({ format: 'json' }, ctx);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as { summary: { total_sites: number } };
      expect(data.summary.total_sites).toBe(0);
    });

    it('aggregates health across registered sites', async () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => [
              { site_id: 'site-a', variant: 'wsl', site_root: '/tmp/a', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' },
              { site_id: 'site-b', variant: 'native', site_root: 'C:\\b', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' },
            ]),
            get: vi.fn(() => null),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const ctx = createMockContext();
      const result = await consoleStatusCommand({ format: 'json' }, ctx);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as { summary: { total_sites: number; healthy: number } };
      expect(data.summary.total_sites).toBe(2);
      expect(data.summary.healthy).toBe(2);
    });

    it('includes Cloudflare site health when registered', async () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => [
              { site_id: 'site-a', variant: 'wsl', site_root: '/tmp/a', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' },
              { site_id: 'cf-live', variant: 'cloudflare', site_root: '', substrate: 'cloudflare', aim_json: null, control_endpoint: 'https://cf.example.com', last_seen_at: null, created_at: '2026-04-20T10:00:00Z' },
            ]),
            get: vi.fn(() => null),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const ctx = createMockContext();
      const result = await consoleStatusCommand({ format: 'json' }, ctx);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as { summary: { total_sites: number } };
      expect(data.summary.total_sites).toBe(2);
    });
  });

  describe('consoleAttentionCommand', () => {
    it('returns empty queue when no sites are registered', async () => {
      const ctx = createMockContext();
      const result = await consoleAttentionCommand({ format: 'json' }, ctx);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as { items: unknown[] };
      expect(data.items).toEqual([]);
    });
  });

  describe('consoleControlCommand', () => {
    it('rejects request for unknown site', async () => {
      const ctx = createMockContext();
      const result = await consoleControlCommand('approve', 'unknown', 'out-1', { format: 'json' }, ctx);

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect((result.result as { detail?: string }).detail).toContain('Site not found');
    });

    it('rejects request when no control client is available', async () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => []),
            get: vi.fn(() =>
              ({ site_id: 'site-no-client', variant: 'cloudflare', site_root: '/tmp/x', substrate: 'cloudflare', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' }),
            ),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const ctx = createMockContext();
      const result = await consoleControlCommand('approve', 'site-no-client', 'out-1', { format: 'json' }, ctx);

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect((result.result as { detail?: string }).detail).toContain('No control client available');
    });

    it('routes successfully when Windows control client is available', async () => {
      mockControlClient.executeControlRequest.mockResolvedValue({
        success: true,
        status: 'accepted' as const,
        detail: 'Approved',
      });

      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => []),
            get: vi.fn(() =>
              ({ site_id: 'site-live', variant: 'wsl', site_root: '/tmp/live', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' }),
            ),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        if (sql.includes('registry_audit_log')) {
          return {
            all: vi.fn(() => []),
            get: vi.fn(() => null),
            run: vi.fn(() => ({ changes: 1 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const ctx = createMockContext();
      const result = await consoleControlCommand('approve', 'site-live', 'out-1', { format: 'json' }, ctx);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(mockControlClient.executeControlRequest).toHaveBeenCalled();
    });

    it('routes successfully when Cloudflare control client is available', async () => {
      mockCloudflareControlClient.executeControlRequest.mockResolvedValue({
        success: true,
        status: 'accepted' as const,
        detail: 'Approved',
      });

      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => []),
            get: vi.fn(() =>
              ({ site_id: 'cf-live', variant: 'cloudflare', site_root: '', substrate: 'cloudflare', aim_json: null, control_endpoint: 'https://cf.example.com', last_seen_at: null, created_at: '2026-04-20T10:00:00Z' }),
            ),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        if (sql.includes('registry_audit_log')) {
          return {
            all: vi.fn(() => []),
            get: vi.fn(() => null),
            run: vi.fn(() => ({ changes: 1 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const ctx = createMockContext();
      const result = await consoleControlCommand('approve', 'cf-live', 'out-1', { format: 'json' }, ctx);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(mockCloudflareControlClient.executeControlRequest).toHaveBeenCalled();
    });

    it('audits the routed request', async () => {
      mockControlClient.executeControlRequest.mockResolvedValue({
        success: false,
        status: 'error' as const,
        detail: 'DB error',
      });

      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => []),
            get: vi.fn(() =>
              ({ site_id: 'site-x', variant: 'wsl', site_root: '/tmp/x', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' }),
            ),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        if (sql.includes('registry_audit_log')) {
          return {
            all: vi.fn(() => []),
            get: vi.fn(() => null),
            run: vi.fn(() => ({ changes: 1 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const ctx = createMockContext();
      const result = await consoleControlCommand('retry', 'site-x', 'wi-1', { format: 'json' }, ctx);

      // Audit is logged regardless of client result
      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    });
  });

  describe('consoleAttentionCommand with live observations', () => {
    it('includes real pending items from registered sites', async () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => [
              { site_id: 'site-a', variant: 'wsl', site_root: '/tmp/a', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' },
            ]),
            get: vi.fn(() => null),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const ctx = createMockContext();
      const result = await consoleAttentionCommand({ format: 'json' }, ctx);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as { items: Array<{ item_type: string }> };
      expect(data.items.length).toBeGreaterThan(0);
      expect(data.items.some((i) => i.item_type === 'stuck_work_item')).toBe(true);
      expect(data.items.some((i) => i.item_type === 'pending_outbound_command')).toBe(true);
      expect(data.items.some((i) => i.item_type === 'pending_draft')).toBe(true);
    });
  });
});
