/** Complete canonical fixtures used to prove resolver/runtime behavior without legacy projections. */

import type { AccessAuthorityRef } from "./access.js";
import type {
  CatalogAccessRecord,
  CanonicalCatalogAuthority,
  CanonicalCatalogDocument,
  CanonicalCatalogRecord,
  CanonicalCatalogRecordKind,
  CanonicalCatalogSeed,
  CatalogTemporalInput,
} from "./catalog.js";
import { canonicalSha256 } from "./canonical.js";
import type { IntelligenceAuthorityStatement } from "./authority.js";
import type { InvocationRouteCandidate, RouteCapabilityAssertion } from "./offerings.js";
import type { PolicyDocument } from "./policies.js";
import type { InferenceProtocol, Resource } from "./resources.js";
import { CLOUDFLARE_EXECUTION_TOPOLOGY, LOCAL_EXECUTION_TOPOLOGY } from "./topology.js";
import type { AuthoritativeDecisionClock } from "./temporal.js";
import type { TopologyFeasibilityObservation } from "./topology.js";

export const CANONICAL_LOCAL_TEST_IDS = {
  targetSite: "site:narada",
  userSite: "site:user",
  hostSite: "site:pc",
  principal: "principal:andrey",
  model: "model:kimi-k2-thinking",
  offering: "model-offering:kimi-via-local-api",
  route: "route:kimi-local-api",
  adapter: "adapter:openai-compatible-http",
  endpoint: "inference-endpoint:remote-default",
  account: "account:local-api",
  grant: "grant:andrey-local-api",
} as const;

const NOW = "2026-07-19T12:00:00.000Z";
const VALID_FROM = "2026-07-19T00:00:00.000Z";
const VALID_UNTIL = "2026-07-20T00:00:00.000Z";
const digest = (index: number) => `sha256:${index.toString(16).padStart(2, "0").repeat(32)}`;
const accessAuthority = (
  owner_kind: AccessAuthorityRef["owner_kind"],
  owner_id: string,
): AccessAuthorityRef => ({ owner_kind, owner_id, authority_ref: `authority:${owner_kind}:${owner_id}` });

export function canonicalTestClock(instant = NOW): AuthoritativeDecisionClock {
  const date = new Date(instant);
  return {
    source: "test-clock",
    authority_ref: "clock-authority:test",
    instant,
    timezone: "UTC",
    local: {
      date: instant.slice(0, 10),
      time: instant.slice(11, 19),
      weekday: date.getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    },
  };
}

function topologyWithBoundaryValidity(topology: typeof LOCAL_EXECUTION_TOPOLOGY, now: string, validUntil: string) {
  const copy = structuredClone(topology);
  for (const edge of copy.edges) {
    if (!edge.boundary.admission) continue;
    edge.boundary.admission.validity = {
      ...edge.boundary.admission.validity,
      valid_from: now,
      valid_until: validUntil,
      fresh_as_of: now,
    };
  }
  return copy;
}

export interface CanonicalCloudflareTestSeedOptions {
  invocationModelKey?: string;
  now?: string;
  principalId?: string;
  targetSiteId?: string;
  validUntil?: string;
}

/**
 * Complete Workers-AI fixture for D1 conformance and carrier E2E tests.
 * Production runtimes must receive an admitted seed through management;
 * they never call this fixture or infer catalog authority from bindings.
 */
