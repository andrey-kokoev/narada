/**
 * Memory Benchmarks
 *
 * Detects memory leaks and measures memory usage patterns.
 */

import { describe, bench, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface MemoryResult {
  heapBeforeMB: number;
  heapAfterMB: number;
  heapMaxMB: number;
  leakedMB: number;
}

/**
 * Run a function and measure memory usage
 */
export async function memoryBenchmark(
  fn: () => Promise<void>,
  iterations = 1,
): Promise<MemoryResult> {
  // Force GC if available (--expose-gc flag)
  if (global.gc) {
    global.gc();
  }

  // Wait for any pending cleanup
  await new Promise(r => setTimeout(r, 100));

  const before = process.memoryUsage().heapUsed;
  let max = before;

  for (let i = 0; i < iterations; i++) {
    await fn();

    const current = process.memoryUsage().heapUsed;
    if (current > max) {
      max = current;
    }
  }

  // Force GC again
  if (global.gc) {
    global.gc();
  }
  await new Promise(r => setTimeout(r, 100));

  const after = process.memoryUsage().heapUsed;

  return {
    heapBeforeMB: before / 1024 / 1024,
    heapAfterMB: after / 1024 / 1024,
    heapMaxMB: max / 1024 / 1024,
    leakedMB: (after - before) / 1024 / 1024,
  };
}

describe('Memory: Sync Operations', () => {
  bench('sync 100 messages - no leak', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'mem-bench-'));
    const { createMockAdapter } = require('../../src/adapter/graph/mock-adapter.js');
    const { DefaultSyncRunner } = require('../../src/runner/sync-once.js');
    const { FileCursorStore } = require('../../src/persistence/cursor.js');
    const { FileApplyLogStore } = require('../../src/persistence/apply-log.js');
    const { DefaultProjector } = require('../../src/projector/apply-event.js');
    const { FileLock } = require('../../src/persistence/lock.js');

    try {
      const mem = await memoryBenchmark(async () => {
        const adapter = createMockAdapter({ initialMessageCount: 100 });
        const cursorStore = new FileCursorStore({ rootDir, mailboxId: 'test@example.com' });
        const applyLogStore = new FileApplyLogStore({ rootDir });
        const projector = new DefaultProjector({ rootDir, tombstonesEnabled: false });
        const lock = new FileLock({ rootDir, acquireTimeoutMs: 5000 });

        const runner = new DefaultSyncRunner({
      rootDir,
      source: new ExchangeSource({ adapter, sourceId: "test" }),
          cursorStore,
          applyLogStore,
          projector,
          acquireLock: () => lock.acquire(),
        });

        await runner.syncOnce();
      }, 3);

      // Assert no significant leak
      expect(mem.leakedMB).toBeLessThan(50);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  }, { time: 60000 });

  bench('sync 1000 messages - memory stable', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'mem-bench-'));

    try {
      const mem = await memoryBenchmark(async () => {
        const { createMockAdapter } = require('../../src/adapter/graph/mock-adapter.js');
        const { DefaultSyncRunner } = require('../../src/runner/sync-once.js');
        const { ExchangeSource } = require('../../src/adapter/graph/exchange-source.js');
        const { FileCursorStore } = require('../../src/persistence/cursor.js');
        const { FileApplyLogStore } = require('../../src/persistence/apply-log.js');
        const { DefaultProjector } = require('../../src/projector/apply-event.js');
        const { FileLock } = require('../../src/persistence/lock.js');

        const adapter = createMockAdapter({ initialMessageCount: 1000 });
        const cursorStore = new FileCursorStore({ rootDir, mailboxId: 'test@example.com' });
        const applyLogStore = new FileApplyLogStore({ rootDir });
        const projector = new DefaultProjector({ rootDir, tombstonesEnabled: false });
        const lock = new FileLock({ rootDir, acquireTimeoutMs: 5000 });

        const runner = new DefaultSyncRunner({
      rootDir,
      source: new ExchangeSource({ adapter, sourceId: "test" }),
          cursorStore,
          applyLogStore,
          projector,
          acquireLock: () => lock.acquire(),
        });

        await runner.syncOnce();
      }, 1);

      expect(mem.heapMaxMB).toBeLessThan(500); // Shouldn't exceed 500MB
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  }, { time: 120000 });
});

