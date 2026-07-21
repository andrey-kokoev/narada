import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import test from "node:test";

import {
  CANONICAL_LOCAL_TEST_IDS,
  LOCAL_EXECUTION_TOPOLOGY,
  MATERIALIZATION_ADMISSION_SCHEMA,
  MATERIALIZATION_ENVELOPE_SCHEMA,
  MATERIALIZATION_REVOCATION_SCHEMA,
  acquireResolverMaterializedInputs,
  applyMaterializedProjection,
  buildCanonicalLocalTestSeed,
  canonicalSha256,
  canonicalTestClock,
  feasibleTopologyObservations,
  revokeMaterializedProjection,
} from "@narada2/invokable-intelligence-contract";
import type {
  MaterializationAdmission,
  MaterializationEnvelope,
} from "@narada2/invokable-intelligence-contract";
import { SqliteRegistryStore } from "@narada2/invokable-intelligence-registry";
import type { IntelligenceRegistryStore } from "@narada2/invokable-intelligence-registry";
import { deterministicId } from "@narada2/invokable-intelligence-resolver";

import { buildResolverContext, createLocalInvocationGateway } from "../src/index.js";
import type {
  AdapterInvocation,
  AdapterOutcome,
  InvocationAdapter,
  LocalInvocationGatewayOptions,
} from "../src/index.js";

const IDS = CANONICAL_LOCAL_TEST_IDS;
const AT = "2026-07-19T12:00:00.000Z";
const SITES = {
  targetSite: { kind: "site" as const, id: IDS.targetSite },
  userSite: { kind: "site" as const, id: IDS.userSite },
  hostSite: { kind: "site" as const, id: IDS.hostSite },
};
const ACCESS = {
  action: "invoke" as const,
  requested_region: "global",
  data_classification: "internal" as const,
  requested_retention_days: 0,
  provider_training: "prohibited" as const,
  expected_usage: { amount: 1, unit: "requests" },
  expected_cost: { amount: 1, currency: "USD" },
};

function fakeAdapter(
  outcome: AdapterOutcome | ((input: AdapterInvocation) => AdapterOutcome | Promise<AdapterOutcome>),
): InvocationAdapter & { calls: AdapterInvocation[] } {
  const calls: AdapterInvocation[] = [];
  return {
    calls,
    async invoke(input) {
      calls.push(input);
      return typeof outcome === "function" ? outcome(input) : outcome;
    },
  };
}

async function openCanonical(options: { endpointBaseUrl?: string } = {}): Promise<IntelligenceRegistryStore> {
  const store = await SqliteRegistryStore.open(":memory:");
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed(options));
  return store;
}

function gatewayOptions(
  store: IntelligenceRegistryStore,
  adapter: InvocationAdapter,
  time: { instant: string },
): LocalInvocationGatewayOptions {
  return {
    store,
    adapters: { [IDS.adapter]: adapter },
    clock: () => canonicalTestClock(time.instant),
    contextFor: ({ clock }) => buildResolverContext(SITES, {
      clock,
      runtime: "node",
      access: ACCESS,
      topologyObservations: feasibleTopologyObservations(),
    }),
    materializationFor: () => ({ admitted: [], excluded: [], acquisition_refs: [] }),
    auditAuthority: {
      admittedBy: "runtime:canonical-local-test",
      admissionRef: "policy:evidence-admission:canonical-local-test",
    },
    resultPayloadPolicy: ({ intent, producedAt }) => ({
      media_type: "application/json",
      classification: "internal",
      retention: {
        mode: "never-retain",
        policy_ref: "governance:narada-local-api",
        residency: IDS.hostSite,
      },
      access: {
        allowed_principals: intent.principal ? [intent.principal] : [],
        capability_refs: ["capability:invocation-result-read"],
      },
      disposition: "never-retained",
      tombstone: {
        disposed_at: producedAt,
        reason_code: "canonical-test-never-retain",
        evidence_ref: "policy:evidence-admission:canonical-local-test",
      },
    }),
  };
}

const request = (overrides: Record<string, unknown> = {}) => ({
  intentId: "intent:runtime-canonical-test",
  operationId: "operation:runtime-canonical-test:1",
  purpose: "operator-chat",
  principal: IDS.principal,
  messages: [{ role: "user", content: "ping" }],
  ...overrides,
});

function emitTask2217Evidence(caseId: string, evidence: Record<string, unknown>): void {
  console.log(JSON.stringify({
    schema: "narada.invokable-intelligence.task-2217-case-evidence.v1",
    task: 2217,
    case_id: caseId,
    evidence,
  }));
}

