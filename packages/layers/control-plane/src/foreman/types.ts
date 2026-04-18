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
 * Spec: .ai/tasks/20260415-054-de-mailbox-charter-envelope.md
 */

import type {
  CharterId,
  AllowedAction,
  CharterInvocationEnvelope,
  CharterOutputEnvelope,
  ToolCatalogEntry,
  PriorEvaluation,
  CharterClassification,
  ExtractedFact,
  ProposedAction,
  EscalationProposal,
  ToolInvocationRequest,
  ValidationResult,
} from "@narada2/charters";

export type {
  CharterId,
  AllowedAction,
  CharterInvocationEnvelope,
  CharterOutputEnvelope,
  ToolCatalogEntry,
  PriorEvaluation,
  CharterClassification,
  ExtractedFact,
  ProposedAction,
  EscalationProposal,
  ToolInvocationRequest,
  ValidationResult,
};

export interface SyncCompletionSignal {
  signal_id: string;
  scope_id: string;
  synced_at: string;
  changed_contexts: ChangedContext[];
}

export interface ChangedContext {
  context_id: string;
  previous_revision_ordinal: number | null;
  current_revision_ordinal: number;
  change_kinds: (
    | "new_fact"
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
  nooped: string[]; // context_ids
}

export interface OpenedWorkItem {
  work_item_id: string;
  context_id: string;
  revision_id: string;
}

export interface SupersededWorkItem {
  work_item_id: string;
  context_id: string;
  new_work_item_id: string;
}

export interface ResolveWorkItemRequest {
  work_item_id: string;
  execution_id: string;
  evaluation_id: string;
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
  /** Admit facts into the control plane and open/supersede work items as needed */
  onFactsAdmitted(facts: import("../facts/types.js").Fact[], scopeId: string): Promise<WorkOpeningResult>;
  resolveWorkItem(resolveReq: ResolveWorkItemRequest): Promise<ResolutionResult>;
  /**
   * Handle execution failure for a work item.
   * The foreman decides terminal vs retryable based on retry count and policy.
   * This is the singular failure path; the scheduler delegates here instead of
   * owning terminal failure transitions.
   *
   * @param retryPolicy - `backoff` (default) applies exponential backoff for
   *   ordinary runtime failures. `immediate` makes the item runnable right away,
   *   used when the runner vanished (stale lease) rather than the work failing.
   */
  failWorkItem(workItemId: string, errorMessage: string, retryable: boolean, retryPolicy?: "immediate" | "backoff"): void;
}

// Re-export context types for convenience
export type { PolicyContext, ContextFormationStrategy } from "./context.js";

// ---------------------------------------------------------------------------
// Evaluation Envelope (normalized subset — persisted by runtime, consumed by foreman)
// ---------------------------------------------------------------------------

export interface EvaluationEnvelope {
  evaluation_id: string;
  execution_id: string;
  work_item_id: string;
  context_id: string;
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
