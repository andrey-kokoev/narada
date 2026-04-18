/**
 * Observation API routes — read-only derived views.
 *
 * Authority boundary (Task 073/074):
 * - This module contains ONLY GET routes.
 * - No write paths. No operator actions.
 * - All data comes from *View store interfaces.
 */

import type { ServerResponse } from "http";
import {
  buildObservationPlaneSnapshot,
  buildOverviewSnapshot,
  getRecentFacts,
  getContextSummaries,
  getActiveWorkItems,
  getRecentFailedWorkItems,
  getWorkItemsAwaitingRetry,
  getIntentSummaries,
  getIntentExecutionSummaries,
  getProcessExecutionSummaries,
  getProcessExecutionDetails,
  getIntentLifecycleTransitions,
  getRecentSessionsAndExecutions,
  getWorkerStatuses,
  getActiveLeases,
  getRecentStaleLeaseRecoveries,
  getQuiescenceIndicator,
  getWorkItemTimeline,
  getContextTimeline,
  getFactTimeline,
  getUnifiedTimeline,
  getMailboxVerticalView,
  getMailExecutionDetails,
  type WorkItemLifecycleSummary,
} from "@narada2/exchange-fs-sync";
import type { RouteHandler } from "./routes.js";
import type { ObservationApiScope } from "./observation-server.js";

export function createObservationRoutes(
  prefix: string,
  scopeApis: Map<string, ObservationApiScope>,
): RouteHandler[] {
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

  function jsonResponse(res: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
  }

  return [
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
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/overview$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const overview = buildOverviewSnapshot(
          scope.coordinatorStore,
          scope.intentStore,
          scope.executionStore,
          scope.factStore,
        );
        jsonResponse(res, 200, { scope_id: scope.scope_id, overview });
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
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/intent-executions$`),
      handler: async (_req, res, params, searchParams) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        const summaries = getIntentExecutionSummaries(scope.intentStore, limit);
        jsonResponse(res, 200, {
          scope_id: scope.scope_id,
          recent: summaries.recent,
          failed_recent: summaries.failed_recent,
          total_count: summaries.total_count,
        });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/intents/([^/]+)/lifecycle$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const intentId = decodeURIComponent(params[2]!);
        const transitions = getIntentLifecycleTransitions(scope.intentStore.db, intentId);
        jsonResponse(res, 200, { scope_id: scope.scope_id, intent_id: intentId, transitions });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/process-executions$`),
      handler: async (_req, res, params, searchParams) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        const executions = getProcessExecutionDetails(scope.executionStore, limit);
        jsonResponse(res, 200, { scope_id: scope.scope_id, executions });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/mail-executions$`),
      handler: async (_req, res, params, searchParams) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        const executions = getMailExecutionDetails(scope.outboundStore, limit);
        jsonResponse(res, 200, { scope_id: scope.scope_id, executions });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/leases$`),
      handler: async (_req, res, params, searchParams) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        const leases = getActiveLeases(scope.coordinatorStore, limit);
        jsonResponse(res, 200, { scope_id: scope.scope_id, leases });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/lease-recoveries$`),
      handler: async (_req, res, params, searchParams) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        const recoveries = getRecentStaleLeaseRecoveries(scope.coordinatorStore, limit);
        jsonResponse(res, 200, { scope_id: scope.scope_id, recoveries });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/quiescence$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const indicator = getQuiescenceIndicator(scope.coordinatorStore);
        jsonResponse(res, 200, { scope_id: scope.scope_id, indicator });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/health$`),
      handler: async (_req, res) => {
        jsonResponse(res, 200, { status: "ok", observation_api: true });
      },
    },
  ];
}
