import type {
  CanonicalCatalogRecord,
  CredentialLocator,
  InferenceAdapter,
  InferenceEndpoint,
  InferenceProvider,
  ModelOffering,
  PolicyDocument,
} from "@narada2/invokable-intelligence-contract";
import type { IntelligenceRegistryStore } from "@narada2/invokable-intelligence-registry";

import type {
  LegacyCredentialRequirement,
  LegacyProviderEntry,
  LegacyProviderRegistry,
} from "./legacy.js";

export const LEGACY_PROVIDER_REGISTRY_COMPATIBILITY_KEY = "carrier.provider_registry" as const;
export const LEGACY_COMPATIBILITY_READ_SCHEMA =
  "narada.invokable-intelligence.legacy-compatibility-read.v1" as const;
export const LEGACY_COMPATIBILITY_TELEMETRY_SCHEMA =
  "narada.invokable-intelligence.legacy-compatibility-telemetry.v1" as const;

const MAX_CONSUMER_FIELD_LENGTH = 256;
const MAX_TELEMETRY_RECORD_REFS = 64;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;

export type DeepReadonly<T> =
  T extends (...args: never[]) => unknown ? T
    : T extends readonly (infer U)[] ? readonly DeepReadonly<U>[]
      : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

export interface LegacyCompatibilityConsumer {
  call_site: string;
  configuration_key: string;
  migration_owner: string;
}

export interface LegacyCompatibilityTelemetry {
  schema: typeof LEGACY_COMPATIBILITY_TELEMETRY_SCHEMA;
  event: "legacy_compatibility_read";
  key: typeof LEGACY_PROVIDER_REGISTRY_COMPATIBILITY_KEY;
  deprecated: true;
  read_only: true;
  occurred_at: string;
  consumer: LegacyCompatibilityConsumer;
  canonical_record_count: number;
  canonical_record_refs: string[];
  canonical_record_refs_truncated: boolean;
}

export interface LegacyCompatibilityReadOptions {
  emitTelemetry(event: DeepReadonly<LegacyCompatibilityTelemetry>): void | Promise<void>;
  now?: () => string;
}

export interface LegacyCompatibilityReadEnvelope {
  schema: typeof LEGACY_COMPATIBILITY_READ_SCHEMA;
  key: typeof LEGACY_PROVIDER_REGISTRY_COMPATIBILITY_KEY;
  deprecated: true;
  read_only: true;
  write_admission: "refused";
  authority: "canonical-v2";
  value: DeepReadonly<LegacyProviderRegistry>;
}

export type LegacyCompatibilityErrorCode =
  | "unknown-legacy-compatibility-key"
  | "legacy-compatibility-read-only"
  | "invalid-legacy-compatibility-consumer"
  | "canonical-registry-uninitialized"
  | "ambiguous-canonical-provider-projection"
  | "invalid-canonical-provider-projection";

export class LegacyCompatibilityProjectionError extends Error {
  readonly code: LegacyCompatibilityErrorCode;

  constructor(code: LegacyCompatibilityErrorCode, message: string) {
    super(message);
    this.name = "LegacyCompatibilityProjectionError";
    this.code = code;
  }
}

function fail(code: LegacyCompatibilityErrorCode, message: string): never {
  throw new LegacyCompatibilityProjectionError(code, message);
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value as DeepReadonly<T>;
}

function validateConsumer(consumer: LegacyCompatibilityConsumer): LegacyCompatibilityConsumer {
  for (const [field, value] of Object.entries(consumer)) {
    if (
      typeof value !== "string"
      || value.trim() !== value
      || value.length === 0
      || value.length > MAX_CONSUMER_FIELD_LENGTH
      || CONTROL_CHARACTER.test(value)
    ) {
      fail("invalid-legacy-compatibility-consumer", `consumer.${field} must be a trimmed, printable string of 1..${MAX_CONSUMER_FIELD_LENGTH} characters`);
    }
  }
  return { ...consumer };
}

function latestCanonicalRecords(records: CanonicalCatalogRecord[]): CanonicalCatalogRecord[] {
  const latest = new Map<string, CanonicalCatalogRecord>();
  for (const record of [...records].sort((left, right) =>
    left.record_kind.localeCompare(right.record_kind)
    || left.record_id.localeCompare(right.record_id)
    || left.revision - right.revision
    || left.id.localeCompare(right.id))) {
    const identity = `${record.record_kind}:\0${record.record_id}`;
    const current = latest.get(identity);
    if (current?.revision === record.revision && current.id !== record.id) {
      fail("ambiguous-canonical-provider-projection", `canonical identity '${record.record_id}' has multiple records at revision ${record.revision}`);
    }
    if (!current || record.revision > current.revision) latest.set(identity, record);
  }
  return [...latest.values()].sort((left, right) =>
    left.record_kind.localeCompare(right.record_kind) || left.record_id.localeCompare(right.record_id));
}

function canonicalResources<T extends { schema: string }>(
  records: CanonicalCatalogRecord[],
  schema: string,
): T[] {
  return records
    .filter((record) => record.record_kind === "resource" && record.document.schema === schema)
    .map((record) => record.document as unknown as T);
}

