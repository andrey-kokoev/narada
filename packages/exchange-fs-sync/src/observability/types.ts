/**
 * Observability types — read-only derived views over durable control-plane state.
 *
 * Invariant: no type in this file is consumed by correctness logic.
 * They exist solely for operator visibility and diagnostics.
 */

import type { WorkItemStatus, ExecutionAttemptStatus, ToolCallStatus } from "../coordinator/types.js";
import type { OutboundStatus } from "../outbound/types.js";

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
  context_id: string;
  target_id: string | null;
  terminal_reason: string | null;
  created_at: string;
  updated_at: string;
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

/** Unified observation plane snapshot */
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
}
