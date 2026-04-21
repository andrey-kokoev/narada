import { describe, it, expect, vi } from "vitest";
import {
  executeSiteOperatorAction,
  type SiteOperatorActionContext,
} from "../../src/operator-actions.js";
import type { SiteOperatorActionRequest } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Mock context builder
// ---------------------------------------------------------------------------

function createMockContext(overrides?: {
  workItem?: { workItemId: string; contextId: string; scopeId: string; status: string; errorMessage: string | null; createdAt: string; updatedAt: string } | null;
  outboundCommand?: { outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; createdAt: string } | null;
}): SiteOperatorActionContext {
  const requests: SiteOperatorActionRequest[] = [];

  return {
    scope_id: "scope-001",
    getWorkItem: vi.fn(async () => overrides?.workItem ?? null),
    updateWorkItemStatus: vi.fn(async () => {}),
    getOutboundCommand: vi.fn(async () => overrides?.outboundCommand ?? null),
    updateOutboundCommandStatus: vi.fn(async () => {}),
    insertOperatorActionRequest: vi.fn(async (req) => {
      requests.push(req);
    }),
    getOperatorActionRequests: () => requests,
    markOperatorActionRequestExecuted: vi.fn(async () => {}),
    markOperatorActionRequestRejected: vi.fn(async () => {}),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("executeSiteOperatorAction", () => {
  describe("audit invariant", () => {
    it("inserts pending audit before attempting mutation", async () => {
      const ctx = createMockContext({
        outboundCommand: {
          outboundId: "ob-001",
          contextId: "ctx-001",
          scopeId: "scope-001",
          actionType: "send_reply",
          status: "draft_ready",
          createdAt: "2026-01-01T00:00:00Z",
        },
      });

      await executeSiteOperatorAction(ctx, {
        action_type: "approve",
        target_id: "ob-001",
      });

      expect(ctx.insertOperatorActionRequest).toHaveBeenCalledTimes(1);
      const request = vi.mocked(ctx.insertOperatorActionRequest).mock.calls[0]![0];
      expect(request.status).toBe("pending");
      expect(request.action_type).toBe("approve");
      expect(request.target_id).toBe("ob-001");
      expect(request.target_kind).toBe("outbound_command");
    });

    it("marks audit executed on success", async () => {
      const ctx = createMockContext({
        outboundCommand: {
          outboundId: "ob-001",
          contextId: "ctx-001",
          scopeId: "scope-001",
          actionType: "send_reply",
          status: "draft_ready",
          createdAt: "2026-01-01T00:00:00Z",
        },
      });

      const result = await executeSiteOperatorAction(ctx, {
        action_type: "approve",
        target_id: "ob-001",
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("executed");
      expect(ctx.markOperatorActionRequestExecuted).toHaveBeenCalledTimes(1);
      expect(ctx.markOperatorActionRequestRejected).not.toHaveBeenCalled();
    });

    it("marks audit rejected on failure with reason", async () => {
      const ctx = createMockContext({
        outboundCommand: {
          outboundId: "ob-001",
          contextId: "ctx-001",
          scopeId: "scope-001",
          actionType: "send_reply",
          status: "submitted",
          createdAt: "2026-01-01T00:00:00Z",
        },
      });

      const result = await executeSiteOperatorAction(ctx, {
        action_type: "approve",
        target_id: "ob-001",
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe("rejected");
      expect(result.reason).toContain("not in draft_ready status");
      expect(ctx.markOperatorActionRequestRejected).toHaveBeenCalledTimes(1);
      expect(ctx.markOperatorActionRequestExecuted).not.toHaveBeenCalled();
    });
  });

  describe("approve", () => {
    it("transitions draft_ready outbound to approved_for_send", async () => {
      const ctx = createMockContext({
        outboundCommand: {
          outboundId: "ob-001",
          contextId: "ctx-001",
          scopeId: "scope-001",
          actionType: "send_reply",
          status: "draft_ready",
          createdAt: "2026-01-01T00:00:00Z",
        },
      });

      const result = await executeSiteOperatorAction(ctx, {
        action_type: "approve",
        target_id: "ob-001",
      });

      expect(result.success).toBe(true);
      expect(ctx.updateOutboundCommandStatus).toHaveBeenCalledWith("ob-001", "approved_for_send");
    });

    it("rejects approve when outbound is not draft_ready", async () => {
      const ctx = createMockContext({
        outboundCommand: {
          outboundId: "ob-001",
          contextId: "ctx-001",
          scopeId: "scope-001",
          actionType: "send_reply",
          status: "submitted",
          createdAt: "2026-01-01T00:00:00Z",
        },
      });

      const result = await executeSiteOperatorAction(ctx, {
        action_type: "approve",
        target_id: "ob-001",
      });

      expect(result.success).toBe(false);
      expect(ctx.updateOutboundCommandStatus).not.toHaveBeenCalled();
    });

    it("rejects approve when outbound does not exist", async () => {
      const ctx = createMockContext({ outboundCommand: null });

      const result = await executeSiteOperatorAction(ctx, {
        action_type: "approve",
        target_id: "ob-001",
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain("not found");
      expect(ctx.updateOutboundCommandStatus).not.toHaveBeenCalled();
    });
  });

  describe("reject", () => {
    it("transitions draft_ready outbound to cancelled", async () => {
      const ctx = createMockContext({
        outboundCommand: {
          outboundId: "ob-001",
          contextId: "ctx-001",
          scopeId: "scope-001",
          actionType: "send_reply",
          status: "draft_ready",
          createdAt: "2026-01-01T00:00:00Z",
        },
      });

      const result = await executeSiteOperatorAction(ctx, {
        action_type: "reject",
        target_id: "ob-001",
      });

      expect(result.success).toBe(true);
      expect(ctx.updateOutboundCommandStatus).toHaveBeenCalledWith("ob-001", "cancelled");
    });

    it("rejects reject when outbound is not draft_ready", async () => {
      const ctx = createMockContext({
        outboundCommand: {
          outboundId: "ob-001",
          contextId: "ctx-001",
          scopeId: "scope-001",
          actionType: "send_reply",
          status: "approved_for_send",
          createdAt: "2026-01-01T00:00:00Z",
        },
      });

      const result = await executeSiteOperatorAction(ctx, {
        action_type: "reject",
        target_id: "ob-001",
      });

      expect(result.success).toBe(false);
      expect(ctx.updateOutboundCommandStatus).not.toHaveBeenCalled();
    });
  });

  describe("retry", () => {
    it("transitions failed_retryable work item to opened", async () => {
      const ctx = createMockContext({
        workItem: {
          workItemId: "wi-001",
          contextId: "ctx-001",
          scopeId: "scope-001",
          status: "failed_retryable",
          errorMessage: "transient error",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      });

      const result = await executeSiteOperatorAction(ctx, {
        action_type: "retry",
        target_id: "wi-001",
      });

      expect(result.success).toBe(true);
      expect(ctx.updateWorkItemStatus).toHaveBeenCalledWith("wi-001", "opened", expect.objectContaining({ updatedAt: expect.any(String) }));
    });

    it("rejects retry when work item is not failed_retryable", async () => {
      const ctx = createMockContext({
        workItem: {
          workItemId: "wi-001",
          contextId: "ctx-001",
          scopeId: "scope-001",
          status: "opened",
          errorMessage: null,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      });

      const result = await executeSiteOperatorAction(ctx, {
        action_type: "retry",
        target_id: "wi-001",
      });

      expect(result.success).toBe(false);
      expect(ctx.updateWorkItemStatus).not.toHaveBeenCalled();
    });

    it("rejects retry when work item does not exist", async () => {
      const ctx = createMockContext({ workItem: null });

      const result = await executeSiteOperatorAction(ctx, {
        action_type: "retry",
        target_id: "wi-001",
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain("not found");
    });
  });

  describe("cancel", () => {
    it("transitions opened work item to cancelled", async () => {
      const ctx = createMockContext({
        workItem: {
          workItemId: "wi-001",
          contextId: "ctx-001",
          scopeId: "scope-001",
          status: "opened",
          errorMessage: null,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      });

      const result = await executeSiteOperatorAction(ctx, {
        action_type: "cancel",
        target_id: "wi-001",
      });

      expect(result.success).toBe(true);
      expect(ctx.updateWorkItemStatus).toHaveBeenCalledWith("wi-001", "cancelled", expect.objectContaining({ updatedAt: expect.any(String) }));
    });

    it("transitions failed_retryable work item to cancelled", async () => {
      const ctx = createMockContext({
        workItem: {
          workItemId: "wi-001",
          contextId: "ctx-001",
          scopeId: "scope-001",
          status: "failed_retryable",
          errorMessage: "error",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      });

      const result = await executeSiteOperatorAction(ctx, {
        action_type: "cancel",
        target_id: "wi-001",
      });

      expect(result.success).toBe(true);
      expect(ctx.updateWorkItemStatus).toHaveBeenCalledWith("wi-001", "cancelled", expect.anything());
    });

    it("rejects cancel when work item is leased", async () => {
      const ctx = createMockContext({
        workItem: {
          workItemId: "wi-001",
          contextId: "ctx-001",
          scopeId: "scope-001",
          status: "leased",
          errorMessage: null,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      });

      const result = await executeSiteOperatorAction(ctx, {
        action_type: "cancel",
        target_id: "wi-001",
      });

      expect(result.success).toBe(false);
      expect(ctx.updateWorkItemStatus).not.toHaveBeenCalled();
    });

    it("rejects cancel when work item does not exist", async () => {
      const ctx = createMockContext({ workItem: null });

      const result = await executeSiteOperatorAction(ctx, {
        action_type: "cancel",
        target_id: "wi-001",
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain("not found");
    });
  });

  describe("lifecycle constraint: no mutation on invalid transition", () => {
    it("does not mutate target when preconditions fail", async () => {
      const ctx = createMockContext({
        outboundCommand: {
          outboundId: "ob-001",
          contextId: "ctx-001",
          scopeId: "scope-001",
          actionType: "send_reply",
          status: "submitted",
          createdAt: "2026-01-01T00:00:00Z",
        },
      });

      await executeSiteOperatorAction(ctx, {
        action_type: "approve",
        target_id: "ob-001",
      });

      expect(ctx.updateOutboundCommandStatus).not.toHaveBeenCalled();
      expect(ctx.updateWorkItemStatus).not.toHaveBeenCalled();
    });
  });

  describe("request_id consistency", () => {
    it("returns the same request_id in result that was used for audit", async () => {
      const ctx = createMockContext({
        outboundCommand: {
          outboundId: "ob-001",
          contextId: "ctx-001",
          scopeId: "scope-001",
          actionType: "send_reply",
          status: "draft_ready",
          createdAt: "2026-01-01T00:00:00Z",
        },
      });

      const result = await executeSiteOperatorAction(ctx, {
        action_type: "approve",
        target_id: "ob-001",
      });

      const request = vi.mocked(ctx.insertOperatorActionRequest).mock.calls[0]![0];
      expect(result.request_id).toBe(request.request_id);
    });
  });
});
