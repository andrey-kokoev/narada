/**
 * Observability types — read-only derived views over durable control-plane state.
 *
 * Invariant: no type in this file is consumed by correctness logic.
 * They exist solely for operator visibility and diagnostics.
 */

import type { WorkItemStatus, ExecutionAttemptStatus, ToolCallStatus } from "../coordinator/types.js";
import type { OutboundStatus } from "../outbound/types.js";
import type { ExecutionPhase, ConfirmationStatus } from "../executors/lifecycle.js";

/** Summary of a single daemon sync+dispatch cycle */
export interface DaemonCycleSummary {
  cycle_number: number;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  events_applied: number;
  events_skipped: number;
  dispatch_phase_duration_ms?: number;
  conversations_changed: number;
  work_items_opened: number;
  work_items_superseded: number;
  errors: number;
}

/** Per-mailbox dispatch summary */
export interface MailboxDispatchSummary {
  mailbox_id: string;
  last_sync_at: string | null;
  active_work_items: number;
  leased_work_items: number;
  executing_work_items: number;
  failed_retryable_work_items: number;
  failed_terminal_work_items: number;
  pending_outbound_commands: number;
  recent_decisions_count: number;
}

/** Work-item lifecycle summary for observability */
export interface WorkItemLifecycleSummary {
  work_item_id: string;
  context_id: string;
  scope_id: string;
  status: WorkItemStatus;
  priority: number;
  opened_for_revision_id: string;
  resolved_revision_id: string | null;
  resolution_outcome: string | null;
  retry_count: number;
  next_retry_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** Execution attempt summary */
export interface ExecutionAttemptSummary {
  execution_id: string;
  work_item_id: string;
  revision_id: string;
  session_id: string | null;
  status: ExecutionAttemptStatus;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

/** Tool call summary */
export interface ToolCallSummary {
  call_id: string;
  execution_id: string;
  work_item_id: string;
  context_id: string;
  tool_id: string;
  exit_status: ToolCallStatus;
  duration_ms: number;
  started_at: string;
  completed_at: string;
}

/** Outbound handoff summary */
export interface OutboundHandoffSummary {
  outbound_id: string;
  conversation_id: string;
  mailbox_id: string;
  action_type: string;
  status: OutboundStatus;
  latest_version: number;
  created_at: string;
  submitted_at: string | null;
  confirmed_at: string | null;
  terminal_reason: string | null;
  idempotency_key: string;
}

/** Active lease summary for operability view */
export interface LeaseSummary {
  lease_id: string;
  work_item_id: string;
  conversation_id: string;
  runner_id: string;
  acquired_at: string;
  expires_at: string;
  work_item_status: string;
}

/** Stale lease recovery event for operability view */
export interface StaleLeaseRecoveryEvent {
  lease_id: string;
  work_item_id: string;
  conversation_id: string;
  runner_id: string;
  recovered_at: string;
  reason: string;
}

/** Quiescence and backlog indicator */
export interface QuiescenceIndicator {
  is_quiescent: boolean;
  opened_count: number;
  leased_count: number;
  executing_count: number;
  failed_retryable_count: number;
  awaiting_retry_count: number;
  has_stale_leases: boolean;
  stale_lease_count: number;
  oldest_lease_acquired_at: string | null;
}

/** Aggregated control-plane status snapshot */
export interface ControlPlaneStatusSnapshot {
  captured_at: string;
  work_items: {
    active: WorkItemLifecycleSummary[];
    failed_recent: WorkItemLifecycleSummary[];
    awaiting_retry: WorkItemLifecycleSummary[];
    total_count: number;
  };
  executions: {
    recent: ExecutionAttemptSummary[];
    total_count: number;
  };
  tool_calls: {
    recent: ToolCallSummary[];
    by_status: Record<ToolCallStatus, number>;
    total_count: number;
  };
  outbound: {
    recent: OutboundHandoffSummary[];
    by_status: Record<OutboundStatus, number>;
    total_count: number;
  };
  leases: {
    active: LeaseSummary[];
    total_count: number;
  };
  stale_recoveries: {
    recent: StaleLeaseRecoveryEvent[];
    total_count: number;
  };
  quiescence: QuiescenceIndicator;
  mailbox_summary: MailboxDispatchSummary | null;
}

/** Process execution summary for observability */
export interface ProcessExecutionSummary {
  execution_id: string;
  intent_id: string;
  command: string;
  status: "pending" | "running" | "completed" | "failed";
  exit_code: number | null;
  started_at: string | null;
  completed_at: string | null;
  lease_runner_id: string | null;
  lease_expires_at: string | null;
  created_at: string;
}

/** Intent summary for observability */
export interface IntentSummary {
  intent_id: string;
  intent_type: string;
  executor_family: string;
  status: string;
  confirmation_status: ConfirmationStatus;
  context_id: string;
  target_id: string | null;
  idempotency_key: string;
  terminal_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Unified intent execution summary — mail and process under one lifecycle model */
export interface IntentExecutionSummary {
  intent_id: string;
  intent_type: string;
  executor_family: string;
  intent_status: string;
  confirmation_status: ConfirmationStatus;
  phase: ExecutionPhase;
  context_id: string;
  idempotency_key: string;

