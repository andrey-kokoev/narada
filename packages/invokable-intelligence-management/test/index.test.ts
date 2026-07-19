import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import type { CapabilityAssertion, PolicyDocument } from "@narada2/invokable-intelligence-contract";
import { createFakeD1, D1RegistryStore, SqliteRegistryStore } from "@narada2/invokable-intelligence-registry";
import type { IntelligenceRegistryStore } from "@narada2/invokable-intelligence-registry";

import { parseLegacyRegistry } from "../src/legacy.js";
import type { MigrationLoci } from "../src/migrate.js";
import { applyMigration, buildMigrationPlan, dryRunMigration } from "../src/migrate.js";
import { createManagementTools } from "../src/mcp-tools.js";
import { main } from "../src/cli.js";
import { ManagementError, materializeRecord, validateStore, writeRecord } from "../src/operations.js";

const LOCI: MigrationLoci = {
  targetSite: { kind: "site", id: "site:thoughts-project" },
  userSite: { kind: "site", id: "site:andrey-user" },
  hostSite: { kind: "site", id: "site:andrey-pc" },
};
const PLANNED_AT = "2026-07-19T00:00:00Z";
const REAL_REGISTRY = new URL("../../carrier-provider-contract/contracts/provider-registry.json", import.meta.url);

async function realLegacy() {
  return parseLegacyRegistry(JSON.parse(await readFile(REAL_REGISTRY, "utf8")));
}

async function openStore(): Promise<IntelligenceRegistryStore> {
  return SqliteRegistryStore.open(":memory:");
}

test("dry-run migration is deterministic and does not mutate", async () => {
  const legacy = await realLegacy();
  const first = buildMigrationPlan(legacy, LOCI, { reference: "provider-registry.json", plannedAt: PLANNED_AT });
  const second = buildMigrationPlan(legacy, LOCI, { reference: "provider-registry.json", plannedAt: PLANNED_AT });
  assert.deepEqual(first, second);

  const store = await openStore();
  const dry = await dryRunMigration(store, first);
  assert.ok(dry.counts.add > 0);
  assert.equal(dry.counts.update, 0);
  assert.equal(dry.counts.unchanged, 0);
  assert.equal((await store.listResources()).length, 0, "dry-run must not mutate");
  await store.close();
});

test("applied migration is idempotent and records provenance", async () => {
  const legacy = await realLegacy();
  const plan = buildMigrationPlan(legacy, LOCI, { reference: "provider-registry.json", plannedAt: PLANNED_AT });
  const store = await openStore();
  await applyMigration(store, plan);
  const secondRun = await applyMigration(store, plan);
  assert.equal(secondRun.counts.add, 0);
  assert.equal(secondRun.counts.update, 0);
  assert.ok(secondRun.counts.unchanged > 0);

  const migrated = await store.listAssertions({ family: "support" });
  assert.ok(migrated.length > 0);
  for (const assertion of migrated) {
    assert.equal(assertion.provenance.source, "migration");
    assert.equal(assertion.provenance.reference, "provider-registry.json");
  }
  await store.close();
});

