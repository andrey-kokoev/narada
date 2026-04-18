/**
 * Coordinator Store Types
 *
 * Durable state for foreman, charter outputs, context records, and policy overrides.
 *
 * Spec: .ai/tasks/20260413-012-coordinator-state-and-foreman-handoff.md
 * Spec: .ai/tasks/20260414-004-coordinator-durable-state-v2.md
 */

/** Neutral observation-facing context record (Task 084). */
export interface ContextRecord {
  context_id: string;
  scope_id: string;
  primary_charter: string;
  secondary_charters_json: string;
  status: "active" | "archived" | "deleted";
  assigned_agent: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_analyzed_at: string | null;
  last_triaged_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Revision ordinal tracking for deterministic context snapshots. */
export interface ContextRevision {
  revision_record_id: number;
  context_id: string;
  ordinal: number;
  observed_at: string;
  trigger_event_id: string | null;
}

/** Record of a foreman decision and its outbound handoff */
export interface ForemanDecisionRow {
  decision_id: string;
  context_id: string;
  scope_id: string;
  source_charter_ids_json: string;
  approved_action: string;
  payload_json: string;
  rationale: string;
  decided_at: string;
  outbound_id: string | null;
  created_by: string;
}

/**
 * Validate the `created_by` format.
 * Expected: foreman:{foreman_id}/charter:{charter_id_1}[,{charter_id_2}...]
 */
export function isValidCreatedBy(createdBy: string): boolean {
  return /^foreman:[^/]+\/charter:[^\s,]+(,[^\s,]+)*$/.test(createdBy);
}

/** Work item status values */
export type WorkItemStatus =
  | "opened"
  | "leased"
  | "executing"
  | "resolved"
  | "failed_retryable"
  | "failed_terminal"
  | "superseded"
  | "cancelled";

/** Terminal schedulable unit of control work */
export interface WorkItem {
  work_item_id: string;
  context_id: string;
  scope_id: string;
  status: WorkItemStatus;
  priority: number;
  opened_for_revision_id: string;
  resolved_revision_id: string | null;
  resolution_outcome: "no_op" | "action_created" | "escalated" | "pending_approval" | "failed" | null;
  error_message: string | null;
  retry_count: number;
  next_retry_at: string | null;
  context_json: string | null;
  created_at: string;
  updated_at: string;
}

/** Durable lease record for crash-safe scheduling */
export interface WorkItemLease {
  lease_id: string;
  work_item_id: string;
  runner_id: string;
  acquired_at: string;
  expires_at: string;
  released_at: string | null;
  release_reason: "success" | "crash" | "abandoned" | "superseded" | "cancelled" | null;
}

/** Execution attempt status values */
export type ExecutionAttemptStatus =
  | "started"
  | "active"
  | "succeeded"
  | "crashed"
  | "abandoned";

/** Bounded invocation record for a charter runtime */
export interface ExecutionAttempt {
  execution_id: string;
  work_item_id: string;
  revision_id: string;
  session_id: string | null;
  status: ExecutionAttemptStatus;
  started_at: string;
  completed_at: string | null;
  runtime_envelope_json: string;
  outcome_json: string | null;
  error_message: string | null;
}

/** Durable structured summary of successful charter output */
export interface Evaluation {
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
  confidence_json: string;
  summary: string;
  classifications_json: string;
  facts_json: string;
  escalations_json: string;
  proposed_actions_json: string;
  tool_requests_json: string;
  recommended_action_class: string | null;
  created_at: string;
}

/** Durable record of a tool invocation */
export type ToolCallStatus =
  | "pending"
  | "success"
  | "timeout"
  | "permission_denied"
  | "error"
  | "budget_exceeded"
  | "rejected_policy";

export interface ToolCallRecord {
  call_id: string;
  execution_id: string;
  work_item_id: string;
  context_id: string;
  tool_id: string;
  request_args_json: string;
  exit_status: ToolCallStatus;
  stdout: string;
  stderr: string;
  structured_output_json: string | null;
  started_at: string;
  completed_at: string;
  duration_ms: number;
}

/** Explicit override for a blocked_policy command */
export interface PolicyOverrideRow {
  override_id: string;
  outbound_id: string;
  overridden_by: string;
  reason: string;
  created_at: string;
}

/** Session status values */
export type AgentSessionStatus =
  | "opened"
  | "active"
  | "idle"
  | "completed"
  | "abandoned"
  | "superseded";

/** Operator-facing interpretive session record */
export interface AgentSession {
  session_id: string;
  context_id: string;
  work_item_id: string;
  started_at: string;
  ended_at: string | null;
  updated_at: string;
  status: AgentSessionStatus;
  resume_hint: string | null;
}

export interface CoordinatorStore {
  readonly db: import("better-sqlite3").Database;
  initSchema(): void;

  // Context records (v2) — primary durable contract
  upsertContextRecord(record: ContextRecord): void;
  getContextRecord(contextId: string): ContextRecord | undefined;

  // Context revisions
  nextRevisionOrdinal(contextId: string): number;
  recordRevision(contextId: string, ordinal: number, triggerEventId?: string | null): void;
  getLatestRevisionOrdinal(contextId: string): number | null;

  // Neutral context revisions (Task 084)
  recordContextRevision(contextId: string, ordinal: number, triggerEventId?: string | null): void;

