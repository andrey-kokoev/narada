/**
 * Windows Cycle Coordinator
 *
 * Wraps the kernel control-plane stores (coordinator, outbound, fact)
 * and the site-level health/trace tables into a single interface
 * compatible with the Cloudflare CycleStep handlers.
 *
 * All stores share one SQLite database.
 */

import type { Database } from "better-sqlite3";
import {
  SqliteCoordinatorStore,
  SqliteOutboundStore,
  SqliteFactStore,
  SqliteIntentStore,
  DefaultForemanFacade,
  CampaignRequestContextFormation,
} from "@narada2/control-plane";
import type {
  SiteHealthRecord,
  CycleTraceRecord,
} from "./types.js";
import type { OutboundStatus, OutboundActionType } from "@narada2/control-plane";

export interface FactRecord {
  factId: string;
  sourceId: string;
  factType: string;
  payloadJson: string;
  observedAt: string;
  admitted: boolean;
  createdAt: string;
}

export interface FixtureSourceDelta {
  sourceId: string;
  eventId: string;
  factType: string;
  payloadJson: string;
  observedAt: string;
}

export interface ExecutionAttemptRecord {
  executionAttemptId: string;
  outboundId: string;
  actionType: string;
  attemptedAt: string;
  status: "attempting" | "submitted" | "failed_retryable" | "failed_terminal";
  errorCode: string | null;
  errorMessage: string | null;
  responseJson: string | null;
  externalRef: string | null;
  workerId: string | null;
  leaseExpiresAt: string | null;
  finishedAt: string | null;
}

export class WindowsCycleCoordinator {
  readonly db: Database;
  readonly coordinatorStore: SqliteCoordinatorStore;
  readonly outboundStore: SqliteOutboundStore;
  readonly factStore: SqliteFactStore;
  readonly intentStore: SqliteIntentStore;

  constructor(db: Database) {
    this.db = db;
    this.coordinatorStore = new SqliteCoordinatorStore({ db });
    this.outboundStore = new SqliteOutboundStore({ db });
    this.factStore = new SqliteFactStore({ db });
    this.intentStore = new SqliteIntentStore({ db });

    // Speed up first-time schema creation by disabling fsync during DDL.
    // Schema init can involve 20+ implicit transactions; with synchronous=FULL
    // each one fsyncs, causing 10–20s delays on slow filesystems.
    const prevSync = this.db.pragma("synchronous", { simple: true }) as number;
    this.db.pragma("synchronous = OFF");
    this.coordinatorStore.initSchema();
    this.outboundStore.initSchema();
    this.factStore.initSchema();
    this.intentStore.initSchema();
    this.initSiteSchema();
    this.initSyncSchema();
    this.db.pragma(`synchronous = ${prevSync}`);
  }

  // -------------------------------------------------------------------------
  // Site-level schema (health, trace, notifications)
  // -------------------------------------------------------------------------

