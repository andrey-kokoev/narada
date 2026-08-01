/** Read-only catalog observation adapters owned by Narada management. */

import { createHash } from "node:crypto";

import type {
  CatalogObservation,
  CatalogObservationAccessMode,
  CatalogObservationAuthority,
  CatalogObservationDiagnostic,
  CatalogObservationSource,
  CatalogObservedCapability,
  CatalogObservedModel,
  CredentialLocator,
  InferenceEndpoint,
  InferenceProvider,
  Resource,
  ResourceRef,
} from "@narada-core/invokable-intelligence-contract";
import {
  CATALOG_OBSERVATION_SCHEMA,
  validateCatalogObservation,
} from "@narada-core/invokable-intelligence-contract";
import type { IntelligenceRegistryStore } from "@narada-core/invokable-intelligence-registry";

export interface CatalogObservationCredentialMaterial {
  /** Internal-only secret value. It must never cross the management result boundary. */
  secret: string;
  evidence_ref: string;
}

export interface CatalogObservationCredentialResolver {
  resolve(locator: CredentialLocator): Promise<CatalogObservationCredentialMaterial | null>;
}

export interface CatalogObservationAdapterInput {
  provider: InferenceProvider;
  endpoint?: InferenceEndpoint;
  credential?: string;
  observed_at: string;
  access_mode: Exclude<CatalogObservationAccessMode, "unavailable">;
}

export interface CatalogObservationAdapterResult {
  authority: CatalogObservationAuthority;
  source: CatalogObservationSource;
  status?: "complete" | "partial" | "unavailable";
  models: CatalogObservedModel[];
  diagnostics?: CatalogObservationDiagnostic[];
}

export interface CatalogObservationAdapter {
  observe(input: CatalogObservationAdapterInput): Promise<CatalogObservationAdapterResult>;
}

export interface CatalogObservationDependencies {
  adapters: ReadonlyMap<string, CatalogObservationAdapter> | Readonly<Record<string, CatalogObservationAdapter>>;
  credentialResolver?: CatalogObservationCredentialResolver;
}

export interface CatalogHttpResponse {
  status: number;
  body: unknown;
}

export interface CatalogHttpClient {
  get(url: string, headers: Record<string, string>): Promise<CatalogHttpResponse>;
}

export type CatalogFetchLike = (
  input: string,
  init: { method: "GET"; headers: Record<string, string> },
) => Promise<{ status: number; json(): Promise<unknown> }>;

function adapterFor(
  dependencies: CatalogObservationDependencies,
  providerId: string,
): CatalogObservationAdapter | undefined {
  const adapters = dependencies.adapters;
  if (adapters instanceof Map) return adapters.get(providerId);
  return (adapters as Readonly<Record<string, CatalogObservationAdapter>>)[providerId];
}

function resourceRef(resource: Resource): ResourceRef {
  const kind = resource.id.slice(0, resource.id.indexOf(":"));
  return { kind: kind as ResourceRef["kind"], id: resource.id };
}

