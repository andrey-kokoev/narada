import assert from "node:assert/strict";
import test from "node:test";

import { CLOUDFLARE_EXECUTION_TOPOLOGY } from "../src/topology.js";
import { INVOCATION_ROUTE_CANDIDATE_SCHEMA } from "../src/offerings.js";
import type { InvocationRouteCandidate } from "../src/offerings.js";
import type { ModelOffering } from "../src/resources.js";
import {
  ACCESS_GRANT_SCHEMA,
  BUDGET_AUTHORIZATION_SCHEMA,
  CREDENTIAL_BINDING_SCHEMA,
  DATA_GOVERNANCE_REQUIREMENT_SCHEMA,
  INVOCATION_PRINCIPAL_SCHEMA,
  QUOTA_OBSERVATION_SCHEMA,
  SERVICE_ACCOUNT_SCHEMA,
  SERVICE_ENTITLEMENT_SCHEMA,
  containsForbiddenSecretMaterial,
  evaluateRouteAccess,
} from "../src/access.js";
import {
  resolveInvocationPrincipalAdmission,
} from "../src/access.js";
import type { AccessAuthorityRef, InvocationPrincipal, RouteAccessFacts } from "../src/access.js";

const authority = (owner_kind: AccessAuthorityRef["owner_kind"], owner_id: string): AccessAuthorityRef => ({ owner_kind, owner_id, authority_ref: `authority:${owner_kind}:${owner_id}` });
const offering: ModelOffering = {
  schema: "narada.invokable-intelligence.model-offering.v1",
  id: "model-offering:kimi-via-cloudflare",
  model: { kind: "model", id: "model:kimi-k2-thinking" },
  model_provider: { kind: "model-provider", id: "model-provider:kimi" },
  inference_provider: { kind: "inference-provider", id: "inference-provider:cloudflare-workers-ai" },
  endpoint: { kind: "inference-endpoint", id: "inference-endpoint:cf-workers-ai-default" },
  invocation_model_key: "@cf/moonshotai/kimi-k2-instruct",
  service_class: "workers-ai",
  region: "global",
};
const route: InvocationRouteCandidate = {
  schema: INVOCATION_ROUTE_CANDIDATE_SCHEMA,
  id: "route:kimi-cloudflare",
  offering: { kind: "model-offering", id: offering.id },
  endpoint: offering.endpoint,
  adapter: { kind: "adapter", id: "adapter:workers-ai-binding" },
  topology: CLOUDFLARE_EXECUTION_TOPOLOGY,
  execution_loci: [{ kind: "execution-locus", id: "execution-locus:cloudflare-carrier" }],
  access: { account_ref: "account:cloudflare", grant_refs: ["grant:andrey"], credential: { kind: "credential-locator", id: "credential-locator:shared-cloudflare" } },
  composition_digest: `sha256:${"c".repeat(64)}`,
};
const principal = (id: string): InvocationPrincipal => ({ schema: INVOCATION_PRINCIPAL_SCHEMA, id, kind: "human", authority: authority("principal", id) });
const facts = (): RouteAccessFacts => ({
  account: { schema: SERVICE_ACCOUNT_SCHEMA, id: "account:cloudflare", tenant_id: "tenant:cloudflare", inference_provider: offering.inference_provider, owner: authority("account-owner", "site:user"), region: "global", status: "active" },
  credential_binding: { schema: CREDENTIAL_BINDING_SCHEMA, id: "credential-binding:shared-cloudflare", account_id: "account:cloudflare", credential_locator: route.access.credential, transport: { kind: "runtime-binding", ref: "binding:AI", holder_site_id: "site:cloudflare" }, presence: "present", usability: "usable", observed_at: "2026-07-19T00:00:00Z", valid_until: "2026-07-20T00:00:00Z", owner: authority("execution-site", "site:cloudflare"), evidence: [] },
  grants: [{ schema: ACCESS_GRANT_SCHEMA, id: "grant:andrey", principal_id: "principal:andrey", account_id: "account:cloudflare", actions: ["invoke"], scope: { offering_ids: [offering.id], route_ids: [route.id], purposes: ["operator-chat"], target_site_ids: ["site:narada"], topology_ids: [route.topology.id] }, validity: { valid_from: "2026-07-19T00:00:00Z", valid_until: "2026-07-20T00:00:00Z" }, status: "active", granted_by: authority("account-owner", "site:user"), principal_consent_ref: "consent:andrey-cloudflare", evidence: [] }],
  entitlements: [{ schema: SERVICE_ENTITLEMENT_SCHEMA, id: "entitlement:workers-ai", account_id: "account:cloudflare", offering_id: offering.id, service_class: offering.service_class, features: ["invoke"], validity: { valid_from: "2026-07-19T00:00:00Z", valid_until: "2026-07-20T00:00:00Z" }, status: "active", owner: authority("service-provider", "cloudflare"), evidence: [] }],
  quotas: [{ schema: QUOTA_OBSERVATION_SCHEMA, id: "quota:workers-ai", account_id: "account:cloudflare", offering_id: offering.id, unit: "requests", limit: 100, consumed: 10, reserved: 5, period_start: "2026-07-19T00:00:00Z", period_end: "2026-07-20T00:00:00Z", observed_at: "2026-07-19T00:00:00Z", fresh_until: "2026-07-20T00:00:00Z", owner: authority("service-provider", "cloudflare"), evidence: [] }],
  budgets: [{ schema: BUDGET_AUTHORIZATION_SCHEMA, id: "budget:narada", principal_id: "principal:andrey", account_id: "account:cloudflare", target_site_id: "site:narada", currency: "USD", limit: 100, committed: 10, reserved: 5, validity: { valid_from: "2026-07-19T00:00:00Z", valid_until: "2026-07-20T00:00:00Z" }, status: "authorized", owner: authority("target-site", "site:narada"), evidence: [] }],
  governance: [{ schema: DATA_GOVERNANCE_REQUIREMENT_SCHEMA, id: "governance:narada", target_site_id: "site:narada", purposes: ["operator-chat"], data_classifications: ["internal"], allowed_regions: ["global"], maximum_retention_days: 30, provider_training: "prohibited", validity: { valid_from: "2026-07-19T00:00:00Z", valid_until: "2026-07-20T00:00:00Z" }, status: "active", owner: authority("target-site", "site:narada"), evidence: [] }],
});
const context = (subject = principal("principal:andrey")) => ({ principal: subject, target_site_id: "site:narada", purpose: "operator-chat", action: "invoke" as const, now: "2026-07-19T12:00:00Z", requested_region: "global", data_classification: "internal" as const, requested_retention_days: 7, provider_training: "prohibited" as const, expected_usage: { amount: 1, unit: "requests" }, expected_cost: { amount: 1, currency: "USD" } });

