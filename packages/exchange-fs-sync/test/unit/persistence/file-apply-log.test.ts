import { describe, expect, it } from 'vitest';
import { FileApplyLogStore } from '../../../src/persistence/apply-log.js';
import { vol } from 'memfs';
import type { NormalizedEvent } from '../../../src/types/index.js';

describe('FileApplyLogStore', () => {
  function createMockEvent(eventId: string): NormalizedEvent {
    return {
      event_id: eventId,
      event_kind: 'upsert',
      message_id: 'msg-1',
      mailbox_id: 'test@example.com',
      source_item_id: 'src-1',
      source_version: 'v1',
      observed_at: new Date().toISOString(),
      schema_version: 1,
      payload: {
        schema_version: 1,
        mailbox_id: 'test@example.com',
        message_id: 'msg-1',
        conversation_id: 'conv-1',
        subject: 'Test',
        reply_to: [],
        to: [],
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
          text: 'Test body',
        },
        attachments: [],
      },
    };
  }

  it('returns false for events not yet applied', async () => {
    const store = new FileApplyLogStore({ rootDir: '/test/data' });

    const hasApplied = await store.hasApplied('evt-1');
    expect(hasApplied).toBe(false);
  });

  it('returns true after marking event applied', async () => {
    vol.fromJSON({});

    const store = new FileApplyLogStore({ rootDir: '/test/data' });
    const event = createMockEvent('evt-1');

    await store.markApplied('evt-1', event);
    const hasApplied = await store.hasApplied('evt-1');

    expect(hasApplied).toBe(true);
  });

  it('tracks multiple events independently', async () => {
    vol.fromJSON({});

    const store = new FileApplyLogStore({ rootDir: '/test/data' });

    await store.markApplied('evt-1', createMockEvent('evt-1'));
    await store.markApplied('evt-2', createMockEvent('evt-2'));

    expect(await store.hasApplied('evt-1')).toBe(true);
    expect(await store.hasApplied('evt-2')).toBe(true);
    expect(await store.hasApplied('evt-3')).toBe(false);
  });

  it('handles duplicate markApplied calls idempotently', async () => {
    vol.fromJSON({});

    const store = new FileApplyLogStore({ rootDir: '/test/data' });
    const event = createMockEvent('evt-1');

    await store.markApplied('evt-1', event);
    await store.markApplied('evt-1', event); // Duplicate

    expect(await store.hasApplied('evt-1')).toBe(true);
  });
});
