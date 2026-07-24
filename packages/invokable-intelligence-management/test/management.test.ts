import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CANONICAL_CATALOG_SEED_SCHEMA,
  buildCanonicalLocalTestSeed,
  buildCanonicalCloudflareTestSeed,
  canonicalSha256,
  canonicalTestClock,
  MATERIALIZATION_ADMISSION_SCHEMA,
  MATERIALIZATION_ENVELOPE_SCHEMA,
  MATERIALIZATION_REVOCATION_SCHEMA,
  materializationProjectionKey,
} from "@narada2/invokable-intelligence-contract";
import type {
  CanonicalCatalogRecord,
  IntelligenceAuthorityStatement,
  InvocationIntent,
  MaterializationAdmission,
  MaterializationEnvelope,
  MaterializationRevocation,
  MaterializationStoreKind,
} from "@narada2/invokable-intelligence-contract";
import {
  D1MaterializationStore,
  SqliteMaterializationStore,
} from "@narada2/invokable-intelligence-materialization";
import {
  createFakeD1,
  D1RegistryStore,
  SqliteRegistryStore,
} from "@narada2/invokable-intelligence-registry";
import type { ResolverContext } from "@narada2/invokable-intelligence-resolver";

import { main } from "../src/cli.js";
import {
  MANAGEMENT_DEPLOYMENT_BUNDLE_SCHEMA,
  MANAGEMENT_DEPLOYMENT_RESULT_SCHEMA,
} from "../src/deployment.js";
import type { ManagementDeploymentBundle } from "../src/deployment.js";
import { parseLegacyRegistry } from "../src/legacy.js";
import { inspectLocalIntelligenceReadiness } from "../src/local-readiness.js";
import type { LocalReadinessContext } from "../src/local-readiness.js";
import { createManagementTools } from "../src/mcp-tools.js";
import { buildMigrationPlan } from "../src/migrate.js";
import { MigrationValidationError } from "../src/migrate.js";
import {
  MANAGEMENT_ERROR_SCHEMA,
  MANAGEMENT_MUTATION_CONTEXT_SCHEMA,
  MANAGEMENT_RESULT_SCHEMA,
  IntelligenceManagementService,
  ManagementError,
  managementErrorResult,
} from "../src/service.js";
import type {
  ManagementErrorResult,
  ManagementMutationContext,
  ManagementResult,
  ManagementSession,
} from "../src/service.js";

const TARGET = { kind: "site", id: "site:thoughts-project" } as const;
const USER = { kind: "site", id: "site:andrey-user" } as const;
const HOST = { kind: "site", id: "site:andrey-pc" } as const;
const PRINCIPAL = "principal:andrey";
const ACTOR = "operator:destination-admission";
const AUTHORITY_REF = "evidence:destination-management-authority";
const CONSENT_REF = "evidence:principal-consent";
const DECIDED_AT = "2026-07-19T00:00:01Z";
const REAL_REGISTRY = new URL("../assets/provider-registry.bootstrap.json", import.meta.url);

test("management error output preserves migration validator diagnostics", () => {
  const error = new MigrationValidationError("route:legacy-route", {
    code: "topology_boundary_admission_missing",
    message: "Edge legacy-edge requires validated trust-policy and network-path admission evidence.",
  });
  const result = managementErrorResult(error);
  assert.equal(result.error.code, "migration_validation_failed");
  assert.match(result.error.message, /Edge legacy-edge requires validated trust-policy/);
  assert.deepEqual(result.error.diagnostics, [{
    subject: "route:legacy-route",
    code: "topology_boundary_admission_missing",
    message: "Edge legacy-edge requires validated trust-policy and network-path admission evidence.",
  }]);
});

