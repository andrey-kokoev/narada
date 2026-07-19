/**
 * Shared conformance suite. Every registry adapter runs the same tests;
 * the suite is exported so future adapters (e.g. a real D1 binding in
 * worker integration tests) can register it too.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { CLOUDFLARE_KIMI, fixtureBundle } from "@narada2/invokable-intelligence-contract";
import type { CapabilityAssertion, InvocationAttempt, InvocationEvidence, InvocationPlan } from "@narada2/invokable-intelligence-contract";

import { RegistryError } from "./store.js";
import type { IntelligenceRegistryStore } from "./store.js";

export interface ConformanceTarget {
  store: IntelligenceRegistryStore;
  cleanup: () => Promise<void> | void;
}

const TEST_PLAN: InvocationPlan = {
  schema: "narada.invokable-intelligence.invocation-plan.v1",
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
        assert.equal(await store.schemaVersion(), 1);
        assert.equal(await store.migrate(), 1);
        assert.equal(await store.schemaVersion(), 1);
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
          ["driven-by:adapter:workers-ai-binding", "owned-by:inference-provider:cloudflare-workers-ai", "serves:model:kimi-k2-thinking"],
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

      await t.test("invocation chain persists linked plan, attempt transitions, evidence, and refusals", async () => {
        await store.recordPlan(TEST_PLAN);
        assert.equal((await store.getPlanByIntent(TEST_PLAN.intent_id))?.id, TEST_PLAN.id);

        const started: InvocationAttempt = {
          schema: "narada.invokable-intelligence.invocation-attempt.v1",
          id: "attempt:conformance-001",
          plan_id: TEST_PLAN.id,
          state: "started",
          started_at: "2026-07-19T00:00:02Z",
        };
        await store.recordAttempt(started);
        await store.recordAttempt({ ...started, state: "succeeded", ended_at: "2026-07-19T00:00:03Z" });
        const attempts = await store.listAttempts(TEST_PLAN.id);
        assert.equal(attempts.length, 1);
        assert.equal(attempts[0].state, "succeeded");

        const evidence: InvocationEvidence = {
          schema: "narada.invokable-intelligence.invocation-evidence.v1",
          id: "evidence:conformance-001",
          attempt_id: started.id,
          recorded_at: "2026-07-19T00:00:04Z",
          usage: { input_tokens: 10, output_tokens: 5, latency_ms: 42 },
          evidence: [],
        };
        await store.recordEvidence(evidence);
        assert.equal((await store.listEvidence(started.id)).length, 1);

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
