/** Governed cross-locus materialization without authority replication. */

import {
  INTELLIGENCE_AUTHORITY_MATRIX,
  type IntelligenceAuthorityLocus,
  type IntelligenceResolutionEffect,
  type IntelligenceStatementKind,
} from "./authority.js";
import type { ContentDigest } from "./temporal.js";

export const MATERIALIZATION_ENVELOPE_SCHEMA = "narada.invokable-intelligence.materialization-envelope.v1" as const;
export const MATERIALIZATION_ADMISSION_SCHEMA = "narada.invokable-intelligence.materialization-admission.v1" as const;
export const MATERIALIZATION_REVOCATION_SCHEMA = "narada.invokable-intelligence.materialization-revocation.v1" as const;
export const MATERIALIZATION_AUDIT_EVENT_SCHEMA = "narada.invokable-intelligence.materialization-audit-event.v1" as const;
export const REQUEST_SCOPED_MATERIALIZATION_BINDING_SCHEMA = "narada.invokable-intelligence.request-scoped-materialization-binding.v1" as const;

export type MaterializationMode = "durable-projection" | "request-scoped-context";
export type MaterializationStoreKind = "sqlite" | "d1" | "request-context";

export interface MaterializationAuthorityRef {
  site_id: string;
  locus: IntelligenceAuthorityLocus;
  authority_ref: string;
}

/** Security-relevant request envelope fields covered by the signature digest. */
export interface RequestScopedMaterializationBinding {
  schema: typeof REQUEST_SCOPED_MATERIALIZATION_BINDING_SCHEMA;
  envelope_id: string;
  origin: MaterializationAuthorityRef;
  destination: MaterializationEnvelope["destination"];
  statement: MaterializationEnvelope["statement"];
  allowed_scope: MaterializationEnvelope["allowed_scope"];
  issued_at: string;
  expires_at: string;
  provenance_refs: string[];
  authorization_ref: string;
  supersedes?: string;
  request: { request_id: string; nonce: string };
  verifier: { algorithm: string; key_id: string };
}

export interface MaterializationEnvelope {
  schema: typeof MATERIALIZATION_ENVELOPE_SCHEMA;
  id: string;
  mode: MaterializationMode;
  origin: MaterializationAuthorityRef;
  destination: {
    site_id: string;
    resolver: "local" | "cloudflare";
    store: MaterializationStoreKind;
  };
  statement: {
    id: string;
    kind: IntelligenceStatementKind;
    effect: IntelligenceResolutionEffect;
    source_revision: number;
    payload_digest: ContentDigest;
    /** Immutable/content-addressed payload; envelope never embeds secret or policy payload values. */
    payload_ref: string;
  };
  allowed_scope: {
    purposes: string[];
    target_site_ids: string[];
    principal_ids?: string[];
    topology_ids?: string[];
  };
  issued_at: string;
  expires_at: string;
  provenance_refs: string[];
  authorization_ref: string;
  supersedes?: string;
  revocation_ref?: string;
  request_context?: {
    request_id: string;
    nonce: string;
    signature: { algorithm: string; key_id: string; signed_digest: ContentDigest; value: string };
  };
}

export interface MaterializationAdmission {
  schema: typeof MATERIALIZATION_ADMISSION_SCHEMA;
  id: string;
  envelope_id: string;
  destination_site_id: string;
  decision: "admitted" | "rejected" | "deferred";
  decided_at: string;
  decided_by: string;
  reason_codes: string[];
  evidence_refs: string[];
  admitted_digest?: ContentDigest;
}

export interface MaterializationRevocation {
  schema: typeof MATERIALIZATION_REVOCATION_SCHEMA;
  id: string;
  envelope_id: string;
  statement_id: string;
  source_revision: number;
  origin: MaterializationAuthorityRef;
  revoked_at: string;
  reason_code: string;
  evidence_ref: string;
}

export interface MaterializedProjection {
  projection_key: string;
  envelope: MaterializationEnvelope;
  admission: MaterializationAdmission;
  status: "active" | "superseded" | "revoked";
  materialized_at: string;
  superseded_by?: string;
  revocation?: MaterializationRevocation;
}

