import { describe, expect, it, vi, beforeEach } from 'vitest';
import { doctorCommand } from '../../src/commands/doctor.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { vol } from 'memfs';
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
    logger: createMockLogger(),
    verbose: false,
    ...overrides,
  };
}

function createConfig(scopeId: string, rootDir: string) {
  return {
    root_dir: rootDir,
    scopes: [
      {
        scope_id: scopeId,
        root_dir: rootDir,
        sources: [{ type: 'mock' }],
        context_strategy: 'mail',
        scope: { included_container_refs: ['inbox'], included_item_kinds: ['message'] },
        normalize: {
          attachment_policy: 'metadata_only',
          body_policy: 'text_only',
          include_headers: false,
          tombstones_enabled: true,
        },
        runtime: {
          polling_interval_ms: 60000,
          acquire_lock_timeout_ms: 30000,
          cleanup_tmp_on_startup: true,
          rebuild_views_after_sync: false,
          rebuild_search_after_sync: false,
        },
        policy: {
          primary_charter: 'support_steward',
          allowed_actions: ['draft_reply', 'send_reply', 'mark_read', 'no_action'],
        },
      },
    ],
  };
}

// Mock Database to avoid native SQLite dependency in memfs environment
const mockDb = {
  exec: vi.fn(),
  prepare: vi.fn(() => ({ get: vi.fn(), run: vi.fn() })),
  close: vi.fn(),
};

vi.mock('@narada2/control-plane', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@narada2/control-plane')>();
  return {
    ...mod,
    Database: vi.fn(() => mockDb),
  };
});

vi.mock('@narada2/charters', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@narada2/charters')>();
  return {
    ...mod,
    CodexCharterRunner: vi.fn().mockImplementation(() => ({
      probeHealth: vi.fn().mockResolvedValue({
        class: 'healthy',
        checked_at: new Date().toISOString(),
        details: 'API reachable.',
      }),
    })),
    MockCharterRunner: vi.fn().mockImplementation(() => ({
      probeHealth: vi.fn().mockResolvedValue({
        class: 'unconfigured',
        checked_at: new Date().toISOString(),
        details: 'Mock runtime.',
      }),
    })),
    KimiCliCharterRunner: vi.fn().mockImplementation(() => ({
      probeHealth: vi.fn().mockResolvedValue({
        class: 'healthy',
        checked_at: new Date().toISOString(),
        details: 'Kimi CLI ready.',
      }),
    })),
  };
});

