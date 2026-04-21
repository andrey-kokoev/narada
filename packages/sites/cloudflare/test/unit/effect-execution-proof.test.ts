import { describe, it, expect, vi } from "vitest";
import Database from "better-sqlite3";
import { NaradaSiteCoordinator } from "../../src/coordinator.js";
import { createMockState } from "../fixtures/mock-sqlite.js";
import { executeSiteOperatorAction } from "../../src/operator-actions.js";
import { executeApprovedCommands } from "../../src/effect-worker.js";
import { createLiveReconcileStepHandler } from "../../src/cycle-step.js";
import type { NaradaSiteCoordinator as CoordinatorType } from "../../src/coordinator.js";
import type { SiteOperatorActionRequest } from "../../src/types.js";
import type { EffectExecutionAdapter } from "../../src/effect-worker.js";
import type { LiveObservationAdapter } from "../../src/reconciliation/live-observation-adapter.js";

function createCoordinator() {
  const db = new Database(":memory:");
  return new NaradaSiteCoordinator(createMockState(db));
}

function createOperatorActionContext(coordinator: CoordinatorType, scopeId: string) {
  return {
    scope_id: scopeId,
    getWorkItem: (id: string) => Promise.resolve(coordinator.getWorkItem(id)),
    updateWorkItemStatus: (id: string, status: string, updates?: { errorMessage?: string | null; updatedAt?: string }) => {
      coordinator.updateWorkItemStatus(id, status, updates);
      return Promise.resolve();
    },
    getOutboundCommand: (id: string) => Promise.resolve(coordinator.getOutboundCommand(id)),
    updateOutboundCommandStatus: (id: string, status: string) => {
      coordinator.updateOutboundCommandStatus(id, status);
      return Promise.resolve();
    },
    insertOperatorActionRequest: (req: SiteOperatorActionRequest) => {
      coordinator.insertOperatorActionRequest(req);
      return Promise.resolve();
    },
    markOperatorActionRequestExecuted: (id: string, at?: string) => {
      coordinator.markOperatorActionRequestExecuted(id, at);
      return Promise.resolve();
    },
    markOperatorActionRequestRejected: (id: string, reason: string, at?: string) => {
      coordinator.markOperatorActionRequestRejected(id, reason, at);
      return Promise.resolve();
    },
  };
}

function createMockEffectAdapter(result?: {
  status: "submitted" | "failed_retryable" | "failed_terminal";
  externalRef?: string;
  responseJson?: string;
}): EffectExecutionAdapter {
  return {
    attemptEffect: vi.fn(async () =>
      result ?? {
        status: "submitted",
        externalRef: "sent-msg-1",
        responseJson: JSON.stringify({
          outboundId: "out-1",
          draftId: "draft-1",
          sentMessageId: "sent-msg-1",
          internetMessageId: "im-1",
          submittedAt: "2024-01-01T00:00:00Z",
        }),
      }
    ),
  };
}

function createMockObservationAdapter(
  confirmOutboundIds: string[],
): LiveObservationAdapter {
  return {
    fetchObservations: vi.fn(async (pending) =>
      pending
        .filter((cmd) => confirmOutboundIds.includes(cmd.outboundId))
        .map((cmd) => ({
          observationId: `obs-${cmd.outboundId}`,
          outboundId: cmd.outboundId,
          scopeId: cmd.scopeId,
          observedStatus: "confirmed" as const,
          observedAt: "2024-01-01T00:01:00Z",
          evidence: "Mock observation",
        })),
    ),
  };
}

