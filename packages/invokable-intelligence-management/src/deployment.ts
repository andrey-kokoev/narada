/** Governed deployment of a complete Site-owned intelligence catalog. */

import {
  CANONICAL_CATALOG_SEED_SCHEMA,
  materializationProjectionKey,
  validateCanonicalCatalogRecord,
} from "@narada2/invokable-intelligence-contract";
import type {
  CanonicalCatalogRecord,
  CanonicalCatalogSeed,
  IntelligenceAuthorityLocus,
  MaterializationAdmission,
  MaterializationEnvelope,
  ResourceRef,
} from "@narada2/invokable-intelligence-contract";

import {
  IntelligenceManagementService,
  MANAGEMENT_MUTATION_CONTEXT_SCHEMA,
  ManagementError,
} from "./service.js";
import type {
  ManagementMutationRequest,
  ManagementMutationContext,
  ManagementMutationReceipt,
  ManagementSession,
} from "./service.js";

export const MANAGEMENT_DEPLOYMENT_BUNDLE_SCHEMA =
  "narada.invokable-intelligence.management-deployment-bundle.v1" as const;
export const MANAGEMENT_DEPLOYMENT_RESULT_SCHEMA =
  "narada.invokable-intelligence.management-deployment-result.v1" as const;

export interface ManagementDeploymentMaterialization {
  envelope: MaterializationEnvelope;
  admission: MaterializationAdmission;
}

export interface ManagementDeploymentBundle {
  schema: typeof MANAGEMENT_DEPLOYMENT_BUNDLE_SCHEMA;
  id: string;
  owning_site: ResourceRef;
  actor_id: string;
  principal_id: string;
  consent_ref: string;
  destination_authority: {
    site_id: string;
    locus: IntelligenceAuthorityLocus;
    authority_ref: string;
  };
  decided_at: string;
  evidence_refs: string[];
  catalog: CanonicalCatalogSeed;
  materializations: ManagementDeploymentMaterialization[];
}

export interface ManagementDeploymentResult {
  schema: typeof MANAGEMENT_DEPLOYMENT_RESULT_SCHEMA;
  bundle_id: string;
  owning_site: ResourceRef;
  admitted_record_ids: string[];
  materialized_envelope_ids: string[];
  receipts: ManagementMutationReceipt[];
  diagnostics: unknown[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))].sort();
}

function recordEvidence(record: CanonicalCatalogRecord): string[] {
  return [
    record.source.reference,
    record.authority.authority_ref,
    ...record.validation.evidence.map(({ ref }) => ref),
  ];
}

function context(
  bundle: ManagementDeploymentBundle,
  authority: ManagementMutationContext["authority"],
  overrides: Partial<Pick<ManagementMutationContext, "actor_id" | "decided_at">> = {},
  evidence: string[] = [],
): ManagementMutationContext {
  return {
    schema: MANAGEMENT_MUTATION_CONTEXT_SCHEMA,
    actor_id: overrides.actor_id ?? bundle.actor_id,
    principal_id: bundle.principal_id,
    consent_ref: bundle.consent_ref,
    authority,
    destination_site_id: bundle.owning_site.id,
    target_site_id: bundle.owning_site.id,
    decided_at: overrides.decided_at ?? bundle.decided_at,
    evidence_refs: unique([
      ...bundle.evidence_refs,
      bundle.consent_ref,
      authority.authority_ref,
      ...evidence,
    ]),
  };
}

