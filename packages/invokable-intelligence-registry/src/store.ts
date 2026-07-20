/**
 * Portable registry storage contract. One interface, two embodiments:
 * node:sqlite (local) and Cloudflare D1 (remote). Reads are deterministic
 * (id-ordered) and never merge authority loci implicitly — locus is always
 * an explicit column and filter.
 */

import type {
  AssertionLocus,
  CanonicalCatalogRecord,
  CanonicalCatalogRecordKind,
  CanonicalCatalogSeed,
  CatalogAdmissionResidual,
  CapabilityAssertion,
  ContractError,
  FixtureBundle,
  InvocationAuditEvidence,
  InvocationExecutionAttempt,
  InvocationExecutionTransition,
  InvocationIntent,
  InvocationObservation,
  InvocationOperationalTelemetry,
  InvocationPlan,
  InvocationRefusal,
  InvocationResultEnvelope,
  InvocationTerminalOutcome,
  PlanDecisionSnapshot,
  PlanRevalidationEvidence,
  PolicyDocument,
  PolicyKind,
  PolicyLocus,
  Resource,
  ResourceId,
  ResourceKind,
} from "@narada2/invokable-intelligence-contract";

export class RegistryError extends Error {
  readonly code: string;
  readonly contractErrors?: ContractError[];

  constructor(code: string, message: string, contractErrors?: ContractError[]) {
    super(message);
    this.name = "RegistryError";
    this.code = code;
    this.contractErrors = contractErrors;
  }
}

export interface CatalogRecordFilter {
  recordKind?: CanonicalCatalogRecordKind;
  recordId?: string;
  authorityLocus?: string;
}

export interface CatalogResidualFilter {
  code?: string;
  disposition?: "rejected" | "not-authoritative";
}

export interface ResourceFilter {
  kind?: ResourceKind;
}

export interface AssertionFilter {
  subjectId?: ResourceId;
  family?: string;
  name?: string;
  locus?: AssertionLocus;
  siteId?: ResourceId;
  /** Superseded assertions are excluded unless this is true. */
  includeSuperseded?: boolean;
}

export interface PolicyFilter {
  locus?: PolicyLocus;
  siteId?: ResourceId;
  kind?: PolicyKind;
}

export interface RelationRow {
  from_id: ResourceId;
  relation: string;
  to_id: ResourceId;
}

export interface PolicyBindingRow {
  policy_id: string;
  subject_id: ResourceId;
}

export interface IntelligenceRegistryStore {
  readonly dialect: "node-sqlite" | "cloudflare-d1";

  /** Apply pending migrations. Idempotent; returns the current schema version. */
  migrate(): Promise<number>;
  schemaVersion(): Promise<number>;

  putResource(resource: Resource): Promise<void>;
  getResource(id: ResourceId): Promise<Resource | null>;
  listResources(filter?: ResourceFilter): Promise<Resource[]>;
  /** Typed relations derived from a resource's own refs. */
  listRelations(fromId: ResourceId): Promise<RelationRow[]>;

  putAssertion(assertion: CapabilityAssertion): Promise<void>;
  /**
   * Atomically mark `supersededId` as superseded by `next` and insert
   * `next`. Fails when the old assertion is missing or already superseded.
   */
  supersedeAssertion(supersededId: string, next: CapabilityAssertion): Promise<void>;
  getAssertion(id: string): Promise<CapabilityAssertion | null>;
  listAssertions(filter?: AssertionFilter): Promise<CapabilityAssertion[]>;

  putPolicy(policy: PolicyDocument): Promise<void>;
  getPolicy(id: string): Promise<PolicyDocument | null>;
  listPolicies(filter?: PolicyFilter): Promise<PolicyDocument[]>;
  /** Subject bindings derived from a policy's resource rules. */
  listPolicyBindings(policyId: string): Promise<PolicyBindingRow[]>;

