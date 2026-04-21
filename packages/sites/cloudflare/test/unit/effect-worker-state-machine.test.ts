import { describe, it, expect, vi } from "vitest";
import Database from "better-sqlite3";
import { NaradaSiteCoordinator } from "../../src/coordinator.js";
import { createMockState } from "../fixtures/mock-sqlite.js";
import {
  executeApprovedCommands,
  type EffectExecutionAdapter,
} from "../../src/effect-worker.js";

function createCoordinator() {
  const db = new Database(":memory:");
  return { db, coordinator: new NaradaSiteCoordinator(createMockState(db)) };
}

function createMockAdapter(
  overrides?: Partial<EffectExecutionAdapter>,
): EffectExecutionAdapter {
  return {
    attemptEffect: vi.fn(async () => ({ status: "submitted" as const })),
    ...overrides,
  };
}

describe("Effect Worker State Machine (Task 359)", () => {
  describe("eligible commands", () => {
    it("considers only approved_for_send commands", () => {
      const { coordinator } = createCoordinator();

      // Insert commands in various states
      coordinator.insertOutboundCommand("ob-pending", "ctx-1", "scope-1", "send_reply", "pending");
      coordinator.insertOutboundCommand("ob-draft", "ctx-1", "scope-1", "send_reply", "draft_ready");
      coordinator.insertOutboundCommand("ob-approved", "ctx-1", "scope-1", "send_reply", "approved_for_send");
      coordinator.insertOutboundCommand("ob-confirmed", "ctx-1", "scope-1", "send_reply", "confirmed");
      coordinator.insertOutboundCommand("ob-terminal", "ctx-1", "scope-1", "send_reply", "failed_terminal");
      coordinator.insertOutboundCommand("ob-cancelled", "ctx-1", "scope-1", "send_reply", "cancelled");

      const approved = coordinator.getApprovedOutboundCommands();
      expect(approved.length).toBe(1);
      expect(approved[0]!.outboundId).toBe("ob-approved");
    });

    it("executes approved send_reply commands through the adapter", async () => {
      const { coordinator } = createCoordinator();
      coordinator.insertOutboundCommand("ob-001", "ctx-1", "scope-1", "send_reply", "approved_for_send", JSON.stringify({ body: "Hello" }), "imid-1");

      const adapter = createMockAdapter();
      const result = await executeApprovedCommands(coordinator, adapter, { workerId: "test-worker", now: "2026-01-01T00:00:00Z" });

      expect(result.attempted).toBe(1);
      expect(result.submitted).toBe(1);
      expect(result.skipped).toBe(0);
      expect(vi.mocked(adapter.attemptEffect)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(adapter.attemptEffect)).toHaveBeenCalledWith(expect.objectContaining({
        outboundId: "ob-001",
        scopeId: "scope-1",
        actionType: "send_reply",
        payloadJson: JSON.stringify({ body: "Hello" }),
        internetMessageId: "imid-1",
      }));
    });

    it("skips commands with unallowed action types", async () => {
      const { coordinator } = createCoordinator();
      coordinator.insertOutboundCommand("ob-move", "ctx-1", "scope-1", "move_message", "approved_for_send");
      coordinator.insertOutboundCommand("ob-send", "ctx-1", "scope-1", "send_reply", "approved_for_send");

      const adapter = createMockAdapter();
      const result = await executeApprovedCommands(coordinator, adapter);

      expect(result.attempted).toBe(1);
      expect(result.submitted).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.residuals).toContain("skipped_unallowed_action_type_ob-move");
      expect(vi.mocked(adapter.attemptEffect)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(adapter.attemptEffect)).toHaveBeenCalledWith(expect.objectContaining({ actionType: "send_reply" }));
    });

    it("skips commands with an active attempting lease", async () => {
      const { coordinator } = createCoordinator();
      coordinator.insertOutboundCommand("ob-001", "ctx-1", "scope-1", "send_reply", "approved_for_send");

      // Pre-seed an active execution attempt
      coordinator.insertExecutionAttempt({
        executionAttemptId: "attempt-1",
        outboundId: "ob-001",
        actionType: "send_reply",
        attemptedAt: "2026-01-01T00:00:00Z",
        status: "attempting",
        errorCode: null,
        errorMessage: null,
        responseJson: null,
        externalRef: null,
        workerId: "other-worker",
        leaseExpiresAt: "2099-01-01T00:00:00Z",
      });

      const adapter = createMockAdapter();
      const result = await executeApprovedCommands(coordinator, adapter);

      expect(result.attempted).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.residuals).toContain("skipped_active_lease_ob-001");
      expect(vi.mocked(adapter.attemptEffect)).not.toHaveBeenCalled();
    });

    it("attempts a command when its lease has expired", async () => {
      const { coordinator } = createCoordinator();
      coordinator.insertOutboundCommand("ob-001", "ctx-1", "scope-1", "send_reply", "approved_for_send");

      // Pre-seed an expired execution attempt
      coordinator.insertExecutionAttempt({
        executionAttemptId: "attempt-1",
        outboundId: "ob-001",
        actionType: "send_reply",
        attemptedAt: "2026-01-01T00:00:00Z",
        status: "attempting",
        errorCode: null,
        errorMessage: null,
        responseJson: null,
        externalRef: null,
        workerId: "other-worker",
        leaseExpiresAt: "2026-01-01T00:01:00Z",
      });

      const adapter = createMockAdapter();
      const result = await executeApprovedCommands(coordinator, adapter, { now: "2026-01-01T01:00:00Z" });

      expect(result.attempted).toBe(1);
      expect(result.submitted).toBe(1);
      expect(result.skipped).toBe(0);
    });
  });

  describe("execution attempt records", () => {
    it("creates an execution attempt before calling the adapter", async () => {
      const { coordinator } = createCoordinator();
      coordinator.insertOutboundCommand("ob-001", "ctx-1", "scope-1", "send_reply", "approved_for_send");

      const adapter = createMockAdapter();
      await executeApprovedCommands(coordinator, adapter, { workerId: "test-worker", now: "2026-01-01T00:00:00Z" });

      const attempts = coordinator.getExecutionAttemptsForOutbound("ob-001");
      expect(attempts.length).toBe(1);
      expect(attempts[0]!.status).toBe("submitted");
      expect(attempts[0]!.actionType).toBe("send_reply");
      expect(attempts[0]!.workerId).toBe("test-worker");
      expect(attempts[0]!.attemptedAt).toBe("2026-01-01T00:00:00Z");
      expect(attempts[0]!.finishedAt).not.toBeNull();
    });

    it("records multiple attempts for the same outbound", async () => {
      const { coordinator } = createCoordinator();
      coordinator.insertOutboundCommand("ob-001", "ctx-1", "scope-1", "send_reply", "approved_for_send");

      const adapter = createMockAdapter({
        attemptEffect: vi.fn()
          .mockResolvedValueOnce({ status: "failed_retryable" as const, errorCode: "429", errorMessage: "rate limit" })
          .mockResolvedValueOnce({ status: "submitted" as const }),
      });

      // First invocation
      const result1 = await executeApprovedCommands(coordinator, adapter, { now: "2026-01-01T00:00:00Z" });
      expect(result1.failedRetryable).toBe(1);

      // Reset outbound status to approved so it can be picked up again
      coordinator.updateOutboundCommandStatus("ob-001", "approved_for_send");

      // Second invocation (lease from first has expired by now because we use old now)
      const result2 = await executeApprovedCommands(coordinator, adapter, { now: "2026-01-01T01:00:00Z" });
      expect(result2.submitted).toBe(1);

      const attempts = coordinator.getExecutionAttemptsForOutbound("ob-001");
      expect(attempts.length).toBe(2);
      expect(attempts[0]!.status).toBe("failed_retryable");
      expect(attempts[0]!.errorCode).toBe("429");
      expect(attempts[1]!.status).toBe("submitted");
    });
  });

  describe("state transitions", () => {
    it("approved_for_send → submitted on adapter success", async () => {
      const { coordinator } = createCoordinator();
      coordinator.insertOutboundCommand("ob-001", "ctx-1", "scope-1", "send_reply", "approved_for_send");

      const adapter = createMockAdapter({ attemptEffect: vi.fn(async () => ({ status: "submitted" as const, externalRef: "graph-msg-123" })) });
      const result = await executeApprovedCommands(coordinator, adapter);

      expect(result.submitted).toBe(1);
      expect(coordinator.getOutboundCommand("ob-001")!.status).toBe("submitted");

      const attempts = coordinator.getExecutionAttemptsForOutbound("ob-001");
      expect(attempts[0]!.status).toBe("submitted");
      expect(attempts[0]!.externalRef).toBe("graph-msg-123");
      expect(attempts[0]!.responseJson).toBeNull();
    });

    it("approved_for_send → failed_retryable on transient adapter failure", async () => {
      const { coordinator } = createCoordinator();
      coordinator.insertOutboundCommand("ob-001", "ctx-1", "scope-1", "send_reply", "approved_for_send");

      const adapter = createMockAdapter({
        attemptEffect: vi.fn(async () => ({ status: "failed_retryable" as const, errorCode: "429", errorMessage: "Rate limited" })),
      });
      const result = await executeApprovedCommands(coordinator, adapter);

      expect(result.failedRetryable).toBe(1);
      expect(coordinator.getOutboundCommand("ob-001")!.status).toBe("failed_retryable");

      const attempts = coordinator.getExecutionAttemptsForOutbound("ob-001");
      expect(attempts[0]!.status).toBe("failed_retryable");
      expect(attempts[0]!.errorCode).toBe("429");
      expect(attempts[0]!.errorMessage).toBe("Rate limited");
    });

    it("approved_for_send → failed_terminal on permanent adapter failure", async () => {
      const { coordinator } = createCoordinator();
      coordinator.insertOutboundCommand("ob-001", "ctx-1", "scope-1", "send_reply", "approved_for_send");

      const adapter = createMockAdapter({
        attemptEffect: vi.fn(async () => ({ status: "failed_terminal" as const, errorCode: "403", errorMessage: "Permission denied" })),
      });
      const result = await executeApprovedCommands(coordinator, adapter);

      expect(result.failedTerminal).toBe(1);
      expect(coordinator.getOutboundCommand("ob-001")!.status).toBe("failed_terminal");

      const attempts = coordinator.getExecutionAttemptsForOutbound("ob-001");
      expect(attempts[0]!.status).toBe("failed_terminal");
      expect(attempts[0]!.errorCode).toBe("403");
    });

    it("records failed_retryable when the adapter throws unexpectedly", async () => {
      const { coordinator } = createCoordinator();
      coordinator.insertOutboundCommand("ob-001", "ctx-1", "scope-1", "send_reply", "approved_for_send");

      const adapter = createMockAdapter({
        attemptEffect: vi.fn(async () => {
          throw new Error("Network unreachable");
        }),
      });
      const result = await executeApprovedCommands(coordinator, adapter);

      expect(result.failedRetryable).toBe(1);
      expect(coordinator.getOutboundCommand("ob-001")!.status).toBe("failed_retryable");

      const attempts = coordinator.getExecutionAttemptsForOutbound("ob-001");
      expect(attempts[0]!.status).toBe("failed_retryable");
      expect(attempts[0]!.errorCode).toBe("WORKER_EXCEPTION");
      expect(attempts[0]!.errorMessage).toBe("Network unreachable");
    });
  });

  describe("submitted vs confirmed separation", () => {
    it("does not transition submitted outbounds to confirmed", async () => {
      const { coordinator } = createCoordinator();
      coordinator.insertOutboundCommand("ob-001", "ctx-1", "scope-1", "send_reply", "approved_for_send");

      const adapter = createMockAdapter();
      const result = await executeApprovedCommands(coordinator, adapter);

      expect(result.submitted).toBe(1);
      expect(coordinator.getOutboundCommand("ob-001")!.status).toBe("submitted");
      // Confirmed is owned by reconciliation (Task 362); worker must never set it.
      expect(coordinator.getOutboundCommand("ob-001")!.status).not.toBe("confirmed");
    });

    it("submitted outbounds are not eligible for re-execution", async () => {
      const { coordinator } = createCoordinator();
      coordinator.insertOutboundCommand("ob-001", "ctx-1", "scope-1", "send_reply", "submitted");

      const adapter = createMockAdapter();
      const result = await executeApprovedCommands(coordinator, adapter);

      expect(result.attempted).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.residuals).toContain("no_approved_commands");
      expect(vi.mocked(adapter.attemptEffect)).not.toHaveBeenCalled();
    });
  });

  describe("health gate", () => {
    it("blocks execution when site health is auth_failed", async () => {
      const { coordinator } = createCoordinator();
      coordinator.setHealth({
        status: "auth_failed",
        lastCycleAt: null,
        lastCycleDurationMs: null,
        consecutiveFailures: 0,
        pendingWorkItems: 0,
        message: "token expired",
        updatedAt: "2026-01-01T00:00:00Z",
      });
      coordinator.insertOutboundCommand("ob-001", "ctx-1", "scope-1", "send_reply", "approved_for_send");

      const adapter = createMockAdapter();
      const result = await executeApprovedCommands(coordinator, adapter);

      expect(result.attempted).toBe(0);
      expect(result.residuals).toContain("auth_failed_health_blocked");
      expect(vi.mocked(adapter.attemptEffect)).not.toHaveBeenCalled();
    });
  });

  describe("residual reporting", () => {
    it("reports no_approved_commands when none exist", async () => {
      const { coordinator } = createCoordinator();
      const adapter = createMockAdapter();
      const result = await executeApprovedCommands(coordinator, adapter);

      expect(result.attempted).toBe(0);
      expect(result.residuals).toContain("no_approved_commands");
    });

    it("reports per-command residuals for mixed results", async () => {
      const { coordinator } = createCoordinator();
      coordinator.insertOutboundCommand("ob-ok", "ctx-1", "scope-1", "send_reply", "approved_for_send");
      coordinator.insertOutboundCommand("ob-retry", "ctx-1", "scope-1", "send_reply", "approved_for_send");
      coordinator.insertOutboundCommand("ob-dead", "ctx-1", "scope-1", "send_reply", "approved_for_send");

      const adapter = createMockAdapter({
        attemptEffect: vi.fn(async (cmd) => {
          if (cmd.outboundId === "ob-ok") return { status: "submitted" as const };
          if (cmd.outboundId === "ob-retry") return { status: "failed_retryable" as const };
          return { status: "failed_terminal" as const };
        }),
      });
      const result = await executeApprovedCommands(coordinator, adapter);

      expect(result.attempted).toBe(3);
      expect(result.residuals).toContain("submitted_ob-ok");
      expect(result.residuals).toContain("failed_retryable_ob-retry");
      expect(result.residuals).toContain("failed_terminal_ob-dead");
    });
  });
});
