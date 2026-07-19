import assert from "node:assert/strict";
import test from "node:test";

import {
  BATCH_OFFPEAK,
  CLOUDFLARE_KIMI,
  fixtureBundle,
  validateAssertion,
  validateBundle,
  validateInvocation,
  validatePolicy,
  validateResource,
} from "../src/index.js";
import type { CapabilityAssertion, Model, PolicyDocument } from "../src/index.js";

test("fixtures validate clean, including intents", () => {
  for (const fixture of [CLOUDFLARE_KIMI, BATCH_OFFPEAK]) {
    const errors = validateBundle({
      resources: fixture.resources,
      assertions: fixture.assertions,
      policies: fixture.policies,
      invocations: fixture.intents,
    });
    assert.deepEqual(errors, []);
  }
});

test("inference provider, model provider, and model are independent identities, related explicitly", () => {
  const model = CLOUDFLARE_KIMI.resources.find((r) => r.id === "model:kimi-k2-thinking") as Model;
  const endpoint = CLOUDFLARE_KIMI.resources.find((r) => r.id === "inference-endpoint:cf-workers-ai-default");
  assert.equal(model.provider.id, "model-provider:kimi");
  assert.equal(endpoint?.schema, "narada.invokable-intelligence.inference-endpoint.v1");
  if (endpoint?.schema === "narada.invokable-intelligence.inference-endpoint.v1") {
    assert.equal(endpoint.inference_provider.id, "inference-provider:cloudflare-workers-ai");
  }
  // Kimi (model provider) is not Cloudflare (inference provider) — no name-pair collapse.
  assert.notEqual(model.provider.id, "inference-provider:cloudflare-workers-ai");
});

test("capability assertions express thinking, batch, and off-peak with provenance and validity", () => {
  const thinking = CLOUDFLARE_KIMI.assertions.find((a) => a.capability.family === "thinking");
  const batch = BATCH_OFFPEAK.assertions.find((a) => a.capability.family === "batch");
  const offPeak = BATCH_OFFPEAK.assertions.find((a) => a.capability.family === "off-peak");
  for (const assertion of [thinking, batch, offPeak]) {
    assert.ok(assertion, "expected assertion present");
    assert.ok(assertion.provenance.source);
    assert.ok(assertion.validity);
    assert.ok(assertion.confidence >= 0 && assertion.confidence <= 1);
  }
});

test("authority loci stay distinct: target constraints, user preferences, host feasibility", () => {
  const kindsByLocus = (locus: string) =>
    CLOUDFLARE_KIMI.policies.filter((p) => p.locus === locus).map((p) => p.kind).sort();
  assert.deepEqual(kindsByLocus("target-site"), ["defaults", "hard-constraints"]);
  assert.deepEqual(kindsByLocus("user-site"), ["preferences"]);
  assert.deepEqual(kindsByLocus("host-site"), ["eligibility"]);
  for (const policy of CLOUDFLARE_KIMI.policies) {
    assert.equal(policy.site.kind, "site");
  }
});

test("malformed references are rejected", () => {
  const fixture = fixtureBundle(CLOUDFLARE_KIMI);
  const model = fixture.resources.find((r) => r.id === "model:kimi-k2-thinking") as Model;
  model.provider = { kind: "model-provider", id: "model:kimi-k2-thinking" }; // kind disagrees with id prefix
  const errors = validateResource(model);
  assert.ok(errors.some((e) => e.code === "malformed-reference"));

  const fresh = fixtureBundle(CLOUDFLARE_KIMI);
  const broken = fresh.resources.find((r) => r.id === "model:kimi-k2-thinking") as Model;
  broken.provider = { kind: "model-provider", id: "model-provider:does-not-exist" };
  const bundleErrors = validateBundle({ ...fresh, invocations: fresh.intents });
  assert.ok(bundleErrors.some((e) => e.code === "unresolved-reference"));
});

test("invalid assertion scopes are rejected", () => {
  const fixture = fixtureBundle(CLOUDFLARE_KIMI);
  const scoped = fixture.assertions.find((a) => a.scope.locus !== "global") as CapabilityAssertion;
  delete scoped.scope.site;
  const errors = validateAssertion(scoped);
  assert.ok(errors.some((e) => e.code === "invalid-scope"));

  const wrongKind = fixtureBundle(CLOUDFLARE_KIMI).assertions.find((a) => a.scope.locus !== "global") as CapabilityAssertion;
  wrongKind.scope.site = { kind: "model", id: "model:kimi-k2-thinking" };
  assert.ok(validateAssertion(wrongKind).some((e) => e.code === "wrong-reference-kind"));
});

test("contradictory policy shapes are rejected", () => {
  const fixture = fixtureBundle(CLOUDFLARE_KIMI);
  const prefs = fixture.policies.find((p) => p.kind === "preferences") as PolicyDocument;
  prefs.rules.push({ type: "forbid-capability", capability: { family: "batch", name: "available" } });
  const errors = validatePolicy(prefs);
  assert.ok(errors.some((e) => e.code === "contradictory-policy"));
});

test("malformed identities and unknown schema versions are rejected", () => {
  const fixture = fixtureBundle(CLOUDFLARE_KIMI);
  const model = fixture.resources.find((r) => r.id === "model:kimi-k2-thinking") as Model;
  model.id = "model:Kimi K2!";
  assert.ok(validateResource(model).some((e) => e.code === "malformed-identity"));

  const wrongSchema = { ...model, id: "model:kimi-k2-thinking", schema: "narada.invokable-intelligence.model.v99" };
  assert.ok(validateResource(wrongSchema).some((e) => e.code === "unknown-schema"));

  const intent = { ...fixture.intents[0], schema: "narada.invokable-intelligence.invocation-intent.v2" };
  assert.ok(validateInvocation(intent).some((e) => e.code === "unknown-schema"));
});

test("credential locators never carry secret material", () => {
  const fixture = fixtureBundle(CLOUDFLARE_KIMI);
  const locator = fixture.resources.find((r) => r.id === "credential-locator:cf-account-token");
  const withSecret = { ...locator, token: "cf-secret-value" };
  assert.ok(validateResource(withSecret).some((e) => e.code === "secret-material"));
});

test("inverted validity intervals are rejected", () => {
  const fixture = fixtureBundle(CLOUDFLARE_KIMI);
  const assertion = fixture.assertions[0];
  assertion.validity = { valid_from: "2026-07-20T00:00:00Z", valid_until: "2026-07-19T00:00:00Z" };
  assert.ok(validateAssertion(assertion).some((e) => e.code === "invalid-validity"));
});
