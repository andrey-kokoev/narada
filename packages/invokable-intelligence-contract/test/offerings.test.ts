import assert from "node:assert/strict";
import test from "node:test";

import { CLOUDFLARE_EXECUTION_TOPOLOGY, LOCAL_EXECUTION_TOPOLOGY } from "../src/topology.js";
import {
  INVOCATION_ROUTE_CANDIDATE_SCHEMA,
  ROUTE_CAPABILITY_ASSERTION_SCHEMA,
  resolveRouteCapabilities,
  validateInvocationRouteCandidate,
  validateModelOfferingGraph,
} from "../src/offerings.js";
import type { InvocationRouteCandidate, RouteCapabilityAssertion } from "../src/offerings.js";
import type { ModelOffering, Resource } from "../src/resources.js";

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const resources: Resource[] = [
  { schema: "narada.invokable-intelligence.model-provider.v1", id: "model-provider:kimi" },
  { schema: "narada.invokable-intelligence.model.v1", id: "model:kimi-k2-thinking", provider: { kind: "model-provider", id: "model-provider:kimi" } },
  { schema: "narada.invokable-intelligence.inference-provider.v1", id: "inference-provider:cloudflare-workers-ai" },
  { schema: "narada.invokable-intelligence.inference-provider.v1", id: "inference-provider:remote-api" },
  { schema: "narada.invokable-intelligence.adapter.v1", id: "adapter:workers-ai-binding", runtime_family: "workers", protocol: { family: "cloudflare-workers-ai", operation: "run", version: "1" } },
  { schema: "narada.invokable-intelligence.adapter.v1", id: "adapter:openai-compatible-http", runtime_family: "node", protocol: { family: "openai", operation: "chat-completions", version: "1" } },
  { schema: "narada.invokable-intelligence.inference-endpoint.v1", id: "inference-endpoint:cf-workers-ai-default", inference_provider: { kind: "inference-provider", id: "inference-provider:cloudflare-workers-ai" }, adapter: { kind: "adapter", id: "adapter:workers-ai-binding" }, address: { kind: "workers-binding", binding: "AI" }, serves: [{ kind: "model", id: "model:kimi-k2-thinking" }] },
  { schema: "narada.invokable-intelligence.inference-endpoint.v1", id: "inference-endpoint:remote-default", inference_provider: { kind: "inference-provider", id: "inference-provider:remote-api" }, adapter: { kind: "adapter", id: "adapter:openai-compatible-http" }, address: { kind: "url", url: "https://api.example.invalid/v1/chat/completions" }, serves: [{ kind: "model", id: "model:kimi-k2-thinking" }] },
];
const cloudflareOffering: ModelOffering = { schema: "narada.invokable-intelligence.model-offering.v1", id: "model-offering:kimi-via-cloudflare", model: { kind: "model", id: "model:kimi-k2-thinking" }, model_provider: { kind: "model-provider", id: "model-provider:kimi" }, inference_provider: { kind: "inference-provider", id: "inference-provider:cloudflare-workers-ai" }, endpoint: { kind: "inference-endpoint", id: "inference-endpoint:cf-workers-ai-default" }, invocation_model_key: "@cf/moonshotai/kimi-k2-instruct", service_class: "workers-ai", region: "global" };
const remoteOffering: ModelOffering = { schema: "narada.invokable-intelligence.model-offering.v1", id: "model-offering:kimi-via-remote", model: { kind: "model", id: "model:kimi-k2-thinking" }, model_provider: { kind: "model-provider", id: "model-provider:kimi" }, inference_provider: { kind: "inference-provider", id: "inference-provider:remote-api" }, endpoint: { kind: "inference-endpoint", id: "inference-endpoint:remote-default" }, invocation_model_key: "kimi-k2-thinking", service_class: "premium-api", region: "us" };
resources.push(cloudflareOffering, remoteOffering);

const cloudflareRoute: InvocationRouteCandidate = {
  schema: INVOCATION_ROUTE_CANDIDATE_SCHEMA,
  id: "route:kimi-cloudflare",
  offering: { kind: "model-offering", id: cloudflareOffering.id },
  endpoint: cloudflareOffering.endpoint,
  adapter: { kind: "adapter", id: "adapter:workers-ai-binding" },
  topology: CLOUDFLARE_EXECUTION_TOPOLOGY,
  execution_loci: [{ kind: "execution-locus", id: "execution-locus:cloudflare-carrier" }],
  access: { account_ref: "account:cloudflare", grant_refs: ["grant:cloudflare-workers-ai"] },
  composition_digest: digest("c"),
};
const remoteRoute: InvocationRouteCandidate = {
  schema: INVOCATION_ROUTE_CANDIDATE_SCHEMA,
  id: "route:kimi-remote",
  offering: { kind: "model-offering", id: remoteOffering.id },
  endpoint: remoteOffering.endpoint,
  adapter: { kind: "adapter", id: "adapter:openai-compatible-http" },
  topology: LOCAL_EXECUTION_TOPOLOGY,
  execution_loci: [{ kind: "execution-locus", id: "execution-locus:operator-pc" }],
  access: { account_ref: "account:remote", grant_refs: ["grant:remote-api"] },
  composition_digest: digest("d"),
};
const assertion = (id: string, subject: RouteCapabilityAssertion["subject"], claim: RouteCapabilityAssertion["claim"]): RouteCapabilityAssertion => ({
  schema: ROUTE_CAPABILITY_ASSERTION_SCHEMA,
  id,
  subject,
  capability: { family: "thinking", name: "levels" },
  claim,
  provenance: { source: "documented", recorded_at: "2026-07-19T00:00:00Z" },
  validity: { fresh_as_of: "2026-07-19T00:00:00Z" },
  confidence: 1,
  evidence: [],
});