function requireBundle(session: ManagementSession, bundle: ManagementDeploymentBundle): void {
  if (
    !bundle
    || bundle.schema !== MANAGEMENT_DEPLOYMENT_BUNDLE_SCHEMA
    || typeof bundle.id !== "string" || !bundle.id
    || bundle.owning_site?.kind !== "site" || !bundle.owning_site.id
    || bundle.owning_site.id !== session.owningSite.id
    || typeof bundle.actor_id !== "string" || !bundle.actor_id
    || typeof bundle.principal_id !== "string" || !bundle.principal_id
    || typeof bundle.consent_ref !== "string" || !bundle.consent_ref
    || bundle.destination_authority?.site_id !== bundle.owning_site.id
    || typeof bundle.destination_authority.locus !== "string"
    || typeof bundle.destination_authority.authority_ref !== "string" || !bundle.destination_authority.authority_ref
    || typeof bundle.decided_at !== "string" || !Number.isFinite(Date.parse(bundle.decided_at))
    || !Array.isArray(bundle.evidence_refs)
    || !bundle.evidence_refs.includes(bundle.consent_ref)
    || !bundle.evidence_refs.includes(bundle.destination_authority.authority_ref)
    || bundle.catalog?.schema !== CANONICAL_CATALOG_SEED_SCHEMA
    || !Array.isArray(bundle.catalog.records)
    || !Array.isArray(bundle.materializations)
  ) {
    throw new ManagementError(
      "invalid-deployment-bundle",
      "Deployment requires one explicit owning Site, actor, principal consent, destination authority, decision time, evidence, canonical catalog, and materialization set.",
      bundle?.evidence_refs ?? [],
    );
  }
  const diagnostics = bundle.catalog.records.flatMap(validateCanonicalCatalogRecord);
  if (diagnostics.length > 0) {
    throw new ManagementError(
      "invalid-deployment-catalog",
      "Deployment catalog records must be canonical and digest-bound before any mutation begins.",
      bundle.evidence_refs,
    );
  }
}

function deploymentPartition(bundle: ManagementDeploymentBundle): {
  destinationRecords: CanonicalCatalogRecord[];
  materializations: Array<ManagementDeploymentMaterialization & {
    statementRecord: CanonicalCatalogRecord;
    payloadRecord: CanonicalCatalogRecord;
  }>;
} {
  const immutableIds = bundle.catalog.records.map(({ id }) => id);
  const logicalIds = bundle.catalog.records.map(({ record_id }) => record_id);
  if (new Set(immutableIds).size !== immutableIds.length || new Set(logicalIds).size !== logicalIds.length) {
    throw new ManagementError(
      "deployment-catalog-identity-conflict",
      "A deployment bundle must contain exactly one immutable current record for each catalog identity.",
      bundle.evidence_refs,
    );
  }
  const byRecordId = new Map(bundle.catalog.records.map((record) => [record.record_id, record]));
  const byEnvelopeId = new Map(bundle.catalog.records.map((record) => [record.id, record]));
  const accountedForeign = new Set<string>();
  const projectionKeys = new Set<string>();
  const envelopeIds = new Set<string>();
  const materializations = bundle.materializations.map((entry) => {
    const projectionKey = materializationProjectionKey(entry.envelope);
    if (projectionKeys.has(projectionKey) || envelopeIds.has(entry.envelope?.id)) {
      throw new ManagementError(
        "duplicate-deployment-materialization",
        "A deployment may address each destination projection and immutable envelope only once.",
        bundle.evidence_refs,
      );
    }
    projectionKeys.add(projectionKey);
    envelopeIds.add(entry.envelope.id);
    const statementRecord = byRecordId.get(entry.envelope?.statement?.id);
    const payloadRecord = byEnvelopeId.get(entry.envelope?.statement?.payload_ref);
    if (!statementRecord || !payloadRecord) {
      throw new ManagementError(
        "deployment-materialization-record-missing",
        "Every materialization must resolve its immutable authority statement and payload record from the deployment catalog.",
        bundle.evidence_refs,
      );
    }
    if (
      entry.envelope.destination.site_id !== bundle.owning_site.id
      || statementRecord.authority.site_id === bundle.owning_site.id
      || statementRecord.authority.site_id !== entry.envelope.origin.site_id
    ) {
      throw new ManagementError(
        "deployment-materialization-origin-mismatch",
        "Materialization must carry a foreign authority statement into this exact destination Site without changing its origin.",
        bundle.evidence_refs,
      );
    }
    accountedForeign.add(statementRecord.id);
    if (payloadRecord.authority.site_id !== bundle.owning_site.id) accountedForeign.add(payloadRecord.id);
    return { ...entry, statementRecord, payloadRecord };
  });
  const destinationRecords = bundle.catalog.records.filter((record) =>
    record.authority.site_id === bundle.owning_site.id
    || (record.authority.site_id === undefined && record.authority.locus === "runtime-observer")
  );
  const unaccountedForeign = bundle.catalog.records.filter((record) =>
    !destinationRecords.includes(record) && !accountedForeign.has(record.id)
  );
  if (unaccountedForeign.length > 0) {
    throw new ManagementError(
      "unmaterialized-foreign-record",
      `Foreign catalog records require explicit destination materialization: ${unaccountedForeign.map(({ id }) => id).join(", ")}`,
      bundle.evidence_refs,
    );
  }
  return { destinationRecords, materializations };
}

