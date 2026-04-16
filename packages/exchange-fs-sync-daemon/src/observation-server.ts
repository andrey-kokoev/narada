/**
 * Observation API Server
 *
 * HTTP API for UI consumption of the observation plane and safe operator actions.
 *
 * Authority boundary (Task 073):
 * - All GET responses are derived from durable state (read-only).
 * - All write paths are validated, audited, and delegated to operator-actions.ts.
 * - ObservationApiScope exposes only *View / *OperatorView store interfaces.
 *   Future contributors cannot call hidden store mutations from route handlers.
 * - Reconstructible from SQLite stores alone.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildObservationPlaneSnapshot,
  getRecentFacts,
  getContextSummaries,
  getMailboxVerticalView,
  getActiveWorkItems,
  getRecentFailedWorkItems,
  getWorkItemsAwaitingRetry,
  getIntentSummaries,
  getProcessExecutionSummaries,
  getRecentSessionsAndExecutions,
  getWorkerStatuses,
  getWorkItemTimeline,
  getContextTimeline,
  getFactTimeline,
  getUnifiedTimeline,
  type CoordinatorStoreOperatorView,
  type OutboundStoreView,
  type IntentStoreView,
  type ProcessExecutionStoreView,
  type FactStoreView,
  type WorkerRegistryView,
  type WorkItemLifecycleSummary,
} from "@narada/exchange-fs-sync";
import { createLogger } from "./lib/logger.js";
import { executeOperatorAction, type OperatorActionPayload } from "./operator-actions.js";

export interface ObservationServerConfig {
  port: number;
  host?: string;
  /** Optional path prefix (default: empty) */
  pathPrefix?: string;
  verbose?: boolean;
}

export interface ObservationApiScope {
  scope_id: string;
  coordinatorStore: CoordinatorStoreOperatorView;
  outboundStore: OutboundStoreView;
  intentStore: IntentStoreView;
  executionStore: ProcessExecutionStoreView;
  workerRegistry: WorkerRegistryView;
  factStore: FactStoreView;
  /** Optional callback to rebuild filesystem views (scope-specific) */
  rebuildViews?: () => Promise<void>;
  /** Optional callback to trigger a dispatch phase for this scope */
  runDispatchPhase?: () => Promise<void>;
}

export interface ObservationServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getUrl(): string | null;
}

