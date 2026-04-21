import { describe, it, expect, vi } from "vitest";
import Database from "better-sqlite3";
import { NaradaSiteCoordinator } from "../../src/coordinator.js";
import { createMockState } from "../fixtures/mock-sqlite.js";
import { createLiveReconcileStepHandler } from "../../src/cycle-step.js";
import type { LiveObservationAdapter, LiveObservation, PendingOutbound } from "../../src/reconciliation/live-observation-adapter.js";
import type { CycleCoordinator } from "../../src/coordinator.js";

function createCoordinator() {
  const db = new Database(":memory:");
  return { db, coordinator: new NaradaSiteCoordinator(createMockState(db)) };
}

function createEnv(coordinator: CycleCoordinator) {
  return { cycleId: "c-1", siteId: "test", scopeId: "test", coordinator, env: {} as any };
}

function mockAdapter(
  behavior: (pending: PendingOutbound[]) => Promise<LiveObservation[]>,
): LiveObservationAdapter {
  return { fetchObservations: vi.fn(behavior) };
}

describe("Reconciliation After Execution (Task 362)", () => {
  it("submitted command without observation remains submitted", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    // Seed a submitted outbound command with execution attempt
    coordinator.insertOutboundCommand("out-1", "ctx-1", "test", "send_reply", "submitted", JSON.stringify({ parentMessageId: "msg-1", replyBody: "Hello" }));
    coordinator.insertExecutionAttempt({
      executionAttemptId: "att-1",
      outboundId: "out-1",
      actionType: "send_reply",
      attemptedAt: "2024-01-01T00:00:00Z",
      status: "submitted",
      errorCode: null,
      errorMessage: null,
      responseJson: JSON.stringify({ outboundId: "out-1", draftId: "d-1", sentMessageId: "sm-1", internetMessageId: "im-1", submittedAt: "2024-01-01T00:00:00Z" }),
      externalRef: "sm-1",
      workerId: "w-1",
      leaseExpiresAt: null,
    });

    const adapter = mockAdapter(async () => []);
    const result = await createLiveReconcileStepHandler(adapter)(env, () => true);

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(0);
    expect(result.residuals).toContain("confirmed_0_outbound_commands");
    expect(result.residuals).toContain("left_1_unconfirmed");

    const submitted = coordinator.getSubmittedOutboundCommands();
    expect(submitted.length).toBe(1);
  });

  it("matching live observation confirms a submitted command", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    coordinator.insertOutboundCommand("out-1", "ctx-1", "test", "send_reply", "submitted", JSON.stringify({ parentMessageId: "msg-1", replyBody: "Hello" }));
    coordinator.insertExecutionAttempt({
      executionAttemptId: "att-1",
      outboundId: "out-1",
      actionType: "send_reply",
      attemptedAt: "2024-01-01T00:00:00Z",
      status: "submitted",
      errorCode: null,
      errorMessage: null,
      responseJson: JSON.stringify({ outboundId: "out-1", draftId: "d-1", sentMessageId: "sm-1", internetMessageId: "im-1", submittedAt: "2024-01-01T00:00:00Z" }),
      externalRef: "sm-1",
      workerId: "w-1",
      leaseExpiresAt: null,
    });

    const adapter = mockAdapter(async (pending) =>
      pending.map((cmd) => ({
        observationId: `obs-${cmd.outboundId}`,
        outboundId: cmd.outboundId,
        scopeId: cmd.scopeId,
        observedStatus: "confirmed" as const,
        observedAt: "2024-01-01T00:01:00Z",
        evidence: "Found in Graph",
      })),
    );

    const result = await createLiveReconcileStepHandler(adapter)(env, () => true);

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(1);
    expect(result.residuals).toContain("confirmed_1_outbound_commands");

    expect(coordinator.getSubmittedOutboundCommands().length).toBe(0);
    // After confirmation, it should no longer appear as submitted
    const pending = coordinator.getPendingOutboundCommands();
    expect(pending.length).toBe(0);
  });

  it("execution attempt record alone cannot confirm", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    coordinator.insertOutboundCommand("out-1", "ctx-1", "test", "send_reply", "submitted", JSON.stringify({ parentMessageId: "msg-1", replyBody: "Hello" }));
    coordinator.insertExecutionAttempt({
      executionAttemptId: "att-1",
      outboundId: "out-1",
      actionType: "send_reply",
      attemptedAt: "2024-01-01T00:00:00Z",
      status: "submitted",
      errorCode: null,
      errorMessage: null,
      responseJson: JSON.stringify({ outboundId: "out-1", draftId: "d-1", sentMessageId: "sm-1", internetMessageId: "im-1", submittedAt: "2024-01-01T00:00:00Z" }),
      externalRef: "sm-1",
      workerId: "w-1",
      leaseExpiresAt: null,
    });

    // Adapter returns no observations even though execution succeeded
    const adapter = mockAdapter(async () => []);
    const result = await createLiveReconcileStepHandler(adapter)(env, () => true);

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(0);
    expect(result.residuals).toContain("left_1_unconfirmed");
  });

  it("reconciliation uses internetMessageId from execution attempt responseJson", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    // Outbound has no internetMessageId on the record itself
    coordinator.insertOutboundCommand("out-1", "ctx-1", "test", "send_reply", "submitted", JSON.stringify({ parentMessageId: "msg-1", replyBody: "Hello" }), null);
    coordinator.insertExecutionAttempt({
      executionAttemptId: "att-1",
      outboundId: "out-1",
      actionType: "send_reply",
      attemptedAt: "2024-01-01T00:00:00Z",
      status: "submitted",
      errorCode: null,
      errorMessage: null,
      responseJson: JSON.stringify({ internetMessageId: "im-from-attempt" }),
      externalRef: null,
      workerId: "w-1",
      leaseExpiresAt: null,
    });

    let receivedInternetMessageId: string | undefined;
    const adapter = mockAdapter(async (pending) => {
      receivedInternetMessageId = pending[0]?.internetMessageId ?? undefined;
      return [{
        observationId: "obs-1",
        outboundId: "out-1",
        scopeId: "test",
        observedStatus: "confirmed",
        observedAt: "2024-01-01T00:01:00Z",
      }];
    });

    await createLiveReconcileStepHandler(adapter)(env, () => true);

    expect(receivedInternetMessageId).toBe("im-from-attempt");
  });

  it("adapter failure does not fabricate confirmation", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    coordinator.insertOutboundCommand("out-1", "ctx-1", "test", "send_reply", "submitted", JSON.stringify({ parentMessageId: "msg-1", replyBody: "Hello" }));
    coordinator.insertExecutionAttempt({
      executionAttemptId: "att-1",
      outboundId: "out-1",
      actionType: "send_reply",
      attemptedAt: "2024-01-01T00:00:00Z",
      status: "submitted",
      errorCode: null,
      errorMessage: null,
      responseJson: JSON.stringify({ internetMessageId: "im-1" }),
      externalRef: null,
      workerId: "w-1",
      leaseExpiresAt: null,
    });

    const adapter = mockAdapter(async () => {
      throw new Error("Graph API unavailable");
    });

    const result = await createLiveReconcileStepHandler(adapter)(env, () => true);

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(0);
    expect(result.residuals).toContain("adapter_fetch_failed");
    expect(result.residuals).toContain("left_1_unconfirmed");

    expect(coordinator.getSubmittedOutboundCommands().length).toBe(1);
  });

  it("partial confirmation when only some observations match", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    coordinator.insertOutboundCommand("out-1", "ctx-1", "test", "send_reply", "submitted", JSON.stringify({ parentMessageId: "msg-1", replyBody: "Hello" }));
    coordinator.insertOutboundCommand("out-2", "ctx-2", "test", "send_reply", "submitted", JSON.stringify({ parentMessageId: "msg-2", replyBody: "World" }));

    coordinator.insertExecutionAttempt({
      executionAttemptId: "att-1",
      outboundId: "out-1",
      actionType: "send_reply",
      attemptedAt: "2024-01-01T00:00:00Z",
      status: "submitted",
      errorCode: null,
      errorMessage: null,
      responseJson: JSON.stringify({ internetMessageId: "im-1" }),
      externalRef: null,
      workerId: "w-1",
      leaseExpiresAt: null,
    });
    coordinator.insertExecutionAttempt({
      executionAttemptId: "att-2",
      outboundId: "out-2",
      actionType: "send_reply",
      attemptedAt: "2024-01-01T00:00:00Z",
      status: "submitted",
      errorCode: null,
      errorMessage: null,
      responseJson: JSON.stringify({ internetMessageId: "im-2" }),
      externalRef: null,
      workerId: "w-1",
      leaseExpiresAt: null,
    });

    const adapter = mockAdapter(async (pending) =>
      pending
        .filter((cmd) => cmd.outboundId === "out-1")
        .map((cmd) => ({
          observationId: `obs-${cmd.outboundId}`,
          outboundId: cmd.outboundId,
          scopeId: cmd.scopeId,
          observedStatus: "confirmed" as const,
          observedAt: "2024-01-01T00:01:00Z",
        })),
    );

    const result = await createLiveReconcileStepHandler(adapter)(env, () => true);

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(1);
    expect(result.residuals).toContain("confirmed_1_outbound_commands");
    expect(result.residuals).toContain("left_1_unconfirmed");

    expect(coordinator.getSubmittedOutboundCommands().length).toBe(1);
  });

  it("deadline exceeded mid-reconcile stops processing", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    coordinator.insertOutboundCommand("out-1", "ctx-1", "test", "send_reply", "submitted", JSON.stringify({ parentMessageId: "msg-1", replyBody: "Hello" }));
    coordinator.insertExecutionAttempt({
      executionAttemptId: "att-1",
      outboundId: "out-1",
      actionType: "send_reply",
      attemptedAt: "2024-01-01T00:00:00Z",
      status: "submitted",
      errorCode: null,
      errorMessage: null,
      responseJson: JSON.stringify({ internetMessageId: "im-1" }),
      externalRef: null,
      workerId: "w-1",
      leaseExpiresAt: null,
    });

    const adapter = mockAdapter(async () => []);
    let callCount = 0;
    const result = await createLiveReconcileStepHandler(adapter)(env, () => {
      callCount++;
      return callCount < 2; // fail after first check
    });

    expect(result.status).toBe("completed");
    expect(result.residuals).toContain("deadline_exceeded_mid_reconcile");
  });

  it("skips when no submitted outbound commands exist", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    const adapter = mockAdapter(async () => []);
    const result = await createLiveReconcileStepHandler(adapter)(env, () => true);

    expect(result.status).toBe("skipped");
    expect(result.recordsWritten).toBe(0);
    expect(result.residuals).toContain("no_submitted_outbound_commands");
  });

  it("skips when deadline exceeded before start", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    const adapter = mockAdapter(async () => []);
    const result = await createLiveReconcileStepHandler(adapter)(env, () => false);

    expect(result.status).toBe("skipped");
    expect(result.residuals).toContain("deadline_exceeded_before_start");
  });
});