/**
 * Preflights the whole deployment before writing, then executes every write
 * through IntelligenceManagementService. Foreign records are never admitted
 * directly into the destination Site.
 */
export async function deployManagementBundle(
  session: ManagementSession,
  bundle: ManagementDeploymentBundle,
): Promise<ManagementDeploymentResult> {
  requireBundle(session, bundle);
  if (!session.materialization) {
    throw new ManagementError("materialization-unavailable", "Deployment requires a destination materialization store.");
  }
  const { destinationRecords, materializations } = deploymentPartition(bundle);
  const service = new IntelligenceManagementService(session);
  const receipts: ManagementMutationReceipt[] = [];
  const catalogRequest: ManagementMutationRequest | null = destinationRecords.length > 0 ? {
      operation: "admit-catalog-seed",
      seed: {
        schema: CANONICAL_CATALOG_SEED_SCHEMA,
        id: `${bundle.catalog.id}:destination:${bundle.owning_site.id}`,
        created_at: bundle.decided_at,
        records: destinationRecords,
        residuals: [],
      },
      record_contexts: Object.fromEntries(destinationRecords.map((record) => [record.id, context(bundle, {
        site_id: bundle.owning_site.id,
        locus: record.authority.locus,
        authority_ref: record.authority.authority_ref,
      }, {}, recordEvidence(record))])),
      context: context(bundle, bundle.destination_authority),
    } : null;
  const materializationRequests: Array<Extract<ManagementMutationRequest, { operation: "materialize" | "refresh" }>> = [];
  for (const entry of materializations) {
    const current = await session.materialization.getProjection(materializationProjectionKey(entry.envelope));
    const operation = current && current.envelope.id !== entry.envelope.id ? "refresh" : "materialize";
    materializationRequests.push({
      operation,
      envelope: entry.envelope,
      admission: entry.admission,
      statement_record: entry.statementRecord,
      payload_record: entry.payloadRecord,
      context: context(
        bundle,
        bundle.destination_authority,
        { actor_id: entry.admission.decided_by, decided_at: entry.admission.decided_at },
        [
          ...entry.envelope.provenance_refs,
          ...entry.admission.evidence_refs,
          ...recordEvidence(entry.statementRecord),
          ...recordEvidence(entry.payloadRecord),
        ],
      ),
    });
  }

  // No deployment write begins until every catalog and materialization mutation
  // has passed the exact same validation and current-store checks as execution.
  if (catalogRequest) await service.preflightMutation(catalogRequest);
  for (const request of materializationRequests) await service.preflightMutation(request);

  if (catalogRequest) {
    const response = await service.execute(catalogRequest);
    receipts.push(...(response.data as { record_receipts: ManagementMutationReceipt[] }).record_receipts);
  }
  for (const request of materializationRequests) {
    const response = await service.execute(request);
    receipts.push((response.data as { receipt: ManagementMutationReceipt }).receipt);
  }
  const validation = await service.execute({ operation: "validate" });
  const diagnostics = (validation.data as { diagnostics: unknown[] }).diagnostics;
  if (diagnostics.length > 0) {
    throw new ManagementError(
      "deployment-validation-failed",
      "The deployed destination catalog failed canonical post-write validation.",
      bundle.evidence_refs,
    );
  }
  return {
    schema: MANAGEMENT_DEPLOYMENT_RESULT_SCHEMA,
    bundle_id: bundle.id,
    owning_site: { ...bundle.owning_site },
    admitted_record_ids: destinationRecords.map(({ id }) => id),
    materialized_envelope_ids: materializations.map(({ envelope }) => envelope.id),
    receipts,
    diagnostics,
  };
}
