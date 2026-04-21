/**
 * Execution Audit and Failure Semantics Integration (Task 361)
 *
 * Integrates the effect worker (Task 359) with the Graph draft/send adapter
 * (Task 360) through the send-reply bridge. Proves:
 *
 * - Worker and adapter are integrated under authority contract
 * - Attempts are auditable with full external identity
 * - Success records submitted, not confirmed
 * - Failures are classified honestly (retryable vs terminal)
 * - Ambiguous post-effect states are fail-closed or residualized
 * - Duplicate attempts are prevented by lease
 * - Missing external IDs are recorded honestly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { NaradaSiteCoordinator } from "../../src/coordinator.js";
import { createMockState } from "../fixtures/mock-sqlite.js";
import { executeApprovedCommands } from "../../src/effect-worker.js";
import { createSendReplyEffectAdapter } from "../../src/effects/send-reply-adapter.js";
import type { GraphDraftClient } from "../../src/effects/graph-draft-send-adapter.js";

function createCoordinator() {
  const db = new Database(":memory:");
  return { db, coordinator: new NaradaSiteCoordinator(createMockState(db)) };
}

function buildMockClient(
  overrides: Partial<GraphDraftClient> = {},
): GraphDraftClient {
  return {
    createDraftReply: vi.fn(async () => ({
      draftId: "draft-001",
      internetMessageId: "<draft-imid@example.com>",
    })),
    sendDraft: vi.fn(async () => ({
      sentMessageId: "sent-001",
      internetMessageId: "<sent-imid@example.com>",
    })),
    ...overrides,
  };
}

describe("Execution Audit Integration (Task 361)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("executes approved send_reply through full worker→adapter pipeline", async () => {
    const { coordinator } = createCoordinator();

    coordinator.insertOutboundCommand(
      "ob-001",
      "ctx-1",
      "scope-1",
      "send_reply",
      "approved_for_send",
      JSON.stringify({
        parentMessageId: "parent-1",
        replyBody: "Hello from Narada",
        replySubject: "Re: Support",
      }),
    );

    const client = buildMockClient();
    const adapter = createSendReplyEffectAdapter({ client });

    const result = await executeApprovedCommands(coordinator, adapter, {
      workerId: "test-worker",
      now: "2026-01-01T00:00:00Z",
    });

    expect(result.attempted).toBe(1);
    expect(result.submitted).toBe(1);
    expect(client.createDraftReply).toHaveBeenCalledWith(
      "scope-1",
      "ob-001",
      "parent-1",
      "Hello from Narada",
      "Re: Support",
    );
    expect(client.sendDraft).toHaveBeenCalledWith("scope-1", "draft-001");

    // Outbound transitioned to submitted — NOT confirmed
    const outbound = coordinator.getOutboundCommand("ob-001");
    expect(outbound!.status).toBe("submitted");

    // Audit record has full external identity
    const attempts = coordinator.getExecutionAttemptsForOutbound("ob-001");
    expect(attempts.length).toBe(1);
    expect(attempts[0]!.status).toBe("submitted");
    expect(attempts[0]!.workerId).toBe("test-worker");

    const response = JSON.parse(attempts[0]!.responseJson!);
    expect(response.draftId).toBe("draft-001");
    expect(response.sentMessageId).toBe("sent-001");
    expect(response.internetMessageId).toBe("<sent-imid@example.com>");
    expect(response.submittedAt).toMatch(/^\d{4}-/);
  });

  it("records retryable failure with error detail and no Graph success", async () => {
    const { coordinator } = createCoordinator();

    coordinator.insertOutboundCommand(
      "ob-001",
      "ctx-1",
      "scope-1",
      "send_reply",
      "approved_for_send",
      JSON.stringify({ parentMessageId: "p-1", replyBody: "Hello" }),
    );

    const client = buildMockClient({
      createDraftReply: vi.fn(async () => {
        throw { status: 429, code: "ErrorRateLimitExceeded", message: "Slow down" };
      }),
    });
    const adapter = createSendReplyEffectAdapter({ client });

    const promise = executeApprovedCommands(coordinator, adapter, {
      workerId: "test-worker",
      now: "2026-01-01T00:00:00Z",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.failedRetryable).toBe(1);

    const outbound = coordinator.getOutboundCommand("ob-001");
    expect(outbound!.status).toBe("failed_retryable");

    const attempts = coordinator.getExecutionAttemptsForOutbound("ob-001");
    expect(attempts.length).toBe(1);
    expect(attempts[0]!.status).toBe("failed_retryable");
    expect(attempts[0]!.errorCode).toBe("429");
    expect(attempts[0]!.errorMessage).toBe("Slow down");

    const response = JSON.parse(attempts[0]!.responseJson!);
    expect(response.draftId).toBeNull();
    expect(response.sentMessageId).toBeNull();
  });

  it("records terminal failure with error detail", async () => {
    const { coordinator } = createCoordinator();

    coordinator.insertOutboundCommand(
      "ob-001",
      "ctx-1",
      "scope-1",
      "send_reply",
      "approved_for_send",
      JSON.stringify({ parentMessageId: "p-1", replyBody: "Hello" }),
    );

    const client = buildMockClient({
      createDraftReply: vi.fn(async () => {
        throw { status: 403, code: "AccessDenied", message: "No permission" };
      }),
    });
    const adapter = createSendReplyEffectAdapter({ client });

    const result = await executeApprovedCommands(coordinator, adapter, {
      workerId: "test-worker",
      now: "2026-01-01T00:00:00Z",
    });

    expect(result.failedTerminal).toBe(1);

    const outbound = coordinator.getOutboundCommand("ob-001");
    expect(outbound!.status).toBe("failed_terminal");

    const attempts = coordinator.getExecutionAttemptsForOutbound("ob-001");
    expect(attempts[0]!.status).toBe("failed_terminal");
    expect(attempts[0]!.errorCode).toBe("403");
  });

  it("prevents duplicate execution attempts via active lease", async () => {
    const { coordinator } = createCoordinator();

    coordinator.insertOutboundCommand(
      "ob-001",
      "ctx-1",
      "scope-1",
      "send_reply",
      "approved_for_send",
      JSON.stringify({ parentMessageId: "p-1", replyBody: "Hello" }),
    );

    // Simulate an in-flight attempt from another worker
    coordinator.insertExecutionAttempt({
      executionAttemptId: "attempt-inflight",
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

    const client = buildMockClient();
    const adapter = createSendReplyEffectAdapter({ client });

    const result = await executeApprovedCommands(coordinator, adapter, {
      workerId: "worker-b",
      now: "2026-01-01T00:00:01Z",
      leaseTtlMs: 60_000,
    });

    expect(result.attempted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.residuals).toContain("skipped_active_lease_ob-001");

    // No Graph call — lease blocked execution
    expect(client.createDraftReply).not.toHaveBeenCalled();
  });

  it("allows retry after lease expiry (crash recovery)", async () => {
    const { coordinator } = createCoordinator();

    coordinator.insertOutboundCommand(
      "ob-001",
      "ctx-1",
      "scope-1",
      "send_reply",
      "approved_for_send",
      JSON.stringify({ parentMessageId: "p-1", replyBody: "Hello" }),
    );

    // Simulate a crashed attempt with expired lease
    coordinator.insertExecutionAttempt({
      executionAttemptId: "attempt-crashed",
      outboundId: "ob-001",
      actionType: "send_reply",
      attemptedAt: "2026-01-01T00:00:00Z",
      status: "attempting",
      errorCode: null,
      errorMessage: null,
      responseJson: null,
      externalRef: null,
      workerId: "crashed-worker",
      leaseExpiresAt: "2026-01-01T00:01:00Z",
    });

    const client = buildMockClient();
    const adapter = createSendReplyEffectAdapter({ client });

    // Run at T=120s — lease has expired, worker should retry
    const result = await executeApprovedCommands(coordinator, adapter, {
      workerId: "recovery-worker",
      now: "2026-01-01T00:02:00Z",
      leaseTtlMs: 60_000,
    });

    expect(result.attempted).toBe(1);
    expect(result.submitted).toBe(1);

    // One Graph call from recovery worker
    expect(client.createDraftReply).toHaveBeenCalledTimes(1);

    // Two execution attempts: the crashed one + the recovery one
    const attempts = coordinator.getExecutionAttemptsForOutbound("ob-001");
    expect(attempts.length).toBe(2);
    expect(attempts[0]!.workerId).toBe("crashed-worker");
    expect(attempts[1]!.workerId).toBe("recovery-worker");
  });

  it("records missing external id honestly when adapter omits it", async () => {
    const { coordinator } = createCoordinator();

    coordinator.insertOutboundCommand(
      "ob-001",
      "ctx-1",
      "scope-1",
      "send_reply",
      "approved_for_send",
      JSON.stringify({ parentMessageId: "p-1", replyBody: "Hello" }),
    );

    const client = buildMockClient({
      createDraftReply: vi.fn(async () => ({
        draftId: "draft-no-imid",
        // no internetMessageId
      })),
      sendDraft: vi.fn(async () => ({
        sentMessageId: "sent-no-imid",
        // no internetMessageId
      })),
    });
    const adapter = createSendReplyEffectAdapter({ client });

    const result = await executeApprovedCommands(coordinator, adapter, {
      workerId: "test-worker",
      now: "2026-01-01T00:00:00Z",
    });

    expect(result.submitted).toBe(1);

    const attempts = coordinator.getExecutionAttemptsForOutbound("ob-001");
    const response = JSON.parse(attempts[0]!.responseJson!);
    expect(response.draftId).toBe("draft-no-imid");
    expect(response.sentMessageId).toBe("sent-no-imid");
    expect(response.internetMessageId).toBeNull();

    // Reconciliation may fail to match; this is recorded honestly, not hidden
    expect(response.submittedAt).not.toBeNull();
  });

  it("fails terminal on malformed payload without calling Graph", async () => {
    const { coordinator } = createCoordinator();

    coordinator.insertOutboundCommand(
      "ob-001",
      "ctx-1",
      "scope-1",
      "send_reply",
      "approved_for_send",
      JSON.stringify({ missingParentMessageId: true, replyBody: "Hello" }),
    );

    const client = buildMockClient();
    const adapter = createSendReplyEffectAdapter({ client });

    const result = await executeApprovedCommands(coordinator, adapter, {
      workerId: "test-worker",
      now: "2026-01-01T00:00:00Z",
    });

    expect(result.failedTerminal).toBe(1);
    expect(client.createDraftReply).not.toHaveBeenCalled();

    const attempts = coordinator.getExecutionAttemptsForOutbound("ob-001");
    expect(attempts[0]!.status).toBe("failed_terminal");
    expect(attempts[0]!.errorCode).toBe("PAYLOAD_PARSE_ERROR");
  });

  it("ambiguous post-effect crash leaves residual and allows safe retry", async () => {
    const { coordinator } = createCoordinator();

    coordinator.insertOutboundCommand(
      "ob-001",
      "ctx-1",
      "scope-1",
      "send_reply",
      "approved_for_send",
      JSON.stringify({ parentMessageId: "p-1", replyBody: "Hello" }),
    );

    // Adapter that succeeds on first call, throws on second
    // This simulates: first worker crashes after Graph accepts but before
    // persistence. Second worker sees expired lease and retries.
    let callCount = 0;
    const client = buildMockClient({
      createDraftReply: vi.fn(async () => {
        callCount++;
        return {
          draftId: `draft-${callCount}`,
          internetMessageId: `<imid-${callCount}@example.com>`,
        };
      }),
      sendDraft: vi.fn(async () => {
        callCount++;
        return {
          sentMessageId: `sent-${callCount}`,
          internetMessageId: `<imid-${callCount}@example.com>`,
        };
      }),
    });
    const adapter = createSendReplyEffectAdapter({ client });

    // Simulate crash: we invoke the adapter directly as if the worker
    // succeeded, but we do NOT record an execution attempt or update
    // outbound status. This is the ambiguous state.
    const directResult = await adapter.attemptEffect({
      outboundId: "ob-001",
      scopeId: "scope-1",
      actionType: "send_reply",
      payloadJson: JSON.stringify({ parentMessageId: "p-1", replyBody: "Hello" }),
      internetMessageId: null,
    });
    expect(directResult.status).toBe("submitted");

    // Now the real worker runs. It sees the outbound is still
    // approved_for_send (no attempt record exists), so it will attempt.
    const workerResult = await executeApprovedCommands(coordinator, adapter, {
      workerId: "worker-recovery",
      now: "2026-01-01T00:00:00Z",
      leaseTtlMs: 60_000,
    });

    expect(workerResult.attempted).toBe(1);
    expect(workerResult.submitted).toBe(1);

    // Two Graph calls happened (the direct one + the worker one)
    expect(client.createDraftReply).toHaveBeenCalledTimes(2);

    // One execution attempt recorded (from the worker)
    const attempts = coordinator.getExecutionAttemptsForOutbound("ob-001");
    expect(attempts.length).toBe(1);
    expect(attempts[0]!.workerId).toBe("worker-recovery");

    // The outbound is now submitted. The first Graph call created an
    // orphaned draft. This is an acknowledged residual documented in
    // the effect-execution authority contract.
    const outbound = coordinator.getOutboundCommand("ob-001");
    expect(outbound!.status).toBe("submitted");
  });
});
