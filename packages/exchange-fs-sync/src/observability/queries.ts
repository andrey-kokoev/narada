/**
 * Read-only observability queries.
 *
 * Every function in this file derives its result from durable SQLite state.
 * They are safe to call at any time and must never be used for correctness decisions.
 */

import type { CoordinatorStore } from "../coordinator/types.js";
import type { OutboundStore } from "../outbound/store.js";
import type {
  ControlPlaneStatusSnapshot,
  ExecutionAttemptSummary,
  MailboxDispatchSummary,
  OutboundHandoffSummary,
  ToolCallSummary,
  WorkItemLifecycleSummary,
} from "./types.js";

function rowToWorkItemSummary(row: Record<string, unknown>): WorkItemLifecycleSummary {
  return {
    work_item_id: String(row.work_item_id),
    conversation_id: String(row.conversation_id),
    mailbox_id: String(row.mailbox_id),
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

function rowToToolCallSummary(row: Record<string, unknown>): ToolCallSummary {
  return {
    call_id: String(row.call_id),
    execution_id: String(row.execution_id),
    work_item_id: String(row.work_item_id),
    conversation_id: String(row.conversation_id),
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
    conversation_id: String(row.conversation_id),
    mailbox_id: String(row.mailbox_id),
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
  store: CoordinatorStore,
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
  store: CoordinatorStore,
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
  store: CoordinatorStore,
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
  outboundStore: OutboundStore,
  limit = 50,
): OutboundHandoffSummary[] {
  const rows = outboundStore.db
    .prepare(
      `select * from outbound_commands
       order by created_at desc
       limit ?`,
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map(rowToOutboundSummary);
}

export function getRecentSessionsAndExecutions(
  store: CoordinatorStore,
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
  store: CoordinatorStore,
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

export function buildMailboxDispatchSummary(
  store: CoordinatorStore,
  outboundStore: OutboundStore,
  mailboxId: string,
): MailboxDispatchSummary {
  const active = store.db
    .prepare(`select count(*) as c from work_items where mailbox_id = ? and status = 'opened'`)
    .get(mailboxId) as { c: number };
  const leased = store.db
    .prepare(`select count(*) as c from work_items where mailbox_id = ? and status = 'leased'`)
    .get(mailboxId) as { c: number };
  const executing = store.db
    .prepare(`select count(*) as c from work_items where mailbox_id = ? and status = 'executing'`)
    .get(mailboxId) as { c: number };
  const failedRetryable = store.db
    .prepare(`select count(*) as c from work_items where mailbox_id = ? and status = 'failed_retryable'`)
    .get(mailboxId) as { c: number };
  const failedTerminal = store.db
    .prepare(`select count(*) as c from work_items where mailbox_id = ? and status = 'failed_terminal'`)
    .get(mailboxId) as { c: number };
  const pendingOutbound = outboundStore.db
    .prepare(
      `select count(*) as c from outbound_commands where mailbox_id = ? and status in ('pending', 'draft_creating', 'draft_ready')`,
    )
    .get(mailboxId) as { c: number };
  const recentDecisions = store.db
    .prepare(
      `select count(*) as c from foreman_decisions where mailbox_id = ? and decided_at >= datetime('now', '-24 hours')`,
    )
    .get(mailboxId) as { c: number };

  const lastSync = store.db
    .prepare(
      `select max(updated_at) as last_sync from work_items where mailbox_id = ?`,
    )
    .get(mailboxId) as { last_sync: string | null };

  return {
    mailbox_id: mailboxId,
    last_sync_at: lastSync.last_sync,
    active_work_items: active.c,
    leased_work_items: leased.c,
    executing_work_items: executing.c,
    failed_retryable_work_items: failedRetryable.c,
    failed_terminal_work_items: failedTerminal.c,
    pending_outbound_commands: pendingOutbound.c,
    recent_decisions_count: recentDecisions.c,
  };
}

export function buildControlPlaneSnapshot(
  coordinatorStore: CoordinatorStore,
  outboundStore: OutboundStore,
  mailboxId?: string,
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
    .prepare(`select status, count(*) as c from outbound_commands group by status`)
    .all() as Array<{ status: string; c: number }>;
  const outboundTotal = outboundStore.db
    .prepare(`select count(*) as c from outbound_commands`)
    .get() as { c: number };

  const outboundByStatus: Record<string, number> = {};
  for (const row of outboundCounts) {
    outboundByStatus[row.status] = row.c;
  }

  const workItemTotal = coordinatorStore.db
    .prepare(`select count(*) as c from work_items`)
    .get() as { c: number };

  const mailboxSummary = mailboxId
    ? buildMailboxDispatchSummary(coordinatorStore, outboundStore, mailboxId)
    : null;

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
    mailbox_summary: mailboxSummary,
  };
}
