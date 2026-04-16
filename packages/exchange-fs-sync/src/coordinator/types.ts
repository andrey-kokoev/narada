/**
 * Coordinator Store Types
 *
 * Durable state for foreman, charter outputs, thread records, and policy overrides.
 *
 * Spec: .ai/tasks/20260413-012-coordinator-state-and-foreman-handoff.md
 * Spec: .ai/tasks/20260414-004-coordinator-durable-state-v2.md
 */

import type { NormalizedMessage } from "../types/normalized.js";

/** Canonical thread state as seen by the coordinator */
export interface ThreadRecord {
  conversation_id: string;
  mailbox_id: string;
  primary_charter: string;
  secondary_charters_json: string;
  status: string;
  assigned_agent: string | null;
  last_message_at: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_analyzed_at: string | null;
  last_triaged_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Control-plane conversation metadata (v2). */
export interface ConversationRecord {
  conversation_id: string;
  mailbox_id: string;
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

/** Revision ordinal tracking for deterministic conversation snapshots. */
export interface ConversationRevision {
  revision_record_id: number;
  conversation_id: string;
  ordinal: number;
  observed_at: string;
  trigger_event_id: string | null;
}

/** Thread context hydrated from the compiler's filesystem views. */
export interface NormalizedThreadContext {
  conversation_id: string;
  mailbox_id: string;
  revision_id: string;
  messages: NormalizedMessage[];
}

/** Persisted output from charter analysis of a thread */
export interface CharterOutputRow {
  output_id: string;
  conversation_id: string;
  mailbox_id: string;
  charter_id: string;
  role: "primary" | "secondary";
  output_version: string;
  analyzed_at: string;
  summary: string;
  classifications_json: string;
  facts_json: string;
  escalations_json: string;
  proposed_actions_json: string;
  tool_requests_json: string;
  created_at: string;
}

/** Record of a foreman decision and its outbound handoff */
export interface ForemanDecisionRow {
  decision_id: string;
  conversation_id: string;
  mailbox_id: string;
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
  conversation_id: string;
  charter_id: string;
  role: "primary" | "secondary";
  output_version: string;
  analyzed_at: string;
  summary: string;
  classifications_json: string;
  facts_json: string;
  escalations_json: string;
  proposed_actions_json: string;
  tool_requests_json: string;
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

  // Threads (legacy — deprecated in favor of conversation records)
  upsertThread(record: ThreadRecord): void;
  getThread(threadId: string, mailboxId: string): ThreadRecord | undefined;

  // Conversation records (v2)
  upsertConversationRecord(record: ConversationRecord): void;
  getConversationRecord(conversationId: string): ConversationRecord | undefined;

  // Conversation revisions
  nextRevisionOrdinal(conversationId: string): number;
  recordRevision(conversationId: string, ordinal: number, triggerEventId?: string | null): void;
  getLatestRevisionOrdinal(conversationId: string): number | null;

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
  getEvaluationByExecutionId(executionId: string): Evaluation | undefined;
  getEvaluationsByWorkItem(workItemId: string): Evaluation[];

  // Charter outputs
  insertCharterOutput(output: CharterOutputRow): void;
  getOutputsByConversation(conversationId: string, mailboxId: string): CharterOutputRow[];

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
  getDecisionsByConversation(conversationId: string, mailboxId: string): ForemanDecisionRow[];
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

  close(): void;
}
