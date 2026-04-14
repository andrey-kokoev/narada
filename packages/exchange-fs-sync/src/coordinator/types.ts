/**
 * Coordinator Store Types
 *
 * Durable state for foreman, charter outputs, thread records, and policy overrides.
 *
 * Spec: .ai/tasks/20260413-012-coordinator-state-and-foreman-handoff.md
 */

/** Canonical thread state as seen by the coordinator */
export interface ThreadRecord {
  thread_id: string;
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

/** Persisted output from charter analysis of a thread */
export interface CharterOutputRow {
  output_id: string;
  thread_id: string;
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
  thread_id: string;
  mailbox_id: string;
  source_charter_ids_json: string;
  approved_action: string;
  payload_json: string;
  rationale: string;
  decided_at: string;
  outbound_id: string | null;
  created_by: string;
}

/** Explicit override for a blocked_policy command */
export interface PolicyOverrideRow {
  override_id: string;
  outbound_id: string;
  overridden_by: string;
  reason: string;
  created_at: string;
}

/** Coordinator durable state operations */
export interface CoordinatorStore {
  initSchema(): void;

  // Threads
  upsertThread(record: ThreadRecord): void;
  getThread(threadId: string, mailboxId: string): ThreadRecord | undefined;

  // Charter outputs
  insertCharterOutput(output: CharterOutputRow): void;
  getOutputsByThread(threadId: string, mailboxId: string): CharterOutputRow[];

  // Decisions
  insertDecision(decision: ForemanDecisionRow): void;
  getDecisionsByThread(threadId: string, mailboxId: string): ForemanDecisionRow[];
  linkDecisionToOutbound(decisionId: string, outboundId: string): void;

  // Overrides
  insertOverride(override: PolicyOverrideRow): void;
  getOverridesByOutboundId(outboundId: string): PolicyOverrideRow[];

  close(): void;
}
