import assert from "node:assert/strict";
import test from "node:test";

import {
  BATCH_OFFPEAK,
  CLOUDFLARE_KIMI,
  fixtureBundle,
} from "@narada2/invokable-intelligence-contract";
import type { CapabilityAssertion, FixtureBundle, InvocationIntent, InvocationPlan } from "@narada2/invokable-intelligence-contract";
import { SqliteRegistryStore } from "@narada2/invokable-intelligence-registry";
import type { IntelligenceRegistryStore } from "@narada2/invokable-intelligence-registry";

import { resolveInvocation } from "../src/index.js";
import type { ResolverContext } from "../src/index.js";

const CONTEXT: ResolverContext = {
  targetSite: { kind: "site", id: "site:thoughts-project" },
  userSite: { kind: "site", id: "site:andrey-user" },
  hostSite: { kind: "site", id: "site:andrey-pc" },
  runtime: "workers",
  time: "2026-07-19T03:00:00Z",
};

async function makeStore(fixture: FixtureBundle, mutate?: (f: FixtureBundle) => void): Promise<IntelligenceRegistryStore> {
  const copy = fixtureBundle(fixture);
  if (mutate) mutate(copy);
  const store = await SqliteRegistryStore.open(":memory:");
  await store.loadBundle(copy);
  return store;
}

function asPlan(result: InvocationPlan | import("@narada2/invokable-intelligence-contract").InvocationRefusal): InvocationPlan {
  assert.equal(result.schema, "narada.invokable-intelligence.invocation-plan.v1", JSON.stringify(result, null, 2));
  return result as InvocationPlan;
}

test("identical canonical inputs produce byte-stable plans", async () => {
  const store = await makeStore(CLOUDFLARE_KIMI);
  const intent = CLOUDFLARE_KIMI.intents[0];
  const first = asPlan(await resolveInvocation(intent, CONTEXT, { store }));
  const second = asPlan(await resolveInvocation(intent, CONTEXT, { store }));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.id, second.id);
  await store.close();
});

test("happy path: selects Kimi model via Cloudflare endpoint with merged options and provenance", async () => {
  const store = await makeStore(CLOUDFLARE_KIMI);
  const plan = asPlan(await resolveInvocation(CLOUDFLARE_KIMI.intents[0], CONTEXT, { store }));
  assert.equal(plan.selected.model.id, "model:kimi-k2-thinking");
  assert.equal(plan.selected.model_provider.id, "model-provider:kimi");
  assert.equal(plan.selected.inference_provider.id, "inference-provider:cloudflare-workers-ai");
  assert.equal(plan.selected.credential?.id, "credential-locator:cf-account-token");
  assert.equal(plan.options.thinking, "low");
  assert.ok(plan.provenance.applied_constraints.length > 0);
  assert.ok(plan.provenance.applied_preferences.length > 0);
  assert.ok(plan.provenance.applied_defaults.length > 0);
  await store.close();
});

test("hard constraints accumulate and preferences cannot override them", async () => {
  const store = await makeStore(CLOUDFLARE_KIMI, (f) => {
    f.policies.push({
      schema: "narada.invokable-intelligence.policy.v1",
      id: "policy:thoughts-target-forbid-kimi",
      locus: "target-site",
      site: { kind: "site", id: "site:thoughts-project" },
      kind: "hard-constraints",
      revision: 1,
      rules: [{ type: "forbid-resource", resource: { kind: "model", id: "model:kimi-k2-thinking" }, reason: "banned" }],
    });
  });
  const result = await resolveInvocation(CLOUDFLARE_KIMI.intents[0], CONTEXT, { store });
  assert.equal(result.schema, "narada.invokable-intelligence.invocation-refusal.v1");
  if (result.schema === "narada.invokable-intelligence.invocation-refusal.v1") {
    assert.equal(result.reason_code, "no-candidates");
    assert.ok(result.rejected_candidates[0].reasons.some((r) => r.includes("policy:thoughts-target-forbid-kimi")));
  }
  await store.close();
});

