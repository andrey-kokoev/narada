/**
 * Invocation execution records with explicit separation between payload
 * result, terminal outcome, observation, admitted audit evidence, and
 * non-sensitive telemetry.
 */

import type { EvidenceRef, Provenance } from "./assertions.js";
import type { ContentDigest } from "./temporal.js";

export const INVOCATION_EXECUTION_ATTEMPT_SCHEMA = "narada.invokable-intelligence.execution-attempt.v1" as const;
export const INVOCATION_EXECUTION_TRANSITION_SCHEMA = "narada.invokable-intelligence.execution-transition.v1" as const;
export const INVOCATION_RESULT_ENVELOPE_SCHEMA = "narada.invokable-intelligence.result-envelope.v1" as const;
export const INVOCATION_TERMINAL_OUTCOME_SCHEMA = "narada.invokable-intelligence.terminal-outcome.v1" as const;
export const INVOCATION_OBSERVATION_SCHEMA = "narada.invokable-intelligence.observation.v1" as const;
export const INVOCATION_AUDIT_EVIDENCE_SCHEMA = "narada.invokable-intelligence.audit-evidence.v1" as const;
export const INVOCATION_TELEMETRY_SCHEMA = "narada.invokable-intelligence.telemetry.v1" as const;

export type InvocationExecutionState =
  | "created"
  | "admission-pending"
  | "admitted"
  | "dispatching"
  | "provider-pending"
  | "terminal";

export type InvocationTerminalOutcomeKind =
  | "success"
  | "provider-failure"
  | "cancelled"
  | "timeout"
  | "admission-unknown"
  | "pre-invocation-refusal";

export interface InvocationExecutionAttempt {
  schema: typeof INVOCATION_EXECUTION_ATTEMPT_SCHEMA;
  id: string;
  intent_id: string;
  plan_id: string;
  /** Immutable initial state. Later states are append-only transition records. */
  state: "created";
  created_at: string;
  lineage: {
    relation: "initial" | "retry-of" | "replay-of" | "resume-of";
    predecessor_attempt_id?: string;
  };
}

/** One immutable state change for an execution attempt. */
export interface InvocationExecutionTransition {
  schema: typeof INVOCATION_EXECUTION_TRANSITION_SCHEMA;
  id: string;
  attempt_id: string;
  sequence: number;
  previous_state: InvocationExecutionState;
  state: InvocationExecutionState;
  transitioned_at: string;
}

/** Validate outcome shape independently of an attempt transition. */
export function validateInvocationTerminalOutcome(outcome: InvocationTerminalOutcome): InvocationOutcomeDiagnostic[] {
  if (outcome.kind === "pre-invocation-refusal") {
    return outcome.refusal_id && !outcome.attempt_id && !outcome.plan_id && !outcome.result_id
      ? []
      : [{ code: "invalid-terminal-outcome", subject_id: outcome.id, message: "A pre-invocation refusal requires only intent/refusal lineage and cannot claim a plan, attempt, or result." }];
  }
  if (!outcome.attempt_id || !outcome.plan_id) {
    return [{ code: "invalid-terminal-outcome", subject_id: outcome.id, message: "Executed outcomes require plan and attempt identities." }];
  }
  if (outcome.kind === "success" && !outcome.result_id) {
    return [{ code: "invalid-terminal-outcome", subject_id: outcome.id, message: "Success requires a distinct result envelope." }];
  }
  if (outcome.kind === "admission-unknown" && outcome.admission_acknowledged === true) {
    return [{ code: "invalid-terminal-outcome", subject_id: outcome.id, message: "Unknown admission cannot simultaneously claim acknowledged admission." }];
  }
  return [];
}

export interface PayloadAccessPolicy {
  allowed_principals: string[];
  capability_refs: string[];
}

export interface PayloadRetentionPolicy {
  mode: "retain" | "redact" | "delete-after" | "never-retain";
  policy_ref: string;
  expires_at?: string;
  residency: string;
}

export interface RetainedPayloadRef {
  /** Digest remains after redaction/deletion when policy permits audit retention. */
  digest: ContentDigest;
  media_type: string;
  classification: "public" | "internal" | "confidential" | "restricted";
  retention: PayloadRetentionPolicy;
  access: PayloadAccessPolicy;
  disposition: "retained" | "redacted" | "deleted" | "never-retained";
  /** Present only while policy permits retrievable payload material. */
  storage_ref?: string;
  redaction_profile_ref?: string;
  tombstone?: {
    disposed_at: string;
    reason_code: string;
    evidence_ref: string;
  };
}

