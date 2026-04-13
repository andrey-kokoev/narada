/**
 * Mock Graph Adapter for development and testing
 *
 * Provides a fake Graph API implementation that generates synthetic messages
 * without requiring real Microsoft Graph credentials.
 */

import { setTimeout } from "node:timers/promises";
import type { GraphDeltaMessage } from "../../types/graph.js";
import type {
  AdapterScope,
  AttachmentPolicy,
  BodyPolicy,
  NormalizedBatch,
} from "../../types/normalized.js";
import type { GraphAdapter } from "../../types/runtime.js";
import { normalizeBatch } from "../../normalize/batch.js";

export interface MockAdapterOptions {
  /** Mailbox identifier */
  mailbox_id: string;
  /** Adapter scope configuration */
  adapter_scope: AdapterScope;
  /** Body content policy */
  body_policy: BodyPolicy;
  /** Attachment handling policy */
  attachment_policy: AttachmentPolicy;
  /** Whether to include full headers */
  include_headers: boolean;
  /** Function to extract folder refs from message */
  normalize_folder_ref: (graph_message: GraphDeltaMessage) => string[];
  /** Function to determine if message is flagged */
  normalize_flagged: (flag: GraphDeltaMessage["flag"]) => boolean;
  /** Number of mock messages to generate */
  messageCount?: number;
  /** Simulated network delay in milliseconds */
  delayMs?: number;
  /** Probability of random failure (0-1) */
  failureRate?: number;
  /** Optional seed for deterministic generation */
  seed?: number;
}

/**
 * Mock Graph Adapter for development/testing without real credentials
 *
 * Features:
 * - Generates realistic synthetic messages
 * - Configurable message count and network delay simulation
 * - Optional failure injection for error testing
 * - Deterministic generation with seed option
 */
export class MockGraphAdapter implements GraphAdapter {
  private readonly options: Required<MockAdapterOptions>;
  private callCount = 0;

  constructor(options: MockAdapterOptions) {
    this.options = {
      messageCount: 10,
      delayMs: 100,
      failureRate: 0,
      seed: Date.now(),
      ...options,
    };
  }

  async fetch_since(cursor?: string | null): Promise<NormalizedBatch> {
    this.callCount++;

    // Simulate network delay
    await setTimeout(this.options.delayMs);

    // Simulate random failures
    if (Math.random() < this.options.failureRate) {
      throw new Error("Mock network error: simulated failure");
    }

    // Generate deterministic cursor if none provided
    const priorCursor = cursor ?? null;
    const nextCursor = `mock-delta-token-${this.callCount}-${Date.now()}`;

    // Generate mock messages
    const messages = this.generateMessages();

    // Build normalized batch
    return normalizeBatch({
      mailbox_id: this.options.mailbox_id,
      adapter_scope: this.options.adapter_scope,
      prior_cursor: priorCursor,
      next_cursor: nextCursor,
      fetched_at: new Date().toISOString(),
      messages,
      has_more: false,
      body_policy: this.options.body_policy,
      attachment_policy: this.options.attachment_policy,
      include_headers: this.options.include_headers,
      normalize_folder_ref: this.options.normalize_folder_ref,
      normalize_flagged: this.options.normalize_flagged,
    });
  }

  /**
   * Generate synthetic GraphDeltaMessage objects
   */
  private generateMessages(): GraphDeltaMessage[] {
    const { messageCount, seed } = this.options;

    return Array.from({ length: messageCount }, (_, i) => {
      const messageId = this.generateMessageId(i, seed);
      const receivedAt = new Date(seed + i * 60000); // 1 minute intervals

      return this.createMockMessage(i, messageId, receivedAt);
    });
  }

