import {
  MATERIALIZATION_AUDIT_EVENT_SCHEMA,
  MATERIALIZATION_PROJECTION_DDL,
  acquireResolverMaterializedInputs,
  applyMaterializedProjection,
  materializationProjectionKey,
  revokeMaterializedProjection,
} from "@narada2/invokable-intelligence-contract";
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
import type {
  IntelligenceMaterializationStore,
  MaterializationAuditFilter,
  MaterializationProjectionFilter,
  MaterializationSqlExecutor,
  MaterializationSqlStatement,
  StoredMaterializationResult,
} from "./store.js";

interface ProjectionRow { projection_json: string }
interface AuditRow { event_json: string }

const projectionParams = (projection: MaterializedProjection): unknown[] => [
  projection.projection_key,
  projection.envelope.id,
  projection.envelope.origin.site_id,
  projection.envelope.origin.locus,
  projection.envelope.destination.site_id,
  projection.envelope.destination.resolver,
  projection.envelope.statement.id,
  projection.envelope.statement.kind,
  projection.envelope.statement.source_revision,
  projection.envelope.statement.payload_digest,
  JSON.stringify(projection.envelope),
  JSON.stringify(projection.admission),
  JSON.stringify(projection),
  projection.status,
  projection.materialized_at,
];

function auditId(operation: MaterializationAuditEvent["operation"], envelopeId: string, evidenceId: string): string {
  return `materialization-audit:${operation}:${envelopeId}:${evidenceId}`;
}

function auditEvent(input: {
  operation: MaterializationAuditEvent["operation"];
  outcome: MaterializationAuditEvent["outcome"];
  envelope: MaterializationEnvelope;
  recordedAt: string;
  diagnostics: MaterializationDiagnostic[];
  evidenceId: string;
  admission?: MaterializationAdmission;
  revocation?: MaterializationRevocation;
  replacedEnvelopeId?: string;
}): MaterializationAuditEvent {
  const projectionKey = materializationProjectionKey(input.envelope);
  return {
    schema: MATERIALIZATION_AUDIT_EVENT_SCHEMA,
    id: auditId(input.operation, input.envelope.id, input.evidenceId),
    projection_key: projectionKey,
    envelope_id: input.envelope.id,
    operation: input.operation,
    outcome: input.outcome,
    recorded_at: input.recordedAt,
    origin: { ...input.envelope.origin },
    destination: { ...input.envelope.destination },
    statement: { ...input.envelope.statement },
    ...(input.admission ? { admission_id: input.admission.id } : {}),
    ...(input.revocation ? { revocation_id: input.revocation.id } : {}),
    ...(input.replacedEnvelopeId ? { replaced_envelope_id: input.replacedEnvelopeId } : {}),
    diagnostics: structuredClone(input.diagnostics),
    evidence_refs: [
      ...input.envelope.provenance_refs,
      ...(input.admission?.evidence_refs ?? []),
      ...(input.revocation ? [input.revocation.evidence_ref] : []),
    ],
  };
}