test("representative legacy config maps without conflating provider kinds", async () => {
  const legacy = await realLegacy();
  const plan = buildMigrationPlan(legacy, LOCI, { reference: "provider-registry.json", plannedAt: PLANNED_AT });
  const byId = new Map(plan.resources.map((r) => [r.id, r]));

  // openai-api: inference provider ≠ model provider ≠ models, explicit adapter + credential locator.
  assert.equal(byId.get("inference-provider:openai-api")?.schema, "narada.invokable-intelligence.inference-provider.v1");
  assert.equal(byId.get("model-provider:openai")?.schema, "narada.invokable-intelligence.model-provider.v1");
  const model = byId.get("model:openai-gpt-5.6-sol");
  assert.equal(model?.schema, "narada.invokable-intelligence.model.v1");
  if (model?.schema === "narada.invokable-intelligence.model.v1") {
    assert.equal(model.provider.id, "model-provider:openai");
  }
  const endpoint = byId.get("inference-endpoint:openai-api");
  if (endpoint?.schema === "narada.invokable-intelligence.inference-endpoint.v1") {
    assert.equal(endpoint.adapter.id, "adapter:openai-compatible-chat-completions");
    assert.equal(endpoint.credential?.id, "credential-locator:openai-api");
  } else {
    assert.fail("endpoint missing");
  }
  const credential = byId.get("credential-locator:openai-api");
  if (credential?.schema === "narada.invokable-intelligence.credential-locator.v1") {
    assert.equal(credential.store, "site-secret");
    assert.equal(credential.reference, "narada/provider/openai-api/api-key");
    assert.equal(credential.holder.id, "site:andrey-pc");
  } else {
    assert.fail("credential locator missing");
  }

  // codex-subscription: local subscription credential without env var material.
  const codexCredential = byId.get("credential-locator:codex-subscription");
  if (codexCredential?.schema === "narada.invokable-intelligence.credential-locator.v1") {
    assert.equal(codexCredential.store, "none");
    assert.equal(codexCredential.reference, "codex-local-subscription");
  } else {
    assert.fail("codex credential missing");
  }

  // The same OpenAI model is shared by API and subscription offerings.
  assert.equal(plan.resources.filter(({ id }) => id === "model:openai-gpt-5.6-sol").length, 1);
  assert.ok(plan.resources.some(({ id }) => id === "model-offering:openai-api-gpt-5.6-sol"));
  assert.ok(plan.resources.some(({ id }) => id === "model-offering:codex-subscription-gpt-5.6-sol"));
  assert.ok(plan.routes.some(({ id }) => id === "route:openai-api-gpt-5.6-sol-local"));
  assert.ok(plan.accessRecords.some(({ id }) => id === "account:openai-api"));

  // default_provider lands as an explicit offering/route default, not an env-var name.
  const defaults = plan.policies.find((p) => p.kind === "defaults");
  assert.ok(defaults?.rules.some((r) => r.type === "default-option" && r.option === "model_offering" && r.value === "model-offering:kimi-code-api-k3"));
  assert.ok(defaults?.rules.some((r) => r.type === "default-option" && r.option === "route" && r.value === "route:kimi-code-api-k3-local"));
  assert.ok(defaults?.rules.some((r) => r.type === "default-option" && r.option === "inference_provider" && r.value === "inference-provider:kimi-code-api"));

  // Every admitted record carries explicit provenance, authority, revision, and validation evidence.
  assert.ok(plan.seed.records.length > 0);
  for (const record of plan.seed.records) {
    assert.equal(record.source.reference, "provider-registry.json");
    assert.ok(record.source.revision);
    assert.ok(record.source.digest.startsWith("sha256:"));
    assert.ok(record.authority.kind);
    assert.ok(record.authority.locus);
    assert.equal(record.revision, 1);
    assert.equal(record.validation.status, "accepted");
    assert.ok(record.validation.evidence.length > 0);
  }
  assert.ok(plan.residuals.some(({ code }) => code === "legacy-runtime-selection-not-authoritative"));
  assert.ok(plan.residuals.some(({ code }) => code === "authority-escalation"));

  // Migrated state validates clean against the contract.
  const store = await openStore();
  await applyMigration(store, plan);
  const session = { store, owningSite: LOCI.targetSite };
  assert.deepEqual(await validateStore(session), []);
  await store.close();
});

test("cross-locus writes are rejected unless explicitly materialized", async () => {
  const store = await openStore();
  const session = { store, owningSite: LOCI.userSite };
  const foreignPolicy: PolicyDocument = {
    schema: "narada.invokable-intelligence.policy.v1",
    id: "policy:test-foreign",
    locus: "target-site",
    site: LOCI.targetSite,
    kind: "defaults",
    revision: 1,
    rules: [{ type: "default-option", option: "thinking", value: "low" }],
  };
  await assert.rejects(writeRecord(session, foreignPolicy), (error: unknown) => {
    assert.ok(error instanceof ManagementError);
    assert.equal(error.code, "cross-locus-write");
    return true;
  });
  assert.equal(await store.getPolicy(foreignPolicy.id), null);

  await materializeRecord(session, foreignPolicy, { actor: "test-operator", reference: "test" });
  assert.notEqual(await store.getPolicy(foreignPolicy.id), null);

  const foreignAssertion: CapabilityAssertion = {
    schema: "narada.invokable-intelligence.capability-assertion.v1",
    id: "assert:test-feasibility",
    subject: { kind: "credential-locator", id: "credential-locator:openai-api" },
    capability: { family: "credential", name: "feasible" },
    value: true,
    scope: { locus: "host-site", site: LOCI.hostSite },
    provenance: { source: "operator", recorded_at: PLANNED_AT, actor: "test" },
    validity: { fresh_as_of: PLANNED_AT },
    confidence: 1,
    evidence: [],
  };
  await assert.rejects(writeRecord(session, foreignAssertion), ManagementError);
  await materializeRecord(session, foreignAssertion, { actor: "test-operator", reference: "test" });
  const stored = await store.getAssertion(foreignAssertion.id);
  assert.ok(stored?.provenance.reference?.startsWith("explicit-materialization:"));
  await store.close();
});

