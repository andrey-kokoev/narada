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
  buildScopeDispatchSummary,
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
  getEvaluationDetail,
  getDecisionDetail,
  getExecutionDetail,
  getEvaluationsByContextDetail,
  getRecentOperatorActions,
  getOperatorActionsForScope,
  getOperatorActionsForContext,
  getStuckWorkItems,
  getStuckWorkItemSummary,
  getStuckOutboundCommands,
  getStuckOutboundSummary,
  type WorkItemLifecycleSummary,
} from "@narada2/control-plane";
import type { RouteHandler } from "./routes.js";
import type { ObservationApiScope } from "./observation-server.js";
import { OUTBOUND_WORKER_IDS } from "../lib/workers.js";

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
        const scopes = Array.from(scopeApis.values()).map((s) => ({ scope_id: s.scope_id, operation_id: s.scope_id }));
        jsonResponse(res, 200, { scopes });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/operator-actions$`),
      handler: async (_req, res, _params, searchParams) => {
        const limit = parseLimit(searchParams, 50);
        const since = searchParams.get("since") ?? undefined;
        // Best-effort global aggregation: fetch limit rows per scope, then
        // sort and slice globally. A single scope dominating the feed may
        // crowd out others; this is acceptable for an observability surface.
        const allActions = Array.from(scopeApis.values()).flatMap((scope) =>
          getRecentOperatorActions(scope.coordinatorStore, limit, since),
        );
        allActions.sort((a, b) => b.created_at.localeCompare(a.created_at));
        jsonResponse(res, 200, { actions: allActions.slice(0, limit) });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/operator-actions$`),
      handler: async (_req, res, params, searchParams) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        const since = searchParams.get("since") ?? undefined;
        const actions = getOperatorActionsForScope(scope.coordinatorStore, scope.scope_id, limit, since);
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, actions });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/contexts/([^/]+)/operator-actions$`),
      handler: async (_req, res, params, searchParams) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const contextId = decodeURIComponent(params[2]!);
        const limit = parseLimit(searchParams, 50);
        const since = searchParams.get("since") ?? undefined;
        const actions = getOperatorActionsForContext(scope.coordinatorStore, contextId, limit, since);
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, context_id: contextId, actions });
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
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, snapshot });
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
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, overview });
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
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, facts });
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
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, contexts });
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
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, view });
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
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, status_filter: statusFilter ?? "active", items });
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
          scope_id: scope.scope_id, operation_id: scope.scope_id,
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
          scope_id: scope.scope_id, operation_id: scope.scope_id,
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
          scope_id: scope.scope_id, operation_id: scope.scope_id,
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
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, workers });
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
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, events });
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
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, fact_id: factId, timeline });
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
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, context_id: contextId, timeline });
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
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, work_item_id: workItemId, timeline });
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
          scope_id: scope.scope_id, operation_id: scope.scope_id,
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
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, intent_id: intentId, transitions });
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
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, executions });
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
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, executions });
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
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, leases });
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
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, recoveries });
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
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, indicator });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/evaluations/([^/]+)$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const evaluationId = decodeURIComponent(params[2]!);
        const detail = getEvaluationDetail(scope.coordinatorStore, evaluationId);
        if (!detail) {
          jsonResponse(res, 404, { error: "Evaluation not found" });
          return;
        }
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, evaluation: detail });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/decisions/([^/]+)$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const decisionId = decodeURIComponent(params[2]!);
        const detail = getDecisionDetail(scope.coordinatorStore, decisionId);
        if (!detail) {
          jsonResponse(res, 404, { error: "Decision not found" });
          return;
        }
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, decision: detail });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/executions/([^/]+)$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const executionId = decodeURIComponent(params[2]!);
        const detail = getExecutionDetail(scope.coordinatorStore, executionId);
        if (!detail) {
          jsonResponse(res, 404, { error: "Execution not found" });
          return;
        }
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, execution: detail });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/contexts/([^/]+)/evaluations$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const contextId = decodeURIComponent(params[2]!);
        const evaluations = getEvaluationsByContextDetail(scope.coordinatorStore, contextId, scope.scope_id);
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, context_id: contextId, evaluations });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/health$`),
      handler: async (_req, res) => {
        // Liveness + sync health probe (Task 234 / Task 246)
        // Contract: /health checks sync freshness + outbound health only.
        // Worker registration is a /ready concern, not /health.
        try {
          const scopeStatuses = Array.from(scopeApis.entries()).map(([scopeId, scope]) => {
            const summary = buildScopeDispatchSummary(scope.coordinatorStore, scope.outboundStore, scopeId);
            const lastSync = scope.getLastSyncAt?.() ?? null;
            const threshold = scope.syncFreshThresholdMs ?? 24 * 60 * 60 * 1000;
            const syncFresh = lastSync ? Date.now() - lastSync.getTime() < threshold : false;
            return {
              scope_id: scopeId,
              sync_fresh: syncFresh,
              outbound_healthy: summary.readiness.outbound_healthy,
            };
          });

          const allSyncFresh = scopeStatuses.every((s) => s.sync_fresh);
          const allOutboundHealthy = scopeStatuses.every((s) => s.outbound_healthy);
          const syncHealthy = allSyncFresh && allOutboundHealthy;
          const status = syncHealthy ? 200 : 503;

          jsonResponse(res, status, {
            status: syncHealthy ? "ok" : "degraded",
            observation_api: true,
            sync_healthy: syncHealthy,
            scopes: scopeStatuses,
          });
        } catch {
          jsonResponse(res, 503, { status: "error", observation_api: true, sync_healthy: false });
        }
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/stuck-work-items$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const items = getStuckWorkItems(scope.coordinatorStore);
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, items });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/stuck-outbound-commands$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const items = getStuckOutboundCommands(scope.outboundStore);
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, items });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/stuck-work-summary$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const summary = getStuckWorkItemSummary(scope.coordinatorStore);
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, summary });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/scopes/([^/]+)/stuck-outbound-summary$`),
      handler: async (_req, res, params) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }
        const summary = getStuckOutboundSummary(scope.outboundStore);
        jsonResponse(res, 200, { scope_id: scope.scope_id, operation_id: scope.scope_id, summary });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/ready$`),
      handler: async (_req, res) => {
        // Readiness probe: dispatch ready (Task 234 / Task 246)
        // Contract: /ready checks dispatch readiness (sync fresh) + outbound health + worker registration.
        try {
          const scopeStatuses = Array.from(scopeApis.entries()).map(([scopeId, scope]) => {
            const summary = buildScopeDispatchSummary(scope.coordinatorStore, scope.outboundStore, scopeId);
            const lastSync = scope.getLastSyncAt?.() ?? null;
            const threshold = scope.syncFreshThresholdMs ?? 24 * 60 * 60 * 1000;
            const dispatchReady = lastSync ? Date.now() - lastSync.getTime() < threshold : false;
            const workersRegistered = OUTBOUND_WORKER_IDS.every(
              (id) => scope.workerRegistry.getWorker(id) !== undefined,
            );
            return {
              scope_id: scopeId,
              dispatch_ready: dispatchReady,
              outbound_healthy: summary.readiness.outbound_healthy,
              workers_registered: workersRegistered,
            };
          });

          const allDispatchReady = scopeStatuses.every((s) => s.dispatch_ready);
          const allOutboundHealthy = scopeStatuses.every((s) => s.outbound_healthy);
          const allWorkersRegistered = scopeStatuses.every((s) => s.workers_registered);
          const ready = allDispatchReady && allOutboundHealthy && allWorkersRegistered;
          const status = ready ? 200 : 503;

          jsonResponse(res, status, {
            ready,
            dispatch_ready: allDispatchReady,
            scopes: scopeStatuses,
          });
        } catch {
          jsonResponse(res, 503, { ready: false, dispatch_ready: false });
        }
      },
    },
  ];
}
