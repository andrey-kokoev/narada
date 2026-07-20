/**
 * Shared conformance suite. Every registry adapter runs the same tests;
 * the suite is exported so future adapters (e.g. a real D1 binding in
 * worker integration tests) can register it too.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { CLOUDFLARE_KIMI, fixtureBundle } from "@narada2/invokable-intelligence-contract";
import type {
  CapabilityAssertion,
  InvocationAuditEvidence,
  InvocationExecutionAttempt,
  InvocationExecutionTransition,
  InvocationObservation,
  InvocationOperationalTelemetry,
  InvocationPlan,
  InvocationResultEnvelope,
  InvocationTerminalOutcome,
  PlanRevalidationEvidence,
} from "@narada2/invokable-intelligence-contract";

import { RegistryError } from "./store.js";
import type { IntelligenceRegistryStore } from "./store.js";
import { REGISTRY_SCHEMA_VERSION } from "./schema.js";

export interface ConformanceTarget {
  store: IntelligenceRegistryStore;
  cleanup: () => Promise<void> | void;
}

const TEST_PLAN: InvocationPlan = {
  schema: "narada.invokable-intelligence.invocation-plan.v2",
  id: "plan:conformance-001",
  intent_id: "intent:operator-chat-001",
  created_at: "2026-07-19T00:00:01Z",
  resolver_version: "conformance-resolver-0",
  selected: {
    model: { kind: "model", id: "model:kimi-k2-thinking" },
    model_provider: { kind: "model-provider", id: "model-provider:kimi" },
    inference_provider: { kind: "inference-provider", id: "inference-provider:cloudflare-workers-ai" },
    endpoint: { kind: "inference-endpoint", id: "inference-endpoint:cf-workers-ai-default" },
    adapter: { kind: "adapter", id: "adapter:workers-ai-binding" },
    credential: { kind: "credential-locator", id: "credential-locator:cf-account-token" },
  },
  route: {
    offering: { kind: "model-offering", id: "model-offering:kimi-via-cloudflare" },
    route_id: "route:kimi-cloudflare",
    composition_digest: `sha256:${"a".repeat(64)}`,
    topology_id: "topology:cloudflare-workers-ai",
    endpoint: { kind: "inference-endpoint", id: "inference-endpoint:cf-workers-ai-default" },
    adapter: { kind: "adapter", id: "adapter:workers-ai-binding" },
    execution_loci: [{ kind: "execution-locus", id: "execution-locus:cloudflare-carrier" }],
    account_ref: "account:cloudflare",
    grant_refs: ["grant:andrey"],
    credential: { kind: "credential-locator", id: "credential-locator:cf-account-token" },
  },
  access: {
    account_id: "account:cloudflare",
    credential_binding_id: "credential-binding:cloudflare",
    grant_id: "grant:andrey",
    entitlement_id: "entitlement:workers-ai",
    quota_id: "quota:workers-ai",
    budget_id: "budget:narada",
    governance_requirement_ids: ["governance:narada"],
  },
  authority_provenance: { schema: "narada.invokable-intelligence.authority-resolution-provenance.v1", decisions: [] },
  snapshot: {
    schema: "narada.invokable-intelligence.plan-decision-snapshot.v1",
    plan_id: "plan:conformance-001",
    intent_id: "intent:operator-chat-001",
    resolved_at: "2026-07-19T00:00:01Z",
    clock: { source: "test-clock", authority_ref: "test:clock", instant: "2026-07-19T00:00:01Z", timezone: "UTC", local: { date: "2026-07-19", time: "00:00:01", weekday: 0 } },
    resolver_version: "conformance-resolver-0",
    digests: { normalized_resolver_input: `sha256:${"a".repeat(64)}`, catalog: `sha256:${"b".repeat(64)}`, policy: `sha256:${"c".repeat(64)}`, assertions: `sha256:${"d".repeat(64)}`, topology: `sha256:${"e".repeat(64)}`, access: `sha256:${"f".repeat(64)}` },
    snapshot_digest: `sha256:${"1".repeat(64)}`,
    valid_until: "2026-07-19T00:05:01Z",
    revalidation_triggers: ["before-retry"],
    referenced_revisions: [{ kind: "catalog", record_id: "catalog:test", revision: "1", digest: `sha256:${"2".repeat(64)}`, immutable_ref: "catalog-record:test" }],
    lineage: { relation: "initial" },
  },
  options: { thinking: "low" },
  provenance: {
    applied_constraints: [{ source: "policy:thoughts-target-hard", effect: "require credential/feasible" }],
    applied_preferences: [{ source: "policy:andrey-user-preferences", effect: "prefer model:kimi-k2-thinking" }],
    applied_defaults: [{ source: "policy:thoughts-target-defaults", effect: "thinking=low" }],
    rejected_candidates: [],
  },
};

export function defineRegistryConformanceSuite(label: string, makeTarget: () => Promise<ConformanceTarget>): void {
  void test(`registry conformance [${label}]`, async (t) => {
    const target = await makeTarget();
    const { store } = target;
    try {
      await t.test("migration is versioned, idempotent, and safe on an initialized store", async () => {
        assert.equal(store.schemaVersion !== undefined, true);
        assert.equal(await store.schemaVersion(), REGISTRY_SCHEMA_VERSION);
        assert.equal(await store.migrate(), REGISTRY_SCHEMA_VERSION);
        assert.equal(await store.schemaVersion(), REGISTRY_SCHEMA_VERSION);
      });

      await t.test("bundle loads and resources read back deterministically", async () => {
        await store.loadBundle(fixtureBundle(CLOUDFLARE_KIMI));
        const resources = await store.listResources();
        assert.equal(resources.length, CLOUDFLARE_KIMI.resources.length);
        const ids = resources.map((r) => r.id);
        assert.deepEqual(ids, [...ids].sort());
        assert.equal((await store.listResources({ kind: "model" })).length, 1);
        const model = await store.getResource("model:kimi-k2-thinking");
        assert.equal(model?.schema, "narada.invokable-intelligence.model.v1");
        assert.equal(await store.getResource("model:does-not-exist"), null);
      });

      await t.test("typed relations are derived from resource refs", async () => {
        const relations = await store.listRelations("inference-endpoint:cf-workers-ai-default");
        assert.deepEqual(
          relations.map((r) => `${r.relation}:${r.to_id}`),
          [
            "authenticated-by:credential-locator:cf-account-token",
            "driven-by:adapter:workers-ai-binding",
            "owned-by:inference-provider:cloudflare-workers-ai",
            "serves:model:kimi-k2-thinking",
          ],
        );
      });

      await t.test("assertion filters work and loci never merge implicitly", async () => {
        assert.equal((await store.listAssertions({ family: "thinking" })).length, 1);
        assert.equal((await store.listAssertions({ locus: "global" })).length, 2);
        assert.equal((await store.listAssertions({ locus: "host-site" })).length, 1);
        assert.equal((await store.listAssertions({ locus: "host-site", siteId: "site:andrey-pc" })).length, 1);
        assert.equal((await store.listAssertions({ locus: "user-site" })).length, 0);
      });

      await t.test("policies read by locus/site/kind with derived bindings", async () => {
        assert.equal((await store.listPolicies({ locus: "target-site" })).length, 2);
        assert.equal((await store.listPolicies({ locus: "user-site" })).length, 1);
        assert.equal((await store.listPolicies({ kind: "eligibility" })).length, 1);
        const bindings = await store.listPolicyBindings("policy:andrey-user-preferences");
        assert.deepEqual(bindings.map((b) => b.subject_id), ["model:kimi-k2-thinking"]);
      });

      await t.test("supersession is atomic and history-preserving", async () => {
        const original = (await store.listAssertions({ family: "thinking" }))[0];
        const next: CapabilityAssertion = {
          ...original,
          id: "assert:kimi-k2-thinking-levels-v2",
          confidence: 0.95,
        };
        await store.supersedeAssertion(original.id, next);
        const live = await store.listAssertions({ family: "thinking" });
        assert.deepEqual(live.map((a) => a.id), [next.id]);
        const withHistory = await store.listAssertions({ family: "thinking", includeSuperseded: true });
        assert.deepEqual(withHistory.map((a) => a.id).sort(), [original.id, next.id].sort());
        await assert.rejects(store.supersedeAssertion(original.id, { ...next, id: "assert:another" }), (error: unknown) => {
          assert.ok(error instanceof RegistryError);
          assert.equal(error.code, "supersede-conflict");
          return true;
        });
      });

      await t.test("v2 invocation lifecycle remains distinct, immutable, linked, and queryable", async () => {
        await store.recordPlan(TEST_PLAN);
        await store.recordPlanSnapshot(TEST_PLAN.snapshot);
        assert.equal((await store.getPlanByIntent(TEST_PLAN.intent_id))?.id, TEST_PLAN.id);
        assert.equal((await store.getPlanSnapshot(TEST_PLAN.id))?.snapshot_digest, TEST_PLAN.snapshot.snapshot_digest);

        const revalidation: PlanRevalidationEvidence = {
          schema: "narada.invokable-intelligence.plan-revalidation-evidence.v1",
          id: "revalidation:conformance-001",
          intent_id: TEST_PLAN.intent_id,
          plan_id: TEST_PLAN.id,
          evaluated_at: "2026-07-19T00:00:02Z",
          mode: "retry",
          decision: "revalidated",
          reasons: [],
          prior_snapshot_digest: TEST_PLAN.snapshot.snapshot_digest,
          compared_digests: TEST_PLAN.snapshot.digests,
          clock_authority_ref: "test:clock",
        };
        await store.recordPlanRevalidation(revalidation);
        assert.equal((await store.listPlanRevalidations(TEST_PLAN.id))[0].decision, "revalidated");

        const attempt: InvocationExecutionAttempt = {
          schema: "narada.invokable-intelligence.execution-attempt.v1",
          id: "attempt:conformance-001",
          intent_id: TEST_PLAN.intent_id,
          plan_id: TEST_PLAN.id,
          state: "created",
          created_at: "2026-07-19T00:00:02Z",
          lineage: { relation: "initial" },
        };
        await store.recordExecutionAttempt(attempt);
        const attempts = await store.listExecutionAttempts(TEST_PLAN.id);
        assert.equal(attempts.length, 1);
        assert.equal(attempts[0].state, "created");
        await assert.rejects(
          store.recordExecutionAttempt({ ...attempt, created_at: "2026-07-19T00:00:03Z" }),
          (error: unknown) => error instanceof RegistryError && error.code === "immutable-record-conflict",
        );

        const transitions: InvocationExecutionTransition[] = [
          {
            schema: "narada.invokable-intelligence.execution-transition.v1",
            id: "transition:conformance-dispatching-001",
            attempt_id: attempt.id,
            sequence: 1,
            previous_state: "created",
            state: "dispatching",
            transitioned_at: "2026-07-19T00:00:02Z",
          },
          {
            schema: "narada.invokable-intelligence.execution-transition.v1",
            id: "transition:conformance-provider-pending-001",
            attempt_id: attempt.id,
            sequence: 2,
            previous_state: "dispatching",
            state: "provider-pending",
            transitioned_at: "2026-07-19T00:00:03Z",
          },
        ];
        for (const transition of transitions) await store.recordExecutionTransition(transition);
        assert.deepEqual((await store.listExecutionTransitions(attempt.id)).map(({ state }) => state), ["dispatching", "provider-pending"]);

        const result: InvocationResultEnvelope = {
          schema: "narada.invokable-intelligence.result-envelope.v1",
          id: "result:conformance-001",
          attempt_id: attempt.id,
          plan_id: TEST_PLAN.id,
          produced_at: "2026-07-19T00:00:03Z",
          kind: "provider-response",
          payload: {
            digest: `sha256:${"3".repeat(64)}`,
            media_type: "application/json",
            classification: "internal",
            retention: { mode: "never-retain", policy_ref: "policy:never-retain", residency: "site:test" },
            access: { allowed_principals: ["principal:test"], capability_refs: ["capability:result-read"] },
            disposition: "never-retained",
            tombstone: { disposed_at: "2026-07-19T00:00:03Z", reason_code: "test-policy", evidence_ref: "evidence:test-policy" },
          },
        };
        await store.recordResultEnvelope(result);
        assert.equal((await store.listResultEnvelopes(attempt.id))[0].id, result.id);

        const outcome: InvocationTerminalOutcome = {
          schema: "narada.invokable-intelligence.terminal-outcome.v1",
          id: "outcome:conformance-001",
          attempt_id: attempt.id,
          intent_id: TEST_PLAN.intent_id,
          plan_id: TEST_PLAN.id,
          kind: "success",
          terminal_at: "2026-07-19T00:00:04Z",
          result_id: result.id,
          admission_acknowledged: true,
        };
        await store.recordTerminalOutcome(outcome);
        assert.equal((await store.getTerminalOutcomeByAttempt(attempt.id))?.kind, "success");
        assert.equal((await store.getTerminalOutcome(outcome.id))?.attempt_id, attempt.id);
        await store.recordExecutionTransition({
          schema: "narada.invokable-intelligence.execution-transition.v1",
          id: "transition:conformance-terminal-001",
          attempt_id: attempt.id,
          sequence: 3,
          previous_state: "provider-pending",
          state: "terminal",
          transitioned_at: outcome.terminal_at,
        });
        assert.equal((await store.listExecutionTransitions(attempt.id)).at(-1)?.state, "terminal");

        const observation: InvocationObservation = {
          schema: "narada.invokable-intelligence.observation.v1",
          id: "observation:conformance-001",
          subject: { kind: "attempt", id: attempt.id },
          kind: "transport-acknowledgment",
          observed_at: "2026-07-19T00:00:04Z",
          status: "observed",
          provenance: { source: "probe", recorded_at: "2026-07-19T00:00:04Z" },
          evidence_refs: [{ kind: "test", ref: "registry-conformance" }],
        };
        await store.recordInvocationObservation(observation);
        assert.equal((await store.listInvocationObservations(attempt.id))[0].status, "observed");

        const audit: InvocationAuditEvidence = {
          schema: "narada.invokable-intelligence.audit-evidence.v1",
          id: "audit-evidence:conformance-001",
          subjects: [{ kind: "attempt", id: attempt.id }, { kind: "outcome", id: outcome.id }],
          evidence_type: "terminal-outcome",
          admitted_at: "2026-07-19T00:00:04Z",
          admitted_by: "registry-conformance",
          admission_ref: "policy:registry-conformance",
          provenance: { source: "probe", recorded_at: "2026-07-19T00:00:04Z", actor: "registry-conformance" },
          integrity_digest: `sha256:${"4".repeat(64)}`,
          source_observation_ids: [observation.id],
          evidence_refs: [{ kind: "test", ref: "registry-conformance" }],
        };
        await store.recordInvocationAuditEvidence(audit);
        assert.equal((await store.listInvocationAuditEvidence(attempt.id))[0].id, audit.id);

        const telemetry: InvocationOperationalTelemetry = {
          schema: "narada.invokable-intelligence.telemetry.v1",
          id: "telemetry:conformance-001",
          attempt_id: attempt.id,
          recorded_at: "2026-07-19T00:00:04Z",
          input_tokens: 10,
          output_tokens: 5,
          latency_ms: 42,
        };
        await store.recordInvocationTelemetry(telemetry);
        assert.equal((await store.listInvocationTelemetry(attempt.id))[0].input_tokens, 10);

        await store.recordRefusal({
          schema: "narada.invokable-intelligence.invocation-refusal.v1",
          id: "refusal:conformance-001",
          intent_id: "intent:unrelated-999",
          created_at: "2026-07-19T00:00:05Z",
          resolver_version: "conformance-resolver-0",
          reason_code: "no-candidates",
          explanation: "conformance refusal",
          rejected_candidates: [],
        });
        assert.equal((await store.getRefusalByIntent("intent:unrelated-999"))?.reason_code, "no-candidates");
        assert.equal((await store.getRefusal("refusal:conformance-001"))?.intent_id, "intent:unrelated-999");
        assert.equal((await store.listRefusalsByIntent("intent:unrelated-999")).length, 1);
        assert.equal((await store.listAttempts(TEST_PLAN.id)).length, 0);
        assert.equal((await store.listEvidence(attempt.id)).length, 0);
      });

      await t.test("invalid writes are rejected with contract errors", async () => {
        await assert.rejects(
          store.putResource({
            schema: "narada.invokable-intelligence.model.v1",
            id: "model:BAD ID!",
            provider: { kind: "model-provider", id: "model-provider:kimi" },
          }),
          (error: unknown) => {
            assert.ok(error instanceof RegistryError);
            assert.equal(error.code, "invalid-record");
            assert.ok(error.contractErrors && error.contractErrors.length > 0);
            return true;
          },
        );
      });
    } finally {
      await target.cleanup();
    }
  });
}
