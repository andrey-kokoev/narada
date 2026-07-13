import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "../../../src/sqlite/database.js";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import type { OutboundCommand, OutboundVersion } from "../../../src/outbound/types.js";
import type { CreateDraftPayload, DraftReadResult, GraphDraftClient } from "../../../src/outbound/graph-draft-client.js";
import { ExchangeFSSyncError, ErrorCode } from "../../../src/errors.js";
import { OutboundHandoff } from "../../../src/foreman/handoff.js";
import { executeOperatorAction } from "../../../src/operator-actions/executor.js";
import { SendExecutionWorker } from "../../../src/outbound/send-execution-worker.js";

let sequence = 0;

function createCommand(overrides: Partial<OutboundCommand> = {}): OutboundCommand {
  const now = new Date().toISOString();
  const outboundId = overrides.outbound_id ?? `negative-outbound-${++sequence}`;
  return {
    outbound_id: outboundId,
    context_id: "negative-context",
    scope_id: "negative-scope",
    action_type: "send_reply",
    status: "approved_for_send",
    latest_version: 1,
    created_at: now,
    created_by: "integration-proof",
    submitted_at: null,
    confirmed_at: null,
    blocked_reason: null,
    terminal_reason: null,
    idempotency_key: `negative-key-${outboundId}`,
    reviewed_at: null,
    reviewer_notes: null,
    external_reference: null,
    approved_at: now,
    ...overrides,
  };
}

function createVersion(outboundId: string, overrides: Partial<OutboundVersion> = {}): OutboundVersion {
  const now = new Date().toISOString();
  return {
    outbound_id: outboundId,
    version: 1,
    reply_to_message_id: null,
    to: ["recipient@example.invalid"],
    cc: [],
    bcc: [],
    subject: "Integration proof",
    body_text: "Integration proof body",
    body_html: "<p>Integration proof body</p>",
    idempotency_key: `negative-key-${outboundId}`,
    policy_snapshot_json: "{}",
    payload_json: "{}",
    created_at: now,
    superseded_at: null,
    ...overrides,
  };
}

class IntegrationDraftClient implements GraphDraftClient {
  readonly drafts = new Map<string, DraftReadResult>();
  sendBehavior: "success" | "retryable" | "terminal" = "success";
  sendCalls = 0;

  async createDraft(_userId: string, payload: CreateDraftPayload): Promise<{ id: string }> {
    const id = `draft-${this.drafts.size + 1}`;
    this.drafts.set(id, {
      id,
      subject: payload.subject,
      body: payload.body,
      toRecipients: payload.toRecipients,
      ccRecipients: payload.ccRecipients,
      bccRecipients: payload.bccRecipients,
      internetMessageHeaders: payload.internetMessageHeaders,
    });
    return { id };
  }

  async getDraft(_userId: string, draftId: string): Promise<DraftReadResult> {
    const draft = this.drafts.get(draftId);
    if (!draft) {
      throw new ExchangeFSSyncError("Draft not found", {
        code: ErrorCode.GRAPH_NOT_FOUND,
        recoverable: false,
        phase: "negative-path-proof",
      });
    }
    return draft;
  }

  async sendDraft(_userId: string, draftId: string): Promise<void> {
    this.sendCalls += 1;
    if (this.sendBehavior === "retryable") {
      throw new ExchangeFSSyncError("Temporary provider failure", {
        code: ErrorCode.GRAPH_RATE_LIMIT,
        recoverable: true,
        phase: "negative-path-proof",
      });
    }
    if (this.sendBehavior === "terminal") {
      throw new ExchangeFSSyncError("Provider rejected credentials", {
        code: ErrorCode.GRAPH_AUTH_FAILED,
        recoverable: false,
        phase: "negative-path-proof",
      });
    }
    if (!this.drafts.has(draftId)) {
      throw new ExchangeFSSyncError("Draft not found", {
        code: ErrorCode.GRAPH_NOT_FOUND,
        recoverable: false,
        phase: "negative-path-proof",
      });
    }
  }
}

function createWorker(
  store: SqliteOutboundStore,
  draftClient: IntegrationDraftClient,
): SendExecutionWorker {
  return new SendExecutionWorker({
    store,
    draftClient,
    participantResolver: {
      getParticipants: async () => new Set(["recipient@example.invalid"]),
    },
    resolveUserId: (scopeId) => `user-${scopeId}`,
  });
}