test("an incomplete durable attempt reconciles to unknown admission without redispatch", async () => {
  const store = await openCanonical();
  const time = { instant: AT };
  const adapter = fakeAdapter({ admission: "acknowledged", response: { text: "ok" } });
  const gateway = createLocalInvocationGateway(gatewayOptions(store, adapter, time));
  const initial = await gateway.invoke(request());
  assert.equal(initial.kind, "plan");
  if (initial.kind !== "plan") return;

  const operationId = "operation:runtime-incomplete";
  const attemptId = deterministicId("attempt", { intent: initial.intent.id, operationKey: operationId });
  await store.recordExecutionAttempt({
    schema: "narada.invokable-intelligence.execution-attempt.v1",
    id: attemptId,
    intent_id: initial.intent.id,
    plan_id: initial.plan.id,
    state: "created",
    created_at: AT,
    lineage: { relation: "retry-of", predecessor_attempt_id: initial.attempt.id },
  });
  await store.recordExecutionTransition({
    schema: "narada.invokable-intelligence.execution-transition.v1",
    id: "transition:runtime-incomplete-dispatching",
    attempt_id: attemptId,
    sequence: 1,
    previous_state: "created",
    state: "dispatching",
    transitioned_at: AT,
  });
  await store.recordExecutionTransition({
    schema: "narada.invokable-intelligence.execution-transition.v1",
    id: "transition:runtime-incomplete-provider-pending",
    attempt_id: attemptId,
    sequence: 2,
    previous_state: "dispatching",
    state: "provider-pending",
    transitioned_at: AT,
  });

  time.instant = "2026-07-19T12:01:00.000Z";
  const reconciled = await gateway.invoke(request({ operationId, mode: "retry" }));
  assert.equal(reconciled.kind, "plan");
  if (reconciled.kind !== "plan") return;
  assert.equal(reconciled.replayed, true);
  assert.equal(reconciled.outcome.kind, "admission-unknown");
  assert.equal(reconciled.adapterOutcome, null);
  assert.equal(adapter.calls.length, 1, "the incomplete attempt is never dispatched a second time");
  assert.equal((await store.listExecutionTransitions(attemptId)).at(-1)?.state, "terminal");
  assert.ok(reconciled.auditEvidence.some(({ evidence_type }) => evidence_type === "reconciliation"));
  await store.close();
});

test("revoked materialized consent invalidates retry and replay without provider dispatch", async () => {
  const seed = buildCanonicalLocalTestSeed();
  const consentRecord = seed.records.find(({ record_id }) => record_id === "authority-statement:andrey-local-consent");
  const grantRecord = seed.records.find(({ record_id }) => record_id === IDS.grant);
  assert.ok(consentRecord);
  assert.ok(grantRecord);
  if (!consentRecord
    || consentRecord.document.schema !== "narada.invokable-intelligence.authority-statement.v1"
    || !grantRecord) return;

  const foreignConsent = {
    ...consentRecord.document,
    origin: { ...consentRecord.document.origin, site_id: IDS.userSite },
  };
  consentRecord.document = foreignConsent;
  consentRecord.authority = {
    kind: foreignConsent.kind,
    locus: foreignConsent.origin.locus,
    site_id: foreignConsent.origin.site_id,
    principal_id: foreignConsent.origin.principal_id,
    authority_ref: foreignConsent.origin.authority_ref,
  };
  consentRecord.source = { ...consentRecord.source, digest: canonicalSha256(foreignConsent) };

  const envelope: MaterializationEnvelope = {
    schema: MATERIALIZATION_ENVELOPE_SCHEMA,
    id: "materialization:andrey-local-consent:r1",
    mode: "durable-projection",
    origin: {
      site_id: foreignConsent.origin.site_id,
      locus: foreignConsent.origin.locus,
      authority_ref: foreignConsent.origin.authority_ref,
    },
    destination: { site_id: IDS.targetSite, resolver: "local", store: "sqlite" },
    statement: {
      id: foreignConsent.id,
      kind: foreignConsent.kind,
      effect: foreignConsent.effect,
      source_revision: foreignConsent.revision,
      payload_digest: grantRecord.source.digest,
      payload_ref: foreignConsent.payload_ref,
    },
    allowed_scope: {
      purposes: ["operator-chat"],
      target_site_ids: [IDS.targetSite],
      principal_ids: [IDS.principal],
      topology_ids: [LOCAL_EXECUTION_TOPOLOGY.id],
    },
    issued_at: "2026-07-19T00:00:00.000Z",
    expires_at: "2026-07-20T00:00:00.000Z",
    provenance_refs: ["evidence:user-site-consent"],
    authorization_ref: "grant:materialize-principal-consent",
  };
  const admission: MaterializationAdmission = {
    schema: MATERIALIZATION_ADMISSION_SCHEMA,
    id: "admission:andrey-local-consent:r1",
    envelope_id: envelope.id,
    destination_site_id: IDS.targetSite,
    decision: "admitted",
    decided_at: "2026-07-19T00:00:01.000Z",
    decided_by: "site:narada:admission",
    reason_codes: [],
    evidence_refs: ["evidence:narada-admission"],
    admitted_digest: envelope.statement.payload_digest,
  };
  const applied = applyMaterializedProjection(undefined, envelope, admission);
  assert.equal(applied.status, "materialized");
  assert.ok(applied.projection);
  if (!applied.projection) return;
  let projection = applied.projection;

  const store = await SqliteRegistryStore.open(":memory:");
  await store.loadCatalogSeed(seed);
  const time = { instant: AT };
  const adapter = fakeAdapter({ admission: "acknowledged", response: { text: "ok" } });
  const options = gatewayOptions(store, adapter, time);
  options.materializationFor = () => acquireResolverMaterializedInputs([projection], {
    destination_site_id: IDS.targetSite,
    resolver: "local",
    target_site_id: IDS.targetSite,
    purpose: "operator-chat",
    principal_id: IDS.principal,
    topology_id: LOCAL_EXECUTION_TOPOLOGY.id,
    now: time.instant,
  });
  const gateway = createLocalInvocationGateway(options);
  const initialRequest = request({
    intentId: "intent:runtime-materialized-consent",
    operationId: "operation:runtime-materialized-consent:initial",
  });
  const initial = await gateway.invoke(initialRequest);
  assert.equal(initial.kind, "plan");
  if (initial.kind !== "plan") return;
  assert.equal(adapter.calls.length, 1);

  const revoked = revokeMaterializedProjection(projection, {
    schema: MATERIALIZATION_REVOCATION_SCHEMA,
    id: "revocation:andrey-local-consent:r1",
    envelope_id: envelope.id,
    statement_id: envelope.statement.id,
    source_revision: envelope.statement.source_revision,
    origin: envelope.origin,
    revoked_at: "2026-07-19T12:01:00.000Z",
    reason_code: "principal-withdrew-consent",
    evidence_ref: "evidence:user-site-revocation",
  });
  assert.equal(revoked.status, "refreshed");
  assert.ok(revoked.projection);
  if (!revoked.projection) return;
  projection = revoked.projection;

  time.instant = "2026-07-19T12:02:00.000Z";
  const retry = await gateway.invoke(request({
    intentId: initial.intent.id,
    operationId: "operation:runtime-materialized-consent:retry",
    mode: "retry",
  }));
  assert.equal(retry.kind, "refusal");
  if (retry.kind !== "refusal") return;
  assert.equal(retry.refusal.reason_code, "principal-consent-required");

  time.instant = "2026-07-19T12:03:00.000Z";
  const replay = await gateway.invoke(request({
    intentId: initial.intent.id,
    operationId: "operation:runtime-materialized-consent:replay",
    mode: "immediate",
  }));
  assert.equal(replay.kind, "refusal");
  if (replay.kind !== "refusal") return;
  assert.equal(replay.refusal.reason_code, "principal-consent-required");
  assert.equal(adapter.calls.length, 1, "revoked consent blocks both retry and replay before dispatch");

  const revalidations = await store.listPlanRevalidations(initial.plan.id);
  assert.equal(revalidations.length, 2);
  assert.ok(revalidations.every(({ decision, reasons }) =>
    decision === "replan-required" && reasons.includes("materialization-changed")
  ));
  await store.close();
});

