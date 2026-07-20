/** First-class model offerings, executable route candidates, and scoped capability composition. */

import type { AssertionValidity, CapabilityKey, EvidenceRef, Provenance } from "./assertions.js";
import type { ContentDigest } from "./temporal.js";
import {
  validateExecutionTopology,
  type ExecutionTopology,
  type TopologyDiagnostic,
} from "./topology.js";
import type {
  InferenceEndpoint,
  Model,
  ModelOffering,
  Resource,
} from "./resources.js";
import type { ResourceRef } from "./ids.js";

export const INVOCATION_ROUTE_CANDIDATE_SCHEMA = "narada.invokable-intelligence.invocation-route-candidate.v1" as const;
export const ROUTE_CAPABILITY_ASSERTION_SCHEMA = "narada.invokable-intelligence.route-capability-assertion.v1" as const;

export interface InvocationRouteCandidate {
  schema: typeof INVOCATION_ROUTE_CANDIDATE_SCHEMA;
  id: string;
  offering: ResourceRef;
  endpoint: ResourceRef;
  adapter: ResourceRef;
  topology: ExecutionTopology;
  execution_loci: ResourceRef[];
  access: {
    account_ref: string;
    grant_refs: string[];
    credential?: ResourceRef;
  };
  composition_digest: ContentDigest;
}

export type RouteCapabilitySubject =
  | { scope: "model"; model: ResourceRef }
  | { scope: "offering"; offering: ResourceRef }
  | { scope: "route-component"; route_id: string; component: ResourceRef }
  | { scope: "route-composition"; route_id: string; composition_digest: ContentDigest };

export type RouteCapabilityClaim =
  | { kind: "support"; status: "supported" | "unsupported" }
  | { kind: "allowed-values"; values: string[] }
  | { kind: "maximum"; value: number; unit: string }
  | { kind: "pricing"; amount: number; currency: string; unit: string }
  | { kind: "availability"; status: "available" | "unavailable" | "scheduled"; schedule_ref?: string };

export interface RouteCapabilityAssertion {
  schema: typeof ROUTE_CAPABILITY_ASSERTION_SCHEMA;
  id: string;
  subject: RouteCapabilitySubject;
  capability: CapabilityKey;
  claim: RouteCapabilityClaim;
  provenance: Provenance;
  validity: AssertionValidity;
  confidence: number;
  evidence: EvidenceRef[];
}

export interface ResolvedRouteCapability {
  capability: CapabilityKey;
  supported: boolean;
  allowed_values?: string[];
  maximum?: { value: number; unit: string };
  pricing?: { amount: number; currency: string; unit: string };
  availability?: Extract<RouteCapabilityClaim, { kind: "availability" }>;
  assertion_ids: string[];
  reasons: string[];
}

export type OfferingDiagnosticCode =
  | "invalid-offering"
  | "offering-model-provider-mismatch"
  | "offering-inference-provider-mismatch"
  | "offering-endpoint-does-not-serve-model"
  | "invalid-route"
  | "route-offering-mismatch"
  | "route-adapter-mismatch"
  | "route-endpoint-mismatch"
  | "route-credential-mismatch"
  | "route-execution-locus-mismatch"
  | "capability-subject-mismatch"
  | "capability-unit-conflict"
  | "invalid-route-capability-assertion";

export interface OfferingDiagnostic {
  code: OfferingDiagnosticCode;
  subject_id?: string;
  message: string;
}

