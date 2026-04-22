/**
 * Principal Runtime types
 *
 * First-class state machine for runtime actors. Ephemeral by design —
 * if all PrincipalRuntime records are deleted, Sites continue running.
 *
 * @see Decision 406: Principal Runtime State Machine
 */

/** 11 canonical states of a PrincipalRuntime */
export type PrincipalRuntimeState =
  | "unavailable"
  | "available"
  | "attached_observe"
  | "attached_interact"
  | "claiming"
  | "executing"
  | "waiting_review"
  | "detached"
  | "stale"
  | "budget_exhausted"
  | "failed";

/** Attachment mode — how the principal is connected to a Site */
export type PrincipalAttachmentMode = "observe" | "interact";

/** Principal type — what kind of actor this is */
export type PrincipalType = "operator" | "agent" | "worker" | "external";

/** The live state of a runtime actor */
export interface PrincipalRuntime {
  /** Unique runtime instance ID (not the identity) */
  runtime_id: string;

  /** Reference to the static Principal identity */
  principal_id: string;

  /** What kind of actor */
  principal_type: PrincipalType;

  /** Current state in the state machine */
  state: PrincipalRuntimeState;

  /** Scope this principal is attached to (if any) */
  scope_id: string | null;

  /** Attachment mode when attached */
  attachment_mode: PrincipalAttachmentMode | null;

  /** When this runtime record was created */
  created_at: string;

  /** When the state last changed */
  state_changed_at: string;

  /** When the principal last sent a heartbeat */
  last_heartbeat_at: string | null;

  /** Active work item lease reference (if claiming/executing/waiting_review) */
  active_work_item_id: string | null;

  /** Active AgentSession reference (if executing/waiting_review) */
  active_session_id: string | null;

  /** Token budget remaining (advisory) */
  budget_remaining: number | null;

  /** Budget unit: tokens, seconds, cost_cents */
  budget_unit: "tokens" | "seconds" | "cost_cents" | null;

  /** Human-readable state detail */
  detail: string | null;
}

/** Input to create a new PrincipalRuntime */
export interface CreatePrincipalRuntimeInput {
  runtime_id: string;
  principal_id: string;
  principal_type: PrincipalType;
  scope_id?: string | null;
  attachment_mode?: PrincipalAttachmentMode | null;
  budget_remaining?: number | null;
  budget_unit?: "tokens" | "seconds" | "cost_cents" | null;
  detail?: string | null;
}

/** Advisory health classification for a principal */
export interface PrincipalRuntimeHealth {
  state: PrincipalRuntimeState;
  principal_id: string;
  scope_id: string | null;
  checked_at: string;
  detail: string | null;
  /** Whether this principal can request/accept work */
  can_claim_work: boolean;
  /** Whether this principal can execute work it holds a lease for */
  can_execute: boolean;
}

/** Serializable snapshot of principal runtime state for health/observation */
export interface PrincipalRuntimeSnapshot {
  runtime_id: string;
  principal_id: string;
  principal_type: PrincipalType;
  state: PrincipalRuntimeState;
  scope_id: string | null;
  attachment_mode: PrincipalAttachmentMode | null;
  state_changed_at: string;
  last_heartbeat_at: string | null;
  active_work_item_id: string | null;
  budget_remaining: number | null;
  budget_unit: string | null;
  detail: string | null;
}