test("local readiness is read-only, requires explicit principal binding, and accepts a complete canonical graph", async () => {
  const { session, close } = await sqliteSession();
  try {
    const seed = buildCanonicalLocalTestSeed({
      now: DECIDED_AT,
      validUntil: "2026-07-20T00:00:00Z",
    });
    const principalRecord = seed.records.find(({ record_id }) => record_id === PRINCIPAL);
    assert.ok(principalRecord, "canonical fixture must contain the invocation principal");
    const principal = principalRecord.document as {
      id: string;
      admission_bindings?: unknown[];
    };
    principal.admission_bindings = [{
      id: "binding:andrey:site-roster",
      kind: "site-membership",
      registry: "site-roster",
      site_id: "site:narada",
      roles: ["resident"],
      auth_types: ["user-site-session"],
    }];
    principalRecord.source.digest = canonicalSha256(principal);
    await session.store.loadCatalogSeed(seed);
    const before = await session.store.listCatalogRecords();

    const missingBinding = await inspectLocalIntelligenceReadiness(session.store, localReadinessContext({ principal_binding: null }));
    assert.equal(missingBinding.status, "blocked");
    assert.equal(missingBinding.checks.find(({ id }) => id === "principal-binding")?.code, "principal-binding-context-required");

    const ready = await inspectLocalIntelligenceReadiness(session.store, localReadinessContext());
    assert.equal(ready.status, "ready", JSON.stringify(ready, null, 2));
    assert.ok(ready.checks.every(({ status }) => status === "ready"), JSON.stringify(ready.checks, null, 2));
    assert.ok(ready.route_readiness.some(({ eligible }) => eligible));
    assert.deepEqual(await session.store.listCatalogRecords(), before, "readiness inspection must not mutate the catalog");
  } finally {
    await close();
  }
});

function resolverContext(instant = DECIDED_AT): ResolverContext {
  return {
    targetSite: TARGET,
    userSite: USER,
    hostSite: HOST,
    runtime: "node",
    clock: canonicalTestClock(instant),
    access: {
      action: "invoke",
      requested_region: "global",
      data_classification: "internal",
      requested_retention_days: 0,
      provider_training: "prohibited",
      expected_usage: { amount: 1, unit: "requests" },
      expected_cost: { amount: 1, currency: "USD" },
    },
    topology_observations: [],
  };
}

function localReadinessContext(overrides: Partial<LocalReadinessContext> = {}): LocalReadinessContext {
  return {
    target_site_id: "site:narada",
    user_site_id: "site:user",
    host_site_id: "site:pc",
    principal_id: PRINCIPAL,
    now: DECIDED_AT,
    principal_binding: {
      actor: { principal_id: PRINCIPAL, auth_type: "user-site-session" },
      memberships: [{
        registry: "site-roster",
        site_id: "site:narada",
        role: "resident",
        evidence_ref: "evidence:principal-membership",
      }],
      evidence_refs: ["evidence:principal-membership"],
    },
    ...overrides,
  };
}

async function deploymentBundle(): Promise<ManagementDeploymentBundle> {
  const catalog = buildCanonicalCloudflareTestSeed({
    targetSiteId: TARGET.id,
    principalId: PRINCIPAL,
    now: DECIDED_AT,
    validUntil: "2026-07-20T00:00:00Z",
  });
  catalog.id = "catalog-seed:management-deployment:r1";
  catalog.records = catalog.records.filter(({ authority }) =>
    authority.site_id === TARGET.id
    || (authority.site_id === undefined && authority.locus === "runtime-observer"));
  return {
    schema: MANAGEMENT_DEPLOYMENT_BUNDLE_SCHEMA,
    id: "deployment:management-test:r1",
    owning_site: TARGET,
    actor_id: ACTOR,
    principal_id: PRINCIPAL,
    consent_ref: CONSENT_REF,
    destination_authority: {
      site_id: TARGET.id,
      locus: "target-site",
      authority_ref: AUTHORITY_REF,
    },
    decided_at: DECIDED_AT,
    evidence_refs: [CONSENT_REF, AUTHORITY_REF],
    catalog: { ...catalog, schema: CANONICAL_CATALOG_SEED_SCHEMA, created_at: DECIDED_AT },
    materializations: [],
  };
}

function preferenceDocument(revision: number) {
  return {
    schema: "narada.invokable-intelligence.policy.v1" as const,
    id: `policy:management-thinking-r${revision}`,
    locus: "user-site" as const,
    site: USER,
    kind: "preferences" as const,
    rules: [{
      type: "prefer-resource" as const,
      resource: { kind: "model" as const, id: "model:kimi-k2-instruct" },
      weight: revision,
    }],
    revision,
  };
}