  /** Immutable canonical envelopes and structured migration residuals. */
  getCatalogRecord(id: string): Promise<CanonicalCatalogRecord | null>;
  listCatalogRecords(filter?: CatalogRecordFilter): Promise<CanonicalCatalogRecord[]>;
  listCatalogResiduals(filter?: CatalogResidualFilter): Promise<CatalogAdmissionResidual[]>;
  /** Validate and atomically project one complete canonical seed. */
  loadCatalogSeed(seed: CanonicalCatalogSeed): Promise<void>;

  putIntent(intent: InvocationIntent): Promise<void>;
  getIntent(id: string): Promise<InvocationIntent | null>;
  recordPlan(plan: InvocationPlan): Promise<void>;
  getPlan(id: string): Promise<InvocationPlan | null>;
  getPlanByIntent(intentId: string): Promise<InvocationPlan | null>;
  listPlansByIntent(intentId: string): Promise<InvocationPlan[]>;
  recordPlanSnapshot(snapshot: PlanDecisionSnapshot): Promise<void>;
  getPlanSnapshot(planId: string): Promise<PlanDecisionSnapshot | null>;
  recordPlanRevalidation(evidence: PlanRevalidationEvidence): Promise<void>;
  listPlanRevalidations(planId: string): Promise<PlanRevalidationEvidence[]>;
  recordRefusal(refusal: InvocationRefusal): Promise<void>;
  getRefusal(id: string): Promise<InvocationRefusal | null>;
  getRefusalByIntent(intentId: string): Promise<InvocationRefusal | null>;
  listRefusalsByIntent(intentId: string): Promise<InvocationRefusal[]>;
  /** V2 execution history. These records are immutable and never conflate payload, outcome, evidence, or telemetry. */
  recordExecutionAttempt(attempt: InvocationExecutionAttempt): Promise<void>;
  getExecutionAttempt(id: string): Promise<InvocationExecutionAttempt | null>;
  listExecutionAttempts(planId: string): Promise<InvocationExecutionAttempt[]>;
  recordExecutionTransition(transition: InvocationExecutionTransition): Promise<void>;
  listExecutionTransitions(attemptId: string): Promise<InvocationExecutionTransition[]>;
  recordResultEnvelope(result: InvocationResultEnvelope): Promise<void>;
  listResultEnvelopes(attemptId: string): Promise<InvocationResultEnvelope[]>;
  recordTerminalOutcome(outcome: InvocationTerminalOutcome): Promise<void>;
  getTerminalOutcome(id: string): Promise<InvocationTerminalOutcome | null>;
  getTerminalOutcomeByAttempt(attemptId: string): Promise<InvocationTerminalOutcome | null>;
  listTerminalOutcomesByIntent(intentId: string): Promise<InvocationTerminalOutcome[]>;
  recordInvocationObservation(observation: InvocationObservation): Promise<void>;
  listInvocationObservations(subjectId: string): Promise<InvocationObservation[]>;
  recordInvocationAuditEvidence(evidence: InvocationAuditEvidence): Promise<void>;
  listInvocationAuditEvidence(subjectId?: string): Promise<InvocationAuditEvidence[]>;
  recordInvocationTelemetry(telemetry: InvocationOperationalTelemetry): Promise<void>;
  listInvocationTelemetry(attemptId: string): Promise<InvocationOperationalTelemetry[]>;

  /** Atomic load of a full fixture/bundle (resources, assertions, policies, intents). */
  loadBundle(bundle: FixtureBundle): Promise<void>;

  close(): Promise<void>;
}

/** A single parameterized statement for transactional execution. */
export interface SqlStatement {
  sql: string;
  params: unknown[];
}

/**
 * Minimal async SQL surface the registry core needs. Both adapters reduce
 * to this, so behavior is equivalent by construction.
 */
export interface SqlExecutor {
  run(sql: string, ...params: unknown[]): Promise<void>;
  get<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  /** Execute statements atomically (SQLite: transaction; D1: batch). */
  transact(statements: SqlStatement[]): Promise<void>;
}
