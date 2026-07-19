import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { CLOUDFLARE_KIMI, fixtureBundle } from "@narada2/invokable-intelligence-contract";
import type { InvocationPlan, Model } from "@narada2/invokable-intelligence-contract";
import { SqliteRegistryStore } from "@narada2/invokable-intelligence-registry";
import type { IntelligenceRegistryStore } from "@narada2/invokable-intelligence-registry";

import { buildResolverContext, createLocalInvocationGateway, planToLegacyBindingOverrides } from "../src/index.js";
import type { AdapterInvocation, AdapterOutcome, InvocationAdapter } from "../src/index.js";

const SITES = {
  targetSite: { kind: "site" as const, id: "site:thoughts-project" },
  userSite: { kind: "site" as const, id: "site:andrey-user" },
  hostSite: { kind: "site" as const, id: "site:andrey-pc" },
};

function fakeAdapter(outcome: AdapterOutcome, calls: AdapterInvocation[] = []): InvocationAdapter & { calls: AdapterInvocation[] } {
  return {
    calls,
    async invoke(input: AdapterInvocation): Promise<AdapterOutcome> {
      calls.push(input);
      return outcome;
    },
  };
}

async function openWithFixture(): Promise<IntelligenceRegistryStore> {
  const store = await SqliteRegistryStore.open(":memory:");
  await store.loadBundle(fixtureBundle(CLOUDFLARE_KIMI));
  return store;
}

test("context builder carries sites and runtime, never model selection", () => {
  const context = buildResolverContext(SITES, { time: "2026-07-19T00:00:00Z" });
  assert.equal(context.targetSite.id, "site:thoughts-project");
  assert.equal(context.runtime, "node");
  assert.equal(context.time, "2026-07-19T00:00:00Z");
});

test("bridge maps a plan to legacy binding overrides with display model name", () => {
  const plan = {
    schema: "narada.invokable-intelligence.invocation-plan.v1",
    id: "plan:test",
    intent_id: "intent:test",
    created_at: "2026-07-19T00:00:00Z",
    resolver_version: "test",
    selected: {
      model: { kind: "model", id: "model:kimi-api-kimi-k3" },
      model_provider: { kind: "model-provider", id: "model-provider:kimi" },
      inference_provider: { kind: "inference-provider", id: "inference-provider:kimi-api" },
      endpoint: { kind: "inference-endpoint", id: "inference-endpoint:kimi-api" },
      adapter: { kind: "adapter", id: "adapter:x" },
    },
    options: { thinking: "low" },
    provenance: { applied_constraints: [], applied_preferences: [], applied_defaults: [], rejected_candidates: [] },
  } as InvocationPlan;
  const model = { schema: "narada.invokable-intelligence.model.v1", id: "model:kimi-api-kimi-k3", display_name: "kimi-k3", provider: { kind: "model-provider", id: "model-provider:kimi" } } as Model;
  const bridge = planToLegacyBindingOverrides(plan, model);
  assert.equal(bridge.provider, "kimi-api");
  assert.equal(bridge.overrides.model, "kimi-k3");
  assert.equal(bridge.overrides.thinking, "low");
});

test("happy path: linked intent, plan, attempt, evidence; only the planned adapter is invoked", async () => {
  const store = await openWithFixture();
  const adapter = fakeAdapter({ response: { text: "ok" }, usage: { input_tokens: 3, output_tokens: 2, latency_ms: 5 } });
  const wrongAdapter = fakeAdapter({ response: { text: "wrong" } });
  const gateway = createLocalInvocationGateway({
    store,
    sites: SITES,
    adapters: { "adapter:workers-ai-binding": adapter, "adapter:other": wrongAdapter },
    now: () => "2026-07-19T00:00:00Z",
  });
  const result = await gateway.invoke({ purpose: "operator-chat", principal: "operator", requestedOptions: { thinking: "low" } });
  assert.equal(result.kind, "plan");
  if (result.kind !== "plan") return;
  assert.equal(adapter.calls.length, 1);
  assert.equal(adapter.calls[0].plan.id, result.plan.id);
  assert.equal(wrongAdapter.calls.length, 0);
  assert.equal(result.plan.selected.model.id, "model:kimi-k2-thinking");
  assert.equal(result.attempt.state, "succeeded");

  const storedPlan = await store.getPlanByIntent(result.intent.id);
  assert.equal(storedPlan?.id, result.plan.id);
  const attempts = await store.listAttempts(result.plan.id);
  assert.equal(attempts.length, 1);
  const evidence = await store.listEvidence(result.attempt.id);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].usage?.input_tokens, 3);
  await store.close();
});

test("typed refusal is recorded and returned before any dispatch", async () => {
  const store = await openWithFixture();
  const adapter = fakeAdapter({ response: {} });
  const gateway = createLocalInvocationGateway({ store, sites: SITES, adapters: { "adapter:workers-ai-binding": adapter } });
  const result = await gateway.invoke({
    purpose: "operator-chat",
    requestedModel: { kind: "model", id: "model:does-not-exist" },
  });
  assert.equal(result.kind, "refusal");
  if (result.kind !== "refusal") return;
  assert.equal(result.refusal.reason_code, "no-candidates");
  assert.equal(adapter.calls.length, 0);
  assert.notEqual(await store.getRefusalByIntent(result.intent.id), null);
  await store.close();
});

test("unsupported options fail before provider invocation with structured explanation", async () => {
  const store = await openWithFixture();
  const adapter = fakeAdapter({ response: {} });
  const gateway = createLocalInvocationGateway({ store, sites: SITES, adapters: { "adapter:workers-ai-binding": adapter } });
  const result = await gateway.invoke({ purpose: "operator-chat", requestedOptions: { thinking: "extreme" } });
  assert.equal(result.kind, "refusal");
  if (result.kind !== "refusal") return;
  assert.equal(result.refusal.reason_code, "unsupported-options");
  assert.equal(adapter.calls.length, 0);
  await store.close();
});

