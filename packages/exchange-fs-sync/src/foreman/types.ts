/**
 * Foreman Types
 *
 * Control-plane contracts for daemon dispatch, work opening, charter invocation,
 * evaluation validation, and outbound handoff.
 *
 * Spec: .ai/tasks/20260414-014-impl-foreman-core.md
 * Spec: .ai/tasks/20260414-006-assignment-agent-b-charter-invocation-v2.md
 * Spec: .ai/tasks/20260414-008-assignment-agent-d-outbound-handoff-v2.md
 * Spec: .ai/tasks/20260414-010-assignment-agent-f-daemon-foreman-dispatch.md
 */

import type { NormalizedThreadContext } from "../coordinator/types.js";

export type CharterId = string;

export type AllowedAction =
  | "draft_reply"
  | "send_reply"
  | "send_new_message"
  | "mark_read"
  | "move_message"
  | "set_categories"
  | "extract_obligations"
  | "create_followup"
  | "tool_request"
  | "process_run"
  | "no_action";

export interface SyncCompletionSignal {
  signal_id: string;
  mailbox_id: string;
  synced_at: string;
  changed_conversations: ChangedConversation[];
}

export interface ChangedConversation {
  conversation_id: string;
  previous_revision_ordinal: number | null;
  current_revision_ordinal: number;
  change_kinds: (
    | "new_message"
    | "moved"
    | "flagged"
    | "draft_observed"
    | "participant_change"
  )[];
}

export interface WorkOpeningResult {
  opened: OpenedWorkItem[];
  superseded: SupersededWorkItem[];
  nooped: string[]; // conversation_ids
}

export interface OpenedWorkItem {
  work_item_id: string;
  conversation_id: string;
  revision_id: string;
}

export interface SupersededWorkItem {
  work_item_id: string;
  conversation_id: string;
  new_work_item_id: string;
}

export interface ResolveWorkItemRequest {
  work_item_id: string;
  execution_id: string;
  evaluation: EvaluationEnvelope;
}

export interface ResolutionResult {
  success: boolean;
  decision_id?: string;
  outbound_id?: string;
  resolution_outcome: WorkItem["resolution_outcome"];
  error?: string;
}

export interface ForemanFacade {
  onSyncCompleted(signal: SyncCompletionSignal): Promise<WorkOpeningResult>;
  resolveWorkItem(resolveReq: ResolveWorkItemRequest): Promise<ResolutionResult>;
}

// ---------------------------------------------------------------------------
// Charter Invocation Envelope
// ---------------------------------------------------------------------------

export interface CharterInvocationEnvelope {
  invocation_version: "2.0";
  execution_id: string;
  work_item_id: string;
  conversation_id: string;
  mailbox_id: string;
  charter_id: CharterId;
  role: "primary" | "secondary";
  invoked_at: string;
  revision_id: string;
  thread_context: NormalizedThreadContext;
  allowed_actions: AllowedAction[];
  available_tools: ToolCatalogEntry[];
  coordinator_flags: string[];
  prior_evaluations: PriorEvaluation[];
  max_prior_evaluations: number;
}

export interface ToolCatalogEntry {
  tool_id: string;
  tool_signature: string;
  description: string;
  schema_args?: { name: string; type: string; required: boolean; description: string }[];
  read_only: boolean;
  requires_approval: boolean;
  timeout_ms: number;
}

export interface PriorEvaluation {
  evaluation_id: string;
  charter_id: CharterId;
  role: "primary" | "secondary";
  evaluated_at: string;
  summary: string;
  key_classifications: { kind: string; confidence: "low" | "medium" | "high" }[];
}

// ---------------------------------------------------------------------------
// Charter Output / Evaluation Envelope
// ---------------------------------------------------------------------------

export interface CharterOutputEnvelope {
  output_version: "2.0";
  execution_id: string;
  charter_id: CharterId;
  role: "primary" | "secondary";
  analyzed_at: string;
  outcome: "complete" | "clarification_needed" | "escalation" | "no_op";
  confidence: {
    overall: "low" | "medium" | "high";
    uncertainty_flags: string[];
  };
  summary: string;
  classifications: CharterClassification[];
  facts: ExtractedFact[];
  recommended_action_class?: AllowedAction;
  proposed_actions: ProposedAction[];
  tool_requests: ToolInvocationRequest[];
  escalations: EscalationProposal[];
  reasoning_log?: string;
}

export interface CharterClassification {
  kind: string;
  confidence: "low" | "medium" | "high";
  rationale: string;
}

export interface ExtractedFact {
  kind: string;
  value_json: string;
  source_message_ids: string[];
  confidence: "low" | "medium" | "high";
}

export interface ProposedAction {
  action_type: AllowedAction;
  authority: "proposed" | "recommended";
  payload_json: string;
  rationale: string;
}

export interface EscalationProposal {
  kind: string;
  reason: string;
  urgency: "low" | "medium" | "high";
  suggested_recipient?: string;
}

export interface ToolInvocationRequest {
  tool_id: string;
  arguments_json: string;
  purpose: string;
}

// ---------------------------------------------------------------------------
// Evaluation Envelope (normalized subset persisted by foreman)
// ---------------------------------------------------------------------------

export interface EvaluationEnvelope {
  evaluation_id: string;
  execution_id: string;
  work_item_id: string;
  conversation_id: string;
  charter_id: CharterId;
  role: "primary" | "secondary";
  output_version: string;
  analyzed_at: string;
  outcome: CharterOutputEnvelope["outcome"];
  confidence: CharterOutputEnvelope["confidence"];
  summary: string;
  classifications: CharterClassification[];
  facts: ExtractedFact[];
  recommended_action_class?: AllowedAction;
  proposed_actions: ProposedAction[];
  tool_requests: ToolInvocationRequest[];
  escalations: EscalationProposal[];
}

// Minimal WorkItem shape referenced in ResolutionResult
export interface WorkItem {
  resolution_outcome: "no_op" | "action_created" | "escalated" | "pending_approval" | "failed" | null;
}