test("model, model provider, inference provider, offering, endpoint, adapter, and route remain distinct", () => {
  assert.deepEqual(validateModelOfferingGraph(cloudflareOffering, resources), []);
  assert.deepEqual(validateModelOfferingGraph(remoteOffering, resources), []);
  assert.deepEqual(validateInvocationRouteCandidate(cloudflareRoute, cloudflareOffering, resources), []);
  assert.deepEqual(validateInvocationRouteCandidate(remoteRoute, remoteOffering, resources), []);
  assert.equal(cloudflareOffering.model.id, remoteOffering.model.id);
  assert.notEqual(cloudflareOffering.inference_provider.id, remoteOffering.inference_provider.id);
  assert.notEqual(cloudflareRoute.topology.id, remoteRoute.topology.id);
});

test("the same model has materially different capabilities through two offerings", () => {
  const modelSubject = { scope: "model" as const, model: cloudflareOffering.model };
  const assertions: RouteCapabilityAssertion[] = [
    assertion("assert:model-thinking", modelSubject, { kind: "allowed-values", values: ["low", "medium", "high"] }),
    assertion("assert:cf-thinking", { scope: "offering", offering: cloudflareRoute.offering }, { kind: "allowed-values", values: ["low", "medium"] }),
    assertion("assert:remote-thinking", { scope: "offering", offering: remoteRoute.offering }, { kind: "allowed-values", values: ["low", "medium", "high"] }),
    { ...assertion("assert:cf-batch", { scope: "route-composition", route_id: cloudflareRoute.id, composition_digest: cloudflareRoute.composition_digest }, { kind: "support", status: "unsupported" }), capability: { family: "batch", name: "available" } },
    { ...assertion("assert:remote-batch", { scope: "route-composition", route_id: remoteRoute.id, composition_digest: remoteRoute.composition_digest }, { kind: "support", status: "supported" }), capability: { family: "batch", name: "available" } },
  ];
  const cf = resolveRouteCapabilities(cloudflareRoute, cloudflareOffering, assertions).capabilities;
  const remote = resolveRouteCapabilities(remoteRoute, remoteOffering, assertions).capabilities;
  assert.deepEqual(cf.find(({ capability }) => capability.family === "thinking")?.allowed_values, ["low", "medium"]);
  assert.deepEqual(remote.find(({ capability }) => capability.family === "thinking")?.allowed_values, ["high", "low", "medium"]);
  assert.equal(cf.find(({ capability }) => capability.family === "batch")?.supported, false);
  assert.equal(remote.find(({ capability }) => capability.family === "batch")?.supported, true);
});

test("route-composition assertions cannot leak to another route", () => {
  const scoped = assertion("assert:cf-route-only", { scope: "route-composition", route_id: cloudflareRoute.id, composition_digest: cloudflareRoute.composition_digest }, { kind: "support", status: "unsupported" });
  assert.equal(resolveRouteCapabilities(remoteRoute, remoteOffering, [scoped]).capabilities.length, 0);
});

test("hard capability scopes intersect while narrow pricing overrides descriptive price", () => {
  const assertions: RouteCapabilityAssertion[] = [
    assertion("assert:model-levels", { scope: "model", model: cloudflareOffering.model }, { kind: "allowed-values", values: ["low", "medium", "high"] }),
    assertion("assert:offering-levels", { scope: "offering", offering: cloudflareRoute.offering }, { kind: "allowed-values", values: ["medium", "high"] }),
    { ...assertion("assert:model-price", { scope: "model", model: cloudflareOffering.model }, { kind: "pricing", amount: 1, currency: "USD", unit: "million-tokens" }), capability: { family: "pricing", name: "input" } },
    { ...assertion("assert:route-price", { scope: "route-composition", route_id: cloudflareRoute.id, composition_digest: cloudflareRoute.composition_digest }, { kind: "pricing", amount: 2, currency: "USD", unit: "million-tokens" }), capability: { family: "pricing", name: "input" } },
  ];
  const resolved = resolveRouteCapabilities(cloudflareRoute, cloudflareOffering, assertions).capabilities;
  assert.deepEqual(resolved.find(({ capability }) => capability.family === "thinking")?.allowed_values, ["high", "medium"]);
  assert.equal(resolved.find(({ capability }) => capability.family === "pricing")?.pricing?.amount, 2);
});
