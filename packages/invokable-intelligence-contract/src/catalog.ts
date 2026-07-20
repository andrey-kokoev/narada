/** Canonical catalog records: durable source, authority, revision, and validation context. */

import type {
  AccessGrant,
  BudgetAuthorization,
  CredentialBinding,
  DataGovernanceRequirement,
  InvocationPrincipal,
  QuotaObservation,
  ServiceAccount,
  ServiceEntitlement,
} from "./access.js";
import type { CapabilityAssertion, EvidenceRef } from "./assertions.js";
import type {
  IntelligenceAuthorityLocus,
  IntelligenceAuthorityStatement,
  IntelligenceStatementKind,
} from "./authority.js";
import type { InvocationRouteCandidate, RouteCapabilityAssertion } from "./offerings.js";
import type { PolicyDocument } from "./policies.js";
import type { Resource } from "./resources.js";
import type { AuthoritativeDecisionClock, ContentDigest } from "./temporal.js";
import { canonicalSha256 } from "./canonical.js";

export const CANONICAL_CATALOG_RECORD_SCHEMA =
  "narada.invokable-intelligence.canonical-catalog-record.v1" as const;
export const CANONICAL_CATALOG_SEED_SCHEMA =
  "narada.invokable-intelligence.canonical-catalog-seed.v1" as const;
export const CATALOG_TEMPORAL_INPUT_SCHEMA =
  "narada.invokable-intelligence.catalog-temporal-input.v1" as const;
export const CATALOG_ADMISSION_RESIDUAL_SCHEMA =
  "narada.invokable-intelligence.catalog-admission-residual.v1" as const;

export type CatalogAccessRecord =
  | ServiceAccount
  | InvocationPrincipal
  | CredentialBinding
  | AccessGrant
  | ServiceEntitlement
  | QuotaObservation
  | BudgetAuthorization
  | DataGovernanceRequirement;

/** Explicit resolver-time input derived from a named clock authority. */
export interface CatalogTemporalInput {
  schema: typeof CATALOG_TEMPORAL_INPUT_SCHEMA;
  id: string;
  clock: AuthoritativeDecisionClock;
  valid_until: string;
}

export type CanonicalCatalogDocument =
  | Resource
  | CapabilityAssertion
  | RouteCapabilityAssertion
  | PolicyDocument
  | InvocationRouteCandidate
  | IntelligenceAuthorityStatement
  | CatalogAccessRecord
  | CatalogTemporalInput;

export type CanonicalCatalogRecordKind =
  | "resource"
  | "assertion"
  | "policy"
  | "route"
  | "authority-statement"
  | "access"
  | "temporal-input";

export type CatalogAuthorityKind =
  | IntelligenceStatementKind
  | "catalog-definition"
  | "account-definition"
  | "temporal-input";

export interface CanonicalCatalogSourceRevision {
  schema: string;
  reference: string;
  revision: string;
  digest: ContentDigest;
}

export interface CanonicalCatalogAuthority {
  kind: CatalogAuthorityKind;
  locus: IntelligenceAuthorityLocus;
  authority_ref: string;
  site_id?: string;
  principal_id?: string;
}

export interface CanonicalCatalogValidation {
  status: "accepted";
  validator: string;
  validated_at: string;
  evidence: EvidenceRef[];
}

/**
 * Canonical state is not a bare document. The envelope makes its source,
 * authority, immutable revision, and admission evidence queryable without
 * smuggling those semantics into provider/model names or storage location.
 */
export interface CanonicalCatalogRecord {
  schema: typeof CANONICAL_CATALOG_RECORD_SCHEMA;
  id: string;
  record_kind: CanonicalCatalogRecordKind;
  record_id: string;
  revision: number;
  source: CanonicalCatalogSourceRevision;
  authority: CanonicalCatalogAuthority;
  validation: CanonicalCatalogValidation;
  document: CanonicalCatalogDocument;
}

export type CatalogAdmissionResidualCode =
  | "ambiguous-model-provider"
  | "ambiguous-default"
  | "authority-escalation"
  | "secret-bearing-input"
  | "invalid-legacy-input"
  | "legacy-runtime-selection-not-authoritative";

export interface CatalogAdmissionResidual {
  schema: typeof CATALOG_ADMISSION_RESIDUAL_SCHEMA;
  id: string;
  source_path: string;
  code: CatalogAdmissionResidualCode;
  disposition: "rejected" | "not-authoritative";
  message: string;
  evidence: EvidenceRef[];
}

