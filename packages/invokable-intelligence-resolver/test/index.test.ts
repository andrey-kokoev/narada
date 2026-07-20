import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_LOCAL_TEST_IDS,
  buildCanonicalLocalTestSeed,
  canonicalSha256,
  canonicalTestClock,
  feasibleTopologyObservations,
} from "@narada2/invokable-intelligence-contract";
import type {
  CanonicalCatalogSeed,
  InvocationIntent,
  InvocationPlan,
  InvocationRefusal,
  ResolverMaterializedInputs,
} from "@narada2/invokable-intelligence-contract";
import { SqliteRegistryStore } from "@narada2/invokable-intelligence-registry";
import type { IntelligenceRegistryStore } from "@narada2/invokable-intelligence-registry";

import { computeResolverStateDigests, resolveInvocation } from "../src/index.js";
import type { ResolverContext } from "../src/index.js";

const AT = "2026-07-19T12:00:00.000Z";
const IDS = CANONICAL_LOCAL_TEST_IDS;
const NO_MATERIALIZED_INPUTS: ResolverMaterializedInputs = {
  admitted: [],
  excluded: [],
  acquisition_refs: [],
};

function refreshCatalogDigests(seed: CanonicalCatalogSeed): void {
  for (const record of seed.records) record.source.digest = canonicalSha256(record.document);
}

function context(instant = AT): ResolverContext {
  return {
    targetSite: { kind: "site", id: IDS.targetSite },
    userSite: { kind: "site", id: IDS.userSite },
    hostSite: { kind: "site", id: IDS.hostSite },
    runtime: "node",
    clock: canonicalTestClock(instant),
    access: {
      action: "invoke",
      requested_region: "global",
      data_classification: "internal",
      requested_retention_days: 0,
      provider_training: "prohibited",
      expected_usage: { amount: 1, unit: "requests" },
      expected_cost: { amount: 1, currency: "USD" },
    },
    topology_observations: feasibleTopologyObservations(),
  };
}

function materializedForeignConsent(seed: CanonicalCatalogSeed): ResolverMaterializedInputs {
  const statementRecord = seed.records.find(({ record_id }) => record_id === "authority-statement:andrey-local-consent")!;
  const payloadRecord = seed.records.find(({ record_id }) => record_id === IDS.grant)!;
  assert.equal(statementRecord.document.schema, "narada.invokable-intelligence.authority-statement.v1");
  if (statementRecord.document.schema !== "narada.invokable-intelligence.authority-statement.v1") throw new Error("test statement missing");
  statementRecord.document.origin.site_id = IDS.userSite;
  statementRecord.authority.site_id = IDS.userSite;
  const envelope = {
    schema: "narada.invokable-intelligence.materialization-envelope.v1" as const,
    id: "materialization:andrey-local-consent:r1",
    mode: "durable-projection" as const,
    origin: {
      site_id: IDS.userSite,
      locus: statementRecord.document.origin.locus,
      authority_ref: statementRecord.document.origin.authority_ref,
    },
    destination: { site_id: IDS.targetSite, resolver: "local" as const, store: "sqlite" as const },
    statement: {
      id: statementRecord.document.id,
      kind: statementRecord.document.kind,
      effect: statementRecord.document.effect,
      source_revision: statementRecord.document.revision,
      payload_digest: payloadRecord.source.digest,
      payload_ref: payloadRecord.id,
    },
    allowed_scope: {
      purposes: ["operator-chat"],
      target_site_ids: [IDS.targetSite],
      principal_ids: [IDS.principal],
    },
    issued_at: "2026-07-19T00:00:00.000Z",
    expires_at: "2026-07-20T00:00:00.000Z",
    provenance_refs: ["evidence:test-user-site-consent"],
    authorization_ref: "grant:test-materialize-consent",
  };
  const admission = {
    schema: "narada.invokable-intelligence.materialization-admission.v1" as const,
    id: "admission:andrey-local-consent:r1",
    envelope_id: envelope.id,
    destination_site_id: IDS.targetSite,
    decision: "admitted" as const,
    decided_at: AT,
    decided_by: "site-operator:test",
    reason_codes: [],
    evidence_refs: ["evidence:test-destination-admission"],
    admitted_digest: payloadRecord.source.digest,
  };
  const projection = {
    projection_key: `${IDS.targetSite}|${IDS.userSite}|principal|${statementRecord.document.id}`,
    envelope,
    admission,
    status: "active" as const,
    materialized_at: AT,
  };
  refreshCatalogDigests(seed);
  return { admitted: [projection], excluded: [], acquisition_refs: [admission.id] };
}