function materializationRecords(value: MaterializationEnvelope): {
  statement_record: CanonicalCatalogRecord;
  payload_record: CanonicalCatalogRecord;
} {
  const revision = value.statement.source_revision;
  const payload = preferenceDocument(revision);
  assert.equal(value.statement.payload_digest, canonicalSha256(payload));
  const validation = {
    status: "accepted" as const,
    validator: "management-test-origin-validator/1",
    validated_at: value.issued_at,
    evidence: [{ kind: "document", ref: "evidence:user-preference:r7" }],
  };
  const payload_record: CanonicalCatalogRecord = {
    schema: "narada.invokable-intelligence.canonical-catalog-record.v1",
    id: value.statement.payload_ref,
    record_kind: "policy",
    record_id: payload.id,
    revision,
    source: {
      schema: "narada.test.user-site-preference.v1",
      reference: "evidence:user-preference:r7",
      revision: String(revision),
      digest: canonicalSha256(payload),
    },
    authority: {
      kind: "user-preference",
      locus: value.origin.locus,
      site_id: value.origin.site_id,
      authority_ref: value.origin.authority_ref,
    },
    validation,
    document: payload,
  };
  const statement: IntelligenceAuthorityStatement = {
    schema: "narada.invokable-intelligence.authority-statement.v1",
    id: value.statement.id,
    kind: value.statement.kind,
    origin: { ...value.origin },
    effect: value.statement.effect,
    revision,
    issued_at: value.issued_at,
    payload_ref: payload.id,
  };
  const statement_record: CanonicalCatalogRecord = {
    schema: "narada.invokable-intelligence.canonical-catalog-record.v1",
    id: `catalog-record:management-statement:${revision}`,
    record_kind: "authority-statement",
    record_id: statement.id,
    revision,
    source: {
      schema: "narada.test.user-site-preference.v1",
      reference: "evidence:user-preference:r7",
      revision: String(revision),
      digest: canonicalSha256(statement),
    },
    authority: {
      kind: statement.kind,
      locus: statement.origin.locus,
      site_id: statement.origin.site_id,
      authority_ref: statement.origin.authority_ref,
    },
    validation,
    document: statement,
  };
  return { statement_record, payload_record };
}

async function catalogRecord(): Promise<CanonicalCatalogRecord> {
  const legacy = parseLegacyRegistry(JSON.parse(await readFile(REAL_REGISTRY, "utf8")));
  const plan = buildMigrationPlan(legacy, {
    targetSite: TARGET,
    userSite: USER,
    hostSite: HOST,
  }, { reference: "provider-registry.json", plannedAt: "2026-07-19T00:00:00Z" });
  const record = plan.seed.records.find(({ authority }) =>
    authority.site_id === TARGET.id && authority.locus === "target-site");
  assert.ok(record, "migration fixture must contain target-Site authority");
  return structuredClone(record);
}

function catalogContext(record: CanonicalCatalogRecord, destination = TARGET.id): ManagementMutationContext {
  return {
    schema: MANAGEMENT_MUTATION_CONTEXT_SCHEMA,
    actor_id: ACTOR,
    principal_id: PRINCIPAL,
    consent_ref: CONSENT_REF,
    authority: {
      site_id: destination,
      locus: record.authority.locus,
      authority_ref: record.authority.authority_ref,
    },
    destination_site_id: destination,
    target_site_id: TARGET.id,
    decided_at: DECIDED_AT,
    evidence_refs: [
      CONSENT_REF,
      record.authority.authority_ref,
      ...record.validation.evidence.map(({ ref }) => ref),
    ],
  };
}

function envelope(
  revision = 1,
  options: { id?: string; supersedes?: string; store?: MaterializationStoreKind; resolver?: "local" | "cloudflare" } = {},
): MaterializationEnvelope {
  const payload = preferenceDocument(revision);
  return {
    schema: MATERIALIZATION_ENVELOPE_SCHEMA,
    id: options.id ?? `materialization:management-preference:${revision}`,
    mode: "durable-projection",
    origin: {
      site_id: USER.id,
      locus: "user-site",
      authority_ref: "authority:user-preferences:r7",
    },
    destination: {
      site_id: TARGET.id,
      resolver: options.resolver ?? "local",
      store: options.store ?? "sqlite",
    },
    statement: {
      id: "authority-statement:management-thinking",
      kind: "user-preference",
      effect: "ranking",
      source_revision: revision,
      payload_digest: canonicalSha256(payload),
      payload_ref: `catalog-record:management-preference:${revision}`,
    },
    allowed_scope: {
      purposes: ["operator-chat"],
      target_site_ids: [TARGET.id],
      principal_ids: [PRINCIPAL],
    },
    issued_at: "2026-07-19T00:00:00Z",
    expires_at: "2026-07-20T00:00:00Z",
    provenance_refs: ["evidence:user-preference:r7"],
    authorization_ref: "grant:materialize-user-preference:r7",
    ...(options.supersedes ? { supersedes: options.supersedes } : {}),
  };
}

