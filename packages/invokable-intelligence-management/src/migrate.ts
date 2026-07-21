/** Deterministic migration from the legacy provider registry into the canonical v2 catalog. */

import { createHash } from "node:crypto";

import {
  ACCESS_GRANT_SCHEMA,
  canonicalSha256,
  CANONICAL_CATALOG_RECORD_SCHEMA,
  CANONICAL_CATALOG_SEED_SCHEMA,
  CATALOG_ADMISSION_RESIDUAL_SCHEMA,
  CATALOG_TEMPORAL_INPUT_SCHEMA,
  INTELLIGENCE_AUTHORITY_STATEMENT_SCHEMA,
  INVOCATION_ROUTE_CANDIDATE_SCHEMA,
  TOPOLOGY_BOUNDARY_ADMISSION_SCHEMA,
  validateAssertion,
  validateCanonicalCatalogRecord,
  validateIntelligenceAuthorityStatement,
  validateInvocationRouteCandidate,
  validateModelOfferingGraph,
  validatePolicy,
  validateResource,
} from "@narada2/invokable-intelligence-contract";
import type {
  AuthoritativeDecisionClock,
  CanonicalCatalogAuthority,
  CanonicalCatalogDocument,
  CanonicalCatalogRecord,
  CanonicalCatalogRecordKind,
  CanonicalCatalogSeed,
  CatalogAccessRecord,
  CatalogAdmissionResidual,
  CatalogAuthorityKind,
  CatalogTemporalInput,
  CapabilityAssertion,
  ExecutionTopology,
  IntelligenceAuthorityLocus,
  IntelligenceAuthorityStatement,
  InferenceEndpointAddress,
  InferenceProtocol,
  InvocationRouteCandidate,
  ModelOffering,
  PolicyDocument,
  PolicyRule,
  Provenance,
  Resource,
  ResourceRef,
  ServiceAccount,
  TopologyBoundaryAdmission,
} from "@narada2/invokable-intelligence-contract";
import type { IntelligenceRegistryStore } from "@narada2/invokable-intelligence-registry";

import type { LegacyProviderEntry, LegacyProviderRegistry } from "./legacy.js";
import { legacyModelResourceId, legacyVendorSlug } from "./legacy.js";

export interface MigrationLoci {
  targetSite: ResourceRef;
  userSite: ResourceRef;
  hostSite: ResourceRef;
}

export interface MigrationValidationDiagnostic {
  subject: string;
  code: string;
  message: string;
}

export class MigrationValidationError extends Error {
  readonly code = "migration_validation_failed";
  readonly diagnostics: MigrationValidationDiagnostic[];

  constructor(subject: string, diagnostic: { code?: unknown; message?: unknown }) {
    const code = typeof diagnostic.code === "string" ? diagnostic.code : "contract_validation_failed";
    const message = typeof diagnostic.message === "string" ? diagnostic.message : code;
    super(`${subject}: ${message}`);
    this.name = "MigrationValidationError";
    this.diagnostics = [{ subject, code, message }];
  }
}

export interface MigrationPlan {
  reference: string;
  sourceRevision: string;
  sourceDigest: string;
  plannedAt: string;
  loci: MigrationLoci;
  resources: Resource[];
  assertions: CapabilityAssertion[];
  policies: PolicyDocument[];
  routes: InvocationRouteCandidate[];
  authorityStatements: IntelligenceAuthorityStatement[];
  accessRecords: CatalogAccessRecord[];
  temporalInputs: CatalogTemporalInput[];
  residuals: CatalogAdmissionResidual[];
  seed: CanonicalCatalogSeed;
}

export type DiffStatus = "add" | "update" | "unchanged";

export interface DiffEntry {
  kind: "catalog-record" | "residual";
  id: string;
  status: DiffStatus;
}

export interface MigrationDryRun {
  plan: MigrationPlan;
  diff: DiffEntry[];
  counts: Record<DiffStatus, number>;
}

const DOCUMENT_EVIDENCE_KIND = "document" as const;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stableValue(child)]));
  }
  return value;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex")}`;
}

function legacyAdapterProtocol(adapterKind: string): InferenceProtocol | null {
  switch (adapterKind) {
    case "openai-compatible-chat-completions":
      return { family: "openai", operation: "chat-completions", version: "1" };
    case "anthropic-messages":
      return { family: "anthropic", operation: "messages", version: "1" };
    case "codex-mcp-server":
      return { family: "codex-subscription", operation: "responses", version: "1" };
    default:
      return null;
  }
}

