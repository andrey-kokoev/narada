/**
 * Observability types — read-only derived views over durable control-plane state.
 *
 * Invariant: no type in this file is consumed by correctness logic.
 * They exist solely for operator visibility and diagnostics.
 */

import type { WorkItemStatus, ExecutionAttemptStatus, ToolCallStatus } from "../coordinator/types.js";
import type { OutboundStatus } from "../outbound/types.js";
import type { ExecutionPhase, ConfirmationStatus } from "../executors/lifecycle.js";

/** Data-source trust classification for UI transparency */
export type SourceTrust = "authoritative" | "derived" | "decorative";

/** @source derived — Summary of a single daemon sync+dispatch cycle */
export interface DaemonCycleSummary {
  cycle_number: number;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  events_applied: number;
  events_skipped: number;
  dispatch_phase_duration_ms?: number;
  contexts_changed: number;
  work_items_opened: number;
  work_items_superseded: number;
  errors: number;
}

/** @source derived — Per-scope readiness indicators */
export interface ScopeReadiness {
  dispatch_ready: boolean;
  outbound_healthy: boolean;
  workers_registered: boolean;
  /** True if the scope has recent DB activity (approximation, not actual sync freshness) */
  db_active: boolean;
  /** True when the charter runtime health class permits execution (healthy, degraded_draft_only, partially_degraded) */
  charter_runtime_healthy: boolean;
  /** The current charter runtime health class, or null if not probed */
  charter_runtime_health_class: import("@narada2/charters").CharterRuntimeHealthClass | null;
}

/** @source derived — Per-scope dispatch summary */
export interface ScopeDispatchSummary {
  scope_id: string;
  last_sync_at: string | null;
  active_work_items: number;
  leased_work_items: number;
  executing_work_items: number;
  failed_retryable_work_items: number;
  failed_terminal_work_items: number;
  pending_outbound_handoffs: number;
  recent_decisions_count: number;
  readiness: ScopeReadiness;
}

/** @source authoritative — Work-item lifecycle summary for observability (mirrors durable work_items row) */
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
  // Continuation affinity fields (Task 212)
  preferred_session_id: string | null;
  preferred_agent_id: string | null;
  affinity_group_id: string | null;
  affinity_strength: number;
  affinity_expires_at: string | null;
  affinity_reason: string | null;
}

/** @source authoritative — Execution attempt summary (mirrors durable execution_attempts row) */
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

/** @source authoritative — Tool call summary (mirrors durable tool_call_records row) */
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

/** @source authoritative — Outbound handoff summary (mirrors durable outbound_handoffs row) */
export interface OutboundHandoffSummary {
  outbound_id: string;
  context_id: string;
  scope_id: string;
  action_type: string;
  status: OutboundStatus;
  latest_version: number;
  created_at: string;
  submitted_at: string | null;
  confirmed_at: string | null;
  terminal_reason: string | null;
  idempotency_key: string;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  external_reference: string | null;
}

/** @source derived — Active lease summary for operability view (joins lease + work item) */
export interface LeaseSummary {
  lease_id: string;
  work_item_id: string;
  context_id: string;
  runner_id: string;
  acquired_at: string;
  expires_at: string;
  work_item_status: string;
}

/** @source derived — Stale lease recovery event for operability view */
export interface StaleLeaseRecoveryEvent {
  lease_id: string;
  work_item_id: string;
  context_id: string;
  runner_id: string;
  recovered_at: string;
  reason: string;
}

/** @source derived — Quiescence and backlog indicator (computed from multiple tables) */
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

/** Stuck work-item classification for operational trust detection */
export type StuckWorkItemClassification =
  | "stuck_opened"
  | "stuck_leased"
  | "stuck_executing"
  | "stuck_retry_exhausted";

/** @source derived — Stuck work-item detail for operator visibility */
export interface StuckWorkItem extends WorkItemLifecycleSummary {
  classification: StuckWorkItemClassification;
  status_since: string;
}

/** @source derived — Stuck work-item summary by classification */
export interface StuckWorkItemSummary {
  classification: StuckWorkItemClassification;
  count: number;
  items: StuckWorkItem[];
}

/** Stuck outbound classification for operational trust detection */
export type StuckOutboundClassification =
  | "stuck_pending"
  | "stuck_draft_creating"
  | "stuck_draft_ready"
  | "stuck_sending";

/** @source derived — Stuck outbound command detail for operator visibility */
export interface StuckOutboundCommand extends OutboundHandoffSummary {
  classification: StuckOutboundClassification;
  status_since: string;
}

