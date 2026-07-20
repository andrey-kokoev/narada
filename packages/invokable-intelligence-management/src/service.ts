/** Canonical application-service boundary for invokable-intelligence management. */

import {
  CANONICAL_CATALOG_SEED_SCHEMA,
  INTELLIGENCE_AUTHORITY_MATRIX,
  materializationProjectionKey,
  validateBundle,
  validateCanonicalCatalogRecord,
  validateMaterializationAdmission,
  validateMaterializationEnvelope,
} from "@narada2/invokable-intelligence-contract";
import type {
  CanonicalCatalogRecord,
  CanonicalCatalogSeed,
  CatalogDiagnostic,
  ContractError,
  IntelligenceAuthorityLocus,
  IntelligenceAuthorityStatement,
  InvocationIntent,
  InvocationPlan,
  InvocationRefusal,
  InvocationRouteCandidate,
  MaterializationAdmission,
  MaterializationAuditEvent,
  MaterializationDiagnostic,
  MaterializationEnvelope,
  MaterializationRevocation,
  ResourceKind,
  ResourceRef,
} from "@narada2/invokable-intelligence-contract";
import type {
  IntelligenceMaterializationStore,
  StoredMaterializationResult,
} from "@narada2/invokable-intelligence-materialization";
import { RegistryError } from "@narada2/invokable-intelligence-registry/store";
import type { IntelligenceRegistryStore } from "@narada2/invokable-intelligence-registry";
import { resolveInvocation } from "@narada2/invokable-intelligence-resolver";
import type { ResolverContext } from "@narada2/invokable-intelligence-resolver";

export const MANAGEMENT_RESULT_SCHEMA =
  "narada.invokable-intelligence.management-result.v1" as const;
export const MANAGEMENT_ERROR_SCHEMA =
  "narada.invokable-intelligence.management-error.v1" as const;
export const MANAGEMENT_MUTATION_CONTEXT_SCHEMA =
  "narada.invokable-intelligence.management-mutation-context.v1" as const;
export const MANAGEMENT_MUTATION_RECEIPT_SCHEMA =
  "narada.invokable-intelligence.management-mutation-receipt.v1" as const;
export const MANAGEMENT_AUTHORITY_LOCI = [...new Set(
  Object.values(INTELLIGENCE_AUTHORITY_MATRIX).flatMap(({ authorized_actions }) => [
    ...authorized_actions.originate,
    ...authorized_actions.supersede,
    ...authorized_actions.revoke,
  ]),
)].sort() as IntelligenceAuthorityLocus[];
const MANAGEMENT_AUTHORITY_LOCUS_SET = new Set<string>(MANAGEMENT_AUTHORITY_LOCI);

export class ManagementError extends Error {
  readonly code: string;
  readonly evidence_refs: string[];

  constructor(code: string, message: string, evidenceRefs: string[] = []) {
    super(message);
    this.name = "ManagementError";
    this.code = code;
    this.evidence_refs = [...evidenceRefs];
  }
}

function requireCatalogRecordAdmission(
  session: ManagementSession,
  record: CanonicalCatalogRecord,
  context: ManagementMutationContext,
): void {
  requireMutationContext(session, context);
  if (
    (record.authority.site_id !== undefined && record.authority.site_id !== session.owningSite.id)
    || (record.authority.site_id === undefined && record.authority.locus !== "runtime-observer")
    || record.authority.locus !== context.authority.locus
    || record.authority.authority_ref !== context.authority.authority_ref
  ) {
    throw new ManagementError("foreign-locus-mutation", "Catalog mutation authority does not belong to this destination Site.", context.evidence_refs);
  }
  const admittedEvidence = record.validation.evidence.map(({ ref }) => ref);
  if (!admittedEvidence.every((ref) => context.evidence_refs.includes(ref))) {
    throw new ManagementError("mutation-evidence-mismatch", "Catalog validation evidence is not admitted by the mutation context.", context.evidence_refs);
  }
  const diagnostics = validateCanonicalCatalogRecord(record);
  if (diagnostics.length) {
    throw new ManagementError("invalid-catalog-record", "Catalog record failed canonical validation.", context.evidence_refs);
  }
}

