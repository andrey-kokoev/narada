import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { OutboundStore } from "../../../src/outbound/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import type {
  OutboundCommand,
  OutboundVersion,
} from "../../../src/outbound/types.js";
import { SendReplyWorker } from "../../../src/outbound/send-reply-worker.js";
import type {
  GraphDraftClient,
  DraftReadResult,
} from "../../../src/outbound/graph-draft-client.js";
import { ExchangeFSSyncError, ErrorCode } from "../../../src/errors.js";

function createCommand(overrides?: Partial<OutboundCommand>): OutboundCommand {
  const now = new Date().toISOString();
  return {
    outbound_id: `out-${Date.now()}`,
    context_id: "thread-1",
    scope_id: "mailbox-1",
    action_type: "send_reply",
    status: "pending",
    latest_version: 1,
    created_at: now,
    created_by: "test",
    submitted_at: null,
    confirmed_at: null,
    blocked_reason: null,
    terminal_reason: null,
    idempotency_key: "key-001",
    ...overrides,
  };
}

function createVersion(
  outboundId: string,
  version = 1,
  overrides?: Partial<OutboundVersion>,
): OutboundVersion {
  return {
    outbound_id: outboundId,
    version,
    reply_to_message_id: "msg-1",
    to: ["alice@example.com"],
    cc: [],
    bcc: [],
    subject: "Re: Hello",
    body_text: "Reply text",
    body_html: "<p>Reply text</p>",
    idempotency_key: `key-${version}`,
    policy_snapshot_json: "{}",
    payload_json: "{}",
    created_at: new Date().toISOString(),
    superseded_at: null,
    ...overrides,
  };
}

class MockGraphDraftClient implements GraphDraftClient {
  drafts = new Map<string, { id: string; payload: DraftReadResult }>();
  sent = new Set<string>();

  reset(): void {
    this.drafts.clear();
    this.sent.clear();
  }

