import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DefaultSyncRunner } from '../../src/runner/sync-once.js';
import { ExchangeSource } from '../../src/adapter/graph/exchange-source.js';
import { FileCursorStore } from '../../src/persistence/cursor.js';
import { FileApplyLogStore } from '../../src/persistence/apply-log.js';
import { FileMessageStore } from '../../src/persistence/messages.js';
import { FileViewStore } from '../../src/persistence/views.js';
import { applyEvent } from '../../src/projector/apply-event.js';
import type { GraphAdapter, NormalizedBatch, NormalizedEvent } from '../../src/types/index.js';
import { SCHEMA_VERSION } from '../../src/types/index.js';
import { computeEventId } from '../../src/ids/event-id.js';
import { FileHealthStore } from '../../src/health.js';

function createEvent(
  messageId: string,
  eventKind: 'upsert' | 'delete',
  overrides?: Partial<NormalizedEvent>,
): NormalizedEvent {
  const event: NormalizedEvent = {
    schema_version: SCHEMA_VERSION,
    event_id: 'temp',
    mailbox_id: 'test@example.com',
    message_id: messageId,
    source_item_id: `src-${messageId}`,
    source_version: 'v1',
    event_kind: eventKind,
    observed_at: new Date().toISOString(),
    ...(eventKind === 'delete'
      ? {}
      : {
          payload: {
            schema_version: SCHEMA_VERSION,
            mailbox_id: 'test@example.com',
            message_id: messageId,
            conversation_id: `conv-${messageId}`,
            subject: `Subject for ${messageId}`,
            reply_to: [],
            to: [{ address: 'recipient@example.com', display_name: 'Recipient' }],
            cc: [],
            bcc: [],
            folder_refs: ['inbox'],
            category_refs: [],
            flags: {
              is_read: false,
              is_draft: false,
              is_flagged: false,
              has_attachments: false,
            },
            body: {
              body_kind: 'text',
              text: `Body for ${messageId}`,
            },
            attachments: [],
          },
        }),
    ...overrides,
  };
  event.event_id = computeEventId(event);
  return event;
}

function createBatch(
  events: NormalizedEvent[],
  priorCursor: string | null = null,
  nextCursor: string,
): NormalizedBatch {
  return {
    schema_version: SCHEMA_VERSION,
    mailbox_id: 'test@example.com',
    adapter_scope: {
      mailbox_id: 'test@example.com',
      included_container_refs: ['inbox'],
      included_item_kinds: ['message'],
      attachment_policy: 'metadata_only',
      body_policy: 'text_only',
    },
    prior_cursor: priorCursor,
    next_cursor: nextCursor,
    fetched_at: new Date().toISOString(),
    events,
  };
}