function admission(
  value: MaterializationEnvelope,
  decision: MaterializationAdmission["decision"] = "admitted",
): MaterializationAdmission {
  return {
    schema: MATERIALIZATION_ADMISSION_SCHEMA,
    id: `admission:${value.id}:${decision}`,
    envelope_id: value.id,
    destination_site_id: TARGET.id,
    decision,
    decided_at: DECIDED_AT,
    decided_by: ACTOR,
    reason_codes: decision === "admitted" ? [] : ["destination-policy-refusal"],
    evidence_refs: ["evidence:destination-admission", AUTHORITY_REF, CONSENT_REF],
    ...(decision === "admitted" ? { admitted_digest: value.statement.payload_digest } : {}),
  };
}

function materializationContext(
  admitted: MaterializationAdmission,
  decidedAt = admitted.decided_at,
): ManagementMutationContext {
  return {
    schema: MANAGEMENT_MUTATION_CONTEXT_SCHEMA,
    actor_id: admitted.decided_by,
    principal_id: PRINCIPAL,
    consent_ref: CONSENT_REF,
    authority: { site_id: TARGET.id, locus: "target-site", authority_ref: AUTHORITY_REF },
    destination_site_id: TARGET.id,
    target_site_id: TARGET.id,
    decided_at: decidedAt,
    evidence_refs: [...admitted.evidence_refs],
  };
}

async function sqliteSession(): Promise<{ session: ManagementSession; close(): Promise<void> }> {
  const store = await SqliteRegistryStore.open(":memory:");
  const materialization = await SqliteMaterializationStore.open(":memory:");
  return {
    session: { store, materialization, owningSite: TARGET },
    close: async () => { await Promise.all([materialization.close(), store.close()]); },
  };
}

function asResult(value: unknown): ManagementResult {
  const candidate = value as ManagementResult;
  assert.equal(candidate.schema, MANAGEMENT_RESULT_SCHEMA);
  return candidate;
}

test("library service governs list/show/validate/admit, paging, foreign writes, and secrets", async () => {
  const { session, close } = await sqliteSession();
  try {
    const service = new IntelligenceManagementService(session);
    const record = await catalogRecord();
    const admitted = asResult(await service.execute({
      operation: "admit-catalog-record",
      record,
      context: catalogContext(record),
    }));
    assert.equal(admitted.operation, "admit-catalog-record");
    assert.equal((admitted.data as { receipt: { actor_id: string } }).receipt.actor_id, ACTOR);
    assert.ok(await session.store.getCatalogRecord(record.id));

    const replay = asResult(await service.execute({
      operation: "admit-catalog-record",
      record,
      context: catalogContext(record),
    }));
    assert.deepEqual(replay.data, admitted.data);

    const listed = asResult(await service.execute({
      operation: "list",
      collection: "catalog-records",
      page: { offset: 0, limit: 1 },
    }));
    assert.equal((listed.data as { items: unknown[] }).items.length, 1);
    assert.equal((listed.data as { page: { limit: number } }).page.limit, 1);

    const shown = asResult(await service.execute({ operation: "show", entity: "catalog-record", id: record.id }));
    assert.equal((shown.data as CanonicalCatalogRecord).id, record.id);
    assert.equal(asResult(await service.execute({ operation: "validate" })).operation, "validate");

    const foreign = structuredClone(record);
    foreign.authority.site_id = HOST.id;
    await assert.rejects(
      service.execute({ operation: "admit-catalog-record", record: foreign, context: catalogContext(foreign) }),
      (error: unknown) => error instanceof ManagementError && error.code === "foreign-locus-mutation",
    );

    const secretBearing = { ...structuredClone(record), api_key: "sk-this-value-must-never-escape" } as CanonicalCatalogRecord;
    const refusal = await service.executeSafe({
      operation: "admit-catalog-record",
      record: secretBearing,
      context: catalogContext(record),
    }) as ManagementErrorResult;
    assert.equal(refusal.schema, MANAGEMENT_ERROR_SCHEMA);
    assert.equal(refusal.error.code, "secret-bearing-input");
    assert.equal(JSON.stringify(refusal).includes("sk-this-value"), false);

    await assert.rejects(
      service.execute({
        operation: "explain-resolution",
        resolver: "local",
        intent: { schema: "narada.invokable-intelligence.invocation-intent.v1", id: "intent:no-time", created_at: DECIDED_AT, purpose: "test" },
        context: resolverContext(""),
      }),
      (error: unknown) => error instanceof ManagementError && error.code === "explicit-time-required",
    );
  } finally {
    await close();
  }
});

