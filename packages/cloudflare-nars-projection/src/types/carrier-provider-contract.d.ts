declare module '@narada2/carrier-provider-contract/provider-registry' {
  const registry: {
    providers?: Record<string, Record<string, unknown> & { adapter_kind?: string; credential_secret_ref?: string | null }>;
  };
  export default registry;
}

declare module '@narada2/carrier-provider-contract/provider-runtime-binding-core' {
  export interface NaradaProviderRuntimeBinding {
    schema: string;
    provider_id: string;
    base_url: string;
    model: string | null;
    reasoning_effort: string;
    api_key: string | null;
    credential_requirement_kind: string;
    credential_secret_ref: string | null;
    chat_completions_path: string | null;
    credential_env_names: readonly string[];
    base_url_env_names: readonly string[];
    model_env_names: readonly string[];
    credential_source: string;
    credential_fingerprint: string | null;
  }
  export function resolveProviderRuntimeBinding(provider: string, options: {
    metadata: Record<string, Record<string, unknown>>;
    env?: Record<string, string | undefined>;
    overrides?: { apiKey?: string; baseUrl?: string; model?: string; thinking?: string };
    requireCredential?: boolean;
  }): NaradaProviderRuntimeBinding;
  export function redactProviderRuntimeBinding(binding: NaradaProviderRuntimeBinding | null): Omit<NaradaProviderRuntimeBinding, 'api_key'> | null;
}

declare module '@narada2/carrier-provider-contract/openai-compatible-chat' {
  export interface OpenAiChatMessage {
    role: string;
    content?: string | null;
    tool_calls?: unknown[];
    tool_call_id?: string;
    reasoning_content?: string;
  }
  export interface OpenAiChatRequest {
    url: URL;
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }
  export function reasoningEffort(thinking: string | undefined): string | null;
  export function buildOpenAiChatRequest(
    messages: OpenAiChatMessage[],
    tools: unknown[],
    options: {
      baseUrl: string;
      model?: string;
      apiKey?: string;
      thinking?: string;
      provider?: string;
      openrouterSiteUrl?: string | null;
      openrouterTitle?: string | null;
      chatPath?: string;
    },
  ): OpenAiChatRequest;
  export function extractOpenAiChatReply(body: unknown): {
    content: string;
    tool_calls: Array<{ server_name?: string; tool_name: string; arguments?: Record<string, unknown> }>;
    raw: unknown;
  };
}
