import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteFactStore } from "../../../src/facts/store.js";
import type { FactType, FactProvenance } from "../../../src/facts/types.js";

function createStore(): SqliteFactStore {
  const db = new Database(":memory:");
  const store = new SqliteFactStore({ db });
  store.initSchema();
  return store;
}

function makeFact(overrides?: {
  fact_id?: string;
  fact_type?: FactType;
  provenance?: Partial<FactProvenance>;
  payload_json?: string;
}) {
  return {
    fact_id: overrides?.fact_id ?? "fact_001",
    fact_type: overrides?.fact_type ?? "mail.message.discovered",
    provenance: {
      source_id: overrides?.provenance?.source_id ?? "src-1",
      source_record_id: overrides?.provenance?.source_record_id ?? "rec-1",
      source_version: overrides?.provenance?.source_version ?? "v1",
      source_cursor: overrides?.provenance?.source_cursor ?? "cursor-1",
      observed_at: overrides?.provenance?.observed_at ?? "2024-01-01T00:00:00Z",
    },
    payload_json: overrides?.payload_json ?? JSON.stringify({ subject: "Hello" }),
  };
}

describe("SqliteFactStore", () => {
  let store: SqliteFactStore;

  beforeEach(() => {
    store = createStore();
  });

  it("ingests a new fact", () => {
    const fact = makeFact();
    const result = store.ingest(fact);

    expect(result.isNew).toBe(true);
    expect(result.fact.fact_id).toBe(fact.fact_id);
    expect(result.fact.created_at).toBeDefined();
  });

  it("returns existing fact on duplicate ingest", () => {
    const fact = makeFact();
    const first = store.ingest(fact);
    const second = store.ingest(fact);

    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect(second.fact.fact_id).toBe(first.fact.fact_id);
    expect(second.fact.created_at).toBe(first.fact.created_at);
  });

  it("retrieves a fact by id", () => {
    const fact = makeFact();
    store.ingest(fact);

    const retrieved = store.getById(fact.fact_id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.fact_type).toBe("mail.message.discovered");
    expect(retrieved!.provenance.source_id).toBe("src-1");
  });

  it("retrieves a fact by source record", () => {
    const fact = makeFact();
    store.ingest(fact);

    const retrieved = store.getBySourceRecord("src-1", "rec-1");
    expect(retrieved).toBeDefined();
    expect(retrieved!.fact_id).toBe(fact.fact_id);
  });

  it("returns facts for a given source cursor", () => {
    store.ingest(makeFact({ fact_id: "f1", provenance: { source_record_id: "rec-1", source_cursor: "cursor-a" } }));
    store.ingest(makeFact({ fact_id: "f2", provenance: { source_record_id: "rec-2", source_cursor: "cursor-a" } }));
    store.ingest(makeFact({ fact_id: "f3", provenance: { source_record_id: "rec-3", source_cursor: "cursor-b" } }));

    const facts = store.getFactsForCursor("src-1", "cursor-a");
    expect(facts).toHaveLength(2);
    expect(facts.map((f) => f.fact_id).sort()).toEqual(["f1", "f2"]);
  });

  it("returns undefined for missing facts", () => {
    expect(store.getById("missing")).toBeUndefined();
    expect(store.getBySourceRecord("src-x", "rec-x")).toBeUndefined();
  });

  it("stores provenance as json", () => {
    const fact = makeFact();
    store.ingest(fact);

    const row = store.db.prepare("select provenance_json from facts where fact_id = ?").get(fact.fact_id) as {
      provenance_json: string;
    };
    const parsed = JSON.parse(row.provenance_json);
    expect(parsed.source_id).toBe("src-1");
    expect(parsed.source_record_id).toBe("rec-1");
  });

  describe("getFactsByScope", () => {
    beforeEach(() => {
      store.ingest(makeFact({ fact_id: "f1", provenance: { source_id: "scope-a", source_record_id: "rec-1" } }));
      store.ingest(makeFact({ fact_id: "f2", provenance: { source_id: "scope-a", source_record_id: "rec-2" } }));
      store.ingest(makeFact({ fact_id: "f3", provenance: { source_id: "scope-b", source_record_id: "rec-3" } }));
    });

    it("returns all facts for a scope", () => {
      const facts = store.getFactsByScope("scope-a");
      expect(facts).toHaveLength(2);
      expect(facts.map((f) => f.fact_id).sort()).toEqual(["f1", "f2"]);
    });

    it("filters by since timestamp", () => {
      // Set explicit created_at values via direct SQL for deterministic ordering
      store.db.prepare("update facts set created_at = ? where fact_id = ?").run("2024-01-01T00:00:00Z", "f1");
      store.db.prepare("update facts set created_at = ? where fact_id = ?").run("2024-06-01T00:00:00Z", "f2");

      const facts = store.getFactsByScope("scope-a", { since: "2024-03-01T00:00:00Z" });
      expect(facts).toHaveLength(1);
      expect(facts[0]!.fact_id).toBe("f2");
    });

    it("filters by specific fact IDs", () => {
      const facts = store.getFactsByScope("scope-a", { factIds: ["f1"] });
      expect(facts).toHaveLength(1);
      expect(facts[0]!.fact_id).toBe("f1");
    });

    it("respects limit", () => {
      const facts = store.getFactsByScope("scope-a", { limit: 1 });
      expect(facts).toHaveLength(1);
    });

    it("returns empty array when no facts match", () => {
      const facts = store.getFactsByScope("scope-c");
      expect(facts).toHaveLength(0);
    });

    it("filters by contextId (conversation_id)", () => {
      store.ingest(makeFact({
        fact_id: "f4",
        provenance: { source_id: "scope-a", source_record_id: "rec-4" },
        payload_json: JSON.stringify({ event: { conversation_id: "thread-1", subject: "A" } }),
      }));
      store.ingest(makeFact({
        fact_id: "f5",
        provenance: { source_id: "scope-a", source_record_id: "rec-5" },
        payload_json: JSON.stringify({ event: { conversation_id: "thread-2", subject: "B" } }),
      }));

      const facts = store.getFactsByScope("scope-a", { contextIds: ["thread-1"] });
      expect(facts).toHaveLength(1);
      expect(facts[0]!.fact_id).toBe("f4");
    });

    it("filters by contextId (thread_id fallback)", () => {
      store.ingest(makeFact({
        fact_id: "f6",
        provenance: { source_id: "scope-a", source_record_id: "rec-6" },
        payload_json: JSON.stringify({ event: { thread_id: "thread-3", subject: "C" } }),
      }));

      const facts = store.getFactsByScope("scope-a", { contextIds: ["thread-3"] });
      expect(facts).toHaveLength(1);
      expect(facts[0]!.fact_id).toBe("f6");
    });

    it("filters by contextId with other selectors combined", () => {
      store.ingest(makeFact({
        fact_id: "f7",
        provenance: { source_id: "scope-a", source_record_id: "rec-7" },
        payload_json: JSON.stringify({ event: { conversation_id: "thread-4", subject: "D" } }),
      }));
      store.ingest(makeFact({
        fact_id: "f8",
        provenance: { source_id: "scope-a", source_record_id: "rec-8" },
        payload_json: JSON.stringify({ event: { conversation_id: "thread-4", subject: "E" } }),
      }));

      const facts = store.getFactsByScope("scope-a", { contextIds: ["thread-4"], factIds: ["f7"] });
      expect(facts).toHaveLength(1);
      expect(facts[0]!.fact_id).toBe("f7");
    });

    it("applies limit after contextId filtering", () => {
      for (let i = 0; i < 5; i++) {
        store.ingest(makeFact({
          fact_id: `f-limit-${i}`,
          provenance: { source_id: "scope-a", source_record_id: `rec-limit-${i}` },
          payload_json: JSON.stringify({ event: { conversation_id: "thread-limit", subject: `Msg ${i}` } }),
        }));
      }

      const facts = store.getFactsByScope("scope-a", { contextIds: ["thread-limit"], limit: 2 });
      expect(facts).toHaveLength(2);
    });

    it("returns empty array when contextId matches no facts", () => {
      const facts = store.getFactsByScope("scope-a", { contextIds: ["nonexistent-thread"] });
      expect(facts).toHaveLength(0);
    });

    it("filters by until timestamp", () => {
      store.db.prepare("update facts set created_at = ? where fact_id = ?").run("2024-01-01T00:00:00Z", "f1");
      store.db.prepare("update facts set created_at = ? where fact_id = ?").run("2024-06-01T00:00:00Z", "f2");

      const facts = store.getFactsByScope("scope-a", { until: "2024-03-01T00:00:00Z" });
      expect(facts).toHaveLength(1);
      expect(facts[0]!.fact_id).toBe("f1");
    });

    it("supports offset for pagination", () => {
      store.db.prepare("update facts set created_at = ? where fact_id = ?").run("2024-01-01T00:00:00Z", "f1");
      store.db.prepare("update facts set created_at = ? where fact_id = ?").run("2024-02-01T00:00:00Z", "f2");

      const page1 = store.getFactsByScope("scope-a", { limit: 1, offset: 0 });
      expect(page1).toHaveLength(1);
      expect(page1[0]!.fact_id).toBe("f1");

      const page2 = store.getFactsByScope("scope-a", { limit: 1, offset: 1 });
      expect(page2).toHaveLength(1);
      expect(page2[0]!.fact_id).toBe("f2");
    });

    it("filters by multiple contextIds", () => {
      store.ingest(makeFact({
        fact_id: "f9",
        provenance: { source_id: "scope-a", source_record_id: "rec-9" },
        payload_json: JSON.stringify({ event: { conversation_id: "thread-a", subject: "A" } }),
      }));
      store.ingest(makeFact({
        fact_id: "f10",
        provenance: { source_id: "scope-a", source_record_id: "rec-10" },
        payload_json: JSON.stringify({ event: { conversation_id: "thread-b", subject: "B" } }),
      }));
      store.ingest(makeFact({
        fact_id: "f11",
        provenance: { source_id: "scope-a", source_record_id: "rec-11" },
        payload_json: JSON.stringify({ event: { conversation_id: "thread-c", subject: "C" } }),
      }));

      const facts = store.getFactsByScope("scope-a", { contextIds: ["thread-a", "thread-b"] });
      expect(facts).toHaveLength(2);
      expect(facts.map((f) => f.fact_id).sort()).toEqual(["f10", "f9"]);
    });

    it("throws on unsupported selector dimension 'status'", () => {
      expect(() => store.getFactsByScope("scope-a", { status: "opened" })).toThrow("status");
    });

    it("throws on unsupported selector dimension 'vertical'", () => {
      expect(() => store.getFactsByScope("scope-a", { vertical: "mail" })).toThrow("vertical");
    });

    it("throws on unsupported selector dimension 'workItemIds'", () => {
      expect(() => store.getFactsByScope("scope-a", { workItemIds: ["wi-1"] })).toThrow("workItemIds");
    });
  });
});
