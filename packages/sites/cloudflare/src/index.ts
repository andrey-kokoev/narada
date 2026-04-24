/**
 * Cloudflare Worker — fetch handler entrypoint
 *
 * Routes incoming requests to the appropriate handler:
 * - POST /cycle  → bounded Cycle invocation (stub → Task 325)
 * - GET  /status → operator status endpoint (Task 327)
 * - All others   → 404
 *
 * This file owns routing, request parsing, and response formatting.
 * It does NOT own Cycle logic, DO implementation, or R2 adapters.
 */

import { invokeCycle, type CycleRequest } from "./cycle-entrypoint.js";
import { resolveSiteCoordinator, type CloudflareEnv } from "./coordinator.js";
import { executeSiteOperatorAction, type SiteOperatorActionPayload } from "./operator-actions.js";
import { runCycle } from "./runner.js";
import type { SiteHealthRecord, CycleTraceRecord } from "./types.js";

export { cloudflareSiteAdapter, CloudflareSiteObservationApi, CloudflareSiteControlClient } from "./console-adapter.js";

const SUBSTRATE = "cloudflare-workers-do-sandbox";

export default {
  async fetch(
    request: Request,
    env: CloudflareEnv,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case "/cycle":
        return handleCycle(request, env);
      case "/status":
        return handleStatus(request, env);
      case "/control/actions":
        return handleOperatorAction(request, env);
      case "/stuck-work-items":
        return handleStuckWorkItems(request, env);
      case "/pending-outbounds":
        return handlePendingOutbounds(request, env);
      case "/pending-drafts":
        return handlePendingDrafts(request, env);
      default:
        return notFound(url.pathname);
    }
  },

  async scheduled(
    event: ScheduledEvent,
    env: CloudflareEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    // v0 single-site: site identity comes from env.SITE_ID or defaults to
    // "default". The cron expression identifies the schedule, not the site.
    // Multi-site requires an explicit site_id → cron mapping in config.
    const siteId = ((env as unknown) as Record<string, unknown>).SITE_ID as string | undefined ?? "default";
    try {
      const result = await runCycle(siteId, env);
      console.log(`Scheduled cycle ${result.cycle_id} (${event.cron}): ${result.status}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Scheduled cycle failed for ${siteId} (${event.cron}): ${message}`);
    }
  },
};

async function handleCycle(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const cycleReq = validateCycleRequest(body);
  if (!cycleReq) {
    return jsonResponse(
      { error: "Missing required field: scope_id" },
      400,
    );
  }

  const result = await invokeCycle(cycleReq, env);
  return jsonResponse(result, result.status === "accepted" ? 202 : 400);
}

async function handleStatus(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET");
  }

  // Authenticate
  const authError = authenticateRequest(request, env);
  if (authError) {
    return authError;
  }

  // Resolve site
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  if (!siteId) {
    return jsonResponse(
      { error: "Missing required query parameter: site_id" },
      400,
    );
  }

  try {
    const coordinator = resolveSiteCoordinator(env, siteId);
    const [health, trace] = await Promise.all([
      coordinator.getHealth(),
      coordinator.getLastCycleTrace(),
    ]);

    if (!health) {
      return jsonResponse(
        { error: `Site not found: ${siteId}` },
        404,
      );
    }

    return jsonResponse(
      buildStatusResponse(siteId, health, trace),
      200,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "Failed to read Site state", detail: message },
      500,
    );
  }
}

/**
 * Authenticate the request via Bearer token.
 *
 * Expected header: `Authorization: Bearer {NARADA_ADMIN_TOKEN}`
 *
 * Returns a Response on failure, undefined on success.
 */
function authenticateRequest(
  request: Request,
  env: CloudflareEnv,
): Response | undefined {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(
      { error: "Missing Authorization header" },
      401,
    );
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return jsonResponse(
      { error: "Invalid Authorization header format. Expected: Bearer <token>" },
      401,
    );
  }

  const token = match[1];
  if (token !== env.NARADA_ADMIN_TOKEN) {
    return jsonResponse(
      { error: "Invalid token" },
      401,
    );
  }

  return undefined;
}

/**
 * Build the canonical status response shape.
 *
 * Does NOT expose secret values, raw message bodies, or evaluation payloads.
 */
function buildStatusResponse(
  siteId: string,
  health: SiteHealthRecord,
  trace: CycleTraceRecord | null,
): unknown {
  const mapHealthStatus = (
    s: SiteHealthRecord["status"],
  ): "healthy" | "degraded" | "unhealthy" => {
    if (s === "healthy") return "healthy";
    if (s === "degraded") return "degraded";
    return "unhealthy";
  };

  return {
    site_id: siteId,
    substrate: SUBSTRATE,
    health: {
      status: mapHealthStatus(health.status),
      last_cycle_at: health.lastCycleAt,
      last_cycle_status: trace?.status ?? null,
      pending_work_items: health.pendingWorkItems,
      locked: health.locked,
      locked_by_cycle_id: health.lockedByCycleId,
    },
    last_cycle: trace
      ? {
          cycle_id: trace.cycleId,
          started_at: trace.startedAt,
          finished_at: trace.finishedAt,
          status: trace.status,
          steps_completed: trace.stepsCompleted,
        }
      : null,
  };
}