describe('Memory: Store Operations', () => {
  bench('message store batch - no leak', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'mem-bench-'));
    const { FileMessageStore } = require('../../src/persistence/messages.js');

    try {
      const mem = await memoryBenchmark(async () => {
        const store = new FileMessageStore({ rootDir });

        for (let i = 0; i < 100; i++) {
          await store.upsertFromPayload({
            message_id: `msg-${i}`,
            conversation_id: `thread-${i}`,
            container_refs: [{ type: 'folder', id: 'inbox' }],
            received_at: new Date().toISOString(),
            sent_at: new Date().toISOString(),
            subject: `Message ${i}`,
            body_preview: 'Preview...',
            from: { email: 'test@example.com', name: 'Test' },
            to: [],
            is_read: false,
            is_flagged: false,
            importance: 'normal',
          });
        }
      }, 5);

      expect(mem.leakedMB).toBeLessThan(10);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('blob store - memory efficiency', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'mem-bench-'));
    const { FileBlobStore } = require('../../src/persistence/blobs.js');

    try {
      const store = new FileBlobStore({ rootDir });
      const data = Buffer.alloc(1024 * 1024, 'x'); // 1MB blob

      const mem = await memoryBenchmark(async () => {
        for (let i = 0; i < 10; i++) {
          await store.write(`blob-${i}`, data);
        }
      }, 3);

      // Should stream to disk, not keep in memory
      expect(mem.leakedMB).toBeLessThan(50);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

describe('Memory: Adapter Operations', () => {
  bench('normalization - no leak', async () => {
    const { normalizeMessage } = require('../../src/normalize/message.js');

    const message = {
      id: 'test-123',
      subject: 'Test Subject',
      bodyPreview: 'Preview content...',
      receivedDateTime: new Date().toISOString(),
      from: { emailAddress: { name: 'Test', address: 'test@example.com' } },
      toRecipients: [],
    };

    const mem = await memoryBenchmark(async () => {
      for (let i = 0; i < 1000; i++) {
        normalizeMessage(message, {
          mailbox_id: 'test@example.com',
          body_policy: 'preview',
          attachment_policy: 'none',
          include_headers: false,
        });
      }
    }, 10);

    expect(mem.leakedMB).toBeLessThan(5);
  });

  bench('event ID generation - no leak', async () => {
    const { buildEventId } = require('../../src/ids/event-id.js');

    const payload = {
      id: 'msg-123',
      received_at: new Date().toISOString(),
      subject: 'Test',
    };

    const mem = await memoryBenchmark(async () => {
      for (let i = 0; i < 10000; i++) {
        buildEventId(payload, 'create');
      }
    }, 10);

    expect(mem.leakedMB).toBeLessThan(1);
  });
});

// Memory stress test
describe('Memory: Stress Tests', () => {
  bench('repeated sync cycles - stable memory', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'mem-bench-'));

    try {
      let maxMemory = 0;
      const measurements: number[] = [];

      for (let cycle = 0; cycle < 10; cycle++) {
        if (global.gc) global.gc();
        const before = process.memoryUsage().heapUsed;

        const { createMockAdapter } = require('../../src/adapter/graph/mock-adapter.js');
        const { DefaultSyncRunner } = require('../../src/runner/sync-once.js');
        const { ExchangeSource } = require('../../src/adapter/graph/exchange-source.js');
        const { FileCursorStore } = require('../../src/persistence/cursor.js');
        const { FileApplyLogStore } = require('../../src/persistence/apply-log.js');
        const { DefaultProjector } = require('../../src/projector/apply-event.js');
        const { FileLock } = require('../../src/persistence/lock.js');

        const adapter = createMockAdapter({ initialMessageCount: 50 });
        const cursorStore = new FileCursorStore({ rootDir, mailboxId: 'test@example.com' });
        const applyLogStore = new FileApplyLogStore({ rootDir });
        const projector = new DefaultProjector({ rootDir, tombstonesEnabled: false });
        const lock = new FileLock({ rootDir, acquireTimeoutMs: 5000 });

        const runner = new DefaultSyncRunner({
      rootDir,
      source: new ExchangeSource({ adapter, sourceId: "test" }),
          cursorStore,
          applyLogStore,
          projector,
          acquireLock: () => lock.acquire(),
        });

        await runner.syncOnce();

        if (global.gc) global.gc();
        const after = process.memoryUsage().heapUsed;

        measurements.push(after);
        if (after > maxMemory) maxMemory = after;
      }

      // Memory should not grow unbounded
      const growth = measurements[measurements.length - 1] - measurements[0];
      expect(growth / 1024 / 1024).toBeLessThan(100); // Less than 100MB growth
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  }, { time: 120000 });
});
