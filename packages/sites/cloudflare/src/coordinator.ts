/**
 * NaradaSiteCoordinator — Durable Object that acts as the per-Site
 * coordination point.
 */

import type { SiteHealthRecord, CycleTraceRecord, RecoveryTraceRecord, FactRecord, SiteOperatorActionRequest, ExecutionAttemptRecord } from "./types.js";
import type { NotificationRateLimiter } from "./notification.js";

export interface CloudflareEnv {
  NARADA_SITE_COORDINATOR: DurableObjectNamespace;
  NARADA_ADMIN_TOKEN: string;
  GRAPH_ACCESS_TOKEN?: string;
  GRAPH_TENANT_ID?: string;
  GRAPH_CLIENT_ID?: string;
  GRAPH_CLIENT_SECRET?: string;
}

export interface SiteCoordinator {
  getHealth(): Promise<SiteHealthRecord>;
  getLastCycleTrace(): Promise<CycleTraceRecord | null>;

  // Operator mutation surface (Task 355)
  getWorkItem(workItemId: string): Promise<{ workItemId: string; contextId: string; scopeId: string; status: string; errorMessage: string | null; createdAt: string; updatedAt: string } | null>;
  updateWorkItemStatus(workItemId: string, status: string, updates?: { errorMessage?: string | null; updatedAt?: string }): Promise<void>;
  getOutboundCommand(outboundId: string): Promise<{ outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; createdAt: string } | null>;
  updateOutboundCommandStatus(outboundId: string, status: string): Promise<void>;
  insertOperatorActionRequest(request: import("./types.js").SiteOperatorActionRequest): Promise<void>;
  getOperatorActionRequest(requestId: string): Promise<import("./types.js").SiteOperatorActionRequest | null>;
  getPendingOperatorActionRequests(scopeId?: string): Promise<import("./types.js").SiteOperatorActionRequest[]>;
  markOperatorActionRequestExecuted(requestId: string, executedAt?: string): Promise<void>;
  markOperatorActionRequestRejected(requestId: string, reason: string, rejectedAt?: string): Promise<void>;
  getStuckWorkItems(): Promise<{ workItemId: string; scopeId: string; status: string; contextId: string; lastUpdatedAt: string; summary: string }[]>;
  getPendingOutboundCommandsForObservation(): Promise<{ outboundId: string; scopeId: string; contextId: string; actionType: string; status: string; createdAt: string; summary: string }[]>;
  getPendingDrafts(): Promise<{ draftId: string; scopeId: string; contextId: string; status: string; createdAt: string; summary: string }[]>;
}

/**
 * Extended coordinator interface used by the Cycle runner.
 * The concrete Durable Object implements this contract.
 */
export interface CycleCoordinator extends NotificationRateLimiter {
  acquireLock(cycleId: string, ttlMs: number): { acquired: boolean; previousCycleId?: string; recovered?: boolean; stuckDurationMs?: number };
  releaseLock(cycleId: string): void;
  getHealth(): SiteHealthRecord;
  setHealth(health: SiteHealthRecord): void;
  getLastCycleTrace(): CycleTraceRecord | null;
  setLastCycleTrace(trace: CycleTraceRecord): void;
  recordRecoveryTrace(trace: RecoveryTraceRecord): void;
  getLastRecoveryTrace(): RecoveryTraceRecord | null;

  // Fact / cursor / apply-log surfaces (Task 346)
  insertFact(fact: Omit<FactRecord, "createdAt">): void;
  getFactById(factId: string): FactRecord | null;
  getFactCount(): number;
  getUnadmittedFacts(): FactRecord[];
  markFactAdmitted(factId: string): void;
  isEventApplied(eventId: string): boolean;
  markEventApplied(eventId: string): void;
  getAppliedEventCount(): number;
  setCursor(sourceId: string, cursorValue: string): void;
  getCursor(sourceId: string): string | null;

  // Governance surfaces (Task 347)
  insertContextRecord(contextId: string, scopeId: string, primaryCharter: string): void;
  insertWorkItem(workItemId: string, contextId: string, scopeId: string, status: string): void;
  getOpenWorkItems(): { workItemId: string; contextId: string; scopeId: string; status: string }[];
  insertEvaluation(evaluationId: string, workItemId: string, scopeId: string, charterId: string, outcome: string, summary: string): void;
  getPendingEvaluations(): { evaluationId: string; workItemId: string; scopeId: string; charterId: string; outcome: string; summary: string }[];
  insertDecision(decisionId: string, evaluationId: string, contextId: string, scopeId: string, approvedAction: string, outboundId: string | null): void;
  insertOutboundCommand(outboundId: string, contextId: string, scopeId: string, actionType: string, status: string, payloadJson?: string | null, internetMessageId?: string | null): void;
  getContextRecordCount(): number;
  getWorkItemCount(): number;
  getEvaluationCount(): number;
  getDecisionCount(): number;
  getOutboundCommandCount(): number;

  // Confirmation / reconciliation surfaces (Task 348)
  getPendingOutboundCommands(): { outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; payloadJson: string | null; internetMessageId: string | null }[];
  getSubmittedOutboundCommands(): { outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; payloadJson: string | null; internetMessageId: string | null }[];
  updateOutboundCommandStatus(outboundId: string, status: string): void;
  insertFixtureObservation(observationId: string, outboundId: string, scopeId: string, observedStatus: string, observedAt: string): void;
  getFixtureObservations(): { observationId: string; outboundId: string; scopeId: string; observedStatus: string; observedAt: string }[];

  // Effect worker surfaces (Task 359)
  getApprovedOutboundCommands(): { outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; payloadJson: string | null; internetMessageId: string | null }[];
  getExecutionAttemptsForOutbound(outboundId: string): ExecutionAttemptRecord[];
  getLatestExecutionAttempt(outboundId: string): ExecutionAttemptRecord | null;
  countRetryableAttempts(outboundId: string): number;
  insertExecutionAttempt(attempt: Omit<ExecutionAttemptRecord, "finishedAt">): void;
  updateExecutionAttemptStatus(executionAttemptId: string, status: string, updates?: { errorCode?: string | null; errorMessage?: string | null; responseJson?: string | null; finishedAt?: string }): void;
}