export type MaterializationDiagnosticCode =
  | "invalid-envelope"
  | "invalid-admission"
  | "unauthorized-origin"
  | "effect-mismatch"
  | "destination-mismatch"
  | "not-admitted"
  | "digest-mismatch"
  | "expired-projection"
  | "stale-projection"
  | "projection-conflict"
  | "scope-mismatch"
  | "revoked-projection"
  | "invalid-revocation"
  | "signature-required"
  | "signature-invalid";

export interface MaterializationDiagnostic {
  code: MaterializationDiagnosticCode;
  envelope_id?: string;
  projection_key?: string;
  message: string;
}

export interface MaterializationApplyResult {
  status: "materialized" | "refreshed" | "idempotent" | "rejected";
  projection?: MaterializedProjection;
  replaced_projection?: MaterializedProjection;
  diagnostics: MaterializationDiagnostic[];
}

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const validInstant = (value: string) => typeof value === "string" && Number.isFinite(Date.parse(value));

export function materializationProjectionKey(envelope: MaterializationEnvelope): string {
  return [envelope.destination.site_id, envelope.origin.site_id, envelope.origin.locus, envelope.statement.id].join("|");
}

/** Build the canonical semantic payload whose digest must be signed. */
export function requestScopedMaterializationBinding(envelope: MaterializationEnvelope): RequestScopedMaterializationBinding | null {
  const request = envelope.request_context;
  if (!request) return null;
  const sorted = (values: string[] | undefined) => values ? [...values].sort() : undefined;
  return {
    schema: REQUEST_SCOPED_MATERIALIZATION_BINDING_SCHEMA,
    envelope_id: envelope.id,
    origin: { ...envelope.origin },
    destination: { ...envelope.destination },
    statement: { ...envelope.statement },
    allowed_scope: {
      purposes: sorted(envelope.allowed_scope.purposes)!,
      target_site_ids: sorted(envelope.allowed_scope.target_site_ids)!,
      ...(envelope.allowed_scope.principal_ids ? { principal_ids: sorted(envelope.allowed_scope.principal_ids) } : {}),
      ...(envelope.allowed_scope.topology_ids ? { topology_ids: sorted(envelope.allowed_scope.topology_ids) } : {}),
    },
    issued_at: envelope.issued_at,
    expires_at: envelope.expires_at,
    provenance_refs: sorted(envelope.provenance_refs)!,
    authorization_ref: envelope.authorization_ref,
    ...(envelope.supersedes ? { supersedes: envelope.supersedes } : {}),
    request: { request_id: request.request_id, nonce: request.nonce },
    verifier: { algorithm: request.signature.algorithm, key_id: request.signature.key_id },
  };
}

