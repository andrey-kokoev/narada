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
});