export function resolveSiteCoordinator(
  env: CloudflareEnv,
  siteId: string,
): SiteCoordinator {
  const id = env.NARADA_SITE_COORDINATOR.idFromName(siteId);
  const stub = env.NARADA_SITE_COORDINATOR.get(id);
  return stub as unknown as SiteCoordinator;
}

export class NaradaSiteCoordinator {
  private sql: SqlStorage;

  constructor(state: DurableObjectState) {
    this.sql = state.storage.sql;
    this.initSchema();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        case "/status": {
          if (request.method !== "GET") {
            return jsonResponse({ error: "Method not allowed. Use GET." }, 405, { Allow: "GET" });
          }
          const health = this.getHealth();
          const trace = this.getLastCycleTrace();
          return jsonResponse({ health, trace }, 200);
        }

        case "/control/actions": {
          if (request.method !== "POST") {
            return jsonResponse({ error: "Method not allowed. Use POST." }, 405, { Allow: "POST" });
          }
          const actionBody = await request.json() as Record<string, unknown>;
          const scopeId = url.searchParams.get("scope_id") ?? "default";

          const validActions = ["approve", "reject", "retry", "cancel"] as const;
          const actionType = String(actionBody.action_type ?? "");
          if (!validActions.includes(actionType as typeof validActions[number])) {
            return jsonResponse({ error: "Invalid action_type. Must be one of: approve, reject, retry, cancel" }, 422);
          }
          if (typeof actionBody.target_id !== "string" || actionBody.target_id === "") {
            return jsonResponse({ error: "Missing or invalid target_id" }, 422);
          }

          const { executeSiteOperatorAction } = await import("./operator-actions.js");
          const result = await executeSiteOperatorAction(
            {
              scope_id: scopeId,
              getWorkItem: async (id) => this.getWorkItem(id),
              updateWorkItemStatus: async (id, status, updates) => { this.updateWorkItemStatus(id, status, updates); },
              getOutboundCommand: async (id) => this.getOutboundCommand(id),
              updateOutboundCommandStatus: async (id, status) => { this.updateOutboundCommandStatus(id, status); },
              insertOperatorActionRequest: async (req) => { this.insertOperatorActionRequest(req); },
              markOperatorActionRequestExecuted: async (id, at) => { this.markOperatorActionRequestExecuted(id, at); },
              markOperatorActionRequestRejected: async (id, reason, at) => { this.markOperatorActionRequestRejected(id, reason, at); },
            },
            {
              action_type: actionType as import("./types.js").SiteOperatorActionType,
              target_id: actionBody.target_id,
              payload_json: typeof actionBody.payload_json === "string" ? actionBody.payload_json : undefined,
            },
          );
          return jsonResponse(result, result.success ? 200 : 422);
        }

        case "/cycle": {
          if (request.method !== "POST") {
            return jsonResponse({ error: "Method not allowed. Use POST." }, 405, { Allow: "POST" });
          }
          const cycleBody = await request.json() as Record<string, unknown>;
          const siteId = String(cycleBody.scope_id ?? "default");
          const { runCycleOnCoordinator } = await import("./runner.js");
          const result = await runCycleOnCoordinator(siteId, this as unknown as import("./coordinator.js").CycleCoordinator, {} as CloudflareEnv);
          return jsonResponse(result, result.status === "complete" ? 200 : 500);
        }

        case "/stuck-work-items": {
          if (request.method !== "GET") {
            return jsonResponse({ error: "Method not allowed. Use GET." }, 405, { Allow: "GET" });
          }
          const stuck = this.getStuckWorkItems();
          return jsonResponse({ stuck_work_items: stuck }, 200);
        }

        case "/pending-outbounds": {
          if (request.method !== "GET") {
            return jsonResponse({ error: "Method not allowed. Use GET." }, 405, { Allow: "GET" });
          }
          const pending = this.getPendingOutboundCommandsForObservation();
          return jsonResponse({ pending_outbound_commands: pending }, 200);
        }

        case "/pending-drafts": {
          if (request.method !== "GET") {
            return jsonResponse({ error: "Method not allowed. Use GET." }, 405, { Allow: "GET" });
          }
          const drafts = this.getPendingDrafts();
          return jsonResponse({ pending_drafts: drafts }, 200);
        }

        default:
          return jsonResponse({ error: `Not found: ${url.pathname}` }, 404);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonResponse({ error: "DO fetch failed", detail: message }, 500);
    }
  }

  private initSchema(): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS site_locks (lock_id TEXT PRIMARY KEY, cycle_id TEXT NOT NULL, acquired_at TEXT NOT NULL, expires_at TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS site_health (site_id TEXT PRIMARY KEY, status TEXT NOT NULL, last_cycle_at TEXT, last_cycle_duration_ms INTEGER, consecutive_failures INTEGER NOT NULL DEFAULT 0, pending_work_items INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0, locked_by_cycle_id TEXT, message TEXT, updated_at TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS cycle_traces (cycle_id TEXT PRIMARY KEY, site_id TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, steps_completed TEXT NOT NULL, step_results TEXT, error TEXT, trace_key TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS cycle_recovery_traces (cycle_id TEXT PRIMARY KEY, previous_cycle_id TEXT NOT NULL, lock_ttl_ms INTEGER NOT NULL, stuck_duration_ms INTEGER NOT NULL, recovered_at TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS context_records (context_id TEXT PRIMARY KEY, scope_id TEXT NOT NULL, primary_charter TEXT NOT NULL, secondary_charters_json TEXT NOT NULL DEFAULT '[]', latest_revision_ordinal INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS work_items (work_item_id TEXT PRIMARY KEY, context_id TEXT NOT NULL, scope_id TEXT NOT NULL, status TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, leased_at TEXT, lease_expires_at TEXT, error_message TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS evaluations (evaluation_id TEXT PRIMARY KEY, work_item_id TEXT NOT NULL, scope_id TEXT NOT NULL, charter_id TEXT NOT NULL, outcome TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS decisions (decision_id TEXT PRIMARY KEY, evaluation_id TEXT, context_id TEXT NOT NULL, scope_id TEXT NOT NULL, approved_action TEXT NOT NULL, outbound_id TEXT, created_at TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS outbound_commands (outbound_id TEXT PRIMARY KEY, context_id TEXT NOT NULL, scope_id TEXT NOT NULL, action_type TEXT NOT NULL, status TEXT NOT NULL, payload_json TEXT, internet_message_id TEXT, created_at TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS fixture_observations (observation_id TEXT PRIMARY KEY, outbound_id TEXT NOT NULL, scope_id TEXT NOT NULL, observed_status TEXT NOT NULL, observed_at TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS notification_cooldowns (site_id TEXT NOT NULL, scope_id TEXT NOT NULL, channel TEXT NOT NULL, health_status TEXT NOT NULL, sent_at TEXT NOT NULL, PRIMARY KEY (site_id, scope_id, channel, health_status))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS operator_action_requests (request_id TEXT PRIMARY KEY, scope_id TEXT NOT NULL, action_type TEXT NOT NULL, target_id TEXT NOT NULL, target_kind TEXT NOT NULL, payload_json TEXT, status TEXT NOT NULL DEFAULT 'pending', requested_by TEXT NOT NULL DEFAULT 'operator', requested_at TEXT NOT NULL DEFAULT (datetime('now')), executed_at TEXT, rejected_at TEXT, rejection_reason TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS execution_attempts (execution_attempt_id TEXT PRIMARY KEY, outbound_id TEXT NOT NULL, action_type TEXT NOT NULL, attempted_at TEXT NOT NULL, status TEXT NOT NULL, error_code TEXT, error_message TEXT, response_json TEXT, external_ref TEXT, worker_id TEXT, lease_expires_at TEXT, finished_at TEXT)`);

    // Task 346: source cursor, apply-log, facts
    this.sql.exec(`CREATE TABLE IF NOT EXISTS source_cursors (source_id TEXT PRIMARY KEY, cursor_value TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS apply_log (event_id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS facts (fact_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, fact_type TEXT NOT NULL, payload_json TEXT NOT NULL, observed_at TEXT NOT NULL, admitted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`);
  }

  acquireLock(cycleId: string, ttlMs: number): { acquired: boolean; previousCycleId?: string; recovered?: boolean; stuckDurationMs?: number } {
    const now = Date.now();
    const expiresAt = now + ttlMs;
    const nowIso = new Date(now).toISOString();
    const expiresIso = new Date(expiresAt).toISOString();

    // Check existing lock first (before deleting) so we can distinguish
    // active contention from stale recovery.
    const cursor = this.sql.exec<{ cycle_id: string; acquired_at: string; expires_at: string }>(
      `SELECT cycle_id, acquired_at, expires_at FROM site_locks WHERE lock_id = 'site_lock' LIMIT 1`
    );
    const existing = cursor.one();

    if (existing) {
      if (existing.cycle_id === cycleId) {
        // Same cycle renewing its lease
        this.sql.exec(`UPDATE site_locks SET expires_at = ? WHERE lock_id = 'site_lock'`, expiresIso);
        return { acquired: true };
      }

      const expiresTime = new Date(existing.expires_at).getTime();
      if (expiresTime > now) {
        // Active unexpired lock held by another cycle
        return { acquired: false, previousCycleId: existing.cycle_id };
      }

      // Expired lock — recover by stealing
      const stuckDurationMs = now - new Date(existing.acquired_at).getTime();
      this.sql.exec(`DELETE FROM site_locks WHERE lock_id = 'site_lock'`);
      this.sql.exec(
        `INSERT INTO site_locks (lock_id, cycle_id, acquired_at, expires_at) VALUES ('site_lock', ?, ?, ?)`,
        cycleId, nowIso, expiresIso
      );
      return { acquired: true, previousCycleId: existing.cycle_id, recovered: true, stuckDurationMs };
    }

    // No existing lock
    this.sql.exec(
      `INSERT INTO site_locks (lock_id, cycle_id, acquired_at, expires_at) VALUES ('site_lock', ?, ?, ?)`,
      cycleId, nowIso, expiresIso
    );
    return { acquired: true };
  }

  releaseLock(cycleId: string): void {
    this.sql.exec(`DELETE FROM site_locks WHERE lock_id = 'site_lock' AND cycle_id = ?`, cycleId);
  }

  getHealth(): SiteHealthRecord {
    const cursor = this.sql.exec<{ status: string; last_cycle_at: string | null; last_cycle_duration_ms: number | null; consecutive_failures: number; pending_work_items: number; locked: number; locked_by_cycle_id: string | null; message: string | null; updated_at: string }>(
      `SELECT status, last_cycle_at, last_cycle_duration_ms, consecutive_failures, pending_work_items, locked, locked_by_cycle_id, message, updated_at FROM site_health LIMIT 1`
    );
    const row = cursor.one();
    if (!row) {
      return { status: "unknown", lastCycleAt: null, lastCycleDurationMs: null, consecutiveFailures: 0, pendingWorkItems: 0, locked: false, lockedByCycleId: null, message: null, updatedAt: new Date(0).toISOString() };
    }
    return { status: row.status as SiteHealthRecord["status"], lastCycleAt: row.last_cycle_at, lastCycleDurationMs: row.last_cycle_duration_ms, consecutiveFailures: row.consecutive_failures, pendingWorkItems: row.pending_work_items, locked: Boolean(row.locked), lockedByCycleId: row.locked_by_cycle_id, message: row.message, updatedAt: row.updated_at };
  }

  setHealth(health: SiteHealthRecord): void {
    this.sql.exec(
      `INSERT OR REPLACE INTO site_health (site_id, status, last_cycle_at, last_cycle_duration_ms, consecutive_failures, pending_work_items, locked, locked_by_cycle_id, message, updated_at) VALUES ('site', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      health.status, health.lastCycleAt, health.lastCycleDurationMs, health.consecutiveFailures, health.pendingWorkItems, health.locked ? 1 : 0, health.lockedByCycleId, health.message, health.updatedAt
    );
  }

  getLastCycleTrace(): CycleTraceRecord | null {
    const cursor = this.sql.exec<{ cycle_id: string; started_at: string; finished_at: string | null; status: string; steps_completed: string; step_results: string | null; error: string | null; trace_key: string }>(
      `SELECT cycle_id, started_at, finished_at, status, steps_completed, step_results, error, trace_key FROM cycle_traces ORDER BY started_at DESC LIMIT 1`
    );
    const row = cursor.one();
    if (!row) return null;
    return {
      cycleId: row.cycle_id,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      status: row.status,
      stepsCompleted: JSON.parse(row.steps_completed) as number[],
      stepResults: row.step_results ? JSON.parse(row.step_results) as CycleTraceRecord["stepResults"] : undefined,
      error: row.error,
      traceKey: row.trace_key,
    };
  }

  setLastCycleTrace(trace: CycleTraceRecord): void {
    this.sql.exec(
      `INSERT OR REPLACE INTO cycle_traces (cycle_id, site_id, started_at, finished_at, status, steps_completed, step_results, error, trace_key) VALUES (?, 'site', ?, ?, ?, ?, ?, ?, ?)`,
      trace.cycleId, trace.startedAt, trace.finishedAt, trace.status, JSON.stringify(trace.stepsCompleted), trace.stepResults ? JSON.stringify(trace.stepResults) : null, trace.error, trace.traceKey
    );
  }

  recordRecoveryTrace(trace: RecoveryTraceRecord): void {
    this.sql.exec(
      `INSERT OR REPLACE INTO cycle_recovery_traces (cycle_id, previous_cycle_id, lock_ttl_ms, stuck_duration_ms, recovered_at) VALUES (?, ?, ?, ?, ?)`,
      trace.cycleId, trace.previousCycleId, trace.lockTtlMs, trace.stuckDurationMs, trace.recoveredAt
    );
  }

  getLastRecoveryTrace(): RecoveryTraceRecord | null {
    const cursor = this.sql.exec<{ cycle_id: string; previous_cycle_id: string; lock_ttl_ms: number; stuck_duration_ms: number; recovered_at: string }>(
      `SELECT cycle_id, previous_cycle_id, lock_ttl_ms, stuck_duration_ms, recovered_at FROM cycle_recovery_traces ORDER BY recovered_at DESC LIMIT 1`
    );
    const row = cursor.one();
    if (!row) return null;
    return {
      cycleId: row.cycle_id,
      previousCycleId: row.previous_cycle_id,
      lockTtlMs: row.lock_ttl_ms,
      stuckDurationMs: row.stuck_duration_ms,
      recoveredAt: row.recovered_at,
    };
  }

  // ---------------------------------------------------------------------------
  // Fact / cursor / apply-log surfaces (Task 346)
  // ---------------------------------------------------------------------------

  insertFact(fact: Omit<FactRecord, "createdAt">): void {
    const now = new Date().toISOString();
    this.sql.exec(
      `INSERT OR IGNORE INTO facts (fact_id, source_id, fact_type, payload_json, observed_at, admitted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      fact.factId, fact.sourceId, fact.factType, fact.payloadJson, fact.observedAt, fact.admitted ? 1 : 0, now
    );
  }

  getFactById(factId: string): FactRecord | null {
    const cursor = this.sql.exec<{ fact_id: string; source_id: string; fact_type: string; payload_json: string; observed_at: string; admitted: number; created_at: string }>(
      `SELECT fact_id, source_id, fact_type, payload_json, observed_at, admitted, created_at FROM facts WHERE fact_id = ? LIMIT 1`,
      factId
    );
    const row = cursor.one();
    if (!row) return null;
    return {
      factId: row.fact_id,
      sourceId: row.source_id,
      factType: row.fact_type,
      payloadJson: row.payload_json,
      observedAt: row.observed_at,
      admitted: Boolean(row.admitted),
      createdAt: row.created_at,
    };
  }

  getFactCount(): number {
    const cursor = this.sql.exec<{ count: number }>(`SELECT COUNT(*) as count FROM facts`);
    return cursor.one()?.count ?? 0;
  }

  isEventApplied(eventId: string): boolean {
    const cursor = this.sql.exec<{ count: number }>(
      `SELECT COUNT(*) as count FROM apply_log WHERE event_id = ?`,
      eventId
    );
    return (cursor.one()?.count ?? 0) > 0;
  }

  markEventApplied(eventId: string): void {
    const now = new Date().toISOString();
    this.sql.exec(
      `INSERT OR IGNORE INTO apply_log (event_id, applied_at) VALUES (?, ?)`,
      eventId, now
    );
  }

  getAppliedEventCount(): number {
    const cursor = this.sql.exec<{ count: number }>(`SELECT COUNT(*) as count FROM apply_log`);
    return cursor.one()?.count ?? 0;
  }

  setCursor(sourceId: string, cursorValue: string): void {
    const now = new Date().toISOString();
    this.sql.exec(
      `INSERT OR REPLACE INTO source_cursors (source_id, cursor_value, updated_at) VALUES (?, ?, ?)`,
      sourceId, cursorValue, now
    );
  }

  getCursor(sourceId: string): string | null {
    const cursor = this.sql.exec<{ cursor_value: string }>(
      `SELECT cursor_value FROM source_cursors WHERE source_id = ? LIMIT 1`,
      sourceId
    );
    return cursor.one()?.cursor_value ?? null;
  }

  getUnadmittedFacts(): FactRecord[] {
    const cursor = this.sql.exec<{ fact_id: string; source_id: string; fact_type: string; payload_json: string; observed_at: string; admitted: number; created_at: string }>(
      `SELECT fact_id, source_id, fact_type, payload_json, observed_at, admitted, created_at FROM facts WHERE admitted = 0 ORDER BY created_at ASC`
    );
    const results: FactRecord[] = [];
    for (const row of cursor) {
      results.push({
        factId: row.fact_id,
        sourceId: row.source_id,
        factType: row.fact_type,
        payloadJson: row.payload_json,
        observedAt: row.observed_at,
        admitted: Boolean(row.admitted),
        createdAt: row.created_at,
      });
    }
    return results;
  }

  markFactAdmitted(factId: string): void {
    this.sql.exec(
      `UPDATE facts SET admitted = 1 WHERE fact_id = ?`,
      factId
    );
  }

  // ---------------------------------------------------------------------------
  // Governance surfaces (Task 347)
  // ---------------------------------------------------------------------------

  insertContextRecord(contextId: string, scopeId: string, primaryCharter: string): void {
    const now = new Date().toISOString();
    this.sql.exec(`INSERT OR IGNORE INTO context_records (context_id, scope_id, primary_charter, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, contextId, scopeId, primaryCharter, now, now);
  }

  insertWorkItem(workItemId: string, contextId: string, scopeId: string, status: string): void {
    const now = new Date().toISOString();
    this.sql.exec(`INSERT OR IGNORE INTO work_items (work_item_id, context_id, scope_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, workItemId, contextId, scopeId, status, now, now);
  }

  getOpenWorkItems(): { workItemId: string; contextId: string; scopeId: string; status: string }[] {
    const cursor = this.sql.exec<{ work_item_id: string; context_id: string; scope_id: string; status: string }>(
      `SELECT work_item_id, context_id, scope_id, status FROM work_items w WHERE status = 'opened' AND NOT EXISTS (SELECT 1 FROM evaluations e WHERE e.work_item_id = w.work_item_id) ORDER BY created_at ASC`
    );
    const results: { workItemId: string; contextId: string; scopeId: string; status: string }[] = [];
    for (const row of cursor) {
      results.push({ workItemId: row.work_item_id, contextId: row.context_id, scopeId: row.scope_id, status: row.status });
    }
    return results;
  }

  insertEvaluation(evaluationId: string, workItemId: string, scopeId: string, charterId: string, outcome: string, summary: string): void {
    const now = new Date().toISOString();
    this.sql.exec(`INSERT OR IGNORE INTO evaluations (evaluation_id, work_item_id, scope_id, charter_id, outcome, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, evaluationId, workItemId, scopeId, charterId, outcome, summary, now);
  }

  getPendingEvaluations(): { evaluationId: string; workItemId: string; scopeId: string; charterId: string; outcome: string; summary: string }[] {
    const cursor = this.sql.exec<{ evaluation_id: string; work_item_id: string; scope_id: string; charter_id: string; outcome: string; summary: string }>(
      `SELECT e.evaluation_id, e.work_item_id, e.scope_id, e.charter_id, e.outcome, e.summary FROM evaluations e LEFT JOIN decisions d ON d.evaluation_id = e.evaluation_id WHERE d.decision_id IS NULL ORDER BY e.created_at ASC`
    );
    const results: { evaluationId: string; workItemId: string; scopeId: string; charterId: string; outcome: string; summary: string }[] = [];
    for (const row of cursor) {
      results.push({ evaluationId: row.evaluation_id, workItemId: row.work_item_id, scopeId: row.scope_id, charterId: row.charter_id, outcome: row.outcome, summary: row.summary });
    }
    return results;
  }

  insertDecision(decisionId: string, evaluationId: string, contextId: string, scopeId: string, approvedAction: string, outboundId: string | null): void {
    const now = new Date().toISOString();
    this.sql.exec(`INSERT OR IGNORE INTO decisions (decision_id, evaluation_id, context_id, scope_id, approved_action, outbound_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, decisionId, evaluationId, contextId, scopeId, approvedAction, outboundId, now);
  }

  insertOutboundCommand(outboundId: string, contextId: string, scopeId: string, actionType: string, status: string, payloadJson?: string | null, internetMessageId?: string | null): void {
    const now = new Date().toISOString();
    this.sql.exec(`INSERT OR IGNORE INTO outbound_commands (outbound_id, context_id, scope_id, action_type, status, payload_json, internet_message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, outboundId, contextId, scopeId, actionType, status, payloadJson ?? null, internetMessageId ?? null, now);
  }

  getContextRecordCount(): number {
    const cursor = this.sql.exec<{ count: number }>(`SELECT COUNT(*) as count FROM context_records`);
    return cursor.one()?.count ?? 0;
  }

  getWorkItemCount(): number {
    const cursor = this.sql.exec<{ count: number }>(`SELECT COUNT(*) as count FROM work_items`);
    return cursor.one()?.count ?? 0;
  }

  getEvaluationCount(): number {
    const cursor = this.sql.exec<{ count: number }>(`SELECT COUNT(*) as count FROM evaluations`);
    return cursor.one()?.count ?? 0;
  }

  getDecisionCount(): number {
    const cursor = this.sql.exec<{ count: number }>(`SELECT COUNT(*) as count FROM decisions`);
    return cursor.one()?.count ?? 0;
  }

  getOutboundCommandCount(): number {
    const cursor = this.sql.exec<{ count: number }>(`SELECT COUNT(*) as count FROM outbound_commands`);
    return cursor.one()?.count ?? 0;
  }

  getPendingOutboundCommands(): { outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; payloadJson: string | null; internetMessageId: string | null }[] {
    const cursor = this.sql.exec<{ outbound_id: string; context_id: string; scope_id: string; action_type: string; status: string; payload_json: string | null; internet_message_id: string | null }>(
      `SELECT outbound_id, context_id, scope_id, action_type, status, payload_json, internet_message_id FROM outbound_commands WHERE status = 'pending' ORDER BY created_at ASC`
    );
    const results: { outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; payloadJson: string | null; internetMessageId: string | null }[] = [];
    for (const row of cursor) {
      results.push({ outboundId: row.outbound_id, contextId: row.context_id, scopeId: row.scope_id, actionType: row.action_type, status: row.status, payloadJson: row.payload_json, internetMessageId: row.internet_message_id });
    }
    return results;
  }

  getSubmittedOutboundCommands(): { outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; payloadJson: string | null; internetMessageId: string | null }[] {
    const cursor = this.sql.exec<{ outbound_id: string; context_id: string; scope_id: string; action_type: string; status: string; payload_json: string | null; internet_message_id: string | null }>(
      `SELECT outbound_id, context_id, scope_id, action_type, status, payload_json, internet_message_id FROM outbound_commands WHERE status = 'submitted' ORDER BY created_at ASC`
    );
    const results: { outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; payloadJson: string | null; internetMessageId: string | null }[] = [];
    for (const row of cursor) {
      results.push({ outboundId: row.outbound_id, contextId: row.context_id, scopeId: row.scope_id, actionType: row.action_type, status: row.status, payloadJson: row.payload_json, internetMessageId: row.internet_message_id });
    }
    return results;
  }

  updateOutboundCommandStatus(outboundId: string, status: string): void {
    this.sql.exec(`UPDATE outbound_commands SET status = ? WHERE outbound_id = ?`, status, outboundId);
  }

  getStuckWorkItems(): { workItemId: string; scopeId: string; status: string; contextId: string; lastUpdatedAt: string; summary: string }[] {
    const cursor = this.sql.exec<{ work_item_id: string; scope_id: string; status: string; context_id: string; updated_at: string; error_message: string | null; priority: number }>(
      `SELECT work_item_id, scope_id, status, context_id, updated_at, error_message, priority FROM work_items WHERE status IN ('failed_retryable', 'leased', 'executing') AND ((status = 'leased' AND updated_at < datetime('now', '-120 minutes')) OR (status = 'executing' AND updated_at < datetime('now', '-30 minutes')) OR (status = 'failed_retryable')) ORDER BY priority DESC, updated_at ASC`
    );
    const results: { workItemId: string; scopeId: string; status: string; contextId: string; lastUpdatedAt: string; summary: string }[] = [];
    for (const row of cursor) {
      results.push({
        workItemId: row.work_item_id,
        scopeId: row.scope_id,
        status: row.status,
        contextId: row.context_id,
        lastUpdatedAt: row.updated_at,
        summary: row.error_message ?? row.status,
      });
    }
    return results;
  }

  getPendingOutboundCommandsForObservation(): { outboundId: string; scopeId: string; contextId: string; actionType: string; status: string; createdAt: string; summary: string }[] {
    const cursor = this.sql.exec<{ outbound_id: string; scope_id: string; context_id: string; action_type: string; status: string; created_at: string }>(
      `SELECT outbound_id, scope_id, context_id, action_type, status, created_at FROM outbound_commands WHERE status IN ('pending', 'draft_creating', 'sending') AND ((status = 'pending' AND created_at < datetime('now', '-15 minutes')) OR (status = 'draft_creating' AND created_at < datetime('now', '-10 minutes')) OR (status = 'sending' AND created_at < datetime('now', '-5 minutes'))) ORDER BY created_at ASC`
    );
    const results: { outboundId: string; scopeId: string; contextId: string; actionType: string; status: string; createdAt: string; summary: string }[] = [];
    for (const row of cursor) {
      results.push({
        outboundId: row.outbound_id,
        scopeId: row.scope_id,
        contextId: row.context_id,
        actionType: row.action_type,
        status: row.status,
        createdAt: row.created_at,
        summary: `${row.action_type} — ${row.status}`,
      });
    }
    return results;
  }

  getPendingDrafts(): { draftId: string; scopeId: string; contextId: string; status: string; createdAt: string; summary: string }[] {
    const cursor = this.sql.exec<{ outbound_id: string; scope_id: string; context_id: string; action_type: string; status: string; created_at: string }>(
      `SELECT outbound_id, scope_id, context_id, action_type, status, created_at FROM outbound_commands WHERE status = 'draft_ready' ORDER BY created_at ASC`
    );
    const results: { draftId: string; scopeId: string; contextId: string; status: string; createdAt: string; summary: string }[] = [];
    for (const row of cursor) {
      results.push({
        draftId: row.outbound_id,
        scopeId: row.scope_id,
        contextId: row.context_id,
        status: row.status,
        createdAt: row.created_at,
        summary: `${row.action_type} draft`,
      });
    }
    return results;
  }

  insertFixtureObservation(observationId: string, outboundId: string, scopeId: string, observedStatus: string, observedAt: string): void {
    this.sql.exec(`INSERT OR IGNORE INTO fixture_observations (observation_id, outbound_id, scope_id, observed_status, observed_at) VALUES (?, ?, ?, ?, ?)`, observationId, outboundId, scopeId, observedStatus, observedAt);
  }

  getFixtureObservations(): { observationId: string; outboundId: string; scopeId: string; observedStatus: string; observedAt: string }[] {
    const cursor = this.sql.exec<{ observation_id: string; outbound_id: string; scope_id: string; observed_status: string; observed_at: string }>(
      `SELECT observation_id, outbound_id, scope_id, observed_status, observed_at FROM fixture_observations ORDER BY observed_at ASC`
    );
    const results: { observationId: string; outboundId: string; scopeId: string; observedStatus: string; observedAt: string }[] = [];
    for (const row of cursor) {
      results.push({ observationId: row.observation_id, outboundId: row.outbound_id, scopeId: row.scope_id, observedStatus: row.observed_status, observedAt: row.observed_at });
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Operator mutation surface (Task 355)
  // ---------------------------------------------------------------------------

  getWorkItem(workItemId: string): { workItemId: string; contextId: string; scopeId: string; status: string; errorMessage: string | null; createdAt: string; updatedAt: string } | null {
    const cursor = this.sql.exec<{ work_item_id: string; context_id: string; scope_id: string; status: string; error_message: string | null; created_at: string; updated_at: string }>(
      `SELECT work_item_id, context_id, scope_id, status, error_message, created_at, updated_at FROM work_items WHERE work_item_id = ? LIMIT 1`,
      workItemId
    );
    const row = cursor.one();
    if (!row) return null;
    return { workItemId: row.work_item_id, contextId: row.context_id, scopeId: row.scope_id, status: row.status, errorMessage: row.error_message, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  updateWorkItemStatus(workItemId: string, status: string, updates?: { errorMessage?: string | null; updatedAt?: string }): void {
    const fields: string[] = ["status = ?"];
    const params: (string | null)[] = [status];
    if (updates?.errorMessage !== undefined) {
      fields.push("error_message = ?");
      params.push(updates.errorMessage);
    }
    if (updates?.updatedAt !== undefined) {
      fields.push("updated_at = ?");
      params.push(updates.updatedAt);
    }
    params.push(workItemId);
    this.sql.exec(`UPDATE work_items SET ${fields.join(", ")} WHERE work_item_id = ?`, ...params);
  }

  getOutboundCommand(outboundId: string): { outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; createdAt: string } | null {
    const cursor = this.sql.exec<{ outbound_id: string; context_id: string; scope_id: string; action_type: string; status: string; created_at: string }>(
      `SELECT outbound_id, context_id, scope_id, action_type, status, created_at FROM outbound_commands WHERE outbound_id = ? LIMIT 1`,
      outboundId
    );
    const row = cursor.one();
    if (!row) return null;
    return { outboundId: row.outbound_id, contextId: row.context_id, scopeId: row.scope_id, actionType: row.action_type, status: row.status, createdAt: row.created_at };
  }

  insertOperatorActionRequest(request: SiteOperatorActionRequest): void {
    this.sql.exec(
      `INSERT INTO operator_action_requests (request_id, scope_id, action_type, target_id, target_kind, payload_json, status, requested_by, requested_at, executed_at, rejected_at, rejection_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      request.request_id, request.scope_id, request.action_type, request.target_id, request.target_kind, request.payload_json, request.status, request.requested_by, request.requested_at, request.executed_at, request.rejected_at, request.rejection_reason
    );
  }

  getOperatorActionRequest(requestId: string): SiteOperatorActionRequest | null {
    const cursor = this.sql.exec<{ request_id: string; scope_id: string; action_type: string; target_id: string; target_kind: string; payload_json: string | null; status: string; requested_by: string; requested_at: string; executed_at: string | null; rejected_at: string | null; rejection_reason: string | null }>(
      `SELECT request_id, scope_id, action_type, target_id, target_kind, payload_json, status, requested_by, requested_at, executed_at, rejected_at, rejection_reason FROM operator_action_requests WHERE request_id = ? LIMIT 1`,
      requestId
    );
    const row = cursor.one();
    if (!row) return null;
    return {
      request_id: row.request_id,
      scope_id: row.scope_id,
      action_type: row.action_type as SiteOperatorActionRequest["action_type"],
      target_id: row.target_id,
      target_kind: row.target_kind as SiteOperatorActionRequest["target_kind"],
      payload_json: row.payload_json,
      status: row.status as SiteOperatorActionRequest["status"],
      requested_by: row.requested_by,
      requested_at: row.requested_at,
      executed_at: row.executed_at,
      rejected_at: row.rejected_at,
      rejection_reason: row.rejection_reason,
    };
  }

  getPendingOperatorActionRequests(scopeId?: string): SiteOperatorActionRequest[] {
    const query = scopeId
      ? `SELECT request_id, scope_id, action_type, target_id, target_kind, payload_json, status, requested_by, requested_at, executed_at, rejected_at, rejection_reason FROM operator_action_requests WHERE scope_id = ? AND status = 'pending' ORDER BY requested_at ASC`
      : `SELECT request_id, scope_id, action_type, target_id, target_kind, payload_json, status, requested_by, requested_at, executed_at, rejected_at, rejection_reason FROM operator_action_requests WHERE status = 'pending' ORDER BY requested_at ASC`;
    const cursor = this.sql.exec<{ request_id: string; scope_id: string; action_type: string; target_id: string; target_kind: string; payload_json: string | null; status: string; requested_by: string; requested_at: string; executed_at: string | null; rejected_at: string | null; rejection_reason: string | null }>(
      query,
      ...(scopeId ? [scopeId] : [])
    );
    const results: SiteOperatorActionRequest[] = [];
    for (const row of cursor) {
      results.push({
        request_id: row.request_id,
        scope_id: row.scope_id,
        action_type: row.action_type as SiteOperatorActionRequest["action_type"],
        target_id: row.target_id,
        target_kind: row.target_kind as SiteOperatorActionRequest["target_kind"],
        payload_json: row.payload_json,
        status: row.status as SiteOperatorActionRequest["status"],
        requested_by: row.requested_by,
        requested_at: row.requested_at,
        executed_at: row.executed_at,
        rejected_at: row.rejected_at,
        rejection_reason: row.rejection_reason,
      });
    }
    return results;
  }

  markOperatorActionRequestExecuted(requestId: string, executedAt?: string): void {
    const now = executedAt ?? new Date().toISOString();
    this.sql.exec(`UPDATE operator_action_requests SET status = 'executed', executed_at = ? WHERE request_id = ?`, now, requestId);
  }

  markOperatorActionRequestRejected(requestId: string, reason: string, rejectedAt?: string): void {
    const now = rejectedAt ?? new Date().toISOString();
    this.sql.exec(`UPDATE operator_action_requests SET status = 'rejected', rejected_at = ?, rejection_reason = ? WHERE request_id = ?`, now, reason, requestId);
  }

  // ---------------------------------------------------------------------------
  // Effect worker surfaces (Task 359)
  // ---------------------------------------------------------------------------

  getApprovedOutboundCommands(): { outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; payloadJson: string | null; internetMessageId: string | null }[] {
    const cursor = this.sql.exec<{ outbound_id: string; context_id: string; scope_id: string; action_type: string; status: string; payload_json: string | null; internet_message_id: string | null }>(
      `SELECT outbound_id, context_id, scope_id, action_type, status, payload_json, internet_message_id FROM outbound_commands WHERE status = 'approved_for_send' ORDER BY created_at ASC`
    );
    const results: { outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; payloadJson: string | null; internetMessageId: string | null }[] = [];
    for (const row of cursor) {
      results.push({ outboundId: row.outbound_id, contextId: row.context_id, scopeId: row.scope_id, actionType: row.action_type, status: row.status, payloadJson: row.payload_json, internetMessageId: row.internet_message_id });
    }
    return results;
  }

  getExecutionAttemptsForOutbound(outboundId: string): ExecutionAttemptRecord[] {
    const cursor = this.sql.exec<{ execution_attempt_id: string; outbound_id: string; action_type: string; attempted_at: string; status: string; error_code: string | null; error_message: string | null; response_json: string | null; external_ref: string | null; worker_id: string | null; lease_expires_at: string | null; finished_at: string | null }>(
      `SELECT execution_attempt_id, outbound_id, action_type, attempted_at, status, error_code, error_message, response_json, external_ref, worker_id, lease_expires_at, finished_at FROM execution_attempts WHERE outbound_id = ? ORDER BY attempted_at ASC`,
      outboundId
    );
    const results: ExecutionAttemptRecord[] = [];
    for (const row of cursor) {
      results.push({
        executionAttemptId: row.execution_attempt_id,
        outboundId: row.outbound_id,
        actionType: row.action_type,
        attemptedAt: row.attempted_at,
        status: row.status as ExecutionAttemptRecord["status"],
        errorCode: row.error_code,
        errorMessage: row.error_message,
        responseJson: row.response_json,
        externalRef: row.external_ref,
        workerId: row.worker_id,
        leaseExpiresAt: row.lease_expires_at,
        finishedAt: row.finished_at,
      });
    }
    return results;
  }

  getLatestExecutionAttempt(outboundId: string): ExecutionAttemptRecord | null {
    const cursor = this.sql.exec<{ execution_attempt_id: string; outbound_id: string; action_type: string; attempted_at: string; status: string; error_code: string | null; error_message: string | null; response_json: string | null; external_ref: string | null; worker_id: string | null; lease_expires_at: string | null; finished_at: string | null }>(
      `SELECT execution_attempt_id, outbound_id, action_type, attempted_at, status, error_code, error_message, response_json, external_ref, worker_id, lease_expires_at, finished_at FROM execution_attempts WHERE outbound_id = ? ORDER BY attempted_at DESC LIMIT 1`,
      outboundId
    );
    const row = cursor.one();
    if (!row) return null;
    return {
      executionAttemptId: row.execution_attempt_id,
      outboundId: row.outbound_id,
      actionType: row.action_type,
      attemptedAt: row.attempted_at,
      status: row.status as ExecutionAttemptRecord["status"],
      errorCode: row.error_code,
      errorMessage: row.error_message,
      responseJson: row.response_json,
      externalRef: row.external_ref,
      workerId: row.worker_id,
      leaseExpiresAt: row.lease_expires_at,
      finishedAt: row.finished_at,
    };
  }

  countRetryableAttempts(outboundId: string): number {
    const cursor = this.sql.exec<{ count: number }>(
      `SELECT COUNT(*) as count FROM execution_attempts WHERE outbound_id = ? AND status = 'failed_retryable'`,
      outboundId
    );
    return cursor.one()?.count ?? 0;
  }

  insertExecutionAttempt(attempt: Omit<ExecutionAttemptRecord, "finishedAt">): void {
    this.sql.exec(
      `INSERT INTO execution_attempts (execution_attempt_id, outbound_id, action_type, attempted_at, status, error_code, error_message, response_json, external_ref, worker_id, lease_expires_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      attempt.executionAttemptId, attempt.outboundId, attempt.actionType, attempt.attemptedAt, attempt.status, attempt.errorCode, attempt.errorMessage, attempt.responseJson, attempt.externalRef, attempt.workerId, attempt.leaseExpiresAt, null
    );
  }

  updateExecutionAttemptStatus(executionAttemptId: string, status: string, updates?: { errorCode?: string | null; errorMessage?: string | null; responseJson?: string | null; externalRef?: string | null; finishedAt?: string }): void {
    const fields: string[] = ["status = ?"];
    const params: (string | null)[] = [status];
    if (updates?.errorCode !== undefined) {
      fields.push("error_code = ?");
      params.push(updates.errorCode);
    }
    if (updates?.errorMessage !== undefined) {
      fields.push("error_message = ?");
      params.push(updates.errorMessage);
    }
    if (updates?.responseJson !== undefined) {
      fields.push("response_json = ?");
      params.push(updates.responseJson);
    }
    if (updates?.externalRef !== undefined) {
      fields.push("external_ref = ?");
      params.push(updates.externalRef);
    }
    if (updates?.finishedAt !== undefined) {
      fields.push("finished_at = ?");
      params.push(updates.finishedAt);
    }
    params.push(executionAttemptId);
    this.sql.exec(`UPDATE execution_attempts SET ${fields.join(", ")} WHERE execution_attempt_id = ?`, ...params);
  }
}

function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}