test("recovery distinguishes a recorded dispatch decision from possible provider submission", async () => {
  const store = await openCanonical();
  const time = { instant: AT };
  const adapter = fakeAdapter({ admission: "acknowledged", response: { text: "ok" } });
  const gateway = createLocalInvocationGateway(gatewayOptions(store, adapter, time));
  const initial = await gateway.invoke(request({
    intentId: "intent:runtime-pre-provider-recovery",
    operationId: "operation:runtime-pre-provider-initial",
  }));
  assert.equal(initial.kind, "plan");
  if (initial.kind !== "plan") return;

  const operationId = "operation:runtime-pre-provider-recovery";
  const attemptId = deterministicId("attempt", { intent: initial.intent.id, operationKey: operationId });
  await store.recordExecutionAttempt({
    schema: "narada.invokable-intelligence.execution-attempt.v1",
    id: attemptId,
    intent_id: initial.intent.id,
    plan_id: initial.plan.id,
    state: "created",
    created_at: AT,
    lineage: { relation: "retry-of", predecessor_attempt_id: initial.attempt.id },
  });
  await store.recordExecutionTransition({
    schema: "narada.invokable-intelligence.execution-transition.v1",
    id: "transition:runtime-pre-provider-dispatching",
    attempt_id: attemptId,
    sequence: 1,
    previous_state: "created",
    state: "dispatching",
    transitioned_at: AT,
  });

  time.instant = "2026-07-19T12:01:00.000Z";
  const reconciled = await gateway.invoke(request({
    intentId: initial.intent.id,
    operationId,
    mode: "retry",
  }));
  assert.equal(reconciled.kind, "plan");
  if (reconciled.kind !== "plan") return;
  assert.equal(reconciled.outcome.kind, "provider-failure");
  assert.equal(reconciled.outcome.admission_acknowledged, false);
  assert.deepEqual(reconciled.observations.map(({ status }) => status), ["not-observed", "not-observed"]);
  assert.equal(adapter.calls.length, 1, "recovery never redispatches an existing operation");
  await store.close();
});

test("context builder requires explicit clock, runtime, access, and topology", () => {
  const clock = canonicalTestClock();
  const context = buildResolverContext(SITES, {
    clock,
    runtime: "node",
    access: ACCESS,
    topologyObservations: feasibleTopologyObservations(),
  });
  assert.equal(context.clock, clock);
  assert.equal(context.targetSite.id, IDS.targetSite);
  assert.equal(context.access.action, "invoke");
  assert.ok(context.topology_observations.length > 0);
  assert.equal("time" in context, false);
});

