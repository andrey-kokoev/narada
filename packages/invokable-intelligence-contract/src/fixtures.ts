/**
 * Representative fixtures. CLOUDFLARE_KIMI covers an inference provider
 * (Cloudflare) invoking another party's (Kimi's) model with thinking
 * controls. BATCH_OFFPEAK covers batch availability plus an off-peak
 * window policy. Neither encodes anything as environment-variable names.
 */

import type { CapabilityAssertion } from "./assertions.js";
import type { InvocationIntent } from "./invocation.js";
import type { PolicyDocument } from "./policies.js";
import type { Resource } from "./resources.js";

export interface FixtureBundle {
  resources: Resource[];
  assertions: CapabilityAssertion[];
  policies: PolicyDocument[];
  intents: InvocationIntent[];
}

export const CLOUDFLARE_KIMI: FixtureBundle = {
  resources: [
    { schema: "narada.invokable-intelligence.site.v1", id: "site:thoughts-project", display_name: "Thoughts Project (target Site)" },
    { schema: "narada.invokable-intelligence.site.v1", id: "site:andrey-user", display_name: "Andrey User Site" },
    { schema: "narada.invokable-intelligence.site.v1", id: "site:andrey-pc", display_name: "Andrey PC (host Site)" },
    { schema: "narada.invokable-intelligence.inference-provider.v1", id: "inference-provider:cloudflare-workers-ai", display_name: "Cloudflare Workers AI" },
    { schema: "narada.invokable-intelligence.model-provider.v1", id: "model-provider:kimi", display_name: "Kimi (Moonshot AI)" },
    {
      schema: "narada.invokable-intelligence.model.v1",
      id: "model:kimi-k2-thinking",
      display_name: "Kimi K2 Thinking",
      provider: { kind: "model-provider", id: "model-provider:kimi" },
    },
    { schema: "narada.invokable-intelligence.adapter.v1", id: "adapter:workers-ai-binding", runtime_family: "workers", protocol: { family: "cloudflare-workers-ai", operation: "run", version: "1" } },
    {
      schema: "narada.invokable-intelligence.inference-endpoint.v1",
      id: "inference-endpoint:cf-workers-ai-default",
      inference_provider: { kind: "inference-provider", id: "inference-provider:cloudflare-workers-ai" },
      adapter: { kind: "adapter", id: "adapter:workers-ai-binding" },
      address: { kind: "workers-binding", binding: "AI" },
      serves: [{ kind: "model", id: "model:kimi-k2-thinking" }],
      credential: { kind: "credential-locator", id: "credential-locator:cf-account-token" },
    },
    {
      schema: "narada.invokable-intelligence.credential-locator.v1",
      id: "credential-locator:cf-account-token",
      store: "env",
      reference: "CLOUDFLARE_API_TOKEN",
      holder: { kind: "site", id: "site:andrey-pc" },
    },
    { schema: "narada.invokable-intelligence.execution-locus.v1", id: "execution-locus:cloudflare-carrier", kind: "cloudflare" },
  ],
  assertions: [
    {
      schema: "narada.invokable-intelligence.capability-assertion.v1",
      id: "assert:kimi-k2-thinking-levels",
      subject: { kind: "model", id: "model:kimi-k2-thinking" },
      capability: { family: "thinking", name: "levels" },
      value: { levels: ["off", "low", "medium", "high"] },
      scope: { locus: "global" },
      provenance: { source: "probe", recorded_at: "2026-07-19T00:00:00Z" },
      validity: { fresh_as_of: "2026-07-19T00:00:00Z" },
      confidence: 0.9,
      evidence: [{ kind: "test", ref: "probe/workers-ai/kimi-k2-thinking" }],
    },
    {
      schema: "narada.invokable-intelligence.capability-assertion.v1",
      id: "assert:kimi-k2-batch-unavailable",
      subject: { kind: "model", id: "model:kimi-k2-thinking" },
      capability: { family: "batch", name: "available" },
      value: false,
      scope: { locus: "global" },
      provenance: { source: "documented", recorded_at: "2026-07-19T00:00:00Z" },
      validity: { fresh_as_of: "2026-07-19T00:00:00Z" },
      confidence: 0.8,
      evidence: [{ kind: "document", ref: "providers/kimi#batch" }],
    },
    {
      schema: "narada.invokable-intelligence.capability-assertion.v1",
      id: "assert:cf-token-feasible-on-pc",
      subject: { kind: "credential-locator", id: "credential-locator:cf-account-token" },
      capability: { family: "credential", name: "feasible" },
      value: true,
      scope: { locus: "host-site", site: { kind: "site", id: "site:andrey-pc" } },
      provenance: { source: "probe", recorded_at: "2026-07-19T00:00:00Z" },
      validity: { fresh_as_of: "2026-07-19T00:00:00Z" },
      confidence: 1,
      evidence: [{ kind: "run", ref: "credential-probe/2026-07-19" }],
    },
  ],
  policies: [
    {
      schema: "narada.invokable-intelligence.policy.v1",
      id: "policy:thoughts-target-hard",
      locus: "target-site",
      site: { kind: "site", id: "site:thoughts-project" },
      kind: "hard-constraints",
      revision: 1,
      rules: [
        { type: "require-capability", capability: { family: "credential", name: "feasible" }, reason: "never invoke without a feasible credential" },
      ],
    },
    {
      schema: "narada.invokable-intelligence.policy.v1",
      id: "policy:andrey-user-preferences",
      locus: "user-site",
      site: { kind: "site", id: "site:andrey-user" },
      kind: "preferences",
      revision: 1,
      rules: [
        { type: "prefer-resource", resource: { kind: "model", id: "model:kimi-k2-thinking" }, weight: 0.8, reason: "default chat model" },
        { type: "prefer-capability", capability: { family: "thinking", name: "levels" }, weight: 0.5 },
      ],
    },
    {
      schema: "narada.invokable-intelligence.policy.v1",
      id: "policy:pc-host-feasibility",
      locus: "host-site",
      site: { kind: "site", id: "site:andrey-pc" },
      kind: "eligibility",
      revision: 1,
      rules: [
        { type: "allow-resource", resource: { kind: "inference-provider", id: "inference-provider:cloudflare-workers-ai" }, reason: "CF account active on this host" },
      ],
    },
    {
      schema: "narada.invokable-intelligence.policy.v1",
      id: "policy:thoughts-target-defaults",
      locus: "target-site",
      site: { kind: "site", id: "site:thoughts-project" },
      kind: "defaults",
      revision: 1,
      rules: [{ type: "default-option", option: "thinking", value: "low", reason: "cheap default for chat" }],
    },
  ],
  intents: [
    {
      schema: "narada.invokable-intelligence.invocation-intent.v1",
      id: "intent:operator-chat-001",
      created_at: "2026-07-19T00:00:00Z",
      principal: "operator",
      purpose: "operator-chat",
      required_capabilities: [{ family: "thinking", name: "levels" }],
      requested_options: { thinking: "low" },
    },
  ],
};

