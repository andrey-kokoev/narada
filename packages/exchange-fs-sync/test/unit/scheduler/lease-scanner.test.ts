import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { createLeaseScanner } from "../../../src/scheduler/lease-scanner.js";

describe("LeaseScanner", () => {
  let db: Database.Database;
  let store: SqliteCoordinatorStore;

  beforeEach(() => {
    db = new Database(":memory:");
    store = new SqliteCoordinatorStore({ db });
    store.initSchema();
  });

  afterEach(() => {
    store.close();
    db.close();
  });

  function createConversation(conversationId: string, mailboxId: string = "mb-1"): void {
    store.upsertConversationRecord({
      conversation_id: conversationId,
      mailbox_id: mailboxId,
      primary_charter: "support_steward",
      secondary_charters_json: "[]",
      status: "active",
      assigned_agent: null,
      last_message_at: null,
      last_inbound_at: null,
      last_outbound_at: null,
      last_analyzed_at: null,
      last_triaged_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    store.upsertThread({
      conversation_id: conversationId,
      mailbox_id: mailboxId,
      primary_charter: "support_steward",
      secondary_charters_json: "[]",
      status: "active",
      assigned_agent: null,
      last_message_at: new Date().toISOString(),
      last_inbound_at: null,
      last_outbound_at: null,
      last_analyzed_at: null,
      last_triaged_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  function insertWorkItem(overrides?: { conversation_id?: string; mailbox_id?: string; status?: "opened" | "leased" | "executing" | "failed_retryable" | "failed_terminal" | "superseded"; priority?: number; retry_count?: number; next_retry_at?: string | null }): string {
    const now = new Date().toISOString();
    const workItemId = `wi_${Math.random().toString(36).slice(2)}`;
    store.insertWorkItem({
      work_item_id: workItemId,
      conversation_id: "conv-1",
      mailbox_id: "mb-1",
      status: "opened",
      priority: 0,
      opened_for_revision_id: "conv-1:rev:1",
      resolved_revision_id: null,
      resolution_outcome: null,
      error_message: null,
      retry_count: 0,
      next_retry_at: null,
      created_at: now,
      updated_at: now,
      ...overrides,
    });
    return workItemId;
  }

  it("recovers stale leases and transitions work items to failed_retryable", () => {
    createConversation("conv-1");
    const wi = insertWorkItem({ status: "opened" });

    const leaseId = `ls_${Math.random().toString(36).slice(2)}`;
    store.insertLease({
      lease_id: leaseId,
      work_item_id: wi,
      runner_id: "runner-1",
      acquired_at: new Date(Date.now() - 120_000).toISOString(),
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      released_at: null,
      release_reason: null,
    });
    store.updateWorkItemStatus(wi, "leased");

    const scanner = createLeaseScanner(store);
    const recovered = scanner.recoverStaleLeases();

    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.leaseId).toBe(leaseId);
    expect(recovered[0]!.workItemId).toBe(wi);

    const item = store.getWorkItem(wi);
    expect(item!.status).toBe("failed_retryable");
    expect(item!.retry_count).toBe(1);

    const lease = store.db.prepare("select * from work_item_leases where lease_id = ?").get(leaseId) as Record<string, unknown>;
    expect(lease.release_reason).toBe("abandoned");
    expect(lease.released_at).not.toBeNull();
  });

  it("does not recover leases that are still valid", () => {
    createConversation("conv-1");
    const wi = insertWorkItem({ status: "opened" });

    const leaseId = `ls_${Math.random().toString(36).slice(2)}`;
    store.insertLease({
      lease_id: leaseId,
      work_item_id: wi,
      runner_id: "runner-1",
      acquired_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      released_at: null,
      release_reason: null,
    });
    store.updateWorkItemStatus(wi, "leased");

    const scanner = createLeaseScanner(store);
    const recovered = scanner.recoverStaleLeases();

    expect(recovered).toHaveLength(0);

    const item = store.getWorkItem(wi);
    expect(item!.status).toBe("leased");
  });

  it("does not recover already released leases", () => {
    createConversation("conv-1");
    const wi = insertWorkItem({ status: "opened" });

    const leaseId = `ls_${Math.random().toString(36).slice(2)}`;
    store.insertLease({
      lease_id: leaseId,
      work_item_id: wi,
      runner_id: "runner-1",
      acquired_at: new Date(Date.now() - 120_000).toISOString(),
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      released_at: new Date().toISOString(),
      release_reason: "success",
    });
    store.updateWorkItemStatus(wi, "leased");

    const scanner = createLeaseScanner(store);
    const recovered = scanner.recoverStaleLeases();

    expect(recovered).toHaveLength(0);
  });

  it("abandons active execution attempts when recovering stale leases", () => {
    createConversation("conv-1");
    const wi = insertWorkItem({ status: "opened" });

    const leaseId = `ls_${Math.random().toString(36).slice(2)}`;
    store.insertLease({
      lease_id: leaseId,
      work_item_id: wi,
      runner_id: "runner-1",
      acquired_at: new Date(Date.now() - 120_000).toISOString(),
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      released_at: null,
      release_reason: null,
    });
    store.updateWorkItemStatus(wi, "executing");

    const exId = `ex_${Math.random().toString(36).slice(2)}`;
    store.insertExecutionAttempt({
      execution_id: exId,
      work_item_id: wi,
      revision_id: "conv-1:rev:1",
      session_id: null,
      status: "active",
      started_at: new Date(Date.now() - 90_000).toISOString(),
      completed_at: null,
      runtime_envelope_json: "{}",
      outcome_json: null,
      error_message: null,
    });

    const scanner = createLeaseScanner(store);
    scanner.recoverStaleLeases();

    const attempt = store.getExecutionAttempt(exId);
    expect(attempt!.status).toBe("abandoned");
    expect(attempt!.completed_at).not.toBeNull();
  });
});
