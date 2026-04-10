/**
 * Graph Adapter Benchmarks
 *
 * Measures normalization and parsing performance.
 */

import { describe, bench } from 'vitest';
import { benchmark } from './framework.js';

// Sample Graph message responses of various sizes
const smallResponse = {
  id: 'AQMkADAwATM0MDAAMS0xMzUALTA0MjAARgAAA',
  createdDateTime: '2024-01-15T10:30:00Z',
  receivedDateTime: '2024-01-15T10:30:00Z',
  subject: 'Meeting tomorrow',
  bodyPreview: 'Let\'s discuss the project...',
  isRead: false,
  from: {
    emailAddress: { name: 'John Doe', address: 'john@example.com' },
  },
  toRecipients: [
    { emailAddress: { name: 'Jane Smith', address: 'jane@example.com' } },
  ],
};

const largeResponse = {
  id: 'AQMkADAwATM0MDAAMS0xMzUALTA0MjAARgAAA',
  createdDateTime: '2024-01-15T10:30:00Z',
  receivedDateTime: '2024-01-15T10:30:00Z',
  subject: 'Project Proposal: Q1 2024 Roadmap and Budget Allocation',
  bodyPreview: 'This is a long preview with lots of content...',
  body: {
    contentType: 'html',
    content: '<html><body><h1>Proposal</h1><p>'.repeat(100) + '</p></body></html>',
  },
  isRead: true,
  isFlagged: true,
  importance: 'high',
  from: {
    emailAddress: { name: 'John Doe', address: 'john@example.com' },
  },
  toRecipients: Array.from({ length: 10 }, (_, i) => ({
    emailAddress: { name: `Recipient ${i}`, address: `user${i}@example.com` },
  })),
  ccRecipients: Array.from({ length: 5 }, (_, i) => ({
    emailAddress: { name: `CC ${i}`, address: `cc${i}@example.com` },
  }),
  ),
  attachments: Array.from({ length: 5 }, (_, i) => ({
    id: `attach-${i}`,
    name: `document-${i}.pdf`,
    contentType: 'application/pdf',
    size: 1024 * 1024,
  })),
};

describe('Graph Adapter', () => {
  bench('normalize message ID (short)', () => {
    const { normalizeMessageId } = require('../../src/ids/message-id.js');
    const id = 'AQMkADAwATM0MDAAMS0xMzUALTA0MjAARgAAA';

    for (let i = 0; i < 10000; i++) {
      normalizeMessageId(id);
    }
  });

  bench('normalize message ID (long)', () => {
    const { normalizeMessageId } = require('../../src/ids/message-id.js');
    const id = 'AQMkADAwATM0MDAAMS0xMzUALTA0MjAARgAAA' + 'A'.repeat(200);

    for (let i = 0; i < 10000; i++) {
      normalizeMessageId(id);
    }
  });

  bench('parse small message response', async () => {
    const { normalizeMessage } = require('../../src/normalize/message.js');

    await benchmark(
      'parse-small',
      () => {
        normalizeMessage(smallResponse, {
          mailbox_id: 'test@example.com',
          body_policy: 'none',
          attachment_policy: 'none',
          include_headers: false,
        });
      },
      { warmupRuns: 5, measurementRuns: 100 },
    );
  });

  bench('parse large message response', async () => {
    const { normalizeMessage } = require('../../src/normalize/message.js');

    await benchmark(
      'parse-large',
      () => {
        normalizeMessage(largeResponse, {
          mailbox_id: 'test@example.com',
          body_policy: 'full',
          attachment_policy: 'metadata',
          include_headers: true,
        });
      },
      { warmupRuns: 3, measurementRuns: 50 },
    );
  });

  bench('batch normalization (100 messages)', async () => {
    const { normalizeBatch } = require('../../src/normalize/batch.js');
    const messages = Array.from({ length: 100 }, (_, i) => ({
      ...smallResponse,
      id: `msg-${i}`,
    }));

    await benchmark(
      'batch-100',
      () => {
        normalizeBatch(messages, {
          mailbox_id: 'test@example.com',
          body_policy: 'preview',
          attachment_policy: 'none',
        });
      },
      { warmupRuns: 3, measurementRuns: 20 },
    );
  });

  bench('delta response parsing', async () => {
    const { normalizeDeltaEntry } = require('../../src/normalize/delta-entry.js');
    const deltaEntry = {
      id: 'delta-1',
      changeType: 'created',
      resourceData: smallResponse,
    };

    await benchmark(
      'delta-parse',
      () => {
        for (let i = 0; i < 1000; i++) {
          normalizeDeltaEntry(deltaEntry, {
            mailbox_id: 'test@example.com',
            body_policy: 'none',
            attachment_policy: 'none',
          });
        }
      },
      { warmupRuns: 5, measurementRuns: 50 },
    );
  });
});

// Hash and ID benchmarks
describe('ID Generation', () => {
  bench('content hash (small payload)', () => {
    const { hashNormalizedPayload } = require('../../src/ids/event-id.js');
    const payload = { id: 'test', content: 'hello world' };

    for (let i = 0; i < 10000; i++) {
      hashNormalizedPayload(payload);
    }
  });

  bench('content hash (large payload)', () => {
    const { hashNormalizedPayload } = require('../../src/ids/event-id.js');
    const payload = {
      id: 'test',
      content: 'x'.repeat(10000),
      metadata: { nested: { deep: { value: 123 } } },
    };

    for (let i = 0; i < 1000; i++) {
      hashNormalizedPayload(payload);
    }
  });

  bench('build event ID', () => {
    const { buildEventId } = require('../../src/ids/event-id.js');
    const payload = {
      id: 'msg-123',
      received_at: '2024-01-01T00:00:00Z',
      subject: 'Test message',
    };

    for (let i = 0; i < 10000; i++) {
      buildEventId(payload, 'create');
    }
  });
});