export function validateMaterializationEnvelope(envelope: MaterializationEnvelope): MaterializationDiagnostic[] {
  const diagnostics: MaterializationDiagnostic[] = [];
  if (
    envelope.schema !== MATERIALIZATION_ENVELOPE_SCHEMA
    || !envelope.id
    || !envelope.origin.site_id
    || !envelope.origin.authority_ref
    || !envelope.destination.site_id
    || !envelope.statement.id
    || envelope.statement.source_revision < 1
    || !envelope.statement.payload_ref
    || !envelope.authorization_ref
    || !envelope.provenance_refs.length
  ) {
    diagnostics.push({ code: "invalid-envelope", envelope_id: envelope.id, message: "Materialization envelope is missing required identity, authority, revision, payload-reference, or authorization fields." });
  }
  if (!DIGEST_PATTERN.test(envelope.statement.payload_digest)) {
    diagnostics.push({ code: "invalid-envelope", envelope_id: envelope.id, message: "Materialized payload requires a lowercase sha256 digest." });
  }
  if (!validInstant(envelope.issued_at) || !validInstant(envelope.expires_at) || Date.parse(envelope.expires_at) <= Date.parse(envelope.issued_at)) {
    diagnostics.push({ code: "invalid-envelope", envelope_id: envelope.id, message: "Materialization requires an explicit positive validity interval." });
  }
  if (!envelope.allowed_scope.purposes.length || !envelope.allowed_scope.target_site_ids.length) {
    diagnostics.push({ code: "invalid-envelope", envelope_id: envelope.id, message: "Allowed purpose and target-Site scope must be explicit and non-empty." });
  }
  const matrix = INTELLIGENCE_AUTHORITY_MATRIX[envelope.statement.kind];
  if (!matrix) {
    diagnostics.push({
      code: "invalid-envelope",
      envelope_id: envelope.id,
      message: `Unknown intelligence statement kind: ${String(envelope.statement.kind)}.`,
    });
  } else if (!matrix.authorized_actions.originate.includes(envelope.origin.locus as never)) {
    diagnostics.push({
      code: "unauthorized-origin",
      envelope_id: envelope.id,
      message: `${envelope.origin.locus} may not originate ${envelope.statement.kind}.`,
    });
  }
  if (matrix && matrix.resolution_effect !== envelope.statement.effect) {
    diagnostics.push({
      code: "effect-mismatch",
      envelope_id: envelope.id,
      message: `Materialization cannot change ${envelope.statement.kind} to effect ${envelope.statement.effect}.`,
    });
  }
  if (envelope.mode === "request-scoped-context") {
    if (
      envelope.destination.store !== "request-context"
      || !envelope.request_context
      || !envelope.request_context.request_id
      || !envelope.request_context.nonce
      || !envelope.request_context.signature.algorithm
      || !envelope.request_context.signature.key_id
      || !envelope.request_context.signature.value
      || !DIGEST_PATTERN.test(envelope.request_context.signature.signed_digest)
    ) {
      diagnostics.push({ code: "signature-required", envelope_id: envelope.id, message: "Request-scoped context requires request-context destination and a signed request binding." });
    }
  } else if (envelope.destination.store === "request-context" || envelope.request_context) {
    diagnostics.push({ code: "invalid-envelope", envelope_id: envelope.id, message: "Durable projections cannot masquerade as request-scoped context." });
  }
  return diagnostics;
}

export function validateMaterializationAdmission(
  envelope: MaterializationEnvelope,
  admission: MaterializationAdmission,
): MaterializationDiagnostic[] {
  const diagnostics: MaterializationDiagnostic[] = [];
  if (
    !admission.id
    || !validInstant(admission.decided_at)
    || !admission.decided_by
    || !admission.evidence_refs.length
    || !["admitted", "rejected", "deferred"].includes(admission.decision)
  ) {
    diagnostics.push({
      code: "invalid-admission",
      envelope_id: envelope.id,
      message: "Destination admission requires identity, decision authority, time, evidence, and a recognized decision.",
    });
  }
  if (admission.schema !== MATERIALIZATION_ADMISSION_SCHEMA || admission.envelope_id !== envelope.id || admission.destination_site_id !== envelope.destination.site_id) {
    diagnostics.push({ code: "destination-mismatch", envelope_id: envelope.id, message: "Destination admission must address this envelope and destination Site." });
  }
  if (admission.decision !== "admitted") {
    diagnostics.push({ code: "not-admitted", envelope_id: envelope.id, message: `Destination decision is ${admission.decision}; the payload remains inert.` });
  }
  if (admission.decision === "admitted" && admission.admitted_digest !== envelope.statement.payload_digest) {
    diagnostics.push({ code: "digest-mismatch", envelope_id: envelope.id, message: "Destination admission digest differs from the origin envelope digest." });
  }
  if (
    admission.decision === "admitted"
    && validInstant(admission.decided_at)
    && (
      Date.parse(admission.decided_at) < Date.parse(envelope.issued_at)
      || Date.parse(admission.decided_at) >= Date.parse(envelope.expires_at)
    )
  ) {
    diagnostics.push({ code: "invalid-admission", envelope_id: envelope.id, message: "Destination admission is outside the envelope validity interval." });
  }
  if (admission.decision !== "admitted" && admission.admitted_digest !== undefined) {
    diagnostics.push({ code: "invalid-admission", envelope_id: envelope.id, message: "Only an admitted decision may carry an admitted digest." });
  }
  return diagnostics;
}