export interface InvocationResultEnvelope {
  schema: typeof INVOCATION_RESULT_ENVELOPE_SCHEMA;
  id: string;
  attempt_id: string;
  plan_id: string;
  produced_at: string;
  kind: "provider-response" | "partial-response" | "provider-error-payload";
  payload: RetainedPayloadRef;
  provider_result_ref?: string;
}

export interface InvocationTerminalOutcome {
  schema: typeof INVOCATION_TERMINAL_OUTCOME_SCHEMA;
  id: string;
  /** Absent only for a refusal that occurs before any execution attempt exists. */
  attempt_id?: string;
  intent_id: string;
  /** Absent only when canonical resolution refused before producing a plan. */
  plan_id?: string;
  kind: InvocationTerminalOutcomeKind;
  terminal_at: string;
  result_id?: string;
  refusal_id?: string;
  error?: { code: string; message_ref?: string; retryable: boolean };
  /** True only when admission is known, not merely when a transport send occurred. */
  admission_acknowledged?: boolean;
}

export type InvocationSubjectKind = "intent" | "plan" | "attempt" | "result" | "outcome";

export interface InvocationSubjectRef {
  kind: InvocationSubjectKind;
  id: string;
}

/** Read-only observation until admitted by an evidence regime. */
export interface InvocationObservation {
  schema: typeof INVOCATION_OBSERVATION_SCHEMA;
  id: string;
  subject: InvocationSubjectRef;
  kind:
    | "transport-submitted"
    | "transport-acknowledgment"
    | "provider-event"
    | "cancellation-requested"
    | "timeout-observed"
    | "payload-disposed";
  observed_at: string;
  status: "observed" | "not-observed" | "uncertain";
  provenance: Provenance;
  integrity_digest?: ContentDigest;
  evidence_refs: EvidenceRef[];
}

/** Authority-bearing evidence only after explicit evidence admission. */
export interface InvocationAuditEvidence {
  schema: typeof INVOCATION_AUDIT_EVIDENCE_SCHEMA;
  id: string;
  subjects: InvocationSubjectRef[];
  evidence_type:
    | "admission-decision"
    | "execution-transition"
    | "result-integrity"
    | "terminal-outcome"
    | "retention-disposition"
    | "reconciliation";
  admitted_at: string;
  admitted_by: string;
  admission_ref: string;
  provenance: Provenance;
  integrity_digest: ContentDigest;
  source_observation_ids: string[];
  evidence_refs: EvidenceRef[];
}

/** Operational metrics contain no request or response payload material. */
export interface InvocationOperationalTelemetry {
  schema: typeof INVOCATION_TELEMETRY_SCHEMA;
  id: string;
  attempt_id: string;
  recorded_at: string;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  latency_ms?: number;
  queue_ms?: number;
  provider_request_ref?: string;
  cost?: { amount: number; currency: string };
}

export type InvocationOutcomeDiagnosticCode =
  | "invalid-attempt-lineage"
  | "invalid-attempt-transition"
  | "invalid-terminal-outcome"
  | "duplicate-attempt"
  | "duplicate-transition"
  | "duplicate-result"
  | "duplicate-terminal-outcome"
  | "orphan-result"
  | "orphan-transition"
  | "orphan-outcome"
  | "invalid-payload-retention"
  | "payload-leaked-into-telemetry";

export interface InvocationOutcomeDiagnostic {
  code: InvocationOutcomeDiagnosticCode;
  subject_id?: string;
  message: string;
}

const ALLOWED_TRANSITIONS: Record<InvocationExecutionState, readonly InvocationExecutionState[]> = {
  created: ["admission-pending", "dispatching", "terminal"],
  "admission-pending": ["admitted", "terminal"],
  admitted: ["dispatching", "terminal"],
  dispatching: ["provider-pending", "terminal"],
  "provider-pending": ["terminal"],
  terminal: [],
};

