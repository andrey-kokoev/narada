/**
 * Principal Runtime State Machine
 *
 * Transition validation and state-dependent capability queries.
 *
 * @see Decision 406: Principal Runtime State Machine
 */

import type {
  PrincipalRuntime,
  PrincipalRuntimeState,
  PrincipalAttachmentMode,
  PrincipalRuntimeHealth,
} from "./types.js";

/** Valid state transitions. Keys are "from|to". */
const VALID_TRANSITIONS: ReadonlySet<string> = new Set([
  // Boot / health transitions
  "unavailable|available",
  "available|unavailable",

  // Attachment transitions
  "available|attached_observe",
  "available|attached_interact",
  "attached_observe|attached_interact",
  "attached_observe|detached",
  "attached_interact|attached_observe",
  "attached_interact|detached",

  // Work lifecycle transitions
  "attached_interact|claiming",
  "claiming|executing",
  "claiming|attached_interact",
  "executing|waiting_review",
  "executing|failed",
  "waiting_review|attached_interact",
  "waiting_review|executing",

  // Detachment / staleness
  "attached_observe|stale",
  "attached_interact|stale",
  "detached|stale",
  "stale|attached_observe",
  "stale|attached_interact",
  "stale|available",

  // Budget exhaustion
  "executing|budget_exhausted",
  "waiting_review|budget_exhausted",
  "budget_exhausted|attached_interact",
  "budget_exhausted|detached",

  // Recovery from failure
  "failed|unavailable",
]);

/**
 * Check if a transition from `from` to `to` is valid.
 */
export function isValidTransition(
  from: PrincipalRuntimeState,
  to: PrincipalRuntimeState,
): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS.has(`${from}|${to}`);
}

/**
 * Get the list of valid next states from a given state.
 */
export function validNextStates(
  from: PrincipalRuntimeState,
): PrincipalRuntimeState[] {
  const allStates: PrincipalRuntimeState[] = [
    "unavailable",
    "available",
    "attached_observe",
    "attached_interact",
    "claiming",
    "executing",
    "waiting_review",
    "detached",
    "stale",
    "budget_exhausted",
    "failed",
  ];
  return allStates.filter((s) => s === from || VALID_TRANSITIONS.has(`${from}|${s}`));
}

/**
 * Whether a principal in this state may request a work item lease.
 * The scheduler still decides whether to grant it.
 */
export function canClaimWork(state: PrincipalRuntimeState): boolean {
  return state === "attached_interact" || state === "claiming";
}

/**
 * Whether a principal in this state may execute work it holds a lease for.
 */
export function canExecute(state: PrincipalRuntimeState): boolean {
  return state === "executing";
}

/**
 * Whether a principal in this state is attached to a Site.
 */
export function isAttached(state: PrincipalRuntimeState): boolean {
  return state === "attached_observe" || state === "attached_interact";
}

/**
 * Whether a principal in this state has an active work item.
 */
export function hasActiveWork(state: PrincipalRuntimeState): boolean {
  return (
    state === "claiming" || state === "executing" || state === "waiting_review"
  );
}

/**
 * Whether a principal in this state is in a terminal/error condition.
 */
export function isTerminalState(state: PrincipalRuntimeState): boolean {
  return state === "failed";
}

/**
 * Transition a PrincipalRuntime to a new state, mutating the record in place.
 * Returns false if the transition is invalid.
 */
export function transitionState(
  principal: PrincipalRuntime,
  to: PrincipalRuntimeState,
  detail?: string,
): boolean {
  if (!isValidTransition(principal.state, to)) {
    return false;
  }

  const now = new Date().toISOString();
  principal.state = to;
  principal.state_changed_at = now;
  if (detail !== undefined) {
    principal.detail = detail;
  }

  // Clear active work references when leaving work states
  if (!hasActiveWork(to) && to !== "claiming") {
    principal.active_work_item_id = null;
    principal.active_session_id = null;
  }

  return true;
}

/**
 * Attach a principal to a scope with a given mode.
 */
export function attachPrincipal(
  principal: PrincipalRuntime,
  scopeId: string,
  mode: PrincipalAttachmentMode,
): boolean {
  const target = mode === "observe" ? "attached_observe" : "attached_interact";
  if (!isValidTransition(principal.state, target)) {
    return false;
  }
  principal.scope_id = scopeId;
  principal.attachment_mode = mode;
  return transitionState(principal, target, `Attached to ${scopeId} as ${mode}`);
}

/**
 * Detach a principal from its current scope.
 */
export function detachPrincipal(
  principal: PrincipalRuntime,
  reason?: string,
): boolean {
  if (!isValidTransition(principal.state, "detached")) {
    return false;
  }
  principal.scope_id = null;
  principal.attachment_mode = null;
  return transitionState(principal, "detached", reason ?? "Detached by operator");
}

/**
 * Mark a principal as stale (heartbeat timeout).
 */
export function markStale(
  principal: PrincipalRuntime,
  reason?: string,
): boolean {
  if (!isValidTransition(principal.state, "stale")) {
    return false;
  }
  return transitionState(principal, "stale", reason ?? "Heartbeat timeout");
}

/**
 * Produce a health snapshot from a PrincipalRuntime record.
 */
export function getPrincipalHealth(
  principal: PrincipalRuntime,
): PrincipalRuntimeHealth {
  return {
    state: principal.state,
    principal_id: principal.principal_id,
    scope_id: principal.scope_id,
    checked_at: new Date().toISOString(),
    detail: principal.detail,
    can_claim_work: canClaimWork(principal.state),
    can_execute: canExecute(principal.state),
  };
}

/**
 * Create a snapshot suitable for serialization (observation, health files).
 */
export function toSnapshot(
  principal: PrincipalRuntime,
): import("./types.js").PrincipalRuntimeSnapshot {
  return {
    runtime_id: principal.runtime_id,
    principal_id: principal.principal_id,
    principal_type: principal.principal_type,
    state: principal.state,
    scope_id: principal.scope_id,
    attachment_mode: principal.attachment_mode,
    state_changed_at: principal.state_changed_at,
    last_heartbeat_at: principal.last_heartbeat_at,
    active_work_item_id: principal.active_work_item_id,
    budget_remaining: principal.budget_remaining,
    budget_unit: principal.budget_unit,
    detail: principal.detail,
  };
}

/**
 * Create a new PrincipalRuntime record in the `unavailable` state.
 */
export function createPrincipalRuntime(
  input: import("./types.js").CreatePrincipalRuntimeInput,
): PrincipalRuntime {
  const now = new Date().toISOString();
  return {
    runtime_id: input.runtime_id,
    principal_id: input.principal_id,
    principal_type: input.principal_type,
    state: "unavailable",
    scope_id: input.scope_id ?? null,
    attachment_mode: input.attachment_mode ?? null,
    created_at: now,
    state_changed_at: now,
    last_heartbeat_at: null,
    active_work_item_id: null,
    active_session_id: null,
    budget_remaining: input.budget_remaining ?? null,
    budget_unit: input.budget_unit ?? null,
    detail: input.detail ?? null,
  };
}