export function buildCanonicalCloudflareTestSeed(
  options: CanonicalCloudflareTestSeedOptions = {},
): CanonicalCatalogSeed {
  const now = options.now ?? NOW;
  const validUntil = options.validUntil ?? VALID_UNTIL;
  const replacements = new Map<string, string>([
    [CANONICAL_LOCAL_TEST_IDS.targetSite, options.targetSiteId ?? CANONICAL_LOCAL_TEST_IDS.targetSite],
    [CANONICAL_LOCAL_TEST_IDS.principal, options.principalId ?? CANONICAL_LOCAL_TEST_IDS.principal],
    ["site:pc", "site:cloudflare-account"],
    ["inference-provider:remote-api", "inference-provider:cloudflare-workers-ai"],
    ["adapter:openai-compatible-http", "adapter:workers-ai-binding"],
    ["credential-locator:local-api", "credential-locator:cloudflare-worker-binding"],
    ["inference-endpoint:remote-default", "inference-endpoint:cf-workers-ai-default"],
    ["model-offering:kimi-via-local-api", "model-offering:kimi-via-workers-ai"],
    ["route:kimi-local-api", "route:kimi-workers-ai"],
    ["execution-locus:operator-pc", "execution-locus:cloudflare-carrier"],
    ["account:local-api", "account:cloudflare-workers-ai"],
    ["grant:andrey-local-api", "grant:andrey-cloudflare-workers-ai"],
    ["credential-binding:local-api", "credential-binding:cloudflare-workers-ai"],
    ["entitlement:local-api", "entitlement:cloudflare-workers-ai"],
    ["quota:local-api", "quota:cloudflare-workers-ai"],
    ["budget:narada-local-api", "budget:narada-cloudflare-workers-ai"],
    ["governance:narada-local-api", "governance:narada-cloudflare-workers-ai"],
    ["authority-statement:andrey-local-consent", "authority-statement:andrey-cloudflare-consent"],
    ["tenant:local-api", "tenant:cloudflare-workers-ai"],
    ["credential-handle:local-api", "binding:AI"],
    ["local-api", "workers-ai"],
    [LOCAL_EXECUTION_TOPOLOGY.id, CLOUDFLARE_EXECUTION_TOPOLOGY.id],
  ]);
  const replace = (value: unknown): unknown => {
    if (typeof value === "string") return replacements.get(value) ?? value;
    if (Array.isArray(value)) return value.map(replace);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, replace(item)]),
    );
  };
  const seed = replace(buildCanonicalLocalTestSeed({
    adapterProtocol: { family: "cloudflare-workers-ai", operation: "run", version: "1" },
    credentialStore: "none",
    credentialReference: "binding:AI",
    invocationModelKey: options.invocationModelKey ?? "@cf/moonshotai/kimi-k2-instruct",
    ...(options.now ? { now: options.now } : {}),
    ...(options.validUntil ? { validUntil: options.validUntil } : {}),
  })) as CanonicalCatalogSeed;
  seed.id = "catalog-seed:canonical-cloudflare";

  for (const record of seed.records) {
    const document = record.document;
    record.record_id = document.id;
    record.source = {
      ...record.source,
      schema: "narada.test.canonical-cloudflare-intelligence.v1",
      reference: "canonical-cloudflare-fixture",
    };
    if (document.schema === "narada.invokable-intelligence.adapter.v1") {
      document.runtime_family = "workers";
      document.protocol = { family: "cloudflare-workers-ai", operation: "run", version: "1" };
    }
    if (document.schema === "narada.invokable-intelligence.credential-locator.v1") {
      document.store = "none";
      document.reference = "binding:AI";
    }
    if (document.schema === "narada.invokable-intelligence.inference-endpoint.v1") {
      document.address = { kind: "workers-binding", binding: "AI" };
    }
    if (document.schema === "narada.invokable-intelligence.execution-locus.v1") {
      document.kind = "cloudflare";
    }
    if (document.schema === "narada.invokable-intelligence.invocation-route-candidate.v1") {
      document.topology = topologyWithBoundaryValidity(CLOUDFLARE_EXECUTION_TOPOLOGY, now, validUntil);
      document.execution_loci = [{ kind: "execution-locus", id: "execution-locus:cloudflare-carrier" }];
    }
    record.source.digest = canonicalSha256(document);
  }
  return seed;
}

export function feasibleTopologyObservations(
  topology = LOCAL_EXECUTION_TOPOLOGY,
  observedAt = NOW,
  validUntil = VALID_UNTIL,
): TopologyFeasibilityObservation[] {
  const observations: TopologyFeasibilityObservation[] = [];
  for (const node of topology.nodes) {
    for (const requirement of node.required_feasibility) {
      observations.push({
        schema: "narada.invokable-intelligence.topology-feasibility.v1",
        id: `topology-observation:${topology.id}:${node.id}:${requirement}`,
        topology_id: topology.id,
        subject: { kind: "node", id: node.id },
        requirement,
        status: "feasible",
        owner: node.feasibility_authority,
        validity: { valid_from: VALID_FROM, valid_until: validUntil, fresh_as_of: observedAt },
        observed_at: observedAt,
        evidence: [{ kind: "test", ref: "canonical-local-fixture", evidence_class: "durable" }],
      });
    }
  }
  for (const edge of topology.edges) {
    for (const requirement of edge.required_feasibility) {
      observations.push({
        schema: "narada.invokable-intelligence.topology-feasibility.v1",
        id: `topology-observation:${topology.id}:${edge.id}:${requirement}`,
        topology_id: topology.id,
        subject: { kind: "edge", id: edge.id },
        requirement,
        status: "feasible",
        owner: edge.feasibility_authority,
        validity: { valid_from: VALID_FROM, valid_until: validUntil, fresh_as_of: observedAt },
        observed_at: observedAt,
        evidence: [{ kind: "test", ref: "canonical-local-fixture", evidence_class: "durable" }],
      });
    }
  }
  return observations;
}