test("atomic catalog-seed admission validates a complete graph before writing any record", async () => {
  const canonical = buildCanonicalCloudflareTestSeed({
    targetSiteId: TARGET.id,
    principalId: PRINCIPAL,
    now: DECIDED_AT,
    validUntil: "2026-07-20T00:00:01Z",
  });
  const destinationRecords = canonical.records.filter((record) =>
    record.authority.site_id === TARGET.id
    || (record.authority.site_id === undefined && record.authority.locus === "runtime-observer")
  );
  const route = destinationRecords.find(({ record_kind }) => record_kind === "route");
  assert.ok(route);
  const records = [route, ...destinationRecords.filter(({ id }) => id !== route.id)];
  const seed = { ...canonical, id: "catalog-seed:management-atomic", records, residuals: [] };
  const record_contexts = Object.fromEntries(records.map((record) => [record.id, catalogContext(record)]));

  const successful = await sqliteSession();
  try {
    const service = new IntelligenceManagementService(successful.session);
    const admitted = asResult(await service.execute({
      operation: "admit-catalog-seed",
      seed,
      record_contexts,
      context: catalogContext(records[0]),
    }));
    assert.equal(admitted.operation, "admit-catalog-seed");
    assert.equal((admitted.data as { record_receipts: unknown[] }).record_receipts.length, records.length);
    assert.ok(await successful.session.store.getCatalogRecord(route.id));
    assert.equal((await successful.session.store.listCatalogRecords()).length, records.length);
  } finally {
    await successful.close();
  }

  const refused = await sqliteSession();
  try {
    const service = new IntelligenceManagementService(refused.session);
    const invalidSeed = structuredClone(seed);
    const invalidRoute = invalidSeed.records.find(({ record_kind }) => record_kind === "route");
    assert.ok(invalidRoute);
    const routeDocument = invalidRoute.document as { topology: { nodes: Array<{ kind: string }> } };
    routeDocument.topology.nodes = routeDocument.topology.nodes.filter(({ kind }) => kind !== "client");
    invalidRoute.source.digest = canonicalSha256(invalidRoute.document);
    await assert.rejects(
      service.execute({
        operation: "admit-catalog-seed",
        seed: invalidSeed,
        record_contexts,
        context: catalogContext(records[0]),
      }),
      (error: unknown) => error instanceof Error && error.message.includes("client node"),
    );
    assert.equal((await refused.session.store.listCatalogRecords()).length, 0);
  } finally {
    await refused.close();
  }
});

