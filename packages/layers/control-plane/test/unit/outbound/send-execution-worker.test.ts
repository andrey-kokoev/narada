import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { OutboundStore } from "../../../src/outbound/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import type {
  OutboundCommand,
  OutboundVersion,
} from "../../../src/outbound/types.js";
import { SendExecutionWorker } from "../../../src/outbound/send-execution-worker.js";
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
    status: "approved_for_send",
    latest_version: 1,
    created_at: now,
    created_by: "test",
    submitted_at: null,
    confirmed_at: null,
    blocked_reason: null,
    terminal_reason: null,
    idempotency_key: "key-001",
    reviewed_at: null,
    reviewer_notes: null,
    external_reference: null,
    approved_at: now,
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

describe("SendExecutionWorker", () => {
  let store: SqliteOutboundStore;
  let draftClient: MockGraphDraftClient;
  let worker: SendExecutionWorker;

  beforeEach(() => {
    store = new SqliteOutboundStore({ dbPath: ":memory:" });
    store.initSchema();
    draftClient = new MockGraphDraftClient();
    worker = new SendExecutionWorker({
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

  it("happy path: approved_for_send -> submitted", async () => {
    const cmd = createCommand({ status: "approved_for_send" });
    const ver = createVersion(cmd.outbound_id);
    store.createCommand(cmd, ver);

    // Pre-create a managed draft
    const { id: draftId } = await draftClient.createDraft("user-mailbox-1", {
      subject: ver.subject,
      body: { contentType: "HTML", content: ver.body_html },
      toRecipients: ver.to.map((email) => ({ emailAddress: { address: email } })),
      ccRecipients: [],
      bccRecipients: [],
      internetMessageHeaders: [{ name: "X-Outbound-Id", value: cmd.outbound_id }],
    });

    const draftPayload = draftClient.drafts.get(draftId)!.payload;
    draftPayload.body = { contentType: "HTML", content: ver.body_html };
    draftPayload.toRecipients = ver.to.map((email) => ({ emailAddress: { address: email } }));
    draftPayload.ccRecipients = [];
    draftPayload.bccRecipients = [];
    draftPayload.subject = ver.subject;

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

    const result = await worker.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("submitted");
    expect(updated?.submitted_at).not.toBeNull();

    const transitions = store.db
      .prepare("select * from outbound_transitions where outbound_id = ? order by id")
      .all(cmd.outbound_id) as Array<{ from_status: string | null; to_status: string }>;

    expect(transitions.map((t) => [t.from_status, t.to_status])).toEqual([
      [null, "approved_for_send"],
      ["approved_for_send", "sending"],
      ["sending", "submitted"],
    ]);

    expect(draftClient.sent.has(draftId)).toBe(true);
  });

  it("missing managed draft at send time transitions to failed_terminal", async () => {
    const cmd = createCommand({ status: "approved_for_send" });
    const ver = createVersion(cmd.outbound_id);
    store.createCommand(cmd, ver);

    // No managed draft exists locally — send must NOT recreate it
    const result = await worker.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("failed_terminal");
    expect(updated?.terminal_reason).toContain("Managed draft missing at send time");

    const draft = store.getManagedDraft(cmd.outbound_id, ver.version);
    expect(draft).toBeUndefined();
  });

  it("retryable send failure transitions to retry_wait", async () => {
    const cmd = createCommand({ status: "approved_for_send" });
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

    const draftPayload = draftClient.drafts.get(draftId)!.payload;
    draftPayload.body = { contentType: "HTML", content: ver.body_html };
    draftPayload.toRecipients = ver.to.map((email) => ({ emailAddress: { address: email } }));
    draftPayload.ccRecipients = [];
    draftPayload.bccRecipients = [];
    draftPayload.subject = ver.subject;

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

  it("retry_wait command is skipped during cooldown", async () => {
    const cmd = createCommand({ status: "retry_wait" });
    const ver = createVersion(cmd.outbound_id);
    store.createCommand(cmd, ver);

    store.appendTransition({
      outbound_id: cmd.outbound_id,
      version: null,
      from_status: "sending",
      to_status: "retry_wait",
      reason: "Send failed: rate limited",
      transition_at: new Date().toISOString(),
    });

    const result = await worker.processNext();
    expect(result.processed).toBe(false);
  });

  it("retry_wait command is retried after cooldown expires", async () => {
    const cmd = createCommand({ status: "retry_wait" });
    const ver = createVersion(cmd.outbound_id);
    store.createCommand(cmd, ver);

    store.appendTransition({
      outbound_id: cmd.outbound_id,
      version: null,
      from_status: "sending",
      to_status: "retry_wait",
      reason: "Send failed: rate limited",
      transition_at: new Date(Date.now() - 60_000).toISOString(),
    });

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

    const result = await worker.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("submitted");

    const transitions = store.db
      .prepare("select * from outbound_transitions where outbound_id = ? order by id")
      .all(cmd.outbound_id) as Array<{ from_status: string | null; to_status: string }>;

    expect(transitions.map((t) => [t.from_status, t.to_status])).toEqual([
      [null, "retry_wait"],              // initial creation
      ["sending", "retry_wait"],         // first failure (manually appended above)
      ["retry_wait", "approved_for_send"], // explicit re-approval before retry
      ["approved_for_send", "sending"],    // send start
      ["sending", "submitted"],            // send succeeded
    ]);
  });

  it("retry_wait command with missing draft after cooldown transitions through approved_for_send to failed_terminal", async () => {
    const cmd = createCommand({ status: "retry_wait" });
    const ver = createVersion(cmd.outbound_id);
    store.createCommand(cmd, ver);

    store.appendTransition({
      outbound_id: cmd.outbound_id,
      version: null,
      from_status: "sending",
      to_status: "retry_wait",
      reason: "Send failed: rate limited",
      transition_at: new Date(Date.now() - 60_000).toISOString(),
    });

    // No managed draft — simulating a draft that was never created or was lost

    const result = await worker.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("failed_terminal");

    const transitions = store.db
      .prepare("select * from outbound_transitions where outbound_id = ? order by id")
      .all(cmd.outbound_id) as Array<{ from_status: string | null; to_status: string }>;

    expect(transitions.map((t) => [t.from_status, t.to_status])).toEqual([
      [null, "retry_wait"],              // initial creation
      ["sending", "retry_wait"],         // first failure (manually appended above)
      ["retry_wait", "approved_for_send"], // explicit re-approval before retry
      ["approved_for_send", "failed_terminal"], // missing draft after re-approval
    ]);
  });

  it("ambiguous post-send crash leaves command in sending for reconciler", async () => {
    const cmd = createCommand({ status: "approved_for_send" });
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

    const draftPayload = draftClient.drafts.get(draftId)!.payload;
    draftPayload.body = { contentType: "HTML", content: ver.body_html };
    draftPayload.toRecipients = ver.to.map((email) => ({ emailAddress: { address: email } }));
    draftPayload.ccRecipients = [];
    draftPayload.bccRecipients = [];
    draftPayload.subject = ver.subject;

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
    const cmd = createCommand({ status: "approved_for_send" });
    const ver = createVersion(cmd.outbound_id, 1, { to: ["stranger@example.com"] });
    store.createCommand(cmd, ver);

    const { id: draftId } = await draftClient.createDraft("user-mailbox-1", {
      subject: ver.subject,
      body: { contentType: "HTML", content: ver.body_html },
      toRecipients: ver.to.map((email) => ({ emailAddress: { address: email } })),
      ccRecipients: [],
      bccRecipients: [],
      internetMessageHeaders: [{ name: "X-Outbound-Id", value: cmd.outbound_id }],
    });

    const draftPayload = draftClient.drafts.get(draftId)!.payload;
    draftPayload.body = { contentType: "HTML", content: ver.body_html };
    draftPayload.toRecipients = ver.to.map((email) => ({ emailAddress: { address: email } }));
    draftPayload.ccRecipients = [];
    draftPayload.bccRecipients = [];
    draftPayload.subject = ver.subject;

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

    worker = new SendExecutionWorker({
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

  it("rejects stale or superseded version", async () => {
    const cmd = createCommand({ status: "approved_for_send" });
    const ver = createVersion(cmd.outbound_id, 1);
    store.createCommand(cmd, ver);

    // Manually bump latest_version so version 1 is stale
    store.updateCommandStatus(cmd.outbound_id, "approved_for_send", { latest_version: 2 });

    const result = await worker.processNext();
    expect(result.processed).toBe(false);
  });

  it("hard-fails on external modification of draft", async () => {
    const cmd = createCommand({ status: "approved_for_send" });
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

    // Tamper with the remote draft
    const draftPayload = draftClient.drafts.get(draftId)!.payload;
    draftPayload.subject = "TAMPERED";

    const result = await worker.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("failed_terminal");
    expect(updated?.terminal_reason).toContain("External modification detected");
  });

  it("does not process commands in draft_ready status", async () => {
    const cmd = createCommand({ status: "draft_ready" });
    const ver = createVersion(cmd.outbound_id);
    store.createCommand(cmd, ver);

    const result = await worker.processNext();
    expect(result.processed).toBe(false);
  });

  it("remote draft deletion during verification transitions to failed_terminal", async () => {
    const cmd = createCommand({ status: "approved_for_send" });
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

    draftClient.getDraft = async () => {
      throw new ExchangeFSSyncError("Not found", {
        code: ErrorCode.GRAPH_NOT_FOUND,
        recoverable: false,
        phase: "test",
      });
    };

    const result = await worker.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("failed_terminal");
    expect(updated?.terminal_reason).toContain("Draft deleted remotely before send");
  });

  it("auth error during draft verification transitions to failed_terminal", async () => {
    const cmd = createCommand({ status: "approved_for_send" });
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

    const draftPayload = draftClient.drafts.get(draftId)!.payload;
    draftPayload.body = { contentType: "HTML", content: ver.body_html };
    draftPayload.toRecipients = ver.to.map((email) => ({ emailAddress: { address: email } }));
    draftPayload.ccRecipients = [];
    draftPayload.bccRecipients = [];
    draftPayload.subject = ver.subject;

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

    draftClient.getDraft = async () => {
      throw new ExchangeFSSyncError("Unauthorized", {
        code: ErrorCode.GRAPH_AUTH_FAILED,
        recoverable: false,
        phase: "test",
      });
    };

    const result = await worker.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("failed_terminal");
    expect(updated?.terminal_reason).toContain("Auth error verifying draft before send");
  });

  it("auth error during send transitions to failed_terminal", async () => {
    const cmd = createCommand({ status: "approved_for_send" });
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

    const draftPayload = draftClient.drafts.get(draftId)!.payload;
    draftPayload.body = { contentType: "HTML", content: ver.body_html };
    draftPayload.toRecipients = ver.to.map((email) => ({ emailAddress: { address: email } }));
    draftPayload.ccRecipients = [];
    draftPayload.bccRecipients = [];
    draftPayload.subject = ver.subject;

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

    draftClient.sendDraft = async () => {
      throw new ExchangeFSSyncError("Unauthorized", {
        code: ErrorCode.GRAPH_AUTH_FAILED,
        recoverable: false,
        phase: "test",
      });
    };

    const result = await worker.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("failed_terminal");
    expect(updated?.terminal_reason).toContain("Auth error sending draft");
  });
});
