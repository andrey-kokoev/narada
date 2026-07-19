/**
 * Candidate assembly and per-candidate eligibility evaluation. Hard
 * constraints accumulate across loci and can only reduce eligibility;
 * preferences score eligible candidates only.
 */

import type {
  AssertionValue,
  CapabilityAssertion,
  CapabilityKey,
  CredentialLocator,
  InferenceAdapter,
  InferenceEndpoint,
  InferenceProvider,
  InvocationIntent,
  Model,
  ModelProvider,
  PolicyDocument,
  PolicyRule,
  ProvenanceEntry,
  Resource,
  ResourceId,
} from "@narada2/invokable-intelligence-contract";

import type { Candidate, CandidateEvaluation, EliminationReasonCode, ResolverContext } from "./types.js";

export type CapabilityStatus = "satisfied" | "denied" | "missing" | "stale";

export interface CapabilityLookup {
  status: CapabilityStatus;
  value?: AssertionValue;
  assertionId?: string;
}

function isFresh(assertion: CapabilityAssertion, time: string): boolean {
  const t = Date.parse(time);
  if (assertion.validity.valid_from && Date.parse(assertion.validity.valid_from) > t) return false;
  if (assertion.validity.valid_until && Date.parse(assertion.validity.valid_until) < t) return false;
  return true;
}

/**
 * Deterministic capability view for one subject: live assertions only,
 * fresh beats stale, then highest confidence, then lowest id.
 */
export function capabilityLookup(
  assertions: CapabilityAssertion[],
  subjectId: ResourceId,
  key: CapabilityKey,
  time: string,
): CapabilityLookup {
  const matches = assertions.filter(
    (a) => a.subject.id === subjectId && a.capability.family === key.family && a.capability.name === key.name,
  );
  if (matches.length === 0) return { status: "missing" };
  const fresh = matches.filter((a) => isFresh(a, time));
  if (fresh.length === 0) return { status: "stale", assertionId: matches.map((a) => a.id).sort()[0] };
  const best = [...fresh].sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))[0];
  return { status: best.value === false ? "denied" : "satisfied", value: best.value, assertionId: best.id };
}

export function assembleCandidates(resources: Resource[]): Candidate[] {
  const byId = new Map(resources.map((r) => [r.id, r]));
  const candidates: Candidate[] = [];
  for (const resource of resources) {
    if (resource.schema !== "narada.invokable-intelligence.model.v1") continue;
    const modelProvider = byId.get(resource.provider.id);
    if (modelProvider?.schema !== "narada.invokable-intelligence.model-provider.v1") continue;
    for (const endpointResource of resources) {
      if (endpointResource.schema !== "narada.invokable-intelligence.inference-endpoint.v1") continue;
      if (!endpointResource.serves.some((ref) => ref.id === resource.id)) continue;
      const inferenceProvider = byId.get(endpointResource.inference_provider.id);
      const adapter = byId.get(endpointResource.adapter.id);
      if (inferenceProvider?.schema !== "narada.invokable-intelligence.inference-provider.v1") continue;
      if (adapter?.schema !== "narada.invokable-intelligence.adapter.v1") continue;
      let credential: CredentialLocator | null = null;
      if (endpointResource.credential) {
        const credentialResource = byId.get(endpointResource.credential.id);
        if (credentialResource?.schema === "narada.invokable-intelligence.credential-locator.v1") {
          credential = credentialResource;
        }
      }
      candidates.push({
        model: resource,
        modelProvider,
        inferenceProvider: inferenceProvider as InferenceProvider,
        endpoint: endpointResource as InferenceEndpoint,
        adapter: adapter as InferenceAdapter,
        credential,
      });
    }
  }
  candidates.sort((a, b) => a.model.id.localeCompare(b.model.id) || a.endpoint.id.localeCompare(b.endpoint.id));
  return candidates;
}

function candidateRefs(candidate: Candidate): ResourceId[] {
  return [
    candidate.model.id,
    candidate.modelProvider.id,
    candidate.inferenceProvider.id,
    candidate.endpoint.id,
    candidate.adapter.id,
    ...(candidate.credential ? [candidate.credential.id] : []),
  ];
}

function capabilityKeyLabel(key: CapabilityKey): string {
  return `${key.family}/${key.name}`;
}