export function validateModelOfferingGraph(offering: ModelOffering, resources: readonly Resource[]): OfferingDiagnostic[] {
  const diagnostics: OfferingDiagnostic[] = [];
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  const model = byId.get(offering.model.id) as Model | undefined;
  const endpoint = byId.get(offering.endpoint.id) as InferenceEndpoint | undefined;
  if (offering.schema !== "narada.invokable-intelligence.model-offering.v1" || offering.model.kind !== "model" || offering.model_provider.kind !== "model-provider" || offering.inference_provider.kind !== "inference-provider" || offering.endpoint.kind !== "inference-endpoint" || !offering.service_class || !offering.invocation_model_key) {
    diagnostics.push({ code: "invalid-offering", subject_id: offering.id, message: "Offering requires typed model, model-provider, inference-provider, endpoint, service-class, and service-specific model key fields." });
    return diagnostics;
  }
  if (!model || model.schema !== "narada.invokable-intelligence.model.v1" || model.provider.id !== offering.model_provider.id) {
    diagnostics.push({ code: "offering-model-provider-mismatch", subject_id: offering.id, message: "Offering model-provider must match the model's publisher." });
  }
  if (!endpoint || endpoint.schema !== "narada.invokable-intelligence.inference-endpoint.v1" || endpoint.inference_provider.id !== offering.inference_provider.id) {
    diagnostics.push({ code: "offering-inference-provider-mismatch", subject_id: offering.id, message: "Offering inference-provider must match the endpoint's service owner." });
  }
  if (!endpoint || endpoint.schema !== "narada.invokable-intelligence.inference-endpoint.v1" || !endpoint.serves.some(({ id }) => id === offering.model.id)) {
    diagnostics.push({ code: "offering-endpoint-does-not-serve-model", subject_id: offering.id, message: "Offering endpoint must explicitly serve its model." });
  }
  return diagnostics;
}

export function validateInvocationRouteCandidate(
  route: InvocationRouteCandidate,
  offering: ModelOffering,
  resources: readonly Resource[],
): Array<OfferingDiagnostic | TopologyDiagnostic> {
  const diagnostics: Array<OfferingDiagnostic | TopologyDiagnostic> = [...validateExecutionTopology(route.topology)];
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  const endpoint = byId.get(route.endpoint.id);
  if (route.schema !== INVOCATION_ROUTE_CANDIDATE_SCHEMA || route.offering.kind !== "model-offering" || route.endpoint.kind !== "inference-endpoint" || route.adapter.kind !== "adapter" || route.execution_loci.some(({ kind }) => kind !== "execution-locus") || !route.access.account_ref || !route.access.grant_refs.length) {
    diagnostics.push({ code: "invalid-route", subject_id: route.id, message: "Route requires offering, endpoint, adapter, topology, execution loci, account, and grant bindings." });
  }
  if (route.offering.id !== offering.id) diagnostics.push({ code: "route-offering-mismatch", subject_id: route.id, message: "Route does not select the supplied offering." });
  if (route.endpoint.id !== offering.endpoint.id) diagnostics.push({ code: "route-endpoint-mismatch", subject_id: route.id, message: "Route endpoint differs from its offering endpoint." });
  if (endpoint?.schema !== "narada.invokable-intelligence.inference-endpoint.v1" || endpoint.adapter.id !== route.adapter.id) {
    diagnostics.push({ code: "route-adapter-mismatch", subject_id: route.id, message: "Route adapter must be the driver declared by its endpoint." });
  }
  if (
    endpoint?.schema === "narada.invokable-intelligence.inference-endpoint.v1"
    && endpoint.credential?.id !== route.access.credential?.id
  ) {
    diagnostics.push({ code: "route-credential-mismatch", subject_id: route.id, message: "Route credential must exactly match the credential declared by its endpoint." });
  }
  const topologyExecutionLoci = new Set(route.topology.nodes.flatMap(({ locus }) => locus.execution_locus ? [locus.execution_locus.id] : []));
  if (route.execution_loci.some(({ id }) => !topologyExecutionLoci.has(id))) {
    diagnostics.push({ code: "route-execution-locus-mismatch", subject_id: route.id, message: "Route execution loci must occur in its selected topology." });
  }
  const topologyAdapter = route.topology.nodes.find(({ kind }) => kind === "adapter")?.resource?.id;
  const topologyEndpoint = route.topology.nodes.find(({ kind }) => kind === "endpoint")?.resource?.id;
  if (topologyAdapter !== route.adapter.id) diagnostics.push({ code: "route-adapter-mismatch", subject_id: route.id, message: "Topology adapter differs from the route adapter." });
  if (topologyEndpoint !== route.endpoint.id) diagnostics.push({ code: "route-endpoint-mismatch", subject_id: route.id, message: "Topology endpoint differs from the route endpoint." });
  return diagnostics;
}