  async createDraft(_userId: string, payload: {
    subject: string;
    body: { contentType: "Text" | "HTML"; content: string };
    toRecipients: Array<{ emailAddress: { address: string } }>;
    ccRecipients?: Array<{ emailAddress: { address: string } }>;
    bccRecipients?: Array<{ emailAddress: { address: string } }>;
    internetMessageHeaders?: Array<{ name: string; value: string }>;
  }): Promise<{ id: string }> {
    const id = `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const draft: DraftReadResult = {
      id,
      subject: payload.subject,
      body: payload.body,
      toRecipients: payload.toRecipients,
      ccRecipients: payload.ccRecipients,
      bccRecipients: payload.bccRecipients,
      internetMessageHeaders: payload.internetMessageHeaders,
    };
    this.drafts.set(id, { id, payload: draft });
    return { id };
  }

  async getDraft(_userId: string, draftId: string): Promise<DraftReadResult> {
    const draft = this.drafts.get(draftId);
    if (!draft) {
      throw new ExchangeFSSyncError("Not found", {
        code: ErrorCode.GRAPH_NOT_FOUND,
        recoverable: false,
        phase: "test",
      });
    }
    return draft.payload;
  }

  async sendDraft(_userId: string, draftId: string): Promise<void> {
    if (!this.drafts.has(draftId)) {
      throw new ExchangeFSSyncError("Not found", {
        code: ErrorCode.GRAPH_NOT_FOUND,
        recoverable: false,
        phase: "test",
      });
    }
    this.sent.add(draftId);
  }
}

function createParticipantResolver(participants: string[] = ["alice@example.com"]) {
  return {
    getParticipants: async (_mailboxId: string, _threadId: string) =>
      new Set(participants.map((p) => p.toLowerCase())),
  };
}

describe("SendReplyWorker", () => {
  let store: SqliteOutboundStore;
  let draftClient: MockGraphDraftClient;
  let worker: SendReplyWorker;

  beforeEach(() => {
    store = new SqliteOutboundStore({ dbPath: ":memory:" });
    store.initSchema();
    draftClient = new MockGraphDraftClient();
    worker = new SendReplyWorker({
      store,
      draftClient,
      participantResolver: createParticipantResolver(),
      resolveUserId: (scopeId) => `user-${scopeId}`,
      logger: undefined,
    });
  });

  afterEach(() => {
    store.close();
  });

  it("happy path: pending -> submitted", async () => {
    const cmd = createCommand({ status: "pending" });
    const ver = createVersion(cmd.outbound_id);
    store.createCommand(cmd, ver);

    const result = await worker.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("submitted");
    expect(updated?.submitted_at).not.toBeNull();

    const transitions = store.db
      .prepare("select * from outbound_transitions where outbound_id = ? order by id")
      .all(cmd.outbound_id) as Array<{ from_status: string | null; to_status: string }>;

    expect(transitions.map((t) => [t.from_status, t.to_status])).toEqual([
      [null, "pending"],
      ["pending", "draft_creating"],
      ["draft_creating", "draft_ready"],
      ["draft_ready", "sending"],
      ["sending", "submitted"],
    ]);

    const draft = store.getManagedDraft(cmd.outbound_id, ver.version);
    expect(draft).not.toBeUndefined();
    expect(draft?.draft_id).toBeDefined();
    expect(draftClient.sent.has(draft!.draft_id)).toBe(true);
  });

  it("reuses existing managed draft on retry", async () => {
    const cmd = createCommand({ status: "draft_ready" });
    const ver = createVersion(cmd.outbound_id);
    store.createCommand(cmd, ver);

    // Pre-create a managed draft that matches the version
    const { id: draftId } = await draftClient.createDraft("user-mailbox-1", {
      subject: ver.subject,
      body: { contentType: "HTML", content: ver.body_html },
      toRecipients: ver.to.map((email) => ({ emailAddress: { address: email } })),
      ccRecipients: [],
      bccRecipients: [],
      internetMessageHeaders: [{ name: "X-Outbound-Id", value: cmd.outbound_id }],
    });

    const now = new Date().toISOString();
    store.setManagedDraft({
      outbound_id: cmd.outbound_id,
      version: ver.version,
      draft_id: draftId,
      etag: null,
      internet_message_id: null,
      header_outbound_id_present: true,
      body_hash: "",
      recipients_hash: "",
      subject_hash: "",
      created_at: now,
      last_verified_at: null,
      invalidated_reason: null,
    });

    // Update the draft in the mock to have the exact content the worker expects
    // The worker recomputes hashes from the version and compares to remote.
    // Our mock createDraft already set the payload correctly.
    // However, the worker computes hashes using sha256 of body_text + body_html and recipients.
    // We need to ensure the mock draft payload matches exactly.
    const draftPayload = draftClient.drafts.get(draftId)!.payload;
    draftPayload.body = { contentType: "HTML", content: ver.body_html };
    draftPayload.toRecipients = ver.to.map((email) => ({ emailAddress: { address: email } }));
    draftPayload.ccRecipients = [];
    draftPayload.bccRecipients = [];
    draftPayload.subject = ver.subject;

    const result = await worker.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("submitted");
    expect(draftClient.sent.has(draftId)).toBe(true);
  });

  it("recreates missing managed draft", async () => {
    const cmd = createCommand({ status: "draft_ready" });
    const ver = createVersion(cmd.outbound_id);
    store.createCommand(cmd, ver);

    // No managed draft exists locally
    const result = await worker.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("submitted"); // recreates draft then sends

    const draft = store.getManagedDraft(cmd.outbound_id, ver.version);
    expect(draft).not.toBeUndefined();
  });

  it("hard-fails on external modification of draft", async () => {
    const cmd = createCommand({ status: "draft_ready" });
    const ver = createVersion(cmd.outbound_id);
    store.createCommand(cmd, ver);

    const { id: draftId } = await draftClient.createDraft("user-mailbox-1", {
      subject: ver.subject,
      body: { contentType: "HTML", content: ver.body_html },
      toRecipients: ver.to.map((email) => ({ emailAddress: { address: email } })),
      ccRecipients: [],
      bccRecipients: [],
      internetMessageHeaders: [{ name: "X-Outbound-Id", value: cmd.outbound_id }],
    });

    const now = new Date().toISOString();
    store.setManagedDraft({
      outbound_id: cmd.outbound_id,
      version: ver.version,
      draft_id: draftId,
      etag: null,
      internet_message_id: null,
      header_outbound_id_present: true,
      body_hash: "",
      recipients_hash: "",
      subject_hash: "",
      created_at: now,
      last_verified_at: null,
      invalidated_reason: null,
    });

    // Tamper with the remote draft
    const draftPayload = draftClient.drafts.get(draftId)!.payload;
    draftPayload.subject = "TAMPERED";

    const result = await worker.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("failed_terminal");
    expect(updated?.terminal_reason).toContain("External modification detected");
  });

  it("rejects stale or superseded version", async () => {
    const cmd = createCommand({ status: "draft_ready" });
    const ver = createVersion(cmd.outbound_id, 1);
    store.createCommand(cmd, ver);

    // Manually bump latest_version so version 1 is stale
    store.updateCommandStatus(cmd.outbound_id, "draft_ready", { latest_version: 2 });

    const result = await worker.processNext();
    expect(result.processed).toBe(false);
  });

  it("retryable send failure transitions to retry_wait", async () => {
    const cmd = createCommand({ status: "pending" });
    const ver = createVersion(cmd.outbound_id);
    store.createCommand(cmd, ver);

    draftClient.sendDraft = async () => {
      throw new ExchangeFSSyncError("Rate limited", {
        code: ErrorCode.GRAPH_RATE_LIMIT,
        recoverable: true,
        phase: "test",
      });
    };

    const result = await worker.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("retry_wait");
    expect(updated?.terminal_reason).toContain("Send failed");
  });

  it("ambiguous post-send crash leaves command in sending for reconciler", async () => {
    const cmd = createCommand({ status: "draft_ready" });
    const ver = createVersion(cmd.outbound_id);
    store.createCommand(cmd, ver);

    // Create managed draft
    const { id: draftId } = await draftClient.createDraft("user-mailbox-1", {
      subject: ver.subject,
      body: { contentType: "HTML", content: ver.body_html },
      toRecipients: ver.to.map((email) => ({ emailAddress: { address: email } })),
      ccRecipients: [],
      bccRecipients: [],
      internetMessageHeaders: [{ name: "X-Outbound-Id", value: cmd.outbound_id }],
    });
    store.setManagedDraft({
      outbound_id: cmd.outbound_id,
      version: ver.version,
      draft_id: draftId,
      etag: null,
      internet_message_id: null,
      header_outbound_id_present: true,
      body_hash: "",
      recipients_hash: "",
      subject_hash: "",
      created_at: new Date().toISOString(),
      last_verified_at: null,
      invalidated_reason: null,
    });

    // Ensure the draft payload matches exactly
    const draftPayload = draftClient.drafts.get(draftId)!.payload;
    draftPayload.body = { contentType: "HTML", content: ver.body_html };
    draftPayload.toRecipients = ver.to.map((email) => ({ emailAddress: { address: email } }));
    draftPayload.ccRecipients = [];
    draftPayload.bccRecipients = [];
    draftPayload.subject = ver.subject;

    // Simulate send success but SQLite write failure for submitted transition
    const originalUpdateCommandStatus = store.updateCommandStatus.bind(store);
    store.updateCommandStatus = (outboundId, status, updates) => {
      if (status === "submitted") {
        throw new Error("Simulated SQLite crash after send");
      }
      return originalUpdateCommandStatus(outboundId, status, updates);
    };

    const result = await worker.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("sending");
    expect(draftClient.sent.has(draftId)).toBe(true);
  });

  it("policy failure transitions to blocked_policy for non-participant", async () => {
    const cmd = createCommand({ status: "pending" });
    const ver = createVersion(cmd.outbound_id, 1, { to: ["stranger@example.com"] });
    store.createCommand(cmd, ver);

    worker = new SendReplyWorker({
      store,
      draftClient,
      participantResolver: createParticipantResolver(["alice@example.com"]),
      resolveUserId: (scopeId) => `user-${scopeId}`,
      logger: undefined,
    });

    const result = await worker.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("blocked_policy");
    expect(updated?.blocked_reason).toContain("not a thread participant");
  });

  it("draft_reply: pending -> confirmed without sending", async () => {
    const cmd = createCommand({ action_type: "draft_reply", status: "pending" });
    const ver = createVersion(cmd.outbound_id);
    store.createCommand(cmd, ver);

    const result = await worker.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("confirmed");
    expect(updated?.confirmed_at).not.toBeNull();

    const transitions = store.db
      .prepare("select * from outbound_transitions where outbound_id = ? order by id")
      .all(cmd.outbound_id) as Array<{ from_status: string | null; to_status: string }>;

    expect(transitions.map((t) => [t.from_status, t.to_status])).toEqual([
      [null, "pending"],
      ["pending", "draft_creating"],
      ["draft_creating", "draft_ready"],
      ["draft_ready", "confirmed"],
    ]);

    // Draft should be created but never sent
    const draft = store.getManagedDraft(cmd.outbound_id, ver.version);
    expect(draft).not.toBeUndefined();
    expect(draftClient.sent.has(draft!.draft_id)).toBe(false);
  });

  it("does not process commands in sending status", async () => {
    const cmd = createCommand({ status: "sending" });
    const ver = createVersion(cmd.outbound_id);
    store.createCommand(cmd, ver);

    const result = await worker.processNext();
    expect(result.processed).toBe(false);
  });
});
