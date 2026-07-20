import type {
  MaterializationAdmission,
  MaterializationAuditEvent,
  MaterializationDiagnostic,
  MaterializationEnvelope,
  MaterializationRevocation,
  MaterializedProjection,
  ResolverMaterializationContext,
  ResolverMaterializedInputs,
} from "@narada2/invokable-intelligence-contract";

export interface MaterializationMutationResult { changes: number }
export interface MaterializationSqlStatement { sql: string; params: unknown[] }

export interface MaterializationSqlExecutor {
  get<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  transact(statements: MaterializationSqlStatement[]): Promise<MaterializationMutationResult[]>;
  close(): Promise<void>;
}

export interface MaterializationProjectionFilter {
  destinationSiteId?: string;
  resolver?: "local" | "cloudflare";
  status?: MaterializedProjection["status"];
}

export interface MaterializationAuditFilter {
  projectionKey?: string;
  operation?: MaterializationAuditEvent["operation"];
  outcome?: MaterializationAuditEvent["outcome"];
}

export interface StoredMaterializationResult {
  operation: MaterializationAuditEvent["operation"];
  status: "applied" | "idempotent" | "rejected";
  projection?: MaterializedProjection;
  diagnostics: MaterializationDiagnostic[];
  audit_event_ref: string;
}

export interface IntelligenceMaterializationStore {
  readonly dialect: "node-sqlite" | "cloudflare-d1";
  migrate(): Promise<number>;
  apply(envelope: MaterializationEnvelope, admission: MaterializationAdmission): Promise<StoredMaterializationResult>;
  revoke(revocation: MaterializationRevocation): Promise<StoredMaterializationResult>;
  getProjection(projectionKey: string): Promise<MaterializedProjection | null>;
  getProjectionByEnvelope(envelopeId: string): Promise<MaterializedProjection | null>;
  listProjections(filter?: MaterializationProjectionFilter): Promise<MaterializedProjection[]>;
  listAudit(filter?: MaterializationAuditFilter): Promise<MaterializationAuditEvent[]>;
  acquire(context: ResolverMaterializationContext): Promise<ResolverMaterializedInputs>;
  close(): Promise<void>;
}
