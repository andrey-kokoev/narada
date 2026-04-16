/**
 * Read-only observability queries.
 *
 * Every function in this file derives its result from durable SQLite state.
 * They are safe to call at any time and must never be used for correctness decisions.
 */

import type { CoordinatorStore } from "../coordinator/types.js";
import type { OutboundStore } from "../outbound/store.js";
import type { ProcessExecutionStore } from "../executors/store.js";
import type { IntentStore } from "../intent/store.js";
import type { WorkerRegistry } from "../workers/registry.js";
import type {
  ControlPlaneStatusSnapshot,
  ExecutionAttemptSummary,
  MailboxDispatchSummary,
  OutboundHandoffSummary,
  ToolCallSummary,
  WorkItemLifecycleSummary,
  ProcessExecutionSummary,
  IntentSummary,
  WorkerStatusObservation,
  ObservationPlaneSnapshot,
} from "./types.js";

function rowToWorkItemSummary(row: Record<string, unknown>): WorkItemLifecycleSummary {
  return {
    work_item_id: String(row.work_item_id),
    context_id: String(row.conversation_id),
    scope_id: String(row.mailbox_id),
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
    context_id: String(row.conversation_id),
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
    context_id: String(row.context_id),
    target_id: row.target_id ? String(row.target_id) : null,
    terminal_reason: row.terminal_reason ? String(row.terminal_reason) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function getProcessExecutionSummaries(
  executionStore: ProcessExecutionStore,
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

export function getIntentSummaries(
  intentStore: IntentStore,
): { pending: IntentSummary[]; executing: IntentSummary[]; failed_terminal: IntentSummary[]; total_count: number } {
  const pendingRows = intentStore.db
    .prepare(`select * from intents where status = 'admitted' order by created_at asc`)
    .all() as Record<string, unknown>[];

  const executingRows = intentStore.db
    .prepare(`select * from intents where status = 'executing' order by updated_at desc`)
    .all() as Record<string, unknown>[];

  const failedRows = intentStore.db
    .prepare(`select * from intents where status = 'failed_terminal' order by updated_at desc`)
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

export function getWorkerStatuses(
  registry: WorkerRegistry,
  coordinatorStore: CoordinatorStore,
  intentStore: IntentStore,
  executionStore: ProcessExecutionStore,
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

export function buildObservationPlaneSnapshot(
  registry: WorkerRegistry,
  coordinatorStore: CoordinatorStore,
  outboundStore: OutboundStore,
  intentStore: IntentStore,
  executionStore: ProcessExecutionStore,
  mailboxId?: string,
): ObservationPlaneSnapshot {
  const capturedAt = new Date().toISOString();

  return {
    captured_at: capturedAt,
    workers: getWorkerStatuses(registry, coordinatorStore, intentStore, executionStore),
    control_plane: buildControlPlaneSnapshot(coordinatorStore, outboundStore, mailboxId),
    process_executions: getProcessExecutionSummaries(executionStore, 50),
    intents: getIntentSummaries(intentStore),
  };
}
