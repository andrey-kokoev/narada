import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import { createOutboundCommand, createOutboundVersion } from "./fixtures.js";

describe("SqliteOutboundStore", () => {
  let store: SqliteOutboundStore;

  beforeEach(() => {
    store = new SqliteOutboundStore({ dbPath: ":memory:" });
    store.initSchema();
  });

  afterEach(() => {
    store.close();
  });

  describe("command creation", () => {
    it("creates a command and version atomically", () => {
      const cmd = createOutboundCommand({ outbound_id: "o1" });
      const ver = createOutboundVersion({ outbound_id: "o1", version: 1 });
      store.createCommand(cmd, ver);

      const fetched = store.getCommand("o1");
      expect(fetched).toEqual(cmd);

      const latest = store.getLatestVersion("o1");
      expect(latest).toEqual(ver);
    });

    it("creates an initial transition row", () => {
      const cmd = createOutboundCommand({ outbound_id: "o1", status: "pending" });
      const ver = createOutboundVersion({ outbound_id: "o1", version: 1 });
      store.createCommand(cmd, ver);

      const transitions = store.db
        .prepare("select * from outbound_transitions where outbound_id = ?")
        .all("o1") as Array<Record<string, unknown>>;

      expect(transitions).toHaveLength(1);
      expect(transitions[0]!.to_status).toBe("pending");
      expect(transitions[0]!.from_status).toBeNull();
    });
  });

  describe("active unsent uniqueness", () => {
    it("throws when creating a second active unsent command for same thread+action", () => {
      const cmd1 = createOutboundCommand({ outbound_id: "o1", conversation_id: "t1", action_type: "send_reply" });
      const ver1 = createOutboundVersion({ outbound_id: "o1", version: 1 });
      store.createCommand(cmd1, ver1);

      const cmd2 = createOutboundCommand({ outbound_id: "o2", conversation_id: "t1", action_type: "send_reply" });
      const ver2 = createOutboundVersion({ outbound_id: "o2", version: 1 });

      expect(() => store.createCommand(cmd2, ver2)).toThrow(
        "Active unsent command already exists",
      );
    });

    it("allows a new command after the prior one is terminal", () => {
      const cmd1 = createOutboundCommand({ outbound_id: "o1", conversation_id: "t1", action_type: "send_reply" });
      const ver1 = createOutboundVersion({ outbound_id: "o1", version: 1 });
      store.createCommand(cmd1, ver1);

      store.updateCommandStatus("o1", "confirmed", { confirmed_at: new Date().toISOString() });

      const cmd2 = createOutboundCommand({ outbound_id: "o2", conversation_id: "t1", action_type: "send_reply" });
      const ver2 = createOutboundVersion({ outbound_id: "o2", version: 1 });
      expect(() => store.createCommand(cmd2, ver2)).not.toThrow();
    });

    it("allows different action types on the same thread", () => {
      const cmd1 = createOutboundCommand({ outbound_id: "o1", conversation_id: "t1", action_type: "send_reply" });
      store.createCommand(cmd1, createOutboundVersion({ outbound_id: "o1" }));

      const cmd2 = createOutboundCommand({ outbound_id: "o2", conversation_id: "t1", action_type: "mark_read" });
      expect(() => store.createCommand(cmd2, createOutboundVersion({ outbound_id: "o2" }))).not.toThrow();
    });
  });

  describe("versioning", () => {
    it("returns versions in ascending order", () => {
      const cmd = createOutboundCommand({ outbound_id: "o1", latest_version: 3 });
      const v1 = createOutboundVersion({ outbound_id: "o1", version: 1 });
      const v2 = createOutboundVersion({ outbound_id: "o1", version: 2 });
      const v3 = createOutboundVersion({ outbound_id: "o1", version: 3 });

      store.createCommand(cmd, v1);
      store.db.prepare(`
        insert into outbound_versions (outbound_id, version, reply_to_message_id, to_json, cc_json, bcc_json, subject, body_text, body_html, idempotency_key, policy_snapshot_json, created_at, superseded_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        v2.outbound_id, v2.version, v2.reply_to_message_id, JSON.stringify(v2.to), JSON.stringify(v2.cc), JSON.stringify(v2.bcc),
        v2.subject, v2.body_text, v2.body_html, v2.idempotency_key, v2.policy_snapshot_json, v2.created_at, v2.superseded_at,
      );
      store.db.prepare(`
        insert into outbound_versions (outbound_id, version, reply_to_message_id, to_json, cc_json, bcc_json, subject, body_text, body_html, idempotency_key, policy_snapshot_json, created_at, superseded_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        v3.outbound_id, v3.version, v3.reply_to_message_id, JSON.stringify(v3.to), JSON.stringify(v3.cc), JSON.stringify(v3.bcc),
        v3.subject, v3.body_text, v3.body_html, v3.idempotency_key, v3.policy_snapshot_json, v3.created_at, v3.superseded_at,
      );

      const versions = store.getVersions("o1");
      expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);
    });

    it("supersedes prior unsent versions", () => {
      const cmd = createOutboundCommand({ outbound_id: "o1", latest_version: 2 });
      const v1 = createOutboundVersion({ outbound_id: "o1", version: 1 });
      store.createCommand(cmd, v1);

      store.db.prepare(`
        insert into outbound_versions (outbound_id, version, reply_to_message_id, to_json, cc_json, bcc_json, subject, body_text, body_html, idempotency_key, policy_snapshot_json, created_at, superseded_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "o1", 2, null, "[]", "[]", "[]", "", "", "", "key-2", "{}", new Date().toISOString(), null,
      );

      store.supersedePriorVersions("o1", 2);
      const versions = store.getVersions("o1");
      expect(versions[0]!.superseded_at).not.toBeNull();
      expect(versions[1]!.superseded_at).toBeNull();
    });
  });

  describe("transitions", () => {
    it("appends a transition", () => {
      const cmd = createOutboundCommand({ outbound_id: "o1", status: "pending" });
      store.createCommand(cmd, createOutboundVersion({ outbound_id: "o1" }));

      store.appendTransition({
        outbound_id: "o1",
        version: 1,
        from_status: "pending",
        to_status: "draft_creating",
        reason: "worker claimed",
        transition_at: new Date().toISOString(),
      });

      const rows = store.db
        .prepare("select * from outbound_transitions where outbound_id = ? order by id asc")
        .all("o1") as Array<Record<string, unknown>>;

      expect(rows).toHaveLength(2);
      expect(rows[1]!.from_status).toBe("pending");
      expect(rows[1]!.to_status).toBe("draft_creating");
    });
  });

  describe("updateCommandStatus", () => {
    it("updates status and optional fields", () => {
      const cmd = createOutboundCommand({ outbound_id: "o1" });
      store.createCommand(cmd, createOutboundVersion({ outbound_id: "o1" }));

      const now = new Date().toISOString();
      store.updateCommandStatus("o1", "submitted", {
        submitted_at: now,
        latest_version: 1,
      });

      const updated = store.getCommand("o1")!;
      expect(updated.status).toBe("submitted");
      expect(updated.submitted_at).toBe(now);
    });
  });

  describe("fetchNextEligible", () => {
    it("returns commands in draft_ready status with latest unsuperseded version", () => {
      const cmd1 = createOutboundCommand({ outbound_id: "o1", mailbox_id: "m1", status: "draft_ready" });
      store.createCommand(cmd1, createOutboundVersion({ outbound_id: "o1", version: 1 }));

      const cmd2 = createOutboundCommand({ outbound_id: "o2", mailbox_id: "m2", conversation_id: "t2", status: "pending" });
      store.createCommand(cmd2, createOutboundVersion({ outbound_id: "o2", version: 1 }));

      const eligible = store.fetchNextEligible();
      expect(eligible).toHaveLength(1);
      expect(eligible[0]!.command.outbound_id).toBe("o1");
      expect(eligible[0]!.version.version).toBe(1);
    });

    it("filters by mailbox_id when provided", () => {
      const cmd1 = createOutboundCommand({ outbound_id: "o1", mailbox_id: "m1", status: "draft_ready" });
      store.createCommand(cmd1, createOutboundVersion({ outbound_id: "o1", version: 1 }));

      const cmd2 = createOutboundCommand({ outbound_id: "o2", mailbox_id: "m2", conversation_id: "t2", status: "draft_ready" });
      store.createCommand(cmd2, createOutboundVersion({ outbound_id: "o2", version: 1 }));

      const eligible = store.fetchNextEligible("m2");
      expect(eligible).toHaveLength(1);
      expect(eligible[0]!.command.outbound_id).toBe("o2");
    });

    it("excludes versions that are superseded", () => {
      const cmd = createOutboundCommand({ outbound_id: "o1", status: "draft_ready", latest_version: 2 });
      const v1 = createOutboundVersion({ outbound_id: "o1", version: 1 });
      store.createCommand(cmd, v1);

      store.db.prepare(`
        insert into outbound_versions (outbound_id, version, reply_to_message_id, to_json, cc_json, bcc_json, subject, body_text, body_html, idempotency_key, policy_snapshot_json, created_at, superseded_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "o1", 2, null, "[]", "[]", "[]", "", "", "", "key-2", "{}", new Date().toISOString(), new Date().toISOString(),
      );

      const eligible = store.fetchNextEligible();
      expect(eligible).toHaveLength(0);
    });
  });

  describe("getCommandStatus", () => {
    it("returns the status for an existing command", () => {
      const cmd = createOutboundCommand({ outbound_id: "o1", status: "pending" });
      store.createCommand(cmd, createOutboundVersion({ outbound_id: "o1" }));

      expect(store.getCommandStatus("o1")).toBe("pending");
    });

    it("returns undefined for a missing command", () => {
      expect(store.getCommandStatus("missing")).toBeUndefined();
    });
  });

  describe("getActiveCommandsForThread", () => {
    it("returns only active unsent commands for the thread", () => {
      const cmd1 = createOutboundCommand({ outbound_id: "o1", conversation_id: "t1", action_type: "send_reply", status: "pending" });
      store.createCommand(cmd1, createOutboundVersion({ outbound_id: "o1" }));

      const cmd2 = createOutboundCommand({ outbound_id: "o2", conversation_id: "t1", action_type: "mark_read", status: "pending" });
      store.createCommand(cmd2, createOutboundVersion({ outbound_id: "o2" }));

      // Make cmd1 terminal so we can create another send_reply for the same thread
      store.updateCommandStatus("o1", "confirmed", { confirmed_at: new Date().toISOString() });

      const cmd3 = createOutboundCommand({ outbound_id: "o3", conversation_id: "t1", action_type: "send_reply", status: "confirmed" });
      store.createCommand(cmd3, createOutboundVersion({ outbound_id: "o3" }));

      const cmd4 = createOutboundCommand({ outbound_id: "o4", conversation_id: "t2", action_type: "send_reply", status: "pending" });
      store.createCommand(cmd4, createOutboundVersion({ outbound_id: "o4" }));

      const active = store.getActiveCommandsForThread("t1");
      expect(active.map((c) => c.outbound_id).sort()).toEqual(["o2"]);
    });

    it("returns empty array when thread has no commands", () => {
      expect(store.getActiveCommandsForThread("no-such-thread")).toEqual([]);
    });
  });

  describe("managed drafts", () => {
    it("persists and retrieves a managed draft", () => {
      const cmd = createOutboundCommand({ outbound_id: "o1" });
      store.createCommand(cmd, createOutboundVersion({ outbound_id: "o1", version: 1 }));

      const draft = {
        outbound_id: "o1",
        version: 1,
        draft_id: "d1",
        etag: '"abc"',
        internet_message_id: null,
        header_outbound_id_present: true,
        body_hash: "h1",
        recipients_hash: "h2",
        subject_hash: "h3",
        created_at: new Date().toISOString(),
        last_verified_at: null,
        invalidated_reason: null,
      };

      store.setManagedDraft(draft);
      const fetched = store.getManagedDraft("o1", 1);
      expect(fetched).toEqual(draft);
    });

    it("updates an existing managed draft on conflict", () => {
      const cmd = createOutboundCommand({ outbound_id: "o1" });
      store.createCommand(cmd, createOutboundVersion({ outbound_id: "o1", version: 1 }));

      const draft1 = {
        outbound_id: "o1",
        version: 1,
        draft_id: "d1",
        etag: '"abc"',
        internet_message_id: null,
        header_outbound_id_present: false,
        body_hash: "h1",
        recipients_hash: "h2",
        subject_hash: "h3",
        created_at: new Date().toISOString(),
        last_verified_at: null,
        invalidated_reason: null,
      };

      const draft2 = { ...draft1, draft_id: "d2", header_outbound_id_present: true };

      store.setManagedDraft(draft1);
      store.setManagedDraft(draft2);

      const fetched = store.getManagedDraft("o1", 1);
      expect(fetched!.draft_id).toBe("d2");
      expect(fetched!.header_outbound_id_present).toBe(true);
    });
  });
});
