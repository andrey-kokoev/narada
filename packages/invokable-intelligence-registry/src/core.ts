/**
 * Shared registry implementation over a SqlExecutor. All store behavior
 * lives here so the node:sqlite and D1 adapters cannot drift apart.
 */

import {
  containsForbiddenSecretMaterial,
  validateAssertion,
  validateAuthoritativeDecisionClock,
  validateBundle,
  validateCanonicalCatalogRecord,
  validateIntelligenceAuthorityStatement,
  validateInvocation,
  validateInvocationAttemptTransition,
  validateInvocationTerminalOutcome,
  validateInvocationRouteCandidate,
  validateModelOfferingGraph,
  validatePlanDecisionSnapshot,
  validatePolicy,
  validateResource,
  validateRetainedPayloadRef,
  validateRouteCapabilityAssertion,
} from "@narada2/invokable-intelligence-contract";
import type {
  CapabilityAssertion,
  CanonicalCatalogRecord,
  CanonicalCatalogSeed,
  CatalogAdmissionResidual,
  CatalogTemporalInput,
  ContractError,
  FixtureBundle,
  InvocationAttempt,
  InvocationAuditEvidence,
  InvocationEvidence,
  InvocationExecutionAttempt,
  InvocationExecutionTransition,
  InvocationIntent,
  InvocationObservation,
  InvocationOperationalTelemetry,
  InvocationPlan,
  InvocationRefusal,
  InvocationResultEnvelope,
  InvocationRouteCandidate,
  InvocationTerminalOutcome,
  IntelligenceAuthorityStatement,
  ModelOffering,
  PlanDecisionSnapshot,
  PlanRevalidationEvidence,
  PolicyDocument,
  Resource,
  ResourceId,
  RouteCapabilityAssertion,
} from "@narada2/invokable-intelligence-contract";

import { MIGRATION_STATEMENTS, REGISTRY_SCHEMA_VERSION } from "./schema.js";
import { RegistryError } from "./store.js";
import type {
  AssertionFilter,
  CatalogRecordFilter,
  CatalogResidualFilter,
  IntelligenceRegistryStore,
  PolicyBindingRow,
  PolicyFilter,
  RelationRow,
  ResourceFilter,
  SqlExecutor,
  SqlStatement,
} from "./store.js";

function assertValid(errors: ContractError[], what: string): void {
  if (errors.length > 0) {
    throw new RegistryError("invalid-record", `${what} failed contract validation: ${errors[0].code} at ${errors[0].path}`, errors);
  }
}

function catalogRecordStatements(record: CanonicalCatalogRecord): SqlStatement[] {
  const statements: SqlStatement[] = [];
  switch (record.record_kind) {
    case "resource":
      statements.push(...resourceStatements(record.document as Resource));
      break;
    case "assertion":
      if (record.document.schema === "narada.invokable-intelligence.capability-assertion.v1") {
        statements.push(...assertionStatements(record.document as CapabilityAssertion, true));
      }
      break;
    case "policy":
      statements.push(...policyStatements(record.document as PolicyDocument));
      break;
    default:
      break;
  }
  statements.push({
    sql: "INSERT OR IGNORE INTO catalog_records (id, record_kind, record_id, revision, source_ref, source_revision, authority_kind, authority_locus, doc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    params: [
      record.id,
      record.record_kind,
      record.record_id,
      record.revision,
      record.source.reference,
      record.source.revision,
      record.authority.kind,
      record.authority.locus,
      JSON.stringify(record),
    ],
  });
  return statements;
}

function residualStatement(residual: CatalogAdmissionResidual): SqlStatement {
  return {
    sql: "INSERT OR IGNORE INTO catalog_residuals (id, code, disposition, source_path, doc) VALUES (?, ?, ?, ?, ?)",
    params: [residual.id, residual.code, residual.disposition, residual.source_path, JSON.stringify(residual)],
  };
}

interface DocRow {
  doc: string;
}

function extractRelations(resource: Resource): Array<{ relation: string; to_id: ResourceId }> {
  switch (resource.schema) {
    case "narada.invokable-intelligence.model.v1":
      return [{ relation: "provided-by", to_id: resource.provider.id }];
    case "narada.invokable-intelligence.model-offering.v1":
      return [
        { relation: "offers-model", to_id: resource.model.id },
        { relation: "published-by", to_id: resource.model_provider.id },
        { relation: "served-by", to_id: resource.inference_provider.id },
        { relation: "available-at", to_id: resource.endpoint.id },
      ];
    case "narada.invokable-intelligence.inference-endpoint.v1":
      return [
        { relation: "owned-by", to_id: resource.inference_provider.id },
        { relation: "driven-by", to_id: resource.adapter.id },
        ...resource.serves.map((ref) => ({ relation: "serves", to_id: ref.id })),
        ...(resource.credential ? [{ relation: "authenticated-by", to_id: resource.credential.id as ResourceId }] : []),
      ];
    case "narada.invokable-intelligence.credential-locator.v1":
      return [{ relation: "held-by", to_id: resource.holder.id }];
    default:
      return [];
  }
}