function legacyEndpointAddress(entry: LegacyProviderEntry, adapterKind: string): InferenceEndpointAddress | null {
  if (adapterKind === "codex-mcp-server") {
    return { kind: "runtime-service", service: "codex-subscription" };
  }
  if (!entry.base_url) return null;
  try {
    const parsed = new URL(entry.base_url);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) return null;
    const operationUrl = adapterKind === "anthropic-messages"
      ? new URL("/v1/messages", parsed)
      : adapterKind === "openai-compatible-chat-completions"
        ? new URL(entry.chat_completions_path?.trim() || "v1/chat/completions", parsed)
        : null;
    return operationUrl ? { kind: "url", url: operationUrl.toString() } : null;
  } catch {
    return null;
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function provenance(reference: string, plannedAt: string): Provenance {
  return { source: "migration", recorded_at: plannedAt, actor: "invokable-intelligence-management", reference };
}

function authority(
  kind: CatalogAuthorityKind,
  locus: IntelligenceAuthorityLocus,
  authorityRef: string,
  loci: MigrationLoci,
): CanonicalCatalogAuthority {
  const site = locus === "user-site" ? loci.userSite : locus === "target-site" ? loci.targetSite : loci.hostSite;
  return { kind, locus, authority_ref: authorityRef, site_id: site.id };
}

function clockAt(instant: string, authorityRef: string): AuthoritativeDecisionClock {
  const date = new Date(instant);
  if (Number.isNaN(date.valueOf())) throw new Error(`invalid plannedAt: ${instant}`);
  return {
    source: "operator-supplied",
    authority_ref: authorityRef,
    instant,
    timezone: "UTC",
    local: {
      date: date.toISOString().slice(0, 10),
      time: date.toISOString().slice(11, 19),
      weekday: date.getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    },
  };
}

function buildLocalTopology(
  legacyId: string,
  adapterId: string,
  endpointId: string,
  loci: MigrationLoci,
  plannedAt: string,
  validUntil: string,
): ExecutionTopology {
  const prefix = `legacy-${slug(legacyId)}`;
  const localExecution = { kind: "execution-locus" as const, id: "execution-locus:host-local" };
  const auth = (siteId: string, locus: "client-site" | "launcher-site" | "carrier-site" | "execution-site" | "service-site") => ({
    site_id: siteId,
    locus,
    authority_ref: `migration-topology:${legacyId}:${locus}:${siteId}`,
  });
  const nodeIds = ["client", "launcher", "carrier", "runtime", "adapter", "service", "endpoint"].map((name) => `${prefix}-${name}`);
  const edgeIds = Array.from({ length: 6 }, (_, index) => `${prefix}-edge-${index + 1}`);
  const serviceSiteId = `site:legacy-inference-${slug(legacyId)}`;
  const boundaryAdmission = (
    edgeId: string,
    trustPolicyRef: string,
    networkPathRef: string,
    authorityRef: string,
  ): TopologyBoundaryAdmission => ({
    schema: TOPOLOGY_BOUNDARY_ADMISSION_SCHEMA,
    edge_id: edgeId,
    trust_policy: {
      ref: trustPolicyRef,
      status: "admitted",
      authority_ref: authorityRef,
      evidence: [
        { kind: "document", ref: trustPolicyRef },
        { kind: "document", ref: `migration:${legacyId}` },
      ],
    },
    network_path: {
      ref: networkPathRef,
      status: "reachable",
      authority_ref: authorityRef,
      evidence: [
        { kind: "document", ref: networkPathRef },
        { kind: "document", ref: `migration:${legacyId}` },
      ],
    },
    validity: {
      valid_from: plannedAt,
      valid_until: validUntil,
      fresh_as_of: plannedAt,
    },
  });
  return {
    schema: "narada.invokable-intelligence.execution-topology.v1",
    id: `topology:${prefix}`,
    nodes: [
      { id: nodeIds[0], kind: "client", locus: { kind: "client-device", site_id: loci.userSite.id }, feasibility_authority: auth(loci.userSite.id, "client-site"), required_feasibility: [] },
      { id: nodeIds[1], kind: "launcher", locus: { kind: "local-machine", site_id: loci.hostSite.id, execution_locus: localExecution }, feasibility_authority: auth(loci.hostSite.id, "launcher-site"), required_feasibility: [] },
      { id: nodeIds[2], kind: "carrier", locus: { kind: "local-machine", site_id: loci.hostSite.id, execution_locus: localExecution }, feasibility_authority: auth(loci.hostSite.id, "carrier-site"), required_feasibility: [] },
      { id: nodeIds[3], kind: "runtime", locus: { kind: "local-machine", site_id: loci.hostSite.id, execution_locus: localExecution }, feasibility_authority: auth(loci.hostSite.id, "execution-site"), required_feasibility: [] },
      { id: nodeIds[4], kind: "adapter", locus: { kind: "local-machine", site_id: loci.hostSite.id, execution_locus: localExecution }, resource: { kind: "adapter", id: adapterId }, feasibility_authority: auth(loci.hostSite.id, "execution-site"), required_feasibility: [] },
      { id: nodeIds[5], kind: "inference-service", locus: { kind: "remote-service", site_id: serviceSiteId }, resource: { kind: "inference-provider", id: `inference-provider:${legacyId}` }, feasibility_authority: auth(serviceSiteId, "service-site"), required_feasibility: [] },
      { id: nodeIds[6], kind: "endpoint", locus: { kind: "remote-service", site_id: serviceSiteId }, resource: { kind: "inference-endpoint", id: endpointId }, feasibility_authority: auth(serviceSiteId, "service-site"), required_feasibility: [] },
    ],
    edges: [
      { id: edgeIds[0], from: nodeIds[0], to: nodeIds[1], kind: "operator-handoff", boundary: { kinds: ["process"] }, feasibility_authority: auth(loci.userSite.id, "client-site"), required_feasibility: [] },
      { id: edgeIds[1], from: nodeIds[1], to: nodeIds[2], kind: "process-handoff", boundary: { kinds: ["process"] }, feasibility_authority: auth(loci.hostSite.id, "launcher-site"), required_feasibility: [] },
      { id: edgeIds[2], from: nodeIds[2], to: nodeIds[3], kind: "runtime-call", boundary: { kinds: ["process"] }, feasibility_authority: auth(loci.hostSite.id, "carrier-site"), required_feasibility: [] },
      { id: edgeIds[3], from: nodeIds[3], to: nodeIds[4], kind: "runtime-call", boundary: { kinds: ["none"] }, feasibility_authority: auth(loci.hostSite.id, "execution-site"), required_feasibility: [] },
      { id: edgeIds[4], from: nodeIds[4], to: nodeIds[5], kind: "network-call", boundary: { kinds: ["network", "trust", "site"], trust_policy_ref: `trust:${legacyId}`, network_path_ref: `network:${legacyId}`, admission: boundaryAdmission(edgeIds[4], `trust:${legacyId}`, `network:${legacyId}`, auth(loci.hostSite.id, "execution-site").authority_ref) }, feasibility_authority: auth(loci.hostSite.id, "execution-site"), required_feasibility: [] },
      { id: edgeIds[5], from: nodeIds[5], to: nodeIds[6], kind: "provider-call", boundary: { kinds: ["none"] }, feasibility_authority: auth(serviceSiteId, "service-site"), required_feasibility: [] },
    ],
    route: { node_ids: nodeIds, edge_ids: edgeIds },
  };
}

function rawSecretPath(value: unknown, path = "$"): string | null {
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const next = `${path}.${key}`;
    if (["secret", "secret_value", "token", "password", "api_key", "key_material"].includes(key.toLowerCase()) && child !== undefined && child !== null && child !== "") {
      return next;
    }
    const nested = rawSecretPath(child, next);
    if (nested) return nested;
  }
  return null;
}