test("success persists distinct v2 intent, plan, attempt, result, outcome, observations, evidence, and telemetry", async () => {
  const store = await openCanonical();
  const time = { instant: AT };
  const adapter = fakeAdapter({
    admission: "acknowledged",
    response: { text: "sensitive-ok" },
    usage: { input_tokens: 3, output_tokens: 2, cached_tokens: 1, latency_ms: 5 },
    providerRequestRef: "provider-request:test-1",
  });
  const gateway = createLocalInvocationGateway(gatewayOptions(store, adapter, time));
  const result = await gateway.invoke(request({ requestedOptions: { thinking: "low" } }));
  assert.equal(result.kind, "plan");
  if (result.kind !== "plan") return;
  assert.equal(adapter.calls.length, 1);
  assert.equal(result.plan.route.route_id, IDS.route);
  assert.equal(result.plan.access.grant_id, IDS.grant);
  assert.equal(result.attempt.state, "created");
  assert.equal(result.outcome.kind, "success");
  assert.equal(result.outcome.result_id, result.result?.id);
  assert.equal(result.result?.payload.disposition, "never-retained");
  assert.equal(result.result?.payload.storage_ref, undefined);
  assert.equal(JSON.stringify(result.result).includes("sensitive-ok"), false);
  assert.equal(result.observations.length, 3);
  assert.equal(result.auditEvidence.length, 4);
  assert.equal(result.telemetry[0].input_tokens, 3);
  assert.equal((await store.listExecutionAttempts(result.plan.id)).length, 1);
  assert.deepEqual(
    (await store.listExecutionTransitions(result.attempt.id)).map(({ state }) => state),
    ["dispatching", "provider-pending", "terminal"],
  );
  assert.equal((await store.listResultEnvelopes(result.attempt.id)).length, 1);
  assert.equal((await store.listTerminalOutcomesByIntent(result.intent.id)).length, 1);
  assert.equal((await store.listInvocationObservations(result.attempt.id)).length, 3);
  assert.equal((await store.listInvocationAuditEvidence(result.attempt.id)).length, 4);
  assert.equal((await store.listInvocationTelemetry(result.attempt.id)).length, 1);
  await store.close();
});

test("dispatch uses the immutable offering revision bound into the plan even when a newer revision arrives", async () => {
  const store = await openCanonical();
  const revisedSeed = structuredClone(buildCanonicalLocalTestSeed());
  revisedSeed.id = "canonical-catalog-seed:runtime-race-revision";
  const revisedOffering = revisedSeed.records.find(({ record_id }) => record_id === IDS.offering);
  assert.ok(revisedOffering);
  if (!revisedOffering || revisedOffering.document.schema !== "narada.invokable-intelligence.model-offering.v1") return;
  revisedOffering.id = "catalog-record:runtime-race:offering:2";
  revisedOffering.revision = 2;
  revisedOffering.source.revision = "2";
  revisedOffering.document.invocation_model_key = "newer-model-key-not-in-plan";
  revisedOffering.source.digest = canonicalSha256(revisedOffering.document);

  const originalRecordPlanSnapshot = store.recordPlanSnapshot.bind(store);
  let revisionInjected = false;
  store.recordPlanSnapshot = async (snapshot) => {
    await originalRecordPlanSnapshot(snapshot);
    if (!revisionInjected) {
      revisionInjected = true;
      await store.loadCatalogSeed(revisedSeed);
    }
  };

  const adapter = fakeAdapter(({ offering }) => {
    assert.equal(offering.invocation_model_key, "kimi-k2-thinking");
    return { admission: "acknowledged", response: { text: "pinned" } };
  });
  const gateway = createLocalInvocationGateway(gatewayOptions(store, adapter, { instant: AT }));
  const result = await gateway.invoke(request({
    intentId: "intent:runtime-pinned-revision",
    operationId: "operation:runtime-pinned-revision",
  }));
  assert.equal(result.kind, "plan");
  if (result.kind !== "plan") return;
  assert.equal(result.outcome.kind, "success");
  assert.equal(adapter.calls.length, 1);
  const offeringBinding = result.plan.snapshot.referenced_revisions.find(({ record_id }) => record_id === IDS.offering);
  assert.ok(offeringBinding);
  assert.notEqual(offeringBinding?.immutable_ref, revisedOffering.id);
  assert.equal((await store.getCatalogRecord(offeringBinding!.immutable_ref))?.record_id, IDS.offering);
  const latestOffering = (await store.listCatalogRecords({ recordId: IDS.offering })).at(-1)?.document;
  assert.equal(
    latestOffering?.schema === "narada.invokable-intelligence.model-offering.v1"
      ? latestOffering.invocation_model_key
      : null,
    "newer-model-key-not-in-plan",
  );
  await store.close();
});

