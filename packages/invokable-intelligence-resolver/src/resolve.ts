/**
 * Deterministic hierarchical resolution:
 *
 *   intent + explicit context
 *   → load candidates/assertions/policies through the registry contract
 *   → policy-conflict check
 *   → cumulative hard eligibility (intent filter, required capabilities,
 *     hard constraints from all loci, host feasibility, credentials,
 *     option support)
 *   → User-Site preference scoring
 *   → documented stable tie-breakers
 *   → InvocationPlan with full provenance, or typed InvocationRefusal
 *
 * No ambient state: no provider/model env vars, no insertion-order
 * precedence, no nondeterministic scoring.
 */

import {
  validateInvocation,
} from "@narada2/invokable-intelligence-contract";
import type {
  CapabilityKey,
  ContractError,
  InvocationIntent,
  InvocationPlan,
  InvocationRefusal,
  PolicyDocument,
  PolicyLocus,
  ProvenanceEntry,
  RefusalReasonCode,
  RejectedCandidate,
} from "@narada2/invokable-intelligence-contract";
import type { IntelligenceRegistryStore } from "@narada2/invokable-intelligence-registry";

import { assembleCandidates, evaluateCandidate } from "./evaluate.js";
import type { CandidateEvaluation, ResolverContext } from "./types.js";
import { RESOLVER_VERSION, deterministicId } from "./types.js";

export class ResolverError extends Error {
  readonly code: string;
  readonly contractErrors?: ContractError[];

  constructor(code: string, message: string, contractErrors?: ContractError[]) {
    super(message);
    this.name = "ResolverError";
    this.code = code;
    this.contractErrors = contractErrors;
  }
}

const LOCUS_ORDER: Record<PolicyLocus, number> = {
  "target-site": 0,
  "user-site": 1,
  "host-site": 2,
};

function capabilityKeyLabel(key: CapabilityKey): string {
  return `${key.family}/${key.name}`;
}

/** Detect require∩forbid capability conflicts across applicable hard-constraint policies. */
function detectPolicyConflicts(hardConstraints: PolicyDocument[]): string[] {
  const required = new Map<string, string>();
  const forbidden = new Map<string, string>();
  for (const policy of hardConstraints) {
    for (const rule of policy.rules) {
      if (rule.type === "require-capability" && !required.has(capabilityKeyLabel(rule.capability))) {
        required.set(capabilityKeyLabel(rule.capability), policy.id);
      }
      if (rule.type === "forbid-capability" && !forbidden.has(capabilityKeyLabel(rule.capability))) {
        forbidden.set(capabilityKeyLabel(rule.capability), policy.id);
      }
    }
  }
  const conflicts: string[] = [];
  for (const [label, requirePolicy] of [...required.entries()].sort()) {
    const forbidPolicy = forbidden.get(label);
    if (forbidPolicy) {
      conflicts.push(`${label} is both required (${requirePolicy}) and forbidden (${forbidPolicy})`);
    }
  }
  return conflicts;
}

function toRejected(evaluations: CandidateEvaluation[]): RejectedCandidate[] {
  return evaluations.map((evaluation) => ({
    candidate: { kind: "model", id: evaluation.candidate.model.id },
    reasons: evaluation.reasons.length > 0 ? evaluation.reasons : ["not ranked first"],
  }));
}

/**
 * Refusal reason-code selection, deterministic precedence:
 * stale-capabilities → credentials-unavailable → unsupported-options → no-candidates.
 * A code applies when at least one eliminated candidate failed for ONLY that reason.
 */
function selectRefusalCode(evaluations: CandidateEvaluation[]): RefusalReasonCode {
  const only = (code: CandidateEvaluation["reasonCodes"][number]): boolean =>
    evaluations.some((e) => e.reasonCodes.length === 1 && e.reasonCodes[0] === code);
  if (only("stale-capability")) return "stale-capabilities";
  if (only("credential-unavailable")) return "credentials-unavailable";
  if (only("unsupported-options")) return "unsupported-options";
  return "no-candidates";
}

export interface ResolveOptions {
  store: IntelligenceRegistryStore;
}

