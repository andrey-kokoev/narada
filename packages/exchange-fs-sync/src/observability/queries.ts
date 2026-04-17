/**
 * Read-only observability queries.
 *
 * Every function in this file derives its result from durable SQLite state.
 * They are safe to call at any time and must never be used for correctness decisions.
 */

import type { CoordinatorStoreView, ExecutionAttempt } from "../coordinator/types.js";
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
         idempotency_key
       from outbound_handoffs
       order by created_at desc
       limit ?`,
    )
    .all(limit) as Record<string, unknown>[];
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
    ? coordinatorStore.getOutputsByContext(contextId, scopeId).map((o) => ({
        output_id: o.output_id,
        charter_id: o.charter_id,
        summary: o.summary,
        analyzed_at: o.analyzed_at,
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
  return "mailbox";
}

function detectVerticalFromFactType(factType: string): string {
  if (factType.startsWith("mail.")) return "mailbox";
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
    const scopeId = vertical === "mailbox" ? row.context_id : row.context_id;

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