function notFound(path: string): Response {
  return jsonResponse({ error: `Not found: ${path}` }, 404);
}

function methodNotAllowed(allowed: string): Response {
  return jsonResponse(
    { error: `Method not allowed. Use ${allowed}.` },
    405,
    { Allow: allowed },
  );
}

function jsonResponse(
  body: unknown,
  status: number,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

async function handleOperatorAction(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST");
  }

  const authError = authenticateRequest(request, env);
  if (authError) {
    return authError;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const actionPayload = validateOperatorActionPayload(body);
  if (!actionPayload) {
    return jsonResponse(
      { error: "Missing or invalid fields: action_type, target_id" },
      400,
    );
  }

  const url = new URL(request.url);
  const scopeId = url.searchParams.get("scope_id");
  if (!scopeId) {
    return jsonResponse(
      { error: "Missing required query parameter: scope_id" },
      400,
    );
  }

  const siteId = url.searchParams.get("site_id") ?? scopeId;

  try {
    const coordinator = resolveSiteCoordinator(env, siteId);
    const result = await executeSiteOperatorAction(
      {
        scope_id: scopeId,
        getWorkItem: async (id) => coordinator.getWorkItem(id),
        updateWorkItemStatus: async (id, status, updates) => coordinator.updateWorkItemStatus(id, status, updates),
        getOutboundCommand: async (id) => coordinator.getOutboundCommand(id),
        updateOutboundCommandStatus: async (id, status) => coordinator.updateOutboundCommandStatus(id, status),
        insertOperatorActionRequest: async (req) => coordinator.insertOperatorActionRequest(req),
        markOperatorActionRequestExecuted: async (id, at) => coordinator.markOperatorActionRequestExecuted(id, at),
        markOperatorActionRequestRejected: async (id, reason, at) => coordinator.markOperatorActionRequestRejected(id, reason, at),
      },
      actionPayload,
    );

    return jsonResponse(result, result.success ? 200 : 422);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "Failed to execute operator action", detail: message },
      500,
    );
  }
}

function validateOperatorActionPayload(body: unknown): SiteOperatorActionPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const obj = body as Record<string, unknown>;
  if (typeof obj.action_type !== "string") return null;
  if (typeof obj.target_id !== "string") return null;

  const validActions = ["approve", "reject", "retry", "cancel"] as const;
  if (!validActions.includes(obj.action_type as typeof validActions[number])) return null;

  return {
    action_type: obj.action_type as SiteOperatorActionPayload["action_type"],
    target_id: obj.target_id,
    payload_json: typeof obj.payload_json === "string" ? obj.payload_json : undefined,
  };
}

async function handleStuckWorkItems(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET");
  }

  const authError = authenticateRequest(request, env);
  if (authError) {
    return authError;
  }

  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  if (!siteId) {
    return jsonResponse(
      { error: "Missing required query parameter: site_id" },
      400,
    );
  }

  try {
    const coordinator = resolveSiteCoordinator(env, siteId);
    const items = await coordinator.getStuckWorkItems();
    return jsonResponse({ stuck_work_items: items }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "Failed to read stuck work items", detail: message },
      500,
    );
  }
}

async function handlePendingOutbounds(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET");
  }

  const authError = authenticateRequest(request, env);
  if (authError) {
    return authError;
  }

  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  if (!siteId) {
    return jsonResponse(
      { error: "Missing required query parameter: site_id" },
      400,
    );
  }

  try {
    const coordinator = resolveSiteCoordinator(env, siteId);
    const commands = await coordinator.getPendingOutboundCommandsForObservation();
    return jsonResponse({ pending_outbound_commands: commands }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "Failed to read pending outbound commands", detail: message },
      500,
    );
  }
}

async function handlePendingDrafts(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET");
  }

  const authError = authenticateRequest(request, env);
  if (authError) {
    return authError;
  }

  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  if (!siteId) {
    return jsonResponse(
      { error: "Missing required query parameter: site_id" },
      400,
    );
  }

  try {
    const coordinator = resolveSiteCoordinator(env, siteId);
    const drafts = await coordinator.getPendingDrafts();
    return jsonResponse({ pending_drafts: drafts }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "Failed to read pending drafts", detail: message },
      500,
    );
  }
}

function validateCycleRequest(body: unknown): CycleRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const obj = body as Record<string, unknown>;
  if (typeof obj.scope_id !== "string") return null;

  return {
    scope_id: obj.scope_id,
    context_id: typeof obj.context_id === "string" ? obj.context_id : undefined,
    correlation_id:
      typeof obj.correlation_id === "string"
        ? obj.correlation_id
        : undefined,
  };
}
