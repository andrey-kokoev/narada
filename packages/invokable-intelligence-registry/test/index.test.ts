import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { BATCH_OFFPEAK, CLOUDFLARE_KIMI, fixtureBundle } from "@narada2/invokable-intelligence-contract";

import { defineRegistryConformanceSuite } from "../src/conformance.js";
import { D1RegistryStore } from "../src/d1-store.js";
import { createFakeD1 } from "../src/fake-d1.js";
import { SqliteRegistryStore } from "../src/sqlite-store.js";
import { REGISTRY_SCHEMA_VERSION } from "../src/schema.js";
import type { IntelligenceRegistryStore } from "../src/store.js";

defineRegistryConformanceSuite("node-sqlite", async () => {
  const store = await SqliteRegistryStore.open(":memory:");
  return { store, cleanup: () => store.close() };
});

test("v5 migration removes the superseded mutable attempt and evidence tables", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narada-intelligence-registry-v4-"));
  const path = join(directory, "registry.sqlite");
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations (version, applied_at) VALUES (4, '2026-07-19T00:00:00Z');
    CREATE TABLE invocation_attempts (id TEXT PRIMARY KEY);
    CREATE TABLE invocation_evidence (id TEXT PRIMARY KEY);
  `);
  legacy.close();

  const store = await SqliteRegistryStore.open(path);
  try {
    assert.equal(await store.schemaVersion(), REGISTRY_SCHEMA_VERSION);
  } finally {
    await store.close();
  }
  const inspection = new DatabaseSync(path, { readOnly: true });
  try {
    const rows = inspection.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('invocation_attempts', 'invocation_evidence') ORDER BY name",
    ).all();
    assert.deepEqual(rows, []);
  } finally {
    inspection.close();
    await rm(directory, { recursive: true, force: true });
  }
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
