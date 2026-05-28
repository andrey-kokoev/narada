const OPENAI_PROVIDER_KIND = 'openai_chat_completions';
const DEFAULT_OPENAI_CHAT_COMPLETIONS_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

function openaiRegistration(record = {}) {
  return {
    adapter_id: record.adapter_id ?? 'openai-chat-completions',
    adapter_kind: 'model_executor_adapter',
    provider_kind: OPENAI_PROVIDER_KIND,
    capability_ref: record.capability_ref,
    model_posture: 'provider_configured',
    executor_posture: 'no_effect',
    supported_request_classes: ['prompt_context'],
    supported_response_classes: ['inert_proposal', 'refusal', 'closeout_summary'],
    provider_config: record.provider_config ?? {
      endpoint_url: record.endpoint_url ?? DEFAULT_OPENAI_CHAT_COMPLETIONS_ENDPOINT,
      model: record.model ?? null,
      api_posture: 'chat_completions',
    },
  };
}

function resolveOpenAIConfig(capability = {}) {
  return {
    endpoint_url: capability.endpoint_url ?? capability.base_url ?? DEFAULT_OPENAI_CHAT_COMPLETIONS_ENDPOINT,
    model: capability.model ?? null,
  };
}

function openaiRefusal(reason, diagnostic) {
  return {
    status: 'refused',
    reason,
    diagnostic,
  };
}

function openaiChatCompletionPayload({ prompt, model }) {
  return {
    model,
    messages: [
      { role: 'user', content: prompt },
    ],
    temperature: 0,
  };
}

function normalizeOpenAIChatCompletionResponse(response) {
  if (!response || typeof response !== 'object') {
    return openaiRefusal('malformed_provider_response', 'OpenAI response was not an object.');
  }
  if (response.status === 429 || response.error?.type === 'rate_limit_exceeded' || response.error?.code === 'rate_limit_exceeded') {
    return openaiRefusal('provider_rate_limited', 'OpenAI returned a rate-limit response.');
  }
  if (response.error) {
    return openaiRefusal('provider_refused', response.error.message ?? 'OpenAI returned an error object.');
  }
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    return openaiRefusal('malformed_provider_response', 'OpenAI response did not include choices[0].message.content.');
  }
  return {
    status: 'ok',
    text: content,
    action_type: 'observation',
    proposed_payload: {
      summary: content,
      provider_kind: OPENAI_PROVIDER_KIND,
    },
    closeout_summary: 'openai_provider_adapter_completed_without_effect_authority',
  };
}

function makeOpenAIProviderAdapter({ transport } = {}) {
  return async function openaiProviderAdapter({ capability, credential_ref: credentialRef, request }) {
    const config = resolveOpenAIConfig(capability);
    if (!config.model) {
      return openaiRefusal('missing_model_configuration', 'OpenAI capability material must provide model.');
    }
    if (!credentialRef) {
      return openaiRefusal('missing_credential_reference', 'OpenAI capability material must provide credential_ref.');
    }
    if (!transport) {
      return openaiRefusal('missing_provider_transport', 'OpenAI adapter requires an admitted transport implementation.');
    }
    const providerResponse = await transport({
      endpoint_url: config.endpoint_url,
      method: 'POST',
      credential_ref: credentialRef,
      request_body: openaiChatCompletionPayload({ prompt: request?.prompt ?? '', model: config.model }),
      response_format: 'openai_chat_completion',
    });
    return normalizeOpenAIChatCompletionResponse(providerResponse);
  };
}

export {
  DEFAULT_OPENAI_CHAT_COMPLETIONS_ENDPOINT,
  OPENAI_PROVIDER_KIND,
  makeOpenAIProviderAdapter,
  normalizeOpenAIChatCompletionResponse,
  openaiChatCompletionPayload,
  openaiRegistration,
  resolveOpenAIConfig,
};
