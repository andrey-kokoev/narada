/**
 * Typed resource records. Inference provider (who runs inference),
 * model provider (who publishes the model), and model (what is invoked)
 * are independent identities related explicitly — never collapsed into a
 * provider/model name pair.
 */

import type { ResourceId, ResourceRef } from "./ids.js";

export const INFERENCE_PROVIDER_SCHEMA = "narada.invokable-intelligence.inference-provider.v1" as const;
export const MODEL_PROVIDER_SCHEMA = "narada.invokable-intelligence.model-provider.v1" as const;
export const MODEL_SCHEMA = "narada.invokable-intelligence.model.v1" as const;
export const MODEL_OFFERING_SCHEMA = "narada.invokable-intelligence.model-offering.v1" as const;
export const INFERENCE_ENDPOINT_SCHEMA = "narada.invokable-intelligence.inference-endpoint.v1" as const;
export const ADAPTER_SCHEMA = "narada.invokable-intelligence.adapter.v1" as const;
export const CREDENTIAL_LOCATOR_SCHEMA = "narada.invokable-intelligence.credential-locator.v1" as const;
export const EXECUTION_LOCUS_SCHEMA = "narada.invokable-intelligence.execution-locus.v1" as const;
export const SITE_SCHEMA = "narada.invokable-intelligence.site.v1" as const;

/** Exact identity assigned to the same Site by another governed registry. */
export interface SiteRegistryIdentityBinding {
  registry: string;
  subject_id: string;
}

interface ResourceBase {
  id: ResourceId;
  display_name?: string;
  metadata?: Record<string, string>;
}

/** Versioned invocation wire contract implemented by an adapter. */
export type InferenceProtocol =
  | { family: "openai"; operation: "chat-completions" | "responses"; version: string }
  | { family: "anthropic"; operation: "messages"; version: string }
  | { family: "cloudflare-workers-ai"; operation: "run"; version: string }
  | { family: "codex-subscription"; operation: "responses"; version: string }
  | { family: "narada"; operation: "invoke"; version: string };

/** Concrete endpoint coordinate. Selection never depends on ambient process configuration. */
export type InferenceEndpointAddress =
  | { kind: "url"; url: string }
  | { kind: "workers-binding"; binding: string }
  | { kind: "runtime-service"; service: string };

/**
 * One model as offered through one inference service and endpoint.  This is
 * the narrowest durable catalog identity for service-specific capability,
 * pricing, availability, version, or region assertions.
 */
export interface ModelOffering extends ResourceBase {
  schema: typeof MODEL_OFFERING_SCHEMA;
  model: ResourceRef;
  model_provider: ResourceRef;
  inference_provider: ResourceRef;
  endpoint: ResourceRef;
  /** Service-specific model identifier sent over this offering (not the canonical model id). */
  invocation_model_key: string;
  service_class: string;
  version?: string;
  region?: string;
}

/** Who runs inference, e.g. Cloudflare Workers AI, a remote gateway. */
export interface InferenceProvider extends ResourceBase {
  schema: typeof INFERENCE_PROVIDER_SCHEMA;
}

/** Who publishes the model, e.g. Kimi/Moonshot, Meta, OpenAI. */
export interface ModelProvider extends ResourceBase {
  schema: typeof MODEL_PROVIDER_SCHEMA;
}

/** What is invoked. */
export interface Model extends ResourceBase {
  schema: typeof MODEL_SCHEMA;
  /** Ref to the ModelProvider that publishes this model. */
  provider: ResourceRef;
}

/** A concrete way to reach inference: binding, gateway, or API surface. */
export interface InferenceEndpoint extends ResourceBase {
  schema: typeof INFERENCE_ENDPOINT_SCHEMA;
  /** Ref to the InferenceProvider that owns this endpoint. */
  inference_provider: ResourceRef;
  /** Ref to the Adapter used to drive this endpoint. */
  adapter: ResourceRef;
  address: InferenceEndpointAddress;
  /** Refs to Models this endpoint can serve. */
  serves: ResourceRef[];
  /** Ref to the CredentialLocator this endpoint authenticates with, when required. */
  credential?: ResourceRef;
}

/** Runtime-specific invocation driver. */
export interface InferenceAdapter extends ResourceBase {
  schema: typeof ADAPTER_SCHEMA;
  runtime_family: "node" | "workers" | "test";
  protocol: InferenceProtocol;
}

/**
 * Reference to where a credential can be obtained. NEVER carries secret
 * material — only an approved locator (env var name, site-secret key, ...).
 */
export interface CredentialLocator extends ResourceBase {
  schema: typeof CREDENTIAL_LOCATOR_SCHEMA;
  store: "env" | "site-secret" | "operator-secret" | "file" | "none";
  /** Store-specific lookup key, e.g. an env var name. Not the secret itself. */
  reference: string;
  /** Ref to the Site that owns this credential record. */
  holder: ResourceRef;
}

/** Where an invocation executes. */
export interface ExecutionLocus extends ResourceBase {
  schema: typeof EXECUTION_LOCUS_SCHEMA;
  kind: "local" | "cloudflare" | "test";
}

/** A Site identity. The authority role it plays (target/user/host) is assigned per resolution, not here. */
export interface Site extends ResourceBase {
  schema: typeof SITE_SCHEMA;
  /** Explicit cross-registry identities. Site names and id prefixes carry no mapping semantics. */
  registry_bindings?: SiteRegistryIdentityBinding[];
}

export function siteMatchesRegistryIdentity(
  site: Site,
  registry: string,
  subjectId: string,
): boolean {
  return (site.registry_bindings ?? []).some((binding) =>
    binding.registry === registry && binding.subject_id === subjectId);
}

export type Resource =
  | InferenceProvider
  | ModelProvider
  | Model
  | ModelOffering
  | InferenceEndpoint
  | InferenceAdapter
  | CredentialLocator
  | ExecutionLocus
  | Site;

export const RESOURCE_SCHEMAS = [
  INFERENCE_PROVIDER_SCHEMA,
  MODEL_PROVIDER_SCHEMA,
  MODEL_SCHEMA,
  MODEL_OFFERING_SCHEMA,
  INFERENCE_ENDPOINT_SCHEMA,
  ADAPTER_SCHEMA,
  CREDENTIAL_LOCATOR_SCHEMA,
  EXECUTION_LOCUS_SCHEMA,
  SITE_SCHEMA,
] as const;

export type ResourceSchema = (typeof RESOURCE_SCHEMAS)[number];

/** Maps each resource schema to the kind its id must carry. */
export const SCHEMA_ID_KIND: Record<ResourceSchema, import("./ids.js").ResourceKind> = {
  [INFERENCE_PROVIDER_SCHEMA]: "inference-provider",
  [MODEL_PROVIDER_SCHEMA]: "model-provider",
  [MODEL_SCHEMA]: "model",
  [MODEL_OFFERING_SCHEMA]: "model-offering",
  [INFERENCE_ENDPOINT_SCHEMA]: "inference-endpoint",
  [ADAPTER_SCHEMA]: "adapter",
  [CREDENTIAL_LOCATOR_SCHEMA]: "credential-locator",
  [EXECUTION_LOCUS_SCHEMA]: "execution-locus",
  [SITE_SCHEMA]: "site",
};
