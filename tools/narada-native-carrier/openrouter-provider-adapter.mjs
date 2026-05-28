const OPENROUTER_PROVIDER_KIND = 'openrouter_openai_compatible';
const DEFAULT_OPENROUTER_CHAT_COMPLETIONS_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

function openrouterRegistration(record = {}) {
  return {
    adapter_id: record.adapter_id ?? 'openrouter-openai-compatible',
    adapter_kind: 'model_executor_adapter',
    provider_kind: OPENROUTER_PROVIDER_KIND,
    capability_ref: record.capability_ref,
    model_posture: 'provider_configured',
    executor_posture: 'no_effect',
    supported_request_classes: ['prompt_context'],
    supported_response_classes: ['inert_proposal', 'refusal', 'closeout_summary'],
    provider_config: record.provider_config ?? {
      endpoint_url: record.endpoint_url ?? DEFAULT_OPENROUTER_CHAT_COMPLETIONS_ENDPOINT,
      model: record.model ?? null,
      router_ref: record.router_ref ?? null,
      api_posture: 'openai_chat_completions',
    },
  };
}

function resolveOpenRouterConfig(capability = {}) {
  return {
    endpoint_url: capability.endpoint_url ?? capability.base_url ?? DEFAULT_OPENROUTER_CHAT_COMPLETIONS_ENDPOINT,
    model: capability.model ?? null,
    router_ref: capability.router_ref ?? capability.route_ref ?? capability.provider_route_ref ?? null,
  };
}

function openrouterRefusal(reason, diagnostic) {
  return {
    status: 'refused',
    reason,
    diagnostic,
  };
}

function openrouterChatCompletionPayload({ prompt, model, routerRef }) {
  return {
    model,
    messages: [
      { role: 'user', content: prompt },
    ],
    temperature: 0,
    route: {
      ref: routerRef,
    },
  };
}

function normalizeOpenRouterChatCompletionResponse(response) {
  if (!response || typeof response !== 'object') {
    return openrouterRefusal('malformed_provider_response', 'OpenRouter response was not an object.');
  }
  if (response.status === 429 || response.error?.code === 429 || response.error?.type === 'rate_limit_exceeded') {
    return openrouterRefusal('provider_rate_limited', 'OpenRouter returned a rate-limit response.');
  }
  if (response.error) {
    return openrouterRefusal('provider_refused', response.error.message ?? 'OpenRouter returned an error object.');
  }
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    return openrouterRefusal('malformed_provider_response', 'OpenRouter response did not include choices[0].message.content.');
  }
  return {
    status: 'ok',
    text: content,
    action_type: 'observation',
    proposed_payload: {
      summary: content,
      provider_kind: OPENROUTER_PROVIDER_KIND,
    },
    closeout_summary: 'openrouter_provider_adapter_completed_without_effect_authority',
  };
}

function makeOpenRouterProviderAdapter({ transport } = {}) {
  return async function openrouterProviderAdapter({ capability, credential_ref: credentialRef, request }) {
    const config = resolveOpenRouterConfig(capability);
    if (!config.model) {
      return openrouterRefusal('missing_model_configuration', 'OpenRouter capability material must provide model.');
    }
    if (!config.router_ref) {
      return openrouterRefusal('missing_router_configuration', 'OpenRouter capability material must provide router_ref, route_ref, or provider_route_ref.');
    }
    if (!credentialRef) {
      return openrouterRefusal('missing_credential_reference', 'OpenRouter capability material must provide credential_ref.');
    }
    if (!transport) {
      return openrouterRefusal('missing_provider_transport', 'OpenRouter adapter requires an admitted transport implementation.');
    }
    const providerResponse = await transport({
      endpoint_url: config.endpoint_url,
      method: 'POST',
      credential_ref: credentialRef,
      router_ref: config.router_ref,
      request_body: openrouterChatCompletionPayload({
        prompt: request?.prompt ?? '',
        model: config.model,
        routerRef: config.router_ref,
      }),
      response_format: 'openai_chat_completion',
    });
    return normalizeOpenRouterChatCompletionResponse(providerResponse);
  };
}

export {
  DEFAULT_OPENROUTER_CHAT_COMPLETIONS_ENDPOINT,
  OPENROUTER_PROVIDER_KIND,
  makeOpenRouterProviderAdapter,
  normalizeOpenRouterChatCompletionResponse,
  openrouterChatCompletionPayload,
  openrouterRegistration,
  resolveOpenRouterConfig,
};