  // Process-specific (null when executor_family !== "process")
  process_execution_id: string | null;
  process_command: string | null;
  process_exit_code: number | null;
  process_started_at: string | null;
  process_completed_at: string | null;

  // Mail-specific (null when executor_family !== "mail")
  mail_outbound_id: string | null;
  mail_action_type: string | null;
  mail_status: OutboundStatus | null;
  mail_submitted_at: string | null;
  mail_confirmed_at: string | null;

  // Unified error surface
  error_message: string | null;
  terminal_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Process execution detail for operator drill-down */
export interface ProcessExecutionDetail {
  execution_id: string;
  intent_id: string;
  phase: ExecutionPhase;
  confirmation_status: ConfirmationStatus;
  command: string;
  args: string[];
  cwd: string | null;
  env_keys: string[];
  exit_code: number | null;
  stdout_preview: string;
  stderr_preview: string;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  confirmed_at: string | null;
  lease_runner_id: string | null;
  lease_expires_at: string | null;
  created_at: string;
}

/** Mail execution transition for audit trail */
export interface MailExecutionTransition {
  transition_id: number;
  from_status: OutboundStatus;
  to_status: OutboundStatus;
  reason: string | null;
  created_at: string;
}

/** Mail execution detail for operator drill-down */
export interface MailExecutionDetail {
  outbound_id: string;
  intent_id: string;
  conversation_id: string;
  mailbox_id: string;
  action_type: string;
  status: OutboundStatus;
  latest_version: number;
  idempotency_key: string;
  submitted_at: string | null;
  confirmed_at: string | null;
  blocked_reason: string | null;
  terminal_reason: string | null;
  created_at: string;
  transitions: MailExecutionTransition[];
  latest_version_detail: {
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    body_text_preview: string;
  } | null;
}

/** Intent lifecycle transition for chronological audit */
export interface IntentLifecycleTransition {
  transition_at: string;
  from_status: string | null;
  to_status: string;
  source: "intent" | "process" | "outbound";
  detail: string | null;
}

/** Worker status observation — derived from registry + durable state */
export interface WorkerStatusObservation {
  worker_id: string;
  executor_family: string;
  concurrency_policy: string;
  description: string | undefined;
  /** Whether the worker identity is registered */
  registered: boolean;
  /** Whether durable state shows active work for this executor family */
  has_active_work: boolean;
  /** Count of pending items for this worker's executor family */
  pending_count: number;
}

/** Scope and vertical overview for operator UI */
export interface OverviewSnapshot {
  captured_at: string;
  scopes: ScopeOverview[];
  facts: {
    total_recent: number;
    by_vertical: Record<string, number>;
  };
  recent_failures: OverviewFailureSummary[];
  global: {
    total_work_items: number;
    total_active_executions: number;
    total_pending_intents: number;
    total_recent_facts: number;
    total_recent_failures: number;
  };
}

/** Mailbox-vertical conversation summary with mail-specific timing */
export interface MailboxConversationSummary {
  context_id: string;
  scope_id: string;
  status: string;
  primary_charter: string;
  assigned_agent: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Mailbox-vertical view — sits above the kernel-neutral shell */
export interface MailboxVerticalView {
  scope_id: string;
  conversations: MailboxConversationSummary[];
  outbound: OutboundHandoffSummary[];
  outputs: {
    output_id: string;
    context_id: string;
    charter_id: string;
    summary: string;
    analyzed_at: string;
  }[];
}

export interface ScopeOverview {
  scope_id: string;
  last_activity_at: string | null;
  active_verticals: string[];
  work_items: {
    opened: number;
    leased: number;
    executing: number;
    failed_retryable: number;
    failed_terminal: number;
  };
  intents: {
    pending: number;
    executing: number;
  };
  executions: {
    active: number;
    failed_recent: number;
  };
}

export interface OverviewFailureSummary {
  scope_id: string;
  context_id: string;
  work_item_id: string | null;
  execution_id: string | null;
  failed_at: string;
  error_message: string | null;
  vertical: string;
}

/** Unified observation plane snapshot */
/** Context summary for operator UI */
export interface ContextSummary {
  context_id: string;
  scope_id: string;
  status: string;
  primary_charter: string;
  assigned_agent: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Fact summary for operator UI (lightweight provenance) */
export interface FactSummary {
  fact_id: string;
  fact_type: string;
  source_id: string;
  source_record_id: string;
  admitted: boolean;
  created_at: string;
}

/** Timeline event for unified kernel flow view */
export interface TimelineEvent {
  event_at: string;
  kind: "fact_ingested" | "fact_admitted" | "context_formed" | "work_opened" | "work_superseded" | "work_resolved" | "work_failed";
  scope_id: string;
  context_id: string | null;
  fact_id: string | null;
  work_item_id: string | null;
  detail: string;
}

/** Work item timeline with full lineage */
export interface WorkItemTimeline {
  work_item: WorkItemLifecycleSummary | null;
  context_facts: { fact_id: string; fact_type: string; source_id: string; admitted: boolean }[];
  executions: ExecutionAttemptSummary[];
  decisions: { decision_id: string; approved_action: string; decided_at: string; outbound_id: string | null }[];
  superseded_by: string | null;
}

/** Context timeline with revisions and work */
export interface ContextTimeline {
  context: ContextSummary | null;
  revisions: { ordinal: number; observed_at: string; trigger_event_id: string | null }[];
  work_items: WorkItemLifecycleSummary[];
  outputs: { output_id: string; charter_id: string; summary: string; analyzed_at: string }[];
}

/** Fact timeline with downstream work */
export interface FactTimeline {
  fact: FactSummary | null;
  work_items: { work_item_id: string; context_id: string; status: string; created_at: string }[];
}

export interface ObservationPlaneSnapshot {
  captured_at: string;
  workers: WorkerStatusObservation[];
  control_plane: ControlPlaneStatusSnapshot;
  process_executions: {
    active: ProcessExecutionSummary[];
    recent: ProcessExecutionSummary[];
    failed_recent: ProcessExecutionSummary[];
    total_count: number;
  };
  intents: {
    pending: IntentSummary[];
    executing: IntentSummary[];
    failed_terminal: IntentSummary[];
    total_count: number;
  };
  intent_executions: {
    recent: IntentExecutionSummary[];
    failed_recent: IntentExecutionSummary[];
    total_count: number;
  };
}

/** Single-failure row for the overview dashboard */
export interface OverviewFailureSummary {
  scope_id: string;
  context_id: string;
  work_item_id: string | null;
  execution_id: string | null;
  failed_at: string;
  error_message: string | null;
  vertical: string;
}

/** Per-scope operational summary */
export interface ScopeOverview {
  scope_id: string;
  last_activity_at: string | null;
  active_verticals: string[];
  work_items: {
    opened: number;
    leased: number;
    executing: number;
    failed_retryable: number;
    failed_terminal: number;
  };
  intents: {
    pending: number;
    executing: number;
  };
  executions: {
    active: number;
    failed_recent: number;
  };
}

/** Top-level kernel overview snapshot for the operator dashboard */
export interface OverviewSnapshot {
  captured_at: string;
  scopes: ScopeOverview[];
  facts: {
    total_recent: number;
    by_vertical: Record<string, number>;
  };
  recent_failures: OverviewFailureSummary[];
  global: {
    total_work_items: number;
    total_active_executions: number;
    total_pending_intents: number;
    total_recent_facts: number;
    total_recent_failures: number;
  };
}
