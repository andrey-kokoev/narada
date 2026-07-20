import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import test from "node:test";

import {
  CANONICAL_LOCAL_TEST_IDS,
  buildCanonicalLocalTestSeed,
  canonicalTestClock,
  feasibleTopologyObservations,
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
  assert.equal((await store.listAttempts(result.plan.id)).length, 0, "legacy attempt table is not an execution authority");
  assert.equal((await store.listEvidence(result.attempt.id)).length, 0, "legacy evidence table is not written");
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
  revisedOffering.source.digest = `sha256:${"f".repeat(64)}`;
  revisedOffering.document.invocation_model_key = "newer-model-key-not-in-plan";

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
  assert.equal((await store.listTerminalOutcomesByIntent(result.intent.id)).length, 1);
  assert.equal((await store.listInvocationAuditEvidence(result.intent.id)).length, 1);
  time.instant = "2026-07-19T12:10:00.000Z";
  const repeated = await gateway.invoke(refusalRequest);
  assert.equal(repeated.kind, "refusal");
  if (repeated.kind !== "refusal") return;
  assert.equal(repeated.refusal.id, result.refusal.id);
  assert.equal(repeated.outcome.id, result.outcome.id);
  assert.equal((await store.listRefusalsByIntent(result.intent.id)).length, 1);
  assert.equal((await store.listTerminalOutcomesByIntent(result.intent.id)).length, 1);
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
  assert.equal((await store.listExecutionAttempts(first.plan.id)).length, 3);
  assert.equal((await store.listPlanRevalidations(first.plan.id)).length, 2);
  assert.equal(adapter.calls.length, 3);
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
  const revised = {
    ...prior,
    id: `${prior.id}:r2`,
    revision: 2,
    source: { ...prior.source, revision: "2", digest: `sha256:${"e".repeat(64)}` },
    document: {
      ...prior.document,
      revision: 2,
      rules: [{ type: "default-option" as const, option: "thinking", value: "medium" }],
    },
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
  assert.equal((await store.listPlansByIntent(first.intent.id)).length, 2);
  assert.equal((await store.listPlanRevalidations(first.plan.id))[0].replacement_plan_id, retry.plan.id);
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
    assert.equal((await reopened.listExecutionAttempts(initial.plan.id)).length, 2);
    await reopened.close();
  } finally {
    await rm(dbPath, { force: true });
  }
});

test("local live e2e dispatches through the planned adapter and reads canonical evidence back", async () => {
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
    assert.equal((await store.listInvocationAuditEvidence(result.attempt.id)).length, 4);
    assert.equal((await store.listInvocationTelemetry(result.attempt.id))[0].input_tokens, 4);
    await store.close();
  } finally {
    server.close();
  }
});