function recordKind(document: CanonicalCatalogDocument): CanonicalCatalogRecordKind {
  if (document.schema === "narada.invokable-intelligence.route-capability-assertion.v1"
    || document.schema === "narada.invokable-intelligence.capability-assertion.v1") return "assertion";
  if (document.schema === "narada.invokable-intelligence.policy.v1") return "policy";
  if (document.schema === "narada.invokable-intelligence.invocation-route-candidate.v1") return "route";
  if (document.schema === "narada.invokable-intelligence.authority-statement.v1") return "authority-statement";
  if (document.schema === "narada.invokable-intelligence.catalog-temporal-input.v1") return "temporal-input";
  if ([
    "narada.invokable-intelligence.service-account.v1",
    "narada.invokable-intelligence.principal.v1",
    "narada.invokable-intelligence.credential-binding.v1",
    "narada.invokable-intelligence.access-grant.v1",
    "narada.invokable-intelligence.service-entitlement.v1",
    "narada.invokable-intelligence.quota-observation.v1",
    "narada.invokable-intelligence.budget-authorization.v1",
    "narada.invokable-intelligence.data-governance-requirement.v1",
  ].includes(document.schema)) return "access";
  return "resource";
}

function catalogAuthority(document: CanonicalCatalogDocument): CanonicalCatalogAuthority {
  if (document.schema === "narada.invokable-intelligence.authority-statement.v1") {
    const statement = document as IntelligenceAuthorityStatement;
    return {
      kind: statement.kind,
      locus: statement.origin.locus,
      authority_ref: statement.origin.authority_ref,
      ...(statement.origin.site_id ? { site_id: statement.origin.site_id } : {}),
      ...(statement.origin.principal_id ? { principal_id: statement.origin.principal_id } : {}),
    };
  }
  if (document.schema === "narada.invokable-intelligence.route-capability-assertion.v1") {
    return { kind: "declared-capability", locus: "resource-owner", authority_ref: "authority:model-owner:kimi" };
  }
  if (document.schema === "narada.invokable-intelligence.catalog-temporal-input.v1") {
    return { kind: "temporal-input", locus: "runtime-observer", authority_ref: document.clock.authority_ref };
  }
  return {
    kind: recordKind(document) === "access" ? "account-definition" : "catalog-definition",
    locus: "target-site",
    site_id: CANONICAL_LOCAL_TEST_IDS.targetSite,
    authority_ref: "authority:site:narada:canonical-fixture",
  };
}

function records(documents: CanonicalCatalogDocument[]): CanonicalCatalogRecord[] {
  return documents.map((document, index) => ({
    schema: "narada.invokable-intelligence.canonical-catalog-record.v1",
    id: `catalog-record:canonical-local:${String(index + 1).padStart(3, "0")}`,
    record_kind: recordKind(document),
    record_id: document.id,
    revision: 1,
    source: {
      schema: "narada.test.canonical-intelligence.v1",
      reference: "canonical-local-fixture",
      revision: "1",
      digest: canonicalSha256(document),
    },
    authority: catalogAuthority(document),
    validation: {
      status: "accepted",
      validator: "canonical-fixture-validator/1",
      validated_at: NOW,
      evidence: [{ kind: "test", ref: "canonical-local-fixture" }],
    },
    document,
  }));
}

export interface CanonicalLocalTestSeedOptions {
  endpointBaseUrl?: string;
  endpointUrl?: string;
  adapterProtocol?: InferenceProtocol;
  credentialStore?: "env" | "site-secret" | "none";
  credentialReference?: string;
  invocationModelKey?: string;
  now?: string;
  validUntil?: string;
}

