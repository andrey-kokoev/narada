/**
 * Read-only observability queries.
 *
 * Every function in this file derives its result from durable SQLite state.
 * They are safe to call at any time and must never be used for correctness decisions.
 */

import type { CoordinatorStoreView, ExecutionAttempt } from "../coordinator/types.js";
import type { OutboundStatus } from "../outbound/types.js";
import type { OutboundStoreView } from "../outbound/store.js";
import type { ProcessExecutionStoreView } from "../executors/store.js";
import type { IntentStoreView } from "../intent/store.js";
import type { FactStoreView } from "../facts/types.js";
import type { WorkerRegistryView } from "../workers/registry.js";
import type {
  ControlPlaneStatusSnapshot,
  ExecutionAttemptSummary,
  ScopeDispatchSummary,
  OutboundHandoffSummary,
  ToolCallSummary,
  WorkItemLifecycleSummary,
  ProcessExecutionSummary,
  IntentSummary,
  WorkerStatusObservation,
  ContextSummary,
  FactSummary,
  TimelineEvent,
  WorkItemTimeline,
  ContextTimeline,
  FactTimeline,
  ObservationPlaneSnapshot,
  IntentExecutionSummary,
  ProcessExecutionDetail,
  IntentLifecycleTransition,
  LeaseSummary,
  StaleLeaseRecoveryEvent,
  QuiescenceIndicator,
  OverviewSnapshot,
  ScopeOverview,
  OverviewFailureSummary,
  AffinityOutcome,
  StuckWorkItem,
  StuckWorkItemClassification,
  StuckOutboundCommand,
  StuckOutboundClassification,
  StuckItemCounts,
  OperatorActionSummary,
} from "./types.js";
import type { PolicyContext } from "../foreman/context.js";
import {
  mapOutboundStatusToPhase,
  mapOutboundStatusToConfirmation,
} from "../executors/lifecycle.js";

function rowToWorkItemSummary(row: Record<string, unknown>): WorkItemLifecycleSummary {
  return {
    work_item_id: String(row.work_item_id),
    context_id: String(row.context_id),
    scope_id: String(row.scope_id),
    status: String(row.status) as WorkItemLifecycleSummary["status"],
    priority: Number(row.priority ?? 0),
    opened_for_revision_id: String(row.opened_for_revision_id),
    resolved_revision_id: row.resolved_revision_id ? String(row.resolved_revision_id) : null,
    resolution_outcome: row.resolution_outcome ? String(row.resolution_outcome) : null,
    retry_count: Number(row.retry_count ?? 0),
    next_retry_at: row.next_retry_at ? String(row.next_retry_at) : null,
    error_message: row.error_message ? String(row.error_message) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    preferred_session_id: row.preferred_session_id ? String(row.preferred_session_id) : null,
    preferred_agent_id: row.preferred_agent_id ? String(row.preferred_agent_id) : null,
    affinity_group_id: row.affinity_group_id ? String(row.affinity_group_id) : null,
    affinity_strength: Number(row.affinity_strength ?? 0),
    affinity_expires_at: row.affinity_expires_at ? String(row.affinity_expires_at) : null,
    affinity_reason: row.affinity_reason ? String(row.affinity_reason) : null,
  };
}

function rowToExecutionSummary(row: Record<string, unknown>): ExecutionAttemptSummary {
  return {
    execution_id: String(row.execution_id),
    work_item_id: String(row.work_item_id),
    revision_id: String(row.revision_id),
    session_id: row.session_id ? String(row.session_id) : null,
    status: String(row.status) as ExecutionAttemptSummary["status"],
    started_at: String(row.started_at),
    completed_at: row.completed_at ? String(row.completed_at) : null,
    error_message: row.error_message ? String(row.error_message) : null,
  };
}

function toExecutionSummary(attempt: ExecutionAttempt): ExecutionAttemptSummary {
  return {
    execution_id: attempt.execution_id,
    work_item_id: attempt.work_item_id,
    revision_id: attempt.revision_id,
    session_id: attempt.session_id,
    status: attempt.status,
    started_at: attempt.started_at,
    completed_at: attempt.completed_at,
    error_message: attempt.error_message,
  };
}

function rowToToolCallSummary(row: Record<string, unknown>): ToolCallSummary {
  return {
    call_id: String(row.call_id),
    execution_id: String(row.execution_id),
    work_item_id: String(row.work_item_id),
    context_id: String(row.context_id),
    tool_id: String(row.tool_id),
    exit_status: String(row.exit_status) as ToolCallSummary["exit_status"],
    duration_ms: Number(row.duration_ms ?? 0),
    started_at: String(row.started_at),
    completed_at: String(row.completed_at),
  };
}

function rowToOutboundSummary(row: Record<string, unknown>): OutboundHandoffSummary {
  return {
    outbound_id: String(row.outbound_id),
    context_id: String(row.context_id),
    scope_id: String(row.scope_id),
    action_type: String(row.action_type),
    status: String(row.status) as OutboundHandoffSummary["status"],
    latest_version: Number(row.latest_version ?? 1),
    created_at: String(row.created_at),
    submitted_at: row.submitted_at ? String(row.submitted_at) : null,
    confirmed_at: row.confirmed_at ? String(row.confirmed_at) : null,
    terminal_reason: row.terminal_reason ? String(row.terminal_reason) : null,
    idempotency_key: String(row.idempotency_key),
    reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewer_notes: row.reviewer_notes ? String(row.reviewer_notes) : null,
    external_reference: row.external_reference ? String(row.external_reference) : null,
    approved_at: row.approved_at ? String(row.approved_at) : null,
  };
}

