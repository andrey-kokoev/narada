import assert from "node:assert/strict";
import test from "node:test";

import {
  cloudflareTopologyObservations,
  createCloudflareProviderAdapter,
} from "../src/cloudflare.js";

function invocation(overrides: Record<string, unknown> = {}): any {
  return {
    plan: { options: {} },
    adapter: {
      id: "adapter:workers-ai-binding",
      runtime_family: "workers",
      protocol: { family: "cloudflare-workers-ai", operation: "run", version: "1" },
    },
    offering: { invocation_model_key: "@cf/test-model" },
    endpoint: { address: { kind: "binding", binding: "AI" } },
    messages: [{ role: "user", content: "ping" }],
    tools: [],
    credential: null,
    ...overrides,
  };
}

test("Cloudflare Workers AI adapter executes the catalog-selected model and preserves response evidence", async () => {
  let receivedModel = "";
  let receivedPayload: any;
  const adapter = createCloudflareProviderAdapter({
    ai: {
      async run(model, payload) {
        receivedModel = model;
        receivedPayload = payload;
        return { response: "pong", request_id: "provider-request-1" };
      },
    },
  });

  const result = await adapter.invoke(invocation());

  assert.equal(result.admission, "acknowledged");
  assert.equal(result.transportSubmitted, true);
  assert.equal(result.providerRequestRef, "provider-request-1");
  assert.equal(receivedModel, "@cf/test-model");
  assert.equal(receivedPayload.model, "@cf/test-model");
  assert.deepEqual(receivedPayload.messages, [{ role: "user", content: "ping" }]);
  assert.equal((result.response as any).text, "pong");
});

test("Cloudflare URL adapter resolves an admitted env credential without selecting a provider", async () => {
  let receivedHeaders: HeadersInit | undefined;
  const adapter = createCloudflareProviderAdapter({
    resolveCredential: () => "secret-token",
    fetch: (async (_input, init) => {
      receivedHeaders = init?.headers;
      return new Response(JSON.stringify({ response: "pong" }), {
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "http-request-1" },
      });
    }) as typeof fetch,
  });

  const result = await adapter.invoke(invocation({
    adapter: {
      id: "adapter:openai-compatible-http",
      runtime_family: "workers",
      protocol: { family: "openai", operation: "chat-completions", version: "1" },
    },
    endpoint: { address: { kind: "url", url: "https://provider.example/v1/chat/completions" } },
    credential: { store: "env", reference: "PROVIDER_TOKEN" },
  }));

  assert.equal(result.admission, "acknowledged");
  assert.equal(result.providerRequestRef, "http-request-1");
  assert.equal((new Headers(receivedHeaders).get("authorization")), "Bearer secret-token");
  assert.equal((result.response as any).text, "pong");
});

test("Cloudflare provider adapter rejects object coercion and empty responses", async () => {
  const adapter = createCloudflareProviderAdapter({
    ai: { async run() { return { response: { unexpected: true } }; } },
  });
  const objectResult = await adapter.invoke(invocation());
  assert.equal(objectResult.admission, "acknowledged");
  assert.equal((objectResult.error as any).code, "cloudflare_provider_response_empty");

  const emptyAdapter = createCloudflareProviderAdapter({
    ai: { async run() { return {}; } },
  });
  const emptyResult = await emptyAdapter.invoke(invocation());
  assert.equal((emptyResult.error as any).code, "cloudflare_provider_response_empty");
});

test("Cloudflare provider adapter extracts standard choices content without stringifying objects", async () => {
  const adapter = createCloudflareProviderAdapter({
    ai: {
      async run() {
        return { choices: [{ message: { content: [{ type: "text", text: "choice-pong" }] } }] };
      },
    },
  });
  const result = await adapter.invoke(invocation());
  assert.equal((result.response as any).text, "choice-pong");
});

test("Cloudflare provider transport failures remain admission-uncertain", async () => {
  const adapter = createCloudflareProviderAdapter({
    fetch: (async () => { throw new Error("network down"); }) as typeof fetch,
  });
  const result = await adapter.invoke(invocation({
    adapter: {
      id: "adapter:openai-compatible-http",
      runtime_family: "workers",
      protocol: { family: "openai", operation: "chat-completions", version: "1" },
    },
    endpoint: { address: { kind: "url", url: "https://provider.example/v1/chat/completions" } },
  }));
  assert.equal(result.admission, "uncertain");
  assert.equal((result.error as any).code, "cloudflare_provider_fetch_failed");
});

test("Cloudflare Workers AI transport failures remain admission-uncertain", async () => {
  const adapter = createCloudflareProviderAdapter({
    ai: { async run() { throw new Error("AI transport down"); } },
  });
  const result = await adapter.invoke(invocation());
  assert.equal(result.admission, "uncertain");
  assert.equal((result.error as any).code, "cloudflare_workers_ai_provider_failed");
});

test("Cloudflare topology evidence distinguishes a missing Workers AI binding", () => {
  const observations = cloudflareTopologyObservations([
    {
      document: {
        schema: "narada.invokable-intelligence.invocation-route-candidate.v1",
        topology: {
          id: "topology:test-workers-ai",
          nodes: [{
            id: "adapter",
            resource: { kind: "adapter", id: "adapter:workers-ai-binding" },
            required_feasibility: ["adapter-supported"],
          }],
          edges: [],
        },
      },
    },
  ], {
    source: "execution-site-clock",
    authority_ref: "runtime:test",
    instant: "2026-07-30T12:00:00.000Z",
    timezone: "UTC",
    local: { date: "2026-07-30", time: "12:00:00", weekday: 4 },
  }, { aiBinding: false, outboundFetch: true });

  assert.equal(observations.length, 1);
  assert.equal((observations[0] as any).status, "infeasible");
  assert.equal((observations[0] as any).reason_code, "cloudflare-runtime-capability-missing");
});

test("Cloudflare topology evidence ignores superseded catalog revisions", () => {
  const route = (runtimeBinding?: Record<string, string>) => ({
    schema: "narada.invokable-intelligence.invocation-route-candidate.v1",
    topology: {
      id: "topology:test-workers-ai-revisioned",
      nodes: [{
        id: "adapter",
        resource: { kind: "adapter", id: "adapter:workers-ai-binding" },
        required_feasibility: ["adapter-supported"],
        ...(runtimeBinding ? { runtime_binding: runtimeBinding } : {}),
      }],
      edges: [],
    },
  });
  const observations = cloudflareTopologyObservations([
    {
      record_id: "route:test-workers-ai-revisioned",
      revision: 1,
      document: route(),
    },
    {
      record_id: "route:test-workers-ai-revisioned",
      revision: 2,
      document: route({ kind: "cloudflare-binding", name: "AI" }),
    },
  ], {
    source: "execution-site-clock",
    authority_ref: "runtime:test",
    instant: "2026-07-30T12:00:00.000Z",
    timezone: "UTC",
    local: { date: "2026-07-30", time: "12:00:00", weekday: 4 },
  }, { aiBinding: true, outboundFetch: false });

  assert.equal(observations.length, 1);
  assert.equal((observations[0] as any).status, "feasible");
  assert.equal((observations[0] as any).reason_code, "cloudflare-runtime-capability-present");
});