test("user preferences rank eligible candidates; ties break by lowest model id", async () => {
  const store = await makeStore(CLOUDFLARE_KIMI, (f) => {
    f.resources.push(
      { schema: "narada.invokable-intelligence.model-provider.v1", id: "model-provider:other" },
      {
        schema: "narada.invokable-intelligence.model.v1",
        id: "model:aaa-alternative",
        provider: { kind: "model-provider", id: "model-provider:other" },
      },
      {
        schema: "narada.invokable-intelligence.inference-endpoint.v1",
        id: "inference-endpoint:cf-workers-ai-alt",
        inference_provider: { kind: "inference-provider", id: "inference-provider:cloudflare-workers-ai" },
        adapter: { kind: "adapter", id: "adapter:workers-ai-binding" },
        serves: [{ kind: "model", id: "model:aaa-alternative" }],
        credential: { kind: "credential-locator", id: "credential-locator:cf-account-token" },
      },
    );
    f.assertions.push({
      schema: "narada.invokable-intelligence.capability-assertion.v1",
      id: "assert:aaa-thinking-levels",
      subject: { kind: "model", id: "model:aaa-alternative" },
      capability: { family: "thinking", name: "levels" },
      value: { levels: ["off", "low", "medium", "high"] },
      scope: { locus: "global" },
      provenance: { source: "probe", recorded_at: "2026-07-19T00:00:00Z" },
      validity: { fresh_as_of: "2026-07-19T00:00:00Z" },
      confidence: 0.9,
      evidence: [],
    });
  });
  // With the fixture preference for kimi-k2-thinking (0.8), kimi wins despite the higher id.
  const preferred = asPlan(await resolveInvocation(CLOUDFLARE_KIMI.intents[0], CONTEXT, { store }));
  assert.equal(preferred.selected.model.id, "model:kimi-k2-thinking");
  // Without preferences, the lexicographically smaller model id wins the tie.
  const storeNoPrefs = await makeStore(CLOUDFLARE_KIMI, (f) => {
    f.resources.push(
      { schema: "narada.invokable-intelligence.model-provider.v1", id: "model-provider:other" },
      {
        schema: "narada.invokable-intelligence.model.v1",
        id: "model:aaa-alternative",
        provider: { kind: "model-provider", id: "model-provider:other" },
      },
      {
        schema: "narada.invokable-intelligence.inference-endpoint.v1",
        id: "inference-endpoint:cf-workers-ai-alt",
        inference_provider: { kind: "inference-provider", id: "inference-provider:cloudflare-workers-ai" },
        adapter: { kind: "adapter", id: "adapter:workers-ai-binding" },
        serves: [{ kind: "model", id: "model:aaa-alternative" }],
        credential: { kind: "credential-locator", id: "credential-locator:cf-account-token" },
      },
    );
    f.assertions.push({
      schema: "narada.invokable-intelligence.capability-assertion.v1",
      id: "assert:aaa-thinking-levels",
      subject: { kind: "model", id: "model:aaa-alternative" },
      capability: { family: "thinking", name: "levels" },
      value: { levels: ["off", "low", "medium", "high"] },
      scope: { locus: "global" },
      provenance: { source: "probe", recorded_at: "2026-07-19T00:00:00Z" },
      validity: { fresh_as_of: "2026-07-19T00:00:00Z" },
      confidence: 0.9,
      evidence: [],
    });
    f.policies = f.policies.filter((p) => p.kind !== "preferences");
  });
  const tied = asPlan(await resolveInvocation(CLOUDFLARE_KIMI.intents[0], CONTEXT, { store: storeNoPrefs }));
  assert.equal(tied.selected.model.id, "model:aaa-alternative");
  assert.equal(tied.selected.endpoint.id, "inference-endpoint:cf-workers-ai-alt");
  await store.close();
  await storeNoPrefs.close();
});

test("unavailable credentials refuse before invocation", async () => {
  const store = await makeStore(CLOUDFLARE_KIMI, (f) => {
    f.assertions = f.assertions.filter((a) => a.id !== "assert:cf-token-feasible-on-pc");
  });
  const result = await resolveInvocation(CLOUDFLARE_KIMI.intents[0], CONTEXT, { store });
  assert.equal(result.schema, "narada.invokable-intelligence.invocation-refusal.v1");
  if (result.schema === "narada.invokable-intelligence.invocation-refusal.v1") {
    assert.equal(result.reason_code, "credentials-unavailable");
  }
  await store.close();
});

