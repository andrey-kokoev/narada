import { describe, expect, it, vi, beforeEach } from 'vitest';
import { opsCommand } from '../../src/commands/ops.js';
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

const mockDb = {
  exec: vi.fn(),
  prepare: vi.fn(() => ({ all: vi.fn(() => []), get: vi.fn(() => null) })),
  close: vi.fn(),
};

vi.mock('@narada2/control-plane', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@narada2/control-plane')>();
  return {
    ...mod,
    Database: vi.fn(() => mockDb),
  };
});

describe('ops command', () => {
  beforeEach(() => {
    vol.reset();
    vol.mkdirSync('/tmp', { recursive: true });
    vol.mkdirSync('/test', { recursive: true });
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue({ all: vi.fn(() => []), get: vi.fn(() => null) });
  });

  it('reports failing health when daemon is known to be down', async () => {
    vol.fromJSON({
      '/test/config.json': JSON.stringify(createConfig('test@example.com', '/test/data')),
    });
    vol.mkdirSync('/test/data', { recursive: true });

    const context = createMockContext();
    const result = await opsCommand({ format: 'json', limit: 5 }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const report = (result.result as { reports: Array<{ health: { overall: string; daemonRunning?: boolean } }> }).reports[0];
    // daemonRunning is false (known state), so overall is failing, not unknown
    expect(report.health.overall).toBe('failing');
    expect(report.health.daemonRunning).toBe(false);
  });

  it('reports healthy when daemon is running and health file is good', async () => {
    vol.fromJSON({
      '/test/config.json': JSON.stringify(createConfig('test@example.com', '/test/data')),
      '/test/data/daemon.pid': String(process.pid),
      '/test/data/.health.json': JSON.stringify({
        readiness: {
          dispatchReady: true,
          outboundHealthy: true,
          syncFresh: true,
          charterRuntimeHealthy: true,
        },
      }),
    });
    vol.mkdirSync('/test/data/.narada', { recursive: true });
    vol.writeFileSync('/test/data/.narada/coordinator.db', '');

    mockDb.prepare.mockReturnValue({
      all: vi.fn(() => []),
      get: vi.fn(() => null),
    });

    const context = createMockContext();
    const result = await opsCommand({ format: 'json', limit: 5 }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const report = (result.result as { reports: Array<{ health: { overall: string; daemonRunning?: boolean } }> }).reports[0];
    expect(report.health.overall).toBe('healthy');
    expect(report.health.daemonRunning).toBe(true);
  });

  it('detects daemon via narada-daemon.pid fallback', async () => {
    vol.fromJSON({
      '/test/config.json': JSON.stringify(createConfig('test@example.com', '/test/data')),
      '/test/data/narada-daemon.pid': String(process.pid),
      '/test/data/.health.json': JSON.stringify({
        readiness: { dispatchReady: true, outboundHealthy: true, syncFresh: true, charterRuntimeHealthy: true },
      }),
    });
    vol.mkdirSync('/test/data/.narada', { recursive: true });
    vol.writeFileSync('/test/data/.narada/coordinator.db', '');

    mockDb.prepare.mockReturnValue({
      all: vi.fn(() => []),
      get: vi.fn(() => null),
    });

    const context = createMockContext();
    const result = await opsCommand({ format: 'json', limit: 5 }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const report = (result.result as { reports: Array<{ health: { daemonRunning?: boolean } }> }).reports[0];
    expect(report.health.daemonRunning).toBe(true);
  });

  it('shows drafts pending review', async () => {
    vol.fromJSON({
      '/test/config.json': JSON.stringify(createConfig('test@example.com', '/test/data')),
      '/test/data/daemon.pid': String(process.pid),
      '/test/data/.health.json': JSON.stringify({
        readiness: { dispatchReady: true, outboundHealthy: true, syncFresh: true, charterRuntimeHealthy: true },
      }),
    });
    vol.mkdirSync('/test/data/.narada', { recursive: true });
    vol.writeFileSync('/test/data/.narada/coordinator.db', '');

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('outbound_handoffs oh') && sql.includes("draft_ready")) {
        return {
          all: vi.fn(() => [
            {
              outbound_id: 'out-1',
              action_type: 'draft_reply',
              context_id: 'mail:test',
              created_at: '2026-04-20T10:00:00Z',
              payload_json: JSON.stringify({ subject: 'Re: Login issue' }),
            },
          ]),
          get: vi.fn(),
        };
      }
      return { all: vi.fn(() => []), get: vi.fn(() => null) };
    });

    const context = createMockContext();
    const result = await opsCommand({ format: 'json', limit: 5 }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const report = (result.result as { reports: Array<{ draftsPendingReview: Array<{ outbound_id: string }> }> }).reports[0];
    expect(report.draftsPendingReview).toHaveLength(1);
    expect(report.draftsPendingReview[0].outbound_id).toBe('out-1');
  });

  it('shows stuck work items in attention queue', async () => {
    vol.fromJSON({
      '/test/config.json': JSON.stringify(createConfig('test@example.com', '/test/data')),
      '/test/data/daemon.pid': String(process.pid),
      '/test/data/.health.json': JSON.stringify({
        readiness: { dispatchReady: true, outboundHealthy: true, syncFresh: true, charterRuntimeHealthy: true },
      }),
    });
    vol.mkdirSync('/test/data/.narada', { recursive: true });
    vol.writeFileSync('/test/data/.narada/coordinator.db', '');

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('work_items wi') && sql.includes("datetime('now', '-60 minutes')")) {
        return {
          all: vi.fn(() => [
            {
              work_item_id: 'wi-1',
              status: 'opened',
              updated_at: '2026-04-20T08:00:00Z',
              created_at: '2026-04-20T08:00:00Z',
              context_id: 'mail:test',
            },
          ]),
          get: vi.fn(),
        };
      }
      return { all: vi.fn(() => []), get: vi.fn(() => null) };
    });

    const context = createMockContext();
    const result = await opsCommand({ format: 'json', limit: 5 }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const report = (result.result as { reports: Array<{ attentionQueue: Array<{ id: string }> }> }).reports[0];
    expect(report.attentionQueue.length).toBeGreaterThan(0);
    expect(report.attentionQueue.some((a) => a.id === 'wi-1')).toBe(true);
  });

  it('suggests actions based on current state', async () => {
    vol.fromJSON({
      '/test/config.json': JSON.stringify(createConfig('test@example.com', '/test/data')),
    });
    vol.mkdirSync('/test/data', { recursive: true });

    const context = createMockContext();
    const result = await opsCommand({ format: 'json', limit: 5 }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const report = (result.result as { reports: Array<{ suggestedActions: string[] }> }).reports[0];
    expect(report.suggestedActions.length).toBeGreaterThan(0);
    expect(report.suggestedActions.some((a) => a.includes('daemon'))).toBe(true);
  });

  it('fails with invalid config', async () => {
    vol.fromJSON({});
    const context = createMockContext();
    const result = await opsCommand({ format: 'json', limit: 5 }, context);
    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
  });
});