function validateMaterializationRecords(
  request: Extract<ManagementMutationRequest, { operation: "materialize" | "refresh" }>,
): void {
    const { envelope, statement_record: statementRecord, payload_record: payloadRecord, context } = request;
    const statementDiagnostics = validateCanonicalCatalogRecord(statementRecord);
    const payloadDiagnostics = validateCanonicalCatalogRecord(payloadRecord);
    if (statementDiagnostics.length || payloadDiagnostics.length) {
      throw new ManagementError(
        "invalid-materialization-record",
        "Materialization statement and payload records must be canonical, digest-bound records.",
        context.evidence_refs,
      );
    }
    const statement = statementRecord.document as IntelligenceAuthorityStatement;
    if (
      statementRecord.record_kind !== "authority-statement"
      || statement.schema !== "narada.invokable-intelligence.authority-statement.v1"
      || statementRecord.record_id !== envelope.statement.id
      || statement.id !== envelope.statement.id
      || statement.kind !== envelope.statement.kind
      || statement.effect !== envelope.statement.effect
      || statement.revision !== envelope.statement.source_revision
      || statement.payload_ref !== payloadRecord.record_id
      || payloadRecord.id !== envelope.statement.payload_ref
      || payloadRecord.source.digest !== envelope.statement.payload_digest
      || statement.origin.site_id !== envelope.origin.site_id
      || statement.origin.locus !== envelope.origin.locus
      || statement.origin.authority_ref !== envelope.origin.authority_ref
      || statementRecord.authority.site_id !== envelope.origin.site_id
      || statementRecord.authority.locus !== envelope.origin.locus
      || statementRecord.authority.authority_ref !== envelope.origin.authority_ref
    ) {
      throw new ManagementError(
        "materialization-record-mismatch",
        "Materialization envelope, authority statement, payload identity, digest, revision, effect, and origin must match exactly.",
        context.evidence_refs,
      );
    }
    const admittedProvenance = new Set([...envelope.provenance_refs, ...context.evidence_refs]);
    const requiredProvenance = [
      statementRecord.source.reference,
      payloadRecord.source.reference,
      ...statementRecord.validation.evidence.map(({ ref }) => ref),
      ...payloadRecord.validation.evidence.map(({ ref }) => ref),
    ];
    if (!requiredProvenance.every((ref) => admittedProvenance.has(ref))) {
      throw new ManagementError(
        "materialization-provenance-mismatch",
        "Materialized records contain source or validation provenance not admitted by the envelope or destination decision.",
        context.evidence_refs,
      );
    }
}

export interface ManagementSession {
  store: IntelligenceRegistryStore;
  owningSite: ResourceRef;
  materialization?: IntelligenceMaterializationStore;
  /** Resolve immutable JSON payload references for MCP projections. */
  resolveInputRef?: (ref: string) => Promise<unknown>;
}

export interface ManagementMutationContext {
  schema: typeof MANAGEMENT_MUTATION_CONTEXT_SCHEMA;
  actor_id: string;
  principal_id: string;
  consent_ref: string;
  authority: {
    site_id: string;
    locus: IntelligenceAuthorityLocus;
    authority_ref: string;
  };
  destination_site_id: string;
  target_site_id: string;
  decided_at: string;
  evidence_refs: string[];
}

export interface ManagementMutationReceipt {
  schema: typeof MANAGEMENT_MUTATION_RECEIPT_SCHEMA;
  id: string;
  operation: ManagementMutationRequest["operation"];
  target_ref: string;
  actor_id: string;
  principal_id: string;
  consent_ref: string;
  authority: ManagementMutationContext["authority"];
  destination_site_id: string;
  target_site_id: string;
  decided_at: string;
  evidence_refs: string[];
  audit_event_ref?: string;
}

export type ManagementCollection =
  | "resources"
  | "offerings"
  | "assertions"
  | "policies"
  | "catalog-records"
  | "routes"
  | "topologies"
  | "authority-statements"
  | "access"
  | "materializations"
  | "materialization-audit";

export interface ManagementPageRequest {
  offset?: number;
  limit?: number;
}

export interface ManagementListRequest {
  operation: "list";
  collection: ManagementCollection;
  filter?: Record<string, unknown>;
  page?: ManagementPageRequest;
}

