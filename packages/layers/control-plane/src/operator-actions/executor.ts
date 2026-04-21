/**
 * Canonical Operator Action Executor
 *
 * Shared by CLI and daemon/UI paths. Every operator-facing mutation routes
 * through here so that:
 * - Audit is always inserted first (status = pending)
 * - Mutation runs inside a try/catch
 * - Success marks the audit row executed
 * - Failure marks the audit row rejected
 *
 * Moved from daemon/observation/operator-actions.ts to control-plane so
 * both layers can import it without circular dependencies.
 */

import type {
  CoordinatorStoreOperatorView,
  OperatorActionRequest,
  OutboundStore,
  IntentStore,
} from "../index.js";

export const PERMITTED_OPERATOR_ACTIONS = [
  "retry_work_item",
  "retry_failed_work_items",
  "acknowledge_alert",
  "rebuild_views",
  "rebuild_projections",
  "request_redispatch",
  "trigger_sync",
  "derive_work",
  "preview_work",
  "reject_draft",
  "mark_reviewed",
  "handled_externally",
  "approve_draft_for_send",
  "retry_auth_failed",
] as const;

export type OperatorActionType = (typeof PERMITTED_OPERATOR_ACTIONS)[number];

export interface OperatorActionPayload {
  action_type: OperatorActionType;
  target_id?: string;
  payload_json?: string;
}

export interface OperatorActionResult {
  success: boolean;
  request_id: string;
  status: "executed" | "rejected";
  reason?: string;
}

export interface OperatorActionContext {
  scope_id: string;
  coordinatorStore: CoordinatorStoreOperatorView;
  outboundStore: OutboundStore;
  intentStore: IntentStore;
  /** @deprecated Use rebuildProjections instead */
  rebuildViews?: () => Promise<void>;
  rebuildProjections?: () => Promise<void>;
  runDispatchPhase?: () => Promise<{ signal: unknown; openedCount: number }>;
  requestWake?: (reason: string) => void;
  deriveWork?: (options: {
    contextId?: string;
    since?: string;
    factIds?: string[];
  }) => Promise<{
    opened: number;
    superseded: number;
    nooped: number;
  }>;
  previewWork?: (options: {
    contextId?: string;
    since?: string;
    factIds?: string[];
  }) => Promise<import("../foreman/types.js").PreviewDerivationResult[]>;
}

