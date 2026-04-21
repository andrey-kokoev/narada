import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { NaradaSiteCoordinator } from "../../src/coordinator.js";
import { createMockState } from "../fixtures/mock-sqlite.js";
import { createLiveSyncStepHandler } from "../../src/cycle-step.js";
import { HttpSourceAdapter, SourceAdapterError } from "../../src/source-adapter.js";

function createCoordinator() {
  const db = new Database(":memory:");
  return { db, coordinator: new NaradaSiteCoordinator(createMockState(db)) };
}

function createEnv(coordinator: ReturnType<typeof createCoordinator>["coordinator"]) {
  return { cycleId: "c-1", siteId: "test", scopeId: "test", coordinator, env: {} as any };
}

describe("Live Source Adapter (Task 352)", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("admits live adapter output as durable facts", async () => {
    const { coordinator } = createCoordinator();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          { id: "evt-live-001", type: "mail.message_created", createdAt: "2024-01-01T00:00:00Z", subject: "Hello" },
          { id: "evt-live-002", type: "mail.message_created", createdAt: "2024-01-01T00:01:00Z", subject: "World" },
        ],
      }),
    } as Response);

    const adapter = new HttpSourceAdapter({
      endpoint: "https://example.com/api/deltas",
      sourceId: "graph-mail",
    });

    const handler = createLiveSyncStepHandler(adapter, { limit: 10 });
    const result = await handler(createEnv(coordinator), () => true);

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(2);
    expect(result.residuals).toContain("admitted_2_facts");
    expect(coordinator.getFactCount()).toBe(2);
    expect(coordinator.getCursor("graph-mail")).toBe("evt-live-002");
  });

  it("is idempotent for duplicate live observations", async () => {
    const { coordinator } = createCoordinator();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          { id: "evt-live-001", type: "mail.message_created", createdAt: "2024-01-01T00:00:00Z" },
        ],
      }),
    } as Response);

    const adapter = new HttpSourceAdapter({
      endpoint: "https://example.com/api/deltas",
      sourceId: "graph-mail",
    });

    const handler = createLiveSyncStepHandler(adapter, { limit: 10 });

    // First admission
    await handler(createEnv(coordinator), () => true);
    expect(coordinator.getFactCount()).toBe(1);

    // Second admission with same live data
    const result2 = await handler(createEnv(coordinator), () => true);
    expect(result2.status).toBe("completed");
    expect(result2.recordsWritten).toBe(0);
    expect(result2.residuals).toContain("skipped_1_duplicate_events");
    expect(coordinator.getFactCount()).toBe(1);
    expect(coordinator.getAppliedEventCount()).toBe(1);
  });

  it("adapter network failure does not corrupt cursor, apply-log, or fact state", async () => {
    const { coordinator } = createCoordinator();

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network timeout"));

    const adapter = new HttpSourceAdapter({
      endpoint: "https://example.com/api/deltas",
      sourceId: "graph-mail",
    });

    const handler = createLiveSyncStepHandler(adapter, { limit: 10 });
    const result = await handler(createEnv(coordinator), () => true);

    expect(result.status).toBe("failed");
    expect(result.recordsWritten).toBe(0);
    expect(result.residuals[0]).toMatch(/adapter_error/);

    // No state corruption
    expect(coordinator.getFactCount()).toBe(0);
    expect(coordinator.getAppliedEventCount()).toBe(0);
    expect(coordinator.getCursor("graph-mail")).toBeNull();
  });

  it("HTTP error status returns failed step without state mutation", async () => {
    const { coordinator } = createCoordinator();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    const adapter = new HttpSourceAdapter({
      endpoint: "https://example.com/api/deltas",
      sourceId: "graph-mail",
    });

    const handler = createLiveSyncStepHandler(adapter, { limit: 10 });
    const result = await handler(createEnv(coordinator), () => true);

    expect(result.status).toBe("failed");
    expect(coordinator.getFactCount()).toBe(0);
    expect(coordinator.getCursor("graph-mail")).toBeNull();
  });

  it("uses custom transform when provided", async () => {
    const { coordinator } = createCoordinator();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [{ customId: "c-1", customType: "test.event", ts: "2024-01-01T00:00:00Z" }],
      }),
    } as Response);

    const adapter = new HttpSourceAdapter({
      endpoint: "https://example.com/api/deltas",
      sourceId: "custom-src",
      transform: (item) => {
        const i = item as Record<string, unknown>;
        return {
          sourceId: "custom-src",
          eventId: String(i.customId),
          factType: String(i.customType),
          payloadJson: JSON.stringify(item),
          observedAt: String(i.ts),
        };
      },
    });

    const handler = createLiveSyncStepHandler(adapter, { limit: 10 });
    const result = await handler(createEnv(coordinator), () => true);

    expect(result.status).toBe("completed");
    expect(coordinator.getFactById("c-1")).not.toBeNull();
    expect(coordinator.getFactById("c-1")!.factType).toBe("test.event");
  });

  it("returns skipped when deadline is exceeded before start", async () => {
    const { coordinator } = createCoordinator();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    } as Response);

    const adapter = new HttpSourceAdapter({
      endpoint: "https://example.com/api/deltas",
      sourceId: "graph-mail",
    });

    const handler = createLiveSyncStepHandler(adapter, { limit: 10 });
    const result = await handler(createEnv(coordinator), () => false);

    expect(result.status).toBe("skipped");
    expect(result.recordsWritten).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns failed when adapter item lacks required identity field", async () => {
    const { coordinator } = createCoordinator();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [{ type: "mail.message_created" }], // missing id
      }),
    } as Response);

    const adapter = new HttpSourceAdapter({
      endpoint: "https://example.com/api/deltas",
      sourceId: "graph-mail",
    });

    const handler = createLiveSyncStepHandler(adapter, { limit: 10 });
    const result = await handler(createEnv(coordinator), () => true);

    expect(result.status).toBe("failed");
    expect(result.residuals[0]).toMatch(/adapter_error/);
    expect(coordinator.getFactCount()).toBe(0);
  });

  it("does not advance cursor past unprocessed deltas when deadline exceeded mid-sync", async () => {
    const { coordinator } = createCoordinator();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          { id: "evt-live-001", type: "mail.message_created", createdAt: "2024-01-01T00:00:00Z" },
          { id: "evt-live-002", type: "mail.message_created", createdAt: "2024-01-01T00:01:00Z" },
        ],
      }),
    } as Response);

    const adapter = new HttpSourceAdapter({
      endpoint: "https://example.com/api/deltas",
      sourceId: "graph-mail",
    });

    const handler = createLiveSyncStepHandler(adapter, { limit: 10 });

    let callCount = 0;
    const result = await handler(
      { cycleId: "c-1", siteId: "test", scopeId: "test", coordinator, env: {} as any },
      () => {
        callCount++;
        return callCount <= 2; // allow start + first delta, block second
      },
    );

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(1);
    expect(result.residuals).toContain("deadline_exceeded_mid_sync");
    expect(coordinator.getFactCount()).toBe(1);
    // Cursor must stay at the last processed delta, not the last in the batch
    expect(coordinator.getCursor("graph-mail")).toBe("evt-live-001");
  });
});
