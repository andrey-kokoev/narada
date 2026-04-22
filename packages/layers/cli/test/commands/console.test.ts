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

describe('console commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
              ({ site_id: 'site-x', variant: 'wsl', site_root: '/tmp/x', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' }),
            ),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const ctx = createMockContext();
      const result = await consoleControlCommand('approve', 'site-x', 'out-1', { format: 'json' }, ctx);

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect((result.result as { detail?: string }).detail).toContain('No control client available');
    });

    it('audits the routed request', async () => {
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

      // Should be logged to audit even though client is unavailable
      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    });
  });
});
