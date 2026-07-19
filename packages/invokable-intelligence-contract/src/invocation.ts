/**
 * The invocation chain: InvocationIntent -> InvocationPlan ->
 * InvocationAttempt -> InvocationEvidence, plus typed InvocationRefusal
 * when no eligible plan exists. Plans carry explicit resolved resource
 * references and full decision provenance — never provider/model names.
 */

import type { CapabilityKey } from "./assertions.js";
import type { ResourceRef } from "./ids.js";

export const INVOCATION_INTENT_SCHEMA = "narada.invokable-intelligence.invocation-intent.v1" as const;
export const INVOCATION_PLAN_SCHEMA = "narada.invokable-intelligence.invocation-plan.v1" as const;
export const INVOCATION_ATTEMPT_SCHEMA = "narada.invokable-intelligence.invocation-attempt.v1" as const;
export const INVOCATION_EVIDENCE_SCHEMA = "narada.invokable-intelligence.invocation-evidence.v1" as const;
export const INVOCATION_REFUSAL_SCHEMA = "narada.invokable-intelligence.invocation-refusal.v1" as const;

export interface InvocationIntent {
  schema: typeof INVOCATION_INTENT_SCHEMA;
  id: string;
  created_at: string;
  principal?: string;
  /** What the invocation is for, e.g. "operator-chat", "worker-step", "transcription". */
  purpose: string;
  /** Capabilities the invocation requires (hard requirement, not preference). */
  required_capabilities?: CapabilityKey[];
  /** Explicitly requested model; resolver treats this as a hard filter. */
  requested_model?: ResourceRef;
  /** Requested invocation options, e.g. { thinking: "low" }. */
  requested_options?: Record<string, unknown>;
}

export interface ResolvedSelection {
  model: ResourceRef;
  model_provider: ResourceRef;
  inference_provider: ResourceRef;
  endpoint: ResourceRef;
  adapter: ResourceRef;
  credential: ResourceRef;
}

export interface ProvenanceEntry {
  /** What was applied, e.g. a policy id, assertion id, or "intent". */
  source: string;
  effect: string;
}

export interface RejectedCandidate {
  candidate: ResourceRef;
  reasons: string[];
}

export interface DecisionProvenance {
  applied_constraints: ProvenanceEntry[];
  applied_preferences: ProvenanceEntry[];
  applied_defaults: ProvenanceEntry[];
  rejected_candidates: RejectedCandidate[];
}

export interface InvocationPlan {
  schema: typeof INVOCATION_PLAN_SCHEMA;
  id: string;
  intent_id: string;
  created_at: string;
  resolver_version: string;
  selected: ResolvedSelection;
  /** Effective invocation options after policy/default resolution. */
  options: Record<string, unknown>;
  provenance: DecisionProvenance;
}

export type AttemptState = "started" | "succeeded" | "failed" | "cancelled";

export interface InvocationAttempt {
  schema: typeof INVOCATION_ATTEMPT_SCHEMA;
  id: string;
  plan_id: string;
  state: AttemptState;
  started_at: string;
  ended_at?: string;
  error?: { code: string; message: string };
}

export interface InvocationEvidence {
  schema: typeof INVOCATION_EVIDENCE_SCHEMA;
  id: string;
  attempt_id: string;
  recorded_at: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    latency_ms?: number;
  };
  evidence: import("./assertions.js").EvidenceRef[];
}

export type RefusalReasonCode =
  | "no-candidates"
  | "credentials-unavailable"
  | "stale-capabilities"
  | "policy-conflict"
  | "unsupported-options";

export interface InvocationRefusal {
  schema: typeof INVOCATION_REFUSAL_SCHEMA;
  id: string;
  intent_id: string;
  created_at: string;
  resolver_version: string;
  reason_code: RefusalReasonCode;
  explanation: string;
  rejected_candidates: RejectedCandidate[];
}
