import type { Database } from "better-sqlite3";
import {
  executeOperatorAction,
  SqliteCoordinatorStore,
  SqliteOutboundStore,
  SqliteIntentStore,
  type OperatorActionPayload,
  type OperatorActionResult,
} from "@narada2/control-plane";
import type {
  ConsoleControlRequest,
  ControlRequestResult,
  SiteControlClient,
} from "@narada2/windows-site";
import { siteDbPath, siteConfigPath } from "./path-utils.js";
import type { LinuxSiteMode } from "./types.js";
import { readFileSync } from "node:fs";

/**
 * Maps console action types to canonical OperatorActionType values.
 *
 * Unsupported combinations are passed through and will be rejected by
 * executeOperatorAction's validation.
 */
function mapConsoleActionToOperatorAction(
  request: ConsoleControlRequest
): { ok: true; payload: OperatorActionPayload } | { ok: false; detail: string } {
  const { actionType, targetId, targetKind, payload } = request;

  let operatorActionType: OperatorActionPayload["action_type"];

  if (actionType === "approve" && targetKind === "outbound_command") {
    operatorActionType = "approve_draft_for_send";
  } else if (actionType === "reject" && targetKind === "outbound_command") {
    operatorActionType = "reject_draft";
  } else if (actionType === "retry" && targetKind === "work_item") {
    operatorActionType = "retry_work_item";
  } else if (actionType === "retry" && targetKind === "outbound_command") {
    return {
      ok: false,
      detail:
        "Generic retry for outbound commands is not supported by the Linux Site control surface. " +
        "Use a specific outbound operator action instead of console retry.",
    };
  } else if (actionType === "cancel" && targetKind === "work_item") {
    return {
      ok: false,
      detail:
        "Cancel for work items is not supported by the Linux Site control surface. " +
        "No canonical operator action exists for console cancel.",
    };
  } else if (actionType === "mark_reviewed" && targetKind === "outbound_command") {
    operatorActionType = "mark_reviewed";
  } else if (actionType === "handled_externally" && targetKind === "outbound_command") {
    operatorActionType = "handled_externally";
  } else {
    return {
      ok: false,
      detail: `Unsupported control action combination: ${actionType} on ${targetKind}`,
    };
  }

  return {
    ok: true,
    payload: {
      action_type: operatorActionType,
      target_id: targetId,
      payload_json: payload ? JSON.stringify(payload) : undefined,
    },
  };
}

/**
 * Context needed to execute an operator action against a Linux Site.
 */
export interface LinuxSiteControlContext {
  scope_id: string;
  coordinatorStore: SqliteCoordinatorStore;
  outboundStore: SqliteOutboundStore;
  intentStore: SqliteIntentStore;
  /** Database connection — present when opened by the factory; callers should close it. */
  db?: Database;
}

/**
 * Factory that creates a control context for a given scope.
 *
 * In production this opens the Site's SQLite databases and creates stores.
 * In tests this is mocked.
 */
export type LinuxSiteControlContextFactory = (
  siteId: string,
  scopeId: string
) => Promise<LinuxSiteControlContext>;

/**
 * Resolve the primary scope ID for a Linux Site by reading its config.
 * Falls back to querying the coordinator DB, then to the site ID itself.
 */
function resolvePrimaryScopeId(siteId: string, mode: LinuxSiteMode, db: Database): string {
  const configPath = siteConfigPath(siteId, mode);
  try {
    const configText = readFileSync(configPath, "utf8");
    const config = JSON.parse(configText) as {
      scopes?: Array<{ scope_id?: string }>;
      mailboxes?: Array<{ mailbox_id?: string }>;
    };
    if (config.scopes && config.scopes.length > 0 && config.scopes[0]!.scope_id) {
      return config.scopes[0]!.scope_id;
    }
    if (config.mailboxes && config.mailboxes.length > 0 && config.mailboxes[0]!.mailbox_id) {
      return config.mailboxes[0]!.mailbox_id;
    }
  } catch {
    // Config unreadable or not present — fall through
  }

  // Try to infer from the DB
  try {
    const row = db.prepare(`SELECT scope_id FROM work_items LIMIT 1`).get() as
      | { scope_id: string }
      | undefined;
    if (row) return row.scope_id;
  } catch {
    // Table may not exist yet
  }

  return siteId;
}

/**
 * Create a control client for a Linux Site.
 *
 * Returns `undefined` for unknown sites or non-Linux substrates.
 */
export function createLinuxSiteControlClient(
  siteId: string,
  mode: LinuxSiteMode
): SiteControlClient | undefined {
  const contextFactory: LinuxSiteControlContextFactory = async (_siteId, _scopeId) => {
    const { default: DatabaseCtor } = await import("better-sqlite3");
    const db = new DatabaseCtor(siteDbPath(_siteId, mode)) as Database;

    const coordinatorStore = new SqliteCoordinatorStore({ db });
    const outboundStore = new SqliteOutboundStore({ db });
    const intentStore = new SqliteIntentStore({ db });

    const resolvedScopeId =
      _scopeId === "default" ? resolvePrimaryScopeId(_siteId, mode, db) : _scopeId;

    return {
      scope_id: resolvedScopeId,
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
    };
  };

  return new LinuxSiteControlClient(siteId, contextFactory);
}

/**
 * Site control client for local Linux Sites.
 *
 * Bridges ConsoleControlRequest → OperatorActionPayload → executeOperatorAction.
 *
 * Authority boundary: this client only transforms and delegates. It does not
 * validate governance — executeOperatorAction and the Site's stores enforce that.
 */
export class LinuxSiteControlClient implements SiteControlClient {
  private siteId: string;
  private contextFactory: LinuxSiteControlContextFactory;

  constructor(siteId: string, contextFactory: LinuxSiteControlContextFactory) {
    this.siteId = siteId;
    this.contextFactory = contextFactory;
  }

  async executeControlRequest(request: ConsoleControlRequest): Promise<ControlRequestResult> {
    const scopeId = request.scopeId ?? "default";
    const ctx = await this.contextFactory(this.siteId, scopeId);

    try {
      const mapping = mapConsoleActionToOperatorAction(request);
      if (!mapping.ok) {
        return {
          success: false,
          status: "rejected",
          detail: mapping.detail,
        };
      }

      const operatorResult: OperatorActionResult = await executeOperatorAction(
        {
          scope_id: ctx.scope_id,
          coordinatorStore: ctx.coordinatorStore,
          outboundStore: ctx.outboundStore,
          intentStore: ctx.intentStore,
        },
        mapping.payload
      );

      return {
        success: operatorResult.success,
        status: operatorResult.status === "executed" ? "accepted" : "rejected",
        detail: operatorResult.reason,
      };
    } finally {
      if (ctx.db) {
        ctx.db.close();
      }
    }
  }
}
