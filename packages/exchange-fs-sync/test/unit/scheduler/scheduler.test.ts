import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { SqliteScheduler } from "../../../src/scheduler/scheduler.js";
import type { WorkItem } from "../../../src/coordinator/types.js";

describe("SqliteScheduler", () => {
  let db: Database.Database;
  let store: SqliteCoordinatorStore;
  let scheduler: SqliteScheduler;

  beforeEach(() => {
    db = new Database(":memory:");
    store = new SqliteCoordinatorStore({ db });
    store.initSchema();
    scheduler = new SqliteScheduler(store, { leaseDurationMs: 60_000, runnerId: "runner-1" });
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
      thread_id: conversationId,
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

  function insertWorkItem(overrides?: Partial<WorkItem>): WorkItem {
    const now = new Date().toISOString();
    const item: WorkItem = {
      work_item_id: `wi_${Math.random().toString(36).slice(2)}`,
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
    };
    store.insertWorkItem(item);
    return item;
  }

  // U1: Select runnable with status = 'opened'
  it("U1: selects opened work items as runnable", () => {
    createConversation("conv-1");
    insertWorkItem({ conversation_id: "conv-1", status: "opened" });

    const runnable = scheduler.scanForRunnableWork("mb-1", 10);
    expect(runnable).toHaveLength(1);
    expect(runnable[0]!.status).toBe("opened");
  });

  // U2: Select skips leased work item
  it("U2: skips leased work items", () => {
    createConversation("conv-1");
    insertWorkItem({ conversation_id: "conv-1", status: "leased" });

    const runnable = scheduler.scanForRunnableWork("mb-1", 10);
    expect(runnable).toHaveLength(0);
  });

  // U3: Select skips superseded work item
  it("U3: skips superseded work items", () => {
    createConversation("conv-1");
    insertWorkItem({ conversation_id: "conv-1", status: "superseded" });

    const runnable = scheduler.scanForRunnableWork("mb-1", 10);
    expect(runnable).toHaveLength(0);
  });

  // U4: Lease acquisition succeeds atomically
  it("U4: acquires lease atomically and transitions status to leased", () => {
    createConversation("conv-1");
    const item = insertWorkItem({ conversation_id: "conv-1", status: "opened" });

    const result = scheduler.acquireLease(item.work_item_id);
    expect(result.success).toBe(true);
    expect(result.lease).toBeDefined();

    const wi = store.getWorkItem(item.work_item_id);
    expect(wi!.status).toBe("leased");

    const lease = store.getActiveLeaseForWorkItem(item.work_item_id);
    expect(lease).toBeDefined();
    expect(lease!.released_at).toBeNull();
  });

  // U5: Concurrent lease acquisition on same work item — exactly one succeeds
  it("U5: concurrent lease acquisition allows only one winner", () => {
    createConversation("conv-1");
    const item = insertWorkItem({ conversation_id: "conv-1", status: "opened" });

    const schedA = new SqliteScheduler(store, { runnerId: "runner-a", leaseDurationMs: 60_000 });
    const schedB = new SqliteScheduler(store, { runnerId: "runner-b", leaseDurationMs: 60_000 });

    const rA = schedA.acquireLease(item.work_item_id);
    const rB = schedB.acquireLease(item.work_item_id);

    const winners = [rA, rB].filter((r) => r.success);
    expect(winners).toHaveLength(1);

    const activeLease = store.getActiveLeaseForWorkItem(item.work_item_id);
    expect(activeLease).toBeDefined();
  });

  // U6: Heartbeat extends expiry
  it("U6: heartbeat renews lease expiry", () => {
    createConversation("conv-1");
    const item = insertWorkItem({ conversation_id: "conv-1", status: "opened" });
    const result = scheduler.acquireLease(item.work_item_id);
    expect(result.success).toBe(true);

    const originalExpiry = result.lease!.expires_at;
    const newExpiry = new Date(Date.now() + 120_000).toISOString();

    scheduler.renewLease(result.lease!.lease_id, newExpiry);

    const lease = store.getActiveLeaseForWorkItem(item.work_item_id);
    expect(lease!.expires_at).toBe(newExpiry);
    expect(lease!.expires_at).not.toBe(originalExpiry);
  });

  // U7: Stale lease detection
  it("U7: stale lease scanner recovers abandoned work items", () => {
    createConversation("conv-1");
    const item = insertWorkItem({ conversation_id: "conv-1", status: "opened" });
    scheduler.acquireLease(item.work_item_id);

    const past = new Date(Date.now() - 120_000).toISOString();
    store.updateLeaseExpiry(store.getActiveLeaseForWorkItem(item.work_item_id)!.lease_id, past);

    const recovered = scheduler.recoverStaleLeases();
    expect(recovered).toHaveLength(1);

    const wi = store.getWorkItem(item.work_item_id);
    expect(wi!.status).toBe("failed_retryable");
    expect(wi!.retry_count).toBe(1);

    const lease = store.db.prepare("select * from work_item_leases where lease_id = ?").get(recovered[0]!.leaseId) as Record<string, unknown>;
    expect(lease.release_reason).toBe("abandoned");
  });

  // U8: Execution start writes attempt record
  it("U8: startExecution writes execution_attempts row with status active", () => {
    createConversation("conv-1");
    const item = insertWorkItem({ conversation_id: "conv-1", status: "opened" });
    scheduler.acquireLease(item.work_item_id);

    const attempt = scheduler.startExecution(item.work_item_id, "conv-1:rev:1", "{}");
    expect(attempt.status).toBe("active");

    const wi = store.getWorkItem(item.work_item_id);
    expect(wi!.status).toBe("executing");

    const fetched = store.getExecutionAttempt(attempt.execution_id);
    expect(fetched).toBeDefined();
    expect(fetched!.status).toBe("active");
  });

  // U9: Success path
  it("U9: completeExecution releases lease and marks attempt succeeded", () => {
    createConversation("conv-1");
    const item = insertWorkItem({ conversation_id: "conv-1", status: "opened" });
    scheduler.acquireLease(item.work_item_id);
    const attempt = scheduler.startExecution(item.work_item_id, "conv-1:rev:1", "{}");

    scheduler.completeExecution(attempt.execution_id, '{"ok":true}');

    const fetched = store.getExecutionAttempt(attempt.execution_id);
    expect(fetched!.status).toBe("succeeded");
    expect(JSON.parse(fetched!.outcome_json!)).toEqual({ ok: true });

    const lease = store.getActiveLeaseForWorkItem(item.work_item_id);
    expect(lease).toBeUndefined();
  });

  // U10: Crash path increments retry
  it("U10: failExecution marks crashed, releases lease, and increments retry", () => {
    createConversation("conv-1");
    const item = insertWorkItem({ conversation_id: "conv-1", status: "opened" });
    scheduler.acquireLease(item.work_item_id);
    const attempt = scheduler.startExecution(item.work_item_id, "conv-1:rev:1", "{}");

    scheduler.failExecution(attempt.execution_id, "Runtime error", true);

    const fetched = store.getExecutionAttempt(attempt.execution_id);
    expect(fetched!.status).toBe("crashed");

    const wi = store.getWorkItem(item.work_item_id);
    expect(wi!.status).toBe("failed_retryable");
    expect(wi!.retry_count).toBe(1);
    expect(wi!.next_retry_at).not.toBeNull();
  });

  // U11: Max retries → terminal
  it("U11: failExecution transitions to failed_terminal after max retries exceeded", () => {
    createConversation("conv-1");
    const item = insertWorkItem({ conversation_id: "conv-1", status: "opened", retry_count: 2 });
    scheduler.acquireLease(item.work_item_id);
    const attempt = scheduler.startExecution(item.work_item_id, "conv-1:rev:1", "{}");

    scheduler.failExecution(attempt.execution_id, "Final error", true);

    const wi = store.getWorkItem(item.work_item_id);
    expect(wi!.status).toBe("failed_terminal");
  });

  // U12: Supersession during retry — old item superseded, new opened
  it("U12: superseded work item is not runnable", () => {
    createConversation("conv-1");
    insertWorkItem({ conversation_id: "conv-1", status: "superseded" });
    insertWorkItem({ conversation_id: "conv-1", status: "opened" });

    const runnable = scheduler.scanForRunnableWork("mb-1", 10);
    expect(runnable).toHaveLength(1);
    expect(runnable[0]!.status).toBe("opened");
  });

  it("orders runnable by priority desc then created_at asc", () => {
    createConversation("conv-1");
    createConversation("conv-2");
    const t1 = new Date(Date.now() - 2000).toISOString();
    const t2 = new Date(Date.now() - 1000).toISOString();
    insertWorkItem({ conversation_id: "conv-1", status: "opened", priority: 0, created_at: t1 });
    insertWorkItem({ conversation_id: "conv-2", status: "opened", priority: 5, created_at: t2 });

    const runnable = scheduler.scanForRunnableWork("mb-1", 10);
    expect(runnable[0]!.conversation_id).toBe("conv-2");
    expect(runnable[1]!.conversation_id).toBe("conv-1");
  });

  it("enforces conversation-level serialization (only one active work item per conversation)", () => {
    createConversation("conv-1");
    insertWorkItem({ conversation_id: "conv-1", status: "leased" });
    insertWorkItem({ conversation_id: "conv-1", status: "opened" });

    const runnable = scheduler.scanForRunnableWork("mb-1", 10);
    expect(runnable).toHaveLength(0);
  });

  it("failed_retryable becomes runnable only after next_retry_at", () => {
    createConversation("conv-1");
    const future = new Date(Date.now() + 60_000).toISOString();
    const item = insertWorkItem({ conversation_id: "conv-1", status: "failed_retryable", next_retry_at: future });

    let runnable = scheduler.scanForRunnableWork("mb-1", 10);
    expect(runnable).toHaveLength(0);

    // Simulate time passing by updating next_retry_at to past
    store.updateWorkItemStatus(item.work_item_id, "failed_retryable", { next_retry_at: new Date(Date.now() - 1000).toISOString() });

    runnable = scheduler.scanForRunnableWork("mb-1", 10);
    expect(runnable).toHaveLength(1);
  });

  it("isQuiescent returns true when no runnable work exists", () => {
    createConversation("conv-1");
    expect(scheduler.isQuiescent("mb-1")).toBe(true);

    insertWorkItem({ conversation_id: "conv-1", status: "opened" });
    expect(scheduler.isQuiescent("mb-1")).toBe(false);
  });

  it("calculateBackoff respects base, exponent, and max ceiling", () => {
    const delay0 = scheduler.calculateBackoff(0);
    expect(delay0).toBeGreaterThanOrEqual(5000);
    expect(delay0).toBeLessThan(6000);

    const delay3 = scheduler.calculateBackoff(3);
    expect(delay3).toBeGreaterThanOrEqual(5000 * 8);
    expect(delay3).toBeLessThan(5000 * 8 + 1000);

    // High retry count should cap at maxDelayMs
    const delay10 = scheduler.calculateBackoff(10);
    expect(delay10).toBeLessThanOrEqual(300_000);
  });
});