/** Apply a projection/refresh while preserving one origin and one destination admission authority. */
export function applyMaterializedProjection(
  current: MaterializedProjection | undefined,
  envelope: MaterializationEnvelope,
  admission: MaterializationAdmission,
): MaterializationApplyResult {
  const diagnostics = [
    ...validateMaterializationEnvelope(envelope),
    ...validateMaterializationAdmission(envelope, admission),
  ];
  const projectionKey = materializationProjectionKey(envelope);
  if (diagnostics.length) return { status: "rejected", diagnostics };
  const candidate: MaterializedProjection = {
    projection_key: projectionKey,
    envelope: structuredClone(envelope),
    admission: structuredClone(admission),
    status: "active",
    materialized_at: admission.decided_at,
  };
  if (!current) return { status: "materialized", projection: candidate, diagnostics: [] };
  if (current.projection_key !== projectionKey) {
    return { status: "rejected", diagnostics: [{ code: "projection-conflict", envelope_id: envelope.id, projection_key: projectionKey, message: "Refresh does not address the existing projection key." }] };
  }
  if (current.envelope.id === envelope.id && current.envelope.statement.payload_digest === envelope.statement.payload_digest) {
    return { status: "idempotent", projection: current, diagnostics: [] };
  }
  if (envelope.statement.source_revision <= current.envelope.statement.source_revision) {
    const code = envelope.statement.source_revision === current.envelope.statement.source_revision ? "projection-conflict" : "stale-projection";
    return { status: "rejected", diagnostics: [{ code, envelope_id: envelope.id, projection_key: projectionKey, message: "Projection refresh must carry a strictly newer origin revision." }] };
  }
  if (envelope.supersedes !== current.envelope.id) {
    return { status: "rejected", diagnostics: [{ code: "projection-conflict", envelope_id: envelope.id, projection_key: projectionKey, message: "A newer projection must explicitly supersede the current envelope." }] };
  }
  const replaced: MaterializedProjection = { ...current, status: "superseded", superseded_by: envelope.id };
  return { status: "refreshed", projection: candidate, replaced_projection: replaced, diagnostics: [] };
}

export function revokeMaterializedProjection(
  current: MaterializedProjection,
  revocation: MaterializationRevocation,
): MaterializationApplyResult {
  const sameOrigin = revocation.origin.site_id === current.envelope.origin.site_id
    && revocation.origin.locus === current.envelope.origin.locus
    && revocation.origin.authority_ref === current.envelope.origin.authority_ref;
  if (
    revocation.schema !== MATERIALIZATION_REVOCATION_SCHEMA
    || !revocation.id
    || revocation.envelope_id !== current.envelope.id
    || revocation.statement_id !== current.envelope.statement.id
    || revocation.source_revision < current.envelope.statement.source_revision
    || !sameOrigin
    || !validInstant(revocation.revoked_at)
    || Date.parse(revocation.revoked_at) < Date.parse(current.envelope.issued_at)
    || !revocation.reason_code
    || !revocation.evidence_ref
  ) {
    return { status: "rejected", diagnostics: [{ code: "invalid-revocation", envelope_id: current.envelope.id, projection_key: current.projection_key, message: "Revocation must come from the preserved origin authority and address the active statement revision." }] };
  }
  return {
    status: "refreshed",
    projection: { ...current, status: "revoked", revocation: structuredClone(revocation) },
    replaced_projection: current,
    diagnostics: [],
  };
}

export interface RequestScopedVerificationContext {
  request_id: string;
  destination_site_id: string;
  now: string;
  compute_binding_digest: (binding: RequestScopedMaterializationBinding) => ContentDigest;
  verify_signature: (input: { binding: RequestScopedMaterializationBinding; key_id: string; algorithm: string; signed_digest: ContentDigest; value: string }) => boolean;
}