export function buildCanonicalLocalTestSeed(options: CanonicalLocalTestSeedOptions = {}): CanonicalCatalogSeed {
  const now = options.now ?? NOW;
  const validUntil = options.validUntil ?? VALID_UNTIL;
  const ids = CANONICAL_LOCAL_TEST_IDS;
  const modelRef = { kind: "model" as const, id: ids.model };
  const offeringRef = { kind: "model-offering" as const, id: ids.offering };
  const inferenceProviderRef = { kind: "inference-provider" as const, id: "inference-provider:remote-api" };
  const endpointRef = { kind: "inference-endpoint" as const, id: ids.endpoint };
  const adapterRef = { kind: "adapter" as const, id: ids.adapter };
  const credentialRef = { kind: "credential-locator" as const, id: "credential-locator:local-api" };
  const topology = topologyWithBoundaryValidity(LOCAL_EXECUTION_TOPOLOGY, now, validUntil);
  const resources: Resource[] = [
    { schema: "narada.invokable-intelligence.site.v1", id: ids.targetSite },
    { schema: "narada.invokable-intelligence.site.v1", id: ids.userSite },
    { schema: "narada.invokable-intelligence.site.v1", id: ids.hostSite },
    { schema: "narada.invokable-intelligence.model-provider.v1", id: "model-provider:kimi" },
    { schema: "narada.invokable-intelligence.model.v1", id: ids.model, display_name: "Kimi K2 Thinking", provider: { kind: "model-provider", id: "model-provider:kimi" } },
    { schema: "narada.invokable-intelligence.inference-provider.v1", id: inferenceProviderRef.id },
    { schema: "narada.invokable-intelligence.adapter.v1", id: ids.adapter, runtime_family: "node", protocol: options.adapterProtocol ?? { family: "narada", operation: "invoke", version: "1" } },
    {
      schema: "narada.invokable-intelligence.credential-locator.v1",
      id: credentialRef.id,
      store: options.credentialStore ?? "site-secret",
      reference: options.credentialReference ?? "credential-handle:local-api",
      holder: { kind: "site", id: ids.hostSite },
    },
    {
      schema: "narada.invokable-intelligence.inference-endpoint.v1",
      id: ids.endpoint,
      inference_provider: inferenceProviderRef,
      adapter: adapterRef,
      address: {
        kind: "url",
        url: options.endpointUrl ?? (options.endpointBaseUrl
          ? `${options.endpointBaseUrl.replace(/\/$/, "")}/invoke`
          : "https://local-api.invalid/v1/invoke"),
      },
      serves: [modelRef],
      credential: credentialRef,
    },
    {
      schema: "narada.invokable-intelligence.model-offering.v1",
      id: ids.offering,
      model: modelRef,
      model_provider: { kind: "model-provider", id: "model-provider:kimi" },
      inference_provider: inferenceProviderRef,
      endpoint: endpointRef,
      invocation_model_key: options.invocationModelKey ?? "kimi-k2-thinking",
      service_class: "local-api",
      region: "global",
    },
    { schema: "narada.invokable-intelligence.execution-locus.v1", id: "execution-locus:operator-pc", kind: "local" },
  ];
  const route: InvocationRouteCandidate = {
    schema: "narada.invokable-intelligence.invocation-route-candidate.v1",
    id: ids.route,
    offering: offeringRef,
    endpoint: endpointRef,
    adapter: adapterRef,
    topology,
    execution_loci: [{ kind: "execution-locus", id: "execution-locus:operator-pc" }],
    access: { account_ref: ids.account, grant_refs: [ids.grant], credential: credentialRef },
    composition_digest: digest(240),
  };
  const assertions: RouteCapabilityAssertion[] = [
    {
      schema: "narada.invokable-intelligence.route-capability-assertion.v1",
      id: "assert:canonical-local-thinking-levels",
      subject: { scope: "route-composition", route_id: route.id, composition_digest: route.composition_digest },
      capability: { family: "thinking", name: "levels" },
      claim: { kind: "allowed-values", values: ["low", "medium", "high"] },
      provenance: { source: "documented", recorded_at: now, actor: "model-owner:kimi" },
      validity: { valid_from: VALID_FROM, valid_until: validUntil, fresh_as_of: now },
      confidence: 1,
      evidence: [{ kind: "test", ref: "canonical-local-fixture" }],
    },
    {
      schema: "narada.invokable-intelligence.route-capability-assertion.v1",
      id: "assert:canonical-local-batch",
      subject: { scope: "route-composition", route_id: route.id, composition_digest: route.composition_digest },
      capability: { family: "batch", name: "available" },
      claim: { kind: "support", status: "supported" },
      provenance: { source: "documented", recorded_at: now, actor: "model-owner:kimi" },
      validity: { valid_from: VALID_FROM, valid_until: validUntil, fresh_as_of: now },
      confidence: 1,
      evidence: [{ kind: "test", ref: "canonical-local-fixture" }],
    },
  ];
  const policies: PolicyDocument[] = [
    {
      schema: "narada.invokable-intelligence.policy.v1",
      id: "policy:narada-hard",
      locus: "target-site",
      site: { kind: "site", id: ids.targetSite },
      kind: "hard-constraints",
      rules: [{ type: "require-capability", capability: { family: "thinking", name: "levels" } }],
      revision: 1,
    },
    {
      schema: "narada.invokable-intelligence.policy.v1",
      id: "policy:andrey-preferences",
      locus: "user-site",
      site: { kind: "site", id: ids.userSite },
      kind: "preferences",
      rules: [{ type: "prefer-resource", resource: offeringRef, weight: 10 }],
      revision: 1,
    },
    {
      schema: "narada.invokable-intelligence.policy.v1",
      id: "policy:narada-defaults",
      locus: "target-site",
      site: { kind: "site", id: ids.targetSite },
      kind: "defaults",
      rules: [{ type: "default-option", option: "thinking", value: "low" }],
      revision: 1,
    },
    {
      schema: "narada.invokable-intelligence.policy.v1",
      id: "policy:pc-eligibility",
      locus: "host-site",
      site: { kind: "site", id: ids.hostSite },
      kind: "eligibility",
      rules: [{ type: "allow-resource", resource: adapterRef }],
      revision: 1,
    },
  ];
  const access: CatalogAccessRecord[] = [
    {
      schema: "narada.invokable-intelligence.principal.v1",
      id: ids.principal,
      kind: "human",
      authority: accessAuthority("principal", ids.principal),
      admission_bindings: [{
        id: "binding:andrey:site-roster",
        kind: "site-membership",
        registry: "site-roster",
        site_id: ids.targetSite,
        roles: ["resident"],
        auth_types: ["user-site-session"],
      }],
    },
    { schema: "narada.invokable-intelligence.service-account.v1", id: ids.account, tenant_id: "tenant:local-api", inference_provider: inferenceProviderRef, owner: accessAuthority("account-owner", ids.userSite), region: "global", status: "active" },
    { schema: "narada.invokable-intelligence.credential-binding.v1", id: "credential-binding:local-api", account_id: ids.account, credential_locator: credentialRef, transport: { kind: "credential-handle", ref: "credential-handle:local-api", holder_site_id: ids.hostSite }, presence: "present", usability: "usable", observed_at: now, valid_until: validUntil, owner: accessAuthority("execution-site", ids.hostSite), evidence: [{ kind: "test", ref: "canonical-local-fixture" }] },
    { schema: "narada.invokable-intelligence.access-grant.v1", id: ids.grant, principal_id: ids.principal, account_id: ids.account, actions: ["invoke", "batch"], scope: { offering_ids: [ids.offering], route_ids: [ids.route], purposes: ["operator-chat", "carrier-turn"], target_site_ids: [ids.targetSite], topology_ids: [LOCAL_EXECUTION_TOPOLOGY.id] }, validity: { valid_from: VALID_FROM, valid_until: validUntil }, status: "active", granted_by: accessAuthority("account-owner", ids.userSite), principal_consent_ref: "authority-statement:andrey-local-consent", evidence: [{ kind: "test", ref: "canonical-local-fixture" }] },
    { schema: "narada.invokable-intelligence.service-entitlement.v1", id: "entitlement:local-api", account_id: ids.account, offering_id: ids.offering, service_class: "local-api", features: ["invoke", "batch"], validity: { valid_from: VALID_FROM, valid_until: validUntil }, status: "active", owner: accessAuthority("service-provider", "inference-provider:remote-api"), evidence: [{ kind: "test", ref: "canonical-local-fixture" }] },
    { schema: "narada.invokable-intelligence.quota-observation.v1", id: "quota:local-api", account_id: ids.account, offering_id: ids.offering, unit: "requests", limit: 1000, consumed: 1, reserved: 0, period_start: VALID_FROM, period_end: validUntil, observed_at: now, fresh_until: validUntil, owner: accessAuthority("service-provider", "inference-provider:remote-api"), evidence: [{ kind: "test", ref: "canonical-local-fixture" }] },
    { schema: "narada.invokable-intelligence.budget-authorization.v1", id: "budget:narada-local-api", principal_id: ids.principal, account_id: ids.account, target_site_id: ids.targetSite, currency: "USD", limit: 100, committed: 1, reserved: 0, validity: { valid_from: VALID_FROM, valid_until: validUntil }, status: "authorized", owner: accessAuthority("target-site", ids.targetSite), evidence: [{ kind: "test", ref: "canonical-local-fixture" }] },
    { schema: "narada.invokable-intelligence.data-governance-requirement.v1", id: "governance:narada-local-api", target_site_id: ids.targetSite, purposes: ["operator-chat", "carrier-turn"], data_classifications: ["internal"], allowed_regions: ["global"], maximum_retention_days: 30, provider_training: "prohibited", validity: { valid_from: VALID_FROM, valid_until: validUntil }, status: "active", owner: accessAuthority("target-site", ids.targetSite), evidence: [{ kind: "test", ref: "canonical-local-fixture" }] },
  ];
  const statements: IntelligenceAuthorityStatement[] = [
    { schema: "narada.invokable-intelligence.authority-statement.v1", id: "authority-statement:narada-hard", kind: "target-governance-constraint", origin: { locus: "target-site", site_id: ids.targetSite, authority_ref: "authority:site:narada" }, effect: "eligibility-constraint", revision: 1, issued_at: now, payload_ref: "policy:narada-hard" },
    { schema: "narada.invokable-intelligence.authority-statement.v1", id: "authority-statement:andrey-preferences", kind: "user-preference", origin: { locus: "user-site", site_id: ids.userSite, authority_ref: "authority:site:user" }, effect: "ranking", revision: 1, issued_at: now, payload_ref: "policy:andrey-preferences" },
    { schema: "narada.invokable-intelligence.authority-statement.v1", id: "authority-statement:narada-defaults", kind: "target-default", origin: { locus: "target-site", site_id: ids.targetSite, authority_ref: "authority:site:narada" }, effect: "fallback", revision: 1, issued_at: now, payload_ref: "policy:narada-defaults" },
    { schema: "narada.invokable-intelligence.authority-statement.v1", id: "authority-statement:pc-eligibility", kind: "execution-feasibility", origin: { locus: "execution-site", site_id: ids.hostSite, authority_ref: "authority:site:pc" }, effect: "eligibility-constraint", revision: 1, issued_at: now, payload_ref: "policy:pc-eligibility" },
    { schema: "narada.invokable-intelligence.authority-statement.v1", id: "authority-statement:andrey-local-consent", kind: "principal-consent", origin: { locus: "principal", site_id: ids.targetSite, principal_id: ids.principal, authority_ref: "authority:principal:andrey" }, effect: "consent-gate", revision: 1, issued_at: now, payload_ref: ids.grant },
    { schema: "narada.invokable-intelligence.authority-statement.v1", id: "authority-statement:canonical-local-thinking-levels", kind: "declared-capability", origin: { locus: "resource-owner", site_id: ids.targetSite, authority_ref: "authority:model-owner:kimi" }, effect: "capability-evidence", revision: 1, issued_at: now, payload_ref: "assert:canonical-local-thinking-levels" },
    { schema: "narada.invokable-intelligence.authority-statement.v1", id: "authority-statement:canonical-local-batch", kind: "declared-capability", origin: { locus: "resource-owner", site_id: ids.targetSite, authority_ref: "authority:model-owner:kimi" }, effect: "capability-evidence", revision: 1, issued_at: now, payload_ref: "assert:canonical-local-batch" },
  ];
  const temporal: CatalogTemporalInput = {
    schema: "narada.invokable-intelligence.catalog-temporal-input.v1",
    id: "temporal-input:canonical-local",
    clock: canonicalTestClock(now),
    valid_until: validUntil,
  };
  return {
    schema: "narada.invokable-intelligence.canonical-catalog-seed.v1",
    id: "catalog-seed:canonical-local",
    created_at: now,
    records: records([...resources, route, ...assertions, ...policies, ...access, ...statements, temporal]),
    residuals: [],
  };
}