test("typed refusal records a terminal pre-invocation outcome and never dispatches", async () => {
  const store = await openCanonical();
  const adapter = fakeAdapter({ admission: "acknowledged", response: {} });
  const time = { instant: AT };
  const gateway = createLocalInvocationGateway(gatewayOptions(store, adapter, time));
  const refusalRequest = request({
    intentId: "intent:runtime-refusal",
    operationId: "operation:runtime-refusal",
    principal: undefined,
  });
  const result = await gateway.invoke(refusalRequest);
  assert.equal(result.kind, "refusal");
  if (result.kind !== "refusal") return;
  assert.equal(result.refusal.reason_code, "principal-required");
  assert.equal(result.outcome.kind, "pre-invocation-refusal");
  assert.equal(result.outcome.attempt_id, undefined);
  assert.equal(adapter.calls.length, 0);
  const terminalOutcomes = await store.listTerminalOutcomesByIntent(result.intent.id);
  const refusalEvidence = await store.listInvocationAuditEvidence(result.intent.id);
  assert.equal(terminalOutcomes.length, 1);
  assert.equal(refusalEvidence.length, 1);
  time.instant = "2026-07-19T12:10:00.000Z";
  const repeated = await gateway.invoke(refusalRequest);
  assert.equal(repeated.kind, "refusal");
  if (repeated.kind !== "refusal") return;
  assert.equal(repeated.refusal.id, result.refusal.id);
  assert.equal(repeated.outcome.id, result.outcome.id);
  assert.equal((await store.listRefusalsByIntent(result.intent.id)).length, 1);
  assert.equal((await store.listTerminalOutcomesByIntent(result.intent.id)).length, 1);
  emitTask2217Evidence("principal-refusal-pre-attempt", {
    intent_id: result.intent.id,
    refusal_id: result.refusal.id,
    outcome_id: result.outcome.id,
    outcome_kind: result.outcome.kind,
    attempt_id: null,
    adapter_dispatch_count: adapter.calls.length,
    durable_terminal_outcome_ids: terminalOutcomes.map(({ id }) => id),
    admitted_evidence_ids: refusalEvidence.map(({ id }) => id),
    repeated_invocation_reused_records: repeated.refusal.id === result.refusal.id && repeated.outcome.id === result.outcome.id,
  });
  await store.close();
});

test("one operation is idempotent while explicit retry and replay append lineage-preserving attempts", async () => {
  const store = await openCanonical();
  const time = { instant: AT };
  const adapter = fakeAdapter({ admission: "acknowledged", response: { text: "ok" } });
  const gateway = createLocalInvocationGateway(gatewayOptions(store, adapter, time));
  const first = await gateway.invoke(request());
  const duplicate = await gateway.invoke(request());
  assert.equal(first.kind, "plan");
  assert.equal(duplicate.kind, "plan");
  if (first.kind !== "plan" || duplicate.kind !== "plan") return;
  assert.equal(duplicate.replayed, true);
  assert.equal(duplicate.attempt.id, first.attempt.id);
  assert.equal(duplicate.adapterOutcome, null);
  assert.equal(adapter.calls.length, 1);

  time.instant = "2026-07-19T12:01:00.000Z";
  const retry = await gateway.invoke(request({ operationId: "operation:runtime-canonical-test:2", mode: "retry" }));
  assert.equal(retry.kind, "plan");
  if (retry.kind !== "plan") return;
  assert.notEqual(retry.attempt.id, first.attempt.id);
  assert.equal(retry.attempt.lineage.relation, "retry-of");
  assert.equal(retry.attempt.lineage.predecessor_attempt_id, first.attempt.id);
  assert.equal(retry.plan.id, first.plan.id);

  time.instant = "2026-07-19T12:02:00.000Z";
  const replay = await gateway.invoke(request({ operationId: "operation:runtime-canonical-test:3", mode: "immediate" }));
  assert.equal(replay.kind, "plan");
  if (replay.kind !== "plan") return;
  assert.equal(replay.attempt.lineage.relation, "replay-of");
  const attempts = await store.listExecutionAttempts(first.plan.id);
  const revalidations = await store.listPlanRevalidations(first.plan.id);
  assert.equal(attempts.length, 3);
  assert.equal(revalidations.length, 2);
  assert.equal(adapter.calls.length, 3);
  emitTask2217Evidence("idempotency-retry-replay", {
    intent_id: first.intent.id,
    plan_id: first.plan.id,
    duplicate_attempt_id: duplicate.attempt.id,
    duplicate_redispatched: duplicate.adapterOutcome !== null,
    attempt_ids: attempts.map(({ id }) => id),
    attempt_lineage: attempts.map(({ id, lineage }) => ({ id, lineage })),
    revalidation_ids: revalidations.map(({ id }) => id),
    adapter_dispatch_count: adapter.calls.length,
  });
  await store.close();
});

test("concurrent duplicate deliveries share one durable attempt and one provider dispatch", async () => {
  const store = await openCanonical();
  const time = { instant: AT };
  const adapter = fakeAdapter(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { admission: "acknowledged", response: { text: "one-dispatch" } };
  });
  const gateway = createLocalInvocationGateway(gatewayOptions(store, adapter, time));
  const [first, second] = await Promise.all([gateway.invoke(request()), gateway.invoke(request())]);
  assert.equal(first.kind, "plan");
  assert.equal(second.kind, "plan");
  if (first.kind !== "plan" || second.kind !== "plan") return;
  assert.equal(adapter.calls.length, 1);
  assert.equal(second.attempt.id, first.attempt.id);
  assert.equal(first.outcome.id, second.outcome.id);
  assert.equal((await store.listExecutionAttempts(first.plan.id)).length, 1);

  const [retryFirst, retryDuplicate] = await Promise.all([
    gateway.invoke(request({ mode: "retry", operationId: "operation:runtime-canonical-test:retry" })),
    gateway.invoke(request({ mode: "retry", operationId: "operation:runtime-canonical-test:retry" })),
  ]);
  assert.equal(retryFirst.kind, "plan");
  assert.equal(retryDuplicate.kind, "plan");
  if (retryFirst.kind !== "plan" || retryDuplicate.kind !== "plan") return;
  assert.equal(retryDuplicate.attempt.id, retryFirst.attempt.id);
  assert.equal(adapter.calls.length, 2);
  assert.equal((await store.listExecutionAttempts(first.plan.id)).length, 2);
  await store.close();
});

