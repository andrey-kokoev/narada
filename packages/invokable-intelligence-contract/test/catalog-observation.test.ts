import assert from "node:assert/strict";
import test from "node:test";

import {
  CATALOG_OBSERVATION_SCHEMA,
  validateCatalogObservation,
} from "../src/catalog-observation.js";
import type { CatalogObservation } from "../src/catalog-observation.js";

const completeObservation: CatalogObservation = {
  schema: CATALOG_OBSERVATION_SCHEMA,
  id: "catalog-observation:inference-provider:kimi:2026-07-28T15:00:00Z",
  observed_at: "2026-07-28T15:00:00Z",
  inference_provider: { kind: "inference-provider", id: "inference-provider:kimi" },
  endpoint: { kind: "inference-endpoint", id: "inference-endpoint:kimi" },
  access_mode: "credentialed",
  authority: { kind: "provider-native", authority_ref: "provider-api:kimi/models" },
  source: { kind: "provider-api", reference: "provider-api:kimi/models" },
  credential_locator: { kind: "credential-locator", id: "credential-locator:kimi" },
  status: "complete",
  models: [{
    id: "catalog-model:kimi:k3",
    model_key: "k3",
    display_name: "K3",
    status: "active",
    capabilities: [{ name: "thinking", status: "supported", allowed_values: ["thinking"] }],
  }],
  diagnostics: [],
  digest: "sha256:test-observation",
};

test("catalog observations preserve provider authority without becoming invocation authority", () => {
  assert.deepEqual(validateCatalogObservation(completeObservation), []);
  assert.equal(completeObservation.models[0].capabilities[0].allowed_values?.[0], "thinking");
  assert.equal(completeObservation.credential_locator?.id, "credential-locator:kimi");
});

test("unavailable catalog observations cannot smuggle model records", () => {
  const unavailable = {
    ...completeObservation,
    id: "catalog-observation:inference-provider:codex:unavailable",
    access_mode: "unavailable" as const,
    authority: { kind: "unavailable" as const, authority_ref: "provider-authority-unavailable" },
    source: { kind: "unavailable" as const, reference: "not-observed" },
    status: "unavailable" as const,
    models: [],
    diagnostics: [{ code: "provider-authority-unavailable" as const, message: "No provider catalog authority was available." }],
  };
  assert.deepEqual(validateCatalogObservation(unavailable), []);
  assert.notDeepEqual(validateCatalogObservation({ ...unavailable, models: completeObservation.models }), []);
});
