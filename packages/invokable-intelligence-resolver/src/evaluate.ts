/** Canonical offering/route candidate assembly and pre-ranking eligibility. */

import {
  evaluateExecutionTopologyFeasibility,
  evaluateRouteAccess,
  resolveRouteCapabilities,
} from "@narada2/invokable-intelligence-contract";
import type {
  CatalogAccessRecord,
  CapabilityKey,
  CredentialLocator,
  InferenceAdapter,
  InferenceEndpoint,
  InferenceProvider,
  InvocationIntent,
  InvocationPrincipal,
  InvocationRouteCandidate,
  Model,
  ModelOffering,
  ModelProvider,
  PolicyDocument,
  PolicyRule,
  ProvenanceEntry,
  Resource,
  ResourceId,
  ResolvedRouteCapability,
  RouteAccessFacts,
  RouteCapabilityAssertion,
} from "@narada2/invokable-intelligence-contract";

import type { Candidate, CandidateEvaluation, EliminationReasonCode, ResolverContext } from "./types.js";

export interface EvaluatedPolicies {
  hardConstraints: PolicyDocument[];
  eligibility: PolicyDocument[];
  preferences: PolicyDocument[];
  defaults: PolicyDocument[];
}

function accessSchema<S extends CatalogAccessRecord["schema"]>(schema: S) {
  return (record: CatalogAccessRecord): record is Extract<CatalogAccessRecord, { schema: S }> => record.schema === schema;
}

export function assembleCandidates(resources: Resource[], routes: InvocationRouteCandidate[]): Candidate[] {
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  const candidates: Candidate[] = [];
  for (const route of routes) {
    const offering = byId.get(route.offering.id);
    if (offering?.schema !== "narada.invokable-intelligence.model-offering.v1") continue;
    const model = byId.get(offering.model.id);
    const modelProvider = byId.get(offering.model_provider.id);
    const inferenceProvider = byId.get(offering.inference_provider.id);
    const endpoint = byId.get(route.endpoint.id);
    const adapter = byId.get(route.adapter.id);
    if (model?.schema !== "narada.invokable-intelligence.model.v1") continue;
    if (modelProvider?.schema !== "narada.invokable-intelligence.model-provider.v1") continue;
    if (inferenceProvider?.schema !== "narada.invokable-intelligence.inference-provider.v1") continue;
    if (endpoint?.schema !== "narada.invokable-intelligence.inference-endpoint.v1") continue;
    if (adapter?.schema !== "narada.invokable-intelligence.adapter.v1") continue;
    const credentialResource = route.access.credential ? byId.get(route.access.credential.id) : undefined;
    const credential = credentialResource?.schema === "narada.invokable-intelligence.credential-locator.v1"
      ? credentialResource as CredentialLocator
      : null;
    candidates.push({
      model: model as Model,
      modelProvider: modelProvider as ModelProvider,
      offering: offering as ModelOffering,
      inferenceProvider: inferenceProvider as InferenceProvider,
      endpoint: endpoint as InferenceEndpoint,
      adapter: adapter as InferenceAdapter,
      credential,
      route,
    });
  }
  return candidates.sort((a, b) => a.offering.id.localeCompare(b.offering.id) || a.route.id.localeCompare(b.route.id));
}

function candidateRefs(candidate: Candidate): ResourceId[] {
  return [
    candidate.model.id,
    candidate.modelProvider.id,
    candidate.offering.id,
    candidate.inferenceProvider.id,
    candidate.endpoint.id,
    candidate.adapter.id,
    ...candidate.route.execution_loci.map(({ id }) => id),
    ...(candidate.credential ? [candidate.credential.id] : []),
  ];
}

const capabilityLabel = ({ family, name }: CapabilityKey) => `${family}/${name}`;

function routeCapabilityLookup(capabilities: ResolvedRouteCapability[], key: CapabilityKey): ResolvedRouteCapability | undefined {
  return capabilities.find(({ capability }) => capability.family === key.family && capability.name === key.name);
}

function accessFacts(route: InvocationRouteCandidate, offering: ModelOffering, records: CatalogAccessRecord[]): RouteAccessFacts {
  const account = records.filter(accessSchema("narada.invokable-intelligence.service-account.v1")).find(({ id }) => id === route.access.account_ref);
  const credentialBinding = records.filter(accessSchema("narada.invokable-intelligence.credential-binding.v1")).find(({ account_id }) => account_id === route.access.account_ref);
  return {
    ...(account?.schema === "narada.invokable-intelligence.service-account.v1" ? { account } : {}),
    ...(credentialBinding?.schema === "narada.invokable-intelligence.credential-binding.v1" ? { credential_binding: credentialBinding } : {}),
    grants: records.filter(accessSchema("narada.invokable-intelligence.access-grant.v1")),
    entitlements: records.filter(accessSchema("narada.invokable-intelligence.service-entitlement.v1")).filter(({ offering_id }) => offering_id === offering.id),
    quotas: records.filter(accessSchema("narada.invokable-intelligence.quota-observation.v1")).filter(({ offering_id }) => offering_id === offering.id),
    budgets: records.filter(accessSchema("narada.invokable-intelligence.budget-authorization.v1")).filter(({ account_id }) => account_id === route.access.account_ref),
    governance: records.filter(accessSchema("narada.invokable-intelligence.data-governance-requirement.v1")),
  };
}