export function getActiveWorkItems(
  store: CoordinatorStoreView,
  limit = 50,
): WorkItemLifecycleSummary[] {
  const rows = store.db
    .prepare(
      `select * from work_items
       where status in ('opened', 'leased', 'executing')
       order by priority desc, created_at asc
       limit ?`,
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map(rowToWorkItemSummary);
}

export function getRecentFailedWorkItems(
  store: CoordinatorStoreView,
  limit = 50,
): WorkItemLifecycleSummary[] {
  const rows = store.db
    .prepare(
      `select * from work_items
       where status in ('failed_retryable', 'failed_terminal')
       order by updated_at desc
       limit ?`,
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map(rowToWorkItemSummary);
}

export function getWorkItemsAwaitingRetry(
  store: CoordinatorStoreView,
  now = new Date().toISOString(),
): WorkItemLifecycleSummary[] {
  const rows = store.db
    .prepare(
      `select * from work_items
       where status = 'failed_retryable'
         and (next_retry_at is null or next_retry_at <= ?)
       order by next_retry_at asc`,
    )
    .all(now) as Record<string, unknown>[];
  return rows.map(rowToWorkItemSummary);
}

/**
 * Compute affinity outcomes for work items.
 *
 * v1 scope: affinity is an ordering hint only. This function reports what
 * affinity was present and whether it had expired, but it cannot report
 * whether a specific session was chosen because v1 does not implement
 * session-targeted lease acquisition.
 */
export function getWorkItemAffinityOutcomes(
  store: CoordinatorStoreView,
  now = new Date().toISOString(),
): AffinityOutcome[] {
  const rows = store.db
    .prepare(
      `select
         wi.work_item_id,
         wi.context_id,
         wi.preferred_session_id,
         wi.affinity_strength,
         wi.affinity_expires_at,
         wi.affinity_reason,
         ea.session_id as actual_session_id
       from work_items wi
       left join execution_attempts ea on ea.work_item_id = wi.work_item_id
       order by wi.created_at desc`,
    )
    .all() as Array<{
      work_item_id: string;
      context_id: string;
      preferred_session_id: string | null;
      affinity_strength: number;
      affinity_expires_at: string | null;
      affinity_reason: string | null;
      actual_session_id: string | null;
    }>;

  const seen = new Set<string>();
  const outcomes: AffinityOutcome[] = [];

  for (const row of rows) {
    if (seen.has(row.work_item_id)) continue;
    seen.add(row.work_item_id);

    const hadAffinity = (row.affinity_strength ?? 0) > 0;
    const expired = hadAffinity && row.affinity_expires_at !== null && row.affinity_expires_at < now;

    let outcome: AffinityOutcome["outcome"];
    if (!hadAffinity) {
      outcome = "no_preference";
    } else if (expired) {
      outcome = "expired_before_scan";
    } else {
      outcome = "ordering_boost";
    }

    outcomes.push({
      work_item_id: row.work_item_id,
      context_id: row.context_id,
      had_affinity: hadAffinity,
      preferred_session_id: row.preferred_session_id ?? null,
      affinity_strength: row.affinity_strength ?? 0,
      affinity_expired: expired,
      affinity_reason: row.affinity_reason ?? null,
      outcome,
      // v2 deferred — always null until session-aware routing is implemented
      preferred_session_available: null,
      preferred_session_status: null,
      executed_by_preferred_session: null,
      actual_session_id: row.actual_session_id ?? null,
    });
  }

  return outcomes;
}

export function getRecentOutboundCommands(
  outboundStore: OutboundStoreView,
  limit = 50,
): OutboundHandoffSummary[] {
  const rows = outboundStore.db
    .prepare(
      `select
         outbound_id,
         context_id,
         scope_id,
         action_type,
         status,
         latest_version,
         created_at,
         submitted_at,
         confirmed_at,
         terminal_reason,
         idempotency_key,
         reviewed_at,
         reviewer_notes,
         external_reference,
         approved_at
       from outbound_handoffs
       order by created_at desc
       limit ?`,
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map(rowToOutboundSummary);
}

export function getOutboundCommandsByStatus(
  outboundStore: OutboundStoreView,
  status: OutboundHandoffSummary["status"],
  scopeId?: string,
  limit = 50,
): OutboundHandoffSummary[] {
  const sql = scopeId
    ? `select
         outbound_id,
         context_id,
         scope_id,
         action_type,
         status,
         latest_version,
         created_at,
         submitted_at,
         confirmed_at,
         terminal_reason,
         idempotency_key,
         reviewed_at,
         reviewer_notes,
         external_reference,
         approved_at
       from outbound_handoffs
       where status = ? and scope_id = ?
       order by created_at desc
       limit ?`
    : `select
         outbound_id,
         context_id,
         scope_id,
         action_type,
         status,
         latest_version,
         created_at,
         submitted_at,
         confirmed_at,
         terminal_reason,
         idempotency_key,
         reviewed_at,
         reviewer_notes,
         external_reference,
         approved_at
       from outbound_handoffs
       where status = ?
       order by created_at desc
       limit ?`;
  const params = scopeId ? [status, scopeId, limit] : [status, limit];
  const rows = outboundStore.db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(rowToOutboundSummary);
}

export function getRecentSessionsAndExecutions(
  store: CoordinatorStoreView,
  limit = 50,
): ExecutionAttemptSummary[] {
  const rows = store.db
    .prepare(
      `select * from execution_attempts
       order by started_at desc
       limit ?`,
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map(rowToExecutionSummary);
}

export function getToolCallSummary(
  store: CoordinatorStoreView,
  limit = 50,
): { recent: ToolCallSummary[]; by_status: Record<string, number>; total_count: number } {
  const recentRows = store.db
    .prepare(
      `select * from tool_call_records
       order by started_at desc
       limit ?`,
    )
    .all(limit) as Record<string, unknown>[];

  const countRows = store.db
    .prepare(`select exit_status, count(*) as c from tool_call_records group by exit_status`)
    .all() as Array<{ exit_status: string; c: number }>;

  const totalRow = store.db
    .prepare(`select count(*) as c from tool_call_records`)
    .get() as { c: number };

  const by_status: Record<string, number> = {};
  for (const row of countRows) {
    by_status[row.exit_status] = row.c;
  }

  return {
    recent: recentRows.map(rowToToolCallSummary),
    by_status,
    total_count: totalRow.c,
  };
}

export function buildScopeDispatchSummary(
  store: CoordinatorStoreView,
  outboundStore: OutboundStoreView,
  scopeId: string,
): ScopeDispatchSummary {
  const DB_ACTIVITY_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours — documented Task 234 default

  const active = store.db
    .prepare(`select count(*) as c from work_items where scope_id = ? and status = 'opened'`)
    .get(scopeId) as { c: number };
  const leased = store.db
    .prepare(`select count(*) as c from work_items where scope_id = ? and status = 'leased'`)
    .get(scopeId) as { c: number };
  const executing = store.db
    .prepare(`select count(*) as c from work_items where scope_id = ? and status = 'executing'`)
    .get(scopeId) as { c: number };
  const failedRetryable = store.db
    .prepare(`select count(*) as c from work_items where scope_id = ? and status = 'failed_retryable'`)
    .get(scopeId) as { c: number };
  const failedTerminal = store.db
    .prepare(`select count(*) as c from work_items where scope_id = ? and status = 'failed_terminal'`)
    .get(scopeId) as { c: number };
  const pendingOutbound = outboundStore.db
    .prepare(
      `select count(*) as c from outbound_handoffs where scope_id = ? and status in ('pending', 'draft_creating', 'draft_ready')`,
    )
    .get(scopeId) as { c: number };
  const failedOutbound = outboundStore.db
    .prepare(
      `select count(*) as c from outbound_handoffs where scope_id = ? and status in ('failed_terminal', 'blocked_policy')`,
    )
    .get(scopeId) as { c: number };
  const recentDecisions = store.db
    .prepare(
      `select count(*) as c from foreman_decisions where scope_id = ? and decided_at >= datetime('now', '-24 hours')`,
    )
    .get(scopeId) as { c: number };

  const lastSync = store.db
    .prepare(
      `select max(updated_at) as last_sync from work_items where scope_id = ?`,
    )
    .get(scopeId) as { last_sync: string | null };

  const dbActive = lastSync.last_sync
    ? Date.now() - new Date(lastSync.last_sync).getTime() < DB_ACTIVITY_THRESHOLD_MS
    : false;

  return {
    scope_id: scopeId,
    last_sync_at: lastSync.last_sync,
    active_work_items: active.c,
    leased_work_items: leased.c,
    executing_work_items: executing.c,
    failed_retryable_work_items: failedRetryable.c,
    failed_terminal_work_items: failedTerminal.c,
    pending_outbound_handoffs: pendingOutbound.c,
    recent_decisions_count: recentDecisions.c,
    readiness: {
      dispatch_ready: dbActive,
      outbound_healthy: failedOutbound.c === 0,
      workers_registered: true, // placeholder; daemon fills this in from registry
      db_active: dbActive,
      charter_runtime_healthy: true, // placeholder; daemon fills this in from runtime probe
      charter_runtime_health_class: null, // placeholder; daemon fills this in from runtime probe
    },
  };
}

export function getActiveLeases(
  store: CoordinatorStoreView,
  limit = 50,
): LeaseSummary[] {
  const rows = store.db
    .prepare(
      `select
         l.lease_id,
         l.work_item_id,
         l.runner_id,
         l.acquired_at,
         l.expires_at,
         w.context_id as context_id,
         w.status as work_item_status
       from work_item_leases l
       join work_items w on w.work_item_id = l.work_item_id
       where l.released_at is null
       order by l.acquired_at asc
       limit ?`,
    )
    .all(limit) as Record<string, unknown>[];

  return rows.map((row) => ({
    lease_id: String(row.lease_id),
    work_item_id: String(row.work_item_id),
    context_id: String(row.context_id),
    runner_id: String(row.runner_id),
    acquired_at: String(row.acquired_at),
    expires_at: String(row.expires_at),
    work_item_status: String(row.work_item_status),
  }));
}

export function getRecentStaleLeaseRecoveries(
  store: CoordinatorStoreView,
  limit = 50,
): StaleLeaseRecoveryEvent[] {
  const rows = store.db
    .prepare(
      `select
         l.lease_id,
         l.work_item_id,
         l.runner_id,
         l.released_at as recovered_at,
         l.release_reason as reason,
         w.context_id as context_id
       from work_item_leases l
       join work_items w on w.work_item_id = l.work_item_id
       where l.release_reason = 'abandoned'
       order by l.released_at desc
       limit ?`,
    )
    .all(limit) as Record<string, unknown>[];

  return rows.map((row) => ({
    lease_id: String(row.lease_id),
    work_item_id: String(row.work_item_id),
    context_id: String(row.context_id),
    runner_id: String(row.runner_id),
    recovered_at: String(row.recovered_at),
    reason: String(row.reason),
  }));
}

/** Operational-trust stuck-detection thresholds.
 *  All values are explicit — detection does not derive thresholds from
 *  runtime lease duration or charter timeout, to avoid surprise on config change.
 */
export interface StuckWorkThresholds {
  opened_max_age_minutes: number;
  leased_max_age_minutes: number;
  executing_max_age_minutes: number;
  max_retries: number;
}

export interface StuckOutboundThresholds {
  pending_max_age_minutes: number;
  draft_creating_max_age_minutes: number;
  draft_ready_max_age_hours: number;
  sending_max_age_minutes: number;
}

export const DEFAULT_STUCK_WORK_THRESHOLDS: StuckWorkThresholds = {
  opened_max_age_minutes: 60,
  leased_max_age_minutes: 120,
  executing_max_age_minutes: 30,
  max_retries: 3,
};

export const DEFAULT_STUCK_OUTBOUND_THRESHOLDS: StuckOutboundThresholds = {
  pending_max_age_minutes: 15,
  draft_creating_max_age_minutes: 10,
  draft_ready_max_age_hours: 24,
  sending_max_age_minutes: 5,
};

function minutesAgo(minutes: number, now: string): string {
  const d = new Date(now);
  d.setMinutes(d.getMinutes() - minutes);
  return d.toISOString();
}

function hoursAgo(hours: number, now: string): string {
  const d = new Date(now);
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

/** Detect work items that have been stagnant beyond operational thresholds.
 *  Computation is on-demand; no transient state is written.
 */
export function getStuckWorkItems(
  store: CoordinatorStoreView,
  thresholds: Partial<StuckWorkThresholds> = {},
  now = new Date().toISOString(),
): StuckWorkItem[] {
  const t = { ...DEFAULT_STUCK_WORK_THRESHOLDS, ...thresholds };
  const openedCutoff = minutesAgo(t.opened_max_age_minutes, now);
  const leasedCutoff = minutesAgo(t.leased_max_age_minutes, now);
  const executingCutoff = minutesAgo(t.executing_max_age_minutes, now);

  const sql = `
    select
      wi.*,
      case
        when wi.status = 'opened' and wi.created_at < ? then 'stuck_opened'
        when wi.status = 'leased' and wi.updated_at < ? then 'stuck_leased'
        when wi.status = 'executing' and wi.updated_at < ? then 'stuck_executing'
        when wi.status = 'failed_retryable' and wi.retry_count >= ? and (wi.next_retry_at is null or wi.next_retry_at < ?) then 'stuck_retry_exhausted'
        else null
      end as classification,
      case
        when wi.status = 'opened' then wi.created_at
        when wi.status = 'leased' then wi.updated_at
        when wi.status = 'executing' then wi.updated_at
        when wi.status = 'failed_retryable' then wi.next_retry_at
        else wi.updated_at
      end as status_since
    from work_items wi
    where wi.status in ('opened', 'leased', 'executing', 'failed_retryable')
      and (
        (wi.status = 'opened' and wi.created_at < ?)
        or (wi.status = 'leased' and wi.updated_at < ?)
        or (wi.status = 'executing' and wi.updated_at < ?)
        or (wi.status = 'failed_retryable' and wi.retry_count >= ? and (wi.next_retry_at is null or wi.next_retry_at < ?))
      )
    order by wi.priority desc, wi.created_at asc
  `;

  const rows = store.db
    .prepare(sql)
    .all(
      openedCutoff,
      leasedCutoff,
      executingCutoff,
      t.max_retries,
      now,
      openedCutoff,
      leasedCutoff,
      executingCutoff,
      t.max_retries,
      now,
    ) as Array<Record<string, unknown>>;

  return rows
    .map((row): StuckWorkItem | null => {
      const classification = String(row.classification) as StuckWorkItemClassification;
      if (!classification) return null;
      return {
        ...rowToWorkItemSummary(row),
        classification,
        status_since: String(row.status_since ?? row.updated_at ?? row.created_at),
      };
    })
    .filter((item): item is StuckWorkItem => item !== null);
}

/** Return stuck work-item counts grouped by classification. */
export function getStuckWorkItemSummary(
  store: CoordinatorStoreView,
  thresholds: Partial<StuckWorkThresholds> = {},
  now = new Date().toISOString(),
): StuckItemCounts["work_items"] {
  const items = getStuckWorkItems(store, thresholds, now);
  const counts = new Map<StuckWorkItemClassification, number>();
  for (const item of items) {
    counts.set(item.classification, (counts.get(item.classification) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([classification, count]) => ({
    classification,
    count,
  }));
}

/** Detect outbound commands that have been stagnant beyond operational thresholds.
 *  Uses the most recent transition time (or created_at for the initial state)
 *  to determine how long the command has been in its current status.
 */
export function getStuckOutboundCommands(
  outboundStore: OutboundStoreView,
  thresholds: Partial<StuckOutboundThresholds> = {},
  now = new Date().toISOString(),
): StuckOutboundCommand[] {
  const t = { ...DEFAULT_STUCK_OUTBOUND_THRESHOLDS, ...thresholds };
  const pendingCutoff = minutesAgo(t.pending_max_age_minutes, now);
  const draftCreatingCutoff = minutesAgo(t.draft_creating_max_age_minutes, now);
  const draftReadyCutoff = hoursAgo(t.draft_ready_max_age_hours, now);
  const sendingCutoff = minutesAgo(t.sending_max_age_minutes, now);

  const sql = `
    select
      o.*,
      coalesce(
        (select max(t.transition_at)
         from outbound_transitions t
         where t.outbound_id = o.outbound_id and t.to_status = o.status),
        o.created_at
      ) as status_since,
      case
        when o.status = 'pending' and coalesce(
          (select max(t.transition_at) from outbound_transitions t where t.outbound_id = o.outbound_id and t.to_status = o.status),
          o.created_at
        ) < ? then 'stuck_pending'
        when o.status = 'draft_creating' and coalesce(
          (select max(t.transition_at) from outbound_transitions t where t.outbound_id = o.outbound_id and t.to_status = o.status),
          o.created_at
        ) < ? then 'stuck_draft_creating'
        when o.status = 'draft_ready' and coalesce(
          (select max(t.transition_at) from outbound_transitions t where t.outbound_id = o.outbound_id and t.to_status = o.status),
          o.created_at
        ) < ? then 'stuck_draft_ready'
        when o.status = 'sending' and coalesce(
          (select max(t.transition_at) from outbound_transitions t where t.outbound_id = o.outbound_id and t.to_status = o.status),
          o.created_at
        ) < ? then 'stuck_sending'
        else null
      end as classification
    from outbound_handoffs o
    where o.status in ('pending', 'draft_creating', 'draft_ready', 'sending')
      and (
        (o.status = 'pending' and coalesce(
          (select max(t.transition_at) from outbound_transitions t where t.outbound_id = o.outbound_id and t.to_status = o.status),
          o.created_at
        ) < ?)
        or (o.status = 'draft_creating' and coalesce(
          (select max(t.transition_at) from outbound_transitions t where t.outbound_id = o.outbound_id and t.to_status = o.status),
          o.created_at
        ) < ?)
        or (o.status = 'draft_ready' and coalesce(
          (select max(t.transition_at) from outbound_transitions t where t.outbound_id = o.outbound_id and t.to_status = o.status),
          o.created_at
        ) < ?)
        or (o.status = 'sending' and coalesce(
          (select max(t.transition_at) from outbound_transitions t where t.outbound_id = o.outbound_id and t.to_status = o.status),
          o.created_at
        ) < ?)
      )
    order by status_since asc
  `;

  const rows = outboundStore.db
    .prepare(sql)
    .all(
      pendingCutoff,
      draftCreatingCutoff,
      draftReadyCutoff,
      sendingCutoff,
      pendingCutoff,
      draftCreatingCutoff,
      draftReadyCutoff,
      sendingCutoff,
    ) as Array<Record<string, unknown>>;

  return rows
    .map((row): StuckOutboundCommand | null => {
      const classification = String(row.classification) as StuckOutboundClassification;
      if (!classification) return null;
      return {
        ...rowToOutboundSummary(row),
        classification,
        status_since: String(row.status_since ?? row.created_at),
      };
    })
    .filter((item): item is StuckOutboundCommand => item !== null);
}

/** Return stuck outbound command counts grouped by classification. */
export function getStuckOutboundSummary(
  outboundStore: OutboundStoreView,
  thresholds: Partial<StuckOutboundThresholds> = {},
  now = new Date().toISOString(),
): StuckItemCounts["outbound_handoffs"] {
  const items = getStuckOutboundCommands(outboundStore, thresholds, now);
  const counts = new Map<StuckOutboundClassification, number>();
  for (const item of items) {
    counts.set(item.classification, (counts.get(item.classification) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([classification, count]) => ({
    classification,
    count,
  }));
}

export function getQuiescenceIndicator(
  store: CoordinatorStoreView,
  now = new Date().toISOString(),
): QuiescenceIndicator {
  const opened = store.db
    .prepare(`select count(*) as c from work_items where status = 'opened'`)
    .get() as { c: number };
  const leased = store.db
    .prepare(`select count(*) as c from work_items where status = 'leased'`)
    .get() as { c: number };
  const executing = store.db
    .prepare(`select count(*) as c from work_items where status = 'executing'`)
    .get() as { c: number };
  const failedRetryable = store.db
    .prepare(`select count(*) as c from work_items where status = 'failed_retryable'`)
    .get() as { c: number };
  const awaitingRetry = store.db
    .prepare(`select count(*) as c from work_items where status = 'failed_retryable' and (next_retry_at is null or next_retry_at <= ?)`)
    .get(now) as { c: number };

  const staleLeases = store.db
    .prepare(`select count(*) as c from work_item_leases where released_at is null and expires_at <= ?`)
    .get(now) as { c: number };
  const oldestLease = store.db
    .prepare(`select acquired_at from work_item_leases where released_at is null order by acquired_at asc limit 1`)
    .get() as { acquired_at: string | null } | undefined;

  return {
    is_quiescent: opened.c === 0 && leased.c === 0 && executing.c === 0 && awaitingRetry.c === 0,
    opened_count: opened.c,
    leased_count: leased.c,
    executing_count: executing.c,
    failed_retryable_count: failedRetryable.c,
    awaiting_retry_count: awaitingRetry.c,
    has_stale_leases: staleLeases.c > 0,
    stale_lease_count: staleLeases.c,
    oldest_lease_acquired_at: oldestLease?.acquired_at ?? null,
  };
}

export function buildControlPlaneSnapshot(
  coordinatorStore: CoordinatorStoreView,
  outboundStore: OutboundStoreView,
  scopeId?: string,
): ControlPlaneStatusSnapshot {
  const capturedAt = new Date().toISOString();

  const activeWorkItems = getActiveWorkItems(coordinatorStore, 50);
  const failedWorkItems = getRecentFailedWorkItems(coordinatorStore, 50);
  const awaitingRetry = getWorkItemsAwaitingRetry(coordinatorStore);

  const recentExecutions = getRecentSessionsAndExecutions(coordinatorStore, 50);
  const executionTotal = coordinatorStore.db
    .prepare(`select count(*) as c from execution_attempts`)
    .get() as { c: number };

  const toolSummary = getToolCallSummary(coordinatorStore, 50);

  const recentOutbound = getRecentOutboundCommands(outboundStore, 50);
  const outboundCounts = outboundStore.db
    .prepare(`select status, count(*) as c from outbound_handoffs group by status`)
    .all() as Array<{ status: string; c: number }>;
  const outboundTotal = outboundStore.db
    .prepare(`select count(*) as c from outbound_handoffs`)
    .get() as { c: number };

  const outboundByStatus: Record<string, number> = {};
  for (const row of outboundCounts) {
    outboundByStatus[row.status] = row.c;
  }

  const workItemTotal = coordinatorStore.db
    .prepare(`select count(*) as c from work_items`)
    .get() as { c: number };

  const scopeSummary = scopeId
    ? buildScopeDispatchSummary(coordinatorStore, outboundStore, scopeId)
    : null;

  const activeLeases = getActiveLeases(coordinatorStore, 50);
  const leaseTotal = coordinatorStore.db
    .prepare(`select count(*) as c from work_item_leases where released_at is null`)
    .get() as { c: number };

  const staleRecoveries = getRecentStaleLeaseRecoveries(coordinatorStore, 50);
  const recoveryTotal = coordinatorStore.db
    .prepare(`select count(*) as c from work_item_leases where release_reason = 'abandoned'`)
    .get() as { c: number };

  const quiescence = getQuiescenceIndicator(coordinatorStore);

  const stuckWork = getStuckWorkItemSummary(coordinatorStore, {}, capturedAt);
  const stuckOutbound = getStuckOutboundSummary(outboundStore, {}, capturedAt);

  return {
    captured_at: capturedAt,
    work_items: {
      active: activeWorkItems,
      failed_recent: failedWorkItems,
      awaiting_retry: awaitingRetry,
      total_count: workItemTotal.c,
    },
    executions: {
      recent: recentExecutions,
      total_count: executionTotal.c,
    },
    tool_calls: {
      recent: toolSummary.recent,
      by_status: toolSummary.by_status,
      total_count: toolSummary.total_count,
    },
    outbound: {
      recent: recentOutbound,
      by_status: outboundByStatus,
      total_count: outboundTotal.c,
    },
    leases: {
      active: activeLeases,
      total_count: leaseTotal.c,
    },
    stale_recoveries: {
      recent: staleRecoveries,
      total_count: recoveryTotal.c,
    },
    quiescence,
    scope_summary: scopeSummary,
    stuck: {
      work_items: stuckWork,
      outbound_handoffs: stuckOutbound,
    },
  };
}

function rowToProcessExecutionSummary(row: Record<string, unknown>): ProcessExecutionSummary {
  return {
    execution_id: String(row.execution_id),
    intent_id: String(row.intent_id),
    command: String(row.command),
    status: String(row.status) as ProcessExecutionSummary["status"],
    exit_code: row.exit_code !== null && row.exit_code !== undefined ? Number(row.exit_code) : null,
    started_at: row.started_at ? String(row.started_at) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    lease_runner_id: row.lease_runner_id ? String(row.lease_runner_id) : null,
    lease_expires_at: row.lease_expires_at ? String(row.lease_expires_at) : null,
    created_at: String(row.created_at),
  };
}

function rowToIntentSummary(row: Record<string, unknown>): IntentSummary {
  return {
    intent_id: String(row.intent_id),
    intent_type: String(row.intent_type),
    executor_family: String(row.executor_family),
    status: String(row.status),
    confirmation_status: String(row.confirmation_status ?? "unconfirmed") as IntentSummary["confirmation_status"],
    context_id: String(row.context_id),
    target_id: row.target_id ? String(row.target_id) : null,
    idempotency_key: String(row.idempotency_key),
    terminal_reason: row.terminal_reason ? String(row.terminal_reason) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function getProcessExecutionSummaries(
  executionStore: ProcessExecutionStoreView,
  limit = 50,
): { active: ProcessExecutionSummary[]; recent: ProcessExecutionSummary[]; failed_recent: ProcessExecutionSummary[]; total_count: number } {
  const activeRows = executionStore.db
    .prepare(`select * from process_executions where status = 'running' order by started_at desc limit ?`)
    .all(limit) as Record<string, unknown>[];

  const recentRows = executionStore.db
    .prepare(`select * from process_executions where status != 'running' order by created_at desc limit ?`)
    .all(limit) as Record<string, unknown>[];

  const failedRows = executionStore.db
    .prepare(`select * from process_executions where status = 'failed' order by completed_at desc limit ?`)
    .all(limit) as Record<string, unknown>[];

  const totalRow = executionStore.db
    .prepare(`select count(*) as c from process_executions`)
    .get() as { c: number };

  return {
    active: activeRows.map(rowToProcessExecutionSummary),
    recent: recentRows.map(rowToProcessExecutionSummary),
    failed_recent: failedRows.map(rowToProcessExecutionSummary),
    total_count: totalRow.c,
  };
}

function intentSummarySql(whereClause: string, orderClause: string): string {
  return `select
    i.*,
    case
      when i.executor_family = 'process' then coalesce(pe.confirmation_status, 'unconfirmed')
      when i.executor_family = 'mail' then
        case
          when oc.status = 'confirmed' then 'confirmed'
          when oc.status in ('failed_terminal', 'cancelled', 'superseded') then 'confirmation_failed'
          else 'unconfirmed'
        end
      else 'unconfirmed'
    end as confirmation_status
  from intents i
  left join process_executions pe on pe.intent_id = i.intent_id
  left join outbound_handoffs oc on oc.outbound_id = i.target_id
  where ${whereClause}
  order by ${orderClause}`;
}

export function getIntentSummaries(
  intentStore: IntentStoreView,
): { pending: IntentSummary[]; executing: IntentSummary[]; failed_terminal: IntentSummary[]; total_count: number } {
  const pendingRows = intentStore.db
    .prepare(intentSummarySql("i.status = 'admitted'", "i.created_at asc"))
    .all() as Record<string, unknown>[];

  const executingRows = intentStore.db
    .prepare(intentSummarySql("i.status = 'executing'", "i.updated_at desc"))
    .all() as Record<string, unknown>[];

  const failedRows = intentStore.db
    .prepare(intentSummarySql("i.status = 'failed_terminal'", "i.updated_at desc"))
    .all() as Record<string, unknown>[];

  const totalRow = intentStore.db
    .prepare(`select count(*) as c from intents`)
    .get() as { c: number };

  return {
    pending: pendingRows.map(rowToIntentSummary),
    executing: executingRows.map(rowToIntentSummary),
    failed_terminal: failedRows.map(rowToIntentSummary),
    total_count: totalRow.c,
  };
}

export function getIntentExecutionSummaries(
  intentStore: IntentStoreView,
  limit = 100,
): { recent: IntentExecutionSummary[]; failed_recent: IntentExecutionSummary[]; total_count: number } {
  const sql = `select
    i.intent_id,
    i.intent_type,
    i.executor_family,
    i.status as intent_status,
    i.context_id,
    i.idempotency_key,
    i.terminal_reason,
    i.created_at,
    i.updated_at,
    pe.execution_id as process_execution_id,
    pe.command as process_command,
    pe.phase as process_phase,
    pe.confirmation_status as process_confirmation_status,
    pe.exit_code as process_exit_code,
    pe.started_at as process_started_at,
    pe.completed_at as process_completed_at,
    pe.error_message as process_error_message,
    oc.outbound_id as mail_outbound_id,
    oc.action_type as mail_action_type,
    oc.status as mail_status,
    oc.submitted_at as mail_submitted_at,
    oc.confirmed_at as mail_confirmed_at
  from intents i
  left join process_executions pe on pe.intent_id = i.intent_id
  left join outbound_handoffs oc on oc.outbound_id = i.target_id
  order by i.updated_at desc
  limit ?`;

  const failedSql = `select
    i.intent_id,
    i.intent_type,
    i.executor_family,
    i.status as intent_status,
    i.context_id,
    i.idempotency_key,
    i.terminal_reason,
    i.created_at,
    i.updated_at,
    pe.execution_id as process_execution_id,
    pe.command as process_command,
    pe.phase as process_phase,
    pe.confirmation_status as process_confirmation_status,
    pe.exit_code as process_exit_code,
    pe.started_at as process_started_at,
    pe.completed_at as process_completed_at,
    pe.error_message as process_error_message,
    oc.outbound_id as mail_outbound_id,
    oc.action_type as mail_action_type,
    oc.status as mail_status,
    oc.submitted_at as mail_submitted_at,
    oc.confirmed_at as mail_confirmed_at
  from intents i
  left join process_executions pe on pe.intent_id = i.intent_id
  left join outbound_handoffs oc on oc.outbound_id = i.target_id
  where (
    i.status in ('failed_terminal', 'cancelled')
    or (i.executor_family = 'process' and pe.phase = 'failed')
    or (i.executor_family = 'mail' and oc.status in ('failed_terminal', 'cancelled', 'superseded'))
  )
  order by i.updated_at desc
  limit ?`;

  const recentRows = intentStore.db.prepare(sql).all(limit) as Record<string, unknown>[];
  const failedRows = intentStore.db.prepare(failedSql).all(limit) as Record<string, unknown>[];
  const totalRow = intentStore.db.prepare(`select count(*) as c from intents`).get() as { c: number };

  function rowToIntentExecutionSummary(row: Record<string, unknown>): IntentExecutionSummary {
    const executorFamily = String(row.executor_family);
    const phase = executorFamily === "process"
      ? (String(row.process_phase ?? "pending") as IntentExecutionSummary["phase"])
      : executorFamily === "mail"
        ? mapOutboundStatusToPhase(String(row.mail_status ?? "pending"))
        : "pending";

    const confirmationStatus = executorFamily === "process"
      ? (String(row.process_confirmation_status ?? "unconfirmed") as IntentExecutionSummary["confirmation_status"])
      : executorFamily === "mail"
        ? mapOutboundStatusToConfirmation(String(row.mail_status ?? "pending"))
        : "unconfirmed";

    return {
      intent_id: String(row.intent_id),
      intent_type: String(row.intent_type),
      executor_family: executorFamily,
      intent_status: String(row.intent_status),
      confirmation_status: confirmationStatus,
      phase,
      context_id: String(row.context_id),
      idempotency_key: String(row.idempotency_key),
      process_execution_id: row.process_execution_id ? String(row.process_execution_id) : null,
      process_command: row.process_command ? String(row.process_command) : null,
      process_exit_code: row.process_exit_code !== null && row.process_exit_code !== undefined ? Number(row.process_exit_code) : null,
      process_started_at: row.process_started_at ? String(row.process_started_at) : null,
      process_completed_at: row.process_completed_at ? String(row.process_completed_at) : null,
      mail_outbound_id: row.mail_outbound_id ? String(row.mail_outbound_id) : null,
      mail_action_type: row.mail_action_type ? String(row.mail_action_type) : null,
      mail_status: row.mail_status ? (String(row.mail_status) as IntentExecutionSummary["mail_status"]) : null,
      mail_submitted_at: row.mail_submitted_at ? String(row.mail_submitted_at) : null,
      mail_confirmed_at: row.mail_confirmed_at ? String(row.mail_confirmed_at) : null,
      error_message: row.process_error_message
        ? String(row.process_error_message)
        : null,
      terminal_reason: row.terminal_reason ? String(row.terminal_reason) : null,
      created_at: String(row.transition_at),
      updated_at: String(row.updated_at),
    };
  }

  return {
    recent: recentRows.map(rowToIntentExecutionSummary),
    failed_recent: failedRows.map(rowToIntentExecutionSummary),
    total_count: totalRow.c,
  };
}

export function getProcessExecutionDetails(
  executionStore: ProcessExecutionStoreView,
  limit = 50,
): ProcessExecutionDetail[] {
  const rows = executionStore.db
    .prepare(`select * from process_executions order by created_at desc limit ?`)
    .all(limit) as Record<string, unknown>[];

  return rows.map((row) => ({
    execution_id: String(row.execution_id),
    intent_id: String(row.intent_id),
    phase: String(row.phase ?? row.status ?? "pending") as ProcessExecutionDetail["phase"],
    confirmation_status: String(row.confirmation_status ?? "unconfirmed") as ProcessExecutionDetail["confirmation_status"],
    command: String(row.command),
    args: JSON.parse(String(row.args_json ?? "[]")) as string[],
    cwd: row.cwd ? String(row.cwd) : null,
    env_keys: row.env_json ? Object.keys(JSON.parse(String(row.env_json)) as Record<string, string>) : [],
    exit_code: row.exit_code !== null && row.exit_code !== undefined ? Number(row.exit_code) : null,
    stdout_preview: String(row.stdout ?? "").slice(0, 500),
    stderr_preview: String(row.stderr ?? "").slice(0, 500),
    error_message: row.error_message ? String(row.error_message) : null,
    started_at: row.started_at ? String(row.started_at) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    confirmed_at: row.confirmed_at ? String(row.confirmed_at) : null,
    lease_runner_id: row.lease_runner_id ? String(row.lease_runner_id) : null,
    lease_expires_at: row.lease_expires_at ? String(row.lease_expires_at) : null,
    created_at: String(row.created_at),
  }));
}

export function getIntentLifecycleTransitions(
  db: import("better-sqlite3").Database,
  intentId: string,
): IntentLifecycleTransition[] {
  const intentRows = db
    .prepare(`select created_at, updated_at, status from intents where intent_id = ?`)
    .all(intentId) as Array<{ created_at: string; updated_at: string; status: string }>;

  const processRows = db
    .prepare(`select created_at, phase from process_executions where intent_id = ? order by created_at asc`)
    .all(intentId) as Array<{ created_at: string; phase: string }>;

  const outboundRows = db
    .prepare(`select t.transition_at as created_at, t.from_status, t.to_status, t.reason
               from outbound_transitions t
               join intents i on i.target_id = t.outbound_id
               where i.intent_id = ?
               order by t.transition_at asc`)
    .all(intentId) as Array<{ created_at: string; from_status: string; to_status: string; reason: string | null }>;

  const transitions: IntentLifecycleTransition[] = [];

  for (const row of intentRows) {
    transitions.push({
      transition_at: row.created_at,
      from_status: null,
      to_status: row.status,
      source: "intent",
      detail: "admitted",
    });
  }

  for (const row of processRows) {
    transitions.push({
      transition_at: row.created_at,
      from_status: null,
      to_status: row.phase,
      source: "process",
      detail: null,
    });
  }

  for (const row of outboundRows) {
    transitions.push({
      transition_at: row.created_at,
      from_status: row.from_status,
      to_status: row.to_status,
      source: "outbound",
      detail: row.reason,
    });
  }

  transitions.sort((a, b) => a.transition_at.localeCompare(b.transition_at));
  return transitions;
}

export function getRecentFacts(
  factStore: Pick<FactStoreView, "db">,
  limit = 100,
): FactSummary[] {
  const rows = factStore.db
    .prepare(
      `select fact_id, fact_type, source_id, source_record_id, admitted_at, created_at
       from facts
       order by created_at desc
       limit ?`,
    )
    .all(limit) as Record<string, unknown>[];

  return rows.map((row) => ({
    fact_id: String(row.fact_id),
    fact_type: String(row.fact_type),
    source_id: String(row.source_id),
    source_record_id: String(row.source_record_id),
    admitted: row.admitted_at !== null && row.admitted_at !== undefined,
    created_at: String(row.created_at),
  }));
}

export function getContextSummaries(
  coordinatorStore: Pick<CoordinatorStoreView, "db">,
  limit = 100,
): ContextSummary[] {
  const rows = coordinatorStore.db
    .prepare(
      `select context_id, scope_id, status, primary_charter, assigned_agent,
              last_message_at, created_at, updated_at
       from context_records
       order by updated_at desc
       limit ?`,
    )
    .all(limit) as Record<string, unknown>[];

  return rows.map((row) => ({
    context_id: String(row.context_id),
    scope_id: String(row.scope_id),
    status: String(row.status),
    primary_charter: String(row.primary_charter),
    assigned_agent: row.assigned_agent ? String(row.assigned_agent) : null,
    last_message_at: row.last_message_at ? String(row.last_message_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));
}

export function getWorkerStatuses(
  registry: WorkerRegistryView,
  coordinatorStore: CoordinatorStoreView,
  intentStore: IntentStoreView,
  executionStore: ProcessExecutionStoreView,
): WorkerStatusObservation[] {
  const workers = registry.listWorkers();

  // Pre-compute durable-state activity per executor family
  const activeControlPlane = coordinatorStore.db
    .prepare(`select count(*) as c from work_items where status in ('opened', 'leased', 'executing')`)
    .get() as { c: number };

  const activeProcess = executionStore.db
    .prepare(`select count(*) as c from process_executions where status = 'running'`)
    .get() as { c: number };

  const pendingByFamily: Record<string, number> = {};
  const pendingRows = intentStore.db
    .prepare(`select executor_family, count(*) as c from intents where status = 'admitted' group by executor_family`)
    .all() as Array<{ executor_family: string; c: number }>;
  for (const row of pendingRows) {
    pendingByFamily[row.executor_family] = row.c;
  }

  return workers.map((identity) => {
    const hasActiveWork = identity.executor_family === "process"
      ? activeProcess.c > 0
      : activeControlPlane.c > 0;

    return {
      worker_id: identity.worker_id,
      executor_family: identity.executor_family,
      concurrency_policy: identity.concurrency_policy,
      description: identity.description,
      registered: true,
      has_active_work: hasActiveWork,
      pending_count: pendingByFamily[identity.executor_family] ?? 0,
    };
  });
}

export function getWorkItemTimeline(
  coordinatorStore: CoordinatorStoreView,
  workItemId: string,
): WorkItemTimeline {
  const workItem = coordinatorStore.getWorkItem(workItemId);
  const executions = workItem
    ? coordinatorStore.getExecutionAttemptsByWorkItem(workItem.work_item_id).map(toExecutionSummary)
    : [];

  let contextFacts: { fact_id: string; fact_type: string; source_id: string; admitted: boolean }[] = [];
  if (workItem?.context_json) {
    try {
      const parsed = JSON.parse(workItem.context_json) as PolicyContext;
      contextFacts = (parsed.facts ?? []).map((f) => ({
        fact_id: f.fact_id,
        fact_type: f.fact_type,
        source_id: f.provenance.source_id,
        admitted: true, // Facts in context_json were admitted
      }));
    } catch {
      // ignore parse errors
    }
  }

  const decisions = workItem
    ? coordinatorStore.getDecisionsByContext(workItem.context_id, workItem.scope_id).map((d) => ({
        decision_id: d.decision_id,
        approved_action: d.approved_action,
        decided_at: d.decided_at,
        outbound_id: d.outbound_id,
      }))
    : [];

  const supersededRow = coordinatorStore.db
    .prepare(
      `select work_item_id from work_items where context_id = ? and status = 'opened' and opened_for_revision_id > ? limit 1`,
    )
    .get(workItem?.context_id ?? "", workItem?.opened_for_revision_id ?? "") as
    | { work_item_id: string }
    | undefined;

  return {
    work_item: workItem ? rowToWorkItemSummary(workItem as unknown as Record<string, unknown>) : null,
    context_facts: contextFacts,
    executions,
    decisions,
    superseded_by: supersededRow?.work_item_id ?? null,
  };
}

export function getContextTimeline(
  coordinatorStore: CoordinatorStoreView,
  contextId: string,
): ContextTimeline {
  const contextRow = coordinatorStore.db
    .prepare(`select * from context_records where context_id = ?`)
    .get(contextId) as Record<string, unknown> | undefined;

  const revisionRows = coordinatorStore.db
    .prepare(
      `select ordinal, observed_at, trigger_event_id from context_revisions where context_id = ? order by ordinal asc`,
    )
    .all(contextId) as Array<{ ordinal: number; observed_at: string; trigger_event_id: string | null }>;

  const workItemRows = coordinatorStore.db
    .prepare(
      `select * from work_items where context_id = ? order by created_at asc`,
    )
    .all(contextId) as Record<string, unknown>[];

  const scopeId = contextRow ? String(contextRow.scope_id) : "";
  const outputs = scopeId
    ? coordinatorStore.getEvaluationsByContext(contextId, scopeId).map((e) => ({
        output_id: e.evaluation_id,
        charter_id: e.charter_id,
        summary: e.summary,
        analyzed_at: e.analyzed_at,
      }))
    : [];

  return {
    context: contextRow ? rowToContextSummary(contextRow) : null,
    revisions: revisionRows.map((r) => ({
      ordinal: r.ordinal,
      observed_at: r.observed_at,
      trigger_event_id: r.trigger_event_id,
    })),
    work_items: workItemRows.map(rowToWorkItemSummary),
    outputs,
  };
}

function rowToContextSummary(row: Record<string, unknown>): ContextSummary {
  return {
    context_id: String(row.context_id),
    scope_id: String(row.scope_id),
    status: String(row.status),
    primary_charter: String(row.primary_charter),
    assigned_agent: row.assigned_agent ? String(row.assigned_agent) : null,
    last_message_at: row.last_message_at ? String(row.last_message_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function getFactTimeline(
  coordinatorStore: CoordinatorStoreView,
  factStore: Pick<FactStoreView, "getById">,
  factId: string,
): FactTimeline {
  const fact = factStore.getById(factId);

  // Find work items whose context_json references this fact_id
  const workItemRows = coordinatorStore.db
    .prepare(`select work_item_id, context_id, status, created_at from work_items where context_json like ?`)
    .all(`%${factId}%`) as Array<{ work_item_id: string; context_id: string; status: string; created_at: string }>;

  return {
    fact: fact
      ? {
          fact_id: fact.fact_id,
          fact_type: fact.fact_type,
          source_id: fact.provenance.source_id,
          source_record_id: fact.provenance.source_record_id,
          admitted: true, // If it's referenced in context_json, it was admitted
          created_at: fact.created_at,
        }
      : null,
    work_items: workItemRows.map((r) => ({
      work_item_id: r.work_item_id,
      context_id: r.context_id,
      status: r.status,
      created_at: r.created_at,
    })),
  };
}

export function getUnifiedTimeline(
  coordinatorStore: CoordinatorStoreView,
  factStore: Pick<FactStoreView, "db">,
  limit = 100,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  const factRows = factStore.db
    .prepare(`select fact_id, fact_type, source_id, admitted_at, created_at from facts order by created_at desc limit ?`)
    .all(limit) as Array<{ fact_id: string; fact_type: string; source_id: string; admitted_at: string | null; created_at: string }>;

  for (const row of factRows) {
    events.push({
      event_at: row.created_at,
      kind: row.admitted_at ? "fact_admitted" : "fact_ingested",
      scope_id: row.source_id,
      context_id: null,
      fact_id: row.fact_id,
      work_item_id: null,
      detail: `${row.fact_type} from ${row.source_id}`,
    });
  }

  const workRows = coordinatorStore.db
    .prepare(`select work_item_id, context_id, scope_id, status, opened_for_revision_id, created_at, updated_at from work_items order by created_at desc limit ?`)
    .all(limit) as Array<{
      work_item_id: string;
      context_id: string;
      scope_id: string;
      status: string;
      opened_for_revision_id: string;
      created_at: string;
      updated_at: string;
    }>;

  for (const row of workRows) {
    let kind: TimelineEvent["kind"] = "work_opened";
    if (row.status === "superseded") kind = "work_superseded";
    else if (row.status === "resolved") kind = "work_resolved";
    else if (row.status === "failed_terminal" || row.status === "failed_retryable") kind = "work_failed";

    events.push({
      event_at: row.created_at,
      kind,
      scope_id: row.scope_id,
      context_id: row.context_id,
      fact_id: null,
      work_item_id: row.work_item_id,
      detail: `${row.status} (rev ${row.opened_for_revision_id})`,
    });
  }

  const revisionRows = coordinatorStore.db
    .prepare(`select context_id, ordinal, observed_at, trigger_event_id from context_revisions order by observed_at desc limit ?`)
    .all(limit) as Array<{ context_id: string; ordinal: number; observed_at: string; trigger_event_id: string | null }>;

  for (const row of revisionRows) {
    events.push({
      event_at: row.observed_at,
      kind: "context_formed",
      scope_id: "",
      context_id: row.context_id,
      fact_id: row.trigger_event_id,
      work_item_id: null,
      detail: `revision ${row.ordinal}`,
    });
  }

  events.sort((a, b) => b.event_at.localeCompare(a.event_at));
  return events.slice(0, limit);
}

function detectVerticalFromContext(contextId: string): string {
  if (contextId.startsWith("timer:")) return "timer";
  if (contextId.startsWith("webhook:")) return "webhook";
  if (contextId.startsWith("fs:") || contextId.startsWith("filesystem:")) return "filesystem";
  return "mail";
}

function detectVerticalFromFactType(factType: string): string {
  if (factType.startsWith("mail.")) return "mail";
  if (factType.startsWith("timer.")) return "timer";
  if (factType.startsWith("webhook.")) return "webhook";
  if (factType.startsWith("filesystem.")) return "filesystem";
  return "unknown";
}

export function buildOverviewSnapshot(
  coordinatorStore: CoordinatorStoreView,
  intentStore: IntentStoreView,
  executionStore: ProcessExecutionStoreView,
  factStore?: Pick<FactStoreView, "db">,
): OverviewSnapshot {
  const capturedAt = new Date().toISOString();

  // Global fact summary by vertical
  const factByVertical: Record<string, number> = {};
  let totalRecentFacts = 0;
  if (factStore) {
    const factRows = factStore.db
      .prepare(
        `select fact_type, count(*) as c from facts where created_at >= datetime('now', '-24 hours') group by fact_type`,
      )
      .all() as Array<{ fact_type: string; c: number }>;
    for (const row of factRows) {
      const vertical = detectVerticalFromFactType(row.fact_type);
      factByVertical[vertical] = (factByVertical[vertical] ?? 0) + row.c;
      totalRecentFacts += row.c;
    }
  }

  // Work items grouped by scope
  const workItemRows = coordinatorStore.db
    .prepare(
      `select scope_id, context_id, status, updated_at from work_items`,
    )
    .all() as Array<{ scope_id: string; context_id: string; status: string; updated_at: string }>;

  const scopeMap = new Map<string, ScopeOverview>();
  for (const row of workItemRows) {
    let scope = scopeMap.get(row.scope_id);
    if (!scope) {
      scope = {
        scope_id: row.scope_id,
        last_activity_at: null,
        active_verticals: [],
        work_items: { opened: 0, leased: 0, executing: 0, failed_retryable: 0, failed_terminal: 0 },
        intents: { pending: 0, executing: 0 },
        executions: { active: 0, failed_recent: 0 },
      };
      scopeMap.set(row.scope_id, scope);
    }

    if (!scope.last_activity_at || row.updated_at > scope.last_activity_at) {
      scope.last_activity_at = row.updated_at;
    }

    const vertical = detectVerticalFromContext(row.context_id);
    if (!scope.active_verticals.includes(vertical)) {
      scope.active_verticals.push(vertical);
    }

    if (row.status === "opened") scope.work_items.opened++;
    else if (row.status === "leased") scope.work_items.leased++;
    else if (row.status === "executing") scope.work_items.executing++;
    else if (row.status === "failed_retryable") scope.work_items.failed_retryable++;
    else if (row.status === "failed_terminal") scope.work_items.failed_terminal++;
  }

  // Intent counts by scope (inferred from context_id on intents table)
  const intentRows = intentStore.db
    .prepare(
      `select context_id, status from intents where status in ('admitted', 'executing')`,
    )
    .all() as Array<{ context_id: string; status: string }>;

  for (const row of intentRows) {
    // Infer scope from context_id: if it looks like a timer context, we don't have direct scope.
    // Heuristic: use context_id as scope_id for timer/webhook, since we don't store scope_id on intents.
    const vertical = detectVerticalFromContext(row.context_id);
    const scopeId = vertical === "mail" ? row.context_id : row.context_id;

    let scope = scopeMap.get(scopeId);
    if (!scope) {
      scope = {
        scope_id: scopeId,
        last_activity_at: null,
        active_verticals: [vertical],
        work_items: { opened: 0, leased: 0, executing: 0, failed_retryable: 0, failed_terminal: 0 },
        intents: { pending: 0, executing: 0 },
        executions: { active: 0, failed_recent: 0 },
      };
      scopeMap.set(scopeId, scope);
    }

    if (row.status === "admitted") scope.intents.pending++;
    else if (row.status === "executing") scope.intents.executing++;
  }

  // Process executions: join with intents to get context_id, then infer scope
  const processRows = executionStore.db
    .prepare(
      `select pe.status, pe.started_at, pe.completed_at, i.context_id
       from process_executions pe
       left join intents i on i.intent_id = pe.intent_id`,
    )
    .all() as Array<{ status: string; started_at: string | null; completed_at: string | null; context_id: string | null }>;

  for (const row of processRows) {
    const scopeId = row.context_id ?? "unknown";
    let scope = scopeMap.get(scopeId);
    if (!scope) {
      scope = {
        scope_id: scopeId,
        last_activity_at: null,
        active_verticals: ["process"],
        work_items: { opened: 0, leased: 0, executing: 0, failed_retryable: 0, failed_terminal: 0 },
        intents: { pending: 0, executing: 0 },
        executions: { active: 0, failed_recent: 0 },
      };
      scopeMap.set(scopeId, scope);
    }
    if (!scope.active_verticals.includes("process")) {
      scope.active_verticals.push("process");
    }
    if (row.status === "running") {
      scope.executions.active++;
    } else if (row.status === "failed") {
      scope.executions.failed_recent++;
    }
  }

  // Execution attempts (control plane executions) by scope
  const attemptRows = coordinatorStore.db
    .prepare(
      `select ea.status, ea.started_at, wi.scope_id, wi.context_id
       from execution_attempts ea
       join work_items wi on wi.work_item_id = ea.work_item_id`,
    )
    .all() as Array<{ status: string; started_at: string; scope_id: string; context_id: string }>;

  for (const row of attemptRows) {
    const scope = scopeMap.get(row.scope_id);
    if (scope && row.status === "active") {
      scope.executions.active++;
    }
  }

  // Recent failures
  const failures: OverviewFailureSummary[] = [];

  const failedWorkItems = coordinatorStore.db
    .prepare(
      `select scope_id, context_id, work_item_id, updated_at as failed_at, error_message, status
       from work_items
       where status in ('failed_retryable', 'failed_terminal')
         and updated_at >= datetime('now', '-24 hours')`,
    )
    .all() as Array<{ scope_id: string; context_id: string; work_item_id: string; failed_at: string; error_message: string | null; status: string }>;

  for (const row of failedWorkItems) {
    failures.push({
      scope_id: row.scope_id,
      context_id: row.context_id,
      work_item_id: row.work_item_id,
      execution_id: null,
      failed_at: row.failed_at,
      error_message: row.error_message,
      vertical: detectVerticalFromContext(row.context_id),
    });
  }

  const crashedAttempts = coordinatorStore.db
    .prepare(
      `select wi.scope_id, wi.context_id, ea.work_item_id, ea.execution_id, ea.completed_at as failed_at, ea.error_message
       from execution_attempts ea
       join work_items wi on wi.work_item_id = ea.work_item_id
       where ea.status = 'crashed' and ea.completed_at >= datetime('now', '-24 hours')`,
    )
    .all() as Array<{ scope_id: string; context_id: string; work_item_id: string; execution_id: string; failed_at: string; error_message: string | null }>;

  for (const row of crashedAttempts) {
    failures.push({
      scope_id: row.scope_id,
      context_id: row.context_id,
      work_item_id: row.work_item_id,
      execution_id: row.execution_id,
      failed_at: row.failed_at,
      error_message: row.error_message,
      vertical: detectVerticalFromContext(row.context_id),
    });
  }

  const failedProcesses = executionStore.db
    .prepare(
      `select pe.status, pe.completed_at as failed_at, pe.intent_id, i.context_id
       from process_executions pe
       left join intents i on i.intent_id = pe.intent_id
       where pe.status = 'failed' and pe.completed_at >= datetime('now', '-24 hours')`,
    )
    .all() as Array<{ status: string; failed_at: string; intent_id: string; context_id: string | null }>;

  for (const row of failedProcesses) {
    const scopeId = row.context_id ?? "unknown";
    failures.push({
      scope_id: scopeId,
      context_id: row.context_id ?? scopeId,
      work_item_id: null,
      execution_id: null,
      failed_at: row.failed_at,
      error_message: `Process execution failed for intent ${row.intent_id}`,
      vertical: "process",
    });
  }

  failures.sort((a, b) => b.failed_at.localeCompare(a.failed_at));

  // Global totals
  const totalWorkItems = coordinatorStore.db.prepare(`select count(*) as c from work_items`).get() as { c: number };
  const totalActiveExecutions =
    (coordinatorStore.db.prepare(`select count(*) as c from execution_attempts where status = 'active'`).get() as { c: number }).c +
    (executionStore.db.prepare(`select count(*) as c from process_executions where status = 'running'`).get() as { c: number }).c;
  const totalPendingIntents = intentStore.db.prepare(`select count(*) as c from intents where status = 'admitted'`).get() as { c: number };

  return {
    captured_at: capturedAt,
    _meta: {
      source_classifications: {
        scopes: "derived",
        facts: "authoritative",
        recent_failures: "derived",
        global: "derived",
      },
    },
    scopes: Array.from(scopeMap.values()).sort((a, b) => (b.last_activity_at ?? "").localeCompare(a.last_activity_at ?? "")),
    facts: {
      total_recent: totalRecentFacts,
      by_vertical: factByVertical,
    },
    recent_failures: failures.slice(0, 50),
    global: {
      total_work_items: totalWorkItems.c,
      total_active_executions: totalActiveExecutions,
      total_pending_intents: totalPendingIntents.c,
      total_recent_facts: totalRecentFacts,
      total_recent_failures: failures.length,
    },
  };
}

/**
 * Deep-dive evaluation detail with safely parsed JSON fields.
 * Returns undefined if the evaluation does not exist.
 */
export function getEvaluationDetail(
  store: Pick<CoordinatorStoreView, "db">,
  evaluationId: string,
): import("./types.js").EvaluationDetail | undefined {
  const row = store.db
    .prepare(`select * from evaluations where evaluation_id = ?`)
    .get(evaluationId) as Record<string, unknown> | undefined;

  if (!row) return undefined;

  function safeParse(json: string | null): unknown {
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch {
      return json;
    }
  }

  return {
    evaluation_id: String(row.evaluation_id),
    execution_id: String(row.execution_id),
    work_item_id: String(row.work_item_id),
    context_id: String(row.context_id),
    scope_id: String(row.scope_id),
    charter_id: String(row.charter_id),
    role: String(row.role) as "primary" | "secondary",
    output_version: String(row.output_version),
    analyzed_at: String(row.analyzed_at),
    outcome: String(row.outcome),
    summary: String(row.summary),
    recommended_action_class: row.recommended_action_class ? String(row.recommended_action_class) : null,
    created_at: String(row.created_at),
    confidence: safeParse(row.confidence_json as string | null),
    classifications: safeParse(row.classifications_json as string | null),
    facts: safeParse(row.facts_json as string | null),
    escalations: safeParse(row.escalations_json as string | null),
    proposed_actions: safeParse(row.proposed_actions_json as string | null),
    tool_requests: safeParse(row.tool_requests_json as string | null),
  };
}

/**
 * Deep-dive decision detail with safely parsed JSON fields.
 * Returns undefined if the decision does not exist.
 */
export function getDecisionDetail(
  store: Pick<CoordinatorStoreView, "db">,
  decisionId: string,
): import("./types.js").DecisionDetail | undefined {
  const row = store.db
    .prepare(`select * from foreman_decisions where decision_id = ?`)
    .get(decisionId) as Record<string, unknown> | undefined;

  if (!row) return undefined;

  function safeParse(json: string | null): unknown {
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch {
      return json;
    }
  }

  const sourceCharterIdsRaw = row.source_charter_ids_json as string | null;
  let sourceCharterIds: string[] = [];
  if (sourceCharterIdsRaw) {
    try {
      sourceCharterIds = JSON.parse(sourceCharterIdsRaw);
      if (!Array.isArray(sourceCharterIds)) sourceCharterIds = [];
    } catch {
      sourceCharterIds = [];
    }
  }

  return {
    decision_id: String(row.decision_id),
    context_id: String(row.context_id),
    scope_id: String(row.scope_id),
    approved_action: String(row.approved_action),
    rationale: String(row.rationale),
    decided_at: String(row.decided_at),
    outbound_id: row.outbound_id ? String(row.outbound_id) : null,
    created_by: String(row.created_by),
    payload: safeParse(row.payload_json as string | null),
    source_charter_ids: sourceCharterIds,
  };
}

/**
 * Deep-dive execution attempt detail with safely parsed JSON fields.
 * Returns undefined if the execution does not exist.
 */
export function getExecutionDetail(
  store: Pick<CoordinatorStoreView, "db">,
  executionId: string,
): import("./types.js").ExecutionDetail | undefined {
  const row = store.db
    .prepare(`select * from execution_attempts where execution_id = ?`)
    .get(executionId) as Record<string, unknown> | undefined;

  if (!row) return undefined;

  function safeParse(json: string | null): unknown {
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch {
      return json;
    }
  }

  return {
    execution_id: String(row.execution_id),
    work_item_id: String(row.work_item_id),
    revision_id: String(row.revision_id),
    session_id: row.session_id ? String(row.session_id) : null,
    status: String(row.status) as import("../coordinator/types.js").ExecutionAttemptStatus,
    started_at: String(row.started_at),
    completed_at: row.completed_at ? String(row.completed_at) : null,
    error_message: row.error_message ? String(row.error_message) : null,
    runtime_envelope: safeParse(row.runtime_envelope_json as string | null),
    outcome: safeParse(row.outcome_json as string | null),
  };
}

/**
 * All evaluation details for a context, ordered by analyzed_at descending.
 */
export function getEvaluationsByContextDetail(
  store: Pick<CoordinatorStoreView, "db">,
  contextId: string,
  scopeId: string,
): import("./types.js").EvaluationDetail[] {
  const rows = store.db
    .prepare(
      `select * from evaluations where context_id = ? and scope_id = ? order by analyzed_at desc`,
    )
    .all(contextId, scopeId) as Record<string, unknown>[];

  function safeParse(json: string | null): unknown {
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch {
      return json;
    }
  }

  return rows.map((row) => ({
    evaluation_id: String(row.evaluation_id),
    execution_id: String(row.execution_id),
    work_item_id: String(row.work_item_id),
    context_id: String(row.context_id),
    scope_id: String(row.scope_id),
    charter_id: String(row.charter_id),
    role: String(row.role) as "primary" | "secondary",
    output_version: String(row.output_version),
    analyzed_at: String(row.analyzed_at),
    outcome: String(row.outcome),
    summary: String(row.summary),
    recommended_action_class: row.recommended_action_class ? String(row.recommended_action_class) : null,
    created_at: String(row.created_at),
    confidence: safeParse(row.confidence_json as string | null),
    classifications: safeParse(row.classifications_json as string | null),
    facts: safeParse(row.facts_json as string | null),
    escalations: safeParse(row.escalations_json as string | null),
    proposed_actions: safeParse(row.proposed_actions_json as string | null),
    tool_requests: safeParse(row.tool_requests_json as string | null),
  }));
}

/**
 * Redact preview_work payloads to a safe summary before exposure.
 * All other action types return a generic safe summary.
 */
function redactOperatorActionPayload(
  actionType: string,
  payloadJson: string | null,
  targetId: string | null,
  scopeId: string,
): string {
  if (actionType === "preview_work") {
    let contextId: string | undefined;
    let factCount: number | undefined;
    let previewDurationMs: number | undefined;
    let error: string | undefined;

    if (payloadJson) {
      try {
        const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
        if (typeof parsed.contextId === "string") contextId = parsed.contextId;
        if (typeof parsed.context_id === "string") contextId = parsed.context_id;
        if (typeof parsed.fact_ids === "object" && Array.isArray(parsed.fact_ids)) {
          factCount = parsed.fact_ids.length;
        }
        if (typeof parsed.facts === "object" && Array.isArray(parsed.facts)) {
          factCount = parsed.facts.length;
        }
        if (typeof parsed.fact_count === "number") factCount = parsed.fact_count;
        if (typeof parsed.preview_duration_ms === "number") previewDurationMs = parsed.preview_duration_ms;
        if (typeof parsed.error === "string") error = parsed.error;
      } catch {
        // ignore invalid json
      }
    }

    const summary: Record<string, unknown> = { scope_id: scopeId };
    if (contextId) summary.context_id = contextId;
    if (factCount !== undefined) summary.fact_count = factCount;
    if (previewDurationMs !== undefined) summary.preview_duration_ms = previewDurationMs;
    if (error) summary.error = error;
    return JSON.stringify(summary);
  }

  // Safe actions: expose only target reference, never raw payload_json
  return targetId ? `target: ${targetId}` : "—";
}

function rowToOperatorActionSummary(row: Record<string, unknown>): OperatorActionSummary {
  const actionType = String(row.action_type);
  let contextId: string | null = null;
  let workItemId: string | null = null;

  // Derive context_id / work_item_id from action type semantics.
  // Gaps: actions that do not match the known types below will leave both
  // context_id and work_item_id as null. New action types from future tasks
  // (e.g. Task 238 draft dispositions) should extend this branch rather than
  // adding one-off JOINs, keeping the audit surface generic.
  if (actionType === "retry_work_item" || actionType === "acknowledge_alert") {
    workItemId = row.target_id ? String(row.target_id) : null;
    if (row.work_item_context_id) contextId = String(row.work_item_context_id);
  } else if (actionType === "derive_work" || actionType === "preview_work") {
    contextId = row.target_id ? String(row.target_id) : null;
  } else if (
    actionType === "reject_draft" ||
    actionType === "mark_reviewed" ||
    actionType === "handled_externally"
  ) {
    if (row.outbound_context_id) contextId = String(row.outbound_context_id);
  }

  return {
    action_id: String(row.request_id),
    action_type: actionType,
    actor: typeof row.requested_by === "string" ? row.requested_by : "operator",
    scope_id: String(row.scope_id),
    context_id: contextId,
    work_item_id: workItemId,
    payload_summary: redactOperatorActionPayload(actionType, row.payload_json as string | null, row.target_id as string | null, String(row.scope_id)),
    created_at: String(row.requested_at),
  };
}

/**
 * Recent operator actions across all scopes.
 */
export function getRecentOperatorActions(
  store: Pick<CoordinatorStoreView, "db">,
  limit = 50,
  since?: string,
): OperatorActionSummary[] {
  const sql = since
    ? `select * from operator_action_requests where requested_at >= ? order by requested_at desc limit ?`
    : `select * from operator_action_requests order by requested_at desc limit ?`;
  const stmt = store.db.prepare(sql);
  const rows = since
    ? (stmt.all(since, limit) as Record<string, unknown>[])
    : (stmt.all(limit) as Record<string, unknown>[]);
  return rows.map(rowToOperatorActionSummary);
}

/**
 * Recent operator actions for a specific scope.
 */
export function getOperatorActionsForScope(
  store: Pick<CoordinatorStoreView, "db">,
  scopeId: string,
  limit = 50,
  since?: string,
): OperatorActionSummary[] {
  const sql = since
    ? `select * from operator_action_requests where scope_id = ? and requested_at >= ? order by requested_at desc limit ?`
    : `select * from operator_action_requests where scope_id = ? order by requested_at desc limit ?`;
  const stmt = store.db.prepare(sql);
  const rows = since
    ? (stmt.all(scopeId, since, limit) as Record<string, unknown>[])
    : (stmt.all(scopeId, limit) as Record<string, unknown>[]);
  return rows.map(rowToOperatorActionSummary);
}

/**
 * Recent operator actions related to a specific context.
 * Includes actions where target_id is the context directly, or where
 * the target is a work_item or outbound_handoff belonging to the context.
 */
export function getOperatorActionsForContext(
  store: Pick<CoordinatorStoreView, "db">,
  contextId: string,
  limit = 50,
  since?: string,
): OperatorActionSummary[] {
  const sql = since
    ? `select o.*, w.context_id as work_item_context_id, h.context_id as outbound_context_id
       from operator_action_requests o
       left join work_items w on o.target_id = w.work_item_id
       left join outbound_handoffs h on o.target_id = h.outbound_id
       where (o.target_id = ? or w.context_id = ? or h.context_id = ?)
         and o.requested_at >= ?
       order by o.requested_at desc limit ?`
    : `select o.*, w.context_id as work_item_context_id, h.context_id as outbound_context_id
       from operator_action_requests o
       left join work_items w on o.target_id = w.work_item_id
       left join outbound_handoffs h on o.target_id = h.outbound_id
       where (o.target_id = ? or w.context_id = ? or h.context_id = ?)
       order by o.requested_at desc limit ?`;
  const stmt = store.db.prepare(sql);
  const rows = since
    ? (stmt.all(contextId, contextId, contextId, since, limit) as Record<string, unknown>[])
    : (stmt.all(contextId, contextId, contextId, limit) as Record<string, unknown>[]);
  return rows.map(rowToOperatorActionSummary);
}

function deriveReviewStatus(status: OutboundStatus): import("./types.js").DraftReviewStatus {
  switch (status) {
    case "draft_ready":
      return "awaiting_review";
    case "approved_for_send":
      return "approved_for_send";
    case "sending":
      return "sending";
    case "submitted":
      return "submitted";
    case "confirmed":
      return "confirmed";
    case "blocked_policy":
      return "blocked";
    case "cancelled":
      return "cancelled";
    case "failed_terminal":
      return "failed";
    case "retry_wait":
      return "failed";
    default:
      return "awaiting_review";
  }
}

function deriveAvailableActions(
  status: OutboundStatus,
  actionType: string,
): string[] {
  const actions: string[] = [];
  if (status === "draft_ready") {
    actions.push("mark_reviewed", "reject_draft", "handled_externally");
    if (actionType === "send_reply" || actionType === "send_new_message") {
      actions.push("approve_draft_for_send");
    }
  }
  if (status === "blocked_policy") {
    actions.push("reject_draft");
  }
  return actions;
}

/**
 * Deep-dive draft review detail that unifies outbound command, decision,
 * evaluation, and available next actions. Returns undefined if the outbound
 * command does not exist.
 */
export function getDraftReviewDetail(
  outboundStore: OutboundStoreView,
  coordinatorStore: CoordinatorStoreView,
  outboundId: string,
): import("./types.js").DraftReviewDetail | undefined {
  const outboundRow = outboundStore.db
    .prepare(
      `select
         oh.*,
         ov.subject, ov.body_text, ov.to_json
       from outbound_handoffs oh
       left join outbound_versions ov
         on oh.outbound_id = ov.outbound_id
         and oh.latest_version = ov.version
       where oh.outbound_id = ?`,
    )
    .get(outboundId) as Record<string, unknown> | undefined;

  if (!outboundRow) return undefined;

  const decisionRow = coordinatorStore.db
    .prepare(
      `select decision_id, approved_action, rationale, decided_at, outbound_id
       from foreman_decisions
       where outbound_id = ?`,
    )
    .get(outboundId) as Record<string, unknown> | undefined;

  const contextId = String(outboundRow.context_id);
  const scopeId = String(outboundRow.scope_id);

  const evaluationRow = coordinatorStore.db
    .prepare(
      `select evaluation_id, charter_id, summary, outcome, analyzed_at
       from evaluations
       where context_id = ? and scope_id = ?
       order by analyzed_at desc
       limit 1`,
    )
    .get(contextId, scopeId) as Record<string, unknown> | undefined;

  const status = String(outboundRow.status) as OutboundStatus;
  const actionType = String(outboundRow.action_type);

  let to: string[] | null = null;
  try {
    to = JSON.parse(String(outboundRow.to_json ?? "[]")) as string[];
  } catch {
    // ignore
  }

  return {
    outbound_id: outboundId,
    context_id: contextId,
    scope_id: scopeId,
    action_type: actionType,
    status,
    review_status: deriveReviewStatus(status),
    created_at: String(outboundRow.created_at),
    submitted_at: outboundRow.submitted_at ? String(outboundRow.submitted_at) : null,
    confirmed_at: outboundRow.confirmed_at ? String(outboundRow.confirmed_at) : null,
    subject: outboundRow.subject ? String(outboundRow.subject) : null,
    body_preview: outboundRow.body_text
      ? String(outboundRow.body_text).slice(0, 500)
      : null,
    to,
    decision_id: decisionRow ? String(decisionRow.decision_id) : null,
    decision_rationale: decisionRow ? String(decisionRow.rationale) : null,
    decided_at: decisionRow ? String(decisionRow.decided_at) : null,
    approved_action: decisionRow ? String(decisionRow.approved_action) : null,
    evaluation_id: evaluationRow ? String(evaluationRow.evaluation_id) : null,
    charter_id: evaluationRow ? String(evaluationRow.charter_id) : null,
    evaluation_summary: evaluationRow ? String(evaluationRow.summary) : null,
    evaluation_outcome: evaluationRow ? String(evaluationRow.outcome) : null,
    analyzed_at: evaluationRow ? String(evaluationRow.analyzed_at) : null,
    reviewed_at: outboundRow.reviewed_at ? String(outboundRow.reviewed_at) : null,
    reviewer_notes: outboundRow.reviewer_notes ? String(outboundRow.reviewer_notes) : null,
    approved_at: outboundRow.approved_at ? String(outboundRow.approved_at) : null,
    terminal_reason: outboundRow.terminal_reason ? String(outboundRow.terminal_reason) : null,
    external_reference: outboundRow.external_reference
      ? String(outboundRow.external_reference)
      : null,
    available_actions: deriveAvailableActions(status, actionType),
  };
}

/**
 * List draft review details for outbound commands matching the given status
 * filter. Defaults to all non-terminal statuses that involve operator review.
 */
export function getDraftReviewDetails(
  outboundStore: OutboundStoreView,
  coordinatorStore: CoordinatorStoreView,
  scopeId?: string,
  statuses?: OutboundStatus[],
): import("./types.js").DraftReviewDetail[] {
  const targetStatuses = statuses ?? [
    "pending",
    "draft_creating",
    "draft_ready",
    "approved_for_send",
    "sending",
    "submitted",
    "blocked_policy",
    "retry_wait",
  ];

  const sql = scopeId
    ? `select outbound_id from outbound_handoffs where scope_id = ? and status in (${targetStatuses.map(() => "?").join(",")}) order by created_at desc`
    : `select outbound_id from outbound_handoffs where status in (${targetStatuses.map(() => "?").join(",")}) order by created_at desc`;

  const params = scopeId ? [scopeId, ...targetStatuses] : targetStatuses;
  const rows = outboundStore.db.prepare(sql).all(...params) as Array<{
    outbound_id: string;
  }>;

  return rows
    .map((row) => getDraftReviewDetail(outboundStore, coordinatorStore, row.outbound_id))
    .filter((d): d is import("./types.js").DraftReviewDetail => d !== undefined);
}

export function buildObservationPlaneSnapshot(
  registry: WorkerRegistryView,
  coordinatorStore: CoordinatorStoreView,
  outboundStore: OutboundStoreView,
  intentStore: IntentStoreView,
  executionStore: ProcessExecutionStoreView,
  scopeId?: string,
): ObservationPlaneSnapshot {
  const capturedAt = new Date().toISOString();

  return {
    captured_at: capturedAt,
    _meta: {
      source_classifications: {
        workers: "derived",
        control_plane: "derived",
        process_executions: "derived",
        intents: "authoritative",
        intent_executions: "derived",
      },
    },
    workers: getWorkerStatuses(registry, coordinatorStore, intentStore, executionStore),
    control_plane: buildControlPlaneSnapshot(coordinatorStore, outboundStore, scopeId),
    process_executions: getProcessExecutionSummaries(executionStore, 50),
    intents: getIntentSummaries(intentStore),
    intent_executions: getIntentExecutionSummaries(intentStore, 50),
  };
}
