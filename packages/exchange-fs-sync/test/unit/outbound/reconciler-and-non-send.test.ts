import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import type { OutboundCommand, OutboundVersion } from "../../../src/outbound/types.js";
import { OutboundReconciler, type FoundMessage, type MessageFinder } from "../../../src/outbound/reconciler.js";
import { NonSendWorker, type NonSendGraphClient } from "../../../src/outbound/non-send-worker.js";

function createCommand(
  overrides?: Partial<OutboundCommand>,
): OutboundCommand {
  const now = new Date().toISOString();
  return {
    outbound_id: `out-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    conversation_id: "thread-1",
    mailbox_id: "mailbox-1",
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
    reply_to_message_id: null,
    to: [],
    cc: [],
    bcc: [],
    subject: "",
    body_text: "",
    body_html: "",
    idempotency_key: `key-${version}`,
    policy_snapshot_json: "{}",
    payload_json: "{}",
    created_at: new Date().toISOString(),
    superseded_at: null,
    ...overrides,
  };
}

class MockMessageFinder implements MessageFinder {
  byOutboundId = new Map<string, FoundMessage>();
  byMessageId = new Map<string, FoundMessage>();

  async findByOutboundId(_mailboxId: string, outboundId: string): Promise<FoundMessage | undefined> {
    return this.byOutboundId.get(outboundId);
  }

  async findByMessageId(_mailboxId: string, messageId: string): Promise<FoundMessage | undefined> {
    return this.byMessageId.get(messageId);
  }
}

class MockNonSendGraphClient implements NonSendGraphClient {
  patches: Array<{ userId: string; messageId: string; body: object }> = [];
  moves: Array<{ userId: string; messageId: string; destinationId: string }> = [];

  async patchMessage(userId: string, messageId: string, body: object): Promise<void> {
    this.patches.push({ userId, messageId, body });
  }

  async moveMessage(userId: string, messageId: string, destinationId: string): Promise<void> {
    this.moves.push({ userId, messageId, destinationId });
  }

  reset(): void {
    this.patches = [];
    this.moves = [];
  }
}

describe("OutboundReconciler", () => {
  let store: SqliteOutboundStore;
  let finder: MockMessageFinder;
  let reconciler: OutboundReconciler;

  beforeEach(() => {
    store = new SqliteOutboundStore({ dbPath: ":memory:" });
    store.initSchema();
    finder = new MockMessageFinder();
    reconciler = new OutboundReconciler({
      store,
      messageFinder: finder,
      confirmWindowMs: 1000, // short window for tests
    });
  });

  afterEach(() => {
    store.close();
  });

  it("transitions send_reply submitted -> confirmed when message found by outbound_id", async () => {
    const cmd = createCommand({ action_type: "send_reply", status: "submitted", submitted_at: new Date().toISOString() });
    const ver = createVersion(cmd.outbound_id);
    store.createCommand(cmd, ver);

    finder.byOutboundId.set(cmd.outbound_id, { messageId: "msg-123" });

    const result = await reconciler.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("confirmed");
    expect(updated?.confirmed_at).not.toBeNull();
  });

  it("leaves submitted if not confirmed yet and window has not elapsed", async () => {
    const cmd = createCommand({ action_type: "send_reply", status: "submitted", submitted_at: new Date().toISOString() });
    const ver = createVersion(cmd.outbound_id);
    store.createCommand(cmd, ver);

    // No message found
    const result = await reconciler.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("submitted");
  });

  it("transitions to retry_wait when confirmation window expires", async () => {
    const old = new Date(Date.now() - 2000).toISOString();
    const cmd = createCommand({ action_type: "send_reply", status: "submitted", submitted_at: old });
    const ver = createVersion(cmd.outbound_id);
    store.createCommand(cmd, ver);

    const result = await reconciler.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("retry_wait");
  });

  it("confirms mark_read when message is_read=true", async () => {
    const cmd = createCommand({
      action_type: "mark_read",
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    const ver = createVersion(cmd.outbound_id, 1, {
      payload_json: JSON.stringify({ target_message_id: "msg-456" }),
    });
    store.createCommand(cmd, ver);

    finder.byMessageId.set("msg-456", { messageId: "msg-456", isRead: true });

    const result = await reconciler.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("confirmed");
  });

  it("does not confirm mark_read when message is_read=false", async () => {
    const old = new Date(Date.now() - 2000).toISOString();
    const cmd = createCommand({
      action_type: "mark_read",
      status: "submitted",
      submitted_at: old,
    });
    const ver = createVersion(cmd.outbound_id, 1, {
      payload_json: JSON.stringify({ target_message_id: "msg-456" }),
    });
    store.createCommand(cmd, ver);

    finder.byMessageId.set("msg-456", { messageId: "msg-456", isRead: false });

    const result = await reconciler.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("retry_wait");
  });

  it("confirms move_message when message is in destination folder", async () => {
    const cmd = createCommand({
      action_type: "move_message",
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    const ver = createVersion(cmd.outbound_id, 1, {
      payload_json: JSON.stringify({ target_message_id: "msg-789", destination_folder_id: "archive" }),
    });
    store.createCommand(cmd, ver);

    finder.byMessageId.set("msg-789", { messageId: "msg-789", folderRefs: ["inbox", "archive"] });

    const result = await reconciler.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("confirmed");
  });

  it("confirms set_categories when categories present", async () => {
    const cmd = createCommand({
      action_type: "set_categories",
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    const ver = createVersion(cmd.outbound_id, 1, {
      payload_json: JSON.stringify({ target_message_id: "msg-cat", categories: ["urgent", "vip"] }),
    });
    store.createCommand(cmd, ver);

    finder.byMessageId.set("msg-cat", { messageId: "msg-cat", categoryRefs: ["urgent", "vip", "follow-up"] });

    const result = await reconciler.processNext();
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("confirmed");
  });
});

describe("NonSendWorker", () => {
  let store: SqliteOutboundStore;
  let graphClient: MockNonSendGraphClient;
  let worker: NonSendWorker;

  beforeEach(() => {
    store = new SqliteOutboundStore({ dbPath: ":memory:" });
    store.initSchema();
    graphClient = new MockNonSendGraphClient();
    worker = new NonSendWorker({
      store,
      graphClient,
      resolveUserId: (mailboxId) => `user-${mailboxId}`,
      logger: undefined,
    });
  });

  afterEach(() => {
    store.close();
  });

  it("executes mark_read and transitions to submitted", async () => {
    const cmd = createCommand({ action_type: "mark_read", status: "pending" });
    const ver = createVersion(cmd.outbound_id, 1, {
      payload_json: JSON.stringify({ target_message_id: "msg-1" }),
    });
    store.createCommand(cmd, ver);

    const result = await worker.processNext("mark_read");
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("submitted");
    expect(graphClient.patches).toHaveLength(1);
    expect(graphClient.patches[0]!).toEqual({
      userId: "user-mailbox-1",
      messageId: "msg-1",
      body: { isRead: true },
    });
  });

  it("executes move_message and transitions to submitted", async () => {
    const cmd = createCommand({ action_type: "move_message", status: "pending" });
    const ver = createVersion(cmd.outbound_id, 1, {
      payload_json: JSON.stringify({ target_message_id: "msg-2", destination_folder_id: "deleteditems" }),
    });
    store.createCommand(cmd, ver);

    const result = await worker.processNext("move_message");
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("submitted");
    expect(graphClient.moves).toHaveLength(1);
    expect(graphClient.moves[0]!).toEqual({
      userId: "user-mailbox-1",
      messageId: "msg-2",
      destinationId: "deleteditems",
    });
  });

  it("executes set_categories and transitions to submitted", async () => {
    const cmd = createCommand({ action_type: "set_categories", status: "pending" });
    const ver = createVersion(cmd.outbound_id, 1, {
      payload_json: JSON.stringify({ target_message_id: "msg-3", categories: ["blue", "red"] }),
    });
    store.createCommand(cmd, ver);

    const result = await worker.processNext("set_categories");
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("submitted");
    expect(graphClient.patches).toHaveLength(1);
    expect(graphClient.patches[0]!).toEqual({
      userId: "user-mailbox-1",
      messageId: "msg-3",
      body: { categories: ["blue", "red"] },
    });
  });

  it("fails terminal when target_message_id is missing", async () => {
    const cmd = createCommand({ action_type: "mark_read", status: "pending" });
    const ver = createVersion(cmd.outbound_id, 1, { payload_json: "{}" });
    store.createCommand(cmd, ver);

    const result = await worker.processNext("mark_read");
    expect(result.processed).toBe(true);

    const updated = store.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("failed_terminal");
  });

  it("returns processed false when no eligible commands exist", async () => {
    const result = await worker.processNext("mark_read");
    expect(result.processed).toBe(false);
  });
});
