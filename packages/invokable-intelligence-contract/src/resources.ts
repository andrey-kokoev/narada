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
export const INFERENCE_ENDPOINT_SCHEMA = "narada.invokable-intelligence.inference-endpoint.v1" as const;
export const ADAPTER_SCHEMA = "narada.invokable-intelligence.adapter.v1" as const;
export const CREDENTIAL_LOCATOR_SCHEMA = "narada.invokable-intelligence.credential-locator.v1" as const;
export const EXECUTION_LOCUS_SCHEMA = "narada.invokable-intelligence.execution-locus.v1" as const;
export const SITE_SCHEMA = "narada.invokable-intelligence.site.v1" as const;

interface ResourceBase {
  id: ResourceId;
  display_name?: string;
  metadata?: Record<string, string>;
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
  /** Refs to Models this endpoint can serve. */
  serves: ResourceRef[];
}

/** Runtime-specific invocation driver. */
export interface InferenceAdapter extends ResourceBase {
  schema: typeof ADAPTER_SCHEMA;
  runtime_family: "node" | "workers" | "test";
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
}

export type Resource =
  | InferenceProvider
  | ModelProvider
  | Model
  | InferenceEndpoint
  | InferenceAdapter
  | CredentialLocator
  | ExecutionLocus
  | Site;

export const RESOURCE_SCHEMAS = [
  INFERENCE_PROVIDER_SCHEMA,
  MODEL_PROVIDER_SCHEMA,
  MODEL_SCHEMA,
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
  [INFERENCE_ENDPOINT_SCHEMA]: "inference-endpoint",
  [ADAPTER_SCHEMA]: "adapter",
  [CREDENTIAL_LOCATOR_SCHEMA]: "credential-locator",
  [EXECUTION_LOCUS_SCHEMA]: "execution-locus",
  [SITE_SCHEMA]: "site",
};