function diagnostic(
  code: CatalogObservationDiagnostic["code"],
  message: string,
  retryable?: boolean,
): CatalogObservationDiagnostic {
  return { code, message, ...(retryable === undefined ? {} : { retryable }) };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function observationDigest(observation: Omit<CatalogObservation, "digest">): string {
  return `sha256:${createHash("sha256").update(stableJson(observation)).digest("hex")}`;
}

function finalizeObservation(observation: Omit<CatalogObservation, "digest">): CatalogObservation {
  const finalized = { ...observation, digest: observationDigest(observation) };
  const diagnostics = validateCatalogObservation(finalized);
  if (diagnostics.length > 0) {
    throw new Error(`catalog observation contract invalid: ${diagnostics.join(",")}`);
  }
  return finalized;
}

function unavailableObservation(
  provider: ResourceRef,
  observedAt: string,
  accessMode: CatalogObservationAccessMode,
  code: CatalogObservationDiagnostic["code"],
  message: string,
  endpoint?: ResourceRef,
  credentialLocator?: ResourceRef,
): CatalogObservation {
  return finalizeObservation({
    schema: CATALOG_OBSERVATION_SCHEMA,
    id: `catalog-observation:${provider.id}:${observedAt}`,
    observed_at: observedAt,
    inference_provider: provider,
    ...(endpoint ? { endpoint } : {}),
    access_mode: accessMode,
    authority: { kind: "unavailable", authority_ref: `unavailable:${provider.id}` },
    source: { kind: "unavailable", reference: `provider:${provider.id}` },
    ...(credentialLocator ? { credential_locator: credentialLocator } : {}),
    status: "unavailable",
    models: [],
    diagnostics: [diagnostic(code, message)],
  });
}

function asProvider(value: Resource | null): InferenceProvider | null {
  return value?.schema === "narada.invokable-intelligence.inference-provider.v1" ? value : null;
}

function asEndpoint(value: Resource): InferenceEndpoint | null {
  return value.schema === "narada.invokable-intelligence.inference-endpoint.v1" ? value : null;
}

function asCredentialLocator(value: Resource | null): CredentialLocator | null {
  return value?.schema === "narada.invokable-intelligence.credential-locator.v1" ? value : null;
}

/**
 * Observe one provider through an explicitly injected provider adapter.
 * The registry is used only to resolve canonical identities and credential
 * locators; it does not become provider-native catalog authority.
 */
export async function observeCatalog(
  store: IntelligenceRegistryStore,
  request: { provider: ResourceRef; observed_at: string; access_mode?: Exclude<CatalogObservationAccessMode, "unavailable"> },
  dependencies: CatalogObservationDependencies,
): Promise<CatalogObservation> {
  const provider = asProvider(await store.getResource(request.provider.id));
  const accessMode = request.access_mode ?? "public";
  if (!provider) {
    return unavailableObservation(
      request.provider,
      request.observed_at,
      "unavailable",
      "not-configured",
      "The requested inference provider is not present in the canonical catalog.",
    );
  }

  const endpoints = (await store.listResources({ kind: "inference-endpoint" }))
    .map(asEndpoint)
    .filter((endpoint): endpoint is InferenceEndpoint => Boolean(endpoint))
    .filter((endpoint) => endpoint.inference_provider.id === provider.id);
  const endpoint = endpoints[0];
  const credentialLocator = endpoint?.credential
    ? asCredentialLocator(await store.getResource(endpoint.credential.id))
    : null;
  const adapter = adapterFor(dependencies, provider.id);
  if (!adapter) {
    return unavailableObservation(
      resourceRef(provider),
      request.observed_at,
      "unavailable",
      "provider-authority-unavailable",
      "No provider-native catalog observation adapter is admitted for this provider; the Narada declaration is not promoted to provider authority.",
      endpoint ? resourceRef(endpoint) : undefined,
      credentialLocator ? resourceRef(credentialLocator) : undefined,
    );
  }

  let credential: CatalogObservationCredentialMaterial | null = null;
  if (accessMode === "credentialed" || accessMode === "operator_attested") {
    if (!credentialLocator) {
      return unavailableObservation(
        resourceRef(provider),
        request.observed_at,
        "unavailable",
        "credential-required",
        "Credentialed catalog observation was requested, but the canonical endpoint has no credential locator.",
        endpoint ? resourceRef(endpoint) : undefined,
      );
    }
    if (!dependencies.credentialResolver) {
      return unavailableObservation(
        resourceRef(provider),
        request.observed_at,
        "unavailable",
        "credential-missing",
        "Credentialed catalog observation requires an injected User Site credential resolver.",
        endpoint ? resourceRef(endpoint) : undefined,
        resourceRef(credentialLocator),
      );
    }
    credential = await dependencies.credentialResolver.resolve(credentialLocator);
    if (!credential) {
      return unavailableObservation(
        resourceRef(provider),
        request.observed_at,
        "unavailable",
        "credential-missing",
        "The credential locator did not resolve to an available credential.",
        endpoint ? resourceRef(endpoint) : undefined,
        resourceRef(credentialLocator),
      );
    }
  }

  try {
    const observed = await adapter.observe({
      provider,
      ...(endpoint ? { endpoint } : {}),
      ...(credential ? { credential: credential.secret } : {}),
      observed_at: request.observed_at,
      access_mode: accessMode,
    });
    return finalizeObservation({
      schema: CATALOG_OBSERVATION_SCHEMA,
      id: `catalog-observation:${provider.id}:${request.observed_at}`,
      observed_at: request.observed_at,
      inference_provider: resourceRef(provider),
      ...(endpoint ? { endpoint: resourceRef(endpoint) } : {}),
      access_mode: accessMode,
      authority: observed.authority,
      source: observed.source,
      ...(credentialLocator ? { credential_locator: resourceRef(credentialLocator) } : {}),
      status: observed.status ?? (observed.diagnostics?.length ? "partial" : "complete"),
      models: observed.models,
      diagnostics: observed.diagnostics ?? [],
    });
  } catch {
    // Adapter failures are deliberately normalized. Adapter error text can
    // contain URLs or provider response material and must not cross the
    // management boundary.
    return unavailableObservation(
      resourceRef(provider),
      request.observed_at,
      accessMode,
      "transport-error",
      "The provider catalog adapter failed before producing a trustworthy observation.",
      endpoint ? resourceRef(endpoint) : undefined,
      credentialLocator ? resourceRef(credentialLocator) : undefined,
    );
  }
}

function normalizeCapability(name: string, value: unknown): CatalogObservedCapability {
  if (typeof value === "boolean") return { name, status: value ? "supported" : "unsupported" };
  if (Array.isArray(value)) {
    const allowedValues = value.filter((item): item is string => typeof item === "string");
    return { name, status: "supported", ...(allowedValues.length ? { allowed_values: allowedValues } : {}) };
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const supported = record.supported ?? record.enabled;
    const values = record.allowed_values ?? record.values;
    const allowedValues = Array.isArray(values) ? values.filter((item): item is string => typeof item === "string") : [];
    return {
      name,
      status: supported === false ? "unsupported" : supported === true ? "supported" : "unknown",
      ...(allowedValues.length ? { allowed_values: allowedValues } : {}),
    };
  }
  return { name, status: "unknown" };
}

function normalizeModels(body: unknown): CatalogObservedModel[] | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const rows = (body as Record<string, unknown>).data;
  if (!Array.isArray(rows)) return null;
  return rows.flatMap((row): CatalogObservedModel[] => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const record = row as Record<string, unknown>;
    const modelKey = typeof record.id === "string"
      ? record.id
      : typeof record.model === "string"
        ? record.model
        : null;
    if (!modelKey) return [];
    const capabilities = record.capabilities && typeof record.capabilities === "object" && !Array.isArray(record.capabilities)
      ? Object.entries(record.capabilities).map(([name, value]) => normalizeCapability(name, value))
      : [];
    return [{
      id: `observed-model:${modelKey}`,
      model_key: modelKey,
      ...(typeof record.name === "string" ? { display_name: record.name } : {}),
      ...(typeof record.owned_by === "string" ? { publisher: record.owned_by } : {}),
      status: "active",
      capabilities,
    }];
  });
}