test("stale capability assertions refuse with stale-capabilities", async () => {
  const store = await makeStore(CLOUDFLARE_KIMI, (f) => {
    const thinking = f.assertions.find((a) => a.capability.family === "thinking") as CapabilityAssertion;
    thinking.validity = { valid_from: "2026-01-01T00:00:00Z", valid_until: "2026-06-01T00:00:00Z" };
  });
  const result = await resolveInvocation(CLOUDFLARE_KIMI.intents[0], CONTEXT, { store });
  assert.equal(result.schema, "narada.invokable-intelligence.invocation-refusal.v1");
  if (result.schema === "narada.invokable-intelligence.invocation-refusal.v1") {
    assert.equal(result.reason_code, "stale-capabilities");
  }
  await store.close();
});

test("contradictory hard constraints refuse with policy-conflict", async () => {
  const store = await makeStore(CLOUDFLARE_KIMI, (f) => {
    f.policies.push({
      schema: "narada.invokable-intelligence.policy.v1",
      id: "policy:thoughts-target-forbid-thinking",
      locus: "target-site",
      site: { kind: "site", id: "site:thoughts-project" },
      kind: "hard-constraints",
      revision: 1,
      rules: [{ type: "forbid-capability", capability: { family: "credential", name: "feasible" } }],
    });
  });
  const result = await resolveInvocation(CLOUDFLARE_KIMI.intents[0], CONTEXT, { store });
  assert.equal(result.schema, "narada.invokable-intelligence.invocation-refusal.v1");
  if (result.schema === "narada.invokable-intelligence.invocation-refusal.v1") {
    assert.equal(result.reason_code, "policy-conflict");
    assert.ok(result.explanation.includes("credential/feasible"));
  }
  await store.close();
});

test("unsupported requested options refuse with unsupported-options", async () => {
  const store = await makeStore(CLOUDFLARE_KIMI);
  const intent: InvocationIntent = {
    ...CLOUDFLARE_KIMI.intents[0],
    requested_options: { thinking: "extreme" },
  };
  const result = await resolveInvocation(intent, CONTEXT, { store });
  assert.equal(result.schema, "narada.invokable-intelligence.invocation-refusal.v1");
  if (result.schema === "narada.invokable-intelligence.invocation-refusal.v1") {
    assert.equal(result.reason_code, "unsupported-options");
  }
  await store.close();
});

test("batch/off-peak: inside the window resolves, outside refuses", async () => {
  const store = await makeStore(BATCH_OFFPEAK);
  const inside = asPlan(await resolveInvocation(BATCH_OFFPEAK.intents[0], CONTEXT, { store }));
  assert.equal(inside.selected.model.id, "model:llama-4-scout");
  assert.equal(inside.options.batch, true);

  const outside = await resolveInvocation(BATCH_OFFPEAK.intents[0], { ...CONTEXT, time: "2026-07-19T12:00:00Z" }, { store });
  assert.equal(outside.schema, "narada.invokable-intelligence.invocation-refusal.v1");
  if (outside.schema === "narada.invokable-intelligence.invocation-refusal.v1") {
    assert.equal(outside.reason_code, "unsupported-options");
  }
  await store.close();
});

test("unknown requested model refuses with no-candidates", async () => {
  const store = await makeStore(CLOUDFLARE_KIMI);
  const intent: InvocationIntent = {
    ...CLOUDFLARE_KIMI.intents[0],
    requested_model: { kind: "model", id: "model:does-not-exist" },
  };
  const result = await resolveInvocation(intent, CONTEXT, { store });
  assert.equal(result.schema, "narada.invokable-intelligence.invocation-refusal.v1");
  if (result.schema === "narada.invokable-intelligence.invocation-refusal.v1") {
    assert.equal(result.reason_code, "no-candidates");
  }
  await store.close();
});
