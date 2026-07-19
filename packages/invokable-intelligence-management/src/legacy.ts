/**
 * Legacy carrier provider-registry shape (narada.carrier.provider_registry.v1)
 * and a tolerant loader. The legacy contract conflates inference provider,
 * model provider, model, adapter, credentials, and defaults into one entry
 * per provider id — the migrator untangles exactly this.
 */

export interface LegacyCredentialRequirement {
  kind: "none" | "api_key_secret" | "local_codex_subscription";
  secret_ref?: string;
  env_names?: string[];
}

export interface LegacyProviderEntry {
  meaning?: string;
  base_url?: string;
  default_model?: string;
  default_thinking?: string;
  available_models?: string[];
  cognition_defaults?: Record<string, { model?: string; reasoning_effort?: string }>;
  adapter_kind?: string;
  support_state?: string;
  base_url_env_names?: string[];
  model_env_names?: string[];
  credential_env_names?: string[];
  credential_secret_ref?: string;
  credential_requirement?: LegacyCredentialRequirement;
}

export interface LegacyProviderRegistry {
  schema: string;
  default_provider?: string;
  providers: Record<string, LegacyProviderEntry>;
}

export class LegacyRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegacyRegistryError";
  }
}

/** Parse and minimally validate a legacy registry document. */
export function parseLegacyRegistry(raw: unknown): LegacyProviderRegistry {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new LegacyRegistryError("legacy registry must be an object");
  }
  const doc = raw as Record<string, unknown>;
  if (doc.schema !== "narada.carrier.provider_registry.v1") {
    throw new LegacyRegistryError(`unsupported legacy registry schema: ${String(doc.schema)}`);
  }
  if (typeof doc.providers !== "object" || doc.providers === null || Array.isArray(doc.providers)) {
    throw new LegacyRegistryError("legacy registry must have a providers object");
  }
  for (const [id, entry] of Object.entries(doc.providers as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new LegacyRegistryError(`provider '${id}' must be an object`);
    }
  }
  return doc as unknown as LegacyProviderRegistry;
}

/** Slugify a legacy model name for use in a ResourceId, scoped by the legacy provider id. */
export function legacyModelResourceId(legacyProviderId: string, modelName: string): string {
  const slug = modelName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `model:${legacyProviderId}-${slug}`;
}

/** Map a legacy provider id to the vendor (model provider) slug. */
export function legacyVendorSlug(legacyProviderId: string): string {
  switch (legacyProviderId) {
    case "kimi-api":
    case "kimi-code-api":
      return "kimi";
    case "openai-api":
    case "codex-subscription":
      return "openai";
    case "anthropic-api":
    case "deepseek-api":
    case "glm-api":
    case "openrouter-api":
      return legacyProviderId.replace(/-api$/, "");
    default:
      return legacyProviderId;
  }
}
