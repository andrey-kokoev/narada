import { describe, expect, it, vi } from 'vitest';
import { statusCommand } from '../../src/commands/status.js';
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

function createTestConfig(): Record<string, unknown> {
  return {
    mailbox_id: 'test@example.com',
    root_dir: '/test/data',
    graph: {
      user_id: 'test@example.com',
      prefer_immutable_ids: true,
    },
    scope: {
      included_container_refs: ['inbox'],
      included_item_kinds: ['message'],
    },
  };
}

describe('status command', () => {
  it('shows empty status when no data exists', async () => {
    const config = createTestConfig();
    vol.fromJSON({
      '/test/config.json': JSON.stringify(config, null, 2),
    });

    const context = createMockContext();
    const result = await statusCommand({}, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      health: 'empty',
      mailbox: {
        id: 'test@example.com',
        rootDir: '/test/data',
      },
    });
  });

  it('shows healthy status when recent sync exists', async () => {
    const config = createTestConfig();
    const now = new Date().toISOString();

    vol.fromJSON({
      '/test/config.json': JSON.stringify(config, null, 2),
      '/test/data/state/cursor.json': JSON.stringify({ cursor: 'test-cursor' }),
      '/test/data/state/apply-log/2024-01-15T10-30-00.000Z.json': JSON.stringify({
        applied_at: now,
        events: [{ event_id: 'evt-1' }],
      }),
      '/test/data/messages/msg-001/record.json': JSON.stringify({
        message_id: 'msg-001',
        subject: 'Test',
      }),
    });

    const context = createMockContext();
    const result = await statusCommand({}, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      health: 'healthy',
      storage: {
        messageCount: 1,
        applyLogCount: 1,
      },
      sync: {
        cursor: 'test-cursor',
      },
    });
  });

  it('shows stale status when sync is old', async () => {
    const config = createTestConfig();
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 2); // 2 days ago

    vol.fromJSON({
      '/test/config.json': JSON.stringify(config, null, 2),
      '/test/data/state/cursor.json': JSON.stringify({ cursor: 'test-cursor' }),
      '/test/data/state/apply-log/2024-01-13T10-30-00.000Z.json': JSON.stringify({
        applied_at: oldDate.toISOString(),
        events: [{ event_id: 'evt-1' }],
      }),
      '/test/data/messages/msg-001/record.json': JSON.stringify({
        message_id: 'msg-001',
        subject: 'Test',
      }),
    });

    const context = createMockContext();
    const result = await statusCommand({}, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      health: 'stale',
    });
  });

  it('returns error when config is invalid', async () => {
    vol.fromJSON({
      '/test/config.json': 'invalid json',
    });

    const context = createMockContext();
    const result = await statusCommand({}, context);

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      health: 'error',
    });
  });

  it('counts multiple messages correctly', async () => {
    const config = createTestConfig();
    const now = new Date().toISOString();

    vol.fromJSON({
      '/test/config.json': JSON.stringify(config, null, 2),
      '/test/data/state/cursor.json': JSON.stringify({ cursor: 'test-cursor' }),
      '/test/data/state/apply-log/2024-01-15T10-30-00.000Z.json': JSON.stringify({
        applied_at: now,
        events: [],
      }),
      '/test/data/state/apply-log/2024-01-15T11-00-00.000Z.json': JSON.stringify({
        applied_at: now,
        events: [],
      }),
      '/test/data/messages/msg-001/record.json': JSON.stringify({ message_id: 'msg-001' }),
      '/test/data/messages/msg-002/record.json': JSON.stringify({ message_id: 'msg-002' }),
      '/test/data/messages/msg-003/record.json': JSON.stringify({ message_id: 'msg-003' }),
      '/test/data/tombstones/ts-001.json': JSON.stringify({ message_id: 'ts-001' }),
      '/test/data/tombstones/ts-002.json': JSON.stringify({ message_id: 'ts-002' }),
      '/test/data/views/by-folder/inbox/msg-001.json': JSON.stringify({}),
      '/test/data/views/by-folder/inbox/msg-002.json': JSON.stringify({}),
    });

    const context = createMockContext();
    const result = await statusCommand({}, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      storage: {
        messageCount: 3,
        tombstoneCount: 2,
        viewFolderCount: 1, // by-folder
        applyLogCount: 2,
      },
    });
  });

  it('includes readiness from .health.json when daemon is running', async () => {
    const config = createTestConfig();
    vol.fromJSON({
      '/test/config.json': JSON.stringify(config, null, 2),
      '/test/data/.health.json': JSON.stringify({
        status: 'healthy',
        readiness: {
          dispatchReady: true,
          outboundHealthy: true,
          workersRegistered: true,
          syncFresh: true,
        },
        isStale: false,
        thresholds: {
          maxStalenessMs: 300000,
          maxConsecutiveErrors: 3,
        },
      }),
    });

    const context = createMockContext();
    const result = await statusCommand({}, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      readiness: {
        dispatchReady: true,
        outboundHealthy: true,
        workersRegistered: true,
        syncFresh: true,
      },
      isStale: false,
      thresholds: {
        maxStalenessMs: 300000,
        maxConsecutiveErrors: 3,
      },
    });
  });

  it('handles verbose mode', async () => {
    const config = createTestConfig();
    vol.fromJSON({
      '/test/config.json': JSON.stringify(config, null, 2),
    });

    const logger = createMockLogger();
    const context = createMockContext({ logger, verbose: true });
    const result = await statusCommand({ verbose: true }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(logger.info).toHaveBeenCalledWith('Loading config', expect.any(Object));
  });
});
