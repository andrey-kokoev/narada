import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createFakeD1, D1RegistryStore, SqliteRegistryStore } from "@narada2/invokable-intelligence-registry";

import {
  LEGACY_PROVIDER_REGISTRY_COMPATIBILITY_KEY,
  LegacyCompatibilityProjectionError,
  readLegacyCompatibilityProjection,
  rejectLegacyCompatibilityWrite,
} from "../src/compatibility.js";
import { parseLegacyRegistry } from "../src/legacy.js";
import { applyMigration, buildMigrationPlan } from "../src/migrate.js";

const REAL_REGISTRY = new URL("./provider-registry.legacy-fixture.json", import.meta.url);
const PLANNED_AT = "2026-07-19T00:00:00Z";
const LOCI = {
  targetSite: { kind: "site" as const, id: "site:thoughts-project" },
  userSite: { kind: "site" as const, id: "site:andrey-user" },
  hostSite: { kind: "site" as const, id: "site:andrey-pc" },
};
const CONSUMER = {
  call_site: "@narada2/example/config-loader",
  configuration_key: LEGACY_PROVIDER_REGISTRY_COMPATIBILITY_KEY,
  migration_owner: "task:2219",
};

async function migrationPlan() {
  const legacy = parseLegacyRegistry(JSON.parse(await readFile(REAL_REGISTRY, "utf8")));
  return buildMigrationPlan(legacy, LOCI, {
    reference: "provider-registry.legacy-fixture.json",
    plannedAt: PLANNED_AT,
  });
}

test("compatibility read is canonical-only, read-only, frozen, and instrumented", async () => {
  const store = await SqliteRegistryStore.open(":memory:");
  const telemetry: unknown[] = [];
  try {
    await applyMigration(store, await migrationPlan());
    const result = await readLegacyCompatibilityProjection(
      store,
      LEGACY_PROVIDER_REGISTRY_COMPATIBILITY_KEY,
      CONSUMER,
      {
        now: () => "2026-07-20T00:00:00.000Z",
        emitTelemetry: (event) => { telemetry.push(event); },
      },
    );

    assert.equal(result.authority, "canonical-v2");
    assert.equal(result.deprecated, true);
    assert.equal(result.read_only, true);
    assert.equal(result.write_admission, "refused");
    assert.equal(result.value.default_provider, "kimi-code-api");
    assert.equal(result.value.providers["kimi-code-api"].default_model, "k3");
    assert.equal(result.value.providers["codex-subscription"].default_thinking, "low");
    assert.deepEqual(result.value.providers["openai-api"].credential_requirement, {
      kind: "api_key_secret",
      secret_ref: "narada/provider/openai-api/api-key",
    });
    assert.equal(result.value.providers["openai-api"].model_env_names, undefined);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.value.providers), true);

    assert.equal(telemetry.length, 1);
    const event = telemetry[0] as {
      consumer: typeof CONSUMER;
      canonical_record_count: number;
      canonical_record_refs: string[];
      canonical_record_refs_truncated: boolean;
    };
    assert.deepEqual(event.consumer, CONSUMER);
    assert.ok(event.canonical_record_count > 0);
    assert.ok(event.canonical_record_refs.length <= 64);
    assert.equal(
      JSON.stringify(event).includes("narada/provider/openai-api/api-key"),
      false,
      "telemetry must not include credential locator references",
    );
  } finally {
    await store.close();
  }
});

test("SQLite and D1 compatibility projections are identical", async () => {
  const sqlite = await SqliteRegistryStore.open(":memory:");
  const fake = createFakeD1(":memory:");
  const d1 = await D1RegistryStore.open(fake);
  const plan = await migrationPlan();
  try {
    await applyMigration(sqlite, plan);
    await applyMigration(d1, plan);
    const options = { now: () => PLANNED_AT, emitTelemetry: () => undefined };
    const sqliteRead = await readLegacyCompatibilityProjection(
      sqlite,
      LEGACY_PROVIDER_REGISTRY_COMPATIBILITY_KEY,
      CONSUMER,
      options,
    );
    const d1Read = await readLegacyCompatibilityProjection(
      d1,
      LEGACY_PROVIDER_REGISTRY_COMPATIBILITY_KEY,
      CONSUMER,
      options,
    );
    assert.deepEqual(sqliteRead, d1Read);
  } finally {
    await sqlite.close();
    fake.close();
  }
});

test("compatibility boundary refuses unknown keys, writes, invalid consumers, and empty authority", async () => {
  const store = await SqliteRegistryStore.open(":memory:");
  try {
    await assert.rejects(
      readLegacyCompatibilityProjection(store, "carrier.unknown", CONSUMER, { emitTelemetry: () => undefined }),
      (error: unknown) =>
        error instanceof LegacyCompatibilityProjectionError
        && error.code === "unknown-legacy-compatibility-key",
    );
    assert.throws(
      () => rejectLegacyCompatibilityWrite(LEGACY_PROVIDER_REGISTRY_COMPATIBILITY_KEY),
      (error: unknown) =>
        error instanceof LegacyCompatibilityProjectionError
        && error.code === "legacy-compatibility-read-only",
    );
    await assert.rejects(
      readLegacyCompatibilityProjection(
        store,
        LEGACY_PROVIDER_REGISTRY_COMPATIBILITY_KEY,
        { ...CONSUMER, call_site: "" },
        { emitTelemetry: () => undefined },
      ),
      (error: unknown) =>
        error instanceof LegacyCompatibilityProjectionError
        && error.code === "invalid-legacy-compatibility-consumer",
    );
    await assert.rejects(
      readLegacyCompatibilityProjection(
        store,
        LEGACY_PROVIDER_REGISTRY_COMPATIBILITY_KEY,
        CONSUMER,
        { emitTelemetry: () => undefined },
      ),
      (error: unknown) =>
        error instanceof LegacyCompatibilityProjectionError
        && error.code === "canonical-registry-uninitialized",
    );
  } finally {
    await store.close();
  }
});

test("telemetry failure refuses an otherwise valid compatibility read", async () => {
  const store = await SqliteRegistryStore.open(":memory:");
  try {
    await applyMigration(store, await migrationPlan());
    await assert.rejects(
      readLegacyCompatibilityProjection(
        store,
        LEGACY_PROVIDER_REGISTRY_COMPATIBILITY_KEY,
        CONSUMER,
        { emitTelemetry: () => { throw new Error("telemetry unavailable"); } },
      ),
      /telemetry unavailable/u,
    );
  } finally {
    await store.close();
  }
});