test("management tools and explain produce structured output", async () => {
  const legacy = await realLegacy();
  const plan = buildMigrationPlan(legacy, LOCI, { reference: "provider-registry.json", plannedAt: PLANNED_AT });
  const store = await openStore();
  await applyMigration(store, plan);
  const session = { store, owningSite: LOCI.targetSite };

  // Make one credential feasible so resolution can plan.
  await store.putAssertion({
    schema: "narada.invokable-intelligence.capability-assertion.v1",
    id: "assert:test-openai-feasible",
    subject: { kind: "credential-locator", id: "credential-locator:openai-api" },
    capability: { family: "credential", name: "feasible" },
    value: true,
    scope: { locus: "host-site", site: LOCI.hostSite },
    provenance: { source: "probe", recorded_at: PLANNED_AT },
    validity: { fresh_as_of: PLANNED_AT },
    confidence: 1,
    evidence: [],
  });

  const tools = createManagementTools(session);
  const byName = new Map(tools.map((t) => [t.name, t]));

  const resources = (await byName.get("intelligence_list_resources")?.handler({ kind: "model" })) as unknown[];
  assert.ok(resources.length > 0);

  const validation = (await byName.get("intelligence_validate_store")?.handler({})) as { ok: boolean; errors: unknown[] };
  assert.equal(validation.ok, true);

  const explanation = (await byName.get("intelligence_explain_resolution")?.handler({
    intent: {
      schema: "narada.invokable-intelligence.invocation-intent.v1",
      id: "intent:test-explain",
      created_at: PLANNED_AT,
      purpose: "test",
      requested_model: { kind: "model", id: "model:openai-gpt-5.6-sol" },
    },
    targetSite: "site:thoughts-project",
    userSite: "site:andrey-user",
    hostSite: "site:andrey-pc",
    time: PLANNED_AT,
  })) as { result: { schema: string }; lines: string[] };
  assert.equal(explanation.result.schema, "narada.invokable-intelligence.invocation-plan.v1");
  assert.ok(explanation.lines.some((line) => line.includes("selected model model:openai-gpt-5.6-sol")));
  await store.close();
});

test("SQLite and D1 admit identical canonical migration seeds", async () => {
  const plan = buildMigrationPlan(await realLegacy(), LOCI, { reference: "provider-registry.json", plannedAt: PLANNED_AT });
  const sqlite = await SqliteRegistryStore.open(":memory:");
  const fake = createFakeD1(":memory:");
  const d1 = await D1RegistryStore.open(fake);
  try {
    await applyMigration(sqlite, plan);
    await applyMigration(d1, plan);
    assert.deepEqual(await sqlite.listCatalogRecords(), await d1.listCatalogRecords());
    assert.deepEqual(await sqlite.listCatalogResiduals(), await d1.listCatalogResiduals());
    assert.deepEqual(await sqlite.listResources(), await d1.listResources());
  } finally {
    await sqlite.close();
    fake.close();
  }
});

test("secret-bearing and authority-escalating legacy inputs become structured residuals", () => {
  const secretBearing = parseLegacyRegistry({
    schema: "narada.carrier.provider_registry.v1",
    default_provider: "bad-api",
    providers: {
      "bad-api": {
        adapter_kind: "openai-compatible-chat-completions",
        available_models: ["bad-model"],
        default_model: "bad-model",
        api_key: "raw-secret-must-not-migrate",
      },
    },
  });
  const plan = buildMigrationPlan(secretBearing, LOCI, { reference: "bad.json", plannedAt: PLANNED_AT });
  assert.equal(plan.resources.some(({ id }) => id === "inference-provider:bad-api"), false);
  assert.ok(plan.residuals.some(({ code, disposition }) => code === "secret-bearing-input" && disposition === "rejected"));

  const ambiguous = parseLegacyRegistry({
    schema: "narada.carrier.provider_registry.v1",
    providers: {
      "unknown-api": {
        adapter_kind: "openai-compatible-chat-completions",
        available_models: ["mystery-model"],
      },
    },
  });
  const ambiguousPlan = buildMigrationPlan(ambiguous, LOCI, { reference: "ambiguous.json", plannedAt: PLANNED_AT });
  assert.equal(ambiguousPlan.resources.some(({ id }) => id === "inference-provider:unknown-api"), false);
  assert.ok(ambiguousPlan.residuals.some(({ code, disposition }) => code === "ambiguous-model-provider" && disposition === "rejected"));
});

test("CLI validate runs against a store file", async () => {
  const tmpDb = join(process.cwd(), `.tmp-test-${process.pid}.db`);
  const store = await SqliteRegistryStore.open(tmpDb);
  await store.close();
  const logged: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    const code = await main(["--db", tmpDb, "validate"]);
    assert.equal(code, 0);
    assert.ok(logged.some((line) => line.includes('"ok": true')));
  } finally {
    console.log = original;
    await rm(tmpDb, { force: true });
  }
});
