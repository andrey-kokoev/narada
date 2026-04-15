import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import type { ToolCallRecord, WorkItem, ExecutionAttempt } from "../../../src/coordinator/types.js";

describe("SqliteCoordinatorStore — tool_call_records", () => {
  let db: Database.Database;
  let store: SqliteCoordinatorStore;

  beforeEach(() => {
    db = new Database(":memory:");
    store = new SqliteCoordinatorStore({ db });
    store.initSchema();

    // Seed required foreign-key rows
    store.upsertConversationRecord({
      conversation_id: "conv-1",
      mailbox_id: "mb-1",
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

    const workItem: WorkItem = {
      work_item_id: "wi-1",
      conversation_id: "conv-1",
      mailbox_id: "mb-1",
      status: "executing",
      priority: 0,
      opened_for_revision_id: "rev-1",
      resolved_revision_id: null,
      resolution_outcome: null,
      error_message: null,
      retry_count: 0,
      next_retry_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.insertWorkItem(workItem);

    const attempt: ExecutionAttempt = {
      execution_id: "ex-1",
      work_item_id: "wi-1",
      revision_id: "rev-1",
      session_id: null,
      status: "active",
      started_at: new Date().toISOString(),
      completed_at: null,
      runtime_envelope_json: "{}",
      outcome_json: null,
      error_message: null,
    };
    store.insertExecutionAttempt(attempt);
  });

  afterEach(() => {
    store.close();
    db.close();
  });

  function makeRecord(overrides?: Partial<ToolCallRecord>): ToolCallRecord {
    const now = new Date().toISOString();
    return {
      call_id: "tc-1",
      execution_id: "ex-1",
      work_item_id: "wi-1",
      conversation_id: "conv-1",
      tool_id: "lookup_customer",
      request_args_json: JSON.stringify({ email: "a@b.com" }),
      exit_status: "pending",
      stdout: "",
      stderr: "",
      structured_output_json: null,
      started_at: now,
      completed_at: now,
      duration_ms: 0,
      ...overrides,
    };
  }

  it("inserts and retrieves tool call records by execution", () => {
    store.insertToolCallRecord(makeRecord({ call_id: "tc-1" }));
    store.insertToolCallRecord(makeRecord({ call_id: "tc-2", exit_status: "success" }));

    const records = store.getToolCallRecordsByExecution("ex-1");
    expect(records).toHaveLength(2);
    expect(records[0]!.call_id).toBe("tc-1");
    expect(records[1]!.call_id).toBe("tc-2");
  });

  it("retrieves tool call records by work item", () => {
    store.insertToolCallRecord(makeRecord({ call_id: "tc-1" }));

    const records = store.getToolCallRecordsByWorkItem("wi-1");
    expect(records).toHaveLength(1);
    expect(records[0]!.tool_id).toBe("lookup_customer");
  });

  it("updates a tool call record", () => {
    store.insertToolCallRecord(makeRecord({ call_id: "tc-1", exit_status: "pending" }));

    store.updateToolCallRecord("tc-1", {
      exit_status: "success",
      stdout: "{\"found\":true}",
      structured_output_json: "{\"found\":true}",
      duration_ms: 42,
      completed_at: new Date().toISOString(),
    });

    const records = store.getToolCallRecordsByExecution("ex-1");
    expect(records[0]!.exit_status).toBe("success");
    expect(records[0]!.stdout).toBe('{"found":true}');
    expect(records[0]!.duration_ms).toBe(42);
  });

  it("supports all corrected status values from 004b", () => {
    const statuses: ToolCallRecord["exit_status"][] = [
      "pending",
      "success",
      "timeout",
      "permission_denied",
      "error",
      "budget_exceeded",
    ];

    for (let i = 0; i < statuses.length; i++) {
      store.insertToolCallRecord(
        makeRecord({ call_id: `tc-${i}`, exit_status: statuses[i]! }),
      );
    }

    const records = store.getToolCallRecordsByExecution("ex-1");
    expect(records).toHaveLength(statuses.length);
    const foundStatuses = records.map((r) => r.exit_status);
    for (const s of statuses) {
      expect(foundStatuses).toContain(s);
    }
  });
});