export interface CanonicalCatalogSeed {
  schema: typeof CANONICAL_CATALOG_SEED_SCHEMA;
  id: string;
  created_at: string;
  records: CanonicalCatalogRecord[];
  residuals: CatalogAdmissionResidual[];
}

export type CatalogDiagnosticCode =
  | "invalid-catalog-record"
  | "catalog-record-id-mismatch"
  | "catalog-record-kind-mismatch"
  | "catalog-record-authority-mismatch"
  | "catalog-record-digest-mismatch"
  | "missing-catalog-provenance"
  | "missing-catalog-authority"
  | "missing-catalog-validation";

export interface CatalogDiagnostic {
  code: CatalogDiagnosticCode;
  record_id?: string;
  message: string;
}

const SCHEMA_KIND: Record<string, CanonicalCatalogRecordKind> = {
  "narada.invokable-intelligence.capability-assertion.v1": "assertion",
  "narada.invokable-intelligence.route-capability-assertion.v1": "assertion",
  "narada.invokable-intelligence.policy.v1": "policy",
  "narada.invokable-intelligence.invocation-route-candidate.v1": "route",
  "narada.invokable-intelligence.authority-statement.v1": "authority-statement",
  [CATALOG_TEMPORAL_INPUT_SCHEMA]: "temporal-input",
  "narada.invokable-intelligence.service-account.v1": "access",
  "narada.invokable-intelligence.principal.v1": "access",
  "narada.invokable-intelligence.credential-binding.v1": "access",
  "narada.invokable-intelligence.access-grant.v1": "access",
  "narada.invokable-intelligence.service-entitlement.v1": "access",
  "narada.invokable-intelligence.quota-observation.v1": "access",
  "narada.invokable-intelligence.budget-authorization.v1": "access",
  "narada.invokable-intelligence.data-governance-requirement.v1": "access",
};

function expectedKind(document: CanonicalCatalogDocument): CanonicalCatalogRecordKind {
  return SCHEMA_KIND[document.schema] ?? "resource";
}

/** Structural envelope validation; domain validators still validate the nested document. */
export function validateCanonicalCatalogRecord(record: CanonicalCatalogRecord): CatalogDiagnostic[] {
  const diagnostics: CatalogDiagnostic[] = [];
  if (record.schema !== CANONICAL_CATALOG_RECORD_SCHEMA || !record.id || !record.record_id || record.revision < 1 || !record.document) {
    diagnostics.push({ code: "invalid-catalog-record", record_id: record.record_id, message: "catalog record identity, positive revision, and document are required" });
  }
  if ((record.document as { id?: string }).id !== record.record_id) {
    diagnostics.push({ code: "catalog-record-id-mismatch", record_id: record.record_id, message: "envelope record_id must equal nested document id" });
  }
  const kind = expectedKind(record.document);
  if (record.record_kind !== kind) {
    diagnostics.push({ code: "catalog-record-kind-mismatch", record_id: record.record_id, message: `document schema requires record_kind '${kind}'` });
  }
  if (!record.source.reference || !record.source.revision || !record.source.digest) {
    diagnostics.push({ code: "missing-catalog-provenance", record_id: record.record_id, message: "source reference, revision, and digest are required" });
  } else if (record.source.digest !== canonicalSha256(record.document)) {
    diagnostics.push({ code: "catalog-record-digest-mismatch", record_id: record.record_id, message: "source digest must equal the canonical document sha256" });
  }
  if (!record.authority.kind || !record.authority.locus || !record.authority.authority_ref) {
    diagnostics.push({ code: "missing-catalog-authority", record_id: record.record_id, message: "authority kind, locus, and authority_ref are required" });
  }
  if (record.document.schema === "narada.invokable-intelligence.authority-statement.v1") {
    const origin = record.document.origin;
    if (record.authority.kind !== record.document.kind
      || record.authority.locus !== origin.locus
      || record.authority.site_id !== origin.site_id
      || record.authority.principal_id !== origin.principal_id
      || record.authority.authority_ref !== origin.authority_ref) {
      diagnostics.push({
        code: "catalog-record-authority-mismatch",
        record_id: record.record_id,
        message: "authority-statement catalog authority must exactly match the statement origin",
      });
    }
  }
  if (record.validation.status !== "accepted" || !record.validation.validator || record.validation.evidence.length === 0) {
    diagnostics.push({ code: "missing-catalog-validation", record_id: record.record_id, message: "accepted validation with validator and evidence is required" });
  }
  return diagnostics;
}