export function verifyRequestScopedMaterialization(
  envelope: MaterializationEnvelope,
  context: RequestScopedVerificationContext,
): MaterializationDiagnostic[] {
  const diagnostics = validateMaterializationEnvelope(envelope);
  const binding = envelope.request_context;
  const signingBinding = requestScopedMaterializationBinding(envelope);
  if (
    envelope.mode !== "request-scoped-context"
    || !binding
    || !signingBinding
    || binding.request_id !== context.request_id
    || envelope.destination.site_id !== context.destination_site_id
  ) {
    diagnostics.push({ code: "signature-invalid", envelope_id: envelope.id, message: "Signed context is not bound to this request and destination." });
  } else {
    const computedDigest = context.compute_binding_digest(signingBinding);
    if (computedDigest !== binding.signature.signed_digest || !context.verify_signature({ ...binding.signature, binding: signingBinding })) {
      diagnostics.push({ code: "signature-invalid", envelope_id: envelope.id, message: "Request-scoped context signature or signed binding digest is invalid." });
    }
  }
  if (!validInstant(context.now) || Date.parse(context.now) < Date.parse(envelope.issued_at) || Date.parse(context.now) >= Date.parse(envelope.expires_at)) {
    diagnostics.push({ code: "expired-projection", envelope_id: envelope.id, message: "Request-scoped context is outside its validity interval." });
  }
  return diagnostics;
}

export interface ResolverMaterializationContext {
  destination_site_id: string;
  resolver: "local" | "cloudflare";
  target_site_id: string;
  purpose: string;
  principal_id?: string;
  topology_id?: string;
  now: string;
}

export interface ResolverMaterializedInputs {
  admitted: MaterializedProjection[];
  excluded: Array<{ projection: MaterializedProjection; diagnostics: MaterializationDiagnostic[] }>;
  acquisition_refs: string[];
}

/** Acquire resolver inputs from destination-admitted projections only. */
export function acquireResolverMaterializedInputs(
  projections: readonly MaterializedProjection[],
  context: ResolverMaterializationContext,
): ResolverMaterializedInputs {
  const admitted: MaterializedProjection[] = [];
  const excluded: ResolverMaterializedInputs["excluded"] = [];
  for (const projection of projections) {
    const diagnostics: MaterializationDiagnostic[] = [];
    const { envelope } = projection;
    diagnostics.push(
      ...validateMaterializationEnvelope(envelope),
      ...validateMaterializationAdmission(envelope, projection.admission),
    );
    if (projection.status === "revoked") diagnostics.push({ code: "revoked-projection", envelope_id: envelope.id, projection_key: projection.projection_key, message: "Projection has been revoked by its origin authority." });
    if (projection.status === "superseded") diagnostics.push({ code: "stale-projection", envelope_id: envelope.id, projection_key: projection.projection_key, message: "Projection has been superseded by a newer origin revision." });
    if (!["active", "superseded", "revoked"].includes(projection.status)) diagnostics.push({ code: "invalid-envelope", envelope_id: envelope.id, projection_key: projection.projection_key, message: "Stored projection has an invalid lifecycle status." });
    if (envelope.destination.site_id !== context.destination_site_id || envelope.destination.resolver !== context.resolver) {
      diagnostics.push({ code: "destination-mismatch", envelope_id: envelope.id, projection_key: projection.projection_key, message: "Projection is admitted for a different destination resolver." });
    }
    if (!validInstant(context.now) || Date.parse(context.now) < Date.parse(envelope.issued_at) || Date.parse(context.now) >= Date.parse(envelope.expires_at)) {
      diagnostics.push({ code: "expired-projection", envelope_id: envelope.id, projection_key: projection.projection_key, message: "Projection is outside its validity interval." });
    }
    const scope = envelope.allowed_scope;
    if (
      !scope.purposes.includes(context.purpose)
      || !scope.target_site_ids.includes(context.target_site_id)
      || (scope.principal_ids && (!context.principal_id || !scope.principal_ids.includes(context.principal_id)))
      || (scope.topology_ids && (!context.topology_id || !scope.topology_ids.includes(context.topology_id)))
    ) {
      diagnostics.push({ code: "scope-mismatch", envelope_id: envelope.id, projection_key: projection.projection_key, message: "Resolver invocation is outside the materialization's allowed purpose, target, principal, or topology scope." });
    }
    if (diagnostics.length) excluded.push({ projection, diagnostics });
    else admitted.push(projection);
  }
  admitted.sort((a, b) => a.projection_key.localeCompare(b.projection_key) || a.envelope.statement.source_revision - b.envelope.statement.source_revision);
  return { admitted, excluded, acquisition_refs: admitted.map(({ admission }) => admission.id) };
}