export function evaluateCandidate(
  candidate: Candidate,
  intent: InvocationIntent,
  principal: InvocationPrincipal,
  routeAssertions: RouteCapabilityAssertion[],
  accessRecords: CatalogAccessRecord[],
  policies: EvaluatedPolicies,
  context: ResolverContext,
): CandidateEvaluation {
  const reasonCodes: EliminationReasonCode[] = [];
  const reasons: string[] = [];
  const appliedConstraints: ProvenanceEntry[] = [];
  const appliedPreferences: ProvenanceEntry[] = [];
  const appliedDefaultsRank: ProvenanceEntry[] = [];
  const refs = candidateRefs(candidate);
  const eliminate = (code: EliminationReasonCode, reason: string): void => {
    if (!reasonCodes.includes(code)) reasonCodes.push(code);
    reasons.push(reason);
  };

  const routeCapabilities = resolveRouteCapabilities(candidate.route, candidate.offering, routeAssertions).capabilities;
  const topology = evaluateExecutionTopologyFeasibility(
    candidate.route.topology,
    context.topology_observations.filter(({ topology_id }) => topology_id === candidate.route.topology.id),
  );
  if (topology.status !== "feasible") {
    eliminate("host-infeasible", `route topology '${candidate.route.topology.id}' is ${topology.status}: ${topology.failures.map(({ subject, requirement, reason_code }) => `${subject.kind}:${subject.id}/${requirement}/${reason_code}`).join(",")}`);
  }
  if (candidate.adapter.runtime_family !== context.runtime) {
    eliminate("host-infeasible", `adapter runtime '${candidate.adapter.runtime_family}' does not match '${context.runtime}'`);
  }

  const access = evaluateRouteAccess(candidate.route, candidate.offering, {
    principal,
    target_site_id: context.targetSite.id,
    purpose: intent.purpose,
    now: context.clock.instant,
    ...context.access,
  }, accessFacts(candidate.route, candidate.offering, accessRecords));
  if (!access.eligible) {
    eliminate("host-infeasible", `route access refused: ${access.findings.map(({ code }) => code).join(",")}`);
  }

  if (intent.requested_model && intent.requested_model.id !== candidate.model.id) {
    eliminate("intent-model-mismatch", `intent requested model '${intent.requested_model.id}'`);
  }
  for (const key of intent.required_capabilities ?? []) {
    const capability = routeCapabilityLookup(routeCapabilities, key);
    if (!capability?.supported) eliminate("missing-required-capability", `route does not support ${capabilityLabel(key)}`);
  }

  for (const policy of policies.hardConstraints) {
    for (const rule of policy.rules) {
      if (rule.type === "require-capability") {
        const capability = routeCapabilityLookup(routeCapabilities, rule.capability);
        if (capability?.supported) appliedConstraints.push({ source: policy.id, effect: `satisfied require-capability ${capabilityLabel(rule.capability)}` });
        else eliminate("hard-constraint", `${policy.id}: requires ${capabilityLabel(rule.capability)}`);
      } else if (rule.type === "forbid-capability") {
        if (routeCapabilityLookup(routeCapabilities, rule.capability)?.supported) eliminate("hard-constraint", `${policy.id}: forbids ${capabilityLabel(rule.capability)}`);
      } else if (rule.type === "forbid-resource" && refs.includes(rule.resource.id)) {
        eliminate("hard-constraint", `${policy.id}: forbids resource '${rule.resource.id}'`);
      }
    }
  }

  const allowRules: Array<Extract<PolicyRule, { type: "allow-resource" }>> = [];
  for (const policy of policies.eligibility) {
    for (const rule of policy.rules) {
      if (rule.type === "deny-resource" && refs.includes(rule.resource.id)) eliminate("host-infeasible", `${policy.id}: host denies '${rule.resource.id}'`);
      else if (rule.type === "allow-resource") allowRules.push(rule);
    }
  }
  if (allowRules.length && !allowRules.some(({ resource }) => refs.includes(resource.id))) {
    eliminate("host-infeasible", "host eligibility allowlist does not include this explicit route");
  }

  const requestedOptions = intent.requested_options ?? {};
  if (requestedOptions.thinking !== undefined) {
    const capability = routeCapabilityLookup(routeCapabilities, { family: "thinking", name: "levels" });
    if (!capability?.supported || !capability.allowed_values?.includes(String(requestedOptions.thinking))) {
      eliminate("unsupported-options", `thinking='${String(requestedOptions.thinking)}' is not supported by route '${candidate.route.id}'`);
    }
  }
  if (requestedOptions.batch === true) {
    const capability = routeCapabilityLookup(routeCapabilities, { family: "batch", name: "available" });
    if (!capability?.supported || capability.availability?.status === "unavailable") {
      eliminate("unsupported-options", `batch is not available on route '${candidate.route.id}'`);
    }
  }

  let score = 0;
  let defaultsScore = 0;
  if (reasonCodes.length === 0) {
    for (const policy of policies.preferences) {
      for (const rule of policy.rules) {
        if (rule.type === "prefer-resource" && refs.includes(rule.resource.id)) {
          score += rule.weight;
          appliedPreferences.push({ source: policy.id, effect: `+${rule.weight} prefer '${rule.resource.id}'` });
        } else if (rule.type === "prefer-capability" && routeCapabilityLookup(routeCapabilities, rule.capability)?.supported) {
          score += rule.weight;
          appliedPreferences.push({ source: policy.id, effect: `+${rule.weight} prefer capability ${capabilityLabel(rule.capability)}` });
        }
      }
    }
    for (const policy of policies.defaults) {
      for (const rule of policy.rules) {
        if (rule.type !== "default-option" || typeof rule.value !== "string") continue;
        if (refs.includes(rule.value) || rule.value === candidate.route.id) {
          defaultsScore += 0.1;
          appliedDefaultsRank.push({ source: policy.id, effect: `+0.1 default '${rule.option}' = '${rule.value}'` });
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
    appliedDefaultsRank,
    score,
    defaultsScore,
    routeCapabilities,
    topology,
    access,
  };
}
