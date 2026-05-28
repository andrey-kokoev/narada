const ANTHROPIC_PROVIDER_KIND = 'anthropic_messages';
const DEFAULT_ANTHROPIC_MESSAGES_ENDPOINT = 'https://api.anthropic.com/v1/messages';

function anthropicRegistration(record = {}) {
  return {
    adapter_id: record.adapter_id ?? 'anthropic-messages',
    adapter_kind: 'model_executor_adapter',
    provider_kind: ANTHROPIC_PROVIDER_KIND,
    capability_ref: record.capability_ref,
    model_posture: 'provider_configured',
    executor_posture: 'no_effect',
    supported_request_classes: ['prompt_context'],
    supported_response_classes: ['inert_proposal', 'refusal', 'closeout_summary'],
    provider_config: record.provider_config ?? {
      endpoint_url: record.endpoint_url ?? DEFAULT_ANTHROPIC_MESSAGES_ENDPOINT,
      model: record.model ?? null,
      api_posture: 'messages',
    },
  };
}

function resolveAnthropicConfig(capability = {}) {
  return {
    endpoint_url: capability.endpoint_url ?? capability.base_url ?? DEFAULT_ANTHROPIC_MESSAGES_ENDPOINT,
    model: capability.model ?? null,
  };
}

function anthropicRefusal(reason, diagnostic) {
  return {
    status: 'refused',
    reason,
    diagnostic,
  };
}

function anthropicMessagesPayload({ prompt, model }) {
  return {
    model,
    max_tokens: 1024,
    messages: [
      { role: 'user', content: prompt },
    ],
  };
}

function extractAnthropicText(response) {
  const firstText = response.content?.find?.((block) => block?.type === 'text' && typeof block.text === 'string');
  return firstText?.text ?? null;
}

function normalizeAnthropicMessagesResponse(response) {
  if (!response || typeof response !== 'object') {
    return anthropicRefusal('malformed_provider_response', 'Anthropic response was not an object.');
  }
  if (response.status === 429 || response.error?.type === 'rate_limit_error') {
    return anthropicRefusal('provider_rate_limited', 'Anthropic returned a rate-limit response.');
  }
  if (response.error) {
    return anthropicRefusal('provider_refused', response.error.message ?? 'Anthropic returned an error object.');
  }
  const content = extractAnthropicText(response);
  if (!content) {
    return anthropicRefusal('malformed_provider_response', 'Anthropic response did not include a text content block.');
  }
  return {
    status: 'ok',
    text: content,
    action_type: 'observation',
    proposed_payload: {
      summary: content,
      provider_kind: ANTHROPIC_PROVIDER_KIND,
    },
    closeout_summary: 'anthropic_provider_adapter_completed_without_effect_authority',
  };
}

function makeAnthropicProviderAdapter({ transport } = {}) {
  return async function anthropicProviderAdapter({ capability, credential_ref: credentialRef, request }) {
    const config = resolveAnthropicConfig(capability);
    if (!config.model) {
      return anthropicRefusal('missing_model_configuration', 'Anthropic capability material must provide model.');
    }
    if (!credentialRef) {
      return anthropicRefusal('missing_credential_reference', 'Anthropic capability material must provide credential_ref.');
    }
    if (!transport) {
      return anthropicRefusal('missing_provider_transport', 'Anthropic adapter requires an admitted transport implementation.');
    }
    const providerResponse = await transport({
      endpoint_url: config.endpoint_url,
      method: 'POST',
      credential_ref: credentialRef,
      request_body: anthropicMessagesPayload({ prompt: request?.prompt ?? '', model: config.model }),
      response_format: 'anthropic_messages',
    });
    return normalizeAnthropicMessagesResponse(providerResponse);
  };
}

export {
  ANTHROPIC_PROVIDER_KIND,
  DEFAULT_ANTHROPIC_MESSAGES_ENDPOINT,
  anthropicMessagesPayload,
  anthropicRegistration,
  makeAnthropicProviderAdapter,
  normalizeAnthropicMessagesResponse,
  resolveAnthropicConfig,
};