test("gateway treats reordered tool catalogs as the same invocation input", async () => {
  const store = await openCanonical();
  const time = { instant: AT };
  const adapter = fakeAdapter({ admission: "acknowledged", response: { text: "same-input" } });
  const gateway = createLocalInvocationGateway(gatewayOptions(store, adapter, time));
  const tools = [
    { type: "function", function: { name: "zeta", parameters: { type: "object" } } },
    { type: "function", function: { name: "alpha", parameters: { type: "object" } } },
  ];
  const first = await gateway.invoke(request({ tools, operationId: "operation:tool-order" }));
  const second = await gateway.invoke(request({
    tools: [tools[1], tools[0]],
    operationId: "operation:tool-order",
  }));
  assert.equal(first.kind, "plan");
  assert.equal(second.kind, "plan");
  if (first.kind !== "plan" || second.kind !== "plan") return;
  assert.equal(second.replayed, true);
  assert.equal(second.attempt.id, first.attempt.id);
  assert.equal(adapter.calls.length, 1);
  await store.close();
});

test("gateway rejects a caller-supplied digest that omits the tool catalog", async () => {
  const store = await openCanonical();
  const adapter = fakeAdapter({ admission: "acknowledged", response: { text: "must-not-dispatch" } });
  const gateway = createLocalInvocationGateway(gatewayOptions(store, adapter, { instant: AT }));
  await assert.rejects(
    gateway.invoke(request({
      tools: [{ type: "function", function: { name: "search" } }],
      inputDigest: `sha256:${"0".repeat(64)}`,
    })),
    /invocation-input-digest-mismatch/,
  );
  assert.equal(adapter.calls.length, 0);
  await store.close();
});

test("catalog mutation forces an immutable replacement plan before retry", async () => {
  const store = await openCanonical();
  const time = { instant: AT };
  const adapter = fakeAdapter({ admission: "acknowledged", response: { text: "ok" } });
  const gateway = createLocalInvocationGateway(gatewayOptions(store, adapter, time));
  const first = await gateway.invoke(request());
  assert.equal(first.kind, "plan");
  if (first.kind !== "plan") return;

  const prior = await store.getCatalogRecord(
    (await store.listCatalogRecords({ recordId: "policy:narada-defaults" }))[0].id,
  );
  assert.ok(prior);
  if (!prior || prior.document.schema !== "narada.invokable-intelligence.policy.v1") return;
  const revisedDocument = {
    ...prior.document,
    revision: 2,
    rules: [{ type: "default-option" as const, option: "thinking", value: "medium" }],
  };
  const revised = {
    ...prior,
    id: `${prior.id}:r2`,
    revision: 2,
    source: { ...prior.source, revision: "2", digest: canonicalSha256(revisedDocument) },
    document: revisedDocument,
  };
  await store.loadCatalogSeed({
    schema: "narada.invokable-intelligence.canonical-catalog-seed.v1",
    id: "catalog-seed:defaults-r2",
    created_at: AT,
    records: [revised],
    residuals: [],
  });
  time.instant = "2026-07-19T12:01:00.000Z";
  const retry = await gateway.invoke(request({ operationId: "operation:runtime-canonical-test:2", mode: "retry" }));
  assert.equal(retry.kind, "plan");
  if (retry.kind !== "plan") return;
  assert.notEqual(retry.plan.id, first.plan.id);
  assert.equal(retry.plan.snapshot.lineage.relation, "replan-of");
  assert.equal(retry.plan.snapshot.lineage.predecessor_plan_id, first.plan.id);
  assert.equal(retry.plan.options.thinking, "medium");
  const plans = await store.listPlansByIntent(first.intent.id);
  const replacementRevalidations = await store.listPlanRevalidations(first.plan.id);
  assert.equal(plans.length, 2);
  assert.equal(replacementRevalidations[0].replacement_plan_id, retry.plan.id);
  emitTask2217Evidence("catalog-change-replan", {
    intent_id: first.intent.id,
    predecessor_plan_id: first.plan.id,
    replacement_plan_id: retry.plan.id,
    replacement_lineage: retry.plan.snapshot.lineage,
    durable_plan_ids: plans.map(({ id }) => id),
    revalidation_ids: replacementRevalidations.map(({ id }) => id),
  });
  await store.close();
});