  // Work items
  insertWorkItem(item: WorkItem): void;
  updateWorkItemStatus(
    workItemId: string,
    status: WorkItemStatus,
    updates?: Partial<
      Pick<WorkItem, "resolved_revision_id" | "resolution_outcome" | "error_message" | "retry_count" | "next_retry_at" | "updated_at">
    >,
  ): void;
  getWorkItem(workItemId: string): WorkItem | undefined;
  getActiveWorkItemForContext(contextId: string): WorkItem | undefined;
  getLatestWorkItemForContext(contextId: string): WorkItem | undefined;

  // Work item leases
  insertLease(lease: WorkItemLease): void;
  getActiveLeaseForWorkItem(workItemId: string): WorkItemLease | undefined;
  updateLeaseExpiry(leaseId: string, expiresAt: string): void;
  releaseLease(leaseId: string, releasedAt: string, reason: WorkItemLease["release_reason"]): void;
  recoverStaleLeases(now: string): { leaseId: string; workItemId: string }[];

  // Execution attempts
  insertExecutionAttempt(attempt: ExecutionAttempt): void;
  getExecutionAttempt(executionId: string): ExecutionAttempt | undefined;
  getExecutionAttemptsByWorkItem(workItemId: string): ExecutionAttempt[];
  updateExecutionAttemptStatus(
    executionId: string,
    status: ExecutionAttemptStatus,
    updates?: Partial<Pick<ExecutionAttempt, "completed_at" | "outcome_json" | "error_message">>,
  ): void;

  // Evaluations
  insertEvaluation(evaluation: Evaluation): void;
  getEvaluationById(evaluationId: string): Evaluation | undefined;
  getEvaluationByExecutionId(executionId: string): Evaluation | undefined;
  getEvaluationsByWorkItem(workItemId: string): Evaluation[];
  getEvaluationsByContext(contextId: string, scopeId: string): Evaluation[];

  // Agent sessions
  insertAgentSession(session: AgentSession): void;
  getAgentSession(sessionId: string): AgentSession | undefined;
  getSessionForWorkItem(workItemId: string): AgentSession | undefined;
  getSessionsForContext(contextId: string): AgentSession[];
  getResumableSessions(scopeId?: string): AgentSession[];
  updateAgentSessionStatus(sessionId: string, status: AgentSession["status"], endedAt?: string): void;
  updateAgentSessionResumeHint(sessionId: string, hint: string): void;

  // Decisions
  insertDecision(decision: ForemanDecisionRow): void;
  getDecisionsByContext(contextId: string, scopeId: string): ForemanDecisionRow[];
  getDecisionById(decisionId: string): ForemanDecisionRow | undefined;
  linkDecisionToOutbound(decisionId: string, outboundId: string): void;

  // Tool call records
  insertToolCallRecord(record: ToolCallRecord): void;
  getToolCallRecordsByExecution(executionId: string): ToolCallRecord[];
  getToolCallRecordsByWorkItem(workItemId: string): ToolCallRecord[];
  updateToolCallRecord(
    callId: string,
    updates: Partial<
      Pick<ToolCallRecord, "exit_status" | "stdout" | "stderr" | "structured_output_json" | "completed_at" | "duration_ms">
    >,
  ): void;

  // Overrides
  insertOverride(override: PolicyOverrideRow): void;
  getOverridesByOutboundId(outboundId: string): PolicyOverrideRow[];

  // Operator action requests
  insertOperatorActionRequest(request: OperatorActionRequest): void;
  getPendingOperatorActionRequests(scopeId?: string): OperatorActionRequest[];
  markOperatorActionRequestExecuted(requestId: string, executedAt?: string): void;

  close(): void;
}

/** Read-only view of CoordinatorStore for observability and UI consumption */
export type CoordinatorStoreView = Omit<
  CoordinatorStore,
  | "initSchema"
  | "close"
  | "nextRevisionOrdinal"
  | "recordRevision"
  | "insertWorkItem"
  | "updateWorkItemStatus"
  | "insertLease"
  | "updateLeaseExpiry"
  | "releaseLease"
  | "recoverStaleLeases"
  | "insertExecutionAttempt"
  | "updateExecutionAttemptStatus"
  | "insertEvaluation"
  | "insertAgentSession"
  | "updateAgentSessionStatus"
  | "updateAgentSessionResumeHint"
  | "insertDecision"
  | "linkDecisionToOutbound"
  | "insertToolCallRecord"
  | "updateToolCallRecord"
  | "insertOverride"
  | "insertOperatorActionRequest"
  | "markOperatorActionRequestExecuted"
>;

/** Operator-action view of CoordinatorStore — allows only audited, validated mutations via executeOperatorAction */
export type CoordinatorStoreOperatorView = CoordinatorStoreView &
  Pick<
    CoordinatorStore,
    | "updateWorkItemStatus"
    | "insertOperatorActionRequest"
    | "markOperatorActionRequestExecuted"
  >;

/** Safe operator action request — UI may request, never mutate control truth directly */
export interface OperatorActionRequest {
  request_id: string;
  scope_id: string;
  action_type: "retry_work_item" | "acknowledge_alert" | "rebuild_views" | "request_redispatch" | "trigger_sync";
  target_id: string | null;
  payload_json: string | null;
  status: "pending" | "executed" | "rejected";
  requested_at: string;
  executed_at: string | null;
}
