import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeEventId, stableStringify } from '../../../src/ids/event-id.js';
import { SCHEMA_VERSION, type NormalizedEvent } from '../../../src/types/normalized.js';

describe('ID Property-Based Tests', () => {
  describe('stableStringify', () => {
    it('produces identical output for objects with same content regardless of key order', () => {
      fc.assert(
        fc.property(
          fc.dictionary(fc.string(), fc.string()),
          (dict) => {
            const obj1 = dict;
            const obj2 = Object.fromEntries(
              Object.entries(dict).sort(([a], [b]) => b.localeCompare(a)),
            );
            return stableStringify(obj1) === stableStringify(obj2);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('produces consistent output for nested objects', () => {
      fc.assert(
        fc.property(
          fc.object(),
          (obj) => {
            const str1 = stableStringify(obj);
            const str2 = stableStringify(obj);
            return str1 === str2;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('computeEventId', () => {
    it('produces deterministic event IDs for identical events', () => {
      fc.assert(
        fc.property(
          fc.record({
            event_kind: fc.constantFrom('upsert', 'delete'),
            message_id: fc.string({ minLength: 1 }),
            mailbox_id: fc.string({ minLength: 1 }),
          }),
          (eventData) => {
            const event: NormalizedEvent = {
              schema_version: SCHEMA_VERSION,
              event_id: 'temp',
              event_kind: eventData.event_kind,
              message_id: eventData.message_id,
              mailbox_id: eventData.mailbox_id,
              source_item_id: `src-${eventData.message_id}`,
              source_version: 'v1',
              observed_at: new Date().toISOString(),
              payload: {
                schema_version: SCHEMA_VERSION,
                mailbox_id: eventData.mailbox_id,
                message_id: eventData.message_id,
                folder_refs: ['inbox'],
                subject: 'Test',
                reply_to: [],
                to: [],
                cc: [],
                bcc: [],
                category_refs: [],
                flags: {
                  is_read: false,
                  is_draft: false,
                  is_flagged: false,
                  has_attachments: false,
                },
                attachments: [],
              },
            };
            const id1 = computeEventId(event);
            const id2 = computeEventId(event);
            return id1 === id2;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('produces different event IDs for different events', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 1 }),
            fc.string({ minLength: 1 }),
          ).filter(([a, b]) => a !== b),
          ([msgId1, msgId2]) => {
            const baseEvent = {
              schema_version: SCHEMA_VERSION,
              event_id: 'temp',
              event_kind: 'upsert' as const,
              mailbox_id: 'test@example.com',
              source_item_id: `src-${msgId1}`,
              source_version: 'v1',
              observed_at: new Date().toISOString(),
              payload: {
                schema_version: SCHEMA_VERSION,
                mailbox_id: 'test@example.com',
                message_id: msgId1,
                folder_refs: ['inbox'],
                subject: 'Test',
                reply_to: [],
                to: [],
                cc: [],
                bcc: [],
                category_refs: [],
                flags: {
                  is_read: false,
                  is_draft: false,
                  is_flagged: false,
                  has_attachments: false,
                },
                attachments: [],
              },
            };
            const event1 = { ...baseEvent, message_id: msgId1 };
            const event2 = { ...baseEvent, message_id: msgId2 };
            const id1 = computeEventId(event1 as NormalizedEvent);
            const id2 = computeEventId(event2 as NormalizedEvent);
            return id1 !== id2;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('produces event IDs matching expected pattern', () => {
      fc.assert(
        fc.property(
          fc.record({
            event_kind: fc.constantFrom('upsert', 'delete'),
            message_id: fc.string({ minLength: 1, maxLength: 100 }),
            mailbox_id: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          (eventData) => {
            const event: NormalizedEvent = {
              schema_version: SCHEMA_VERSION,
              event_id: 'temp',
              event_kind: eventData.event_kind,
              message_id: eventData.message_id,
              mailbox_id: eventData.mailbox_id,
              source_item_id: `src-${eventData.message_id}`,
              source_version: 'v1',
              observed_at: new Date().toISOString(),
              payload: {
                schema_version: SCHEMA_VERSION,
                mailbox_id: eventData.mailbox_id,
                message_id: eventData.message_id,
                folder_refs: ['inbox'],
                subject: 'Test',
                reply_to: [],
                to: [],
                cc: [],
                bcc: [],
                category_refs: [],
                flags: {
                  is_read: false,
                  is_draft: false,
                  is_flagged: false,
                  has_attachments: false,
                },
                attachments: [],
              },
            };
            const id = computeEventId(event);
            // Should be a valid hash string
            return /^evt_[a-f0-9]{64}$/i.test(id);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('event_id invariants', () => {
    it('stableStringify handles unicode consistently', () => {
      fc.assert(
        fc.property(
          fc.unicodeString({ minLength: 1, maxLength: 100 }),
          (str) => {
            const obj = { key: str };
            const str1 = stableStringify(obj);
            const str2 = stableStringify(obj);
            return str1 === str2;
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
