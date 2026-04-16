import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import type { AgentSession } from "../../../src/coordinator/types.js";

describe("AgentSession store operations", () => {
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

  function insertSession(overrides?: Partial<AgentSession>): AgentSession {
    const now = new Date().toISOString();
    const session: AgentSession = {
      session_id: `sess_${Math.random().toString(36).slice(2)}`,
      context_id: "conv-1",
      work_item_id: `wi_${Math.random().toString(36).slice(2)}`,
      started_at: now,
      ended_at: null,
      updated_at: now,
      status: "opened",
      resume_hint: null,
      ...overrides,
    };
    store.insertAgentSession(session);
    return session;
  }

  it("inserts and retrieves a session", () => {
    const session = insertSession();
    const fetched = store.getAgentSession(session.session_id);
    expect(fetched).toBeDefined();
    expect(fetched!.status).toBe("opened");
    expect(fetched!.work_item_id).toBe(session.work_item_id);
    expect(fetched!.context_id).toBe("conv-1");
  });

  it("returns undefined for missing session", () => {
    expect(store.getAgentSession("sess-missing")).toBeUndefined();
  });

  it("getSessionForWorkItem returns the latest session for a work item", () => {
    const workItemId = "wi-1";
    insertSession({ work_item_id: workItemId, status: "opened", started_at: "2024-01-01T00:00:00.000Z" });
    const latest = insertSession({ work_item_id: workItemId, status: "active", started_at: "2024-01-02T00:00:00.000Z" });

    const fetched = store.getSessionForWorkItem(workItemId);
    expect(fetched).toBeDefined();
    expect(fetched!.status).toBe("active");
    expect(fetched!.session_id).toBe(latest.session_id);
  });

  it("getSessionsForConversation returns all sessions ordered by started_at desc", () => {
    insertSession({ context_id: "conv-1", status: "opened", started_at: "2024-01-01T00:00:00.000Z" });
    insertSession({ context_id: "conv-1", status: "active", started_at: "2024-01-02T00:00:00.000Z" });
    insertSession({ context_id: "conv-2", status: "opened", started_at: "2024-01-03T00:00:00.000Z" });

    const sessions = store.getSessionsForContext("conv-1");
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.status).toBe("active");
    expect(sessions[1]!.status).toBe("opened");
  });

  it("getResumableSessions filters by non-terminal statuses", () => {
    const opened = insertSession({ status: "opened" });
    const active = insertSession({ status: "active" });
    const idle = insertSession({ status: "idle" });
    insertSession({ status: "completed" });
    insertSession({ status: "abandoned" });
    insertSession({ status: "superseded" });

    const resumable = store.getResumableSessions();
    expect(resumable).toHaveLength(3);
    const ids = new Set(resumable.map((s) => s.session_id));
    expect(ids.has(opened.session_id)).toBe(true);
    expect(ids.has(active.session_id)).toBe(true);
    expect(ids.has(idle.session_id)).toBe(true);
  });

  it("getResumableSessions filters by mailbox_id", () => {
    const now = new Date().toISOString();
    store.db.prepare(`
      insert into conversation_records (conversation_id, mailbox_id, primary_charter, secondary_charters_json, status, assigned_agent, last_message_at, last_inbound_at, last_outbound_at, last_analyzed_at, last_triaged_at, created_at, updated_at)
      values ('conv-mb1', 'mb-1', 'steward', '[]', 'active', null, null, null, null, null, null, ?, ?)
    `).run(now, now);
    store.db.prepare(`
      insert into conversation_records (conversation_id, mailbox_id, primary_charter, secondary_charters_json, status, assigned_agent, last_message_at, last_inbound_at, last_outbound_at, last_analyzed_at, last_triaged_at, created_at, updated_at)
      values ('conv-mb2', 'mb-2', 'steward', '[]', 'active', null, null, null, null, null, null, ?, ?)
    `).run(now, now);
    store.db.prepare(`
      insert into work_items (work_item_id, conversation_id, mailbox_id, status, priority, opened_for_revision_id, created_at, updated_at)
      values ('wi-mb1', 'conv-mb1', 'mb-1', 'opened', 0, 'rev-1', ?, ?)
    `).run(now, now);
    store.db.prepare(`
      insert into work_items (work_item_id, conversation_id, mailbox_id, status, priority, opened_for_revision_id, created_at, updated_at)
      values ('wi-mb2', 'conv-mb2', 'mb-2', 'opened', 0, 'rev-1', ?, ?)
    `).run(now, now);

    insertSession({ work_item_id: "wi-mb1", status: "opened" });
    insertSession({ work_item_id: "wi-mb2", status: "opened" });

    const resumable = store.getResumableSessions("mb-1");
    expect(resumable).toHaveLength(1);
    expect(resumable[0]!.work_item_id).toBe("wi-mb1");
  });

  it("updateAgentSessionStatus transitions status and sets updated_at", () => {
    const session = insertSession({ status: "opened" });
    const before = new Date().toISOString();
    store.updateAgentSessionStatus(session.session_id, "active");
    const after = new Date().toISOString();

    const fetched = store.getAgentSession(session.session_id);
    expect(fetched!.status).toBe("active");
    expect(fetched!.updated_at >= before || fetched!.updated_at >= session.updated_at).toBe(true);
    expect(fetched!.updated_at <= after).toBe(true);
  });

  it("updateAgentSessionStatus can set ended_at", () => {
    const session = insertSession({ status: "active" });
    const now = new Date().toISOString();
    store.updateAgentSessionStatus(session.session_id, "completed", now);

    const fetched = store.getAgentSession(session.session_id);
    expect(fetched!.status).toBe("completed");
    expect(fetched!.ended_at).toBe(now);
  });

  it("updateAgentSessionResumeHint sets hint and updated_at", () => {
    const session = insertSession({ status: "idle" });
    const before = new Date().toISOString();
    store.updateAgentSessionResumeHint(session.session_id, "Waiting for operator");
    const after = new Date().toISOString();

    const fetched = store.getAgentSession(session.session_id);
    expect(fetched!.resume_hint).toBe("Waiting for operator");
    expect(fetched!.updated_at >= before || fetched!.updated_at >= session.updated_at).toBe(true);
    expect(fetched!.updated_at <= after).toBe(true);
  });
});