function canonicalDefaultValues(records: CanonicalCatalogRecord[]): Map<string, string> {
  const values = new Map<string, string>();
  const isCompatibilityOption = (option: string) =>
    option === "inference_provider"
    || option === "thinking"
    || /^provider\.[^.]+\.(?:default_model|default_thinking)$/u.test(option);
  for (const record of records) {
    if (record.record_kind !== "policy") continue;
    const policy = record.document as PolicyDocument;
    if (policy.kind !== "defaults") continue;
    for (const rule of policy.rules) {
      if (
        rule.type !== "default-option"
        || typeof rule.value !== "string"
        || !isCompatibilityOption(rule.option)
      ) continue;
      const previous = values.get(rule.option);
      if (previous !== undefined && previous !== rule.value) {
        fail("ambiguous-canonical-provider-projection", `canonical defaults disagree for option '${rule.option}'`);
      }
      values.set(rule.option, rule.value);
    }
  }
  return values;
}

function adapterKind(adapterId: string): string {
  return adapterId.startsWith("adapter:") ? adapterId.slice("adapter:".length) : adapterId;
}

function projectEndpointAddress(
  endpoint: InferenceEndpoint,
  adapter: InferenceAdapter,
): Pick<LegacyProviderEntry, "base_url" | "chat_completions_path"> {
  if (endpoint.address.kind === "runtime-service") {
    return { base_url: `codex://${endpoint.address.service}` };
  }
  if (endpoint.address.kind !== "url") return {};

  const url = new URL(endpoint.address.url);
  if (adapter.protocol.family === "openai" && adapter.protocol.operation === "chat-completions") {
    const marker = "/chat/completions";
    if (!url.pathname.endsWith(marker)) {
      fail("invalid-canonical-provider-projection", `endpoint '${endpoint.id}' does not end in the canonical chat-completions operation`);
    }
    url.pathname = url.pathname.slice(0, -marker.length).replace(/\/+$/u, "") + "/";
    url.search = "";
    return { base_url: url.toString(), chat_completions_path: "chat/completions" };
  }
  if (adapter.protocol.family === "anthropic" && adapter.protocol.operation === "messages") {
    const marker = "/v1/messages";
    if (!url.pathname.endsWith(marker)) {
      fail("invalid-canonical-provider-projection", `endpoint '${endpoint.id}' does not end in the canonical messages operation`);
    }
    url.pathname = url.pathname.slice(0, -marker.length) || "/";
    url.search = "";
    return { base_url: url.toString().replace(/\/$/u, "") };
  }
  return { base_url: endpoint.address.url };
}

function projectCredential(
  endpoint: InferenceEndpoint,
  credentials: Map<string, CredentialLocator>,
): LegacyCredentialRequirement {
  if (!endpoint.credential) return { kind: "none" };
  const locator = credentials.get(endpoint.credential.id);
  if (!locator) {
    fail("invalid-canonical-provider-projection", `endpoint '${endpoint.id}' references missing credential locator '${endpoint.credential.id}'`);
  }
  if (locator.store === "none") return { kind: "local_codex_subscription" };
  if (locator.store === "env") return { kind: "api_key_secret", env_names: [locator.reference] };
  return { kind: "api_key_secret", secret_ref: locator.reference };
}

function requireSingleEndpoint(
  providerId: string,
  endpoints: InferenceEndpoint[],
): InferenceEndpoint {
  const matches = endpoints.filter((endpoint) => endpoint.inference_provider.id === providerId);
  if (matches.length !== 1) {
    fail("ambiguous-canonical-provider-projection", `provider '${providerId}' requires exactly one canonical endpoint; found ${matches.length}`);
  }
  return matches[0];
}

