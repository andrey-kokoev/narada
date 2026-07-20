/**
 * Resolver types. Resolution context is EXPLICIT — sites, runtime, and
 * time are inputs, never ambient (no provider/model environment
 * variables, no insertion-order precedence).
 */

import type {
  CredentialLocator,
  AuthoritativeDecisionClock,
  InferenceAdapter,
  InferenceEndpoint,
  InferenceProvider,
  Model,
  ModelOffering,
  ModelProvider,
  InvocationRouteCandidate,
  RouteAccessEvaluation,
  RouteAccessEvaluationContext,
  ResolvedRouteCapability,
  TopologyFeasibilityObservation,
  TopologyFeasibilityResult,
  ProvenanceEntry,
  ResourceRef,
} from "@narada2/invokable-intelligence-contract";

export const RESOLVER_VERSION = "invokable-intelligence-resolver/0.1.0" as const;

export interface ResolverContext {
  targetSite: ResourceRef;
  userSite: ResourceRef;
  hostSite: ResourceRef;
  runtime: "node" | "workers" | "test";
  /** Explicit named decision clock; ambient wall time is never resolver authority. */
  clock: AuthoritativeDecisionClock;
  /** Explicit request facts used by access, quota, budget, and governance gates. */
  access: Omit<RouteAccessEvaluationContext, "principal" | "target_site_id" | "purpose" | "now">;
  /** Admitted request-scoped observations for the exact topology under consideration. */
  topology_observations: TopologyFeasibilityObservation[];
}

/** Stable JSON for content-addressed resolver snapshots. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** A fully joined invocation path: model served by an endpoint, driven by an adapter, authenticated by a credential. */
export interface Candidate {
  model: Model;
  modelProvider: ModelProvider;
  offering: ModelOffering;
  inferenceProvider: InferenceProvider;
  endpoint: InferenceEndpoint;
  adapter: InferenceAdapter;
  credential: CredentialLocator | null;
  route: InvocationRouteCandidate;
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
  /** Target-Site default rank hints that matched this candidate (kept for the winner). */
  appliedDefaultsRank: ProvenanceEntry[];
  score: number;
  /** Secondary ranking weight from target-Site defaults; strictly below any preference weight. */
  defaultsScore: number;
  routeCapabilities: ResolvedRouteCapability[];
  topology: TopologyFeasibilityResult;
  access: RouteAccessEvaluation;
}

/** Deterministic 64-bit FNV-1a hex — plan/refusal ids without node:crypto (Workers-safe). */
export function deterministicId(prefix: string, canonical: unknown): string {
  const text = canonicalJson(canonical);
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `${prefix}:${hash.toString(16).padStart(16, "0")}`;
}