function intent(overrides: Partial<InvocationIntent> = {}): InvocationIntent {
  return {
    schema: "narada.invokable-intelligence.invocation-intent.v1",
    id: "intent:canonical-resolver-test",
    created_at: AT,
    principal: IDS.principal,
    purpose: "operator-chat",
    input_digest: `sha256:${"a".repeat(64)}`,
    requested_options: { thinking: "low" },
    ...overrides,
  };
}

async function makeStore(
  mutate?: (seed: CanonicalCatalogSeed) => void,
): Promise<IntelligenceRegistryStore> {
  const seed = buildCanonicalLocalTestSeed();
  mutate?.(seed);
  refreshCatalogDigests(seed);
  const store = await SqliteRegistryStore.open(":memory:");
  await store.loadCatalogSeed(seed);
  return store;
}

function asPlan(result: InvocationPlan | InvocationRefusal): InvocationPlan {
  assert.equal(result.schema, "narada.invokable-intelligence.invocation-plan.v2", JSON.stringify(result, null, 2));
  return result as InvocationPlan;
}

function asRefusal(result: InvocationPlan | InvocationRefusal): InvocationRefusal {
  assert.equal(result.schema, "narada.invokable-intelligence.invocation-refusal.v1", JSON.stringify(result, null, 2));
  return result as InvocationRefusal;
}

test("identical canonical inputs produce byte-stable v2 plans and digests", async () => {
  const store = await makeStore();
  const input = intent();
  const first = asPlan(await resolveInvocation(input, context(), { store, materializedInputs: NO_MATERIALIZED_INPUTS }));
  const second = asPlan(await resolveInvocation(input, context(), { store, materializedInputs: NO_MATERIALIZED_INPUTS }));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(
    await computeResolverStateDigests(input, context(), { store, materializedInputs: NO_MATERIALIZED_INPUTS }),
    first.snapshot.digests,
  );
  await store.close();
});

test("foreign consent is inert until its exact materialization is admitted", async () => {
  const seed = buildCanonicalLocalTestSeed();
  const materializedInputs = materializedForeignConsent(seed);
  const store = await SqliteRegistryStore.open(":memory:");
  await store.loadCatalogSeed(seed);

  assert.equal(
    asRefusal(await resolveInvocation(intent(), context(), { store, materializedInputs: NO_MATERIALIZED_INPUTS })).reason_code,
    "principal-consent-required",
  );
  const plan = asPlan(await resolveInvocation(intent(), context(), { store, materializedInputs }));
  assert.ok(plan.snapshot.referenced_revisions.some(({ kind, immutable_ref }) =>
    kind === "materialization" && immutable_ref === "materialization:andrey-local-consent:r1"));

  const mismatched = structuredClone(materializedInputs);
  mismatched.admitted[0]!.envelope.statement.payload_digest = `sha256:${"f".repeat(64)}`;
  assert.equal(
    asRefusal(await resolveInvocation(intent(), context(), { store, materializedInputs: mismatched })).reason_code,
    "principal-consent-required",
  );
  await store.close();
});

test("plan names explicit offering, route, topology, access, authority, and bounded snapshot", async () => {
  const store = await makeStore();
  const plan = asPlan(await resolveInvocation(intent(), context(), { store, materializedInputs: NO_MATERIALIZED_INPUTS }));
  assert.equal(plan.selected.model.id, IDS.model);
  assert.equal(plan.route.offering.id, IDS.offering);
  assert.equal(plan.route.route_id, IDS.route);
  assert.equal(plan.route.topology_id, "topology:local-openai-compatible");
  assert.equal(plan.access.account_id, IDS.account);
  assert.equal(plan.access.credential_binding_id, "credential-binding:local-api");
  assert.equal(plan.access.grant_id, IDS.grant);
  assert.equal(plan.access.entitlement_id, "entitlement:local-api");
  assert.equal(plan.access.quota_id, "quota:local-api");
  assert.equal(plan.access.budget_id, "budget:narada-local-api");
  assert.deepEqual(plan.access.governance_requirement_ids, ["governance:narada-local-api"]);
  assert.ok(plan.authority_provenance.decisions.some(({ statement_kind, disposition }) =>
    statement_kind === "principal-consent" && disposition === "applied"));
  assert.ok(Date.parse(plan.snapshot.valid_until) > Date.parse(plan.created_at));
  assert.equal(plan.options.thinking, "low");
  await store.close();
});