function catalogUrl(endpoint: InferenceEndpoint): string {
  if (endpoint.address.kind !== "url") throw new Error("catalog endpoint is not URL-addressable");
  const base = endpoint.address.url.replace(/\/+$/, "");
  return base.endsWith("/models") ? base : `${base}/models`;
}

/** Adapter for OpenAI-compatible read-only /models endpoints, including Kimi Code. */
export function createOpenAiCompatibleCatalogAdapter(options: {
  http: CatalogHttpClient;
}): CatalogObservationAdapter {
  return {
    async observe(input): Promise<CatalogObservationAdapterResult> {
      if (!input.endpoint) {
        return {
          authority: { kind: "unavailable", authority_ref: `unavailable:${input.provider.id}` },
          source: { kind: "unavailable", reference: `provider:${input.provider.id}` },
          status: "unavailable",
          models: [],
          diagnostics: [diagnostic("not-configured", "The provider has no canonical inference endpoint.")],
        };
      }
      const headers: Record<string, string> = { accept: "application/json" };
      if (input.credential) headers.authorization = `Bearer ${input.credential}`;
      const response = await options.http.get(catalogUrl(input.endpoint), headers);
      if (response.status === 401) return {
        authority: { kind: "provider-native", authority_ref: `provider-native:${input.provider.id}` },
        source: { kind: "provider-api", reference: `${input.provider.id}/models` },
        status: "unavailable",
        models: [],
        diagnostics: [diagnostic("unauthorized", "The provider rejected the catalog credential.")],
      };
      if (response.status === 403) return {
        authority: { kind: "provider-native", authority_ref: `provider-native:${input.provider.id}` },
        source: { kind: "provider-api", reference: `${input.provider.id}/models` },
        status: "unavailable",
        models: [],
        diagnostics: [diagnostic("forbidden", "The provider does not authorize catalog observation.")],
      };
      if (response.status === 429) return {
        authority: { kind: "provider-native", authority_ref: `provider-native:${input.provider.id}` },
        source: { kind: "provider-api", reference: `${input.provider.id}/models` },
        status: "unavailable",
        models: [],
        diagnostics: [diagnostic("rate-limited", "The provider rate-limited catalog observation.", true)],
      };
      if (response.status < 200 || response.status >= 300) return {
        authority: { kind: "provider-native", authority_ref: `provider-native:${input.provider.id}` },
        source: { kind: "provider-api", reference: `${input.provider.id}/models` },
        status: "unavailable",
        models: [],
        diagnostics: [diagnostic("provider-unavailable", "The provider did not return a successful catalog response.", response.status >= 500)],
      };
      const models = normalizeModels(response.body);
      if (!models) return {
        authority: { kind: "provider-native", authority_ref: `provider-native:${input.provider.id}` },
        source: { kind: "provider-api", reference: `${input.provider.id}/models` },
        status: "unavailable",
        models: [],
        diagnostics: [diagnostic("invalid-response", "The provider catalog response did not match the normalized /models shape.")],
      };
      return {
        authority: { kind: "provider-native", authority_ref: `provider-native:${input.provider.id}` },
        source: { kind: "provider-api", reference: `${input.provider.id}/models` },
        status: "complete",
        models,
      };
    },
  };
}

export function createFetchCatalogHttpClient(fetchImpl: CatalogFetchLike): CatalogHttpClient {
  return {
    async get(url, headers): Promise<CatalogHttpResponse> {
      const response = await fetchImpl(url, { method: "GET", headers });
      return { status: response.status, body: await response.json() };
    },
  };
}