export async function resolveInvocation(
  intent: InvocationIntent,
  context: ResolverContext,
  options: ResolveOptions,
): Promise<InvocationPlan | InvocationRefusal> {
  const validationErrors = validateInvocation(intent);
  if (validationErrors.length > 0) {
    throw new ResolverError(
      "invalid-intent",
      `intent '${intent.id}' failed contract validation: ${validationErrors[0].code} at ${validationErrors[0].path}`,
      validationErrors,
    );
  }
  const { store } = options;

  const locusSiteIds = new Set([context.targetSite.id, context.userSite.id, context.hostSite.id]);
  const [resources, assertions, hardConstraintsAll, eligibility, preferences, defaults] = await Promise.all([
    store.listResources(),
    store.listAssertions({ includeSuperseded: false }),
    store.listPolicies({ kind: "hard-constraints" }),
    store.listPolicies({ kind: "eligibility", locus: "host-site", siteId: context.hostSite.id }),
    store.listPolicies({ kind: "preferences", locus: "user-site", siteId: context.userSite.id }),
    store.listPolicies({ kind: "defaults", locus: "target-site", siteId: context.targetSite.id }),
  ]);

  const hardConstraints = hardConstraintsAll
    .filter((policy) => locusSiteIds.has(policy.site.id))
    .sort((a, b) => LOCUS_ORDER[a.locus] - LOCUS_ORDER[b.locus] || a.id.localeCompare(b.id));

  const conflicts = detectPolicyConflicts(hardConstraints);
  if (conflicts.length > 0) {
    return {
      schema: "narada.invokable-intelligence.invocation-refusal.v1",
      id: deterministicId("refusal", { intent, context, resolver: RESOLVER_VERSION, conflicts }),
      intent_id: intent.id,
      created_at: context.time,
      resolver_version: RESOLVER_VERSION,
      reason_code: "policy-conflict",
      explanation: `contradictory hard constraints: ${conflicts.join("; ")}`,
      rejected_candidates: [],
    };
  }

  const candidates = assembleCandidates(resources);
  const evaluations = candidates.map((candidate) =>
    evaluateCandidate(candidate, intent, assertions, { hardConstraints, eligibility, preferences, defaults }, context),
  );
  const eligible = evaluations.filter((evaluation) => evaluation.eligible);

  if (eligible.length === 0) {
    const reasonCode = selectRefusalCode(evaluations);
    return {
      schema: "narada.invokable-intelligence.invocation-refusal.v1",
      id: deterministicId("refusal", { intent, context, resolver: RESOLVER_VERSION }),
      intent_id: intent.id,
      created_at: context.time,
      resolver_version: RESOLVER_VERSION,
      reason_code: reasonCode,
      explanation:
        evaluations.length === 0
          ? "no invocation paths are registered"
          : `no eligible invocation path: ${reasonCode}`,
      rejected_candidates: toRejected(evaluations),
    };
  }

  // Rank: score desc, then stable tie-breakers (model id, then endpoint id).
  const ranked = [...eligible].sort(
    (a, b) =>
      b.score - a.score ||
      a.candidate.model.id.localeCompare(b.candidate.model.id) ||
      a.candidate.endpoint.id.localeCompare(b.candidate.endpoint.id),
  );
  const winner = ranked[0];

  // Effective options: target-Site defaults first, intent requested options win.
  const effectiveOptions: Record<string, unknown> = {};
  const appliedDefaults: ProvenanceEntry[] = [];
  for (const policy of [...defaults].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const rule of policy.rules) {
      if (rule.type === "default-option") {
        effectiveOptions[rule.option] = rule.value;
        appliedDefaults.push({ source: policy.id, effect: `${rule.option} = ${JSON.stringify(rule.value)}` });
      }
    }
  }
  for (const [key, value] of Object.entries(intent.requested_options ?? {})) {
    if (!(key in effectiveOptions)) {
      appliedDefaults.push({ source: "intent", effect: `${key} = ${JSON.stringify(value)} (requested)` });
    } else if (JSON.stringify(effectiveOptions[key]) !== JSON.stringify(value)) {
      appliedDefaults.push({ source: "intent", effect: `${key} = ${JSON.stringify(value)} (requested, overrides default)` });
    }
    effectiveOptions[key] = value;
  }

  const selected: InvocationPlan["selected"] = {
    model: { kind: "model", id: winner.candidate.model.id },
    model_provider: { kind: "model-provider", id: winner.candidate.modelProvider.id },
    inference_provider: { kind: "inference-provider", id: winner.candidate.inferenceProvider.id },
    endpoint: { kind: "inference-endpoint", id: winner.candidate.endpoint.id },
    adapter: { kind: "adapter", id: winner.candidate.adapter.id },
  };
  if (winner.candidate.credential) {
    selected.credential = { kind: "credential-locator", id: winner.candidate.credential.id };
  }

  const plan: InvocationPlan = {
    schema: "narada.invokable-intelligence.invocation-plan.v1",
    id: deterministicId("plan", { intent, context, resolver: RESOLVER_VERSION }),
    intent_id: intent.id,
    created_at: context.time,
    resolver_version: RESOLVER_VERSION,
    selected,
    options: effectiveOptions,
    provenance: {
      applied_constraints: winner.appliedConstraints,
      applied_preferences: winner.appliedPreferences,
      applied_defaults: appliedDefaults,
      rejected_candidates: toRejected([
        ...evaluations.filter((e) => !e.eligible),
        ...ranked.slice(1),
      ]),
    },
  };
  return plan;
}