describe('doctor command', () => {
  beforeEach(() => {
    vol.reset();
    vol.mkdirSync('/tmp', { recursive: true });
    vol.mkdirSync('/test', { recursive: true });
    vi.clearAllMocks();
  });

  it('reports healthy with warnings when no daemon is running yet', async () => {
    vol.fromJSON({
      '/test/config.json': JSON.stringify(createConfig('test@example.com', '/test/data')),
    });
    vol.mkdirSync('/test/data', { recursive: true });

    const context = createMockContext();
    const result = await doctorCommand({ format: 'json' }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const report = result.result as { overall: string; scopes: Array<{ status: string; checks: Array<{ name: string; status: string }> }> };
    expect(report.overall).toBe('healthy');
    const scope = report.scopes[0];
    expect(scope.status).toBe('healthy');
    expect(scope.checks.find((c) => c.name === 'daemon-process')?.status).toBe('warn');
    expect(scope.checks.find((c) => c.name === 'health-file')?.status).toBe('warn');
    expect(scope.checks.find((c) => c.name === 'work-queue')?.status).toBe('warn');
  });

  it('reports healthy when daemon running, health ok, and no failures', async () => {
    vol.fromJSON({
      '/test/config.json': JSON.stringify({
        ...createConfig('test@example.com', '/test/data'),
        scopes: [
          {
            ...createConfig('test@example.com', '/test/data').scopes[0],
            charter: { runtime: 'codex-api', api_key: 'test-key' },
          },
        ],
      }),
      '/test/data/daemon.pid': String(process.pid),
      '/test/data/.health.json': JSON.stringify({
        status: 'healthy',
        lastSyncAt: new Date().toISOString(),
        cyclesCompleted: 5,
        errors: 0,
        consecutiveErrors: 0,
        pid: process.pid,
        timestamp: new Date().toISOString(),
      }),
    });
    vol.mkdirSync('/test/data/.narada', { recursive: true });
    vol.writeFileSync('/test/data/.narada/coordinator.db', '');

    mockDb.prepare.mockReturnValue({
      get: vi.fn(() => ({ retryable: 0, terminal: 0 })),
    });

    const context = createMockContext();
    const result = await doctorCommand({ format: 'json' }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const report = result.result as { overall: string; scopes: Array<{ status: string; checks: Array<{ name: string; status: string }> }> };
    expect(report.overall).toBe('healthy');
    const scope = report.scopes[0];
    expect(scope.checks.find((c) => c.name === 'daemon-process')?.status).toBe('pass');
    expect(scope.checks.find((c) => c.name === 'health-file')?.status).toBe('pass');
    expect(scope.checks.find((c) => c.name === 'sync-freshness')?.status).toBe('pass');
    expect(scope.checks.find((c) => c.name === 'work-queue')?.status).toBe('pass');
    expect(scope.checks.find((c) => c.name === 'charter-runtime')?.status).toBe('pass');
  });

  it('accepts kimi-cli as a real charter runtime', async () => {
    vol.fromJSON({
      '/test/config.json': JSON.stringify({
        ...createConfig('test@example.com', '/test/data'),
        scopes: [
          {
            ...createConfig('test@example.com', '/test/data').scopes[0],
            charter: { runtime: 'kimi-cli', cli_path: 'kimi' },
          },
        ],
      }),
      '/test/data/daemon.pid': String(process.pid),
      '/test/data/.health.json': JSON.stringify({
        status: 'healthy',
        lastSyncAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      }),
    });
    vol.mkdirSync('/test/data/.narada', { recursive: true });
    vol.writeFileSync('/test/data/.narada/coordinator.db', '');
    mockDb.prepare.mockReturnValue({
      get: vi.fn(() => ({ retryable: 0, terminal: 0 })),
    });

    const result = await doctorCommand({ format: 'json' }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const report = result.result as { scopes: Array<{ checks: Array<{ name: string; status: string; detail: string }> }> };
    const runtime = report.scopes[0].checks.find((c) => c.name === 'charter-runtime');
    expect(runtime?.status).toBe('pass');
    expect(runtime?.detail).toContain('Kimi CLI ready');
  });

  it('warns when terminal work item history exists', async () => {
    vol.fromJSON({
      '/test/config.json': JSON.stringify(createConfig('test@example.com', '/test/data')),
      '/test/data/daemon.pid': String(process.pid),
      '/test/data/.health.json': JSON.stringify({
        status: 'healthy',
        lastSyncAt: new Date().toISOString(),
        cyclesCompleted: 5,
        errors: 0,
        consecutiveErrors: 0,
        pid: process.pid,
        timestamp: new Date().toISOString(),
      }),
    });
    vol.mkdirSync('/test/data/.narada', { recursive: true });
    vol.writeFileSync('/test/data/.narada/coordinator.db', '');

    mockDb.prepare.mockReturnValue({
      get: vi.fn(() => ({ retryable: 0, terminal: 1 })),
    });

    const context = createMockContext();
    const result = await doctorCommand({ format: 'json' }, context);

    const report = result.result as { overall: string; scopes: Array<{ status: string; checks: Array<{ name: string; status: string }> }> };
    const workQueue = report.scopes[0].checks.find((c) => c.name === 'work-queue');
    expect(workQueue?.status).toBe('warn');
    expect(workQueue?.detail).toContain('failed_terminal');
  });

  it('fails when retryable work items exist', async () => {
    vol.fromJSON({
      '/test/config.json': JSON.stringify(createConfig('test@example.com', '/test/data')),
      '/test/data/daemon.pid': String(process.pid),
      '/test/data/.health.json': JSON.stringify({
        status: 'healthy',
        lastSyncAt: new Date().toISOString(),
        cyclesCompleted: 5,
        errors: 0,
        consecutiveErrors: 0,
        pid: process.pid,
        timestamp: new Date().toISOString(),
      }),
    });
    vol.mkdirSync('/test/data/.narada', { recursive: true });
    vol.writeFileSync('/test/data/.narada/coordinator.db', '');

    mockDb.prepare.mockReturnValue({
      get: vi.fn(() => ({ retryable: 1, terminal: 0 })),
    });

    const context = createMockContext();
    const result = await doctorCommand({ format: 'json' }, context);

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const report = result.result as { overall: string; scopes: Array<{ status: string; checks: Array<{ name: string; status: string }> }> };
    expect(report.overall).toBe('degraded');
    const workQueue = report.scopes[0].checks.find((c) => c.name === 'work-queue');
    expect(workQueue?.status).toBe('fail');
    expect(workQueue?.detail).toContain('failed_retryable');
  });

  it('fails with invalid config', async () => {
    vol.fromJSON({});
    const context = createMockContext();
    const result = await doctorCommand({ format: 'json' }, context);
    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
  });
});