interface RouteHandler {
  method: string;
  pattern: RegExp;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    params: RegExpExecArray,
    searchParams: URLSearchParams,
  ) => Promise<void>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function jsonResponse(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function htmlResponse(res: ServerResponse, body: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

export function createObservationServer(
  config: ObservationServerConfig,
  scopeApis: Map<string, ObservationApiScope>,
): ObservationServer {
  const logger = createLogger({ component: "observation", verbose: config.verbose });
  const host = config.host ?? "127.0.0.1";
  const port = config.port;
  const prefix = config.pathPrefix ?? "";

  let server: Server | null = null;
  let isRunning = false;
  let serverUrl: string | null = null;

  function getScope(scopeId: string): ObservationApiScope | undefined {
    return scopeApis.get(scopeId);
  }

  function parseLimit(searchParams: URLSearchParams, defaultValue = 50, max = 1000): number {
    const raw = searchParams.get("limit");
    if (!raw) return defaultValue;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n) || n < 0) return defaultValue;
    return Math.min(n, max);
  }

  const uiHtml = readFileSync(join(__dirname, "ui", "index.html"), "utf8");

  const routes: RouteHandler[] = [
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/?$`),
      handler: async (_req, res) => {
        htmlResponse(res, uiHtml);
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes$`),
      handler: async (_req, res) => {
        const scopes = Array.from(scopeApis.values()).map((s) => ({ scope_id: s.scope_id }));
        jsonResponse(res, 200, { scopes });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/snapshot$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const snapshot = buildObservationPlaneSnapshot(
          scope.workerRegistry,
          scope.coordinatorStore,
          scope.outboundStore,
          scope.intentStore,
          scope.executionStore,
          scope.scope_id,
        );
        jsonResponse(res, 200, { scope_id: scope.scope_id, snapshot });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/facts$`),
      handler: async (_req, res, params, searchParams) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const limit = parseLimit(searchParams, 100);
        const facts = getRecentFacts(scope.factStore, limit);
        jsonResponse(res, 200, { scope_id: scope.scope_id, facts });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/contexts$`),
      handler: async (_req, res, params, searchParams) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const limit = parseLimit(searchParams, 100);
        const contexts = getContextSummaries(scope.coordinatorStore, limit);
        jsonResponse(res, 200, { scope_id: scope.scope_id, contexts });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/mailbox$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const view = getMailboxVerticalView(scope.coordinatorStore, scope.outboundStore, scope.scope_id);
        jsonResponse(res, 200, { scope_id: scope.scope_id, view });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/work-items$`),
      handler: async (_req, res, params, searchParams) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const statusFilter = searchParams.get("status");
        let items: WorkItemLifecycleSummary[];
        if (statusFilter === "failed") {
          items = getRecentFailedWorkItems(scope.coordinatorStore, parseLimit(searchParams, 50));
        } else if (statusFilter === "awaiting_retry") {
          items = getWorkItemsAwaitingRetry(scope.coordinatorStore);
        } else {
          items = getActiveWorkItems(scope.coordinatorStore, parseLimit(searchParams, 50));
        }
        jsonResponse(res, 200, { scope_id: scope.scope_id, status_filter: statusFilter ?? "active", items });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/intents$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const summaries = getIntentSummaries(scope.intentStore);
        jsonResponse(res, 200, {
          scope_id: scope.scope_id,
          pending: summaries.pending,
          executing: summaries.executing,
          failed_terminal: summaries.failed_terminal,
          total_count: summaries.total_count,
        });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/executions$`),
      handler: async (_req, res, params, searchParams) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        const charterExecutions = getRecentSessionsAndExecutions(scope.coordinatorStore, limit);
        const processExecutions = getProcessExecutionSummaries(scope.executionStore, limit);
        jsonResponse(res, 200, {
          scope_id: scope.scope_id,
          charter_executions: charterExecutions,
          process_executions: {
            active: processExecutions.active,
            recent: processExecutions.recent,
            failed_recent: processExecutions.failed_recent,
            total_count: processExecutions.total_count,
          },
        });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/failures$`),
      handler: async (_req, res, params, searchParams) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        const workItems = getRecentFailedWorkItems(scope.coordinatorStore, limit);
        const processExecutions = getProcessExecutionSummaries(scope.executionStore, limit);
        jsonResponse(res, 200, {
          scope_id: scope.scope_id,
          work_items: workItems,
          process_executions: processExecutions.failed_recent,
        });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/workers$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const workers = getWorkerStatuses(
          scope.workerRegistry,
          scope.coordinatorStore,
          scope.intentStore,
          scope.executionStore,
        );
        jsonResponse(res, 200, { scope_id: scope.scope_id, workers });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/timeline$`),
      handler: async (_req, res, params, searchParams) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const limit = parseLimit(searchParams, 100);
        const events = getUnifiedTimeline(scope.coordinatorStore, scope.factStore, limit);
        jsonResponse(res, 200, { scope_id: scope.scope_id, events });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/facts/([^/]+)/timeline$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const factId = decodeURIComponent(params[2]!);
        const timeline = getFactTimeline(scope.coordinatorStore, scope.factStore, factId);
        jsonResponse(res, 200, { scope_id: scope.scope_id, fact_id: factId, timeline });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/contexts/([^/]+)/timeline$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const contextId = decodeURIComponent(params[2]!);
        const timeline = getContextTimeline(scope.coordinatorStore, contextId);
        jsonResponse(res, 200, { scope_id: scope.scope_id, context_id: contextId, timeline });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/work-items/([^/]+)/timeline$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const workItemId = decodeURIComponent(params[2]!);
        const timeline = getWorkItemTimeline(scope.coordinatorStore, workItemId);
        jsonResponse(res, 200, { scope_id: scope.scope_id, work_item_id: workItemId, timeline });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/health$`),
      handler: async (_req, res) => {
        jsonResponse(res, 200, { status: "ok", observation_api: true });
      },
    },
    {
      method: "POST",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/actions$`),
      handler: async (req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }

        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 65536) {
            jsonResponse(res, 413, { error: "Payload too large" });
            return;
          }
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          jsonResponse(res, 400, { error: "Invalid JSON" });
          return;
        }

        const payload = parsed as OperatorActionPayload;
        if (!payload.action_type || typeof payload.action_type !== "string") {
          jsonResponse(res, 400, { error: "Missing or invalid action_type" });
          return;
        }

        const result = await executeOperatorAction(
          {
            scope_id: scope.scope_id,
            coordinatorStore: scope.coordinatorStore,
            rebuildViews: scope.rebuildViews,
            runDispatchPhase: scope.runDispatchPhase,
          },
          payload,
        );

        if (result.status === "executed") {
          jsonResponse(res, 200, result);
        } else {
          jsonResponse(res, 422, result);
        }
      },
    },
  ];

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const pathname = url.pathname;

      for (const route of routes) {
        const match = route.pattern.exec(pathname);
        if (match && req.method === route.method) {
          await route.handler(req, res, match, url.searchParams);
          return;
        }
      }

      if (req.method !== "GET" && req.method !== "POST") {
        jsonResponse(res, 405, { error: "Method not allowed" });
        return;
      }

      jsonResponse(res, 404, { error: "Not found" });
    } catch (error) {
      logger.error("Observation request error", error instanceof Error ? error : new Error(String(error)));
      if (!res.headersSent) {
        jsonResponse(res, 500, { error: "Internal server error" });
      }
    }
  }

  return {
    async start(): Promise<void> {
      if (server) {
        throw new Error("Observation server already started");
      }
      return new Promise((resolve, reject) => {
        server = createServer((req, res) => {
          handleRequest(req, res).catch((error) => {
            logger.error("Unhandled observation request error", error);
          });
        });

        server.on("error", (error) => {
          logger.error("Observation server error", error);
          reject(error);
        });

        server.listen(port, host, () => {
          isRunning = true;
          const address = server!.address();
          const actualPort = typeof address === "object" && address !== null ? address.port : port;
          serverUrl = `http://${host === "0.0.0.0" ? "localhost" : host}:${actualPort}${prefix}`;
          logger.info("Observation server started", { url: serverUrl, port: actualPort, host });
          resolve();
        });
      });
    },

    async stop(): Promise<void> {
      if (!server) {
        return;
      }
      return new Promise((resolve) => {
        server?.close(() => {
          isRunning = false;
          serverUrl = null;
          server = null;
          logger.info("Observation server stopped");
          resolve();
        });
      });
    },

    isRunning(): boolean {
      return isRunning;
    },

    getUrl(): string | null {
      return serverUrl;
    },
  };
}