  private initSiteSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS site_health (
        site_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        last_cycle_at TEXT,
        last_cycle_duration_ms INTEGER,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        message TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cycle_traces (
        cycle_id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        status TEXT NOT NULL,
        steps_completed TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_cycle_traces_site_id ON cycle_traces(site_id);

      CREATE TABLE IF NOT EXISTS notification_log (
        site_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        health_status TEXT NOT NULL,
        summary TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        PRIMARY KEY (site_id, channel)
      );
    `);
  }

  // -------------------------------------------------------------------------
  // Sync schema (apply-log, source cursors)
  // -------------------------------------------------------------------------

  private initSyncSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS source_cursors (
        source_id TEXT PRIMARY KEY,
        cursor_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS apply_log (
        event_id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
  }

  // -------------------------------------------------------------------------
  // Health / trace (site-level)
  // -------------------------------------------------------------------------

  getHealth(siteId: string): SiteHealthRecord {
    const row = this.db
      .prepare(
        `SELECT site_id, status, last_cycle_at, last_cycle_duration_ms,
                consecutive_failures, message, updated_at
         FROM site_health WHERE site_id = ?`
      )
      .get(siteId) as
      | {
          site_id: string;
          status: string;
          last_cycle_at: string | null;
          last_cycle_duration_ms: number | null;
          consecutive_failures: number;
          message: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return {
        site_id: siteId,
        status: "healthy",
        last_cycle_at: null,
        last_cycle_duration_ms: null,
        consecutive_failures: 0,
        message: "No cycles recorded yet",
        updated_at: new Date().toISOString(),
      };
    }

    return {
      site_id: row.site_id,
      status: row.status as SiteHealthRecord["status"],
      last_cycle_at: row.last_cycle_at,
      last_cycle_duration_ms: row.last_cycle_duration_ms,
      consecutive_failures: row.consecutive_failures,
      message: row.message,
      updated_at: row.updated_at,
    };
  }

  setHealth(record: SiteHealthRecord): void {
    this.db
      .prepare(
        `INSERT INTO site_health (site_id, status, last_cycle_at, last_cycle_duration_ms,
                                  consecutive_failures, message, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(site_id) DO UPDATE SET
           status = excluded.status,
           last_cycle_at = excluded.last_cycle_at,
           last_cycle_duration_ms = excluded.last_cycle_duration_ms,
           consecutive_failures = excluded.consecutive_failures,
           message = excluded.message,
           updated_at = excluded.updated_at`
      )
      .run(
        record.site_id,
        record.status,
        record.last_cycle_at,
        record.last_cycle_duration_ms,
        record.consecutive_failures,
        record.message,
        record.updated_at
      );
  }

  getLastCycleTrace(siteId: string): CycleTraceRecord | null {
    const row = this.db
      .prepare(
        `SELECT cycle_id, site_id, started_at, finished_at, status,
                steps_completed, error
         FROM cycle_traces
         WHERE site_id = ?
         ORDER BY started_at DESC
         LIMIT 1`
      )
      .get(siteId) as
      | {
          cycle_id: string;
          site_id: string;
          started_at: string;
          finished_at: string;
          status: string;
          steps_completed: string;
          error: string | null;
        }
      | undefined;

    if (!row) return null;

    return {
      cycle_id: row.cycle_id,
      site_id: row.site_id,
      started_at: row.started_at,
      finished_at: row.finished_at,
      status: row.status as CycleTraceRecord["status"],
      steps_completed: JSON.parse(row.steps_completed) as number[],
      error: row.error,
    };
  }

  setLastCycleTrace(record: CycleTraceRecord): void {
    this.db
      .prepare(
        `INSERT INTO cycle_traces (cycle_id, site_id, started_at, finished_at,
                                   status, steps_completed, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(cycle_id) DO UPDATE SET
           finished_at = excluded.finished_at,
           status = excluded.status,
           steps_completed = excluded.steps_completed,
           error = excluded.error`
      )
      .run(
        record.cycle_id,
        record.site_id,
        record.started_at,
        record.finished_at,
        record.status,
        JSON.stringify(record.steps_completed),
        record.error
      );
  }

  recordNotification(siteId: string, channel: string, healthStatus: string, summary: string, occurredAt: string): void {
    this.db
      .prepare(
        `INSERT INTO notification_log (site_id, channel, health_status, summary, occurred_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(site_id, channel) DO UPDATE SET
           health_status = excluded.health_status,
           summary = excluded.summary,
           occurred_at = excluded.occurred_at`
      )
      .run(siteId, channel, healthStatus, summary, occurredAt);
  }

  getLastNotification(siteId: string, channel: string): { health_status: string; occurred_at: string } | null {
    const row = this.db
      .prepare(
        `SELECT health_status, occurred_at FROM notification_log WHERE site_id = ? AND channel = ?`
      )
      .get(siteId, channel) as
      | { health_status: string; occurred_at: string }
      | undefined;
    return row ?? null;
  }

  // -------------------------------------------------------------------------
  // Fact / cursor / apply-log
  // -------------------------------------------------------------------------

  insertFact(fact: Omit<FactRecord, "createdAt">): void {
    this.factStore.ingest({
      fact_id: fact.factId,
      fact_type: fact.factType as import("@narada2/control-plane").FactType,
      provenance: {
        source_id: fact.sourceId,
        source_record_id: fact.factId,
        source_version: null,
        source_cursor: null,
        observed_at: fact.observedAt,
      },
      payload_json: fact.payloadJson,
    });
  }

  getFactById(factId: string): FactRecord | null {
    const fact = this.factStore.getById(factId);
    if (!fact) return null;
    return {
      factId: fact.fact_id,
      sourceId: fact.provenance.source_id,
      factType: fact.fact_type,
      payloadJson: fact.payload_json,
      observedAt: fact.provenance.observed_at,
      admitted: fact.provenance.source_cursor !== null, // proxy
      createdAt: fact.created_at,
    };
  }

  getUnadmittedFacts(): FactRecord[] {
    const facts = this.factStore.getUnadmittedFacts();
    return facts.map((fact) => ({
      factId: fact.fact_id,
      sourceId: fact.provenance.source_id,
      factType: fact.fact_type,
      payloadJson: fact.payload_json,
      observedAt: fact.provenance.observed_at,
      admitted: false,
      createdAt: fact.created_at,
    }));
  }

  markFactAdmitted(factId: string): void {
    this.factStore.markAdmitted([factId]);
  }

  isEventApplied(eventId: string): boolean {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM apply_log WHERE event_id = ?`)
      .get(eventId) as { count: number } | undefined;
    return (row?.count ?? 0) > 0;
  }

  markEventApplied(eventId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(`INSERT OR IGNORE INTO apply_log (event_id, applied_at) VALUES (?, ?)`)
      .run(eventId, now);
  }

  setCursor(sourceId: string, cursorValue: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT OR REPLACE INTO source_cursors (source_id, cursor_value, updated_at) VALUES (?, ?, ?)`
      )
      .run(sourceId, cursorValue, now);
  }

  getCursor(sourceId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT cursor_value FROM source_cursors WHERE source_id = ? LIMIT 1`
      )
      .get(sourceId) as { cursor_value: string } | undefined;
    return row?.cursor_value ?? null;
  }

  // -------------------------------------------------------------------------
  // Campaign context formation (foreman-owned admission)
  // -------------------------------------------------------------------------

  /**
   * Run campaign-request context formation via the foreman facade.
   *
   * This is the real derive-work path for live dry-run configs that
   * specify `campaign_request_senders`. It replaces the fixture
   * grouping handler with proper foreman admission.
   */
  async admitCampaignFacts(
    scopeId: string,
    campaignConfig: { campaign_request_senders: string[]; campaign_request_lookback_days?: number },
  ): Promise<{ opened: number; superseded: number; nooped: number }> {
    const facts = this.factStore.getUnadmittedFacts();
    if (facts.length === 0) {
      return { opened: 0, superseded: 0, nooped: 0 };
    }

    const foreman = new DefaultForemanFacade(
      {
        coordinatorStore: this.coordinatorStore,
        outboundStore: this.outboundStore,
        intentStore: this.intentStore,
        db: this.db,
        foremanId: "windows-site-foreman",
        getRuntimePolicy: () => ({
          primary_charter: "campaign_request",
          allowed_actions: ["campaign_brief"],
          runtime_authorized: false,
        }),
        contextFormationStrategy: new CampaignRequestContextFormation(campaignConfig),
      },
      { maxRetries: 3 },
    );

    const result = await foreman.onFactsAdmitted(facts, scopeId);

    // Mark all facts as admitted so they are not re-derived
    const admittedFactIds = facts.map((f) => f.fact_id);
    this.factStore.markAdmitted(admittedFactIds);

    return {
      opened: result.opened.length,
      superseded: result.superseded.length,
      nooped: result.nooped.length,
    };
  }

  /**
   * Resolve a work item through the foreman facade.
   *
   * This transitions the work item to "executing" (dry-run scheduler bypass),
   * invokes `DefaultForemanFacade.resolveWorkItem()`, and returns the result.
   */
  async resolveWorkItemViaForeman(
    workItemId: string,
    executionId: string,
    evaluationId: string,
    getRuntimePolicy?: (scopeId: string) => import("@narada2/control-plane").RuntimePolicy,
  ): Promise<import("@narada2/control-plane").ResolutionResult> {
    const foreman = new DefaultForemanFacade(
      {
        coordinatorStore: this.coordinatorStore,
        outboundStore: this.outboundStore,
        intentStore: this.intentStore,
        db: this.db,
        foremanId: "windows-site-foreman",
        getRuntimePolicy: getRuntimePolicy ?? (() => ({
          primary_charter: "campaign_request",
          allowed_actions: ["campaign_brief"],
          runtime_authorized: false,
        })),
        contextFormationStrategy: new CampaignRequestContextFormation({
          campaign_request_senders: [],
        }),
      },
      { maxRetries: 3 },
    );

    // Dry-run scheduler bypass: transition work item to executing
    this.coordinatorStore.updateWorkItemStatus(workItemId, "executing", {
      updated_at: new Date().toISOString(),
    });

    return foreman.resolveWorkItem({ work_item_id: workItemId, execution_id: executionId, evaluation_id: evaluationId });
  }

  // -------------------------------------------------------------------------
  // Governance (context, work, evaluation, decision)
  // -------------------------------------------------------------------------

  insertContextRecord(contextId: string, scopeId: string, primaryCharter: string): void {
    const now = new Date().toISOString();
    this.coordinatorStore.upsertContextRecord({
      context_id: contextId,
      scope_id: scopeId,
      primary_charter: primaryCharter,
      secondary_charters_json: "[]",
      status: "active",
      assigned_agent: null,
      last_message_at: null,
      last_inbound_at: null,
      last_outbound_at: null,
      last_analyzed_at: null,
      last_triaged_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  insertWorkItem(workItemId: string, contextId: string, scopeId: string, status: string): void {
    const now = new Date().toISOString();
    this.coordinatorStore.insertWorkItem({
      work_item_id: workItemId,
      context_id: contextId,
      scope_id: scopeId,
      status: status as import("@narada2/control-plane").WorkItemStatus,
      priority: 0,
      opened_for_revision_id: `${contextId}:rev:0`,
      resolved_revision_id: null,
      resolution_outcome: null,
      error_message: null,
      retry_count: 0,
      next_retry_at: null,
      context_json: null,
      preferred_session_id: null,
      preferred_agent_id: null,
      affinity_group_id: null,
      affinity_reason: null,
      affinity_strength: 0,
      affinity_expires_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  getOpenWorkItems(): { workItemId: string; contextId: string; scopeId: string; status: string }[] {
    const rows = this.db
      .prepare(
        `SELECT work_item_id, context_id, scope_id, status FROM work_items w WHERE status = 'opened' AND NOT EXISTS (SELECT 1 FROM evaluations e WHERE e.work_item_id = w.work_item_id) ORDER BY created_at ASC`
      )
      .all() as Array<{
        work_item_id: string;
        context_id: string;
        scope_id: string;
        status: string;
      }>;

    return rows.map((row) => ({
      workItemId: row.work_item_id,
      contextId: row.context_id,
      scopeId: row.scope_id,
      status: row.status,
    }));
  }

  insertEvaluation(
    evaluationId: string,
    workItemId: string,
    scopeId: string,
    charterId: string,
    outcome: string,
    summary: string,
  ): void {
    const now = new Date().toISOString();
    // Need context_id for the evaluation; look it up from the work item
    const workItem = this.coordinatorStore.getWorkItem(workItemId);
    const contextId = workItem?.context_id ?? workItemId;
    const executionId = `exec_${evaluationId}`;

    // Insert execution attempt first (required by foreign key)
    this.coordinatorStore.insertExecutionAttempt({
      execution_id: executionId,
      work_item_id: workItemId,
      revision_id: `${contextId}:rev:0`,
      session_id: null,
      status: "succeeded",
      started_at: now,
      completed_at: now,
      runtime_envelope_json: "{}",
      outcome_json: null,
      error_message: null,
    });

    this.coordinatorStore.insertEvaluation({
      evaluation_id: evaluationId,
      execution_id: executionId,
      work_item_id: workItemId,
      context_id: contextId,
      scope_id: scopeId,
      charter_id: charterId,
      role: "primary",
      output_version: "1.0",
      analyzed_at: now,
      outcome,
      confidence_json: "{}",
      summary,
      classifications_json: "[]",
      facts_json: "[]",
      escalations_json: "[]",
      proposed_actions_json: "[]",
      tool_requests_json: "[]",
      recommended_action_class: null,
      created_at: now,
    });
  }

  getPendingEvaluations(): { evaluationId: string; workItemId: string; contextId: string; scopeId: string; charterId: string; outcome: string; summary: string }[] {
    const rows = this.db
      .prepare(
        `SELECT e.evaluation_id, e.work_item_id, e.context_id, e.scope_id, e.charter_id, e.outcome, e.summary FROM evaluations e LEFT JOIN foreman_decisions d ON d.decision_id = e.evaluation_id WHERE d.decision_id IS NULL ORDER BY e.created_at ASC`
      )
      .all() as Array<{
        evaluation_id: string;
        work_item_id: string;
        context_id: string;
        scope_id: string;
        charter_id: string;
        outcome: string;
        summary: string;
      }>;

    return rows.map((row) => ({
      evaluationId: row.evaluation_id,
      workItemId: row.work_item_id,
      contextId: row.context_id,
      scopeId: row.scope_id,
      charterId: row.charter_id,
      outcome: row.outcome,
      summary: row.summary,
    }));
  }

  insertDecision(
    decisionId: string,
    evaluationId: string,
    contextId: string,
    scopeId: string,
    approvedAction: string,
    outboundId: string | null,
  ): void {
    const now = new Date().toISOString();
    this.coordinatorStore.insertDecision({
      decision_id: decisionId,
      context_id: contextId,
      scope_id: scopeId,
      source_charter_ids_json: JSON.stringify(["fixture-charter"]),
      approved_action: approvedAction,
      payload_json: "{}",
      rationale: `Decision for ${evaluationId}`,
      decided_at: now,
      outbound_id: outboundId,
      created_by: "foreman:windows-site/charter:fixture-charter",
    });
  }

  // -------------------------------------------------------------------------
  // Outbound
  // -------------------------------------------------------------------------

  insertOutboundCommand(
    outboundId: string,
    contextId: string,
    scopeId: string,
    actionType: string,
    status: string,
    payloadJson?: string | null,
    _internetMessageId?: string | null,
  ): void {
    const now = new Date().toISOString();
    this.outboundStore.createCommand(
      {
        outbound_id: outboundId,
        context_id: contextId,
        scope_id: scopeId,
        action_type: actionType as OutboundActionType,
        status: status as OutboundStatus,
        latest_version: 1,
        created_at: now,
        created_by: "foreman:windows-site/charter:fixture-charter",
        submitted_at: null,
        confirmed_at: null,
        blocked_reason: null,
        terminal_reason: null,
        idempotency_key: `idem_${outboundId}`,
        reviewed_at: null,
        reviewer_notes: null,
        external_reference: null,
        approved_at: null,
      },
      {
        outbound_id: outboundId,
        version: 1,
        reply_to_message_id: null,
        to: [],
        cc: [],
        bcc: [],
        subject: "",
        body_text: "",
        body_html: "",
        idempotency_key: `idem_${outboundId}`,
        policy_snapshot_json: "{}",
        payload_json: payloadJson ?? "{}",
        created_at: now,
        superseded_at: null,
      }
    );
  }

  updateOutboundCommandStatus(outboundId: string, status: string): void {
    this.outboundStore.updateCommandStatus(
      outboundId,
      status as import("@narada2/control-plane").OutboundStatus
    );
  }

  getPendingOutboundCommands(): { outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; payloadJson: string | null; internetMessageId: string | null }[] {
    const rows = this.db
      .prepare(
        `SELECT outbound_id, context_id, scope_id, action_type, status, payload_json, internet_message_id FROM outbound_commands WHERE status = 'pending' ORDER BY created_at ASC`
      )
      .all() as Array<{
        outbound_id: string;
        context_id: string;
        scope_id: string;
        action_type: string;
        status: string;
        payload_json: string | null;
        internet_message_id: string | null;
      }>;

    return rows.map((row) => ({
      outboundId: row.outbound_id,
      contextId: row.context_id,
      scopeId: row.scope_id,
      actionType: row.action_type,
      status: row.status,
      payloadJson: row.payload_json,
      internetMessageId: row.internet_message_id,
    }));
  }

  getSubmittedOutboundCommands(): { outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; payloadJson: string | null; internetMessageId: string | null }[] {
    const rows = this.db
      .prepare(
        `SELECT outbound_id, context_id, scope_id, action_type, status, payload_json, internet_message_id FROM outbound_commands WHERE status = 'submitted' ORDER BY created_at ASC`
      )
      .all() as Array<{
        outbound_id: string;
        context_id: string;
        scope_id: string;
        action_type: string;
        status: string;
        payload_json: string | null;
        internet_message_id: string | null;
      }>;

    return rows.map((row) => ({
      outboundId: row.outbound_id,
      contextId: row.context_id,
      scopeId: row.scope_id,
      actionType: row.action_type,
      status: row.status,
      payloadJson: row.payload_json,
      internetMessageId: row.internet_message_id,
    }));
  }

  getApprovedOutboundCommands(): { outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; payloadJson: string | null; internetMessageId: string | null }[] {
    const rows = this.db
      .prepare(
        `SELECT outbound_id, context_id, scope_id, action_type, status, payload_json, internet_message_id FROM outbound_commands WHERE status = 'approved_for_send' ORDER BY created_at ASC`
      )
      .all() as Array<{
        outbound_id: string;
        context_id: string;
        scope_id: string;
        action_type: string;
        status: string;
        payload_json: string | null;
        internet_message_id: string | null;
      }>;

    return rows.map((row) => ({
      outboundId: row.outbound_id,
      contextId: row.context_id,
      scopeId: row.scope_id,
      actionType: row.action_type,
      status: row.status,
      payloadJson: row.payload_json,
      internetMessageId: row.internet_message_id,
    }));
  }

  getLatestExecutionAttempt(_outboundId: string): ExecutionAttemptRecord | null {
    // Control-plane execution_attempts are keyed by work_item_id, not outbound_id
    // For the dry run, return null — real effect execution is deferred
    return null;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  close(): void {
    this.db.close();
  }
}
