import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import type { Intent } from "../../../src/intent/types.js";

describe("SqliteIntentStore", () => {
  let db: Database.Database;
  let store: SqliteIntentStore;

  beforeEach(() => {
    db = new Database(":memory:");
    store = new SqliteIntentStore({ db });
    store.initSchema();
  });

  afterEach(() => {
    store.close();
    db.close();
  });

  function makeIntent(overrides?: Partial<Omit<Intent, "created_at" | "updated_at">>): Omit<Intent, "created_at" | "updated_at"> {
    return {
      intent_id: "int-1",
      intent_type: "mail.send_reply",
      executor_family: "mail",
      payload_json: JSON.stringify({ subject: "Hello" }),
      idempotency_key: "key-001",
      status: "admitted",
      context_id: "conv-1",
      target_id: null,
      terminal_reason: null,
      ...overrides,
    };
  }

  describe("admit", () => {
    it("inserts a new intent and returns isNew=true", () => {
      const input = makeIntent();
      const { intent, isNew } = store.admit(input);

      expect(isNew).toBe(true);
      expect(intent.intent_id).toBe("int-1");
      expect(intent.status).toBe("admitted");
      expect(intent.created_at).toBeDefined();
      expect(intent.updated_at).toBeDefined();
    });

    it("is idempotent: returns existing intent when idempotency_key collides", () => {
      const input = makeIntent();
      store.admit(input);

      const second = makeIntent({ intent_id: "int-2", intent_type: "mail.mark_read" });
      const { intent, isNew } = store.admit(second);

      expect(isNew).toBe(false);
      expect(intent.intent_id).toBe("int-1");
      expect(intent.intent_type).toBe("mail.send_reply");
    });

    it("returns the same intent for identical idempotency keys in concurrent-like retry", () => {
      const input = makeIntent();
      const r1 = store.admit(input);
      const r2 = store.admit(input);

      expect(r1.intent.intent_id).toBe(r2.intent.intent_id);
      expect(r1.isNew).toBe(true);
      expect(r2.isNew).toBe(false);
    });
  });

  describe("getById", () => {
    it("retrieves an admitted intent by id", () => {
      const input = makeIntent();
      store.admit(input);

      const found = store.getById("int-1");
      expect(found).toBeDefined();
      expect(found!.intent_type).toBe("mail.send_reply");
      expect(found!.executor_family).toBe("mail");
    });

    it("returns undefined for unknown id", () => {
      expect(store.getById("no-such-intent")).toBeUndefined();
    });
  });

  describe("getByIdempotencyKey", () => {
    it("retrieves intent by idempotency key", () => {
      store.admit(makeIntent());
      const found = store.getByIdempotencyKey("key-001");
      expect(found).toBeDefined();
      expect(found!.context_id).toBe("conv-1");
    });
  });

  describe("getPendingIntents", () => {
    it("returns only admitted intents", () => {
      store.admit(makeIntent({ intent_id: "int-1", idempotency_key: "k1" }));
      store.admit(makeIntent({ intent_id: "int-2", idempotency_key: "k2", status: "completed" }));

      const pending = store.getPendingIntents();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.intent_id).toBe("int-1");
    });

    it("filters by executor family", () => {
      store.admit(makeIntent({ intent_id: "int-1", idempotency_key: "k1", executor_family: "mail" }));
      store.admit(makeIntent({ intent_id: "int-2", idempotency_key: "k2", executor_family: "process" }));

      const pending = store.getPendingIntents("mail");
      expect(pending).toHaveLength(1);
      expect(pending[0]!.executor_family).toBe("mail");
    });
  });

  describe("updateStatus", () => {
    it("updates status and target_id", async () => {
      store.admit(makeIntent());
      await new Promise((r) => setTimeout(r, 50));
      store.updateStatus("int-1", "completed", { target_id: "ob-123" });

      const updated = store.getById("int-1")!;
      expect(updated.status).toBe("completed");
      expect(updated.target_id).toBe("ob-123");
      expect(updated.updated_at >= updated.created_at).toBe(true);
    });

    it("sets terminal_reason", () => {
      store.admit(makeIntent());
      store.updateStatus("int-1", "failed_terminal", { terminal_reason: "policy violation" });

      const updated = store.getById("int-1")!;
      expect(updated.status).toBe("failed_terminal");
      expect(updated.terminal_reason).toBe("policy violation");
    });
  });
});
