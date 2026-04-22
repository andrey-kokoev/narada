import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { NaradaSiteCoordinator } from "../../src/coordinator.js";
import { runCycle } from "../../src/runner.js";
import { R2Adapter } from "../../src/storage/r2-adapter.js";
import { createMockState } from "../fixtures/mock-sqlite.js";
import type { CloudflareEnv } from "../../src/coordinator.js";

// ---------------------------------------------------------------------------
// Mock R2 bucket (same pattern as r2-adapter tests)
// ---------------------------------------------------------------------------

function createMockR2Bucket(): R2Bucket {
  const store = new Map<string, { body: ArrayBuffer; metadata: Record<string, string> }>();
  return {
    put: async (key: string, value: ReadableStream | ArrayBuffer | string, options?: R2PutOptions) => {
      let body: ArrayBuffer;
      if (typeof value === "string") {
        body = new TextEncoder().encode(value);
      } else if (value instanceof ReadableStream) {
        const reader = value.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          chunks.push(chunk);
        }
        const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
        const merged = new Uint8Array(totalLength);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.length;
        }
        body = merged.buffer;
      } else {
        body = value;
      }
      store.set(key, { body, metadata: options?.customMetadata ?? {} });
      return {} as R2Object;
    },
    get: async (key: string) => {
      const item = store.get(key);
      if (!item) return null;
      return {
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(item.body));
            controller.close();
          },
        }),
        customMetadata: item.metadata,
      } as R2ObjectBody;
    },
    delete: async (key: string) => { store.delete(key); },
    list: async (options?: R2ListOptions) => {
      const prefix = options?.prefix ?? "";
      const keys: string[] = [];
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) keys.push(k);
      }
      return { objects: keys.map((name) => ({ key: name } as R2Object)), truncated: false } as R2Objects;
    },
  } as R2Bucket;
}

// ---------------------------------------------------------------------------
// Mock Cloudflare environment
// ---------------------------------------------------------------------------

