/**
 * Live Sync Step Handler Tests (Task 419)
 *
 * Proves the live sync step handler with mocked Source and real SQLite stores.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { Source, SourceBatch, SourceRecord } from "@narada2/control-plane";
import { WindowsCycleCoordinator } from "../../src/cycle-coordinator.js";
import { createLiveSyncStepHandler } from "../../src/cycle-step.js";
import { createGraphSource } from "../../src/graph-source.js";

describe("createLiveSyncStepHandler", () => {
  let db: Database.Database;
  let coordinator: WindowsCycleCoordinator;

  beforeEach(() => {
    db = new Database(":memory:");
    coordinator = new WindowsCycleCoordinator(db);
  });

  afterEach(() => {
    coordinator.close();
  });

  function makeMockSource(records: SourceRecord[], nextCheckpoint?: string): Source {
    return {
      sourceId: "test-graph-source",
      async pull(): Promise<SourceBatch> {
        return {
          records,
          priorCheckpoint: null,
          nextCheckpoint: nextCheckpoint ?? "cursor-page-2",
          hasMore: false,
          fetchedAt: new Date().toISOString(),
        };
      },
    };
  }

  function makeMailRecord(overrides?: Partial<SourceRecord>): SourceRecord {
    return {
      recordId: overrides?.recordId ?? `evt_${Math.random().toString(36).slice(2)}`,
      ordinal: new Date().toISOString(),
      payload: overrides?.payload ?? {
        event_id: `evt_${Math.random().toString(36).slice(2)}`,
        event_kind: "upsert",
        conversation_id: "conv-1",
        message_id: `msg_${Math.random().toString(36).slice(2)}`,
        subject: "Test campaign request",
        body_preview: "Need a campaign for product launch",
        from: { emailAddress: { address: "marketing@example.com", name: "Marketing" } },
      },
      provenance: overrides?.provenance ?? {
        sourceId: "test-graph-source",
        observedAt: new Date().toISOString(),
      },
    };
  }

  it("admits new records as facts and updates cursor", async () => {
    const records = [
      makeMailRecord({ recordId: "evt_001" }),
      makeMailRecord({ recordId: "evt_002" }),
    ];
    const source = makeMockSource(records, "cursor-after-002");
    const handler = createLiveSyncStepHandler(source, { limit: 50 });

    const result = await handler(
      {
        cycleId: "cycle_test",
        siteId: "test-site",
        scopeId: "test-site",
        coordinator,
      },
      () => true,
    );

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(2);
    expect(result.residuals).toContain("admitted_2_facts");

    // Cursor updated
    const cursor = coordinator.getCursor(source.sourceId);
    expect(cursor).toBe("cursor-after-002");

    // Facts exist in store
    const facts = coordinator.getUnadmittedFacts();
    expect(facts.length).toBe(2);
  });

  it("skips duplicate records via apply-log", async () => {
    const record = makeMailRecord({ recordId: "evt_001" });
    const source = makeMockSource([record], "cursor-after-001");

    // First sync
    const handler1 = createLiveSyncStepHandler(source, { limit: 50 });
    const result1 = await handler1(
      { cycleId: "cycle_1", siteId: "test-site", scopeId: "test-site", coordinator },
      () => true,
    );
    expect(result1.recordsWritten).toBe(1);

    // Second sync with same record
    const handler2 = createLiveSyncStepHandler(source, { limit: 50 });
    const result2 = await handler2(
      { cycleId: "cycle_2", siteId: "test-site", scopeId: "test-site", coordinator },
      () => true,
    );

    expect(result2.status).toBe("completed");
    expect(result2.recordsWritten).toBe(0);
    expect(result2.residuals).toContain("skipped_1_duplicate_events");

    // Total facts still 1
    const facts = coordinator.getUnadmittedFacts();
    expect(facts.length).toBe(1);
  });

  it("returns failed with auth residual on auth error", async () => {
    const source: Source = {
      sourceId: "test-graph-source",
      async pull(): Promise<SourceBatch> {
        throw new Error("401 Unauthorized: token expired");
      },
    };

    const handler = createLiveSyncStepHandler(source);
    const result = await handler(
      { cycleId: "cycle_test", siteId: "test-site", scopeId: "test-site", coordinator },
      () => true,
    );

    expect(result.status).toBe("failed");
    expect(result.recordsWritten).toBe(0);
    expect(result.residuals.some((r) => r.startsWith("auth_failed:"))).toBe(true);
  });

  it("returns failed with connectivity residual on network error", async () => {
    const source: Source = {
      sourceId: "test-graph-source",
      async pull(): Promise<SourceBatch> {
        throw new Error("Network timeout connecting to graph.microsoft.com");
      },
    };

    const handler = createLiveSyncStepHandler(source);
    const result = await handler(
      { cycleId: "cycle_test", siteId: "test-site", scopeId: "test-site", coordinator },
      () => true,
    );

    expect(result.status).toBe("failed");
    expect(result.recordsWritten).toBe(0);
    expect(result.residuals.some((r) => r.startsWith("connectivity_error:"))).toBe(true);
  });

  it("respects the limit option", async () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeMailRecord({ recordId: `evt_${String(i).padStart(3, "0")}` }),
    );
    const source = makeMockSource(records, "cursor-after-batch");
    const handler = createLiveSyncStepHandler(source, { limit: 3 });

    const result = await handler(
      { cycleId: "cycle_test", siteId: "test-site", scopeId: "test-site", coordinator },
      () => true,
    );

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(3);
  });

  it("filters by conversation_id when specified", async () => {
    const records = [
      makeMailRecord({ recordId: "evt_001", payload: { conversation_id: "conv-target" } }),
      makeMailRecord({ recordId: "evt_002", payload: { conversation_id: "conv-other" } }),
      makeMailRecord({ recordId: "evt_003", payload: { conversation_id: "conv-target" } }),
    ];
    const source = makeMockSource(records, "cursor-after-batch");
    const handler = createLiveSyncStepHandler(source, {
      limit: 50,
      conversationId: "conv-target",
    });

    const result = await handler(
      { cycleId: "cycle_test", siteId: "test-site", scopeId: "test-site", coordinator },
      () => true,
    );

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(2);
    expect(result.residuals).toContain("admitted_2_facts");
    expect(result.residuals).toContain("filtered_1_by_conversation");

    const facts = coordinator.getUnadmittedFacts();
    expect(facts.length).toBe(2);
  });

  it("returns no_new_records when batch is empty", async () => {
    const source = makeMockSource([], "cursor-empty");
    const handler = createLiveSyncStepHandler(source);

    const result = await handler(
      { cycleId: "cycle_test", siteId: "test-site", scopeId: "test-site", coordinator },
      () => true,
    );

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(0);
    expect(result.residuals).toContain("no_new_records");
  });
});

describe("createGraphSource validation", () => {
  it("throws when user_id is missing", () => {
    expect(() =>
      createGraphSource(
        {
          type: "graph",
          user_id: "",
          folder_id: "inbox",
          tenant_id: "t",
          client_id: "c",
          client_secret: "s",
        },
        "site-1",
      ),
    ).toThrow("live_source.user_id is required");
  });

  it("throws when folder_id is missing", () => {
    expect(() =>
      createGraphSource(
        {
          type: "graph",
          user_id: "u",
          folder_id: "",
          tenant_id: "t",
          client_id: "c",
          client_secret: "s",
        },
        "site-1",
      ),
    ).toThrow("live_source.folder_id is required");
  });

  it("throws when tenant_id is missing", () => {
    expect(() =>
      createGraphSource(
        {
          type: "graph",
          user_id: "u",
          folder_id: "inbox",
          tenant_id: "",
          client_id: "c",
          client_secret: "s",
        },
        "site-1",
      ),
    ).toThrow("live_source.tenant_id is required");
  });

  it("throws when client_id is missing", () => {
    expect(() =>
      createGraphSource(
        {
          type: "graph",
          user_id: "u",
          folder_id: "inbox",
          tenant_id: "t",
          client_id: "",
          client_secret: "s",
        },
        "site-1",
      ),
    ).toThrow("live_source.client_id is required");
  });

  it("throws when client_secret is missing", () => {
    expect(() =>
      createGraphSource(
        {
          type: "graph",
          user_id: "u",
          folder_id: "inbox",
          tenant_id: "t",
          client_id: "c",
          client_secret: "",
        },
        "site-1",
      ),
    ).toThrow("live_source.client_secret is required");
  });
});
