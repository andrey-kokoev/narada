import type { ExchangeFsSyncConfig } from '../src/config/types.js';
import type { NormalizedEvent } from '../src/types/normalized.js';

let idCounter = 0;

export function randomId(): string {
  return `test-${Date.now()}-${++idCounter}`;
}

export interface MockGraphMessage {
  id: string;
  changeKey: string;
  conversationId?: string;
  subject?: string;
  parentFolderId?: string;
  isRead?: boolean;
  isDraft?: boolean;
  hasAttachments?: boolean;
  body?: {
    contentType: 'text' | 'html';
    content: string;
  };
  from?: {
    emailAddress?: {
      name?: string;
      address?: string;
    };
  };
  toRecipients?: Array<{
    emailAddress?: {
      name?: string;
      address?: string;
    };
  }>;
  receivedDateTime?: string;
  sentDateTime?: string;
  internetMessageId?: string;
  webLink?: string;
  inferenceClassification?: string;
  flag?: {
    flagStatus?: string;
  };
  '@removed'?: { reason: string };
}

export function createMockMessage(overrides?: Partial<MockGraphMessage>): MockGraphMessage {
  const id = randomId();
  return {
    id: `msg-${id}`,
    changeKey: `ck-${id}`,
    conversationId: `conv-${id}`,
    subject: 'Test Subject',
    parentFolderId: 'inbox',
    isRead: false,
    isDraft: false,
    hasAttachments: false,
    body: {
      contentType: 'text',
      content: 'Test message body',
    },
    from: {
      emailAddress: {
        name: 'Sender Name',
        address: 'sender@example.com',
      },
    },
    toRecipients: [
      {
        emailAddress: {
          name: 'Recipient Name',
          address: 'recipient@example.com',
        },
      },
    ],
    receivedDateTime: new Date().toISOString(),
    sentDateTime: new Date().toISOString(),
    internetMessageId: `<${id}@example.com>`,
    webLink: `https://outlook.office365.com/mail/inbox/id/${id}`,
    inferenceClassification: 'focused',
    flag: {
      flagStatus: 'notFlagged',
    },
    ...overrides,
  };
}

export function createMockGraphResponse(options: {
  messages?: MockGraphMessage[];
  deltaLink?: string;
  nextLink?: string;
}): Record<string, unknown> {
  const response: Record<string, unknown> = {
    value: options.messages ?? [],
  };

  if (options.deltaLink) {
    response['@odata.deltaLink'] = options.deltaLink;
  }

  if (options.nextLink) {
    response['@odata.nextLink'] = options.nextLink;
  }

  return response;
}

export function createMockDeleteEvent(messageId: string): MockGraphMessage {
  return {
    id: messageId,
    changeKey: `ck-${randomId()}`,
    '@removed': { reason: 'deleted' },
  };
}

export function createTestConfig(overrides?: Partial<ExchangeFsSyncConfig>): ExchangeFsSyncConfig {
  return {
    mailbox_id: 'test@example.com',
    root_dir: '/tmp/test-data',
    graph: {
      user_id: 'test@example.com',
      prefer_immutable_ids: true,
      tenant_id: 'test-tenant',
      client_id: 'test-client',
      client_secret: 'test-secret',
      ...overrides?.graph,
    },
    scope: {
      included_container_refs: ['inbox'],
      included_item_kinds: ['message'],
      ...overrides?.scope,
    },
    normalize: {
      attachment_policy: 'metadata_only',
      body_policy: 'text_only',
      include_headers: false,
      tombstones_enabled: true,
      ...overrides?.normalize,
    },
    runtime: {
      polling_interval_ms: 60000,
      acquire_lock_timeout_ms: 30000,
      cleanup_tmp_on_startup: true,
      rebuild_views_after_sync: false,
      ...overrides?.runtime,
    },
  };
}

export function createNormalizedEvent(overrides?: Partial<NormalizedEvent>): NormalizedEvent {
  const id = randomId();
  return {
    event_id: `evt-${id}`,
    event_kind: 'upsert',
    message_id: `msg-${id}`,
    mailbox_id: 'test@example.com',
    payload: {
      item_ref: `msg-${id}`,
      folder_refs: ['inbox'],
      received_at: new Date().toISOString(),
      subject: 'Test Subject',
      from_address: 'sender@example.com',
      to_addresses: ['recipient@example.com'],
      body_text: 'Test message body',
      body_html: undefined,
      has_attachments: false,
      attachments: [],
      categories: [],
      importance: 'normal',
      is_read: false,
      is_draft: false,
      conversation_id: `conv-${id}`,
      internet_message_id: `<${id}@example.com>`,
      web_link: `https://outlook.office365.com/mail/inbox/id/${id}`,
      inference_classification: 'focused',
      flagged: false,
    },
    ...overrides,
  } as NormalizedEvent;
}

export function createMockFetchImpl(
  responses: Array<{
    value: MockGraphMessage[];
    deltaLink?: string;
    nextLink?: string;
  }>,
): typeof fetch {
  let callIndex = 0;
  return async () => {
    const response = responses[callIndex++] ?? responses[responses.length - 1] ?? { value: [] };
    return new Response(JSON.stringify(createMockGraphResponse(response)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}