/** @source derived — Stuck outbound summary by classification */
export interface StuckOutboundSummary {
  classification: StuckOutboundClassification;
  count: number;
  items: StuckOutboundCommand[];
}

/** @source derived — Aggregated stuck-item counts for health and status surfaces */
export interface StuckItemCounts {
  work_items: { classification: StuckWorkItemClassification; count: number }[];
  outbound_handoffs: { classification: StuckOutboundClassification; count: number }[];
}

/** @source derived — Aggregated control-plane status snapshot */
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
  scope_summary: ScopeDispatchSummary | null;
  stuck: StuckItemCounts;
}

/** @source derived — Process execution summary for observability (unifies intent + execution stores) */
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

/** @source authoritative — Intent summary for observability (mirrors durable intents row) */
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

/** @source derived — Unified intent execution summary (joins intent + execution + outbound stores) */
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

/** Intent lifecycle transition for chronological audit */
export interface IntentLifecycleTransition {
  transition_at: string;
  from_status: string | null;
  to_status: string;
  source: "intent" | "process" | "outbound";
  detail: string | null;
}

/** @source derived — Worker status observation (derived from in-memory registry + durable state) */
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

/** @source derived — Scope and vertical overview for operator UI */
export interface OverviewSnapshot {
  captured_at: string;
  /** Source-trust metadata for each top-level section */
  _meta: {
    source_classifications: Record<string, SourceTrust>;
  };
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

/** @source authoritative — Context summary for operator UI (mirrors durable context_records view) */
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

/** @source authoritative — Fact summary for operator UI (mirrors durable facts row) */
export interface FactSummary {
  fact_id: string;
  fact_type: string;
  source_id: string;
  source_record_id: string;
  admitted: boolean;
  created_at: string;
}

/** @source derived — Timeline event for unified kernel flow view (computed chronology) */
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

/**
 * @source derived — Computed affinity outcome for a work item.
 *
 * v1 reality: affinity is an ordering hint only. The scheduler does not check
 * whether the preferred session is available or route leases to it. This type
 * captures the honest observable state so operators can evaluate whether the
 * optimization is effective and whether v2 session-aware routing is warranted.
 */
export interface AffinityOutcome {
  work_item_id: string;
  context_id: string;

  // What was requested
  had_affinity: boolean;
  preferred_session_id: string | null;
  affinity_strength: number;
  affinity_expired: boolean;
  affinity_reason: string | null;

  // What happened (v1)
  outcome: "no_preference" | "ordering_boost" | "expired_before_scan" | "superseded_carried_forward";

  // v2 deferred fields — populated when session-aware routing is implemented
  preferred_session_available: boolean | null;
  preferred_session_status: string | null;
  executed_by_preferred_session: boolean | null;
  actual_session_id: string | null;
}

/** @source derived — Deep-dive evaluation detail with parsed JSON fields */
export interface EvaluationDetail {
  evaluation_id: string;
  execution_id: string;
  work_item_id: string;
  context_id: string;
  scope_id: string;
  charter_id: string;
  role: "primary" | "secondary";
  output_version: string;
  analyzed_at: string;
  outcome: string;
  summary: string;
  recommended_action_class: string | null;
  created_at: string;
  // Parsed JSON fields
  confidence: unknown;
  classifications: unknown;
  facts: unknown;
  escalations: unknown;
  proposed_actions: unknown;
  tool_requests: unknown;
}

/** @source derived — Deep-dive decision detail with parsed JSON fields */
export interface DecisionDetail {
  decision_id: string;
  context_id: string;
  scope_id: string;
  approved_action: string;
  rationale: string;
  decided_at: string;
  outbound_id: string | null;
  created_by: string;
  // Parsed JSON fields
  payload: unknown;
  source_charter_ids: string[];
}

/** @source derived — Deep-dive execution attempt detail with parsed JSON fields */
export interface ExecutionDetail {
  execution_id: string;
  work_item_id: string;
  revision_id: string;
  session_id: string | null;
  status: import("../coordinator/types.js").ExecutionAttemptStatus;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  // Parsed JSON fields
  runtime_envelope: unknown;
  outcome: unknown;
}

/** @source authoritative — Operator action audit summary (mirrors durable operator_action_requests row with redacted payload) */
export interface OperatorActionSummary {
  action_id: string;
  action_type: string;
  actor: string;
  scope_id: string;
  context_id: string | null;
  work_item_id: string | null;
  payload_summary: string;
  created_at: string;
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
  _meta?: {
    source_classifications: Record<string, SourceTrust>;
  };
}