test("stale plan refuses before dispatch when the caller prohibits replanning", async () => {
  const store = await openCanonical();
  const time = { instant: AT };
  const adapter = fakeAdapter({ admission: "acknowledged", response: {} });
  const gateway = createLocalInvocationGateway(gatewayOptions(store, adapter, time));
  const first = await gateway.invoke(request());
  assert.equal(first.kind, "plan");
  if (first.kind !== "plan") return;
  time.instant = "2026-07-20T00:00:00.000Z";
  const refused = await gateway.invoke(request({
    operationId: "operation:runtime-expired",
    mode: "retry",
    allowReplan: false,
  }));
  assert.equal(refused.kind, "refusal");
  if (refused.kind !== "refusal") return;
  assert.equal(refused.refusal.reason_code, "stale-plan");
  assert.equal(adapter.calls.length, 1);
  emitTask2217Evidence("stale-plan-pre-dispatch-refusal", {
    intent_id: first.intent.id,
    plan_id: first.plan.id,
    refusal_id: refused.refusal.id,
    outcome_id: refused.outcome.id,
    reason_code: refused.refusal.reason_code,
    initial_dispatch_count: 1,
    final_dispatch_count: adapter.calls.length,
  });
  await store.close();
});

test("acknowledgment uncertainty is a terminal outcome distinct from provider failure", async () => {
  const uncertainStore = await openCanonical();
  const uncertainAdapter = fakeAdapter({ error: { code: "ack-timeout", message: "no acknowledgment" } });
  const uncertainGateway = createLocalInvocationGateway(gatewayOptions(uncertainStore, uncertainAdapter, { instant: AT }));
  const uncertain = await uncertainGateway.invoke(request({ intentId: "intent:uncertain", operationId: "operation:uncertain" }));
  assert.equal(uncertain.kind, "plan");
  if (uncertain.kind !== "plan") return;
  assert.equal(uncertain.outcome.kind, "admission-unknown");
  assert.equal(uncertain.outcome.admission_acknowledged, undefined);
  assert.equal(uncertain.result, null);
  assert.equal(
    uncertain.observations.find(({ kind }) => kind === "transport-acknowledgment")?.status,
    "uncertain",
  );
  await uncertainStore.close();

  const failedStore = await openCanonical();
  const failedAdapter = fakeAdapter({
    admission: "acknowledged",
    error: { code: "provider-500", message: "upstream failure", retryable: true },
  });
  const failedGateway = createLocalInvocationGateway(gatewayOptions(failedStore, failedAdapter, { instant: AT }));
  const failed = await failedGateway.invoke(request({ intentId: "intent:failed", operationId: "operation:failed" }));
  assert.equal(failed.kind, "plan");
  if (failed.kind !== "plan") return;
  assert.equal(failed.outcome.kind, "provider-failure");
  assert.equal(failed.outcome.admission_acknowledged, true);
  assert.equal(failed.result, null);
  emitTask2217Evidence("acknowledgment-vs-provider-failure", {
    unknown_admission: {
      intent_id: uncertain.intent.id,
      attempt_id: uncertain.attempt.id,
      outcome_id: uncertain.outcome.id,
      outcome_kind: uncertain.outcome.kind,
      admission_acknowledged: null,
      observation_ids: uncertain.observations.map(({ id }) => id),
    },
    provider_failure: {
      intent_id: failed.intent.id,
      attempt_id: failed.attempt.id,
      outcome_id: failed.outcome.id,
      outcome_kind: failed.outcome.kind,
      admission_acknowledged: failed.outcome.admission_acknowledged,
    },
  });
  await failedStore.close();
});

test("restart preserves idempotent readback and a later retry appends a new attempt", async () => {
  const dbPath = join(process.cwd(), `.tmp-canonical-gateway-${process.pid}.db`);
  await rm(dbPath, { force: true });
  try {
    const time = { instant: AT };
    const firstStore = await SqliteRegistryStore.open(dbPath);
    await firstStore.loadCatalogSeed(buildCanonicalLocalTestSeed());
    const firstAdapter = fakeAdapter({ admission: "acknowledged", response: { text: "ok" } });
    const firstGateway = createLocalInvocationGateway(gatewayOptions(firstStore, firstAdapter, time));
    const initial = await firstGateway.invoke(request());
    assert.equal(initial.kind, "plan");
    if (initial.kind !== "plan") return;
    await firstStore.close();

    const reopened = await SqliteRegistryStore.open(dbPath);
    const afterAdapter = fakeAdapter({ admission: "acknowledged", response: { text: "ok-again" } });
    const afterGateway = createLocalInvocationGateway(gatewayOptions(reopened, afterAdapter, time));
    const readback = await afterGateway.invoke(request());
    assert.equal(readback.kind, "plan");
    if (readback.kind !== "plan") return;
    assert.equal(readback.replayed, true);
    assert.equal(afterAdapter.calls.length, 0);

    time.instant = "2026-07-19T12:01:00.000Z";
    const retry = await afterGateway.invoke(request({ operationId: "operation:restart:retry", mode: "retry" }));
    assert.equal(retry.kind, "plan");
    if (retry.kind !== "plan") return;
    assert.equal(retry.attempt.lineage.predecessor_attempt_id, initial.attempt.id);
    assert.equal(afterAdapter.calls.length, 1);
    const durableAttempts = await reopened.listExecutionAttempts(initial.plan.id);
    assert.equal(durableAttempts.length, 2);
    emitTask2217Evidence("restart-replay-retry", {
      intent_id: initial.intent.id,
      plan_id: initial.plan.id,
      initial_attempt_id: initial.attempt.id,
      restart_readback_attempt_id: readback.attempt.id,
      restart_redispatch_count: 0,
      retry_attempt_id: retry.attempt.id,
      retry_lineage: retry.attempt.lineage,
      post_restart_dispatch_count: afterAdapter.calls.length,
      durable_attempt_ids: durableAttempts.map(({ id }) => id),
    });
    await reopened.close();
  } finally {
    await rm(dbPath, { force: true });
  }
});

