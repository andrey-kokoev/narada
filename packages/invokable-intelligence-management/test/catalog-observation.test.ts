import assert from "node:assert/strict";
import test from "node:test";

import type {
  CredentialLocator,
  InferenceEndpoint,
  InferenceProvider,
} from "@narada-core/invokable-intelligence-contract";
import { SqliteRegistryStore } from "@narada-core/invokable-intelligence-registry";

import {
  createOpenAiCompatibleCatalogAdapter,
  observeCatalog,
} from "../src/catalog-observation.js";
import { IntelligenceManagementService } from "../src/service.js";

const PROVIDER: InferenceProvider = {
  schema: "narada.invokable-intelligence.inference-provider.v1",
  id: "inference-provider:kimi-code",
  display_name: "Kimi Code",
};
const ENDPOINT: InferenceEndpoint = {
  schema: "narada.invokable-intelligence.inference-endpoint.v1",
  id: "inference-endpoint:kimi-code",
  inference_provider: { kind: "inference-provider", id: PROVIDER.id },
  adapter: { kind: "adapter", id: "adapter:openai-compatible" },
  address: { kind: "url", url: "https://api.kimi.com/coding" },
  serves: [],
  credential: { kind: "credential-locator", id: "credential-locator:kimi-code" },
};
const CREDENTIAL: CredentialLocator = {
  schema: "narada.invokable-intelligence.credential-locator.v1",
  id: "credential-locator:kimi-code",
  store: "site-secret",
  reference: "kimi-code-api",
  holder: { kind: "site", id: "site:andrey-user" },
};

async function preparedStore(): Promise<SqliteRegistryStore> {
  const store = await SqliteRegistryStore.open(":memory:");
  await store.putResource(PROVIDER);
  await store.putResource(ENDPOINT);
  await store.putResource(CREDENTIAL);
  return store;
}

test("credentialed catalog observation uses the injected secret only at the adapter boundary", async () => {
  const store = await preparedStore();
  let requestUrl = "";
  let authorization = "";
  try {
    const secret = "secret-must-not-escape";
    const adapter = createOpenAiCompatibleCatalogAdapter({
      http: {
        async get(url, headers) {
          requestUrl = url;
          authorization = headers.authorization ?? "";
          return {
            status: 200,
            body: {
              data: [{
                id: "k3",
                owned_by: "moonshot",
                capabilities: { thinking: { supported: true, allowed_values: ["thinking"] } },
              }],
            },
          };
        },
      },
    });
    const observation = await observeCatalog(store, {
      provider: { kind: "inference-provider", id: PROVIDER.id },
      observed_at: "2026-07-28T15:00:00Z",
      access_mode: "credentialed",
    }, {
      adapters: { [PROVIDER.id]: adapter },
      credentialResolver: {
        async resolve(locator) {
          assert.equal(locator.id, CREDENTIAL.id);
          return { secret, evidence_ref: "evidence:test-credential" };
        },
      },
    });

    assert.equal(requestUrl, "https://api.kimi.com/coding/models");
    assert.equal(authorization, `Bearer ${secret}`);
    assert.equal(observation.status, "complete");
    assert.equal(observation.models[0].model_key, "k3");
    assert.deepEqual(observation.models[0].capabilities[0].allowed_values, ["thinking"]);
    assert.equal(JSON.stringify(observation).includes(secret), false);
    assert.equal(JSON.stringify(observation).includes("evidence:test-credential"), false);
  } finally {
    await store.close();
  }
});

test("provider catalog failure is observable without treating the declaration as authoritative", async () => {
  const store = await preparedStore();
  try {
    const adapter = createOpenAiCompatibleCatalogAdapter({
      http: { async get() { return { status: 401, body: { error: "secret-bearing provider detail" } }; } },
    });
    const observation = await observeCatalog(store, {
      provider: { kind: "inference-provider", id: PROVIDER.id },
      observed_at: "2026-07-28T15:01:00Z",
      access_mode: "credentialed",
    }, {
      adapters: { [PROVIDER.id]: adapter },
      credentialResolver: { async resolve() { return { secret: "wrong-secret", evidence_ref: "evidence:401" }; } },
    });
    assert.equal(observation.status, "unavailable");
    assert.equal(observation.diagnostics[0].code, "unauthorized");
    assert.equal(observation.authority.kind, "provider-native");
    assert.equal(JSON.stringify(observation).includes("secret-bearing"), false);
    assert.equal(JSON.stringify(observation).includes("wrong-secret"), false);
  } finally {
    await store.close();
  }
});

test("management returns unavailable when provider authority is not injected", async () => {
  const store = await preparedStore();
  try {
    const service = new IntelligenceManagementService({
      store,
      owningSite: { kind: "site", id: "site:andrey-user" },
      catalogObservation: { adapters: {} },
    });
    const result = await service.execute({
      operation: "observe-catalog",
      provider: { kind: "inference-provider", id: PROVIDER.id },
      observed_at: "2026-07-28T15:02:00Z",
    });
    const observation = result.data as { status: string; diagnostics: Array<{ code: string }> };
    assert.equal(result.ok, false);
    assert.equal(observation.status, "unavailable");
    assert.equal(observation.diagnostics[0].code, "provider-authority-unavailable");
  } finally {
    await store.close();
  }
});