const subjectSpecificity: Record<RouteCapabilitySubject["scope"], number> = {
  model: 0,
  offering: 1,
  "route-component": 2,
  "route-composition": 3,
};

function routeComponents(route: InvocationRouteCandidate): Set<string> {
  return new Set([
    route.offering.id,
    route.endpoint.id,
    route.adapter.id,
    ...route.execution_loci.map(({ id }) => id),
    ...(route.access.credential ? [route.access.credential.id] : []),
  ]);
}

export function routeCapabilityApplies(
  assertion: RouteCapabilityAssertion,
  route: InvocationRouteCandidate,
  offering: ModelOffering,
): boolean {
  const subject = assertion.subject;
  if (subject.scope === "model") return subject.model.id === offering.model.id;
  if (subject.scope === "offering") return subject.offering.id === offering.id;
  if (subject.scope === "route-component") return subject.route_id === route.id && routeComponents(route).has(subject.component.id);
  return subject.route_id === route.id && subject.composition_digest === route.composition_digest;
}

const capabilityLabel = ({ family, name }: CapabilityKey) => `${family}/${name}`;

/**
 * Hard support intersects from model -> offering -> component -> composition.
 * Enumerated values intersect and maxima take the strictest bound. Pricing
 * and availability are descriptive and use the narrowest applicable scope.
 */
export function resolveRouteCapabilities(
  route: InvocationRouteCandidate,
  offering: ModelOffering,
  assertions: readonly RouteCapabilityAssertion[],
): { capabilities: ResolvedRouteCapability[]; diagnostics: OfferingDiagnostic[] } {
  const applicable = assertions.filter((assertion) => routeCapabilityApplies(assertion, route, offering));
  const groups = new Map<string, RouteCapabilityAssertion[]>();
  for (const assertion of applicable) {
    const key = capabilityLabel(assertion.capability);
    groups.set(key, [...(groups.get(key) ?? []), assertion]);
  }
  const diagnostics: OfferingDiagnostic[] = [];
  const capabilities: ResolvedRouteCapability[] = [];
  for (const [label, claims] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    claims.sort((a, b) => subjectSpecificity[a.subject.scope] - subjectSpecificity[b.subject.scope] || a.id.localeCompare(b.id));
    const [family, name] = label.split("/");
    const support = claims.filter(({ claim }) => claim.kind === "support");
    let supported = !support.some(({ claim }) => claim.kind === "support" && claim.status === "unsupported");
    const allowedClaims = claims.filter((item): item is RouteCapabilityAssertion & { claim: Extract<RouteCapabilityClaim, { kind: "allowed-values" }> } => item.claim.kind === "allowed-values");
    let allowedValues = allowedClaims.length ? [...allowedClaims[0].claim.values] : undefined;
    for (const assertion of allowedClaims.slice(1)) allowedValues = allowedValues?.filter((value) => assertion.claim.values.includes(value));
    if (allowedValues?.length === 0) supported = false;
    const maximumClaims = claims.filter((item): item is RouteCapabilityAssertion & { claim: Extract<RouteCapabilityClaim, { kind: "maximum" }> } => item.claim.kind === "maximum");
    let maximum: ResolvedRouteCapability["maximum"];
    if (maximumClaims.length) {
      const units = new Set(maximumClaims.map(({ claim }) => claim.unit));
      if (units.size > 1) {
        supported = false;
        diagnostics.push({ code: "capability-unit-conflict", subject_id: route.id, message: `${label} maximum assertions use incompatible units.` });
      } else {
        const strictest = [...maximumClaims].sort((a, b) => a.claim.value - b.claim.value || a.id.localeCompare(b.id))[0];
        maximum = { value: strictest.claim.value, unit: strictest.claim.unit };
      }
    }
    const narrowest = <T extends RouteCapabilityClaim["kind"]>(kind: T) =>
      claims.filter((item) => item.claim.kind === kind).sort((a, b) => subjectSpecificity[b.subject.scope] - subjectSpecificity[a.subject.scope] || a.id.localeCompare(b.id))[0];
    const pricingClaim = narrowest("pricing")?.claim;
    const availabilityClaim = narrowest("availability")?.claim;
    if (availabilityClaim?.kind === "availability" && availabilityClaim.status === "unavailable") supported = false;
    capabilities.push({
      capability: { family, name },
      supported,
      ...(allowedValues ? { allowed_values: [...allowedValues].sort() } : {}),
      ...(maximum ? { maximum } : {}),
      ...(pricingClaim?.kind === "pricing" ? { pricing: { amount: pricingClaim.amount, currency: pricingClaim.currency, unit: pricingClaim.unit } } : {}),
      ...(availabilityClaim?.kind === "availability" ? { availability: availabilityClaim } : {}),
      assertion_ids: claims.map(({ id }) => id),
      reasons: [
        support.some(({ claim }) => claim.kind === "support" && claim.status === "unsupported") ? "unsupported-at-applicable-scope" : "support-intersection-satisfied",
        ...(allowedValues?.length === 0 ? ["allowed-value-intersection-empty"] : []),
      ],
    });
  }
  return { capabilities, diagnostics };
}