function modelProviderFor(legacyId: string, modelName: string): string | null {
  if (legacyId === "openrouter-api") {
    const [namespace] = modelName.split("/");
    return namespace && namespace !== modelName ? slug(namespace) : null;
  }
  if (!["openai-api", "codex-subscription", "kimi-api", "kimi-code-api", "anthropic-api", "deepseek-api", "glm-api"].includes(legacyId)) {
    return null;
  }
  const vendor = legacyVendorSlug(legacyId);
  return vendor;
}

function createResidual(
  reference: string,
  id: string,
  sourcePath: string,
  code: CatalogAdmissionResidual["code"],
  disposition: CatalogAdmissionResidual["disposition"],
  message: string,
): CatalogAdmissionResidual {
  return {
    schema: CATALOG_ADMISSION_RESIDUAL_SCHEMA,
    id: `catalog-residual:${slug(id)}`,
    source_path: sourcePath,
    code,
    disposition,
    message,
    evidence: [{ kind: DOCUMENT_EVIDENCE_KIND, ref: reference }],
  };
}

function recordAuthorityForDocument(
  recordKind: CanonicalCatalogRecordKind,
  document: CanonicalCatalogDocument,
  reference: string,
  loci: MigrationLoci,
): CanonicalCatalogAuthority {
  if (recordKind === "assertion") return authority("observed-capability", "runtime-observer", reference, loci);
  if (recordKind === "policy") return authority("target-default", "target-site", reference, loci);
  if (recordKind === "authority-statement") {
    const statement = document as IntelligenceAuthorityStatement;
    return {
      kind: statement.kind,
      locus: statement.origin.locus,
      authority_ref: statement.origin.authority_ref,
      ...(statement.origin.site_id ? { site_id: statement.origin.site_id } : {}),
      ...(statement.origin.principal_id ? { principal_id: statement.origin.principal_id } : {}),
    };
  }
  if (recordKind === "access") return authority("account-definition", "execution-site", reference, loci);
  if (recordKind === "temporal-input") return authority("temporal-input", "execution-site", reference, loci);
  return authority("catalog-definition", "target-site", reference, loci);
}