test("all materialization management operations preserve audit and idempotency", async () => {
  const { session, close } = await sqliteSession();
  try {
    const service = new IntelligenceManagementService(session);
    const first = envelope();
    const firstAdmission = admission(first);
    const firstRequest = {
      operation: "materialize" as const,
      envelope: first,
      admission: firstAdmission,
      ...materializationRecords(first),
      context: materializationContext(firstAdmission),
    };
    const applied = asResult(await service.execute(firstRequest));
    assert.equal((applied.data as { result: { status: string } }).result.status, "applied");
    const replay = asResult(await service.execute(firstRequest));
    assert.equal((replay.data as { result: { status: string } }).result.status, "idempotent");

    const inspected = asResult(await service.execute({
      operation: "inspect-materialization",
      projection_key: materializationProjectionKey(first),
    }));
    assert.equal((inspected.data as { audit: unknown[] }).audit.length, 1);

    const second = envelope(2, { supersedes: first.id });
    const secondAdmission = admission(second);
    const refreshed = asResult(await service.execute({
      operation: "refresh",
      envelope: second,
      admission: secondAdmission,
      ...materializationRecords(second),
      context: materializationContext(secondAdmission),
    }));
    assert.equal((refreshed.data as { result: { operation: string } }).result.operation, "refresh");

    const rejectedEnvelope = envelope(3, { id: "materialization:management-preference:rejected", supersedes: second.id });
    const rejectedAdmission = admission(rejectedEnvelope, "rejected");
    const rejected = asResult(await service.execute({
      operation: "reject-materialization",
      envelope: rejectedEnvelope,
      admission: rejectedAdmission,
      context: materializationContext(rejectedAdmission),
    }));
    assert.equal(rejected.ok, false);
    assert.equal((rejected.data as { result: { status: string } }).result.status, "rejected");

    const explained = asResult(await service.execute({
      operation: "explain-materialization",
      envelope_id: second.id,
    }));
    assert.ok((explained.data as { lines: string[] }).lines.some((line) => line.includes("refresh:applied")));

    const revocation: MaterializationRevocation = {
      schema: MATERIALIZATION_REVOCATION_SCHEMA,
      id: "revocation:management-preference:2",
      envelope_id: second.id,
      statement_id: second.statement.id,
      source_revision: second.statement.source_revision,
      origin: { ...second.origin },
      revoked_at: "2026-07-19T00:00:02Z",
      reason_code: "operator-revoked",
      evidence_ref: "evidence:origin-revocation",
    };
    const revokeAdmission = admission(second);
    const revokeContext = materializationContext(revokeAdmission, revocation.revoked_at);
    revokeContext.evidence_refs.push(revocation.evidence_ref);
    const revoked = asResult(await service.execute({
      operation: "revoke-materialization",
      revocation,
      context: revokeContext,
    }));
    assert.equal((revoked.data as { result: { operation: string } }).result.operation, "revoke");

    const audit = asResult(await service.execute({ operation: "list", collection: "materialization-audit" }));
    const operations = (audit.data as { items: Array<{ operation: string }> }).items.map(({ operation }) => operation);
    assert.ok(operations.includes("materialize"));
    assert.ok(operations.includes("refresh"));
    assert.ok(operations.includes("reject"));
    assert.ok(operations.includes("revoke"));
  } finally {
    await close();
  }
});