test("authenticated actors resolve through explicit principal bindings without name interpretation", () => {
  const sitePrincipal: InvocationPrincipal = {
    ...principal("principal:narada-cloudflare-operators"),
    kind: "site",
    admission_bindings: [{
      id: "principal-binding:narada-cloudflare-operators",
      kind: "site-membership",
      registry: "narada.cloudflare-site-registry.v1",
      site_id: "site_narada_cloudflare",
      roles: ["owner", "admin"],
      auth_types: ["microsoft_oidc"],
    }],
  };
  const resolved = resolveInvocationPrincipalAdmission([sitePrincipal], {
    actor: { principal_id: "microsoft:tenant:object", auth_type: "microsoft_oidc" },
    memberships: [{
      registry: "narada.cloudflare-site-registry.v1",
      site_id: "site_narada_cloudflare",
      role: "admin",
      evidence_ref: "site-binding:request-1",
    }],
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.principal.id, "principal:narada-cloudflare-operators");
  assert.equal(resolved.binding.id, "principal-binding:narada-cloudflare-operators");
  assert.deepEqual(resolved.evidence_refs, ["site-binding:request-1"]);
});

test("principal admission fails closed when zero or multiple governed bindings match", () => {
  const bound = (id: string): InvocationPrincipal => ({
    ...principal(id),
    admission_bindings: [{
      id: `binding:${id}`,
      kind: "authenticated-principal",
      auth_type: "service",
      principal_id: "transport:service",
    }],
  });
  assert.equal(resolveInvocationPrincipalAdmission([bound("principal:one")], {
    actor: { principal_id: "transport:other", auth_type: "service" },
    memberships: [],
  }).ok, false);
  const ambiguous = resolveInvocationPrincipalAdmission([bound("principal:one"), bound("principal:two")], {
    actor: { principal_id: "transport:service", auth_type: "service" },
    memberships: [],
  });
  assert.deepEqual(ambiguous, {
    ok: false,
    code: "principal-binding-ambiguous",
    candidate_principal_ids: ["principal:one", "principal:two"],
  });
});

test("route is eligible only when credential, grant, entitlement, quota, budget, and governance all pass", () => {
  const result = evaluateRouteAccess(route, offering, context(), facts());
  assert.equal(result.eligible, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.provenance.grant_id, "grant:andrey");
});

test("shared credential does not authorize a different principal", () => {
  const result = evaluateRouteAccess(route, offering, context(principal("principal:other")), facts());
  assert.equal(result.eligible, false);
  assert.ok(result.findings.some(({ code }) => code === "principal-unauthorized"));
  assert.ok(!result.findings.some(({ code }) => code === "missing-secret"));
});

test("successful authentication cannot hide unusable credentials, revoked grants, or expired grants", () => {
  const unusable = facts();
  unusable.credential_binding!.usability = "unusable";
  unusable.grants[0].status = "revoked";
  const result = evaluateRouteAccess(route, offering, context(), unusable);
  assert.ok(result.findings.some(({ code }) => code === "credential-unusable"));
  assert.ok(result.findings.some(({ code }) => code === "revoked-grant"));
  assert.ok(result.findings.some(({ code }) => code === "principal-unauthorized"));
});

test("quota, budget, region, and retention produce independent typed refusals", () => {
  const constrained = facts();
  constrained.quotas[0].consumed = 100;
  constrained.budgets[0].status = "denied";
  const result = evaluateRouteAccess(route, offering, { ...context(), requested_region: "EU", requested_retention_days: 90 }, constrained);
  const codes = new Set(result.findings.map(({ code }) => code));
  assert.ok(codes.has("quota-exhausted"));
  assert.ok(codes.has("budget-denied"));
  assert.ok(codes.has("governance-mismatch"));
});

test("access contracts carry only locators and handles, never raw secret fields", () => {
  assert.equal(containsForbiddenSecretMaterial(facts()), false);
  assert.equal(containsForbiddenSecretMaterial({ ...facts().credential_binding, token: "secret" }), true);
});
