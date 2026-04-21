/**
 * Unattended Recovery Fixture
 *
 * Proves the full unattended operation loop across Tasks 340–342:
 *
 *   cycle failure / stuck lock
 *   → health decay or stuck recovery
 *   → trace / evidence
 *   → operator notification
 *   → later successful cycle returns to healthy
 *
 * Authority boundary notes:
 * - This fixture exercises the Cloudflare Site bounded cycle runner.
 * - The Cloudflare runner does not interact with Foreman, Scheduler, or outbound
 *   command stores. Work opening, lease management, and outbound mutation remain
 *   the exclusive authority of the local daemon control plane.
 * - Notifications are advisory side effects; their failure or absence does not
 *   influence cycle success.
 */

import { describe, it, expect, vi } from "vitest";
import { runCycle } from "../../src/runner.js";
import { createMockCycleCoordinator } from "../fixtures/coordinator-fixture.js";
import { createMockEnvForRunner } from "../fixtures/env-fixture.js";
import type { NotificationEmitter, OperatorNotification } from "../../src/notification.js";

function createCapturingEmitter(): NotificationEmitter & { emitted: OperatorNotification[] } {
  const emitted: OperatorNotification[] = [];
  return {
    emitted,
    emit: vi.fn(async (n: OperatorNotification) => { emitted.push(n); }),
  };
}

describe("Unattended Recovery Fixture", () => {
  it("failure decay → critical notification → success resets health", async () => {
    const coordinator = createMockCycleCoordinator();
    const emitter = createCapturingEmitter();

    // Seed healthy baseline
    coordinator.setHealth({
      status: "healthy",
      lastCycleAt: null,
      lastCycleDurationMs: null,
      consecutiveFailures: 0,
      pendingWorkItems: 0,
      locked: false,
      lockedByCycleId: null,
      message: null,
      updatedAt: new Date(0).toISOString(),
    });

    // Make releaseLock throw on step-8 so the cycle fails, but preserve the
    // original implementation so we can manually clear the lock between cycles.
    const originalReleaseLock = coordinator.releaseLock;
    coordinator.releaseLock = vi.fn(() => {
      throw new Error("persistent failure");
    });

    // Act 1 — first failure: healthy → degraded (no notification)
    const r1 = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      { ceilingMs: 0, abortBufferMs: 0 },
      emitter,
    );
    expect(r1.status).toBe("failed");
    expect(emitter.emitted.length).toBe(0);
    originalReleaseLock(r1.cycle_id);

    // Act 2 — second failure: degraded → degraded (no notification)
    const r2 = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      { ceilingMs: 0, abortBufferMs: 0 },
      emitter,
    );
    expect(r2.status).toBe("failed");
    expect(emitter.emitted.length).toBe(0);
    originalReleaseLock(r2.cycle_id);

    // Act 3 — third failure: degraded → critical (notification emitted)
    const r3 = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      { ceilingMs: 0, abortBufferMs: 0 },
      emitter,
    );
    expect(r3.status).toBe("failed");
    expect(emitter.emitted.length).toBe(1);
    expect(emitter.emitted[0]!.health_status).toBe("critical");
    expect(emitter.emitted[0]!.summary).toContain("critical");
    originalReleaseLock(r3.cycle_id);

    // Act 4 — successful cycle resets health to healthy
    coordinator.releaseLock = originalReleaseLock;
    const r4 = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      emitter,
    );
    expect(r4.status).toBe("complete");

    // No additional notification on success
    expect(emitter.emitted.length).toBe(1);

    // Final health is healthy with zero consecutive failures
    const finalHealthCall = vi.mocked(coordinator.setHealth).mock.calls.at(-1)![0];
    expect(finalHealthCall.status).toBe("healthy");
    expect(finalHealthCall.consecutiveFailures).toBe(0);
  });

  it("stuck lock recovery → notification + trace → success", async () => {
    const coordinator = createMockCycleCoordinator();
    const emitter = createCapturingEmitter();

    // Leave a stale lock behind
    coordinator.acquireLock("stuck-cycle", 0);
    await new Promise((r) => setTimeout(r, 10));

    const result = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      emitter,
    );

    expect(result.status).toBe("complete");
    expect(result.recovered_from_cycle_id).toBe("stuck-cycle");
    expect(result.stuck_duration_ms).toBeGreaterThanOrEqual(5);

    // Recovery trace recorded
    expect(coordinator.recordRecoveryTrace).toHaveBeenCalledTimes(1);
    const trace = vi.mocked(coordinator.recordRecoveryTrace).mock.calls[0]![0];
    expect(trace.previousCycleId).toBe("stuck-cycle");
    expect(trace.stuckDurationMs).toBeGreaterThanOrEqual(5);

    // Notification emitted for stuck-cycle recovery
    expect(emitter.emitted.length).toBe(1);
    expect(emitter.emitted[0]!.health_status).toBe("critical");
    expect(emitter.emitted[0]!.summary).toContain("Stuck cycle recovered");

    // Final health is healthy after successful cycle completion
    const finalHealthCall = vi.mocked(coordinator.setHealth).mock.calls.at(-1)![0];
    expect(finalHealthCall.status).toBe("healthy");
  });
});