test("MCP projection uses immutable refs and exactly the canonical result/error contracts", async () => {
  const { session, close } = await sqliteSession();
  try {
    const record = await catalogRecord();
    const first = envelope();
    const firstAdmission = admission(first);
    const firstRecords = materializationRecords(first);
    const bundle = await deploymentBundle();
    const intent: InvocationIntent = {
      schema: "narada.invokable-intelligence.invocation-intent.v1",
      id: "intent:mcp-explain",
      created_at: DECIDED_AT,
      purpose: "test",
      requested_model: { kind: "model", id: "model:openai-gpt-5.6-sol" },
    };
    const refs = new Map<string, unknown>([
      ["input:record", record],
      ["input:intent", intent],
      ["input:resolver-context", resolverContext()],
      ["input:envelope", first],
      ["input:admission", firstAdmission],
      ["input:statement-record", firstRecords.statement_record],
      ["input:payload-record", firstRecords.payload_record],
      ["input:deployment-bundle", bundle],
      ["input:readiness-context", localReadinessContext({ principal_binding: null })],
    ]);
    session.resolveInputRef = async (ref) => {
      if (!refs.has(ref)) throw new ManagementError("input-not-found", "Immutable input reference was not found.");
      return refs.get(ref);
    };
    const tools = new Map(createManagementTools(session).map((tool) => [tool.name, tool]));

    const deployed = await tools.get("intelligence_management_deploy")!.handler({
      bundle_ref: "input:deployment-bundle",
    }) as { schema: string };
    assert.equal(deployed.schema, MANAGEMENT_DEPLOYMENT_RESULT_SCHEMA, JSON.stringify(deployed, null, 2));

    const admitted = asResult(await tools.get("intelligence_management_admit_catalog_record")!.handler({
      record_ref: "input:record",
      context: catalogContext(record),
    }));
    assert.equal(admitted.operation, "admit-catalog-record");
    assert.equal(asResult(await tools.get("intelligence_management_list")!.handler({ collection: "catalog-records" })).operation, "list");
    assert.equal(asResult(await tools.get("intelligence_management_show")!.handler({ entity: "catalog-record", id: record.id })).operation, "show");
    assert.equal(asResult(await tools.get("intelligence_management_validate")!.handler({})).operation, "validate");
    const readiness = asResult(await tools.get("intelligence_management_local_readiness")!.handler({
      context_ref: "input:readiness-context",
    }));
    assert.equal(readiness.operation, "local-readiness");
    assert.equal((readiness.data as { status: string }).status, "blocked");

    const explained = asResult(await tools.get("intelligence_management_explain_resolution")!.handler({
      resolver: "local",
      intent_ref: "input:intent",
      context_ref: "input:resolver-context",
    }));
    assert.equal(explained.operation, "explain-resolution");

    const rawPayloadRefusal = await tools.get("intelligence_management_explain_resolution")!.handler({
      intent,
      context_ref: "input:resolver-context",
    }) as ManagementErrorResult;
    assert.equal(rawPayloadRefusal.schema, MANAGEMENT_ERROR_SCHEMA);
    assert.equal(rawPayloadRefusal.error.code, "input-reference-required");

    const materialized = asResult(await tools.get("intelligence_management_materialize")!.handler({
      envelope_ref: "input:envelope",
      admission_ref: "input:admission",
      statement_record_ref: "input:statement-record",
      payload_record_ref: "input:payload-record",
      context: materializationContext(firstAdmission),
    }));
    assert.equal(materialized.operation, "materialize");
    assert.equal(asResult(await tools.get("intelligence_management_inspect_materialization")!.handler({ envelope_id: first.id })).operation, "inspect-materialization");
  } finally {
    await close();
  }
});

async function runCli(args: string[]): Promise<{ code: number; output: unknown }> {
  const logged: string[] = [];
  const original = console.log;
  console.log = (...values: unknown[]) => logged.push(values.map(String).join(" "));
  try {
    const code = await main(args);
    return { code, output: JSON.parse(logged.at(-1) ?? "null") as unknown };
  } finally {
    console.log = original;
  }
}