export const BATCH_OFFPEAK: FixtureBundle = {
  resources: [
    { schema: "narada.invokable-intelligence.site.v1", id: "site:thoughts-project" },
    { schema: "narada.invokable-intelligence.site.v1", id: "site:andrey-pc" },
    { schema: "narada.invokable-intelligence.inference-provider.v1", id: "inference-provider:cloudflare-workers-ai" },
    { schema: "narada.invokable-intelligence.model-provider.v1", id: "model-provider:meta", display_name: "Meta" },
    {
      schema: "narada.invokable-intelligence.model.v1",
      id: "model:llama-4-scout",
      provider: { kind: "model-provider", id: "model-provider:meta" },
    },
    { schema: "narada.invokable-intelligence.adapter.v1", id: "adapter:workers-ai-binding", runtime_family: "workers", protocol: { family: "cloudflare-workers-ai", operation: "run", version: "1" } },
    {
      schema: "narada.invokable-intelligence.inference-endpoint.v1",
      id: "inference-endpoint:cf-workers-ai-default",
      inference_provider: { kind: "inference-provider", id: "inference-provider:cloudflare-workers-ai" },
      adapter: { kind: "adapter", id: "adapter:workers-ai-binding" },
      address: { kind: "workers-binding", binding: "AI" },
      serves: [{ kind: "model", id: "model:llama-4-scout" }],
    },
  ],
  assertions: [
    {
      schema: "narada.invokable-intelligence.capability-assertion.v1",
      id: "assert:llama-4-scout-batch-available",
      subject: { kind: "model", id: "model:llama-4-scout" },
      capability: { family: "batch", name: "available" },
      value: true,
      scope: { locus: "global" },
      provenance: { source: "documented", recorded_at: "2026-07-19T00:00:00Z" },
      validity: { valid_from: "2026-07-01T00:00:00Z", fresh_as_of: "2026-07-19T00:00:00Z" },
      confidence: 0.85,
      evidence: [{ kind: "document", ref: "providers/meta#batch" }],
    },
    {
      schema: "narada.invokable-intelligence.capability-assertion.v1",
      id: "assert:llama-4-scout-off-peak-window",
      subject: { kind: "model", id: "model:llama-4-scout" },
      capability: { family: "off-peak", name: "window" },
      value: { start_utc: "02:00", end_utc: "06:00" },
      scope: { locus: "target-site", site: { kind: "site", id: "site:thoughts-project" } },
      provenance: { source: "operator", recorded_at: "2026-07-19T00:00:00Z" },
      validity: { fresh_as_of: "2026-07-19T00:00:00Z" },
      confidence: 1,
      evidence: [{ kind: "document", ref: "policies/off-peak" }],
    },
  ],
  policies: [
    {
      schema: "narada.invokable-intelligence.policy.v1",
      id: "policy:thoughts-batch-off-peak",
      locus: "target-site",
      site: { kind: "site", id: "site:thoughts-project" },
      kind: "hard-constraints",
      revision: 1,
      rules: [
        {
          type: "require-capability",
          capability: { family: "off-peak", name: "window" },
          reason: "batch submissions restricted to the off-peak window",
        },
      ],
    },
    {
      schema: "narada.invokable-intelligence.policy.v1",
      id: "policy:thoughts-batch-defaults",
      locus: "target-site",
      site: { kind: "site", id: "site:thoughts-project" },
      kind: "defaults",
      revision: 1,
      rules: [{ type: "default-option", option: "batch", value: true, reason: "prefer batch for non-interactive work" }],
    },
  ],
  intents: [
    {
      schema: "narada.invokable-intelligence.invocation-intent.v1",
      id: "intent:nightly-embedding-001",
      created_at: "2026-07-19T03:00:00Z",
      purpose: "nightly-embedding",
      required_capabilities: [{ family: "batch", name: "available" }],
      requested_options: { batch: true },
    },
  ],
};

/** Deep-cloned bundle so consumers/tests never mutate the shared constants. */
export function fixtureBundle(fixture: FixtureBundle): FixtureBundle {
  return JSON.parse(JSON.stringify(fixture)) as FixtureBundle;
}
