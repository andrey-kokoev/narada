const KIMI_PROVIDER_KIND = 'kimi_openai_compatible';

function kimiRegistration(record = {}) {
  return {
    adapter_id: record.adapter_id ?? 'kimi-openai-compatible',
    adapter_kind: 'model_executor_adapter',
    provider_kind: KIMI_PROVIDER_KIND,
    capability_ref: record.capability_ref,
    model_posture: 'provider_configured',
    executor_posture: 'no_effect',
    supported_request_classes: ['prompt_context'],
    supported_response_classes: ['inert_proposal', 'refusal', 'closeout_summary'],
    provider_config: record.provider_config ?? {
      endpoint_url: record.endpoint_url ?? null,
      model: record.model ?? null,
    },
  };
}

function resolveKimiConfig(capability = {}) {
  return {
    endpoint_url: capability.endpoint_url ?? capability.base_url ?? null,
    model: capability.model ?? null,
  };
}

function kimiRefusal(reason, diagnostic) {
  return {
    status: 'refused',
    reason,
    diagnostic,
  };
}

function kimiRequestPayload({ prompt, model }) {
  return {
    model,
    messages: [
      { role: 'user', content: prompt },
    ],
    temperature: 0,
  };
}

function normalizeKimiChatCompletionResponse(response) {
  if (!response || typeof response !== 'object') {
    return kimiRefusal('malformed_provider_response', 'Kimi response was not an object.');
  }
  if (response.error) {
    return kimiRefusal('provider_refused', response.error.message ?? 'Kimi returned an error object.');
  }
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    return kimiRefusal('malformed_provider_response', 'Kimi response did not include choices[0].message.content.');
  }
  return {
    status: 'ok',
    text: content,
    action_type: 'observation',
    proposed_payload: {
      summary: content,
      provider_kind: KIMI_PROVIDER_KIND,
    },
    closeout_summary: 'kimi_provider_adapter_completed_without_effect_authority',
  };
}

function makeKimiProviderAdapter({ transport } = {}) {
  return async function kimiProviderAdapter({ capability, credential_ref: credentialRef, request }) {
    const config = resolveKimiConfig(capability);
    if (!config.endpoint_url) {
      return kimiRefusal('missing_endpoint_configuration', 'Kimi capability material must provide endpoint_url or base_url.');
    }
    if (!config.model) {
      return kimiRefusal('missing_model_configuration', 'Kimi capability material must provide model.');
    }
    if (!credentialRef) {
      return kimiRefusal('missing_credential_reference', 'Kimi capability material must provide credential_ref.');
    }
    if (!transport) {
      return kimiRefusal('missing_provider_transport', 'Kimi adapter requires an admitted transport implementation.');
    }
    const providerResponse = await transport({
      endpoint_url: config.endpoint_url,
      method: 'POST',
      credential_ref: credentialRef,
      request_body: kimiRequestPayload({ prompt: request?.prompt ?? '', model: config.model }),
      response_format: 'openai_chat_completion',
    });
    return normalizeKimiChatCompletionResponse(providerResponse);
  };
}

export {
  KIMI_PROVIDER_KIND,
  kimiRegistration,
  kimiRequestPayload,
  makeKimiProviderAdapter,
  normalizeKimiChatCompletionResponse,
  resolveKimiConfig,
};