function wrapRecord(
  recordKind: CanonicalCatalogRecordKind,
  document: CanonicalCatalogDocument,
  source: { schema: string; reference: string; revision: string; digest: string },
  plannedAt: string,
  loci: MigrationLoci,
  revision: number,
): CanonicalCatalogRecord {
  const recordId = (document as { id: string }).id;
  const record: CanonicalCatalogRecord = {
    schema: CANONICAL_CATALOG_RECORD_SCHEMA,
    id: `catalog-record:${recordKind}:${slug(recordId)}:r${revision}`,
    record_kind: recordKind,
    record_id: recordId,
    revision,
    source: { ...source, digest: canonicalSha256(document) },
    authority: recordAuthorityForDocument(recordKind, document, source.reference, loci),
    validation: {
      status: "accepted",
      validator: "@narada2/invokable-intelligence-management/migrate-v2",
      validated_at: plannedAt,
      evidence: [{ kind: DOCUMENT_EVIDENCE_KIND, ref: source.reference }],
    },
    document,
  };
  const diagnostics = validateCanonicalCatalogRecord(record);
  if (diagnostics.length > 0) throw new MigrationValidationError(recordId, diagnostics[0]);
  return record;
}

function validatePlanDocuments(plan: Omit<MigrationPlan, "seed">): void {
  for (const resource of plan.resources) {
    const errors = validateResource(resource);
    if (errors.length > 0) throw new MigrationValidationError(resource.id, errors[0]);
    if (resource.schema === "narada.invokable-intelligence.model-offering.v1") {
      const diagnostics = validateModelOfferingGraph(resource, plan.resources);
      if (diagnostics.length > 0) throw new MigrationValidationError(resource.id, diagnostics[0]);
    }
  }
  for (const assertion of plan.assertions) {
    const errors = validateAssertion(assertion);
    if (errors.length > 0) throw new MigrationValidationError(assertion.id, errors[0]);
  }
  for (const policy of plan.policies) {
    const errors = validatePolicy(policy);
    if (errors.length > 0) throw new MigrationValidationError(policy.id, errors[0]);
  }
  for (const route of plan.routes) {
    const offering = plan.resources.find(({ id }) => id === route.offering.id) as ModelOffering | undefined;
    if (!offering) throw new Error(`${route.id}: missing offering`);
    const diagnostics = validateInvocationRouteCandidate(route, offering, plan.resources);
    if (diagnostics.length > 0) throw new MigrationValidationError(route.id, diagnostics[0]);
  }
  for (const statement of plan.authorityStatements) {
    const diagnostics = validateIntelligenceAuthorityStatement(statement);
    if (diagnostics.length > 0) throw new MigrationValidationError(statement.id, diagnostics[0]);
  }
}

