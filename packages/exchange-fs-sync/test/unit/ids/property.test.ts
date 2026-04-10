import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeEventId, stableStringify } from '../../../src/ids/event-id.js';
import type { NormalizedEvent } from '../../../src/types/normalized.js';

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
              event_id: 'temp',
              event_kind: eventData.event_kind,
              message_id: eventData.message_id,
              mailbox_id: eventData.mailbox_id,
              payload: {
                item_ref: eventData.message_id,
                folder_refs: ['inbox'],
                received_at: new Date().toISOString(),
                subject: 'Test',
                from_address: 'test@example.com',
                to_addresses: ['recipient@example.com'],
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
              event_id: 'temp',
              event_kind: 'upsert' as const,
              mailbox_id: 'test@example.com',
              payload: {
                item_ref: msgId1,
                folder_refs: ['inbox'],
                received_at: new Date().toISOString(),
                subject: 'Test',
                from_address: 'test@example.com',
                to_addresses: ['recipient@example.com'],
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
              event_id: 'temp',
              event_kind: eventData.event_kind,
              message_id: eventData.message_id,
              mailbox_id: eventData.mailbox_id,
              payload: {
                item_ref: eventData.message_id,
                folder_refs: ['inbox'],
                received_at: new Date().toISOString(),
                subject: 'Test',
                from_address: 'test@example.com',
                to_addresses: ['recipient@example.com'],
              },
            };
            const id = computeEventId(event);
            // Should be a valid hash string
            return /^[a-f0-9]{64}$/i.test(id);
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