const TERMINAL_KINDS_BY_PRIOR_STATE: Record<Exclude<InvocationExecutionState, "terminal">, readonly InvocationTerminalOutcomeKind[]> = {
  created: ["provider-failure", "cancelled", "timeout", "admission-unknown"],
  "admission-pending": ["admission-unknown", "pre-invocation-refusal", "cancelled", "timeout"],
  admitted: ["cancelled", "timeout"],
  dispatching: ["provider-failure", "cancelled", "timeout", "admission-unknown"],
  "provider-pending": ["success", "provider-failure", "cancelled", "timeout", "admission-unknown"],
};

export function validateInvocationAttemptTransition(
  from: InvocationExecutionState,
  to: InvocationExecutionState,
  outcome?: InvocationTerminalOutcome,
): InvocationOutcomeDiagnostic[] {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    return [{ code: "invalid-attempt-transition", message: `Attempt transition ${from} -> ${to} is not allowed.` }];
  }
  if (to !== "terminal" && outcome) {
    return [{ code: "invalid-terminal-outcome", subject_id: outcome.id, message: "A terminal outcome may accompany only a terminal transition." }];
  }
  if (to === "terminal") {
    if (!outcome || from === "terminal") {
      return [{ code: "invalid-terminal-outcome", subject_id: outcome?.id, message: "Terminal transitions require an outcome allowed from the prior state." }];
    }
    if (!TERMINAL_KINDS_BY_PRIOR_STATE[from].includes(outcome.kind)) {
      return [{ code: "invalid-terminal-outcome", subject_id: outcome.id, message: `${outcome.kind} is not a valid terminal outcome from ${from}.` }];
    }
    if (outcome.kind === "success" && !outcome.result_id) {
      return [{ code: "invalid-terminal-outcome", subject_id: outcome.id, message: "Success requires a distinct result envelope." }];
    }
    if (outcome.kind === "pre-invocation-refusal" && !outcome.refusal_id) {
      return [{ code: "invalid-terminal-outcome", subject_id: outcome.id, message: "Pre-invocation refusal requires a typed refusal reference." }];
    }
    if (outcome.kind === "admission-unknown" && outcome.admission_acknowledged === true) {
      return [{ code: "invalid-terminal-outcome", subject_id: outcome.id, message: "Unknown admission cannot simultaneously claim acknowledged admission." }];
    }
  }
  return [];
}

export function validateRetainedPayloadRef(payload: RetainedPayloadRef): InvocationOutcomeDiagnostic[] {
  const diagnostics: InvocationOutcomeDiagnostic[] = [];
  const retrievable = payload.disposition === "retained" || payload.disposition === "redacted";
  if (retrievable !== Boolean(payload.storage_ref)) {
    diagnostics.push({
      code: "invalid-payload-retention",
      message: "Only retained/redacted payloads may have storage_ref, and retrievable payloads require one.",
    });
  }
  if ((payload.disposition === "deleted" || payload.disposition === "never-retained") && !payload.tombstone) {
    diagnostics.push({ code: "invalid-payload-retention", message: "Deleted or never-retained payloads require a durable disposition tombstone." });
  }
  if (payload.retention.mode === "delete-after" && !payload.retention.expires_at) {
    diagnostics.push({ code: "invalid-payload-retention", message: "delete-after retention requires expires_at." });
  }
  return diagnostics;
}

export interface InvocationExecutionHistory {
  attempts: InvocationExecutionAttempt[];
  transitions: InvocationExecutionTransition[];
  results: InvocationResultEnvelope[];
  outcomes: InvocationTerminalOutcome[];
}