function seedManagedDraft(
  store: SqliteOutboundStore,
  draftClient: IntegrationDraftClient,
  command: OutboundCommand,
  version: OutboundVersion,
): string {
  const draftId = `managed-${command.outbound_id}`;
  draftClient.drafts.set(draftId, {
    id: draftId,
    subject: version.subject,
    body: { contentType: "HTML", content: version.body_html },
    toRecipients: version.to.map((address) => ({ emailAddress: { address } })),
    ccRecipients: [],
    bccRecipients: [],
    internetMessageHeaders: [{ name: "X-Outbound-Id", value: command.outbound_id }],
  });
  store.setManagedDraft({
    outbound_id: command.outbound_id,
    version: version.version,
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
  return draftId;
}

describe("live operation negative paths", () => {
  let db: Database;
  let coordinatorStore: SqliteCoordinatorStore;
  let intentStore: SqliteIntentStore;
  let outboundStore: SqliteOutboundStore;
  let draftClient: IntegrationDraftClient;

  beforeEach(() => {
    db = new Database(":memory:");
    coordinatorStore = new SqliteCoordinatorStore({ db });
    intentStore = new SqliteIntentStore({ db });
    outboundStore = new SqliteOutboundStore({ db });
    coordinatorStore.initSchema();
    intentStore.initSchema();
    outboundStore.initSchema();
    draftClient = new IntegrationDraftClient();
  });

  afterEach(() => {
    db.close();
  });

  it("rejects a draft through the audited operator boundary and cancels it", async () => {
    const command = createCommand({ status: "draft_ready", approved_at: null });
    outboundStore.createCommand(command, createVersion(command.outbound_id));

    const result = await executeOperatorAction(
      { scope_id: command.scope_id, coordinatorStore, outboundStore, intentStore },
      {
        action_type: "reject_draft",
        target_id: command.outbound_id,
        payload_json: JSON.stringify({ rationale: "reviewer declined" }),
      },
    );

    expect(result.success).toBe(true);
    expect(outboundStore.getCommand(command.outbound_id)?.status).toBe("cancelled");
    expect(outboundStore.getCommand(command.outbound_id)?.terminal_reason).toBe("operator_rejected");
    expect(outboundStore.getLatestTransition(command.outbound_id, "cancelled")?.reason).toBe("operator_rejected: reviewer declined");
    expect(db.prepare("select status from operator_action_requests where request_id = ?").get(result.request_id)).toEqual({ status: "executed" });
  });

  it("cancels unsent context work before the send worker can act", async () => {
    const command = createCommand({ status: "draft_ready" });
    outboundStore.createCommand(command, createVersion(command.outbound_id));
    const handoff = new OutboundHandoff({ coordinatorStore, outboundStore });

    expect(handoff.cancelUnsentCommandsForContext(command.context_id, "superseded_by_new_revision")).toBe(1);
    expect(outboundStore.getCommand(command.outbound_id)?.status).toBe("cancelled");
    expect(outboundStore.getLatestTransition(command.outbound_id, "cancelled")?.reason).toBe("superseded_by_new_revision");

    const result = await createWorker(outboundStore, draftClient).processNext();
    expect(result.processed).toBe(false);
    expect(draftClient.sendCalls).toBe(0);
  });

  it("records a retryable provider failure as retry_wait", async () => {
    const command = createCommand();
    const version = createVersion(command.outbound_id);
    outboundStore.createCommand(command, version);
    seedManagedDraft(outboundStore, draftClient, command, version);
    draftClient.sendBehavior = "retryable";

    const result = await createWorker(outboundStore, draftClient).processNext();

    expect(result.processed).toBe(true);
    expect(outboundStore.getCommand(command.outbound_id)?.status).toBe("retry_wait");
    expect(outboundStore.getLatestTransition(command.outbound_id, "retry_wait")?.to_status).toBe("retry_wait");
    expect(draftClient.sendCalls).toBe(1);
  });

  it("records a terminal provider failure without retrying", async () => {
    const command = createCommand();
    const version = createVersion(command.outbound_id);
    outboundStore.createCommand(command, version);
    seedManagedDraft(outboundStore, draftClient, command, version);
    draftClient.sendBehavior = "terminal";

    await createWorker(outboundStore, draftClient).processNext();

    expect(outboundStore.getCommand(command.outbound_id)?.status).toBe("failed_terminal");
    expect(outboundStore.getCommand(command.outbound_id)?.terminal_reason).toContain("Auth error sending draft");
    expect(draftClient.sendCalls).toBe(1);
  });

  it("fails closed on a tampered managed draft before send", async () => {
    const command = createCommand();
    const version = createVersion(command.outbound_id);
    outboundStore.createCommand(command, version);
    const draftId = seedManagedDraft(outboundStore, draftClient, command, version);
    draftClient.drafts.get(draftId)!.body = { contentType: "HTML", content: "<p>tampered</p>" };

    await createWorker(outboundStore, draftClient).processNext();

    expect(outboundStore.getCommand(command.outbound_id)?.status).toBe("failed_terminal");
    expect(outboundStore.getCommand(command.outbound_id)?.terminal_reason).toContain("External modification detected");
    expect(draftClient.sendCalls).toBe(0);
  });
});