export interface ManagementShowRequest {
  operation: "show";
  entity: "resource" | "assertion" | "policy" | "catalog-record" | "materialization";
  id: string;
}

export interface ManagementValidateRequest {
  operation: "validate";
}

export interface ManagementExplainResolutionRequest {
  operation: "explain-resolution";
  resolver: "local" | "cloudflare";
  intent: InvocationIntent;
  context: ResolverContext;
}

export interface ManagementInspectMaterializationRequest {
  operation: "inspect-materialization" | "explain-materialization";
  projection_key?: string;
  envelope_id?: string;
}

export type ManagementMutationRequest =
  | {
      operation: "admit-catalog-record";
      record: CanonicalCatalogRecord;
      context: ManagementMutationContext;
    }
  | {
      operation: "admit-catalog-seed";
      seed: CanonicalCatalogSeed;
      record_contexts: Record<string, ManagementMutationContext>;
      context: ManagementMutationContext;
    }
  | {
      operation: "materialize" | "refresh";
      envelope: MaterializationEnvelope;
      admission: MaterializationAdmission;
      statement_record: CanonicalCatalogRecord;
      payload_record: CanonicalCatalogRecord;
      context: ManagementMutationContext;
    }
  | {
      operation: "reject-materialization";
      envelope: MaterializationEnvelope;
      admission: MaterializationAdmission;
      context: ManagementMutationContext;
    }
  | {
      operation: "revoke-materialization";
      revocation: MaterializationRevocation;
      context: ManagementMutationContext;
    };

export type ManagementRequest =
  | ManagementListRequest
  | ManagementShowRequest
  | ManagementValidateRequest
  | ManagementExplainResolutionRequest
  | ManagementInspectMaterializationRequest
  | ManagementMutationRequest;

export interface ManagementResult<T = unknown> {
  schema: typeof MANAGEMENT_RESULT_SCHEMA;
  operation: ManagementRequest["operation"];
  ok: boolean;
  data: T;
  evidence_refs: string[];
}

export interface ManagementErrorResult {
  schema: typeof MANAGEMENT_ERROR_SCHEMA;
  error: { code: string; message: string; evidence_refs: string[] };
}

export type ManagementDiagnostic = ContractError | CatalogDiagnostic | MaterializationDiagnostic;

