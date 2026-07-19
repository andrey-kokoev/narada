/**
 * Portable registry storage contract. One interface, two embodiments:
 * node:sqlite (local) and Cloudflare D1 (remote). Reads are deterministic
 * (id-ordered) and never merge authority loci implicitly — locus is always
 * an explicit column and filter.
 */

import type {
  AssertionLocus,
  CapabilityAssertion,
  ContractError,
  FixtureBundle,
  InvocationAttempt,
  InvocationEvidence,
  InvocationIntent,
  InvocationPlan,
  InvocationRefusal,
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

  putIntent(intent: InvocationIntent): Promise<void>;
  getIntent(id: string): Promise<InvocationIntent | null>;
  recordPlan(plan: InvocationPlan): Promise<void>;
  getPlan(id: string): Promise<InvocationPlan | null>;
  getPlanByIntent(intentId: string): Promise<InvocationPlan | null>;
  recordRefusal(refusal: InvocationRefusal): Promise<void>;
  getRefusalByIntent(intentId: string): Promise<InvocationRefusal | null>;
  /** Upsert by id: attempt state transitions rewrite the same row. */
  recordAttempt(attempt: InvocationAttempt): Promise<void>;
  listAttempts(planId: string): Promise<InvocationAttempt[]>;
  recordEvidence(evidence: InvocationEvidence): Promise<void>;
  listEvidence(attemptId: string): Promise<InvocationEvidence[]>;

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