/** Build one deterministic, provenance-preserving canonical seed. */
export function buildMigrationPlan(
  legacy: LegacyProviderRegistry,
  loci: MigrationLoci,
  options: { reference: string; plannedAt: string; sourceRevision?: string; catalogRevision?: number; validUntil?: string },
): MigrationPlan {
  const sourceDigest = digest(legacy);
  const sourceRevision = options.sourceRevision ?? sourceDigest;
  const catalogRevision = options.catalogRevision ?? 1;
  if (!Number.isInteger(catalogRevision) || catalogRevision < 1) throw new Error("catalogRevision must be a positive integer");
  const validUntil = options.validUntil ?? new Date(Date.parse(options.plannedAt) + 365 * 24 * 60 * 60 * 1000).toISOString();
  const resources: Resource[] = [];
  const assertions: CapabilityAssertion[] = [];
  const policies: PolicyDocument[] = [];
  const routes: InvocationRouteCandidate[] = [];
  const authorityStatements: IntelligenceAuthorityStatement[] = [];
  const accessRecords: CatalogAccessRecord[] = [];
  const residuals: CatalogAdmissionResidual[] = [];
  const prov = provenance(options.reference, options.plannedAt);
  const seen = new Map<string, Resource>();
  const pushResource = (resource: Resource): void => {
    const prior = seen.get(resource.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(resource)) throw new Error(`conflicting canonical resource '${resource.id}'`);
    if (!prior) {
      seen.set(resource.id, resource);
      resources.push(resource);
    }
  };

  pushResource({ schema: "narada.invokable-intelligence.site.v1", id: loci.targetSite.id });
  pushResource({ schema: "narada.invokable-intelligence.site.v1", id: loci.userSite.id });
  pushResource({ schema: "narada.invokable-intelligence.site.v1", id: loci.hostSite.id });
  pushResource({ schema: "narada.invokable-intelligence.execution-locus.v1", id: "execution-locus:host-local", kind: "local" });

  const defaultRules: PolicyRule[] = [];
  const defaultsByProvider = new Map<string, { offeringId: string; routeId: string; modelId: string }>();

  for (const legacyId of Object.keys(legacy.providers).sort()) {
    const entry = legacy.providers[legacyId] as LegacyProviderEntry;
    const sourcePath = `$.providers.${legacyId}`;
    const secretPath = rawSecretPath(entry);
    if (secretPath) {
      residuals.push(createResidual(options.reference, `${legacyId}-secret`, secretPath, "secret-bearing-input", "rejected", `provider '${legacyId}' contains raw secret material`));
      continue;
    }
    if (!entry.adapter_kind || !entry.available_models?.length) {
      residuals.push(createResidual(options.reference, `${legacyId}-incomplete`, sourcePath, "invalid-legacy-input", "rejected", `provider '${legacyId}' lacks an adapter or model inventory`));
      continue;
    }
    const protocol = legacyAdapterProtocol(entry.adapter_kind);
    const endpointAddress = legacyEndpointAddress(entry, entry.adapter_kind);
    if (!protocol || !endpointAddress) {
      residuals.push(createResidual(options.reference, `${legacyId}-execution-coordinate`, sourcePath, "invalid-legacy-input", "rejected", `provider '${legacyId}' lacks a supported protocol or explicit endpoint coordinate`));
    }
    if (entry.model_env_names?.length || entry.base_url_env_names?.length) {
      residuals.push(createResidual(options.reference, `${legacyId}-runtime-env-selection`, `${sourcePath}.model_env_names`, "legacy-runtime-selection-not-authoritative", "not-authoritative", `legacy model/base URL environment names for '${legacyId}' are inventory only and are not migrated as selection authority`));
    }

    const providerModels = [...new Set(entry.available_models)].sort();
    const providerByModel = new Map<string, string>();
    let ambiguous = false;
    for (const modelName of providerModels) {
      const modelProvider = modelProviderFor(legacyId, modelName);
      if (!modelProvider) {
        residuals.push(createResidual(options.reference, `${legacyId}-${modelName}-provider`, `${sourcePath}.available_models`, "ambiguous-model-provider", "rejected", `model provider for '${modelName}' cannot be established without inventing authority`));
        ambiguous = true;
      } else {
        providerByModel.set(modelName, modelProvider);
      }
    }
    if (entry.default_thinking) {
      defaultRules.push({ type: "default-option", option: `provider.${legacyId}.default_thinking`, value: entry.default_thinking, reason: `legacy default_thinking for ${legacyId}` });
    }
    if (ambiguous || !protocol || !endpointAddress) continue;
    if (entry.default_model && !providerModels.includes(entry.default_model)) {
      residuals.push(createResidual(options.reference, `${legacyId}-default`, `${sourcePath}.default_model`, "ambiguous-default", "rejected", `default model '${entry.default_model}' is absent from the provider model inventory`));
      continue;
    }

    pushResource({ schema: "narada.invokable-intelligence.inference-provider.v1", id: `inference-provider:${legacyId}`, ...(entry.meaning ? { metadata: { meaning: entry.meaning } } : {}) });
    const adapterId = `adapter:${entry.adapter_kind}`;
    pushResource({ schema: "narada.invokable-intelligence.adapter.v1", id: adapterId, runtime_family: "node", protocol });

    const credentialId = `credential-locator:${legacyId}`;
    const requirement = entry.credential_requirement;
    let credentialRef: ResourceRef | undefined;
    if (requirement && requirement.kind !== "none") {
      const secretRef = requirement.secret_ref ?? entry.credential_secret_ref;
      pushResource({
        schema: "narada.invokable-intelligence.credential-locator.v1",
        id: credentialId,
        store: secretRef ? "site-secret" : requirement.kind === "api_key_secret" ? "env" : "none",
        reference: secretRef ?? requirement.env_names?.[0] ?? entry.credential_env_names?.[0] ?? "codex-local-subscription",
        holder: { kind: "site", id: loci.hostSite.id },
      });
      credentialRef = { kind: "credential-locator", id: credentialId };
    }

    const modelRefs: ResourceRef[] = [];
    for (const modelName of providerModels) {
      const modelProvider = providerByModel.get(modelName)!;
      pushResource({ schema: "narada.invokable-intelligence.model-provider.v1", id: `model-provider:${modelProvider}` });
      const modelId = legacyModelResourceId(legacyId, modelName);
      pushResource({ schema: "narada.invokable-intelligence.model.v1", id: modelId, display_name: modelName, provider: { kind: "model-provider", id: `model-provider:${modelProvider}` } });
      modelRefs.push({ kind: "model", id: modelId });
    }

    const endpointId = `inference-endpoint:${legacyId}`;
    pushResource({
      schema: "narada.invokable-intelligence.inference-endpoint.v1",
      id: endpointId,
      inference_provider: { kind: "inference-provider", id: `inference-provider:${legacyId}` },
      adapter: { kind: "adapter", id: adapterId },
      address: endpointAddress,
      serves: modelRefs,
      ...(credentialRef ? { credential: credentialRef } : {}),
    });

    const account: ServiceAccount = {
      schema: "narada.invokable-intelligence.service-account.v1",
      id: `account:${legacyId}`,
      tenant_id: `legacy:${legacyId}`,
      inference_provider: { kind: "inference-provider", id: `inference-provider:${legacyId}` },
      owner: { owner_kind: "account-owner", owner_id: loci.hostSite.id, authority_ref: options.reference },
      status: entry.support_state === "removed" || entry.support_state === "deprecated" ? "suspended" : "active",
    };
    accessRecords.push(account);
    residuals.push(createResidual(options.reference, `${legacyId}-access-grant`, `${sourcePath}.credential_requirement`, "authority-escalation", "rejected", `legacy provider metadata cannot grant principal access; route remains ineligible until an authorized ${ACCESS_GRANT_SCHEMA} is admitted`));

    const topology = buildLocalTopology(legacyId, adapterId, endpointId, loci, options.plannedAt, validUntil);
    for (const modelName of providerModels) {
      const modelId = legacyModelResourceId(legacyId, modelName);
      const modelProvider = providerByModel.get(modelName)!;
      const offeringId = `model-offering:${slug(legacyId)}-${slug(modelName)}`;
      const offering: ModelOffering = {
        schema: "narada.invokable-intelligence.model-offering.v1",
        id: offeringId,
        model: { kind: "model", id: modelId },
        model_provider: { kind: "model-provider", id: `model-provider:${modelProvider}` },
        inference_provider: { kind: "inference-provider", id: `inference-provider:${legacyId}` },
        endpoint: { kind: "inference-endpoint", id: endpointId },
        invocation_model_key: modelName,
        service_class: requirement?.kind === "local_codex_subscription" ? "local-subscription" : "remote-api",
      };
      pushResource(offering);
      const routeId = `route:${slug(legacyId)}-${slug(modelName)}-local`;
      const routeWithoutDigest = {
        schema: INVOCATION_ROUTE_CANDIDATE_SCHEMA,
        id: routeId,
        offering: { kind: "model-offering" as const, id: offeringId },
        endpoint: { kind: "inference-endpoint" as const, id: endpointId },
        adapter: { kind: "adapter" as const, id: adapterId },
        topology,
        execution_loci: [{ kind: "execution-locus" as const, id: "execution-locus:host-local" }],
        access: { account_ref: account.id, grant_refs: [`grant:required-${slug(legacyId)}`], ...(credentialRef ? { credential: credentialRef } : {}) },
      };
      routes.push({ ...routeWithoutDigest, composition_digest: digest(routeWithoutDigest) });
      if (entry.default_model === modelName) defaultsByProvider.set(legacyId, { offeringId, routeId, modelId });
    }

    if (entry.support_state) {
      const assertion: CapabilityAssertion = {
        schema: "narada.invokable-intelligence.capability-assertion.v1",
        id: `assert:migration-${legacyId}-support-state`,
        subject: { kind: "inference-provider", id: `inference-provider:${legacyId}` },
        capability: { family: "support", name: "state" },
        value: entry.support_state,
        scope: { locus: "host-site", site: loci.hostSite },
        provenance: prov,
        validity: { fresh_as_of: options.plannedAt, valid_until: validUntil },
        confidence: 1,
        evidence: [{ kind: DOCUMENT_EVIDENCE_KIND, ref: options.reference }],
      };
      assertions.push(assertion);
      authorityStatements.push({
        schema: INTELLIGENCE_AUTHORITY_STATEMENT_SCHEMA,
        id: `authority:migration-${legacyId}-observed-support`,
        kind: "observed-capability",
        origin: { locus: "runtime-observer", site_id: loci.hostSite.id, authority_ref: options.reference },
        effect: "capability-evidence",
        revision: 1,
        issued_at: options.plannedAt,
        payload_ref: assertion.id,
      });
    }

    if (entry.cognition_defaults && Object.values(entry.cognition_defaults).some(({ reasoning_effort }) => reasoning_effort)) {
      for (const modelName of providerModels) {
        assertions.push({
          schema: "narada.invokable-intelligence.capability-assertion.v1",
          id: `assert:migration-${slug(legacyId)}-${slug(modelName)}-thinking-levels`,
          subject: { kind: "model", id: legacyModelResourceId(legacyId, modelName) },
          capability: { family: "thinking", name: "levels" },
          value: { levels: ["low", "medium", "high"] },
          scope: { locus: "host-site", site: loci.hostSite },
          provenance: prov,
          validity: { fresh_as_of: options.plannedAt, valid_until: validUntil },
          confidence: 0.8,
          evidence: [{ kind: DOCUMENT_EVIDENCE_KIND, ref: options.reference }],
        });
      }
      for (const [tier, defaults] of Object.entries(entry.cognition_defaults).sort(([a], [b]) => a.localeCompare(b))) {
        if (defaults.model && providerModels.includes(defaults.model)) {
          const selected = {
            modelId: legacyModelResourceId(legacyId, defaults.model),
            offeringId: `model-offering:${slug(legacyId)}-${slug(defaults.model)}`,
            routeId: `route:${slug(legacyId)}-${slug(defaults.model)}-local`,
          };
          defaultRules.push({ type: "default-option", option: `cognition.${tier}.route`, value: selected.routeId, reason: `legacy cognition_defaults.${tier} for ${legacyId}` });
        }
        if (defaults.reasoning_effort) defaultRules.push({ type: "default-option", option: `cognition.${tier}.reasoning_effort`, value: defaults.reasoning_effort, reason: `legacy cognition_defaults.${tier} for ${legacyId}` });
      }
    }
  }

  for (const [legacyId, selected] of [...defaultsByProvider.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    defaultRules.push({ type: "default-option", option: `provider.${legacyId}.default_model`, value: selected.modelId, reason: `legacy default_model for ${legacyId}` });
    defaultRules.push({ type: "default-option", option: `provider.${legacyId}.default_offering`, value: selected.offeringId, reason: `legacy default_model offering for ${legacyId}` });
    defaultRules.push({ type: "default-option", option: `provider.${legacyId}.default_route`, value: selected.routeId, reason: `legacy default_model route for ${legacyId}` });
  }
  const defaultProviderId = legacy.default_provider;
  const globalDefault = defaultProviderId ? defaultsByProvider.get(defaultProviderId) : undefined;
  if (defaultProviderId && !globalDefault) {
    residuals.push(createResidual(options.reference, "global-default", "$.default_provider", "ambiguous-default", "rejected", `default provider '${defaultProviderId}' has no admitted default offering and route`));
  } else if (globalDefault) {
    defaultRules.unshift(
      { type: "default-option", option: "route", value: globalDefault.routeId, reason: "legacy default_provider resolved to explicit route" },
      { type: "default-option", option: "model_offering", value: globalDefault.offeringId, reason: "legacy default_provider resolved to explicit offering" },
      { type: "default-option", option: "inference_provider", value: `inference-provider:${defaultProviderId}`, reason: "transitional canonical compatibility field" },
    );
    const globalThinking = defaultProviderId ? legacy.providers[defaultProviderId]?.default_thinking : undefined;
    if (globalThinking) defaultRules.unshift({ type: "default-option", option: "thinking", value: globalThinking, reason: "legacy default provider thinking default" });
  }

  if (defaultRules.length > 0) {
    const policy: PolicyDocument = {
      schema: "narada.invokable-intelligence.policy.v1",
      id: "policy:migration-target-defaults",
      locus: "target-site",
      site: loci.targetSite,
      kind: "defaults",
      revision: 1,
      rules: defaultRules,
    };
    policies.push(policy);
    authorityStatements.push({
      schema: INTELLIGENCE_AUTHORITY_STATEMENT_SCHEMA,
      id: "authority:migration-target-defaults",
      kind: "target-default",
      origin: { locus: "target-site", site_id: loci.targetSite.id, authority_ref: options.reference },
      effect: "fallback",
      revision: 1,
      issued_at: options.plannedAt,
      payload_ref: policy.id,
    });
  }

  const temporalInputs: CatalogTemporalInput[] = [{
    schema: CATALOG_TEMPORAL_INPUT_SCHEMA,
    id: "temporal-input:migration-provider-registry",
    clock: clockAt(options.plannedAt, options.reference),
    valid_until: validUntil,
  }];
  const order = <T extends { id: string }>(records: T[]): T[] => [...records].sort((a, b) => a.id.localeCompare(b.id));
  const partial = {
    reference: options.reference,
    sourceRevision,
    sourceDigest,
    plannedAt: options.plannedAt,
    loci,
    resources: order(resources),
    assertions: order(assertions),
    policies: order(policies),
    routes: order(routes),
    authorityStatements: order(authorityStatements),
    accessRecords: order(accessRecords),
    temporalInputs: order(temporalInputs),
    residuals: order(residuals),
  };
  validatePlanDocuments(partial);

  const source = { schema: legacy.schema, reference: options.reference, revision: sourceRevision, digest: sourceDigest };
  const records = [
    ...partial.resources.map((document) => wrapRecord("resource", document, source, options.plannedAt, loci, catalogRevision)),
    ...partial.assertions.map((document) => wrapRecord("assertion", document, source, options.plannedAt, loci, catalogRevision)),
    ...partial.policies.map((document) => wrapRecord("policy", document, source, options.plannedAt, loci, catalogRevision)),
    ...partial.routes.map((document) => wrapRecord("route", document, source, options.plannedAt, loci, catalogRevision)),
    ...partial.authorityStatements.map((document) => wrapRecord("authority-statement", document, source, options.plannedAt, loci, catalogRevision)),
    ...partial.accessRecords.map((document) => wrapRecord("access", document, source, options.plannedAt, loci, catalogRevision)),
    ...partial.temporalInputs.map((document) => wrapRecord("temporal-input", document, source, options.plannedAt, loci, catalogRevision)),
  ].sort((a, b) => a.id.localeCompare(b.id));
  const seed: CanonicalCatalogSeed = {
    schema: CANONICAL_CATALOG_SEED_SCHEMA,
    id: `catalog-seed:${slug(options.reference)}:${sourceDigest.slice(-12)}`,
    created_at: options.plannedAt,
    records,
    residuals: partial.residuals,
  };
  return { ...partial, seed };
}

/** Deterministic diff against immutable catalog envelopes and residuals. */
export async function dryRunMigration(store: IntelligenceRegistryStore, plan: MigrationPlan): Promise<MigrationDryRun> {
  const diff: DiffEntry[] = [];
  for (const record of plan.seed.records) {
    const existing = await store.getCatalogRecord(record.id);
    diff.push({ kind: "catalog-record", id: record.id, status: !existing ? "add" : JSON.stringify(existing) === JSON.stringify(record) ? "unchanged" : "update" });
  }
  const existingResiduals = new Map((await store.listCatalogResiduals()).map((residual) => [residual.id, residual]));
  for (const residual of plan.seed.residuals) {
    const existing = existingResiduals.get(residual.id);
    diff.push({ kind: "residual", id: residual.id, status: !existing ? "add" : JSON.stringify(existing) === JSON.stringify(residual) ? "unchanged" : "update" });
  }
  const counts: Record<DiffStatus, number> = { add: 0, update: 0, unchanged: 0 };
  for (const entry of diff) counts[entry.status] += 1;
  return { plan, diff, counts };
}

/** Atomically apply a validated seed. Immutable revision conflicts fail before mutation. */
export async function applyMigration(store: IntelligenceRegistryStore, plan: MigrationPlan): Promise<MigrationDryRun> {
  const before = await dryRunMigration(store, plan);
  const conflict = before.diff.find(({ status }) => status === "update");
  if (conflict) throw new Error(`immutable migration conflict for ${conflict.kind} '${conflict.id}'`);
  await store.loadCatalogSeed(plan.seed);
  return dryRunMigration(store, plan);
}