function projectRegistry(records: CanonicalCatalogRecord[]): LegacyProviderRegistry {
  const providers = canonicalResources<InferenceProvider>(
    records,
    "narada.invokable-intelligence.inference-provider.v1",
  );
  if (providers.length === 0) {
    fail("canonical-registry-uninitialized", "canonical registry contains no inference providers");
  }

  const offerings = canonicalResources<ModelOffering>(
    records,
    "narada.invokable-intelligence.model-offering.v1",
  );
  const endpoints = canonicalResources<InferenceEndpoint>(
    records,
    "narada.invokable-intelligence.inference-endpoint.v1",
  );
  const adapters = new Map(canonicalResources<InferenceAdapter>(
    records,
    "narada.invokable-intelligence.adapter.v1",
  ).map((adapter) => [adapter.id, adapter]));
  const credentials = new Map(canonicalResources<CredentialLocator>(
    records,
    "narada.invokable-intelligence.credential-locator.v1",
  ).map((credential) => [credential.id, credential]));
  const defaults = canonicalDefaultValues(records);
  const projectedProviders: Record<string, LegacyProviderEntry> = {};

  for (const provider of [...providers].sort((left, right) => left.id.localeCompare(right.id))) {
    const legacyId = provider.id.startsWith("inference-provider:")
      ? provider.id.slice("inference-provider:".length)
      : provider.id;
    const endpoint = requireSingleEndpoint(provider.id, endpoints);
    const adapter = adapters.get(endpoint.adapter.id);
    if (!adapter) {
      fail("invalid-canonical-provider-projection", `endpoint '${endpoint.id}' references missing adapter '${endpoint.adapter.id}'`);
    }
    const providerOfferings = offerings
      .filter((offering) =>
        offering.inference_provider.id === provider.id
        && offering.endpoint.id === endpoint.id)
      .sort((left, right) =>
        left.invocation_model_key.localeCompare(right.invocation_model_key)
        || left.id.localeCompare(right.id));
    if (providerOfferings.length === 0) {
      fail("invalid-canonical-provider-projection", `provider '${provider.id}' has no canonical model offerings`);
    }

    const availableModels = [...new Set(providerOfferings.map((offering) => offering.invocation_model_key))];
    const defaultModelId = defaults.get(`provider.${legacyId}.default_model`);
    const defaultOffering = defaultModelId === undefined
      ? undefined
      : providerOfferings.find((offering) => offering.model.id === defaultModelId);
    if (defaultModelId !== undefined && !defaultOffering) {
      fail("invalid-canonical-provider-projection", `provider '${provider.id}' default model is not offered by its canonical endpoint`);
    }

    projectedProviders[legacyId] = {
      ...(provider.metadata?.meaning ? { meaning: provider.metadata.meaning } : {}),
      ...projectEndpointAddress(endpoint, adapter),
      ...(defaultOffering ? { default_model: defaultOffering.invocation_model_key } : {}),
      ...(defaults.get(`provider.${legacyId}.default_thinking`)
        ? { default_thinking: defaults.get(`provider.${legacyId}.default_thinking`) }
        : {}),
      available_models: availableModels,
      adapter_kind: adapterKind(adapter.id),
      credential_requirement: projectCredential(endpoint, credentials),
    };
  }

  const canonicalDefaultProvider = defaults.get("inference_provider");
  const defaultProvider = canonicalDefaultProvider?.startsWith("inference-provider:")
    ? canonicalDefaultProvider.slice("inference-provider:".length)
    : canonicalDefaultProvider;
  if (defaultProvider && !Object.hasOwn(projectedProviders, defaultProvider)) {
    fail("invalid-canonical-provider-projection", `canonical default provider '${canonicalDefaultProvider}' is absent from the projection`);
  }
  if (defaultProvider && defaults.get("thinking") && !projectedProviders[defaultProvider].default_thinking) {
    projectedProviders[defaultProvider].default_thinking = defaults.get("thinking");
  }

  return {
    schema: "narada.carrier.provider_registry.v1",
    ...(defaultProvider ? { default_provider: defaultProvider } : {}),
    providers: projectedProviders,
  };
}

function assertKnownKey(key: string): asserts key is typeof LEGACY_PROVIDER_REGISTRY_COMPATIBILITY_KEY {
  if (key !== LEGACY_PROVIDER_REGISTRY_COMPATIBILITY_KEY) {
    fail("unknown-legacy-compatibility-key", `unknown legacy compatibility key '${key}'`);
  }
}

export async function readLegacyCompatibilityProjection(
  store: IntelligenceRegistryStore,
  key: string,
  consumer: LegacyCompatibilityConsumer,
  options: LegacyCompatibilityReadOptions,
): Promise<DeepReadonly<LegacyCompatibilityReadEnvelope>> {
  assertKnownKey(key);
  const admittedConsumer = validateConsumer(consumer);
  if (!options || typeof options.emitTelemetry !== "function") {
    fail("invalid-legacy-compatibility-consumer", "a mandatory compatibility telemetry sink is required");
  }

  const records = latestCanonicalRecords(await store.listCatalogRecords());
  const value = projectRegistry(records);
  const refs = records.map((record) => record.id).sort();
  const telemetry = deepFreeze<LegacyCompatibilityTelemetry>({
    schema: LEGACY_COMPATIBILITY_TELEMETRY_SCHEMA,
    event: "legacy_compatibility_read",
    key: LEGACY_PROVIDER_REGISTRY_COMPATIBILITY_KEY,
    deprecated: true,
    read_only: true,
    occurred_at: (options.now ?? (() => new Date().toISOString()))(),
    consumer: admittedConsumer,
    canonical_record_count: refs.length,
    canonical_record_refs: refs.slice(0, MAX_TELEMETRY_RECORD_REFS),
    canonical_record_refs_truncated: refs.length > MAX_TELEMETRY_RECORD_REFS,
  });
  await options.emitTelemetry(telemetry);

  return deepFreeze({
    schema: LEGACY_COMPATIBILITY_READ_SCHEMA,
    key: LEGACY_PROVIDER_REGISTRY_COMPATIBILITY_KEY,
    deprecated: true,
    read_only: true,
    write_admission: "refused",
    authority: "canonical-v2",
    value,
  });
}

export function rejectLegacyCompatibilityWrite(key: string): never {
  assertKnownKey(key);
  return fail("legacy-compatibility-read-only", `legacy compatibility key '${key}' is read-only`);
}