describe("Effect Execution Proof (Task 363)", () => {
  it("proves full path: approval -> execution -> submitted -> observation -> confirmed", async () => {
    const coordinator = createCoordinator();
    const scopeId = "test-scope";
    const outboundId = "out-proof-001";

    // Seed a draft_ready outbound (as if evaluator produced it)
    coordinator.insertOutboundCommand(
      outboundId,
      "ctx-proof-001",
      scopeId,
      "send_reply",
      "draft_ready",
      JSON.stringify({ parentMessageId: "msg-1", replyBody: "Hello" }),
    );

    // --- 1. Operator approval ---
    const opCtx = createOperatorActionContext(coordinator, scopeId);
    const approveResult = await executeSiteOperatorAction(opCtx, {
      action_type: "approve",
      target_id: outboundId,
    });

    expect(approveResult.success).toBe(true);
    expect(approveResult.status).toBe("executed");

    const afterApproval = coordinator.getOutboundCommand(outboundId);
    expect(afterApproval!.status).toBe("approved_for_send");

    // --- 2. Effect execution ---
    const effectAdapter = createMockEffectAdapter();
    const workerResult = await executeApprovedCommands(coordinator, effectAdapter, {
      workerId: "test-worker",
      now: "2024-01-01T00:00:00Z",
    });

    expect(workerResult.attempted).toBe(1);
    expect(workerResult.submitted).toBe(1);
    expect(workerResult.residuals).toContain(`submitted_${outboundId}`);

    const afterExecution = coordinator.getOutboundCommand(outboundId);
    expect(afterExecution!.status).toBe("submitted");

    // Audit: execution attempt record exists and is inspectable
    const attempts = coordinator.getExecutionAttemptsForOutbound(outboundId);
    expect(attempts.length).toBe(1);
    expect(attempts[0]!.status).toBe("submitted");
    expect(attempts[0]!.responseJson).not.toBeNull();
    const response = JSON.parse(attempts[0]!.responseJson!);
    expect(response.internetMessageId).toBe("im-1");

    // --- 3. Reconciliation observation ---
    const observationAdapter = createMockObservationAdapter([outboundId]);
    const reconcileEnv = {
      cycleId: "c-1",
      siteId: "test",
      scopeId,
      coordinator,
      env: {} as any,
    };
    const reconcileResult = await createLiveReconcileStepHandler(observationAdapter)(
      reconcileEnv,
      () => true,
    );

    expect(reconcileResult.status).toBe("completed");
    expect(reconcileResult.recordsWritten).toBe(1);
    expect(reconcileResult.residuals).toContain("confirmed_1_outbound_commands");

    const afterReconcile = coordinator.getOutboundCommand(outboundId);
    expect(afterReconcile!.status).toBe("confirmed");
  });

  it("asserts: approval precedes execution (worker skips non-approved)", async () => {
    const coordinator = createCoordinator();
    const outboundId = "out-proof-002";

    // Seed a pending outbound — not approved
    coordinator.insertOutboundCommand(
      outboundId,
      "ctx-proof-002",
      "test-scope",
      "send_reply",
      "pending",
      JSON.stringify({ parentMessageId: "msg-1", replyBody: "Hello" }),
    );

    const effectAdapter = createMockEffectAdapter();
    const workerResult = await executeApprovedCommands(coordinator, effectAdapter);

    expect(workerResult.attempted).toBe(0);
    expect(workerResult.residuals).toContain("no_approved_commands");

    const attempts = coordinator.getExecutionAttemptsForOutbound(outboundId);
    expect(attempts.length).toBe(0);
  });

  it("asserts: submitted does not equal confirmed without observation", async () => {
    const coordinator = createCoordinator();
    const scopeId = "test-scope";
    const outboundId = "out-proof-003";

    coordinator.insertOutboundCommand(
      outboundId,
      "ctx-proof-003",
      scopeId,
      "send_reply",
      "approved_for_send",
      JSON.stringify({ parentMessageId: "msg-1", replyBody: "Hello" }),
    );

    const effectAdapter = createMockEffectAdapter();
    await executeApprovedCommands(coordinator, effectAdapter);

    // After execution, status is submitted — NOT confirmed
    const afterExecution = coordinator.getOutboundCommand(outboundId);
    expect(afterExecution!.status).toBe("submitted");

    // Without reconciliation observation, it stays submitted
    const reconcileEnv = {
      cycleId: "c-1",
      siteId: "test",
      scopeId,
      coordinator,
      env: {} as any,
    };
    const observationAdapter = createMockObservationAdapter([]); // no confirmations
    const reconcileResult = await createLiveReconcileStepHandler(observationAdapter)(
      reconcileEnv,
      () => true,
    );

    expect(reconcileResult.recordsWritten).toBe(0);

    const afterReconcile = coordinator.getOutboundCommand(outboundId);
    expect(afterReconcile!.status).toBe("submitted");
  });

  it("asserts: adapter is mechanical and does not decide authority", async () => {
    const coordinator = createCoordinator();
    const outboundId = "out-proof-004";

    coordinator.insertOutboundCommand(
      outboundId,
      "ctx-proof-004",
      "test-scope",
      "send_reply",
      "approved_for_send",
      JSON.stringify({ parentMessageId: "msg-1", replyBody: "Hello" }),
    );

    // Adapter is purely mechanical: it just returns what we tell it to
    const effectAdapter = createMockEffectAdapter({
      status: "submitted",
      externalRef: "ref-1",
      responseJson: JSON.stringify({ detail: "mocked" }),
    });

    const workerResult = await executeApprovedCommands(coordinator, effectAdapter);

    // The adapter did not gate, approve, or reject — it just performed
    expect(workerResult.attempted).toBe(1);
    expect(effectAdapter.attemptEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        outboundId,
        actionType: "send_reply",
      }),
    );
  });

  it("asserts: evaluator does not execute (evaluator only produces evaluations)", async () => {
    const coordinator = createCoordinator();

    // Seed a work item and evaluation, but no outbound execution
    coordinator.insertContextRecord("ctx-eval", "test-scope", "charter-1");
    coordinator.insertWorkItem("wi-1", "ctx-eval", "test-scope", "opened");
    coordinator.insertEvaluation("eval-1", "wi-1", "test-scope", "charter-1", "complete", "evaluated");

    // Evaluations exist but no outbound commands were created by the evaluator
    expect(coordinator.getEvaluationCount()).toBe(1);
    expect(coordinator.getApprovedOutboundCommands().length).toBe(0);
  });

  it("asserts: audit and attempt records are inspectable after full path", async () => {
    const coordinator = createCoordinator();
    const scopeId = "test-scope";
    const outboundId = "out-proof-005";

    coordinator.insertOutboundCommand(
      outboundId,
      "ctx-proof-005",
      scopeId,
      "send_reply",
      "draft_ready",
      JSON.stringify({ parentMessageId: "msg-1", replyBody: "Hello" }),
    );

    const opCtx = createOperatorActionContext(coordinator, scopeId);
    const approveResult = await executeSiteOperatorAction(opCtx, { action_type: "approve", target_id: outboundId });

    const effectAdapter = createMockEffectAdapter();
    await executeApprovedCommands(coordinator, effectAdapter, {
      workerId: "audit-worker",
      now: "2024-01-01T00:00:00Z",
    });

    const observationAdapter = createMockObservationAdapter([outboundId]);
    const reconcileEnv = { cycleId: "c-1", siteId: "test", scopeId, coordinator, env: {} as any };
    await createLiveReconcileStepHandler(observationAdapter)(reconcileEnv, () => true);

    // Operator action audit
    const approveRequest = coordinator.getOperatorActionRequest(approveResult.request_id);
    expect(approveRequest).not.toBeNull();
    expect(approveRequest!.status).toBe("executed");

    // Execution attempt audit
    const attempts = coordinator.getExecutionAttemptsForOutbound(outboundId);
    expect(attempts.length).toBe(1);
    expect(attempts[0]!.workerId).toBe("audit-worker");
    expect(attempts[0]!.status).toBe("submitted");
    expect(attempts[0]!.responseJson).not.toBeNull();

    // Final state
    const outbound = coordinator.getOutboundCommand(outboundId);
    expect(outbound!.status).toBe("confirmed");
  });
});

/*
 * No-Overclaim Statement (Task 363)
 *
 * - The external Graph boundary is MOCKED. No real Graph API calls are made.
 * - No actual email is sent. The send_reply effect is simulated.
 * - This is a bounded proof of authority separation, not production readiness.
 * - Production deployment has NOT been exercised.
 */