  /**
   * Create a single mock message
   */
  private createMockMessage(
    index: number,
    messageId: string,
    receivedAt: Date,
  ): GraphDeltaMessage {
    const isEven = index % 2 === 0;
    const senderIndex = index % MOCK_SENDERS.length;
    const sender = MOCK_SENDERS[senderIndex];
    const subject = MOCK_SUBJECTS[index % MOCK_SUBJECTS.length];
    const bodyPreview = MOCK_BODY_PREVIEWS[index % MOCK_BODY_PREVIEWS.length];

    return {
      id: messageId,
      internetMessageId: `<mock-${index}-${receivedAt.getTime()}@example.com>`,
      conversationId: `conv-${Math.floor(index / 3)}`,
      parentFolderId: this.options.adapter_scope.included_container_refs[0] ??
        "inbox",
      receivedDateTime: receivedAt.toISOString(),
      sentDateTime: receivedAt.toISOString(),
      subject: `${subject} (#${index})`,
      bodyPreview: bodyPreview,
      isRead: isEven,
      isDraft: false,
      importance: "normal",
      flag: {
        flagStatus: index % 5 === 0 ? "flagged" : "notFlagged",
      },
      hasAttachments: index % 3 === 0,
      from: {
        emailAddress: {
          name: sender.name,
          address: sender.email,
        },
      },
      sender: {
        emailAddress: {
          name: sender.name,
          address: sender.email,
        },
      },
      toRecipients: [
        {
          emailAddress: {
            name: "Test User",
            address: "test@example.com",
          },
        },
      ],
      ccRecipients: index % 4 === 0
        ? [
          {
            emailAddress: {
              name: "CC User",
              address: "cc@example.com",
            },
          },
        ]
        : [],
      bccRecipients: [],
      replyTo: [],
      categories: index % 7 === 0 ? ["Important"] : [],
      changeKey: `change-key-${index}`,
      createdDateTime: receivedAt.toISOString(),
      lastModifiedDateTime: receivedAt.toISOString(),
      webLink: `https://outlook.office365.com/mail/inbox/id/${messageId}`,
    };
  }

  /**
   * Generate a deterministic message ID
   */
  private generateMessageId(index: number, seed: number): string {
    // Create a deterministic but unique ID
    const hash = this.simpleHash(`${seed}-${index}-${this.options.mailbox_id}`);
    return `mock-msg-${hash.substring(0, 16)}`;
  }

  /**
   * Simple string hash for deterministic IDs
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }
}

// Mock data for realistic message generation
const MOCK_SENDERS = [
  { name: "Alice Johnson", email: "alice@contoso.com" },
  { name: "Bob Smith", email: "bob@fabrikam.com" },
  { name: "Carol White", email: "carol@adventureworks.com" },
  { name: "David Brown", email: "david@northwind.com" },
  { name: "Eve Davis", email: "eve@wingtiptoys.com" },
  { name: "Frank Miller", email: "frank@proseware.com" },
  { name: "Grace Lee", email: "grace@litware.com" },
  { name: "Henry Wilson", email: "henry@tailspintoys.com" },
];

const MOCK_SUBJECTS = [
  "Weekly Team Update",
  "Project Status Report",
  "Meeting Notes",
  "Action Required: Review Documents",
  "FYI: Policy Changes",
  "Invitation: Team Lunch",
  "Urgent: Customer Feedback",
  "Q4 Planning Discussion",
  "Code Review Request",
  "Deployment Scheduled",
  "Bug Fix Verification",
  "New Feature Proposal",
];

const MOCK_BODY_PREVIEWS = [
  "Hi team, here's the weekly update on our progress...",
  "Please review the attached documents and provide feedback by Friday...",
  "The meeting has been rescheduled to next Tuesday at 2 PM...",
  "Great work everyone on hitting the milestone! Let's keep the momentum...",
  "I've updated the documentation with the latest changes. Please take a look...",
  "Customer reported an issue with the login flow. We need to investigate...",
  "The deployment went smoothly. All systems are operational...",
  "Quick reminder about the upcoming code freeze next week...",
];

/**
 * Factory function to create a mock adapter with sensible defaults
 */
export function createMockAdapter(
  overrides?: Partial<MockAdapterOptions>,
): MockGraphAdapter {
  const defaults: MockAdapterOptions = {
    mailbox_id: "mock-mailbox",
    adapter_scope: {
      mailbox_id: "mock-mailbox",
      included_container_refs: ["inbox"],
      included_item_kinds: ["message"],
    },
    body_policy: "text_only",
    attachment_policy: "metadata_only",
    include_headers: false,
    normalize_folder_ref: () => ["inbox"],
    normalize_flagged: (flag) => flag?.flagStatus === "flagged",
  };

  return new MockGraphAdapter({ ...defaults, ...overrides });
}
