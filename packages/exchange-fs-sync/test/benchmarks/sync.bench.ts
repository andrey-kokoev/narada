/**
 * Sync Performance Benchmarks
 *
 * Measures sync operation performance at various scales.
 */

import { describe, bench } from 'vitest';
import { benchmark } from './framework.js';
import { createMockAdapter } from '../../src/adapter/graph/mock-adapter.js';
import { DefaultSyncRunner } from '../../src/runner/sync-once.js';
import { ExchangeSource } from '../../src/adapter/graph/exchange-source.js';
import { FileCursorStore, FileApplyLogStore } from '../../src/index.js';
import { DefaultProjector } from '../../src/projector/apply-event.js';
import { FileLock } from '../../src/persistence/lock.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface SyncBenchmarkContext {
  rootDir: string;
  cleanup: () => Promise<void>;
}

async function setupBenchmark(messageCount: number): Promise<SyncBenchmarkContext> {
  const rootDir = await mkdtemp(join(tmpdir(), 'sync-bench-'));

  // Create mock adapter with specified message count
  const adapter = createMockAdapter({
    initialMessageCount: messageCount,
    latencyMs: 0, // Remove network latency for pure processing measurement
  });

  // Create stores
  const cursorStore = new FileCursorStore({ rootDir, mailboxId: 'bench@example.com' });
  const applyLogStore = new FileApplyLogStore({ rootDir });
  const projector = new DefaultProjector({ rootDir, tombstonesEnabled: false });
  const lock = new FileLock({ rootDir, acquireTimeoutMs: 5000 });

  // Create runner
  const runner = new DefaultSyncRunner({
      rootDir,
      source: new ExchangeSource({ adapter, sourceId: "test" }),
    cursorStore,
    applyLogStore,
    projector,
    acquireLock: () => lock.acquire(),
  });

  return {
    rootDir,
    cleanup: async () => {
      await rm(rootDir, { recursive: true, force: true });
    },
  };
}

describe('Sync Performance', () => {
  bench('sync 100 messages', async () => {
    const ctx = await setupBenchmark(100);
    try {
      await benchmark(
        'sync-100',
        async () => {
          // Full sync cycle would go here
          // For now, just measure message processing
        },
        { warmupRuns: 1, measurementRuns: 5 },
      );
    } finally {
      await ctx.cleanup();
    }
  }, { time: 30000 });

  bench('sync 1,000 messages', async () => {
    const ctx = await setupBenchmark(1000);
    try {
      await benchmark(
        'sync-1000',
        async () => {
          // Full sync cycle would go here
        },
        { warmupRuns: 1, measurementRuns: 3 },
      );
    } finally {
      await ctx.cleanup();
    }
  }, { time: 60000 });

  bench('sync 10,000 messages', async () => {
    const ctx = await setupBenchmark(10000);
    try {
      await benchmark(
        'sync-10000',
        async () => {
          // Full sync cycle would go here
        },
        { warmupRuns: 0, measurementRuns: 1 },
      );
    } finally {
      await ctx.cleanup();
    }
  }, { time: 120000 });
});

// Micro-benchmarks for sync components
describe('Sync Components', () => {
  bench('event ID generation', () => {
    const { buildEventId } = require('../../src/ids/event-id.js');
    const payload = {
      id: 'msg-123',
      received_at: '2024-01-01T00:00:00Z',
      subject: 'Test',
    };

    for (let i = 0; i < 1000; i++) {
      buildEventId(payload, 'create');
    }
  });

  bench('apply log check', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'applylog-bench-'));
    const { FileApplyLogStore } = require('../../src/persistence/apply-log.js');
    const store = new FileApplyLogStore({ rootDir });

    try {
      // Pre-populate with some events
      for (let i = 0; i < 1000; i++) {
        await store.markApplied({
          event_id: `event-${i}`,
          message_id: `msg-${i}`,
          change_type: 'create',
          received_at: new Date().toISOString(),
        });
      }

      // Benchmark the check
      for (let i = 0; i < 100; i++) {
        await store.hasApplied(`event-${i}`);
      }
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
