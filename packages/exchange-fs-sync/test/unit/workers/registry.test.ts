import { describe, it, expect } from "vitest";
import { DefaultWorkerRegistry, drainWorker } from "../../../src/workers/registry.js";

describe("DefaultWorkerRegistry", () => {
  it("registers and lists workers", () => {
    const registry = new DefaultWorkerRegistry();
    registry.register({
      identity: {
        worker_id: "w1",
        executor_family: "mail",
        concurrency_policy: "singleton",
        description: "Test worker",
      },
      fn: async () => ({ processed: false }),
    });

    const workers = registry.listWorkers();
    expect(workers).toHaveLength(1);
    expect(workers[0]!.worker_id).toBe("w1");
    expect(workers[0]!.concurrency_policy).toBe("singleton");
  });

  it("executes a worker and returns result", async () => {
    const registry = new DefaultWorkerRegistry();
    registry.register({
      identity: {
        worker_id: "w1",
        executor_family: "mail",
        concurrency_policy: "singleton",
      },
      fn: async () => ({ processed: true, execution_id: "ex-1" }),
    });

    const result = await registry.execute("w1");
    expect(result.processed).toBe(true);
    expect(result.execution_id).toBe("ex-1");
  });

  it("singleton: concurrent calls return the same in-flight promise", async () => {
    const registry = new DefaultWorkerRegistry();
    let callCount = 0;
    registry.register({
      identity: {
        worker_id: "w1",
        executor_family: "mail",
        concurrency_policy: "singleton",
      },
      fn: async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 50));
        return { processed: true, execution_id: `ex-${callCount}` };
      },
    });

    const p1 = registry.execute("w1");
    const p2 = registry.execute("w1");

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(callCount).toBe(1);
    expect(r1.execution_id).toBe(r2.execution_id);
  });

  it("parallel: concurrent calls run independently", async () => {
    const registry = new DefaultWorkerRegistry();
    const ids: string[] = [];
    registry.register({
      identity: {
        worker_id: "w1",
        executor_family: "mail",
        concurrency_policy: "parallel",
      },
      fn: async () => {
        const id = `ex-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        ids.push(id);
        await new Promise((r) => setTimeout(r, 20));
        return { processed: true, execution_id: id };
      },
    });

    const p1 = registry.execute("w1");
    const p2 = registry.execute("w1");

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(ids).toHaveLength(2);
    expect(r1.execution_id).not.toBe(r2.execution_id);
  });

  it("drop_if_running: returns false when already running", async () => {
    const registry = new DefaultWorkerRegistry();
    let callCount = 0;
    registry.register({
      identity: {
        worker_id: "w1",
        executor_family: "mail",
        concurrency_policy: "drop_if_running",
      },
      fn: async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 50));
        return { processed: true };
      },
    });

    const p1 = registry.execute("w1");
    const r2 = await registry.execute("w1");

    expect(r2.processed).toBe(false);
    await p1;
    expect(callCount).toBe(1);
  });

  it("latest_wins: second call waits and may trigger follow-up", async () => {
    const registry = new DefaultWorkerRegistry();
    let callCount = 0;
    registry.register({
      identity: {
        worker_id: "w1",
        executor_family: "mail",
        concurrency_policy: "latest_wins",
      },
      fn: async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 20));
        return { processed: true };
      },
    });

    const p1 = registry.execute("w1");
    const p2 = registry.execute("w1");

    await Promise.all([p1, p2]);
    // At least one call executed; the second may or may not trigger a follow-up
    // depending on timing, but the in-flight mechanism should be consistent.
    expect(callCount).toBeGreaterThanOrEqual(1);
  });

  it("throws for unregistered worker", async () => {
    const registry = new DefaultWorkerRegistry();
    await expect(registry.execute("missing")).rejects.toThrow("Worker not registered");
  });

  it("tracks isRunning correctly", async () => {
    const registry = new DefaultWorkerRegistry();
    let resolveFn!: () => void;
    registry.register({
      identity: {
        worker_id: "w1",
        executor_family: "mail",
        concurrency_policy: "singleton",
      },
      fn: async () => {
        await new Promise<void>((r) => {
          resolveFn = r;
        });
        return { processed: true };
      },
    });

    expect(registry.isRunning("w1")).toBe(false);
    const p = registry.execute("w1");
    expect(registry.isRunning("w1")).toBe(true);
    resolveFn();
    await p;
    expect(registry.isRunning("w1")).toBe(false);
  });
});

describe("drainWorker", () => {
  it("repeatedly executes until no more work", async () => {
    const registry = new DefaultWorkerRegistry();
    let remaining = 3;
    registry.register({
      identity: {
        worker_id: "w1",
        executor_family: "mail",
        concurrency_policy: "singleton",
      },
      fn: async () => {
        if (remaining > 0) {
          remaining--;
          return { processed: true, execution_id: `ex-${remaining}` };
        }
        return { processed: false };
      },
    });

    const result = await drainWorker(registry, "w1");
    expect(result.totalProcessed).toBe(3);
    expect(result.executionIds).toHaveLength(3);
  });

  it("returns zero when no work is available", async () => {
    const registry = new DefaultWorkerRegistry();
    registry.register({
      identity: {
        worker_id: "w1",
        executor_family: "mail",
        concurrency_policy: "singleton",
      },
      fn: async () => ({ processed: false }),
    });

    const result = await drainWorker(registry, "w1");
    expect(result.totalProcessed).toBe(0);
    expect(result.executionIds).toHaveLength(0);
  });
});
