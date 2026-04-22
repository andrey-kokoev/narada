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
  result: { status: "submitted" | "failed_retryable" | "failed_terminal" },
): EffectExecutionAdapter {
  return {
    attemptEffect: vi.fn(async () => result),
  };
}

function seedRetryableAttempts(
  coordinator: ReturnType<typeof createCoordinator>["coordinator"],
  outboundId: string,
  count: number,
  baseTime: number = 1_000_000_000_000,
) {
  for (let i = 0; i < count; i++) {
    coordinator.insertExecutionAttempt({
      executionAttemptId: `att-${outboundId}-${i}`,
      outboundId,
      actionType: "send_reply",
      attemptedAt: new Date(baseTime + i * 1000).toISOString(),
      status: "failed_retryable",
      errorCode: "MOCK_RETRYABLE",
      errorMessage: `Retryable failure ${i + 1}`,
      responseJson: null,
      externalRef: null,
      workerId: "test-worker",
      leaseExpiresAt: null,
    });
  }
}

describe("Effect Execution Retry Limit And Backoff (Task 368)", () => {
  it("below retry limit remains retryable (adapter is called)", async () => {
    const { coordinator } = createCoordinator();
    const outboundId = "ob-retry-below";

    coordinator.insertOutboundCommand(
      outboundId,
      "ctx-1",
      "scope-1",
      "send_reply",
      "approved_for_send",
      JSON.stringify({ body: "Hello" }),
    );

    // 4 prior failed_retryable attempts (below limit of 5)
    seedRetryableAttempts(coordinator, outboundId, 4);

    const adapter = createMockAdapter({ status: "failed_retryable" });
    const result = await executeApprovedCommands(coordinator, adapter, {
      workerId: "test-worker",
      now: "2026-01-01T00:00:00Z",
    });

    expect(result.attempted).toBe(1);
    expect(result.failedRetryable).toBe(1);
    expect(vi.mocked(adapter.attemptEffect)).toHaveBeenCalledTimes(1);

    const attempts = coordinator.getExecutionAttemptsForOutbound(outboundId);
    expect(attempts.length).toBe(5); // 4 seeded + 1 new
  });

  it("at retry limit auto-promotes to failed_terminal (adapter NOT called)", async () => {
    const { coordinator } = createCoordinator();
    const outboundId = "ob-retry-at-limit";

    coordinator.insertOutboundCommand(
      outboundId,
      "ctx-1",
      "scope-1",
      "send_reply",
      "approved_for_send",
      JSON.stringify({ body: "Hello" }),
    );

    // 5 prior failed_retryable attempts (at limit)
    seedRetryableAttempts(coordinator, outboundId, 5);

    const adapter = createMockAdapter({ status: "submitted" });
    const result = await executeApprovedCommands(coordinator, adapter, {
      workerId: "test-worker",
      now: "2026-01-01T00:00:00Z",
    });

    expect(result.attempted).toBe(0);
    expect(result.failedTerminal).toBe(1);
    expect(result.residuals).toContain(`failed_terminal_retry_limit_${outboundId}`);
    expect(vi.mocked(adapter.attemptEffect)).not.toHaveBeenCalled();

    const outbound = coordinator.getOutboundCommand(outboundId);
    expect(outbound!.status).toBe("failed_terminal");

    const attempts = coordinator.getExecutionAttemptsForOutbound(outboundId);
    expect(attempts.length).toBe(6); // 5 seeded + 1 auto-promotion audit record
    const auditRecord = attempts[attempts.length - 1]!;
    expect(auditRecord.status).toBe("failed_terminal");
    expect(auditRecord.errorCode).toBe("RETRY_LIMIT_EXHAUSTED");
  });

  it("above retry limit auto-promotes to failed_terminal (adapter NOT called)", async () => {
    const { coordinator } = createCoordinator();
    const outboundId = "ob-retry-above-limit";

    coordinator.insertOutboundCommand(
      outboundId,
      "ctx-1",
      "scope-1",
      "send_reply",
      "approved_for_send",
      JSON.stringify({ body: "Hello" }),
    );

    // 6 prior failed_retryable attempts (above limit)
    seedRetryableAttempts(coordinator, outboundId, 6);

    const adapter = createMockAdapter({ status: "submitted" });
    const result = await executeApprovedCommands(coordinator, adapter, {
      workerId: "test-worker",
      now: "2026-01-01T00:00:00Z",
    });

    expect(result.attempted).toBe(0);
    expect(result.failedTerminal).toBe(1);
    expect(vi.mocked(adapter.attemptEffect)).not.toHaveBeenCalled();

    const outbound = coordinator.getOutboundCommand(outboundId);
    expect(outbound!.status).toBe("failed_terminal");
  });

  it("backoff skips too-early retry (adapter NOT called)", async () => {
    const { coordinator } = createCoordinator();
    const outboundId = "ob-backoff-skip";

    coordinator.insertOutboundCommand(
      outboundId,
      "ctx-1",
      "scope-1",
      "send_reply",
      "approved_for_send",
      JSON.stringify({ body: "Hello" }),
    );

    // 1 prior failed_retryable at T=0
    const baseTime = 1_000_000_000_000;
    coordinator.insertExecutionAttempt({
      executionAttemptId: `att-${outboundId}-0`,
      outboundId,
      actionType: "send_reply",
      attemptedAt: new Date(baseTime).toISOString(),
      status: "failed_retryable",
      errorCode: "MOCK_RETRYABLE",
      errorMessage: "Retryable failure 1",
      responseJson: null,
      externalRef: null,
      workerId: "test-worker",
      leaseExpiresAt: null,
    });

    // Now is baseTime + 500ms — backoff for 1st retry is 2s, so we should skip
    const adapter = createMockAdapter({ status: "submitted" });
    const result = await executeApprovedCommands(coordinator, adapter, {
      workerId: "test-worker",
      now: new Date(baseTime + 500).toISOString(),
    });

    expect(result.attempted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.residuals).toContain(`backoff_active_${outboundId}`);
    expect(vi.mocked(adapter.attemptEffect)).not.toHaveBeenCalled();
  });

  it("expired backoff allows retry (adapter IS called)", async () => {
    const { coordinator } = createCoordinator();
    const outboundId = "ob-backoff-expired";

    coordinator.insertOutboundCommand(
      outboundId,
      "ctx-1",
      "scope-1",
      "send_reply",
      "approved_for_send",
      JSON.stringify({ body: "Hello" }),
    );

    // 1 prior failed_retryable at T=0
    const baseTime = 1_000_000_000_000;
    coordinator.insertExecutionAttempt({
      executionAttemptId: `att-${outboundId}-0`,
      outboundId,
      actionType: "send_reply",
      attemptedAt: new Date(baseTime).toISOString(),
      status: "failed_retryable",
      errorCode: "MOCK_RETRYABLE",
      errorMessage: "Retryable failure 1",
      responseJson: null,
      externalRef: null,
      workerId: "test-worker",
      leaseExpiresAt: null,
    });

    // Now is baseTime + 3000ms — backoff for 1st retry is 2s, so we should retry
    const adapter = createMockAdapter({ status: "submitted" });
    const result = await executeApprovedCommands(coordinator, adapter, {
      workerId: "test-worker",
      now: new Date(baseTime + 3000).toISOString(),
    });

    expect(result.attempted).toBe(1);
    expect(result.submitted).toBe(1);
    expect(result.residuals).not.toContain(`backoff_active_${outboundId}`);
    expect(vi.mocked(adapter.attemptEffect)).toHaveBeenCalledTimes(1);
  });

  it("backoff delay increases with retry count", async () => {
    const { coordinator } = createCoordinator();
    const outboundId = "ob-backoff-increases";

    coordinator.insertOutboundCommand(
      outboundId,
      "ctx-1",
      "scope-1",
      "send_reply",
      "approved_for_send",
      JSON.stringify({ body: "Hello" }),
    );

    const baseTime = 1_000_000_000_000;

    // 3 prior failed_retryable attempts
    // Backoff should be: baseDelay * 2^(3-1) = 2000 * 4 = 8000ms
    seedRetryableAttempts(coordinator, outboundId, 3, baseTime);

    const adapter = createMockAdapter({ status: "submitted" });

    // At baseTime + 5000ms (less than 8000ms) — should skip
    const result1 = await executeApprovedCommands(coordinator, adapter, {
      workerId: "test-worker",
      now: new Date(baseTime + 5000).toISOString(),
    });
    expect(result1.skipped).toBe(1);
    expect(result1.residuals).toContain(`backoff_active_${outboundId}`);

    // At baseTime + 11000ms (more than 8000ms after last failed at baseTime+2000) — should retry
    const result2 = await executeApprovedCommands(coordinator, adapter, {
      workerId: "test-worker",
      now: new Date(baseTime + 11000).toISOString(),
    });
    expect(result2.attempted).toBe(1);
    expect(result2.submitted).toBe(1);
  });

  it("terminal promotion does not execute adapter again on subsequent invocations", async () => {
    const { coordinator } = createCoordinator();
    const outboundId = "ob-terminal-no-retry";

    coordinator.insertOutboundCommand(
      outboundId,
      "ctx-1",
      "scope-1",
      "send_reply",
      "approved_for_send",
      JSON.stringify({ body: "Hello" }),
    );

    seedRetryableAttempts(coordinator, outboundId, 5);

    const adapter = createMockAdapter({ status: "submitted" });

    // First invocation promotes to terminal
    const result1 = await executeApprovedCommands(coordinator, adapter, {
      workerId: "test-worker",
      now: "2026-01-01T00:00:00Z",
    });
    expect(result1.failedTerminal).toBe(1);

    // Second invocation should not see the command (no longer approved_for_send)
    const result2 = await executeApprovedCommands(coordinator, adapter, {
      workerId: "test-worker",
      now: "2026-01-01T00:00:01Z",
    });
    expect(result2.attempted).toBe(0);
    expect(result2.failedTerminal).toBe(0);
    expect(vi.mocked(adapter.attemptEffect)).not.toHaveBeenCalled();

    // Outbound should stay terminal
    const outbound = coordinator.getOutboundCommand(outboundId);
    expect(outbound!.status).toBe("failed_terminal");
  });

  it("custom maxRetryLimit is respected", async () => {
    const { coordinator } = createCoordinator();
    const outboundId = "ob-custom-limit";

    coordinator.insertOutboundCommand(
      outboundId,
      "ctx-1",
      "scope-1",
      "send_reply",
      "approved_for_send",
      JSON.stringify({ body: "Hello" }),
    );

    // 2 prior failed_retryable attempts with custom limit of 2
    seedRetryableAttempts(coordinator, outboundId, 2);

    const adapter = createMockAdapter({ status: "submitted" });
    const result = await executeApprovedCommands(coordinator, adapter, {
      workerId: "test-worker",
      now: "2026-01-01T00:00:00Z",
      maxRetryLimit: 2,
    });

    expect(result.attempted).toBe(0);
    expect(result.failedTerminal).toBe(1);
    expect(vi.mocked(adapter.attemptEffect)).not.toHaveBeenCalled();
  });

  it("custom backoff delays are respected", async () => {
    const { coordinator } = createCoordinator();
    const outboundId = "ob-custom-backoff";

    coordinator.insertOutboundCommand(
      outboundId,
      "ctx-1",
      "scope-1",
      "send_reply",
      "approved_for_send",
      JSON.stringify({ body: "Hello" }),
    );

    const baseTime = 1_000_000_000_000;
    coordinator.insertExecutionAttempt({
      executionAttemptId: `att-${outboundId}-0`,
      outboundId,
      actionType: "send_reply",
      attemptedAt: new Date(baseTime).toISOString(),
      status: "failed_retryable",
      errorCode: "MOCK_RETRYABLE",
      errorMessage: "Retryable failure 1",
      responseJson: null,
      externalRef: null,
      workerId: "test-worker",
      leaseExpiresAt: null,
    });

    const adapter = createMockAdapter({ status: "submitted" });

    // Custom base delay of 10s — at baseTime + 5s should skip
    const result = await executeApprovedCommands(coordinator, adapter, {
      workerId: "test-worker",
      now: new Date(baseTime + 5000).toISOString(),
      backoffBaseDelayMs: 10_000,
    });

    expect(result.skipped).toBe(1);
    expect(result.residuals).toContain(`backoff_active_${outboundId}`);
    expect(vi.mocked(adapter.attemptEffect)).not.toHaveBeenCalled();
  });
});