test("CLI is a file-reference projection of the same canonical service", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narada-intelligence-management-"));
  try {
    const db = join(directory, "intelligence.db");


    const record = await catalogRecord();
    const recordPath = join(directory, "record.json");
    const contextPath = join(directory, "context.json");
    await writeFile(recordPath, JSON.stringify(record));
    await writeFile(contextPath, JSON.stringify(catalogContext(record)));

    const admitted = await runCli([
      "--db", db, "--owning-site", TARGET.id,
      "admit-catalog-record", "--record", recordPath, "--context", contextPath,
    ]);
    assert.equal(admitted.code, 0);
    assert.equal((admitted.output as ManagementResult).schema, MANAGEMENT_RESULT_SCHEMA);
    assert.equal((admitted.output as ManagementResult).operation, "admit-catalog-record");

    const listed = await runCli(["--db", db, "--owning-site", TARGET.id, "list", "catalog-records", "--limit", "1"]);
    assert.equal(listed.code, 0);
    assert.equal((listed.output as ManagementResult).operation, "list");

    const shown = await runCli(["--db", db, "--owning-site", TARGET.id, "show", "catalog-record", record.id]);
    assert.equal(shown.code, 0);
    assert.equal((shown.output as ManagementResult).operation, "show");

    const first = envelope();
    const firstAdmission = admission(first);
    const firstRecords = materializationRecords(first);
    const envelopePath = join(directory, "envelope.json");
    const admissionPath = join(directory, "admission.json");
    const materializationContextPath = join(directory, "materialization-context.json");
    const statementRecordPath = join(directory, "statement-record.json");
    const payloadRecordPath = join(directory, "payload-record.json");
    await writeFile(envelopePath, JSON.stringify(first));
    await writeFile(admissionPath, JSON.stringify(firstAdmission));
    await writeFile(materializationContextPath, JSON.stringify(materializationContext(firstAdmission)));
    await writeFile(statementRecordPath, JSON.stringify(firstRecords.statement_record));
    await writeFile(payloadRecordPath, JSON.stringify(firstRecords.payload_record));
    const materialized = await runCli([
      "--db", db, "--owning-site", TARGET.id,
      "materialize", "--envelope", envelopePath, "--admission", admissionPath,
      "--statement-record", statementRecordPath, "--payload-record", payloadRecordPath,
      "--context", materializationContextPath,
    ]);
    assert.equal(materialized.code, 0);
    assert.equal((materialized.output as ManagementResult).operation, "materialize");

    const inspected = await runCli([
      "--db", db, "--owning-site", TARGET.id,
      "inspect-materialization", "--envelope-id", first.id,
    ]);
    assert.equal(inspected.code, 0);
    assert.equal((inspected.output as ManagementResult).operation, "inspect-materialization");

    const intent: InvocationIntent = {
      schema: "narada.invokable-intelligence.invocation-intent.v1",
      id: "intent:cli-explain",
      created_at: DECIDED_AT,
      purpose: "test",
    };
    const intentPath = join(directory, "intent.json");
    const resolverContextPath = join(directory, "resolver-context.json");
    await writeFile(intentPath, JSON.stringify(intent));
    await writeFile(resolverContextPath, JSON.stringify(resolverContext()));
    const explained = await runCli([
      "--db", db, "--owning-site", TARGET.id,
      "explain-resolution", "--resolver", "local", "--intent", intentPath,
      "--context", resolverContextPath,
    ]);
    assert.equal(explained.code, 0);
    assert.equal((explained.output as ManagementResult).operation, "explain-resolution");

    const validation = await runCli(["--db", db, "--owning-site", TARGET.id, "validate"]);
    assert.equal((validation.output as ManagementResult).operation, "validate");

    const readinessContextPath = join(directory, "readiness-context.json");
    await writeFile(readinessContextPath, JSON.stringify({
      target_site_id: TARGET.id,
      user_site_id: USER.id,
      host_site_id: HOST.id,
      principal_id: PRINCIPAL,
      now: DECIDED_AT,
    }));
    const readiness = await runCli([
      "--db", db, "--owning-site", TARGET.id,
      "local-readiness", "--context", readinessContextPath,
    ]);
    assert.equal(readiness.code, 2);
    assert.equal((readiness.output as ManagementResult).operation, "local-readiness");
    assert.equal((readiness.output as ManagementResult).ok, false);

    const bundlePath = join(directory, "deployment-bundle.json");
    const deploymentDb = join(directory, "deployment.db");
    await writeFile(bundlePath, JSON.stringify(await deploymentBundle()));
    const deployed = await runCli([
      "--db", deploymentDb, "--owning-site", TARGET.id,
      "deploy", "--bundle", bundlePath,
    ]);
    assert.equal(deployed.code, 0, JSON.stringify(deployed.output, null, 2));
    assert.equal((deployed.output as { schema: string }).schema, MANAGEMENT_DEPLOYMENT_RESULT_SCHEMA);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("D1 management session has the same catalog and materialization semantics", async () => {
  const binding = createFakeD1(":memory:");
  const store = await D1RegistryStore.open(binding);
  const materialization = await D1MaterializationStore.open(binding);
  try {
    const service = new IntelligenceManagementService({ store, materialization, owningSite: TARGET });
    const record = await catalogRecord();
    assert.equal(asResult(await service.execute({
      operation: "admit-catalog-record",
      record,
      context: catalogContext(record),
    })).operation, "admit-catalog-record");

    const first = envelope(1, { store: "d1", resolver: "cloudflare" });
    const firstAdmission = admission(first);
    assert.equal(asResult(await service.execute({
      operation: "materialize",
      envelope: first,
      admission: firstAdmission,
      ...materializationRecords(first),
      context: materializationContext(firstAdmission),
    })).operation, "materialize");
    assert.ok(await materialization.getProjection(materializationProjectionKey(first)));
  } finally {
    await Promise.all([materialization.close(), store.close()]);
    binding.close();
  }
});
