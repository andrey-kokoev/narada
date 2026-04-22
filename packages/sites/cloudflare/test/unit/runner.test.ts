import { describe, it, expect, vi } from "vitest";
import { runCycle, type CycleConfig } from "../../src/runner.js";
import { createMockCycleCoordinator } from "../fixtures/coordinator-fixture.js";
import { createMockEnvForRunner } from "../fixtures/env-fixture.js";
import type { NotificationEmitter, OperatorNotification } from "../../src/notification.js";

function createMockEmitter(): NotificationEmitter & { emitted: OperatorNotification[] } {
  const emitted: OperatorNotification[] = [];
  return {
    emitted,
    emit: vi.fn(async (n: OperatorNotification) => { emitted.push(n); }),
  };
}

describe("runCycle", () => {
  it("acquires lock and runs all 9 steps", async () => {
    const coordinator = createMockCycleCoordinator();
    const result = await runCycle("test-site", createMockEnvForRunner(coordinator));
    expect(result.status).toBe("complete");
    expect(result.steps_completed).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(coordinator.acquireLock).toHaveBeenCalledTimes(1);
    expect(coordinator.releaseLock).toHaveBeenCalledTimes(1);
  });

  it("fails fast when lock is held", async () => {
    const coordinator = createMockCycleCoordinator();
    coordinator.acquireLock("other-cycle", 35_000);
    const result = await runCycle("test-site", createMockEnvForRunner(coordinator));
    expect(result.status).toBe("failed");
    expect(result.steps_completed).toEqual([]);
    expect(result.error).toContain("other-cycle");
    expect(result.recovered_from_cycle_id).toBeUndefined();
  });

  it("recovers an expired stale lock and records recovery trace", async () => {
    const coordinator = createMockCycleCoordinator();
    // Acquire a lock that will immediately expire
    coordinator.acquireLock("stuck-cycle", 0);
    // Small delay so the lock is definitely expired
    await new Promise((r) => setTimeout(r, 10));

    const result = await runCycle("test-site", createMockEnvForRunner(coordinator));

    expect(result.status).toBe("complete");
    expect(result.steps_completed).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.recovered_from_cycle_id).toBe("stuck-cycle");
    expect(result.stuck_duration_ms).toBeGreaterThanOrEqual(5);

    expect(coordinator.recordRecoveryTrace).toHaveBeenCalledTimes(1);
    const recoveryCall = vi.mocked(coordinator.recordRecoveryTrace).mock.calls[0]![0];
    expect(recoveryCall.previousCycleId).toBe("stuck-cycle");
    expect(recoveryCall.lockTtlMs).toBe(35_000);
    expect(recoveryCall.stuckDurationMs).toBeGreaterThanOrEqual(5);

    // Health should have been set to critical during recovery, then healthy on completion
    expect(coordinator.setHealth).toHaveBeenCalledTimes(3);
    const criticalCall = vi.mocked(coordinator.setHealth).mock.calls.find(
      (call) => call[0].status === "critical"
    );
    expect(criticalCall).toBeDefined();
    expect(criticalCall![0].message).toContain("stuck-cycle");

    expect(coordinator.releaseLock).toHaveBeenCalledTimes(1);
  });

  it("gracefully aborts with tight ceiling", async () => {
    const coordinator = createMockCycleCoordinator();
    const result = await runCycle("test-site", createMockEnvForRunner(coordinator), { ceilingMs: 0, abortBufferMs: 0 });
    expect(result.status).toBe("partial");
    expect(result.steps_completed.length).toBeGreaterThanOrEqual(1);
    expect(result.steps_completed.length).toBeLessThan(9);
    expect(coordinator.releaseLock).toHaveBeenCalledTimes(1);
  });

  it("releases lock on error", async () => {
    const coordinator = createMockCycleCoordinator();
    coordinator.setHealth = vi.fn(() => { throw new Error("health fail"); });
    const result = await runCycle("test-site", createMockEnvForRunner(coordinator));
    expect(result.status).toBe("failed");
    expect(coordinator.releaseLock).toHaveBeenCalledTimes(1);
  });

  it("emits notification on stuck-cycle recovery", async () => {
    const coordinator = createMockCycleCoordinator();
    const emitter = createMockEmitter();
    coordinator.acquireLock("stuck-cycle", 0);
    await new Promise((r) => setTimeout(r, 10));

    const result = await runCycle("test-site", createMockEnvForRunner(coordinator), {}, emitter);

    expect(result.status).toBe("complete");
    expect(emitter.emitted.length).toBe(1);
    expect(emitter.emitted[0]!.summary).toContain("Stuck cycle recovered");
    expect(emitter.emitted[0]!.health_status).toBe("critical");
  });

  it("emits notification on critical transition after repeated failures", async () => {
    const coordinator = createMockCycleCoordinator();
    const emitter = createMockEmitter();

    // Force cycle failure by making releaseLock throw; use tight ceiling so
    // step-7 success health update is skipped and failures accumulate.
    coordinator.releaseLock = vi.fn(() => { throw new Error("step failed"); });

    // First failure: healthy → degraded (no notification)
    coordinator.setHealth({
      status: "healthy", lastCycleAt: null, lastCycleDurationMs: null,
      consecutiveFailures: 0, pendingWorkItems: 0, locked: false, lockedByCycleId: null,
      message: null, updatedAt: new Date(0).toISOString(),
    });
    await runCycle("test-site", createMockEnvForRunner(coordinator), { ceilingMs: 0, abortBufferMs: 0 }, emitter);
    expect(emitter.emitted.length).toBe(0);

    // Second failure: degraded → degraded (no notification)
    await runCycle("test-site", createMockEnvForRunner(coordinator), { ceilingMs: 0, abortBufferMs: 0 }, emitter);
    expect(emitter.emitted.length).toBe(0);

    // Third failure: degraded → critical (notification emitted)
    await runCycle("test-site", createMockEnvForRunner(coordinator), { ceilingMs: 0, abortBufferMs: 0 }, emitter);
    expect(emitter.emitted.length).toBe(1);
    expect(emitter.emitted[0]!.summary).toContain("critical");
    expect(emitter.emitted[0]!.health_status).toBe("critical");
  });

  it("emits notification on auth_failed transition", async () => {
    const coordinator = createMockCycleCoordinator();
    const emitter = createMockEmitter();

    coordinator.setHealth({
      status: "healthy", lastCycleAt: null, lastCycleDurationMs: null,
      consecutiveFailures: 0, pendingWorkItems: 0, locked: false, lockedByCycleId: null,
      message: null, updatedAt: new Date(0).toISOString(),
    });

    // Simulate an auth error by making releaseLock throw with an auth-like message
    coordinator.releaseLock = vi.fn(() => { throw new Error("Graph API returned 401 Unauthorized"); });

    const result = await runCycle("test-site", createMockEnvForRunner(coordinator), { ceilingMs: 0, abortBufferMs: 0 }, emitter);
    expect(result.status).toBe("failed");
    expect(emitter.emitted.length).toBe(1);
    expect(emitter.emitted[0]!.health_status).toBe("auth_failed");
    expect(emitter.emitted[0]!.summary).toContain("Authentication failed");
  });

  it("suppresses repeated notifications during cooldown", async () => {
    const coordinator = createMockCycleCoordinator();
    const emitter = createMockEmitter();

    coordinator.releaseLock = vi.fn(() => { throw new Error("step failed"); });

    // Pre-warm health to degraded with 2 consecutive failures so next failure → critical
    coordinator.setHealth({
      status: "degraded", lastCycleAt: null, lastCycleDurationMs: null,
      consecutiveFailures: 2, pendingWorkItems: 0, locked: false, lockedByCycleId: null,
      message: null, updatedAt: new Date(0).toISOString(),
    });

    // First critical failure should emit
    await runCycle("test-site", createMockEnvForRunner(coordinator), { ceilingMs: 0, abortBufferMs: 0 }, emitter);
    expect(emitter.emitted.length).toBe(1);

    // Immediate second critical failure should be suppressed (transition check + cooldown)
    await runCycle("test-site", createMockEnvForRunner(coordinator), { ceilingMs: 0, abortBufferMs: 0 }, emitter);
    expect(emitter.emitted.length).toBe(1); // still 1
  });

  it("adapter failure does not fail the cycle", async () => {
    const coordinator = createMockCycleCoordinator();
    const failingEmitter: NotificationEmitter = {
      emit: vi.fn(async () => { throw new Error("adapter down"); }),
    };

    coordinator.acquireLock("stuck-cycle", 0);
    await new Promise((r) => setTimeout(r, 10));

    const result = await runCycle("test-site", createMockEnvForRunner(coordinator), {}, failingEmitter);
    expect(result.status).toBe("complete");
  });
});
