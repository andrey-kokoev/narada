import type { SiteRegistry, RegistryAuditRecord } from "./registry.js";

/**
 * Canonical control request from an operator to the console.
 */
export interface ConsoleControlRequest {
  /** Unique request ID for tracing */
  requestId: string;
  /** Target Site ID */
  siteId: string;
  /** Target scope within the Site (optional for site-level actions) */
  scopeId?: string;
  /** Action type — must match a Site-supported action */
  actionType: "approve" | "reject" | "retry" | "cancel" | "mark_reviewed" | "handled_externally";
  /** Target entity ID within the Site */
  targetId: string;
  /** Kind of target entity */
  targetKind: "work_item" | "outbound_command";
  /** Optional payload for action-specific parameters */
  payload?: Record<string, unknown>;
  /** ISO timestamp of request creation */
  requestedAt: string;
  /** Console operator identity (if authenticated) */
  requestedBy?: string;
}

/**
 * Result of a routed control request.
 */
export interface ControlRequestResult {
  success: boolean;
  status: "accepted" | "rejected" | "error";
  detail?: string;
}

/**
 * Abstraction over a Site's control API.
 *
 * For Windows Sites this is a local function call.
 * For Cloudflare Sites this would be an HTTP client.
 */
export interface SiteControlClient {
  executeControlRequest(request: ConsoleControlRequest): Promise<ControlRequestResult>;
}

/**
 * Factory that resolves a Site registry entry to its control client.
 */
export type SiteControlClientFactory = (siteId: string) => SiteControlClient | undefined;

/**
 * Control request router — the only mutation boundary of the console.
 *
 * Safety rules enforced:
 * - Router may only call known Site control endpoints
 * - Router may not retry failed requests automatically
 * - Router may not cache or assume success
 * - Router must validate that the target Site exists in the registry
 */
export class ControlRequestRouter {
  private registry: SiteRegistry;
  private clientFactory: SiteControlClientFactory;

  constructor(options: {
    registry: SiteRegistry;
    clientFactory: SiteControlClientFactory;
  }) {
    this.registry = options.registry;
    this.clientFactory = options.clientFactory;
  }

  /**
   * Route a control request to its target Site and log the outcome.
   *
   * Does NOT retry. Returns the Site's response verbatim.
   */
  async route(request: ConsoleControlRequest): Promise<ControlRequestResult> {
    // 1. Validate target Site exists in registry
    const site = this.registry.getSite(request.siteId);
    if (!site) {
      const result: ControlRequestResult = {
        success: false,
        status: "error",
        detail: `Site not found: ${request.siteId}`,
      };
      this.audit(request, result);
      return result;
    }

    // 2. Resolve control client
    const client = this.clientFactory(request.siteId);
    if (!client) {
      const result: ControlRequestResult = {
        success: false,
        status: "error",
        detail: `No control client available for site: ${request.siteId}`,
      };
      this.audit(request, result);
      return result;
    }

    // 3. Forward to Site control API (single attempt, no retry)
    let result: ControlRequestResult;
    try {
      result = await client.executeControlRequest(request);
    } catch (err) {
      result = {
        success: false,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    // 4. Log to audit store
    this.audit(request, result);

    return result;
  }

  private audit(request: ConsoleControlRequest, result: ControlRequestResult): void {
    const record: RegistryAuditRecord = {
      requestId: request.requestId,
      siteId: request.siteId,
      actionType: request.actionType,
      targetId: request.targetId,
      routedAt: new Date().toISOString(),
      siteResponseStatus: result.status,
      siteResponseDetail: result.detail ?? null,
    };
    this.registry.logAuditRecord(record);
  }
}