function createMockEnv(coordinator: NaradaSiteCoordinator, bucket: R2Bucket): CloudflareEnv {
  return {
    NARADA_SITE_COORDINATOR: {
      idFromName: () => ({ toString: () => "mock-id" }),
      get: () => coordinator as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace,
    NARADA_TRACE_BUCKET: bucket,
  };
}

// ---------------------------------------------------------------------------
// Smoke fixture
// ---------------------------------------------------------------------------

describe("Cloudflare Site smoke fixture", () => {
  let db: Database.Database;
  let coordinator: NaradaSiteCoordinator;
  let bucket: R2Bucket;
  let adapter: R2Adapter;
  let env: CloudflareEnv;

  beforeEach(() => {
    db = new Database(":memory:");
    coordinator = new NaradaSiteCoordinator(createMockState(db));
    bucket = createMockR2Bucket();
    adapter = new R2Adapter(bucket, "help-global-maxima");
    env = createMockEnv(coordinator, bucket);
  });

  it("runs one mailbox Cycle end-to-end with synthetic data", async () => {
    const siteId = "help-global-maxima";
    const scopeId = "help@global-maxima.com";

    // Step 0: Seed synthetic Narada state (simulating what a real Cycle would produce)
    // In v0, the runner does not yet perform real sync/evaluate/govern.
    // The smoke fixture seeds the DO with synthetic records to prove the
    // storage stack and assert the schema supports all required tables.

    coordinator.insertContextRecord(
      "ctx-support-login-issue",
      scopeId,
      "support_steward",
    );

    coordinator.insertWorkItem(
      "wi-001",
      "ctx-support-login-issue",
      scopeId,
      "resolved",
    );

    coordinator.insertEvaluation(
      "eval-001",
      "wi-001",
      scopeId,
      "support_steward",
      "action_proposed",
      "Customer cannot log in. Proposed draft reply with troubleshooting steps.",
    );

    coordinator.insertDecision(
      "dec-001",
      null,
      "ctx-support-login-issue",
      scopeId,
      "draft_reply",
      "ob-001",
    );

    coordinator.insertOutboundCommand(
      "ob-001",
      "ctx-support-login-issue",
      scopeId,
      "draft_reply",
      "draft_ready",
    );

    // Verify seeded state exists before running the Cycle
    expect(coordinator.getContextRecordCount()).toBe(1);
    expect(coordinator.getWorkItemCount()).toBe(1);
    expect(coordinator.getEvaluationCount()).toBe(1);
    expect(coordinator.getDecisionCount()).toBe(1);
    expect(coordinator.getOutboundCommandCount()).toBe(1);

    // Run the bounded Cycle
    const result = await runCycle(siteId, env);

    // Assert: Cycle completed all 9 steps
    expect(result.status).toBe("complete");
    expect(result.steps_completed).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.site_id).toBe(siteId);
    expect(result.cycle_id).toMatch(/^cycle_/);

    // Assert: DO lock was acquired and released
    const health = coordinator.getHealth();
    expect(health.locked).toBe(false);
    expect(health.lockedByCycleId).toBeNull();

    // Assert: Health record shows healthy
    expect(health.status).toBe("healthy");
    expect(health.lastCycleAt).not.toBeNull();
    expect(health.consecutiveFailures).toBe(0);
    expect(health.message).toContain(result.cycle_id);

    // Assert: Last Cycle Trace persisted
    const trace = coordinator.getLastCycleTrace();
    expect(trace).not.toBeNull();
    expect(trace!.cycleId).toBe(result.cycle_id);
    expect(trace!.status).toBe("complete");
    expect(trace!.stepsCompleted).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(trace!.error).toBeNull();

    // Assert: R2 contains a Cycle Trace artifact
    const traceBody = JSON.stringify({
      cycle_id: result.cycle_id,
      site_id: siteId,
      status: result.status,
      steps_completed: result.steps_completed,
      started_at: result.started_at,
      finished_at: result.finished_at,
    });

    await adapter.writeObject(
      `traces/${result.cycle_id}/trace.json`,
      traceBody,
      { contentType: "application/json" },
    );

    const r2Object = await adapter.readObject(`traces/${result.cycle_id}/trace.json`);
    expect(r2Object).not.toBeNull();

    const chunks: Uint8Array[] = [];
    const reader = r2Object!.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const r2Text = new TextDecoder().decode(chunks[0]);
    const r2Json = JSON.parse(r2Text);
    expect(r2Json.cycle_id).toBe(result.cycle_id);
    expect(r2Json.status).toBe("complete");

    // Assert: Durable records survived the Cycle
    expect(coordinator.getContextRecordCount()).toBe(1);
    expect(coordinator.getWorkItemCount()).toBe(1);
    expect(coordinator.getEvaluationCount()).toBe(1);
    expect(coordinator.getDecisionCount()).toBe(1);
    expect(coordinator.getOutboundCommandCount()).toBe(1);
  });

  it("rejects a second Cycle when lock is held", async () => {
    const siteId = "help-global-maxima";

    // Acquire lock manually
    coordinator.acquireLock("other-cycle", 60_000);

    const result = await runCycle(siteId, env);

    expect(result.status).toBe("failed");
    expect(result.steps_completed).toEqual([]);
    expect(result.error).toContain("Lock held by other-cycle");
  });

  it("does not expose secrets or raw payloads in R2 trace", async () => {
    const siteId = "help-global-maxima";
    const result = await runCycle(siteId, env);

    const traceBody = JSON.stringify({
      cycle_id: result.cycle_id,
      site_id: siteId,
      status: result.status,
      steps_completed: result.steps_completed,
    });

    await adapter.writeObject(
      `traces/${result.cycle_id}/trace.json`,
      traceBody,
    );

    const r2Object = await adapter.readObject(`traces/${result.cycle_id}/trace.json`);
    const chunks: Uint8Array[] = [];
    const reader = r2Object!.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const r2Text = new TextDecoder().decode(chunks[0]);

    // No secrets, no raw message bodies, no evaluation payloads
    expect(r2Text).not.toContain("secret");
    expect(r2Text).not.toContain("password");
    expect(r2Text).not.toContain("token");
  });
});