function auditStatement(event: MaterializationAuditEvent, guardEnvelopeId?: string): MaterializationSqlStatement {
  const columns = "event_id, projection_key, envelope_id, origin_site_id, origin_locus, destination_site_id, statement_id, source_revision, operation, outcome, event_json, recorded_at";
  const values = [event.id, event.projection_key, event.envelope_id, event.origin.site_id, event.origin.locus, event.destination.site_id, event.statement.id, event.statement.source_revision, event.operation, event.outcome, JSON.stringify(event), event.recorded_at];
  if (!guardEnvelopeId) {
    return { sql: `INSERT OR IGNORE INTO intelligence_materialization_audit (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, params: values };
  }
  return {
    sql: `INSERT OR IGNORE INTO intelligence_materialization_audit (${columns}) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM intelligence_materializations WHERE projection_key = ? AND envelope_id = ?)`,
    params: [...values, event.projection_key, guardEnvelopeId],
  };
}

export class MaterializationStoreCore implements IntelligenceMaterializationStore {
  constructor(
    protected readonly executor: MaterializationSqlExecutor,
    readonly dialect: "node-sqlite" | "cloudflare-d1",
  ) {}

  async migrate(): Promise<number> {
    await this.executor.transact(MATERIALIZATION_PROJECTION_DDL.map((sql) => ({ sql, params: [] })));
    return 1;
  }

  async getProjection(projectionKey: string): Promise<MaterializedProjection | null> {
    const row = await this.executor.get<ProjectionRow>("SELECT projection_json FROM intelligence_materializations WHERE projection_key = ?", projectionKey);
    return row ? JSON.parse(row.projection_json) as MaterializedProjection : null;
  }

  async getProjectionByEnvelope(envelopeId: string): Promise<MaterializedProjection | null> {
    const row = await this.executor.get<ProjectionRow>("SELECT projection_json FROM intelligence_materializations WHERE envelope_id = ?", envelopeId);
    return row ? JSON.parse(row.projection_json) as MaterializedProjection : null;
  }

  async listProjections(filter: MaterializationProjectionFilter = {}): Promise<MaterializedProjection[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.destinationSiteId) { clauses.push("destination_site_id = ?"); params.push(filter.destinationSiteId); }
    if (filter.resolver) { clauses.push("destination_resolver = ?"); params.push(filter.resolver); }
    if (filter.status) { clauses.push("status = ?"); params.push(filter.status); }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rows = await this.executor.all<ProjectionRow>(`SELECT projection_json FROM intelligence_materializations${where} ORDER BY projection_key`, ...params);
    return rows.map(({ projection_json }) => JSON.parse(projection_json) as MaterializedProjection);
  }

  async listAudit(filter: MaterializationAuditFilter = {}): Promise<MaterializationAuditEvent[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.projectionKey) { clauses.push("projection_key = ?"); params.push(filter.projectionKey); }
    if (filter.operation) { clauses.push("operation = ?"); params.push(filter.operation); }
    if (filter.outcome) { clauses.push("outcome = ?"); params.push(filter.outcome); }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rows = await this.executor.all<AuditRow>(`SELECT event_json FROM intelligence_materialization_audit${where} ORDER BY recorded_at, event_id`, ...params);
    return rows.map(({ event_json }) => JSON.parse(event_json) as MaterializationAuditEvent);
  }

  private async recordRejected(event: MaterializationAuditEvent): Promise<void> {
    await this.executor.transact([auditStatement(event)]);
  }

  private async findAppliedTransition(
    projectionKey: string,
    envelopeId: string,
  ): Promise<MaterializationAuditEvent | undefined> {
    return (await this.listAudit({ projectionKey })).find(
      ({ envelope_id, operation, outcome }) =>
        envelope_id === envelopeId
        && (operation === "materialize" || operation === "refresh")
        && outcome === "applied",
    );
  }

  async apply(envelope: MaterializationEnvelope, admission: MaterializationAdmission): Promise<StoredMaterializationResult> {
    const key = materializationProjectionKey(envelope);
    const current = await this.getProjection(key) ?? undefined;
    const result = applyMaterializedProjection(current, envelope, admission);
    const expectedStore = this.dialect === "node-sqlite" ? "sqlite" : "d1";
    const adapterDiagnostics: MaterializationDiagnostic[] = [];
    if (envelope.mode !== "durable-projection" || envelope.destination.store !== expectedStore) {
      adapterDiagnostics.push({
        code: "destination-mismatch",
        envelope_id: envelope.id,
        projection_key: key,
        message: `${this.dialect} only admits durable projections addressed to ${expectedStore}.`,
      });
    }
    const operation: MaterializationAuditEvent["operation"] = admission.decision !== "admitted"
      ? "reject"
      : current
        ? "refresh"
        : "materialize";
    if (adapterDiagnostics.length) {
      const diagnostics = [...result.diagnostics, ...adapterDiagnostics];
      const event = auditEvent({
        operation: "reject",
        outcome: "rejected",
        envelope,
        admission,
        recordedAt: admission.decided_at,
        diagnostics,
        evidenceId: admission.id,
      });
      await this.recordRejected(event);
      return {
        operation: "reject",
        status: "rejected",
        diagnostics,
        audit_event_ref: event.id,
      };
    }
    if (result.status === "rejected") {
      const event = auditEvent({ operation, outcome: "rejected", envelope, admission, recordedAt: admission.decided_at, diagnostics: result.diagnostics, evidenceId: admission.id });
      await this.recordRejected(event);
      return { operation, status: "rejected", diagnostics: result.diagnostics, audit_event_ref: event.id };
    }
    if (result.status === "idempotent") {
      const existing = await this.findAppliedTransition(key, envelope.id);
      return {
        operation: existing?.operation ?? operation,
        status: "idempotent",
        projection: result.projection,
        diagnostics: [],
        audit_event_ref: existing?.id ?? auditId(operation, envelope.id, admission.id),
      };
    }
    const projection = result.projection!;
    const event = auditEvent({
      operation,
      outcome: "applied",
      envelope,
      admission,
      recordedAt: admission.decided_at,
      diagnostics: [],
      evidenceId: admission.id,
      replacedEnvelopeId: result.replaced_projection?.envelope.id,
    });
    if (!current) {
      try {
        await this.executor.transact([
          { sql: "INSERT INTO intelligence_materializations (projection_key, envelope_id, origin_site_id, origin_locus, destination_site_id, destination_resolver, statement_id, statement_kind, source_revision, payload_digest, envelope_json, admission_json, projection_json, status, materialized_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", params: projectionParams(projection) },
          auditStatement(event, envelope.id),
        ]);
      } catch {
        const raced = await this.getProjection(key);
        if (raced?.envelope.id === envelope.id && raced.envelope.statement.payload_digest === envelope.statement.payload_digest) {
          const existing = await this.findAppliedTransition(key, envelope.id);
          return {
            operation: existing?.operation ?? operation,
            status: "idempotent",
            projection: raced,
            diagnostics: [],
            audit_event_ref: existing?.id ?? event.id,
          };
        }
        const diagnostics: MaterializationDiagnostic[] = [{ code: "projection-conflict", envelope_id: envelope.id, projection_key: key, message: "A concurrent materialization won this projection key." }];
        const rejected = auditEvent({ operation, outcome: "rejected", envelope, admission, recordedAt: admission.decided_at, diagnostics, evidenceId: `${admission.id}:concurrent` });
        await this.recordRejected(rejected);
        return { operation, status: "rejected", diagnostics, audit_event_ref: rejected.id };
      }
    } else {
      const params = projectionParams(projection);
      const mutation = await this.executor.transact([
        { sql: "UPDATE intelligence_materializations SET envelope_id = ?, origin_site_id = ?, origin_locus = ?, destination_site_id = ?, destination_resolver = ?, statement_id = ?, statement_kind = ?, source_revision = ?, payload_digest = ?, envelope_json = ?, admission_json = ?, projection_json = ?, status = ?, materialized_at = ? WHERE projection_key = ? AND envelope_id = ?", params: [...params.slice(1), key, current.envelope.id] },
        auditStatement(event, envelope.id),
      ]);
      if ((mutation[0]?.changes ?? 0) !== 1) {
        const raced = await this.getProjection(key);
        if (raced?.envelope.id === envelope.id && raced.envelope.statement.payload_digest === envelope.statement.payload_digest) {
          const existing = await this.findAppliedTransition(key, envelope.id);
          return {
            operation: existing?.operation ?? operation,
            status: "idempotent",
            projection: raced,
            diagnostics: [],
            audit_event_ref: existing?.id ?? event.id,
          };
        }
        const diagnostics: MaterializationDiagnostic[] = [{ code: "projection-conflict", envelope_id: envelope.id, projection_key: key, message: "Projection changed during refresh; no stale write was admitted." }];
        const rejected = auditEvent({ operation, outcome: "rejected", envelope, admission, recordedAt: admission.decided_at, diagnostics, evidenceId: `${admission.id}:concurrent` });
        await this.recordRejected(rejected);
        return { operation, status: "rejected", diagnostics, audit_event_ref: rejected.id };
      }
    }
    return { operation, status: "applied", projection, diagnostics: [], audit_event_ref: event.id };
  }

  async revoke(revocation: MaterializationRevocation): Promise<StoredMaterializationResult> {
    const current = await this.getProjectionByEnvelope(revocation.envelope_id);
    if (!current) {
      return {
        operation: "revoke",
        status: "rejected",
        diagnostics: [{ code: "invalid-revocation", envelope_id: revocation.envelope_id, message: "Revocation addresses no materialized envelope." }],
        audit_event_ref: auditId("revoke", revocation.envelope_id, revocation.id),
      };
    }
    if (current.status === "revoked" && current.revocation?.id === revocation.id) {
      const existing = (await this.listAudit({ projectionKey: current.projection_key, operation: "revoke" })).find(({ revocation_id }) => revocation_id === revocation.id);
      return { operation: "revoke", status: "idempotent", projection: current, diagnostics: [], audit_event_ref: existing?.id ?? auditId("revoke", current.envelope.id, revocation.id) };
    }
    const result = revokeMaterializedProjection(current, revocation);
    if (result.status === "rejected") {
      const event = auditEvent({ operation: "revoke", outcome: "rejected", envelope: current.envelope, revocation, recordedAt: revocation.revoked_at, diagnostics: result.diagnostics, evidenceId: revocation.id });
      await this.recordRejected(event);
      return { operation: "revoke", status: "rejected", diagnostics: result.diagnostics, audit_event_ref: event.id };
    }
    const projection = result.projection!;
    const event = auditEvent({ operation: "revoke", outcome: "applied", envelope: current.envelope, revocation, recordedAt: revocation.revoked_at, diagnostics: [], evidenceId: revocation.id });
    const mutation = await this.executor.transact([
      { sql: "UPDATE intelligence_materializations SET projection_json = ?, status = ? WHERE projection_key = ? AND envelope_id = ? AND status = ?", params: [JSON.stringify(projection), projection.status, current.projection_key, current.envelope.id, "active"] },
      auditStatement(event, current.envelope.id),
    ]);
    if ((mutation[0]?.changes ?? 0) !== 1) {
      const raced = await this.getProjection(current.projection_key);
      if (raced?.status === "revoked" && raced.revocation?.id === revocation.id) return { operation: "revoke", status: "idempotent", projection: raced, diagnostics: [], audit_event_ref: event.id };
      const diagnostics: MaterializationDiagnostic[] = [{ code: "projection-conflict", envelope_id: revocation.envelope_id, projection_key: current.projection_key, message: "Projection changed during revocation; no stale write was admitted." }];
      return { operation: "revoke", status: "rejected", diagnostics, audit_event_ref: event.id };
    }
    return { operation: "revoke", status: "applied", projection, diagnostics: [], audit_event_ref: event.id };
  }

  async acquire(context: ResolverMaterializationContext): Promise<ResolverMaterializedInputs> {
    const projections = await this.listProjections({ destinationSiteId: context.destination_site_id, resolver: context.resolver });
    return acquireResolverMaterializedInputs(projections, context);
  }

  async close(): Promise<void> { await this.executor.close(); }
}