export async function executeOperatorAction(
  ctx: OperatorActionContext,
  payload: OperatorActionPayload,
): Promise<OperatorActionResult> {
  const now = new Date().toISOString();
  const requestId = `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const request: OperatorActionRequest = {
    request_id: requestId,
    scope_id: ctx.scope_id,
    action_type: payload.action_type,
    target_id: payload.target_id ?? null,
    // payload_json is already a JSON string from callers (UI stringifies
    // objects before sending). Do NOT double-encode.
    payload_json: payload.payload_json ?? null,
    status: "pending",
    requested_by: "operator",
    requested_at: now,
    executed_at: null,
  };

  ctx.coordinatorStore.insertOperatorActionRequest(request);

  try {
    switch (payload.action_type) {
      case "retry_work_item": {
        if (!payload.target_id) {
          throw new Error("target_id (work_item_id) is required for retry_work_item");
        }
        const item = ctx.coordinatorStore.getWorkItem(payload.target_id);
        if (!item) {
          throw new Error(`Work item ${payload.target_id} not found`);
        }
        if (item.status !== "failed_retryable") {
          throw new Error(`Work item ${payload.target_id} is not in failed_retryable status (current: ${item.status})`);
        }
        ctx.coordinatorStore.updateWorkItemStatus(payload.target_id, "failed_retryable", {
          next_retry_at: null,
          updated_at: now,
        });
        break;
      }

      case "retry_failed_work_items": {
        const limit = payload.payload_json
          ? (JSON.parse(payload.payload_json) as Record<string, unknown>).limit ?? 100
          : 100;
        const items = ctx.coordinatorStore.getFailedRetryableWorkItems(ctx.scope_id, Number(limit));
        if (items.length === 0) {
          break;
        }
        for (const item of items) {
          ctx.coordinatorStore.updateWorkItemStatus(item.work_item_id, "failed_retryable", {
            next_retry_at: null,
            updated_at: now,
          });
        }
        break;
      }

      case "acknowledge_alert": {
        if (!payload.target_id) {
          throw new Error("target_id (work_item_id) is required for acknowledge_alert");
        }
        const item = ctx.coordinatorStore.getWorkItem(payload.target_id);
        if (!item) {
          throw new Error(`Work item ${payload.target_id} not found`);
        }
        if (item.status !== "failed_retryable" && item.status !== "failed_terminal") {
          throw new Error(`Work item ${payload.target_id} is not in a failed status (current: ${item.status})`);
        }
        ctx.coordinatorStore.updateWorkItemStatus(payload.target_id, "failed_terminal", {
          error_message: item.error_message
            ? `${item.error_message} [acknowledged by operator]`
            : "Acknowledged by operator",
          updated_at: now,
        });
        break;
      }

      case "rebuild_views": {
        if (!ctx.rebuildViews) {
          throw new Error("rebuild_views is not available in this configuration");
        }
        await ctx.rebuildViews();
        break;
      }

      case "rebuild_projections": {
        const rebuildFn = ctx.rebuildProjections ?? ctx.rebuildViews;
        if (!rebuildFn) {
          throw new Error("rebuild_projections is not available in this configuration");
        }
        await rebuildFn();
        break;
      }

      case "request_redispatch": {
        if (!ctx.runDispatchPhase) {
          throw new Error("request_redispatch is not available in this configuration");
        }
        await ctx.runDispatchPhase();
        break;
      }

      case "trigger_sync": {
        if (!ctx.requestWake) {
          throw new Error("trigger_sync is not available in this configuration");
        }
        ctx.requestWake("manual");
        break;
      }

      case "derive_work": {
        if (!ctx.deriveWork) {
          throw new Error("derive_work is not available in this configuration");
        }
        const deriveOptions: { contextId?: string; since?: string; factIds?: string[] } = {};
        if (payload.target_id) {
          deriveOptions.contextId = payload.target_id;
        }
        if (payload.payload_json) {
          try {
            const parsed = JSON.parse(payload.payload_json) as Record<string, unknown>;
            if (typeof parsed.since === "string") deriveOptions.since = parsed.since;
            if (Array.isArray(parsed.fact_ids)) deriveOptions.factIds = parsed.fact_ids as string[];
          } catch {
            // ignore invalid payload_json
          }
        }
        await ctx.deriveWork(deriveOptions);
        break;
      }

      case "preview_work": {
        if (!ctx.previewWork) {
          throw new Error("preview_work is not available in this configuration");
        }
        const previewOptions: { contextId?: string; since?: string; factIds?: string[] } = {};
        if (payload.target_id) {
          previewOptions.contextId = payload.target_id;
        }
        if (payload.payload_json) {
          try {
            const parsed = JSON.parse(payload.payload_json) as Record<string, unknown>;
            if (typeof parsed.since === "string") previewOptions.since = parsed.since;
            if (Array.isArray(parsed.fact_ids)) previewOptions.factIds = parsed.fact_ids as string[];
          } catch {
            // ignore invalid payload_json
          }
        }
        await ctx.previewWork(previewOptions);
        break;
      }

      case "reject_draft": {
        if (!payload.target_id) {
          throw new Error("target_id (outbound_id) is required for reject_draft");
        }
        const command = ctx.outboundStore.getCommand(payload.target_id);
        if (!command) {
          throw new Error(`Outbound command ${payload.target_id} not found`);
        }
        if (command.status !== "draft_ready") {
          throw new Error(`Outbound command ${payload.target_id} is not in draft_ready status (current: ${command.status})`);
        }
        const rationale = payload.payload_json
          ? (JSON.parse(payload.payload_json) as Record<string, unknown>).rationale as string | undefined
          : undefined;
        ctx.outboundStore.updateCommandStatus(payload.target_id, "cancelled", {
          terminal_reason: "operator_rejected",
        });
        ctx.outboundStore.appendTransition({
          outbound_id: payload.target_id,
          version: command.latest_version,
          from_status: command.status,
          to_status: "cancelled",
          reason: rationale ? `operator_rejected: ${rationale}` : "operator_rejected",
          transition_at: now,
        });
        // Update associated intent
        const intent = ctx.intentStore.getByTargetId(payload.target_id);
        if (intent) {
          ctx.intentStore.updateStatus(intent.intent_id, "cancelled", { terminal_reason: "operator_rejected" });
        }
        break;
      }

      case "mark_reviewed": {
        if (!payload.target_id) {
          throw new Error("target_id (outbound_id) is required for mark_reviewed");
        }
        const command = ctx.outboundStore.getCommand(payload.target_id);
        if (!command) {
          throw new Error(`Outbound command ${payload.target_id} not found`);
        }
        if (command.status !== "draft_ready") {
          throw new Error(`Outbound command ${payload.target_id} is not in draft_ready status (current: ${command.status})`);
        }
        const notes = payload.payload_json
          ? (JSON.parse(payload.payload_json) as Record<string, unknown>).reviewer_notes as string | undefined
          : undefined;
        ctx.outboundStore.updateCommandStatus(payload.target_id, command.status, {
          reviewed_at: now,
          reviewer_notes: notes ?? null,
        });
        break;
      }

      case "handled_externally": {
        if (!payload.target_id) {
          throw new Error("target_id (outbound_id) is required for handled_externally");
        }
        const command = ctx.outboundStore.getCommand(payload.target_id);
        if (!command) {
          throw new Error(`Outbound command ${payload.target_id} not found`);
        }
        if (command.status !== "draft_ready") {
          throw new Error(`Outbound command ${payload.target_id} is not in draft_ready status (current: ${command.status})`);
        }
        const ref = payload.payload_json
          ? (JSON.parse(payload.payload_json) as Record<string, unknown>).external_reference as string | undefined
          : undefined;
        if (!ref) {
          throw new Error("external_reference is required for handled_externally");
        }
        ctx.outboundStore.updateCommandStatus(payload.target_id, "cancelled", {
          terminal_reason: "handled_externally",
          external_reference: ref,
        });
        ctx.outboundStore.appendTransition({
          outbound_id: payload.target_id,
          version: command.latest_version,
          from_status: command.status,
          to_status: "cancelled",
          reason: `handled_externally: ${ref}`,
          transition_at: now,
        });
        // Update associated intent
        const intent = ctx.intentStore.getByTargetId(payload.target_id);
        if (intent) {
          ctx.intentStore.updateStatus(intent.intent_id, "cancelled", { terminal_reason: "handled_externally" });
        }
        break;
      }

      case "approve_draft_for_send": {
        if (!payload.target_id) {
          throw new Error("target_id (outbound_id) is required for approve_draft_for_send");
        }
        const command = ctx.outboundStore.getCommand(payload.target_id);
        if (!command) {
          throw new Error(`Outbound command ${payload.target_id} not found`);
        }
        if (command.status !== "draft_ready") {
          throw new Error(`Outbound command ${payload.target_id} is not in draft_ready status (current: ${command.status})`);
        }
        const sendableActionTypes = ["send_reply", "send_new_message"];
        if (!sendableActionTypes.includes(command.action_type)) {
          throw new Error(`Outbound command ${payload.target_id} action_type ${command.action_type} is not eligible for send approval`);
        }
        ctx.outboundStore.updateCommandStatus(payload.target_id, "approved_for_send", {
          approved_at: now,
        });
        ctx.outboundStore.appendTransition({
          outbound_id: payload.target_id,
          version: command.latest_version,
          from_status: command.status,
          to_status: "approved_for_send",
          reason: "operator_approved_for_send",
          transition_at: now,
        });
        break;
      }

      case "retry_auth_failed": {
        const limit = payload.payload_json
          ? (JSON.parse(payload.payload_json) as Record<string, unknown>).limit ?? 50
          : 50;
        const targetId = payload.target_id;
        const candidates: Array<{ outbound_id: string; action_type: string; status: string; terminal_reason: string | null }> = [];

        if (targetId) {
          const command = ctx.outboundStore.getCommand(targetId);
          if (!command) {
            throw new Error(`Outbound command ${targetId} not found`);
          }
          if (command.status !== "failed_terminal") {
            throw new Error(`Outbound command ${targetId} is not in failed_terminal status (current: ${command.status})`);
          }
          if (!command.terminal_reason?.toLowerCase().includes("auth")) {
            throw new Error(`Outbound command ${targetId} terminal_reason does not indicate an auth failure`);
          }
          candidates.push(command);
        } else {
          // Scan all commands in this scope for auth-failed terminals
          const all = ctx.outboundStore.getCommandsByScope(ctx.scope_id, Number(limit));
          for (const cmd of all) {
            if (cmd.status === "failed_terminal" && cmd.terminal_reason?.toLowerCase().includes("auth")) {
              candidates.push(cmd);
            }
          }
        }

        if (candidates.length === 0) {
          break;
        }

        for (const cmd of candidates) {
          const sendableActions = ["send_reply", "send_new_message"];
          const toStatus = sendableActions.includes(cmd.action_type) ? "approved_for_send" : "draft_ready";
          ctx.outboundStore.updateCommandStatus(cmd.outbound_id, toStatus, {
            terminal_reason: null,
          });
          ctx.outboundStore.appendTransition({
            outbound_id: cmd.outbound_id,
            version: null,
            from_status: "failed_terminal",
            to_status: toStatus,
            reason: "operator_retry_after_auth_restored",
            transition_at: now,
          });
        }
        break;
      }

      default: {
        throw new Error(`Unknown action type: ${(payload as { action_type: string }).action_type}`);
      }
    }

    ctx.coordinatorStore.markOperatorActionRequestExecuted(requestId, now);
    return { success: true, request_id: requestId, status: "executed" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    ctx.coordinatorStore.markOperatorActionRequestRejected(requestId, now);
    return { success: false, request_id: requestId, status: "rejected", reason };
  }
}