test("local live e2e dispatches success, refuses pre-provider, and reads linked canonical evidence back", async () => {
  const requests: unknown[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      requests.push(JSON.parse(body));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ answer: "live-ok", usage: { prompt_tokens: 4, completion_tokens: 2 } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    const store = await openCanonical({ endpointBaseUrl: `http://127.0.0.1:${port}` });
    const adapter: InvocationAdapter = {
      async invoke({ plan, model, offering, endpoint, adapter: plannedAdapter, messages, credential }) {
        assert.equal(model.id, plan.selected.model.id);
        assert.equal(offering.id, plan.route.offering.id);
        assert.equal(endpoint.id, plan.selected.endpoint.id);
        assert.equal(plannedAdapter.id, plan.selected.adapter.id);
        assert.deepEqual(plannedAdapter.protocol, { family: "narada", operation: "invoke", version: "1" });
        assert.equal(credential?.id, plan.selected.credential?.id);
        assert.equal(endpoint.address.kind, "url");
        if (endpoint.address.kind !== "url") throw new Error("planned endpoint is not an HTTP URL");
        const response = await fetch(endpoint.address.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: offering.invocation_model_key, route: plan.route.route_id, messages }),
        });
        const payload = await response.json() as { usage: { prompt_tokens: number; completion_tokens: number } };
        return {
          admission: "acknowledged",
          response: payload,
          usage: { input_tokens: payload.usage.prompt_tokens, output_tokens: payload.usage.completion_tokens },
          providerRequestRef: "provider-request:local-live",
        };
      },
    };
    const gateway = createLocalInvocationGateway(gatewayOptions(store, adapter, { instant: AT }));
    const result = await gateway.invoke(request({ intentId: "intent:local-live", operationId: "operation:local-live" }));
    assert.equal(result.kind, "plan");
    if (result.kind !== "plan") return;
    assert.equal(result.outcome.kind, "success");
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0], {
      model: "kimi-k2-thinking",
      route: IDS.route,
      messages: [{ role: "user", content: "ping" }],
    });
    const successEvidence = await store.listInvocationAuditEvidence(result.attempt.id);
    assert.equal(successEvidence.length, 4);
    const successSubjectIds = new Set(successEvidence.flatMap(({ subjects }) => subjects.map(({ id }) => id)));
    for (const id of [result.intent.id, result.plan.id, result.attempt.id, result.result?.id, result.outcome.id]) {
      assert.ok(id && successSubjectIds.has(id), `live success evidence must link ${id}`);
    }
    const successTelemetry = await store.listInvocationTelemetry(result.attempt.id);
    assert.equal(successTelemetry[0].input_tokens, 4);

    const refusal = await gateway.invoke(request({
      intentId: "intent:local-live:refusal",
      operationId: "operation:local-live:refusal",
      principal: undefined,
    }));
    assert.equal(refusal.kind, "refusal");
    if (refusal.kind !== "refusal") return;
    assert.equal(refusal.refusal.reason_code, "principal-required");
    assert.equal(refusal.outcome.kind, "pre-invocation-refusal");
    assert.equal(refusal.outcome.attempt_id, undefined);
    assert.equal(requests.length, 1, "typed refusal must occur before the HTTP provider boundary");
    const refusalEvidence = await store.listInvocationAuditEvidence(refusal.intent.id);
    assert.equal(refusalEvidence.length, 1);
    const refusalSubjectIds = new Set(refusalEvidence.flatMap(({ subjects }) => subjects.map(({ id }) => id)));
    assert.ok(refusalSubjectIds.has(refusal.intent.id));
    assert.ok(refusalSubjectIds.has(refusal.outcome.id));
    const refusalOutcomes = await store.listTerminalOutcomesByIntent(refusal.intent.id);
    assert.equal(refusalOutcomes.length, 1);
    emitTask2217Evidence("local-http-success-and-principal-refusal", {
      provider_http_request_count: requests.length,
      success: {
        intent_id: result.intent.id,
        plan_id: result.plan.id,
        attempt_id: result.attempt.id,
        result_id: result.result?.id,
        outcome_id: result.outcome.id,
        outcome_kind: result.outcome.kind,
        admitted_evidence_ids: successEvidence.map(({ id }) => id),
        linked_subject_ids: [...successSubjectIds].sort(),
        telemetry_ids: successTelemetry.map(({ id }) => id),
      },
      refusal: {
        intent_id: refusal.intent.id,
        refusal_id: refusal.refusal.id,
        outcome_id: refusal.outcome.id,
        outcome_kind: refusal.outcome.kind,
        attempt_id: null,
        reason_code: refusal.refusal.reason_code,
        admitted_evidence_ids: refusalEvidence.map(({ id }) => id),
        linked_subject_ids: [...refusalSubjectIds].sort(),
        durable_terminal_outcome_ids: refusalOutcomes.map(({ id }) => id),
      },
    });
    await store.close();
  } finally {
    server.close();
  }
});