test("replay: same intent reuses the recorded plan and dedups attempts", async () => {
  const store = await openWithFixture();
  const adapter = fakeAdapter({ response: { text: "ok" } });
  const gateway = createLocalInvocationGateway({ store, sites: SITES, adapters: { "adapter:workers-ai-binding": adapter } });
  const first = await gateway.invoke({ intentId: "intent:replay-1", purpose: "operator-chat" });
  const second = await gateway.invoke({ intentId: "intent:replay-1", purpose: "operator-chat" });
  assert.equal(first.kind, "plan");
  assert.equal(second.kind, "plan");
  if (first.kind !== "plan" || second.kind !== "plan") return;
  assert.equal(first.plan.id, second.plan.id);
  assert.equal(first.plan.created_at, second.plan.created_at, "plan provenance preserved across replay");
  const attempts = await store.listAttempts(first.plan.id);
  assert.equal(attempts.length, 1, "retries upsert the same attempt, never duplicate");
  await store.close();
});

test("restart: reopening the store preserves decision provenance and dedups", async () => {
  const dbPath = join(process.cwd(), `.tmp-gateway-${process.pid}.db`);
  await rm(dbPath, { force: true });
  try {
    const first = await SqliteRegistryStore.open(dbPath);
    await first.loadBundle(fixtureBundle(CLOUDFLARE_KIMI));
    const adapter = fakeAdapter({ response: { text: "ok" } });
    const gatewayA = createLocalInvocationGateway({ store: first, sites: SITES, adapters: { "adapter:workers-ai-binding": adapter } });
    const initial = await gatewayA.invoke({ intentId: "intent:restart-1", purpose: "operator-chat" });
    assert.equal(initial.kind, "plan");
    if (initial.kind !== "plan") return;
    await first.close();

    const reopened = await SqliteRegistryStore.open(dbPath);
    const gatewayB = createLocalInvocationGateway({ store: reopened, sites: SITES, adapters: { "adapter:workers-ai-binding": adapter } });
    const after = await gatewayB.invoke({ intentId: "intent:restart-1", purpose: "operator-chat" });
    assert.equal(after.kind, "plan");
    if (after.kind !== "plan") return;
    assert.equal(after.plan.id, initial.plan.id);
    assert.equal(after.plan.created_at, initial.plan.created_at);
    assert.equal((await reopened.listAttempts(initial.plan.id)).length, 1);
    await reopened.close();
  } finally {
    await rm(dbPath, { force: true });
  }
});

test("adapter failure is recorded as a failed attempt with a structured error", async () => {
  const store = await openWithFixture();
  const adapter = fakeAdapter({ error: { code: "provider-500", message: "upstream exploded" } });
  const gateway = createLocalInvocationGateway({ store, sites: SITES, adapters: { "adapter:workers-ai-binding": adapter } });
  const result = await gateway.invoke({ purpose: "operator-chat" });
  assert.equal(result.kind, "plan");
  if (result.kind !== "plan") return;
  assert.equal(result.attempt.state, "failed");
  assert.equal(result.attempt.error?.code, "provider-500");
  assert.equal((await store.listAttempts(result.plan.id))[0].state, "failed");
  await store.close();
});

test("local live e2e: plan drives a real HTTP dispatch through an injected adapter", async () => {
  const requests: unknown[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      requests.push(JSON.parse(body));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "chatcmpl-test", choices: [{ message: { content: "live-ok" } }], usage: { prompt_tokens: 4, completion_tokens: 2 } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    const fixture = fixtureBundle(CLOUDFLARE_KIMI);
    const endpoint = fixture.resources.find((r) => r.id === "inference-endpoint:cf-workers-ai-default");
    if (endpoint?.schema === "narada.invokable-intelligence.inference-endpoint.v1") {
      endpoint.metadata = { base_url: `http://127.0.0.1:${port}` };
    }
    const store = await SqliteRegistryStore.open(":memory:");
    await store.loadBundle(fixture);

    const httpAdapter: InvocationAdapter = {
      async invoke({ plan }) {
        const endpointResource = await store.getResource(plan.selected.endpoint.id);
        const baseUrl =
          endpointResource?.schema === "narada.invokable-intelligence.inference-endpoint.v1"
            ? endpointResource.metadata?.base_url
            : undefined;
        const started = Date.now();
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: plan.selected.model.id, options: plan.options, messages: [{ role: "user", content: "ping" }] }),
        });
        const json = await response.json();
        return { response: json, usage: { input_tokens: json.usage.prompt_tokens, output_tokens: json.usage.completion_tokens, latency_ms: Date.now() - started } };
      },
    };

    const gateway = createLocalInvocationGateway({ store, sites: SITES, adapters: { "adapter:workers-ai-binding": httpAdapter } });
    const result = await gateway.invoke({ purpose: "operator-chat", principal: "operator", requestedOptions: { thinking: "low" } });
    assert.equal(result.kind, "plan");
    if (result.kind !== "plan") return;
    assert.equal(result.attempt.state, "succeeded");
    assert.equal(requests.length, 1);
    assert.equal((requests[0] as { model: string }).model, "model:kimi-k2-thinking");
    assert.equal((requests[0] as { options: { thinking: string } }).options.thinking, "low");
    const evidence = await store.listEvidence(result.attempt.id);
    assert.equal(evidence[0].usage?.input_tokens, 4);
    await store.close();
  } finally {
    server.close();
  }
});