/** The subject a capability attaches to: credential-family capabilities attach to the path's credential, everything else to the model. */
function capabilitySubject(candidate: Candidate, key: CapabilityKey): ResourceId | null {
  if (key.family === "credential") return candidate.credential?.id ?? null;
  return candidate.model.id;
}

function lookupFor(
  candidate: Candidate,
  assertions: CapabilityAssertion[],
  key: CapabilityKey,
  time: string,
): CapabilityLookup {
  const subject = capabilitySubject(candidate, key);
  if (subject === null) return { status: "missing" };
  return capabilityLookup(assertions, subject, key, time);
}

/** UTC "HH:MM" window membership; supports windows wrapping midnight. */
function inUtcWindow(time: string, startUtc: string, endUtc: string): boolean {
  const minutes = (value: string): number => {
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  };
  const t = new Date(time);
  const now = t.getUTCHours() * 60 + t.getUTCMinutes();
  const start = minutes(startUtc);
  const end = minutes(endUtc);
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

export interface EvaluatedPolicies {
  hardConstraints: PolicyDocument[];
  eligibility: PolicyDocument[];
  preferences: PolicyDocument[];
  defaults: PolicyDocument[];
}

export function evaluateCandidate(
  candidate: Candidate,
  intent: InvocationIntent,
  assertions: CapabilityAssertion[],
  policies: EvaluatedPolicies,
  context: ResolverContext,
): CandidateEvaluation {
  const reasonCodes: EliminationReasonCode[] = [];
  const reasons: string[] = [];
  const appliedConstraints: ProvenanceEntry[] = [];
  const appliedPreferences: ProvenanceEntry[] = [];
  const refs = candidateRefs(candidate);
  const time = context.time;

  const eliminate = (code: EliminationReasonCode, reason: string): void => {
    if (!reasonCodes.includes(code)) reasonCodes.push(code);
    reasons.push(reason);
  };

  // 1. Intent model filter.
  if (intent.requested_model && intent.requested_model.id !== candidate.model.id) {
    eliminate("intent-model-mismatch", `intent requested model '${intent.requested_model.id}'`);
  }

  // 2. Intent required capabilities.
  for (const key of intent.required_capabilities ?? []) {
    const lookup = lookupFor(candidate, assertions, key, time);
    if (lookup.status === "stale") {
      eliminate("stale-capability", `required capability ${capabilityKeyLabel(key)} only has stale assertions`);
    } else if (lookup.status !== "satisfied") {
      eliminate(
        key.family === "credential" ? "credential-unavailable" : "missing-required-capability",
        `required capability ${capabilityKeyLabel(key)} is ${lookup.status}`,
      );
    }
  }

  // 3. Hard constraints from every locus, cumulative (order: target, user, host; then policy id).
  for (const policy of policies.hardConstraints) {
    for (const rule of policy.rules) {
      if (rule.type === "require-capability") {
        const lookup = lookupFor(candidate, assertions, rule.capability, time);
        if (lookup.status === "satisfied") {
          appliedConstraints.push({
            source: policy.id,
            effect: `satisfied require-capability ${capabilityKeyLabel(rule.capability)}`,
          });
        } else if (lookup.status === "stale") {
          eliminate("stale-capability", `${policy.id}: requires ${capabilityKeyLabel(rule.capability)} (stale)`);
        } else {
          eliminate(
            rule.capability.family === "credential" ? "credential-unavailable" : "hard-constraint",
            `${policy.id}: requires ${capabilityKeyLabel(rule.capability)} (${lookup.status})`,
          );
        }
      } else if (rule.type === "forbid-capability") {
        const lookup = lookupFor(candidate, assertions, rule.capability, time);
        if (lookup.status === "satisfied") {
          eliminate("hard-constraint", `${policy.id}: forbids ${capabilityKeyLabel(rule.capability)}`);
        }
      } else if (rule.type === "forbid-resource") {
        if (refs.includes(rule.resource.id)) {
          eliminate("hard-constraint", `${policy.id}: forbids resource '${rule.resource.id}'`);
        }
      }
    }
  }

  // 4. Host feasibility (eligibility locus): deny eliminates; any allow rule makes an allowlist.
  const allowRules: Array<Extract<PolicyRule, { type: "allow-resource" }>> = [];
  for (const policy of policies.eligibility) {
    for (const rule of policy.rules) {
      if (rule.type === "deny-resource" && refs.includes(rule.resource.id)) {
        eliminate("host-infeasible", `${policy.id}: host denies '${rule.resource.id}'`);
      } else if (rule.type === "allow-resource") {
        allowRules.push(rule);
      }
    }
  }
  if (allowRules.length > 0) {
    const allowed = allowRules.some((rule) =>
      [candidate.inferenceProvider.id, candidate.endpoint.id, candidate.model.id].includes(rule.resource.id),
    );
    if (!allowed) {
      eliminate("host-infeasible", "host eligibility allowlist does not include this path");
    }
  }

  // 5. Credential feasibility at the host locus (or global).
  if (candidate.endpoint.credential) {
    if (!candidate.credential) {
      eliminate("credential-unavailable", `endpoint credential '${candidate.endpoint.credential.id}' is not in the registry`);
    } else {
      const lookup = lookupFor(candidate, assertions, { family: "credential", name: "feasible" }, time);
      if (lookup.status === "stale") {
        eliminate("stale-capability", `credential '${candidate.credential.id}' feasibility evidence is stale`);
      } else if (lookup.status !== "satisfied") {
        eliminate(
          "credential-unavailable",
          `credential '${candidate.credential.id}' feasibility is ${lookup.status} for this host`,
        );
      } else {
        appliedConstraints.push({ source: lookup.assertionId ?? "credential", effect: `credential '${candidate.credential.id}' feasible` });
      }
    }
  }

  // 6. Requested option support (v1 families: thinking, batch).
  const options = intent.requested_options ?? {};
  if (options.thinking !== undefined) {
    const lookup = lookupFor(candidate, assertions, { family: "thinking", name: "levels" }, time);
    const levels =
      lookup.status === "satisfied" && typeof lookup.value === "object" && !Array.isArray(lookup.value) && lookup.value !== null
        ? (lookup.value as Record<string, unknown>).levels
        : undefined;
    if (lookup.status === "stale") {
      eliminate("stale-capability", `thinking levels evidence for '${candidate.model.id}' is stale`);
    } else if (lookup.status !== "satisfied" || !Array.isArray(levels) || !levels.includes(String(options.thinking))) {
      eliminate("unsupported-options", `thinking='${String(options.thinking)}' is not supported by '${candidate.model.id}'`);
    }
  }
  if (options.batch === true) {
    const lookup = lookupFor(candidate, assertions, { family: "batch", name: "available" }, time);
    if (lookup.status === "stale") {
      eliminate("stale-capability", `batch availability evidence for '${candidate.model.id}' is stale`);
    } else if (lookup.status !== "satisfied") {
      eliminate("unsupported-options", `batch invocation is not supported by '${candidate.model.id}' (${lookup.status})`);
    }
    const window = capabilityLookup(assertions, candidate.model.id, { family: "off-peak", name: "window" }, time);
    if (window.status === "satisfied" && typeof window.value === "object" && window.value !== null && !Array.isArray(window.value)) {
      const value = window.value as Record<string, unknown>;
      if (typeof value.start_utc === "string" && typeof value.end_utc === "string") {
        if (!inUtcWindow(time, value.start_utc, value.end_utc)) {
          eliminate(
            "unsupported-options",
            `batch is restricted to the off-peak window ${value.start_utc}-${value.end_utc} UTC (now ${time})`,
          );
        }
      }
    }
  }

  // 7. Score eligible candidates with User-Site preferences only.
  let score = 0;
  if (reasonCodes.length === 0) {
    for (const policy of policies.preferences) {
      for (const rule of policy.rules) {
        if (rule.type === "prefer-resource" && refs.includes(rule.resource.id)) {
          score += rule.weight;
          appliedPreferences.push({ source: policy.id, effect: `+${rule.weight} prefer '${rule.resource.id}'` });
        } else if (rule.type === "prefer-capability") {
          const lookup = lookupFor(candidate, assertions, rule.capability, time);
          if (lookup.status === "satisfied") {
            score += rule.weight;
            appliedPreferences.push({
              source: policy.id,
              effect: `+${rule.weight} prefer capability ${capabilityKeyLabel(rule.capability)}`,
            });
          }
        }
      }
    }
  }

  return {
    candidate,
    eligible: reasonCodes.length === 0,
    reasonCodes,
    reasons,
    appliedConstraints,
    appliedPreferences,
    score,
  };
}
