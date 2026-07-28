/**
 * Read-only provider catalog observation.
 *
 * This is deliberately separate from invocation authority. An observation
 * records what a provider exposed at a point in time; it does not admit a
 * model, grant invocation access, or carry secret material.
 */

import type { ResourceRef } from "./ids.js";
import type { ContentDigest } from "./temporal.js";

export const CATALOG_OBSERVATION_SCHEMA =
  "narada.invokable-intelligence.catalog-observation.v1" as const;

export type CatalogObservationAccessMode =
  | "public"
  | "credentialed"
  | "operator_attested"
  | "unavailable";

export type CatalogObservationAuthorityKind =
  | "narada-catalog"
  | "provider-native"
  | "operator-attested"
  | "unavailable";

export type CatalogObservationSourceKind =
  | "narada-registry"
  | "provider-api"
  | "operator-attestation"
  | "unavailable";

export interface CatalogObservationAuthority {
  kind: CatalogObservationAuthorityKind;
  authority_ref: string;
}

export interface CatalogObservationSource {
  kind: CatalogObservationSourceKind;
  reference: string;
}

export interface CatalogObservedCapability {
  name: string;
  status: "supported" | "unsupported" | "unknown";
  allowed_values?: string[];
  metadata?: Record<string, string>;
}

export interface CatalogObservedModel {
  /** Canonical observation identity, not an invocation authority. */
  id: string;
  /** Provider-specific model key returned by the catalog endpoint. */
  model_key: string;
  display_name?: string;
  publisher?: string;
  status: "active" | "deprecated" | "disabled" | "unknown";
  capabilities: CatalogObservedCapability[];
  metadata?: Record<string, string>;
}

export type CatalogObservationDiagnosticCode =
  | "credential-required"
  | "credential-missing"
  | "unauthorized"
  | "forbidden"
  | "rate-limited"
  | "provider-unavailable"
  | "provider-authority-unavailable"
  | "invalid-response"
  | "transport-error"
  | "not-configured";

export interface CatalogObservationDiagnostic {
  code: CatalogObservationDiagnosticCode;
  message: string;
  retryable?: boolean;
}

export interface CatalogObservation {
  schema: typeof CATALOG_OBSERVATION_SCHEMA;
  id: string;
  observed_at: string;
  inference_provider: ResourceRef;
  endpoint?: ResourceRef;
  access_mode: CatalogObservationAccessMode;
  authority: CatalogObservationAuthority;
  source: CatalogObservationSource;
  /** Locator only; the credential value is never part of an observation. */
  credential_locator?: ResourceRef;
  status: "complete" | "partial" | "unavailable";
  models: CatalogObservedModel[];
  diagnostics: CatalogObservationDiagnostic[];
  digest: ContentDigest;
}

export interface CatalogObservationRequest {
  operation: "observe-catalog";
  provider: ResourceRef;
  observed_at: string;
  access_mode?: Exclude<CatalogObservationAccessMode, "unavailable">;
}

export function validateCatalogObservation(observation: CatalogObservation): string[] {
  const diagnostics: string[] = [];
  if (observation.schema !== CATALOG_OBSERVATION_SCHEMA) diagnostics.push("invalid-schema");
  if (!observation.id || !observation.id.startsWith("catalog-observation:")) diagnostics.push("invalid-id");
  if (!Number.isFinite(Date.parse(observation.observed_at))) diagnostics.push("invalid-observed-at");
  if (observation.inference_provider.kind !== "inference-provider") diagnostics.push("invalid-provider-ref");
  if (!observation.authority.authority_ref) diagnostics.push("missing-authority-ref");
  if (!observation.source.reference) diagnostics.push("missing-source-reference");
  if (observation.status === "unavailable" && observation.models.length > 0) diagnostics.push("unavailable-with-models");
  if (observation.status === "complete" && observation.diagnostics.some(({ code }) => code === "invalid-response" || code === "transport-error")) {
    diagnostics.push("complete-with-fatal-diagnostic");
  }
  for (const model of observation.models) {
    if (!model.id || !model.model_key) diagnostics.push("invalid-model");
    if (model.capabilities.some(({ name }) => !name)) diagnostics.push("invalid-capability");
  }
  return diagnostics;
}