function extractPolicyBindings(policy: PolicyDocument): ResourceId[] {
  const ids = new Set<ResourceId>();
  for (const rule of policy.rules) {
    if (
      rule.type === "forbid-resource" ||
      rule.type === "prefer-resource" ||
      rule.type === "allow-resource" ||
      rule.type === "deny-resource"
    ) {
      ids.add(rule.resource.id);
    }
  }
  return [...ids].sort();
}

function resourceStatements(resource: Resource): SqlStatement[] {
  const statements: SqlStatement[] = [
    {
      sql: "INSERT OR REPLACE INTO resources (id, kind, schema, doc) VALUES (?, ?, ?, ?)",
      params: [resource.id, resource.id.split(":")[0], resource.schema, JSON.stringify(resource)],
    },
    { sql: "DELETE FROM resource_relations WHERE from_id = ?", params: [resource.id] },
    ...extractRelations(resource).map((rel) => ({
      sql: "INSERT INTO resource_relations (from_id, relation, to_id) VALUES (?, ?, ?)",
      params: [resource.id, rel.relation, rel.to_id],
    })),
  ];
  return statements;
}

function assertionStatements(assertion: CapabilityAssertion, replace: boolean): SqlStatement[] {
  const verb = replace ? "INSERT OR REPLACE" : "INSERT";
  return [
    {
      sql: `${verb} INTO assertions (id, subject_id, family, name, locus, site_id, confidence, superseded_by, doc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        assertion.id,
        assertion.subject.id,
        assertion.capability.family,
        assertion.capability.name,
        assertion.scope.locus,
        assertion.scope.site?.id ?? null,
        assertion.confidence,
        null,
        JSON.stringify(assertion),
      ],
    },
  ];
}

function policyStatements(policy: PolicyDocument): SqlStatement[] {
  return [
    {
      sql: "INSERT OR REPLACE INTO policies (id, locus, site_id, kind, revision, doc) VALUES (?, ?, ?, ?, ?, ?)",
      params: [policy.id, policy.locus, policy.site.id, policy.kind, policy.revision, JSON.stringify(policy)],
    },
    { sql: "DELETE FROM policy_bindings WHERE policy_id = ?", params: [policy.id] },
    ...extractPolicyBindings(policy).map((subjectId) => ({
      sql: "INSERT INTO policy_bindings (policy_id, subject_id) VALUES (?, ?)",
      params: [policy.id, subjectId],
    })),
  ];
}

export class RegistryStoreCore implements IntelligenceRegistryStore {
  constructor(
    private readonly executor: SqlExecutor,
    readonly dialect: "node-sqlite" | "cloudflare-d1",
  ) {}

  async migrate(): Promise<number> {
    const current = await this.schemaVersion();
    if (current >= REGISTRY_SCHEMA_VERSION) return current;
    const statements: SqlStatement[] = MIGRATION_STATEMENTS.map((sql) => ({ sql, params: [] }));
    statements.push({
      sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
      params: [REGISTRY_SCHEMA_VERSION, new Date().toISOString()],
    });
    await this.executor.transact(statements);
    return REGISTRY_SCHEMA_VERSION;
  }

  async schemaVersion(): Promise<number> {
    const row = await this.executor.get<{ version: number }>(
      "SELECT MAX(version) AS version FROM schema_migrations",
    ).catch(() => null);
    return row?.version ?? 0;
  }

  private async transact(statements: SqlStatement[]): Promise<void> {
    await this.executor.transact(statements);
  }

  private async insertImmutable(table: string, id: string, sql: string, params: unknown[], doc: unknown, keyColumn = "id"): Promise<void> {
    const serialized = JSON.stringify(doc);
    await this.executor.run(sql, ...params, serialized);
    const stored = await this.executor.get<DocRow>(`SELECT doc FROM ${table} WHERE ${keyColumn} = ?`, id);
    if (!stored || stored.doc !== serialized) {
      throw new RegistryError("immutable-record-conflict", `immutable ${table} record '${id}' conflicts with stored content`);
    }
  }

  async putResource(resource: Resource): Promise<void> {
    assertValid(validateResource(resource), `resource '${resource.id}'`);
    await this.transact(resourceStatements(resource));
  }

  async getResource(id: ResourceId): Promise<Resource | null> {
    const row = await this.executor.get<DocRow>("SELECT doc FROM resources WHERE id = ?", id);
    return row ? (JSON.parse(row.doc) as Resource) : null;
  }

  async listResources(filter: ResourceFilter = {}): Promise<Resource[]> {
    const rows = filter.kind
      ? await this.executor.all<DocRow>("SELECT doc FROM resources WHERE kind = ? ORDER BY id", filter.kind)
      : await this.executor.all<DocRow>("SELECT doc FROM resources ORDER BY id");
    return rows.map((row) => JSON.parse(row.doc) as Resource);
  }

  async listRelations(fromId: ResourceId): Promise<RelationRow[]> {
    return this.executor.all<RelationRow>(
      "SELECT from_id, relation, to_id FROM resource_relations WHERE from_id = ? ORDER BY relation, to_id",
      fromId,
    );
  }

  async putAssertion(assertion: CapabilityAssertion): Promise<void> {
    assertValid(validateAssertion(assertion), `assertion '${assertion.id}'`);
    await this.transact(assertionStatements(assertion, true));
  }

  async supersedeAssertion(supersededId: string, next: CapabilityAssertion): Promise<void> {
    if (supersededId === next.id) {
      throw new RegistryError("supersede-conflict", "an assertion cannot supersede itself");
    }
    assertValid(validateAssertion(next), `assertion '${next.id}'`);
    const existing = await this.getAssertion(supersededId);
    if (!existing) {
      throw new RegistryError("supersede-conflict", `cannot supersede missing assertion '${supersededId}'`);
    }
    const alreadySuperseded = await this.executor.get<{ superseded_by: string | null }>(
      "SELECT superseded_by FROM assertions WHERE id = ?",
      supersededId,
    );
    if (alreadySuperseded?.superseded_by) {
      throw new RegistryError(
        "supersede-conflict",
        `assertion '${supersededId}' is already superseded by '${alreadySuperseded.superseded_by}'`,
      );
    }
    if (await this.getAssertion(next.id)) {
      throw new RegistryError("supersede-conflict", `assertion '${next.id}' already exists`);
    }
    await this.transact([
      { sql: "UPDATE assertions SET superseded_by = ? WHERE id = ?", params: [next.id, supersededId] },
      ...assertionStatements(next, false),
    ]);
  }

  async getAssertion(id: string): Promise<CapabilityAssertion | null> {
    const row = await this.executor.get<DocRow>("SELECT doc FROM assertions WHERE id = ?", id);
    return row ? (JSON.parse(row.doc) as CapabilityAssertion) : null;
  }

  async listAssertions(filter: AssertionFilter = {}): Promise<CapabilityAssertion[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.subjectId !== undefined) {
      clauses.push("subject_id = ?");
      params.push(filter.subjectId);
    }
    if (filter.family !== undefined) {
      clauses.push("family = ?");
      params.push(filter.family);
    }
    if (filter.name !== undefined) {
      clauses.push("name = ?");
      params.push(filter.name);
    }
    if (filter.locus !== undefined) {
      clauses.push("locus = ?");
      params.push(filter.locus);
    }
    if (filter.siteId !== undefined) {
      clauses.push("site_id = ?");
      params.push(filter.siteId);
    }
    if (!filter.includeSuperseded) {
      clauses.push("superseded_by IS NULL");
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rows = await this.executor.all<DocRow>(`SELECT doc FROM assertions${where} ORDER BY id`, ...params);
    return rows.map((row) => JSON.parse(row.doc) as CapabilityAssertion);
  }

  async putPolicy(policy: PolicyDocument): Promise<void> {
    assertValid(validatePolicy(policy), `policy '${policy.id}'`);
    await this.transact(policyStatements(policy));
  }

  async getPolicy(id: string): Promise<PolicyDocument | null> {
    const row = await this.executor.get<DocRow>("SELECT doc FROM policies WHERE id = ?", id);
    return row ? (JSON.parse(row.doc) as PolicyDocument) : null;
  }

  async listPolicies(filter: PolicyFilter = {}): Promise<PolicyDocument[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.locus !== undefined) {
      clauses.push("locus = ?");
      params.push(filter.locus);
    }
    if (filter.siteId !== undefined) {
      clauses.push("site_id = ?");
      params.push(filter.siteId);
    }
    if (filter.kind !== undefined) {
      clauses.push("kind = ?");
      params.push(filter.kind);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rows = await this.executor.all<DocRow>(`SELECT doc FROM policies${where} ORDER BY id`, ...params);
    return rows.map((row) => JSON.parse(row.doc) as PolicyDocument);
  }

  async listPolicyBindings(policyId: string): Promise<PolicyBindingRow[]> {
    return this.executor.all<PolicyBindingRow>(
      "SELECT policy_id, subject_id FROM policy_bindings WHERE policy_id = ? ORDER BY subject_id",
      policyId,
    );
  }

  async getCatalogRecord(id: string): Promise<CanonicalCatalogRecord | null> {
    const row = await this.executor.get<DocRow>("SELECT doc FROM catalog_records WHERE id = ?", id);
    return row ? (JSON.parse(row.doc) as CanonicalCatalogRecord) : null;
  }

  async listCatalogRecords(filter: CatalogRecordFilter = {}): Promise<CanonicalCatalogRecord[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.recordKind !== undefined) {
      clauses.push("record_kind = ?");
      params.push(filter.recordKind);
    }
    if (filter.recordId !== undefined) {
      clauses.push("record_id = ?");
      params.push(filter.recordId);
    }
    if (filter.authorityLocus !== undefined) {
      clauses.push("authority_locus = ?");
      params.push(filter.authorityLocus);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rows = await this.executor.all<DocRow>(`SELECT doc FROM catalog_records${where} ORDER BY record_id, revision, id`, ...params);
    return rows.map((row) => JSON.parse(row.doc) as CanonicalCatalogRecord);
  }

  async listCatalogResiduals(filter: CatalogResidualFilter = {}): Promise<CatalogAdmissionResidual[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.code !== undefined) {
      clauses.push("code = ?");
      params.push(filter.code);
    }
    if (filter.disposition !== undefined) {
      clauses.push("disposition = ?");
      params.push(filter.disposition);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rows = await this.executor.all<DocRow>(`SELECT doc FROM catalog_residuals${where} ORDER BY id`, ...params);
    return rows.map((row) => JSON.parse(row.doc) as CatalogAdmissionResidual);
  }

  async loadCatalogSeed(seed: CanonicalCatalogSeed): Promise<void> {
    if (seed.schema !== "narada.invokable-intelligence.canonical-catalog-seed.v1" || !seed.id) {
      throw new RegistryError("invalid-catalog-seed", "canonical catalog seed schema and id are required");
    }
    const recordIds = new Set<string>();
    const documentKeys = new Set<string>();
    const incomingResources = seed.records
      .filter(({ record_kind }) => record_kind === "resource")
      .map(({ document }) => document as Resource);
    const incomingResourceIds = new Set(incomingResources.map(({ id }) => id));
    const resources = [
      ...(await this.listResources()).filter(({ id }) => !incomingResourceIds.has(id)),
      ...incomingResources,
    ];

    for (const record of seed.records) {
      const envelopeDiagnostics = validateCanonicalCatalogRecord(record);
      if (envelopeDiagnostics.length > 0) {
        throw new RegistryError("invalid-catalog-record", `${record.id}: ${envelopeDiagnostics[0].message}`);
      }
      const documentKey = `${record.record_id}@${record.revision}`;
      if (recordIds.has(record.id) || documentKeys.has(documentKey)) {
        throw new RegistryError("duplicate-catalog-record", `duplicate canonical catalog identity '${record.id}' or '${documentKey}'`);
      }
      recordIds.add(record.id);
      documentKeys.add(documentKey);

      switch (record.record_kind) {
        case "resource": {
          const resource = record.document as Resource;
          assertValid(validateResource(resource), `catalog resource '${record.record_id}'`);
          if (resource.schema === "narada.invokable-intelligence.model-offering.v1") {
            const diagnostics = validateModelOfferingGraph(resource, resources);
            if (diagnostics.length > 0) throw new RegistryError("invalid-catalog-graph", diagnostics[0].message);
          }
          break;
        }
        case "assertion":
          if (record.document.schema === "narada.invokable-intelligence.route-capability-assertion.v1") {
            const diagnostics = validateRouteCapabilityAssertion(record.document as RouteCapabilityAssertion);
            if (diagnostics.length > 0) throw new RegistryError("invalid-catalog-route-assertion", diagnostics[0].message);
          } else {
            assertValid(validateAssertion(record.document as CapabilityAssertion), `catalog assertion '${record.record_id}'`);
          }
          break;
        case "policy":
          assertValid(validatePolicy(record.document as PolicyDocument), `catalog policy '${record.record_id}'`);
          break;
        case "route": {
          const route = record.document as InvocationRouteCandidate;
          const offering = resources.find(({ id }) => id === route.offering.id) as ModelOffering | undefined;
          if (!offering) throw new RegistryError("invalid-catalog-graph", `route '${route.id}' references missing offering '${route.offering.id}'`);
          const diagnostics = validateInvocationRouteCandidate(route, offering, resources);
          if (diagnostics.length > 0) throw new RegistryError("invalid-catalog-graph", diagnostics[0].message);
          break;
        }
        case "authority-statement": {
          const diagnostics = validateIntelligenceAuthorityStatement(record.document as IntelligenceAuthorityStatement);
          if (diagnostics.length > 0) throw new RegistryError("invalid-catalog-authority", diagnostics[0].message);
          break;
        }
        case "access":
          if (containsForbiddenSecretMaterial(record.document)) {
            throw new RegistryError("secret-bearing-catalog-record", `access record '${record.record_id}' contains forbidden secret material`);
          }
          break;
        case "temporal-input": {
          const temporal = record.document as CatalogTemporalInput;
          const diagnostics = validateAuthoritativeDecisionClock(temporal.clock);
          if (diagnostics.length > 0 || Date.parse(temporal.valid_until) <= Date.parse(temporal.clock.instant)) {
            throw new RegistryError("invalid-catalog-temporal-input", `temporal input '${record.record_id}' is invalid or already expired`);
          }
          break;
        }
      }

      const existing = await this.getCatalogRecord(record.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(record)) {
        throw new RegistryError("catalog-revision-conflict", `immutable catalog record '${record.id}' conflicts with stored content`);
      }
    }

    for (const residual of seed.residuals) {
      const existing = await this.executor.get<DocRow>("SELECT doc FROM catalog_residuals WHERE id = ?", residual.id);
      if (existing && existing.doc !== JSON.stringify(residual)) {
        throw new RegistryError("catalog-residual-conflict", `immutable catalog residual '${residual.id}' conflicts with stored content`);
      }
    }

    const statements = seed.records.flatMap(catalogRecordStatements);
    statements.push(...seed.residuals.map(residualStatement));
    await this.transact(statements);
  }

  private validateInvocationRecord(record: unknown, what: string): void {
    assertValid(validateInvocation(record), what);
  }

  async putIntent(intent: InvocationIntent): Promise<void> {
    this.validateInvocationRecord(intent, `intent '${intent.id}'`);
    await this.insertImmutable(
      "invocation_intents",
      intent.id,
      "INSERT OR IGNORE INTO invocation_intents (id, purpose, created_at, doc) VALUES (?, ?, ?, ?)",
      [intent.id, intent.purpose, intent.created_at],
      intent,
    );
  }

  async getIntent(id: string): Promise<InvocationIntent | null> {
    const row = await this.executor.get<DocRow>("SELECT doc FROM invocation_intents WHERE id = ?", id);
    return row ? (JSON.parse(row.doc) as InvocationIntent) : null;
  }

  async recordPlan(plan: InvocationPlan): Promise<void> {
    this.validateInvocationRecord(plan, `plan '${plan.id}'`);
    await this.insertImmutable(
      "invocation_plans",
      plan.id,
      "INSERT OR IGNORE INTO invocation_plans (id, intent_id, resolver_version, created_at, doc) VALUES (?, ?, ?, ?, ?)",
      [plan.id, plan.intent_id, plan.resolver_version, plan.created_at],
      plan,
    );
  }

  async getPlan(id: string): Promise<InvocationPlan | null> {
    const row = await this.executor.get<DocRow>("SELECT doc FROM invocation_plans WHERE id = ?", id);
    return row ? (JSON.parse(row.doc) as InvocationPlan) : null;
  }

  async getPlanByIntent(intentId: string): Promise<InvocationPlan | null> {
    const row = await this.executor.get<DocRow>(
      "SELECT doc FROM invocation_plans WHERE intent_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
      intentId,
    );
    return row ? (JSON.parse(row.doc) as InvocationPlan) : null;
  }

  async listPlansByIntent(intentId: string): Promise<InvocationPlan[]> {
    const rows = await this.executor.all<DocRow>(
      "SELECT doc FROM invocation_plans WHERE intent_id = ? ORDER BY created_at, id",
      intentId,
    );
    return rows.map((row) => JSON.parse(row.doc) as InvocationPlan);
  }

  async recordPlanSnapshot(snapshot: PlanDecisionSnapshot): Promise<void> {
    const diagnostics = validatePlanDecisionSnapshot(snapshot);
    if (diagnostics.length) throw new RegistryError("invalid-plan-snapshot", diagnostics[0].message);
    await this.insertImmutable(
      "plan_decision_snapshots",
      snapshot.plan_id,
      "INSERT OR IGNORE INTO plan_decision_snapshots (plan_id, intent_id, resolved_at, valid_until, doc) VALUES (?, ?, ?, ?, ?)",
      [snapshot.plan_id, snapshot.intent_id, snapshot.resolved_at, snapshot.valid_until],
      snapshot,
      "plan_id",
    );
  }

  async getPlanSnapshot(planId: string): Promise<PlanDecisionSnapshot | null> {
    const row = await this.executor.get<DocRow>("SELECT doc FROM plan_decision_snapshots WHERE plan_id = ?", planId);
    return row ? JSON.parse(row.doc) as PlanDecisionSnapshot : null;
  }

  async recordPlanRevalidation(evidence: PlanRevalidationEvidence): Promise<void> {
    if (evidence.schema !== "narada.invokable-intelligence.plan-revalidation-evidence.v1" || !evidence.id || !evidence.plan_id || !evidence.intent_id) {
      throw new RegistryError("invalid-plan-revalidation", "plan revalidation evidence requires schema and linked identities");
    }
    await this.insertImmutable(
      "plan_revalidation_evidence",
      evidence.id,
      "INSERT OR IGNORE INTO plan_revalidation_evidence (id, plan_id, intent_id, evaluated_at, doc) VALUES (?, ?, ?, ?, ?)",
      [evidence.id, evidence.plan_id, evidence.intent_id, evidence.evaluated_at],
      evidence,
    );
  }

  async listPlanRevalidations(planId: string): Promise<PlanRevalidationEvidence[]> {
    const rows = await this.executor.all<DocRow>(
      "SELECT doc FROM plan_revalidation_evidence WHERE plan_id = ? ORDER BY evaluated_at, id",
      planId,
    );
    return rows.map((row) => JSON.parse(row.doc) as PlanRevalidationEvidence);
  }

  async recordRefusal(refusal: InvocationRefusal): Promise<void> {
    this.validateInvocationRecord(refusal, `refusal '${refusal.id}'`);
    await this.insertImmutable(
      "invocation_refusals",
      refusal.id,
      "INSERT OR IGNORE INTO invocation_refusals (id, intent_id, reason_code, created_at, doc) VALUES (?, ?, ?, ?, ?)",
      [refusal.id, refusal.intent_id, refusal.reason_code, refusal.created_at],
      refusal,
    );
  }

  async getRefusalByIntent(intentId: string): Promise<InvocationRefusal | null> {
    const row = await this.executor.get<DocRow>(
      "SELECT doc FROM invocation_refusals WHERE intent_id = ? ORDER BY id LIMIT 1",
      intentId,
    );
    return row ? (JSON.parse(row.doc) as InvocationRefusal) : null;
  }

  async getRefusal(id: string): Promise<InvocationRefusal | null> {
    const row = await this.executor.get<DocRow>("SELECT doc FROM invocation_refusals WHERE id = ?", id);
    return row ? JSON.parse(row.doc) as InvocationRefusal : null;
  }

  async listRefusalsByIntent(intentId: string): Promise<InvocationRefusal[]> {
    const rows = await this.executor.all<DocRow>(
      "SELECT doc FROM invocation_refusals WHERE intent_id = ? ORDER BY created_at, id",
      intentId,
    );
    return rows.map((row) => JSON.parse(row.doc) as InvocationRefusal);
  }

  async recordAttempt(attempt: InvocationAttempt): Promise<void> {
    this.validateInvocationRecord(attempt, `attempt '${attempt.id}'`);
    await this.transact([
      {
        sql: "INSERT OR REPLACE INTO invocation_attempts (id, plan_id, state, started_at, doc) VALUES (?, ?, ?, ?, ?)",
        params: [attempt.id, attempt.plan_id, attempt.state, attempt.started_at, JSON.stringify(attempt)],
      },
    ]);
  }

  async listAttempts(planId: string): Promise<InvocationAttempt[]> {
    const rows = await this.executor.all<DocRow>(
      "SELECT doc FROM invocation_attempts WHERE plan_id = ? ORDER BY id",
      planId,
    );
    return rows.map((row) => JSON.parse(row.doc) as InvocationAttempt);
  }

  async recordEvidence(evidence: InvocationEvidence): Promise<void> {
    this.validateInvocationRecord(evidence, `evidence '${evidence.id}'`);
    await this.transact([
      {
        sql: "INSERT OR REPLACE INTO invocation_evidence (id, attempt_id, recorded_at, doc) VALUES (?, ?, ?, ?)",
        params: [evidence.id, evidence.attempt_id, evidence.recorded_at, JSON.stringify(evidence)],
      },
    ]);
  }

  async listEvidence(attemptId: string): Promise<InvocationEvidence[]> {
    const rows = await this.executor.all<DocRow>(
      "SELECT doc FROM invocation_evidence WHERE attempt_id = ? ORDER BY id",
      attemptId,
    );
    return rows.map((row) => JSON.parse(row.doc) as InvocationEvidence);
  }

  async recordExecutionAttempt(attempt: InvocationExecutionAttempt): Promise<void> {
    if (attempt.schema !== "narada.invokable-intelligence.execution-attempt.v1" || !attempt.id || !attempt.intent_id || !attempt.plan_id || attempt.state !== "created") {
      throw new RegistryError("invalid-execution-attempt", "execution attempt requires schema, linked intent/plan identities, and immutable created state");
    }
    await this.insertImmutable(
      "invocation_execution_attempts",
      attempt.id,
      "INSERT OR IGNORE INTO invocation_execution_attempts (id, intent_id, plan_id, state, created_at, doc) VALUES (?, ?, ?, ?, ?, ?)",
      [attempt.id, attempt.intent_id, attempt.plan_id, attempt.state, attempt.created_at],
      attempt,
    );
  }

  async getExecutionAttempt(id: string): Promise<InvocationExecutionAttempt | null> {
    const row = await this.executor.get<DocRow>("SELECT doc FROM invocation_execution_attempts WHERE id = ?", id);
    return row ? JSON.parse(row.doc) as InvocationExecutionAttempt : null;
  }

  async listExecutionAttempts(planId: string): Promise<InvocationExecutionAttempt[]> {
    const rows = await this.executor.all<DocRow>(
      "SELECT doc FROM invocation_execution_attempts WHERE plan_id = ? ORDER BY created_at, id",
      planId,
    );
    return rows.map((row) => JSON.parse(row.doc) as InvocationExecutionAttempt);
  }

  async recordExecutionTransition(transition: InvocationExecutionTransition): Promise<void> {
    if (
      transition.schema !== "narada.invokable-intelligence.execution-transition.v1"
      || !transition.id
      || !transition.attempt_id
      || !Number.isInteger(transition.sequence)
      || transition.sequence < 1
      || !transition.transitioned_at
    ) {
      throw new RegistryError("invalid-execution-transition", "execution transition requires schema, attempt, positive sequence, and explicit time");
    }
    const attempt = await this.getExecutionAttempt(transition.attempt_id);
    if (!attempt) throw new RegistryError("orphan-execution-transition", `execution transition references unknown attempt '${transition.attempt_id}'`);
    const existingTransitions = await this.listExecutionTransitions(transition.attempt_id);
    const existing = existingTransitions.find(({ id }) => id === transition.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(transition)) {
        throw new RegistryError("immutable-record-conflict", `execution transition '${transition.id}' already exists with different content`);
      }
      return;
    }
    const prior = existingTransitions.at(-1);
    const expectedSequence = existingTransitions.length + 1;
    const priorState = prior?.state ?? attempt.state;
    if (transition.sequence !== expectedSequence || transition.previous_state !== priorState) {
      throw new RegistryError("invalid-execution-transition", `execution transition must be sequence ${expectedSequence} from '${priorState}'`);
    }
    const outcome = transition.state === "terminal"
      ? await this.getTerminalOutcomeByAttempt(transition.attempt_id)
      : undefined;
    const diagnostics = validateInvocationAttemptTransition(priorState, transition.state, outcome ?? undefined);
    if (diagnostics.length) throw new RegistryError("invalid-execution-transition", diagnostics[0].message);
    await this.insertImmutable(
      "invocation_execution_transitions",
      transition.id,
      "INSERT OR IGNORE INTO invocation_execution_transitions (id, attempt_id, sequence, previous_state, state, transitioned_at, doc) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [transition.id, transition.attempt_id, transition.sequence, transition.previous_state, transition.state, transition.transitioned_at],
      transition,
    );
  }

  async listExecutionTransitions(attemptId: string): Promise<InvocationExecutionTransition[]> {
    const rows = await this.executor.all<DocRow>(
      "SELECT doc FROM invocation_execution_transitions WHERE attempt_id = ? ORDER BY sequence, id",
      attemptId,
    );
    return rows.map((row) => JSON.parse(row.doc) as InvocationExecutionTransition);
  }

  async recordResultEnvelope(result: InvocationResultEnvelope): Promise<void> {
    const diagnostics = validateRetainedPayloadRef(result.payload);
    if (result.schema !== "narada.invokable-intelligence.result-envelope.v1" || !result.id || !result.attempt_id || !result.plan_id || diagnostics.length) {
      throw new RegistryError("invalid-result-envelope", diagnostics[0]?.message ?? "result envelope requires schema and linked attempt/plan identities");
    }
    await this.insertImmutable(
      "invocation_result_envelopes",
      result.id,
      "INSERT OR IGNORE INTO invocation_result_envelopes (id, attempt_id, plan_id, produced_at, doc) VALUES (?, ?, ?, ?, ?)",
      [result.id, result.attempt_id, result.plan_id, result.produced_at],
      result,
    );
  }

  async listResultEnvelopes(attemptId: string): Promise<InvocationResultEnvelope[]> {
    const rows = await this.executor.all<DocRow>(
      "SELECT doc FROM invocation_result_envelopes WHERE attempt_id = ? ORDER BY produced_at, id",
      attemptId,
    );
    return rows.map((row) => JSON.parse(row.doc) as InvocationResultEnvelope);
  }

  async recordTerminalOutcome(outcome: InvocationTerminalOutcome): Promise<void> {
    const diagnostics = validateInvocationTerminalOutcome(outcome);
    if (outcome.schema !== "narada.invokable-intelligence.terminal-outcome.v1" || !outcome.id || !outcome.intent_id || diagnostics.length) {
      throw new RegistryError("invalid-terminal-outcome", diagnostics[0]?.message ?? "terminal outcome requires schema and intent identity");
    }
    if (outcome.attempt_id) {
      const existing = await this.getTerminalOutcomeByAttempt(outcome.attempt_id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(outcome)) {
        throw new RegistryError("immutable-record-conflict", `attempt '${outcome.attempt_id}' already has terminal outcome '${existing.id}'`);
      }
    }
    await this.insertImmutable(
      "invocation_terminal_outcomes",
      outcome.id,
      "INSERT OR IGNORE INTO invocation_terminal_outcomes (id, intent_id, attempt_id, plan_id, kind, terminal_at, doc) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [outcome.id, outcome.intent_id, outcome.attempt_id ?? null, outcome.plan_id ?? null, outcome.kind, outcome.terminal_at],
      outcome,
    );
  }

  async getTerminalOutcomeByAttempt(attemptId: string): Promise<InvocationTerminalOutcome | null> {
    const row = await this.executor.get<DocRow>("SELECT doc FROM invocation_terminal_outcomes WHERE attempt_id = ?", attemptId);
    return row ? JSON.parse(row.doc) as InvocationTerminalOutcome : null;
  }

  async getTerminalOutcome(id: string): Promise<InvocationTerminalOutcome | null> {
    const row = await this.executor.get<DocRow>("SELECT doc FROM invocation_terminal_outcomes WHERE id = ?", id);
    return row ? JSON.parse(row.doc) as InvocationTerminalOutcome : null;
  }

  async listTerminalOutcomesByIntent(intentId: string): Promise<InvocationTerminalOutcome[]> {
    const rows = await this.executor.all<DocRow>(
      "SELECT doc FROM invocation_terminal_outcomes WHERE intent_id = ? ORDER BY terminal_at, id",
      intentId,
    );
    return rows.map((row) => JSON.parse(row.doc) as InvocationTerminalOutcome);
  }

  async recordInvocationObservation(observation: InvocationObservation): Promise<void> {
    if (observation.schema !== "narada.invokable-intelligence.observation.v1" || !observation.id || !observation.subject?.id || !observation.observed_at) {
      throw new RegistryError("invalid-invocation-observation", "invocation observation requires schema, subject, and explicit time");
    }
    await this.insertImmutable(
      "invocation_observations_v2",
      observation.id,
      "INSERT OR IGNORE INTO invocation_observations_v2 (id, subject_id, kind, observed_at, doc) VALUES (?, ?, ?, ?, ?)",
      [observation.id, observation.subject.id, observation.kind, observation.observed_at],
      observation,
    );
  }

  async listInvocationObservations(subjectId: string): Promise<InvocationObservation[]> {
    const rows = await this.executor.all<DocRow>(
      "SELECT doc FROM invocation_observations_v2 WHERE subject_id = ? ORDER BY observed_at, id",
      subjectId,
    );
    return rows.map((row) => JSON.parse(row.doc) as InvocationObservation);
  }

  async recordInvocationAuditEvidence(evidence: InvocationAuditEvidence): Promise<void> {
    if (evidence.schema !== "narada.invokable-intelligence.audit-evidence.v1" || !evidence.id || !evidence.subjects.length || !evidence.admission_ref) {
      throw new RegistryError("invalid-invocation-audit-evidence", "audit evidence requires schema, subjects, and admission authority");
    }
    await this.insertImmutable(
      "invocation_audit_evidence_v2",
      evidence.id,
      "INSERT OR IGNORE INTO invocation_audit_evidence_v2 (id, admitted_at, doc) VALUES (?, ?, ?)",
      [evidence.id, evidence.admitted_at],
      evidence,
    );
  }

  async listInvocationAuditEvidence(subjectId?: string): Promise<InvocationAuditEvidence[]> {
    const rows = await this.executor.all<DocRow>("SELECT doc FROM invocation_audit_evidence_v2 ORDER BY admitted_at, id");
    const evidence = rows.map((row) => JSON.parse(row.doc) as InvocationAuditEvidence);
    return subjectId ? evidence.filter((record) => record.subjects.some(({ id }) => id === subjectId)) : evidence;
  }

  async recordInvocationTelemetry(telemetry: InvocationOperationalTelemetry): Promise<void> {
    if (telemetry.schema !== "narada.invokable-intelligence.telemetry.v1" || !telemetry.id || !telemetry.attempt_id || !telemetry.recorded_at) {
      throw new RegistryError("invalid-invocation-telemetry", "telemetry requires schema, attempt, and explicit time");
    }
    await this.insertImmutable(
      "invocation_telemetry_v2",
      telemetry.id,
      "INSERT OR IGNORE INTO invocation_telemetry_v2 (id, attempt_id, recorded_at, doc) VALUES (?, ?, ?, ?)",
      [telemetry.id, telemetry.attempt_id, telemetry.recorded_at],
      telemetry,
    );
  }

  async listInvocationTelemetry(attemptId: string): Promise<InvocationOperationalTelemetry[]> {
    const rows = await this.executor.all<DocRow>(
      "SELECT doc FROM invocation_telemetry_v2 WHERE attempt_id = ? ORDER BY recorded_at, id",
      attemptId,
    );
    return rows.map((row) => JSON.parse(row.doc) as InvocationOperationalTelemetry);
  }

  async loadBundle(bundle: FixtureBundle): Promise<void> {
    assertValid(
      validateBundle({
        resources: bundle.resources,
        assertions: bundle.assertions,
        policies: bundle.policies,
        invocations: bundle.intents,
      }),
      "bundle",
    );
    const statements: SqlStatement[] = [];
    for (const resource of bundle.resources) statements.push(...resourceStatements(resource));
    for (const assertion of bundle.assertions) statements.push(...assertionStatements(assertion, true));
    for (const policy of bundle.policies) statements.push(...policyStatements(policy));
    for (const intent of bundle.intents) {
      statements.push({
        sql: "INSERT OR REPLACE INTO invocation_intents (id, purpose, created_at, doc) VALUES (?, ?, ?, ?)",
        params: [intent.id, intent.purpose, intent.created_at, JSON.stringify(intent)],
      });
    }
    await this.transact(statements);
  }

  async close(): Promise<void> {
    // Executors that hold handles override this via the factory wrappers.
  }
}
