/**
 * Message Store Benchmarks
 *
 * Measures read/write performance for persistence layer.
 */

import { describe, bench } from 'vitest';
import { benchmark } from './framework.js';
import { FileMessageStore, FileBlobStore } from '../../src/index.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function createMockMessage(id: string) {
  return {
    message_id: id,
    thread_id: `thread-${Math.floor(parseInt(id) / 10)}`,
    container_refs: [{ type: 'folder' as const, id: 'inbox' }],
    received_at: new Date().toISOString(),
    sent_at: new Date().toISOString(),
    subject: `Message ${id}`,
    body_preview: 'This is a test message preview...',
    from: { email: 'sender@example.com', name: 'Sender' },
    to: [{ email: 'recipient@example.com', name: 'Recipient' }],
    is_read: false,
    is_flagged: false,
    importance: 'normal' as const,
  };
}

function createMockMessages(count: number) {
  return Array.from({ length: count }, (_, i) => createMockMessage(String(i)));
}

describe('Message Store', () => {
  bench('write single message', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'store-bench-'));
    const store = new FileMessageStore({ rootDir });

    try {
      const message = createMockMessage('single');

      await benchmark(
        'write-single',
        async () => {
          await store.upsertFromPayload(message);
        },
        { warmupRuns: 5, measurementRuns: 100 },
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('write 100 message batch', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'store-bench-'));
    const store = new FileMessageStore({ rootDir });

    try {
      const messages = createMockMessages(100);

      await benchmark(
        'write-batch-100',
        async () => {
          for (const msg of messages) {
            await store.upsertFromPayload(msg);
          }
        },
        { warmupRuns: 2, measurementRuns: 20 },
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('read random message', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'store-bench-'));
    const store = new FileMessageStore({ rootDir });

    try {
      // Pre-populate store
      const messages = createMockMessages(1000);
      for (const msg of messages) {
        await store.upsertFromPayload(msg);
      }

      let index = 0;
      await benchmark(
        'read-random',
        async () => {
          const msgId = String(index % 1000);
          index++;
          await store.read(msgId);
        },
        { warmupRuns: 5, measurementRuns: 100 },
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('check existence', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'store-bench-'));
    const store = new FileMessageStore({ rootDir });

    try {
      // Pre-populate
      for (let i = 0; i < 1000; i++) {
        await store.upsertFromPayload(createMockMessage(String(i)));
      }

      let index = 0;
      await benchmark(
        'check-exists',
        async () => {
          const msgId = String(index % 1000);
          index++;
          await store.exists(msgId);
        },
        { warmupRuns: 10, measurementRuns: 1000 },
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

describe('Blob Store', () => {
  bench('write small blob (1KB)', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'blob-bench-'));
    const store = new FileBlobStore({ rootDir });

    try {
      const data = Buffer.alloc(1024, 'x');

      await benchmark(
        'blob-write-1kb',
        async () => {
          await store.write('blob-1kb', data);
        },
        { warmupRuns: 5, measurementRuns: 100 },
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('write medium blob (100KB)', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'blob-bench-'));
    const store = new FileBlobStore({ rootDir });

    try {
      const data = Buffer.alloc(100 * 1024, 'x');

      await benchmark(
        'blob-write-100kb',
        async () => {
          await store.write('blob-100kb', data);
        },
        { warmupRuns: 3, measurementRuns: 50 },
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('write large blob (1MB)', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'blob-bench-'));
    const store = new FileBlobStore({ rootDir });

    try {
      const data = Buffer.alloc(1024 * 1024, 'x');

      await benchmark(
        'blob-write-1mb',
        async () => {
          await store.write('blob-1mb', data);
        },
        { warmupRuns: 1, measurementRuns: 10 },
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('read blob', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'blob-bench-'));
    const store = new FileBlobStore({ rootDir });

    try {
      // Pre-write blob
      const data = Buffer.alloc(10 * 1024, 'x');
      await store.write('test-blob', data);

      await benchmark(
        'blob-read',
        async () => {
          await store.read('test-blob');
        },
        { warmupRuns: 5, measurementRuns: 100 },
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

describe('Apply Log Store', () => {
  bench('mark applied', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'applylog-bench-'));
    const { FileApplyLogStore } = require('../../src/persistence/apply-log.js');
    const store = new FileApplyLogStore({ rootDir });

    try {
      let index = 0;
      await benchmark(
        'mark-applied',
        async () => {
          await store.markApplied({
            event_id: `event-${index++}`,
            message_id: `msg-${index}`,
            change_type: 'create',
            received_at: new Date().toISOString(),
          });
        },
        { warmupRuns: 5, measurementRuns: 100 },
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('has applied (check)', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'applylog-bench-'));
    const { FileApplyLogStore } = require('../../src/persistence/apply-log.js');
    const store = new FileApplyLogStore({ rootDir });

    try {
      // Pre-populate
      for (let i = 0; i < 1000; i++) {
        await store.markApplied({
          event_id: `event-${i}`,
          message_id: `msg-${i}`,
          change_type: 'create',
          received_at: new Date().toISOString(),
        });
      }

      let index = 0;
      await benchmark(
        'has-applied',
        async () => {
          await store.hasApplied(`event-${index++ % 1000}`);
        },
        { warmupRuns: 10, measurementRuns: 1000 },
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
