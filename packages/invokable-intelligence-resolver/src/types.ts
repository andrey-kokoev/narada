/**
 * Resolver types. Resolution context is EXPLICIT — sites, runtime, and
 * time are inputs, never ambient (no provider/model environment
 * variables, no insertion-order precedence).
 */

import type {
  CredentialLocator,
  InferenceAdapter,
  InferenceEndpoint,
  InferenceProvider,
  Model,
  ModelProvider,
  ProvenanceEntry,
  ResourceRef,
} from "@narada2/invokable-intelligence-contract";

export const RESOLVER_VERSION = "invokable-intelligence-resolver/0.1.0" as const;

export interface ResolverContext {
  targetSite: ResourceRef;
  userSite: ResourceRef;
  hostSite: ResourceRef;
  runtime: "node" | "workers" | "test";
  /** ISO-8601 resolution time. Plans stamp this exact value, so identical inputs are byte-stable. */
  time: string;
}

/** A fully joined invocation path: model served by an endpoint, driven by an adapter, authenticated by a credential. */
export interface Candidate {
  model: Model;
  modelProvider: ModelProvider;
  inferenceProvider: InferenceProvider;
  endpoint: InferenceEndpoint;
  adapter: InferenceAdapter;
  credential: CredentialLocator | null;
}

export type EliminationReasonCode =
  | "intent-model-mismatch"
  | "missing-required-capability"
  | "stale-capability"
  | "hard-constraint"
  | "host-infeasible"
  | "credential-unavailable"
  | "unsupported-options";

export interface CandidateEvaluation {
  candidate: Candidate;
  eligible: boolean;
  reasonCodes: EliminationReasonCode[];
  reasons: string[];
  /** Hard-constraint provenance applied to this candidate (kept for the winner). */
  appliedConstraints: ProvenanceEntry[];
  /** Preference provenance that scored this candidate (kept for the winner). */
  appliedPreferences: ProvenanceEntry[];
  score: number;
}

/** Deterministic 64-bit FNV-1a hex — plan/refusal ids without node:crypto (Workers-safe). */
export function deterministicId(prefix: string, canonical: unknown): string {
  const text = JSON.stringify(canonical);
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `${prefix}:${hash.toString(16).padStart(16, "0")}`;
}
