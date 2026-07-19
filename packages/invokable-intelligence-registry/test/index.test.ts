import assert from "node:assert/strict";
import test from "node:test";

import { BATCH_OFFPEAK, CLOUDFLARE_KIMI, fixtureBundle } from "@narada2/invokable-intelligence-contract";

import { defineRegistryConformanceSuite } from "../src/conformance.js";
import { D1RegistryStore } from "../src/d1-store.js";
import { createFakeD1 } from "../src/fake-d1.js";
import { SqliteRegistryStore } from "../src/sqlite-store.js";
import type { IntelligenceRegistryStore } from "../src/store.js";

defineRegistryConformanceSuite("node-sqlite", async () => {
  const store = await SqliteRegistryStore.open(":memory:");
  return { store, cleanup: () => store.close() };
});

defineRegistryConformanceSuite("cloudflare-d1 (fake binding)", async () => {
  const fake = createFakeD1(":memory:");
  const store = await D1RegistryStore.open(fake);
  return { store, cleanup: () => fake.close() };
});

test("cross-adapter canonical reads are semantically identical", async () => {
  const sqlite = await SqliteRegistryStore.open(":memory:");
  const fake = createFakeD1(":memory:");
  const d1 = await D1RegistryStore.open(fake);
  try {
    for (const store of [sqlite, d1]) {
      await store.loadBundle(fixtureBundle(CLOUDFLARE_KIMI));
      await store.loadBundle(fixtureBundle(BATCH_OFFPEAK));
    }
    const dump = async (store: IntelligenceRegistryStore) => {
      const resources = await store.listResources();
      const policies = await store.listPolicies();
      return {
        resources,
        relations: Object.fromEntries(
          await Promise.all(resources.map(async (r) => [r.id, await store.listRelations(r.id)] as const)),
        ),
        assertions: await store.listAssertions({ includeSuperseded: true }),
        policies,
        bindings: Object.fromEntries(
          await Promise.all(policies.map(async (p) => [p.id, await store.listPolicyBindings(p.id)] as const)),
        ),
        intents: await Promise.all(
          [...CLOUDFLARE_KIMI.intents, ...BATCH_OFFPEAK.intents].map((intent) => store.getIntent(intent.id)),
        ),
      };
    };
    assert.deepEqual(await dump(sqlite), await dump(d1));
  } finally {
    await sqlite.close();
    fake.close();
  }
});