/** Structural admission check for one scoped route-capability assertion. */
export function validateRouteCapabilityAssertion(assertion: RouteCapabilityAssertion): OfferingDiagnostic[] {
  const subject = assertion.subject;
  const validSubject = subject.scope === "model"
    ? subject.model.kind === "model"
    : subject.scope === "offering"
      ? subject.offering.kind === "model-offering"
      : subject.scope === "route-component"
        ? Boolean(subject.route_id && subject.component.id)
        : Boolean(subject.route_id && subject.composition_digest);
  const validClaim = assertion.claim.kind === "support"
    || (assertion.claim.kind === "allowed-values" && assertion.claim.values.length > 0)
    || (assertion.claim.kind === "maximum" && Number.isFinite(assertion.claim.value) && assertion.claim.value >= 0 && Boolean(assertion.claim.unit))
    || (assertion.claim.kind === "pricing" && Number.isFinite(assertion.claim.amount) && assertion.claim.amount >= 0 && Boolean(assertion.claim.currency) && Boolean(assertion.claim.unit))
    || (assertion.claim.kind === "availability" && (assertion.claim.status !== "scheduled" || Boolean(assertion.claim.schedule_ref)));
  return assertion.schema === ROUTE_CAPABILITY_ASSERTION_SCHEMA
    && Boolean(assertion.id && assertion.capability.family && assertion.capability.name)
    && validSubject
    && validClaim
    && Number.isFinite(assertion.confidence)
    && assertion.confidence >= 0
    && assertion.confidence <= 1
    && Boolean(assertion.provenance.source && assertion.provenance.recorded_at)
    ? []
    : [{ code: "invalid-route-capability-assertion", subject_id: assertion.id, message: "Route capability assertion requires a typed scope, claim, capability, provenance, and bounded confidence." }];
}

export interface SelectedOfferingRoute {
  offering: ResourceRef;
  route_id: string;
  composition_digest: ContentDigest;
  topology_id: string;
  endpoint: ResourceRef;
  adapter: ResourceRef;
  execution_loci: ResourceRef[];
  account_ref: string;
  grant_refs: string[];
  credential?: ResourceRef;
}

export type OfferingRouteRefusalCode =
  | "no-compatible-offering"
  | "offering-capability-mismatch"
  | "route-composition-unsupported"
  | "route-topology-infeasible";
