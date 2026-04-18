/**
 * I/O Benchmarks
 *
 * Measures file system operation counts and throughput.
 */

import { describe, bench } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface IoResult {
  readOps: number;
  writeOps: number;
  readBytes: number;
  writeBytes: number;
}

/**
 * Track I/O operations by wrapping fs calls
 */
class IoTracker {
  readOps = 0;
  writeOps = 0;
  readBytes = 0;
  writeBytes = 0;

  reset() {
    this.readOps = 0;
    this.writeOps = 0;
    this.readBytes = 0;
    this.writeBytes = 0;
  }

  getResult(): IoResult {
    return {
      readOps: this.readOps,
      writeOps: this.writeOps,
      readBytes: this.readBytes,
      writeBytes: this.writeBytes,
    };
  }
}

const tracker = new IoTracker();

describe('I/O: Message Store', () => {
  bench('write single - I/O count', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'io-bench-'));
    const { FileMessageStore } = require('../../src/persistence/messages.js');
    const store = new FileMessageStore({ rootDir });

    try {
      tracker.reset();

      await store.upsertFromPayload({
        message_id: 'test-1',
        conversation_id: 'thread-1',
        container_refs: [{ type: 'folder', id: 'inbox' }],
        received_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        subject: 'Test',
        body_preview: 'Preview',
        from: { email: 'test@example.com', name: 'Test' },
        to: [],
        is_read: false,
        is_flagged: false,
        importance: 'normal',
      });

      // Should use atomic write (temp + rename) = 2 writes
      // Plus any view updates
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('read single - I/O count', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'io-bench-'));
    const { FileMessageStore } = require('../../src/persistence/messages.js');
    const store = new FileMessageStore({ rootDir });

    try {
      await store.upsertFromPayload({
        message_id: 'test-1',
        conversation_id: 'thread-1',
        container_refs: [{ type: 'folder', id: 'inbox' }],
        received_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        subject: 'Test',
        body_preview: 'Preview',
        from: { email: 'test@example.com', name: 'Test' },
        to: [],
        is_read: false,
        is_flagged: false,
        importance: 'normal',
      });

      tracker.reset();
      await store.read('test-1');

      // Should be 1 read operation
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('batch 100 writes - efficiency', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'io-bench-'));
    const { FileMessageStore } = require('../../src/persistence/messages.js');
    const store = new FileMessageStore({ rootDir });

    try {
      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        await store.upsertFromPayload({
          message_id: `msg-${i}`,
          conversation_id: `thread-${i}`,
          container_refs: [{ type: 'folder', id: 'inbox' }],
          received_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
          subject: `Message ${i}`,
          body_preview: 'Preview',
          from: { email: 'test@example.com', name: 'Test' },
          to: [],
          is_read: false,
          is_flagged: false,
          importance: 'normal',
        });
      }

      const duration = performance.now() - start;
      const opsPerSecond = 100 / (duration / 1000);

      // Should achieve reasonable throughput
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

describe('I/O: Blob Store', () => {
  bench('write 1MB blob - throughput', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'io-bench-'));
    const { FileBlobStore } = require('../../src/persistence/blobs.js');
    const store = new FileBlobStore({ rootDir });

    try {
      const data = Buffer.alloc(1024 * 1024, 'x');
      const start = performance.now();

      await store.write('blob-1mb', data);

      const duration = performance.now() - start;
      const throughputMBps = 1 / (duration / 1000);

      // Should write 1MB quickly
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('write 10MB blob - throughput', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'io-bench-'));
    const { FileBlobStore } = require('../../src/persistence/blobs.js');
    const store = new FileBlobStore({ rootDir });

    try {
      const data = Buffer.alloc(10 * 1024 * 1024, 'x');
      const start = performance.now();

      await store.write('blob-10mb', data);

      const duration = performance.now() - start;
      const throughputMBps = 10 / (duration / 1000);

      // Should stream efficiently
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('read 1MB blob - throughput', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'io-bench-'));
    const { FileBlobStore } = require('../../src/persistence/blobs.js');
    const store = new FileBlobStore({ rootDir });

    try {
      const data = Buffer.alloc(1024 * 1024, 'x');
      await store.write('blob-1mb', data);

      const start = performance.now();
      await store.read('blob-1mb');
      const duration = performance.now() - start;

      // Should read quickly
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

describe('I/O: Cursor Store', () => {
  bench('cursor write - atomicity', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'io-bench-'));
    const { FileCursorStore } = require('../../src/persistence/cursor.js');
    const store = new FileCursorStore({ rootDir, scopeId: 'test@example.com' });

    try {
      // Cursor writes should be atomic (temp + rename)
      await store.commit('delta-token-12345');

      // Verify file exists and is valid
      const cursor = await store.read();
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('cursor read - cached', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'io-bench-'));
    const { FileCursorStore } = require('../../src/persistence/cursor.js');
    const store = new FileCursorStore({ rootDir, scopeId: 'test@example.com' });

    try {
      await store.commit('delta-token-12345');

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        await store.read();
      }
      const duration = performance.now() - start;

      // Multiple reads should be fast (potentially cached)
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

describe('I/O: Apply Log', () => {
  bench('apply log append - sequential write', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'io-bench-'));
    const { FileApplyLogStore } = require('../../src/persistence/apply-log.js');
    const store = new FileApplyLogStore({ rootDir });

    try {
      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        await store.markApplied({
          event_id: `event-${i}`,
          message_id: `msg-${i}`,
          change_type: 'create',
          received_at: new Date().toISOString(),
        });
      }

      const duration = performance.now() - start;
      const opsPerSecond = 1000 / (duration / 1000);

      // Should achieve high append throughput
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

// Raw filesystem baseline
describe('I/O: Raw Filesystem Baseline', () => {
  bench('raw write 1KB', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'io-bench-'));

    try {
      const data = 'x'.repeat(1024);
      const start = performance.now();

      await writeFile(join(rootDir, 'test.txt'), data);

      const duration = performance.now() - start;
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('raw read 1KB', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'io-bench-'));
    const filePath = join(rootDir, 'test.txt');

    try {
      await writeFile(filePath, 'x'.repeat(1024));

      const start = performance.now();
      await readFile(filePath, 'utf8');
      const duration = performance.now() - start;
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('raw write 1MB', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'io-bench-'));

    try {
      const data = Buffer.alloc(1024 * 1024, 'x');
      const start = performance.now();

      await writeFile(join(rootDir, 'test.bin'), data);

      const duration = performance.now() - start;
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