test("absence of explicit route refuses before ranking", async () => {
  const store = await makeStore((seed) => {
    seed.records = seed.records.filter(({ record_kind }) => record_kind !== "route");
  });
  assert.equal(asRefusal(await resolveInvocation(intent(), context(), { store, materializedInputs: NO_MATERIALIZED_INPUTS })).reason_code, "explicit-route-required");
  await store.close();
});

test("principal identity and explicit principal consent are independent gates", async () => {
  const missingPrincipal = await makeStore();
  assert.equal(
    asRefusal(await resolveInvocation(intent({ principal: undefined }), context(), { store: missingPrincipal, materializedInputs: NO_MATERIALIZED_INPUTS })).reason_code,
    "principal-required",
  );
  await missingPrincipal.close();

  const missingConsent = await makeStore((seed) => {
    seed.records = seed.records.filter(({ record_id }) => record_id !== "authority-statement:andrey-local-consent");
  });
  assert.equal(
    asRefusal(await resolveInvocation(intent(), context(), { store: missingConsent, materializedInputs: NO_MATERIALIZED_INPUTS })).reason_code,
    "principal-consent-required",
  );
  await missingConsent.close();
});

test("topology infeasibility and access denial reject before provider selection", async () => {
  const topologyStore = await makeStore();
  const topologyContext = context();
  topologyContext.topology_observations[0] = {
    ...topologyContext.topology_observations[0],
    status: "infeasible",
    reason_code: "test-unreachable",
  };
  assert.equal(
    asRefusal(await resolveInvocation(intent(), topologyContext, { store: topologyStore, materializedInputs: NO_MATERIALIZED_INPUTS })).reason_code,
    "topology-infeasible",
  );
  await topologyStore.close();

  const accessStore = await makeStore((seed) => {
    const binding = seed.records.find(({ record_id }) => record_id === "credential-binding:local-api");
    if (binding?.document.schema === "narada.invokable-intelligence.credential-binding.v1") {
      binding.document.presence = "missing";
    }
  });
  assert.equal(
    asRefusal(await resolveInvocation(intent(), context(), { store: accessStore, materializedInputs: NO_MATERIALIZED_INPUTS })).reason_code,
    "access-denied",
  );
  await accessStore.close();
});

test("unsupported route option and unknown model produce typed pre-provider refusals", async () => {
  const store = await makeStore();
  assert.equal(
    asRefusal(await resolveInvocation(intent({ requested_options: { thinking: "extreme" } }), context(), { store, materializedInputs: NO_MATERIALIZED_INPUTS })).reason_code,
    "unsupported-options",
  );
  assert.equal(
    asRefusal(await resolveInvocation(intent({ requested_model: { kind: "model", id: "model:does-not-exist" } }), context(), { store, materializedInputs: NO_MATERIALIZED_INPUTS })).reason_code,
    "no-candidates",
  );
  await store.close();
});

test("the same intent may be explicitly replanned later without falsifying its creation time", async () => {
  const store = await makeStore();
  const first = asPlan(await resolveInvocation(intent(), context(), { store, materializedInputs: NO_MATERIALIZED_INPUTS }));
  const replacement = asPlan(await resolveInvocation(
    intent(),
    context("2026-07-19T12:01:00.000Z"),
    { store, materializedInputs: NO_MATERIALIZED_INPUTS, predecessorPlanId: first.id },
  ));
  assert.notEqual(replacement.id, first.id);
  assert.equal(replacement.snapshot.lineage.relation, "replan-of");
  assert.equal(replacement.snapshot.lineage.predecessor_plan_id, first.id);
  await store.close();
});