/** Portable schema used by both node:sqlite and Cloudflare D1 adapters. */
export const MATERIALIZATION_PROJECTION_DDL = [
  "CREATE TABLE IF NOT EXISTS intelligence_materializations (projection_key TEXT PRIMARY KEY, envelope_id TEXT NOT NULL UNIQUE, origin_site_id TEXT NOT NULL, origin_locus TEXT NOT NULL, destination_site_id TEXT NOT NULL, destination_resolver TEXT NOT NULL, statement_id TEXT NOT NULL, statement_kind TEXT NOT NULL, source_revision INTEGER NOT NULL, payload_digest TEXT NOT NULL, envelope_json TEXT NOT NULL, admission_json TEXT NOT NULL, projection_json TEXT NOT NULL, status TEXT NOT NULL, materialized_at TEXT NOT NULL)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_intelligence_materialization_revision ON intelligence_materializations(destination_site_id, origin_site_id, origin_locus, statement_id, source_revision)",
  "CREATE INDEX IF NOT EXISTS idx_intelligence_materialization_destination ON intelligence_materializations(destination_site_id, destination_resolver, status)",
  "CREATE TABLE IF NOT EXISTS intelligence_materialization_audit (event_id TEXT PRIMARY KEY, projection_key TEXT NOT NULL, envelope_id TEXT NOT NULL, origin_site_id TEXT NOT NULL, origin_locus TEXT NOT NULL, destination_site_id TEXT NOT NULL, statement_id TEXT NOT NULL, source_revision INTEGER NOT NULL, operation TEXT NOT NULL, outcome TEXT NOT NULL, event_json TEXT NOT NULL, recorded_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_intelligence_materialization_audit_projection ON intelligence_materialization_audit(projection_key, recorded_at, event_id)",
] as const;

export const MATERIALIZATION_STORE_BINDINGS = {
  sqlite: { dialect: "sqlite", ddl: MATERIALIZATION_PROJECTION_DDL },
  d1: { dialect: "d1", ddl: MATERIALIZATION_PROJECTION_DDL },
} as const;

export type MaterializationOperation =
  | { operation: "materialize" | "refresh"; envelope: MaterializationEnvelope; admission: MaterializationAdmission }
  | { operation: "revoke"; revocation: MaterializationRevocation }
  | { operation: "reject"; envelope_id: string; admission: MaterializationAdmission }
  | { operation: "inspect" | "explain"; projection_key: string };

export interface MaterializationAuditEvent {
  schema: typeof MATERIALIZATION_AUDIT_EVENT_SCHEMA;
  id: string;
  projection_key: string;
  envelope_id: string;
  operation: "materialize" | "refresh" | "revoke" | "reject";
  outcome: "applied" | "idempotent" | "rejected";
  recorded_at: string;
  origin: MaterializationAuthorityRef;
  destination: MaterializationEnvelope["destination"];
  statement: MaterializationEnvelope["statement"];
  admission_id?: string;
  revocation_id?: string;
  replaced_envelope_id?: string;
  diagnostics: MaterializationDiagnostic[];
  evidence_refs: string[];
}

export interface MaterializationOperationResult {
  operation: MaterializationOperation["operation"];
  status: "applied" | "idempotent" | "rejected" | "found" | "not-found";
  projection?: MaterializedProjection;
  diagnostics: MaterializationDiagnostic[];
  audit_event_ref: string;
}
