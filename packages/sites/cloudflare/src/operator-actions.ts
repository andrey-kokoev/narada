/**
 * Cloudflare Site Operator Action Executor
 *
 * Bounded audited mutation surface for the Cloudflare Site v0 runtime.
 * Every operator-facing mutation routes through here so that:
 * - Audit is always inserted first (status = pending)
 * - Mutation runs inside a try/catch
 * - Success marks the audit row executed
 * - Failure marks the audit row rejected
 *
 * Actions: approve, reject, retry, cancel
 */

import type { SiteOperatorActionType, SiteOperatorActionRequest, SiteOperatorActionResult } from "./types.js";

export interface SiteOperatorActionPayload {
  action_type: SiteOperatorActionType;
  target_id: string;
  payload_json?: string;
}

export interface SiteOperatorActionContext {
  scope_id: string;
  getWorkItem(workItemId: string): Promise<{ workItemId: string; contextId: string; scopeId: string; status: string; errorMessage: string | null; createdAt: string; updatedAt: string } | null>;
  updateWorkItemStatus(workItemId: string, status: string, updates?: { errorMessage?: string | null; updatedAt?: string }): Promise<void>;
  getOutboundCommand(outboundId: string): Promise<{ outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; createdAt: string } | null>;
  updateOutboundCommandStatus(outboundId: string, status: string): Promise<void>;
  insertOperatorActionRequest(request: SiteOperatorActionRequest): Promise<void>;
  markOperatorActionRequestExecuted(requestId: string, executedAt?: string): Promise<void>;
  markOperatorActionRequestRejected(requestId: string, reason: string, rejectedAt?: string): Promise<void>;
}

export async function executeSiteOperatorAction(
  ctx: SiteOperatorActionContext,
  payload: SiteOperatorActionPayload,
): Promise<SiteOperatorActionResult> {
  const now = new Date().toISOString();
  const requestId = `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Determine target kind from action type
  const targetKind: SiteOperatorActionRequest["target_kind"] =
    payload.action_type === "approve" || payload.action_type === "reject"
      ? "outbound_command"
      : "work_item";

  const request: SiteOperatorActionRequest = {
    request_id: requestId,
    scope_id: ctx.scope_id,
    action_type: payload.action_type,
    target_id: payload.target_id,
    target_kind: targetKind,
    payload_json: payload.payload_json ?? null,
    status: "pending",
    requested_by: "operator",
    requested_at: now,
    executed_at: null,
    rejected_at: null,
    rejection_reason: null,
  };

  await ctx.insertOperatorActionRequest(request);

  try {
    switch (payload.action_type) {
      case "approve": {
        const command = await ctx.getOutboundCommand(payload.target_id);
        if (!command) {
          throw new Error(`Outbound command ${payload.target_id} not found`);
        }
        if (command.status !== "draft_ready") {
          throw new Error(`Outbound command ${payload.target_id} is not in draft_ready status (current: ${command.status})`);
        }
        await ctx.updateOutboundCommandStatus(payload.target_id, "approved_for_send");
        break;
      }

      case "reject": {
        const command = await ctx.getOutboundCommand(payload.target_id);
        if (!command) {
          throw new Error(`Outbound command ${payload.target_id} not found`);
        }
        if (command.status !== "draft_ready") {
          throw new Error(`Outbound command ${payload.target_id} is not in draft_ready status (current: ${command.status})`);
        }
        await ctx.updateOutboundCommandStatus(payload.target_id, "cancelled");
        break;
      }

      case "retry": {
        const item = await ctx.getWorkItem(payload.target_id);
        if (!item) {
          throw new Error(`Work item ${payload.target_id} not found`);
        }
        if (item.status !== "failed_retryable") {
          throw new Error(`Work item ${payload.target_id} is not in failed_retryable status (current: ${item.status})`);
        }
        await ctx.updateWorkItemStatus(payload.target_id, "opened", { updatedAt: now });
        break;
      }

      case "cancel": {
        const item = await ctx.getWorkItem(payload.target_id);
        if (!item) {
          throw new Error(`Work item ${payload.target_id} not found`);
        }
        const cancellableStatuses = ["opened", "failed_retryable"];
        if (!cancellableStatuses.includes(item.status)) {
          throw new Error(`Work item ${payload.target_id} cannot be cancelled from status ${item.status}`);
        }
        await ctx.updateWorkItemStatus(payload.target_id, "cancelled", { updatedAt: now });
        break;
      }

      default: {
        throw new Error(`Unknown action type: ${(payload as { action_type: string }).action_type}`);
      }
    }

    await ctx.markOperatorActionRequestExecuted(requestId, now);
    return { success: true, request_id: requestId, status: "executed" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await ctx.markOperatorActionRequestRejected(requestId, reason, now);
    return { success: false, request_id: requestId, status: "rejected", reason };
  }
}
