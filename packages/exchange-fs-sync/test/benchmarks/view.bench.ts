/**
 * View Query Benchmarks
 *
 * Measures query performance for derived views.
 */

import { describe, bench } from 'vitest';
import { benchmark } from './framework.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('View Queries', () => {
  bench('query by date range (100 messages)', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'view-bench-'));
    const { FileViewStore } = require('../../src/persistence/views.js');
    const { FileMessageStore } = require('../../src/persistence/messages.js');
    const store = new FileViewStore({ rootDir });
    const messageStore = new FileMessageStore({ rootDir });

    try {
      // Pre-populate with messages across date range
      const baseDate = new Date('2024-01-01');
      for (let i = 0; i < 100; i++) {
        const date = new Date(baseDate);
        date.setDate(date.getDate() + i);
        await messageStore.upsertFromPayload({
          message_id: `msg-${i}`,
          thread_id: `thread-${i}`,
          container_refs: [{ type: 'folder', id: 'inbox' }],
          received_at: date.toISOString(),
          sent_at: date.toISOString(),
          subject: `Message ${i}`,
          body_preview: 'Preview...',
          from: { email: 'test@example.com', name: 'Test' },
          to: [],
          is_read: false,
          is_flagged: false,
          importance: 'normal',
        });
      }

      await benchmark(
        'query-date-range-100',
        async () => {
          await store.queryByDateRange({
            folderId: 'inbox',
            after: '2024-01-15',
            before: '2024-02-01',
          });
        },
        { warmupRuns: 3, measurementRuns: 50 },
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('query by date range (1000 messages)', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'view-bench-'));
    const { FileViewStore } = require('../../src/persistence/views.js');
    const { FileMessageStore } = require('../../src/persistence/messages.js');
    const store = new FileViewStore({ rootDir });
    const messageStore = new FileMessageStore({ rootDir });

    try {
      const baseDate = new Date('2024-01-01');
      for (let i = 0; i < 1000; i++) {
        const date = new Date(baseDate);
        date.setDate(date.getDate() + (i % 90));
        await messageStore.upsertFromPayload({
          message_id: `msg-${i}`,
          thread_id: `thread-${Math.floor(i / 10)}`,
          container_refs: [{ type: 'folder', id: 'inbox' }],
          received_at: date.toISOString(),
          sent_at: date.toISOString(),
          subject: `Message ${i}`,
          body_preview: 'Preview...',
          from: { email: 'test@example.com', name: 'Test' },
          to: [],
          is_read: false,
          is_flagged: false,
          importance: 'normal',
        });
      }

      await benchmark(
        'query-date-range-1000',
        async () => {
          await store.queryByDateRange({
            folderId: 'inbox',
            after: '2024-02-01',
            before: '2024-03-01',
          });
        },
        { warmupRuns: 2, measurementRuns: 20 },
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('query by thread', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'view-bench-'));
    const { FileViewStore } = require('../../src/persistence/views.js');
    const { FileMessageStore } = require('../../src/persistence/messages.js');
    const store = new FileViewStore({ rootDir });
    const messageStore = new FileMessageStore({ rootDir });

    try {
      // Create threads with varying message counts
      for (let thread = 0; thread < 100; thread++) {
        const msgCount = (thread % 10) + 1; // 1-10 messages per thread
        for (let msg = 0; msg < msgCount; msg++) {
          await messageStore.upsertFromPayload({
            message_id: `thread-${thread}-msg-${msg}`,
            thread_id: `thread-${thread}`,
            container_refs: [{ type: 'folder', id: 'inbox' }],
            received_at: new Date().toISOString(),
            sent_at: new Date().toISOString(),
            subject: `Thread ${thread} Message ${msg}`,
            body_preview: 'Preview...',
            from: { email: 'test@example.com', name: 'Test' },
            to: [],
            is_read: false,
            is_flagged: false,
            importance: 'normal',
          });
        }
      }

      let threadIndex = 0;
      await benchmark(
        'query-by-thread',
        async () => {
          await store.queryByThread(`thread-${threadIndex++ % 100}`);
        },
        { warmupRuns: 5, measurementRuns: 100 },
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('full-text search', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'view-bench-'));
    const { FileViewStore } = require('../../src/persistence/views.js');
    const { FileMessageStore } = require('../../src/persistence/messages.js');
    const store = new FileViewStore({ rootDir });
    const messageStore = new FileMessageStore({ rootDir });

    try {
      // Pre-populate with searchable content
      const words = ['project', 'proposal', 'meeting', 'report', 'budget', 'review'];
      for (let i = 0; i < 500; i++) {
        const word = words[i % words.length];
        await messageStore.upsertFromPayload({
          message_id: `msg-${i}`,
          thread_id: `thread-${i}`,
          container_refs: [{ type: 'folder', id: 'inbox' }],
          received_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
          subject: `${word} ${word} discussion`,
          body_preview: `This is about the ${word} and related topics...`,
          from: { email: 'test@example.com', name: 'Test' },
          to: [],
          is_read: false,
          is_flagged: false,
          importance: 'normal',
        });
      }

      const queries = ['project', 'budget', 'meeting'];
      let queryIndex = 0;

      await benchmark(
        'full-text-search',
        async () => {
          await store.search({
            query: queries[queryIndex++ % queries.length],
            folderId: 'inbox',
          });
        },
        { warmupRuns: 3, measurementRuns: 50 },
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('rebuild all views', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'view-bench-'));
    const { FileViewStore } = require('../../src/persistence/views.js');
    const { FileMessageStore } = require('../../src/persistence/messages.js');
    const store = new FileViewStore({ rootDir });
    const messageStore = new FileMessageStore({ rootDir });

    try {
      // Pre-populate
      for (let i = 0; i < 500; i++) {
        await messageStore.upsertFromPayload({
          message_id: `msg-${i}`,
          thread_id: `thread-${Math.floor(i / 10)}`,
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

      await benchmark(
        'rebuild-views',
        async () => {
          await store.rebuildAll();
        },
        { warmupRuns: 1, measurementRuns: 5 },
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

describe('View Index Operations', () => {
  bench('add to index', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'view-bench-'));
    const { FileViewStore } = require('../../src/persistence/views.js');
    const store = new FileViewStore({ rootDir });

    try {
      let index = 0;
      await benchmark(
        'add-to-index',
        async () => {
          await store.addToIndex({
            messageId: `msg-${index++}`,
            threadId: `thread-${index}`,
            folderId: 'inbox',
            receivedAt: new Date().toISOString(),
            subject: `Message ${index}`,
            isRead: false,
            isFlagged: false,
          });
        },
        { warmupRuns: 5, measurementRuns: 100 },
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  bench('mark as read', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'view-bench-'));
    const { FileViewStore } = require('../../src/persistence/views.js');
    const store = new FileViewStore({ rootDir });

    try {
      // Pre-populate
      for (let i = 0; i < 100; i++) {
        await store.addToIndex({
          messageId: `msg-${i}`,
          threadId: `thread-${i}`,
          folderId: 'inbox',
          receivedAt: new Date().toISOString(),
          subject: `Message ${i}`,
          isRead: false,
          isFlagged: false,
        });
      }

      let index = 0;
      await benchmark(
        'mark-read',
        async () => {
          await store.markRead(`msg-${index++ % 100}`, true);
        },
        { warmupRuns: 10, measurementRuns: 200 },
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