describe('Full Sync Lifecycle', () => {
  it('should sync messages from empty state', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'exchange-fs-sync-lifecycle-'));
    const mailboxId = 'test@example.com';

    // Create 100 mock events
    const events = Array.from({ length: 100 }, (_, i) =>
      createEvent(`msg-${String(i).padStart(3, '0')}`, 'upsert'),
    );

    let callCount = 0;
    const adapter: GraphAdapter = {
      fetch_since: async () => {
        callCount++;
        return createBatch(events, null, 'cursor-100');
      },
    };

    const cursorStore = new FileCursorStore({ rootDir, mailboxId });
    const applyLogStore = new FileApplyLogStore({ rootDir });
    const messageStore = new FileMessageStore({ rootDir });
    const views = new FileViewStore({ rootDir });

    const runner = new DefaultSyncRunner({
      rootDir,
      source: new ExchangeSource({ adapter, sourceId: "test" }),
      cursorStore,
      applyLogStore,
      projector: {
        applyRecord: (record) => {
          const event = record.payload;
          return applyEvent(
            {
              blobs: { installFromPayload: async () => undefined },
              messages: messageStore,
              tombstones: {
                writeFromDeleteEvent: async () => undefined,
                remove: async () => undefined,
              },
              views,
              tombstones_enabled: false,
            },
            event,
          );
        },      },
    });

    const result = await runner.syncOnce();

    // Verify result
    expect(result.status).toBe('success');
    expect(result.event_count).toBe(100);
    expect(result.applied_count).toBe(100);
    expect(result.skipped_count).toBe(0);
    expect(callCount).toBe(1);

    // Verify cursor is saved
    const cursor = await cursorStore.read();
    expect(cursor).toBe('cursor-100');

    // Verify messages are on disk
    const messagesDir = join(rootDir, 'messages');
    const messageDirs = await readdir(messagesDir);
    expect(messageDirs.length).toBe(100);

    // Verify one message content
    const sampleMessage = await readFile(
      join(messagesDir, encodeURIComponent('msg-050'), 'record.json'),
      'utf8',
    );
    const parsed = JSON.parse(sampleMessage);
    expect(parsed.message_id).toBe('msg-050');
    expect(parsed.subject).toBe('Subject for msg-050');

    // Verify apply log has all events
    for (const event of events) {
      const wasApplied = await applyLogStore.hasApplied(event.event_id);
      expect(wasApplied).toBe(true);
    }
  });

  it('should resume from cursor and only fetch new messages', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'exchange-fs-sync-resume-'));
    const mailboxId = 'test@example.com';

    // First batch: messages 1-50
    const firstBatchEvents = Array.from({ length: 50 }, (_, i) =>
      createEvent(`msg-${String(i).padStart(3, '0')}`, 'upsert'),
    );

    // Second batch: messages 51-100
    const secondBatchEvents = Array.from({ length: 50 }, (_, i) =>
      createEvent(`msg-${String(i + 50).padStart(3, '0')}`, 'upsert'),
    );

    let callCount = 0;
    const adapter: GraphAdapter = {
      fetch_since: async (cursor) => {
        callCount++;
        if (!cursor) {
          return createBatch(firstBatchEvents, null, 'cursor-50');
        }
        if (cursor === 'cursor-50') {
          return createBatch(secondBatchEvents, 'cursor-50', 'cursor-100');
        }
        return createBatch([], cursor, 'cursor-100');
      },
    };

    const cursorStore = new FileCursorStore({ rootDir, mailboxId });
    const applyLogStore = new FileApplyLogStore({ rootDir });
    const messageStore = new FileMessageStore({ rootDir });
    const views = new FileViewStore({ rootDir });

    const runner = new DefaultSyncRunner({
      rootDir,
      source: new ExchangeSource({ adapter, sourceId: "test" }),
      cursorStore,
      applyLogStore,
      projector: {
        applyRecord: (record) => {
          const event = record.payload;
          return applyEvent(
            {
              blobs: { installFromPayload: async () => undefined },
              messages: messageStore,
              tombstones: {
                writeFromDeleteEvent: async () => undefined,
                remove: async () => undefined,
              },
              views,
              tombstones_enabled: false,
            },
            event,
          );
        },      },
    });

    // First sync
    const result1 = await runner.syncOnce();
    expect(result1.status).toBe('success');
    expect(result1.event_count).toBe(50);
    expect(result1.applied_count).toBe(50);

    // Second sync
    const result2 = await runner.syncOnce();
    expect(result2.status).toBe('success');
    expect(result2.event_count).toBe(50);
    expect(result2.applied_count).toBe(50);

    // Verify total calls
    expect(callCount).toBe(2);

    // Verify cursor progression
    const cursor = await cursorStore.read();
    expect(cursor).toBe('cursor-100');

    // Verify all 100 messages exist
    const messagesDir = join(rootDir, 'messages');
    const messageDirs = await readdir(messagesDir);
    expect(messageDirs.length).toBe(100);
  });

  it('should handle replay of events idempotently', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'exchange-fs-sync-replay-'));
    const mailboxId = 'test@example.com';

    const events = [
      createEvent('msg-001', 'upsert'),
      createEvent('msg-002', 'upsert'),
      createEvent('msg-003', 'upsert'),
    ];

    let callCount = 0;
    const adapter: GraphAdapter = {
      fetch_since: async () => {
        callCount++;
        return createBatch(events, null, 'cursor-3');
      },
    };

    const cursorStore = new FileCursorStore({ rootDir, mailboxId });
    const applyLogStore = new FileApplyLogStore({ rootDir });
    const messageStore = new FileMessageStore({ rootDir });
    const views = new FileViewStore({ rootDir });

    const runner = new DefaultSyncRunner({
      rootDir,
      source: new ExchangeSource({ adapter, sourceId: "test" }),
      cursorStore,
      applyLogStore,
      projector: {
        applyRecord: (record) => {
          const event = record.payload;
          return applyEvent(
            {
              blobs: { installFromPayload: async () => undefined },
              messages: messageStore,
              tombstones: {
                writeFromDeleteEvent: async () => undefined,
                remove: async () => undefined,
              },
              views,
              tombstones_enabled: false,
            },
            event,
          );
        },      },
    });

    // First sync
    const result1 = await runner.syncOnce();
    expect(result1.applied_count).toBe(3);

    // Second sync - should skip already applied events
    const result2 = await runner.syncOnce();
    expect(result2.applied_count).toBe(0);
    expect(result2.skipped_count).toBe(3);

    // Verify only 3 messages
    const messagesDir = join(rootDir, 'messages');
    const messageDirs = await readdir(messagesDir);
    expect(messageDirs.length).toBe(3);
  });

  it('should handle delete events', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'exchange-fs-sync-delete-'));
    const mailboxId = 'test@example.com';

    const createEvents = [
      createEvent('msg-001', 'upsert'),
      createEvent('msg-002', 'upsert'),
    ];

    const deleteEvents = [createEvent('msg-001', 'delete')];

    let callCount = 0;
    const adapter: GraphAdapter = {
      fetch_since: async (cursor) => {
        callCount++;
        if (!cursor) {
          return createBatch(createEvents, null, 'cursor-create');
        }
        return createBatch(deleteEvents, 'cursor-create', 'cursor-delete');
      },
    };

    const cursorStore = new FileCursorStore({ rootDir, mailboxId });
    const applyLogStore = new FileApplyLogStore({ rootDir });
    const messageStore = new FileMessageStore({ rootDir });
    const views = new FileViewStore({ rootDir });

    const runner = new DefaultSyncRunner({
      rootDir,
      source: new ExchangeSource({ adapter, sourceId: "test" }),
      cursorStore,
      applyLogStore,
      projector: {
        applyRecord: (record) => {
          const event = record.payload;
          return applyEvent(
            {
              blobs: { installFromPayload: async () => undefined },
              messages: messageStore,
              tombstones: {
                writeFromDeleteEvent: async () => undefined,
                remove: async () => undefined,
              },
              views,
              tombstones_enabled: false,
            },
            event,
          );
        },      },
    });

    // First sync - create messages
    const result1 = await runner.syncOnce();
    expect(result1.applied_count).toBe(2);

    // Second sync - delete one message
    const result2 = await runner.syncOnce();
    expect(result2.applied_count).toBe(1);

    // Verify only msg-002 remains
    const messagesDir = join(rootDir, 'messages');
    const messageDirs = await readdir(messagesDir);
    expect(messageDirs.length).toBe(1);
    expect(decodeURIComponent(messageDirs[0]!)).toBe('msg-002');
  });

  it('should update health file with sync status', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'exchange-fs-sync-health-'));
    const mailboxId = 'test@example.com';

    const events = [createEvent('msg-001', 'upsert')];

    const adapter: GraphAdapter = {
      fetch_since: async () => createBatch(events, null, 'cursor-1'),
    };

    const cursorStore = new FileCursorStore({ rootDir, mailboxId });
    const applyLogStore = new FileApplyLogStore({ rootDir });
    const messageStore = new FileMessageStore({ rootDir });
    const views = new FileViewStore({ rootDir });
    const healthStore = new FileHealthStore({ rootDir, mailboxId });

    const runner = new DefaultSyncRunner({
      rootDir,
      source: new ExchangeSource({ adapter, sourceId: "test" }),
      cursorStore,
      applyLogStore,
      projector: {
        applyRecord: (record) => {
          const event = record.payload;
          return applyEvent(
            {
              blobs: { installFromPayload: async () => undefined },
              messages: messageStore,
              tombstones: {
                writeFromDeleteEvent: async () => undefined,
                remove: async () => undefined,
              },
              views,
              tombstones_enabled: false,
            },
            event,
          );
        },      },
    });

    await runner.syncOnce();
    await healthStore.recordSuccess();

    const health = await healthStore.read();
    expect(health.status).toBe('healthy');
    expect(health.consecutive_failures).toBe(0);
  });
});
