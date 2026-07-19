/**
 * Shared registry implementation over a SqlExecutor. All store behavior
 * lives here so the node:sqlite and D1 adapters cannot drift apart.
 */

import {
  validateAssertion,
  validateBundle,
  validateInvocation,
  validatePolicy,
  validateResource,
} from "@narada2/invokable-intelligence-contract";
import type {
  CapabilityAssertion,
  ContractError,
  FixtureBundle,
  InvocationAttempt,
  InvocationEvidence,
  InvocationIntent,
  InvocationPlan,
  InvocationRefusal,
  PolicyDocument,
  Resource,
  ResourceId,
} from "@narada2/invokable-intelligence-contract";

import { MIGRATION_STATEMENTS, REGISTRY_SCHEMA_VERSION } from "./schema.js";
import { RegistryError } from "./store.js";
import type {
  AssertionFilter,
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

interface DocRow {
  doc: string;
}

function extractRelations(resource: Resource): Array<{ relation: string; to_id: ResourceId }> {
  switch (resource.schema) {
    case "narada.invokable-intelligence.model.v1":
      return [{ relation: "provided-by", to_id: resource.provider.id }];
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

  private validateInvocationRecord(record: unknown, what: string): void {
    assertValid(validateInvocation(record), what);
  }

  async putIntent(intent: InvocationIntent): Promise<void> {
    this.validateInvocationRecord(intent, `intent '${intent.id}'`);
    await this.transact([
      {
        sql: "INSERT OR REPLACE INTO invocation_intents (id, purpose, created_at, doc) VALUES (?, ?, ?, ?)",
        params: [intent.id, intent.purpose, intent.created_at, JSON.stringify(intent)],
      },
    ]);
  }

  async getIntent(id: string): Promise<InvocationIntent | null> {
    const row = await this.executor.get<DocRow>("SELECT doc FROM invocation_intents WHERE id = ?", id);
    return row ? (JSON.parse(row.doc) as InvocationIntent) : null;
  }

  async recordPlan(plan: InvocationPlan): Promise<void> {
    this.validateInvocationRecord(plan, `plan '${plan.id}'`);
    await this.transact([
      {
        sql: "INSERT OR REPLACE INTO invocation_plans (id, intent_id, resolver_version, created_at, doc) VALUES (?, ?, ?, ?, ?)",
        params: [plan.id, plan.intent_id, plan.resolver_version, plan.created_at, JSON.stringify(plan)],
      },
    ]);
  }

  async getPlan(id: string): Promise<InvocationPlan | null> {
    const row = await this.executor.get<DocRow>("SELECT doc FROM invocation_plans WHERE id = ?", id);
    return row ? (JSON.parse(row.doc) as InvocationPlan) : null;
  }

  async getPlanByIntent(intentId: string): Promise<InvocationPlan | null> {
    const row = await this.executor.get<DocRow>(
      "SELECT doc FROM invocation_plans WHERE intent_id = ? ORDER BY id LIMIT 1",
      intentId,
    );
    return row ? (JSON.parse(row.doc) as InvocationPlan) : null;
  }

  async recordRefusal(refusal: InvocationRefusal): Promise<void> {
    this.validateInvocationRecord(refusal, `refusal '${refusal.id}'`);
    await this.transact([
      {
        sql: "INSERT OR REPLACE INTO invocation_refusals (id, intent_id, reason_code, created_at, doc) VALUES (?, ?, ?, ?, ?)",
        params: [refusal.id, refusal.intent_id, refusal.reason_code, refusal.created_at, JSON.stringify(refusal)],
      },
    ]);
  }

  async getRefusalByIntent(intentId: string): Promise<InvocationRefusal | null> {
    const row = await this.executor.get<DocRow>(
      "SELECT doc FROM invocation_refusals WHERE intent_id = ? ORDER BY id LIMIT 1",
      intentId,
    );
    return row ? (JSON.parse(row.doc) as InvocationRefusal) : null;
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