export function validateInvocationExecutionHistory(history: InvocationExecutionHistory): InvocationOutcomeDiagnostic[] {
  const diagnostics: InvocationOutcomeDiagnostic[] = [];
  const duplicateIds = <T extends { id: string }>(records: readonly T[]) =>
    [...new Set(records.map(({ id }) => id))].filter((id) => records.filter((record) => record.id === id).length > 1);
  duplicateIds(history.attempts).forEach((id) => diagnostics.push({ code: "duplicate-attempt", subject_id: id, message: "Retry/replay attempts require new immutable identities." }));
  duplicateIds(history.transitions).forEach((id) => diagnostics.push({ code: "duplicate-transition", subject_id: id, message: "Execution transitions require new immutable identities." }));
  duplicateIds(history.results).forEach((id) => diagnostics.push({ code: "duplicate-result", subject_id: id, message: "Result identities are immutable and cannot be overwritten." }));
  duplicateIds(history.outcomes).forEach((id) => diagnostics.push({ code: "duplicate-terminal-outcome", subject_id: id, message: "Outcome identities are immutable and cannot be overwritten." }));

  const attempts = new Map(history.attempts.map((attempt) => [attempt.id, attempt]));
  for (const attempt of history.attempts) {
    const needsPredecessor = attempt.lineage.relation !== "initial";
    if (needsPredecessor && (!attempt.lineage.predecessor_attempt_id || !attempts.has(attempt.lineage.predecessor_attempt_id) || attempt.lineage.predecessor_attempt_id === attempt.id)) {
      diagnostics.push({ code: "invalid-attempt-lineage", subject_id: attempt.id, message: `${attempt.lineage.relation} requires a distinct existing predecessor attempt.` });
    }
    if (!needsPredecessor && attempt.lineage.predecessor_attempt_id) {
      diagnostics.push({ code: "invalid-attempt-lineage", subject_id: attempt.id, message: "Initial attempts cannot name predecessors." });
    }
  }
  for (const result of history.results) {
    if (!attempts.has(result.attempt_id)) diagnostics.push({ code: "orphan-result", subject_id: result.id, message: `Result references unknown attempt ${result.attempt_id}.` });
    diagnostics.push(...validateRetainedPayloadRef(result.payload).map((diagnostic) => ({ ...diagnostic, subject_id: result.id })));
  }
  const outcomeCountByAttempt = new Map<string, number>();
  for (const outcome of history.outcomes) {
    diagnostics.push(...validateInvocationTerminalOutcome(outcome));
    if (outcome.attempt_id && !attempts.has(outcome.attempt_id)) diagnostics.push({ code: "orphan-outcome", subject_id: outcome.id, message: `Outcome references unknown attempt ${outcome.attempt_id}.` });
    if (outcome.attempt_id) outcomeCountByAttempt.set(outcome.attempt_id, (outcomeCountByAttempt.get(outcome.attempt_id) ?? 0) + 1);
    if (outcome.result_id && !history.results.some(({ id, attempt_id }) => id === outcome.result_id && attempt_id === outcome.attempt_id)) {
      diagnostics.push({ code: "invalid-terminal-outcome", subject_id: outcome.id, message: "Outcome result_id must identify a result owned by the same attempt." });
    }
  }
  for (const [attemptId, count] of outcomeCountByAttempt) {
    if (count > 1) diagnostics.push({ code: "duplicate-terminal-outcome", subject_id: attemptId, message: "An attempt may have exactly one immutable terminal outcome." });
  }

  const outcomesByAttempt = new Map(
    history.outcomes.flatMap((outcome) =>
      outcome.attempt_id ? ([[outcome.attempt_id, outcome]] as const) : [],
    ),
  );
  const transitionsByAttempt = new Map<string, InvocationExecutionTransition[]>();
  for (const transition of history.transitions) {
    const transitions = transitionsByAttempt.get(transition.attempt_id) ?? [];
    transitions.push(transition);
    transitionsByAttempt.set(transition.attempt_id, transitions);
  }
  for (const [attemptId, transitions] of transitionsByAttempt) {
    const attempt = attempts.get(attemptId);
    if (!attempt) {
      transitions.forEach(({ id }) => diagnostics.push({ code: "orphan-transition", subject_id: id, message: `Transition references unknown attempt ${attemptId}.` }));
      continue;
    }
    let state: InvocationExecutionState = attempt.state;
    let expectedSequence = 1;
    for (const transition of [...transitions].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id))) {
      if (!Number.isInteger(transition.sequence) || transition.sequence !== expectedSequence || transition.previous_state !== state) {
        diagnostics.push({ code: "invalid-attempt-transition", subject_id: transition.id, message: `Attempt ${attemptId} has a non-contiguous or incorrectly linked transition.` });
      }
      const outcome = transition.state === "terminal" ? outcomesByAttempt.get(attemptId) : undefined;
      diagnostics.push(...validateInvocationAttemptTransition(state, transition.state, outcome).map((item) => ({ ...item, subject_id: transition.id })));
      state = transition.state;
      expectedSequence += 1;
    }
    if (outcomesByAttempt.has(attemptId) && state !== "terminal") {
      diagnostics.push({ code: "invalid-attempt-transition", subject_id: attemptId, message: "An attempt with a terminal outcome requires a terminal transition." });
    }
  }
  return diagnostics;
}
