/**
 * Safe Operator Action Execution
 *
 * All UI-facing mutations are validated, executed, and logged here.
 * The observability layer remains read-only.
 *
 * Authority boundary (Task 073):
 * - This is the ONLY permitted write path from the operator console.
 * - Actions cannot bypass the intent boundary (no direct intent inserts).
 * - Actions cannot bypass scheduler/foreman authority (no direct work_item creation,
 *   no lease manipulation, no foreman decision injection).
 * - Every action is logged to operator_action_requests for audit.
 */

import type {
  CoordinatorStoreOperatorView,
  OperatorActionRequest,
} from "@narada2/control-plane";

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

import type { WakeReason } from "./types.js";

export interface OperatorActionContext {
  scope_id: string;
  coordinatorStore: CoordinatorStoreOperatorView;
  /** @deprecated Use rebuildProjections instead */
  rebuildViews?: () => Promise<void>;
  rebuildProjections?: () => Promise<void>;
  runDispatchPhase?: () => Promise<{ signal: unknown; openedCount: number }>;
  requestWake?: (reason: WakeReason) => void;
  deriveWork?: (options: { contextId?: string; since?: string; factIds?: string[] }) => Promise<{
    opened: number;
    superseded: number;
    nooped: number;
  }>;
  previewWork?: (options: { contextId?: string; since?: string; factIds?: string[] }) => Promise<
    import("@narada2/control-plane").PreviewDerivationResult[]
  >;
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
    payload_json: payload.payload_json ? JSON.stringify(payload.payload_json) : null,
    status: "pending",
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

      default: {
        throw new Error(`Unknown action type: ${(payload as { action_type: string }).action_type}`);
      }
    }

    ctx.coordinatorStore.markOperatorActionRequestExecuted(requestId, now);
    return { success: true, request_id: requestId, status: "executed" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    ctx.coordinatorStore.db.prepare(
      `update operator_action_requests set status = 'rejected', executed_at = ? where request_id = ?`
    ).run(now, requestId);
    return { success: false, request_id: requestId, status: "rejected", reason };
  }
}