const SECRET_KEY = /(^|[_-])(api[_-]?key|secret|access[_-]?token|refresh[_-]?token|password|private[_-]?key)($|[_-])/i;
const SECRET_VALUE = /(^|\s)(bearer\s+[a-z0-9._~-]+|sk-[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;

function assertSecretFree(value: unknown): void {
  const visit = (candidate: unknown): void => {
    if (typeof candidate === "string") {
      if (SECRET_VALUE.test(candidate)) {
        throw new ManagementError("secret-bearing-input", "Secret-bearing material is not admissible on the management surface.");
      }
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (!candidate || typeof candidate !== "object") return;
    for (const [key, child] of Object.entries(candidate)) {
      if (SECRET_KEY.test(key)) {
        throw new ManagementError("secret-bearing-input", "Secret-bearing fields are not admissible on the management surface.");
      }
      visit(child);
    }
  };
  visit(value);
}

function evidenceRefs(value: unknown): string[] {
  const refs = new Set<string>();
  const visit = (candidate: unknown, key = ""): void => {
    if (typeof candidate === "string") {
      if (key === "audit_event_ref" || key === "evidence_ref") refs.add(candidate);
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (key === "evidence_refs" && typeof item === "string") refs.add(item);
        else if (key === "evidence" && item && typeof item === "object" && typeof (item as { ref?: unknown }).ref === "string") refs.add((item as { ref: string }).ref);
        else visit(item, key);
      }
      return;
    }
    if (!candidate || typeof candidate !== "object") return;
    for (const [childKey, child] of Object.entries(candidate)) visit(child, childKey);
  };
  visit(value);
  return [...refs].sort();
}

function pageItems(items: unknown[], page: ManagementPageRequest = {}): {
  items: unknown[];
  page: { offset: number; limit: number; total: number; next_offset: number | null };
} {
  const offset = page.offset ?? 0;
  const limit = page.limit ?? 50;
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ManagementError("invalid-page", "Paging requires a non-negative integer offset and a limit from 1 through 100.");
  }
  const selected = items.slice(offset, offset + limit);
  return {
    items: selected,
    page: {
      offset,
      limit,
      total: items.length,
      next_offset: offset + selected.length < items.length ? offset + selected.length : null,
    },
  };
}

function result<T>(operation: ManagementRequest["operation"], data: T, ok = true): ManagementResult<T> {
  assertSecretFree(data);
  return {
    schema: MANAGEMENT_RESULT_SCHEMA,
    operation,
    ok,
    data,
    evidence_refs: evidenceRefs(data),
  };
}

function requireMutationContext(session: ManagementSession, context: ManagementMutationContext): void {
  assertSecretFree(context);
  const candidate = context as Partial<ManagementMutationContext>;
  const authority = candidate.authority;
  const evidence = Array.isArray(candidate.evidence_refs) ? candidate.evidence_refs : [];
  if (
    candidate.schema !== MANAGEMENT_MUTATION_CONTEXT_SCHEMA
    || typeof candidate.actor_id !== "string" || !candidate.actor_id
    || typeof candidate.principal_id !== "string" || !candidate.principal_id
    || typeof candidate.consent_ref !== "string" || !candidate.consent_ref
    || !authority
    || typeof authority.site_id !== "string" || !authority.site_id
    || typeof authority.locus !== "string" || !MANAGEMENT_AUTHORITY_LOCUS_SET.has(authority.locus)
    || typeof authority.authority_ref !== "string" || !authority.authority_ref
    || typeof candidate.destination_site_id !== "string" || !candidate.destination_site_id
    || typeof candidate.target_site_id !== "string" || !candidate.target_site_id
    || typeof candidate.decided_at !== "string" || !Number.isFinite(Date.parse(candidate.decided_at))
    || evidence.length === 0 || !evidence.every((ref) => typeof ref === "string" && ref.length > 0)
  ) {
    throw new ManagementError("invalid-mutation-context", "Mutation requires actor, principal consent, authority locus, destination, target, decision time, and admitted evidence.");
  }
  if (!evidence.includes(candidate.consent_ref) || !evidence.includes(authority.authority_ref)) {
    throw new ManagementError("mutation-evidence-mismatch", "Mutation evidence must include the principal consent and authority decision references.", evidence);
  }
  if (
    !context.destination_site_id.startsWith("site:")
    || !context.target_site_id.startsWith("site:")
    || !context.authority.site_id.startsWith("site:")
    || context.destination_site_id !== session.owningSite.id
    || context.authority.site_id !== session.owningSite.id
  ) {
    throw new ManagementError("foreign-locus-mutation", "This management session cannot mutate a foreign destination Site.", context.evidence_refs);
  }
}

function receipt(
  request: ManagementMutationRequest,
  targetRef: string,
  auditEventRef?: string,
  contextOverride?: ManagementMutationContext,
): ManagementMutationReceipt {
  const context = contextOverride ?? request.context;
  return {
    schema: MANAGEMENT_MUTATION_RECEIPT_SCHEMA,
    id: `management-receipt:${request.operation}:${targetRef}:${context.decided_at}`,
    operation: request.operation,
    target_ref: targetRef,
    actor_id: context.actor_id,
    principal_id: context.principal_id,
    consent_ref: context.consent_ref,
    authority: { ...context.authority },
    destination_site_id: context.destination_site_id,
    target_site_id: context.target_site_id,
    decided_at: context.decided_at,
    evidence_refs: [...context.evidence_refs],
    ...(auditEventRef ? { audit_event_ref: auditEventRef } : {}),
  };
}

function explainPlan(value: InvocationPlan | InvocationRefusal): string[] {
  if (value.schema === "narada.invokable-intelligence.invocation-plan.v2") {
    const lines = [
      `plan ${value.id} (resolver ${value.resolver_version})`,
      `selected model ${value.selected.model.id} via ${value.selected.endpoint.id}`,
      `options ${JSON.stringify(value.options)}`,
    ];
    for (const entry of value.provenance.applied_constraints) lines.push(`constraint: ${entry.source} — ${entry.effect}`);
    for (const entry of value.provenance.applied_preferences) lines.push(`preference: ${entry.source} — ${entry.effect}`);
    for (const entry of value.provenance.applied_defaults) lines.push(`default: ${entry.source} — ${entry.effect}`);
    for (const rejected of value.provenance.rejected_candidates) lines.push(`rejected ${rejected.candidate.id}: ${rejected.reasons.join("; ")}`);
    return lines;
  }
  return [
    `refusal ${value.id}: ${value.reason_code} — ${value.explanation}`,
    ...value.rejected_candidates.map((rejected) => `rejected ${rejected.candidate.id}: ${rejected.reasons.join("; ")}`),
  ];
}

export function managementErrorResult(error: unknown): ManagementErrorResult {
  const managed = error instanceof ManagementError
    ? error
    : error instanceof RegistryError
      ? new ManagementError(error.code, "The canonical registry refused the management operation.")
    : new ManagementError("internal", "The management operation failed without an admissible diagnostic.");
  return {
    schema: MANAGEMENT_ERROR_SCHEMA,
    error: { code: managed.code, message: managed.message, evidence_refs: managed.evidence_refs },
  };
}

export class IntelligenceManagementService {
  constructor(readonly session: ManagementSession) {}

  private materialization(): IntelligenceMaterializationStore {
    if (!this.session.materialization) {
      throw new ManagementError("materialization-unavailable", "This management session has no materialization authority adapter.");
    }
    return this.session.materialization;
  }

  private async list(request: ManagementListRequest): Promise<ManagementResult> {
    const filter = request.filter ?? {};
    let items: unknown[];
    switch (request.collection) {
      case "resources":
        items = await this.session.store.listResources(filter.kind ? { kind: filter.kind as ResourceKind } : undefined);
        break;
      case "offerings":
        items = await this.session.store.listResources({ kind: "model-offering" });
        break;
      case "assertions":
        items = await this.session.store.listAssertions({
          ...(typeof filter.subjectId === "string" ? { subjectId: filter.subjectId } : {}),
          ...(typeof filter.family === "string" ? { family: filter.family } : {}),
          ...(typeof filter.name === "string" ? { name: filter.name } : {}),
          ...(typeof filter.locus === "string" ? { locus: filter.locus as never } : {}),
          ...(typeof filter.siteId === "string" ? { siteId: filter.siteId } : {}),
          ...(filter.includeSuperseded === true ? { includeSuperseded: true } : {}),
        });
        break;
      case "policies":
        items = await this.session.store.listPolicies({
          ...(typeof filter.locus === "string" ? { locus: filter.locus as never } : {}),
          ...(typeof filter.siteId === "string" ? { siteId: filter.siteId } : {}),
          ...(typeof filter.kind === "string" ? { kind: filter.kind as never } : {}),
        });
        break;
      case "catalog-records":
        items = await this.session.store.listCatalogRecords({
          ...(typeof filter.recordKind === "string" ? { recordKind: filter.recordKind as never } : {}),
          ...(typeof filter.recordId === "string" ? { recordId: filter.recordId } : {}),
          ...(typeof filter.authorityLocus === "string" ? { authorityLocus: filter.authorityLocus } : {}),
        });
        break;
      case "routes":
        items = await this.session.store.listCatalogRecords({ recordKind: "route" });
        break;
      case "topologies":
        items = (await this.session.store.listCatalogRecords({ recordKind: "route" })).map((record) => ({
          route_id: record.record_id,
          topology: (record.document as InvocationRouteCandidate).topology,
          authority: record.authority,
          validation: record.validation,
        }));
        break;
      case "authority-statements":
        items = await this.session.store.listCatalogRecords({ recordKind: "authority-statement" });
        break;
      case "access":
        items = await this.session.store.listCatalogRecords({ recordKind: "access" });
        break;
      case "materializations":
        items = await this.materialization().listProjections({
          ...(typeof filter.destinationSiteId === "string" ? { destinationSiteId: filter.destinationSiteId } : {}),
          ...(filter.resolver === "local" || filter.resolver === "cloudflare" ? { resolver: filter.resolver } : {}),
          ...(filter.status === "active" || filter.status === "superseded" || filter.status === "revoked" ? { status: filter.status } : {}),
        });
        break;
      case "materialization-audit":
        items = await this.materialization().listAudit({
          ...(typeof filter.projectionKey === "string" ? { projectionKey: filter.projectionKey } : {}),
          ...(typeof filter.operation === "string" ? { operation: filter.operation as MaterializationAuditEvent["operation"] } : {}),
          ...(typeof filter.outcome === "string" ? { outcome: filter.outcome as MaterializationAuditEvent["outcome"] } : {}),
        });
        break;
    }
    return result("list", { collection: request.collection, ...pageItems(items, request.page) });
  }

  private async show(request: ManagementShowRequest): Promise<ManagementResult> {
    let value: unknown = null;
    switch (request.entity) {
      case "resource": {
        const resource = await this.session.store.getResource(request.id);
        value = resource ? { resource, relations: await this.session.store.listRelations(request.id) } : null;
        break;
      }
      case "assertion":
        value = await this.session.store.getAssertion(request.id);
        break;
      case "policy":
        value = await this.session.store.getPolicy(request.id);
        break;
      case "catalog-record":
        value = await this.session.store.getCatalogRecord(request.id);
        break;
      case "materialization": {
        const store = this.materialization();
        const projection = await store.getProjection(request.id) ?? await store.getProjectionByEnvelope(request.id);
        value = projection ? { projection, audit: await store.listAudit({ projectionKey: projection.projection_key }) } : null;
        break;
      }
    }
    if (value === null) throw new ManagementError("not-found", "The requested management entity does not exist.");
    return result("show", value);
  }

  private async validate(): Promise<ManagementResult> {
    const [resources, assertions, policies, catalog] = await Promise.all([
      this.session.store.listResources(),
      this.session.store.listAssertions({ includeSuperseded: true }),
      this.session.store.listPolicies(),
      this.session.store.listCatalogRecords(),
    ]);
    const diagnostics: ManagementDiagnostic[] = [
      ...validateBundle({ resources, assertions, policies }),
      ...catalog.flatMap(validateCanonicalCatalogRecord),
    ];
    if (this.session.materialization) {
      const projections = await this.session.materialization.listProjections();
      for (const projection of projections) {
        diagnostics.push(
          ...validateMaterializationEnvelope(projection.envelope),
          ...validateMaterializationAdmission(projection.envelope, projection.admission),
        );
      }
    }
    return result("validate", {
      ok: diagnostics.length === 0,
      diagnostics,
      counts: { resources: resources.length, assertions: assertions.length, policies: policies.length, catalog_records: catalog.length },
    }, diagnostics.length === 0);
  }

  private async explainResolution(request: ManagementExplainResolutionRequest): Promise<ManagementResult> {
    if (!request.context.clock?.instant || !Number.isFinite(Date.parse(request.context.clock.instant))) {
      throw new ManagementError("explicit-time-required", "Resolution explanation requires an explicit valid decision time.");
    }
    const materializedInputs = await this.materialization().acquire({
      destination_site_id: request.context.targetSite.id,
      resolver: request.resolver,
      target_site_id: request.context.targetSite.id,
      purpose: request.intent.purpose,
      ...(request.intent.principal ? { principal_id: request.intent.principal } : {}),
      now: request.context.clock.instant,
    });
    const resolution = await resolveInvocation(request.intent, request.context, {
      store: this.session.store,
      materializedInputs,
    });
    return result("explain-resolution", {
      result: resolution,
      materialization: {
        admitted: materializedInputs.admitted.map(({ projection_key }) => projection_key),
        excluded: materializedInputs.excluded.map(({ projection, diagnostics }) => ({
          projection_key: projection.projection_key,
          diagnostics,
        })),
        acquisition_refs: materializedInputs.acquisition_refs,
      },
      lines: explainPlan(resolution),
    });
  }

  private async inspectMaterialization(request: ManagementInspectMaterializationRequest): Promise<ManagementResult> {
    if (!request.projection_key && !request.envelope_id) {
      throw new ManagementError("materialization-identity-required", "Inspection requires a projection key or envelope id.");
    }
    const store = this.materialization();
    const projection = request.projection_key
      ? await store.getProjection(request.projection_key)
      : await store.getProjectionByEnvelope(request.envelope_id!);
    if (!projection) throw new ManagementError("not-found", "The requested materialization does not exist.");
    const audit = await store.listAudit({ projectionKey: projection.projection_key });
    if (request.operation === "explain-materialization") {
      const lines = audit.map((event) => `${event.recorded_at} ${event.operation}:${event.outcome} revision ${event.statement.source_revision} from ${event.origin.site_id} to ${event.destination.site_id}`);
      return result(request.operation, { projection, audit, lines });
    }
    return result(request.operation, { projection, audit });
  }

  private validateMaterializationContext(
    envelope: MaterializationEnvelope,
    admission: MaterializationAdmission,
    context: ManagementMutationContext,
  ): void {
    if (
      envelope.destination.site_id !== context.destination_site_id
      || admission.destination_site_id !== context.destination_site_id
      || admission.decided_by !== context.actor_id
      || admission.decided_at !== context.decided_at
      || !admission.evidence_refs.every((ref) => context.evidence_refs.includes(ref))
    ) {
      throw new ManagementError("materialization-context-mismatch", "Envelope admission and management mutation context do not identify the same destination decision.", context.evidence_refs);
    }
    if (!envelope.allowed_scope.target_site_ids.includes(context.target_site_id)) {
      throw new ManagementError("target-scope-refused", "The target Site is outside the authorized materialization scope.", context.evidence_refs);
    }
    if (envelope.allowed_scope.principal_ids && !envelope.allowed_scope.principal_ids.includes(context.principal_id)) {
      throw new ManagementError("principal-consent-refused", "The principal is outside the authorized materialization scope.", context.evidence_refs);
    }
  }

  /** Validate one mutation completely, including current-store preconditions, without writing. */
  async preflightMutation(request: ManagementMutationRequest): Promise<void> {
    requireMutationContext(this.session, request.context);
    assertSecretFree(request);
    if (request.operation === "admit-catalog-seed") {
      const { seed, record_contexts: recordContexts } = request;
      if (
        seed.schema !== CANONICAL_CATALOG_SEED_SCHEMA
        || typeof seed.id !== "string" || !seed.id
        || typeof seed.created_at !== "string" || !Number.isFinite(Date.parse(seed.created_at))
        || !Array.isArray(seed.records) || seed.records.length === 0
        || !Array.isArray(seed.residuals) || seed.residuals.length !== 0
        || !recordContexts || typeof recordContexts !== "object" || Array.isArray(recordContexts)
      ) {
        throw new ManagementError("invalid-catalog-seed-admission", "Atomic catalog admission requires a non-empty canonical seed, no ungoverned residuals, and one mutation context per record.", request.context.evidence_refs);
      }
      const recordIds = seed.records.map(({ id }) => id);
      const contextIds = Object.keys(recordContexts);
      if (
        new Set(recordIds).size !== recordIds.length
        || contextIds.length !== recordIds.length
        || contextIds.some((id) => !recordIds.includes(id))
      ) {
        throw new ManagementError("catalog-seed-context-mismatch", "Atomic catalog admission requires exactly one context for every immutable record envelope.", request.context.evidence_refs);
      }
      for (const record of seed.records) requireCatalogRecordAdmission(this.session, record, recordContexts[record.id]);
      return;
    }
    if (request.operation === "admit-catalog-record") {
      requireCatalogRecordAdmission(this.session, request.record, request.context);
      return;
    }
    if (request.operation === "revoke-materialization") {
      const current = await this.materialization().getProjectionByEnvelope(request.revocation.envelope_id);
      if (!current || current.envelope.destination.site_id !== request.context.destination_site_id) {
        throw new ManagementError("not-found", "Revocation addresses no projection admitted by this destination Site.", request.context.evidence_refs);
      }
      if (!request.context.evidence_refs.includes(request.revocation.evidence_ref)) {
        throw new ManagementError("mutation-evidence-mismatch", "Revocation evidence is not admitted by the mutation context.", request.context.evidence_refs);
      }
      return;
    }

    this.validateMaterializationContext(request.envelope, request.admission, request.context);
    if (request.operation === "reject-materialization" && request.admission.decision === "admitted") {
      throw new ManagementError("rejection-decision-required", "Reject operation requires a rejected or deferred destination admission.", request.context.evidence_refs);
    }
    if (request.operation !== "reject-materialization" && request.admission.decision !== "admitted") {
      throw new ManagementError("admission-required", "Materialize and refresh require an admitted destination decision.", request.context.evidence_refs);
    }
    const current = await this.materialization().getProjection(materializationProjectionKey(request.envelope));
    if (request.operation === "materialize" && current && current.envelope.id !== request.envelope.id) {
      throw new ManagementError("refresh-required", "A current projection exists; use the explicit refresh operation.", request.context.evidence_refs);
    }
    if (request.operation === "refresh" && !current) {
      throw new ManagementError("materialization-required", "No current projection exists; use the explicit materialize operation.", request.context.evidence_refs);
    }
    if (request.operation === "refresh" && current && request.envelope.supersedes !== current.envelope.id) {
      throw new ManagementError("refresh-supersedes-required", "A refresh must explicitly supersede the current materialization envelope.", request.context.evidence_refs);
    }
    if (request.operation !== "reject-materialization") validateMaterializationRecords(request);
  }

  private async mutate(request: ManagementMutationRequest): Promise<ManagementResult> {
    await this.preflightMutation(request);
    if (request.operation === "admit-catalog-seed") {
      const { seed, record_contexts: recordContexts } = request;
      await this.session.store.loadCatalogSeed(seed);
      const recordReceipts = seed.records.map((record) => receipt(
        request,
        record.id,
        undefined,
        recordContexts[record.id],
      ));
      const mutationReceipt = receipt(request, seed.id);
      return result(request.operation, { seed, receipt: mutationReceipt, record_receipts: recordReceipts });
    }
    if (request.operation === "admit-catalog-record") {
      const { record, context } = request;
      await this.session.store.loadCatalogSeed({
        schema: CANONICAL_CATALOG_SEED_SCHEMA,
        id: `management-seed:${record.id}:${record.revision}`,
        created_at: context.decided_at,
        records: [record],
        residuals: [],
      });
      const mutationReceipt = receipt(request, record.id);
      return result(request.operation, { record, receipt: mutationReceipt });
    }

    if (request.operation === "revoke-materialization") {
      const store = this.materialization();
      const stored = await store.revoke(request.revocation);
      return this.materializationMutationResult(request, request.revocation.envelope_id, stored);
    }

    const store = this.materialization();
    if (request.operation !== "reject-materialization") {
      await this.session.store.loadCatalogSeed({
        schema: CANONICAL_CATALOG_SEED_SCHEMA,
        id: `materialization-seed:${request.envelope.id}:${request.envelope.statement.source_revision}`,
        created_at: request.context.decided_at,
        records: [request.statement_record, request.payload_record],
        residuals: [],
      });
    }
    const stored = await store.apply(request.envelope, request.admission);
    return this.materializationMutationResult(request, request.envelope.id, stored);
  }

  private materializationMutationResult(
    request: ManagementMutationRequest,
    targetRef: string,
    stored: StoredMaterializationResult,
  ): ManagementResult {
    const mutationReceipt = receipt(request, targetRef, stored.audit_event_ref);
    return result(request.operation, { result: stored, receipt: mutationReceipt }, stored.status !== "rejected");
  }

  async execute(request: ManagementRequest): Promise<ManagementResult> {
    assertSecretFree(request);
    switch (request.operation) {
      case "list": return this.list(request);
      case "show": return this.show(request);
      case "validate": return this.validate();
      case "explain-resolution": return this.explainResolution(request);
      case "inspect-materialization":
      case "explain-materialization": return this.inspectMaterialization(request);
      case "admit-catalog-record":
      case "admit-catalog-seed":
      case "materialize":
      case "refresh":
      case "reject-materialization":
      case "revoke-materialization": return this.mutate(request);
      default:
        throw new ManagementError("unsupported-operation", "The requested management operation is not part of the canonical service contract.");
    }
  }

  async executeSafe(request: ManagementRequest): Promise<ManagementResult | ManagementErrorResult> {
    try {
      return await this.execute(request);
    } catch (error) {
      return managementErrorResult(error);
    }
  }
}
