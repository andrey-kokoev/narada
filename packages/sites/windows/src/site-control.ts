import {
  executeOperatorAction,
  type OperatorActionPayload,
  type OperatorActionResult,
  type SqliteCoordinatorStore,
  type SqliteOutboundStore,
  type SqliteIntentStore,
} from "@narada2/control-plane";
import type {
  ConsoleControlRequest,
  ControlRequestResult,
  SiteControlClient,
} from "./router.js";

/**
 * Maps console action types to canonical OperatorActionType values.
 *
 * Unsupported combinations are passed through and will be rejected by
 * executeOperatorAction's validation.
 */
function mapConsoleActionToOperatorAction(
  request: ConsoleControlRequest
): OperatorActionPayload {
  const { actionType, targetId, targetKind, payload } = request;

  // Map console actionType + targetKind to canonical operator action_type
  let operatorActionType: OperatorActionPayload["action_type"];

  if (actionType === "approve" && targetKind === "outbound_command") {
    operatorActionType = "approve_draft_for_send";
  } else if (actionType === "reject" && targetKind === "outbound_command") {
    operatorActionType = "reject_draft";
  } else if (actionType === "retry" && targetKind === "work_item") {
    operatorActionType = "retry_work_item";
  } else if (actionType === "retry" && targetKind === "outbound_command") {
    operatorActionType = "retry_auth_failed";
  } else if (actionType === "cancel" && targetKind === "work_item") {
    // No direct cancel work_item action; pass through and let Site reject
    operatorActionType = "acknowledge_alert";
  } else if (actionType === "mark_reviewed" && targetKind === "outbound_command") {
    operatorActionType = "mark_reviewed";
  } else if (actionType === "handled_externally" && targetKind === "outbound_command") {
    operatorActionType = "handled_externally";
  } else {
    // Unsupported combination — pass through with console actionType and let Site reject
    // This should not happen in normal use but preserves the "Site validates" boundary
    operatorActionType = actionType as unknown as OperatorActionPayload["action_type"];
  }

  return {
    action_type: operatorActionType,
    target_id: targetId,
    payload_json: payload ? JSON.stringify(payload) : undefined,
  };
}

/**
 * Context needed to execute an operator action against a Windows Site.
 */
export interface WindowsSiteControlContext {
  scope_id: string;
  coordinatorStore: SqliteCoordinatorStore;
  outboundStore: SqliteOutboundStore;
  intentStore: SqliteIntentStore;
}

/**
 * Factory that creates a control context for a given scope.
 *
 * In production this opens the Site's SQLite databases and creates stores.
 * In tests this is mocked.
 */
export type WindowsSiteControlContextFactory = (
  siteId: string,
  scopeId: string
) => Promise<WindowsSiteControlContext>;

/**
 * Site control client for local Windows Sites.
 *
 * Bridges ConsoleControlRequest → OperatorActionPayload → executeOperatorAction.
 *
 * Authority boundary: this client only transforms and delegates. It does not
 * validate governance — executeOperatorAction and the Site's stores enforce that.
 */
export class WindowsSiteControlClient implements SiteControlClient {
  private contextFactory: WindowsSiteControlContextFactory;

  constructor(contextFactory: WindowsSiteControlContextFactory) {
    this.contextFactory = contextFactory;
  }

  async executeControlRequest(request: ConsoleControlRequest): Promise<ControlRequestResult> {
    const scopeId = request.scopeId ?? "default";
    const ctx = await this.contextFactory(request.siteId, scopeId);

    const payload = mapConsoleActionToOperatorAction(request);

    const operatorResult: OperatorActionResult = await executeOperatorAction(
      {
        scope_id: scopeId,
        coordinatorStore: ctx.coordinatorStore,
        outboundStore: ctx.outboundStore,
        intentStore: ctx.intentStore,
      },
      payload
    );

    return {
      success: operatorResult.success,
      status: operatorResult.status === "executed" ? "accepted" : "rejected",
      detail: operatorResult.reason,
    };
  }
}
