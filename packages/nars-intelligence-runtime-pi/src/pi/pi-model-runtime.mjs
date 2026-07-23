/*
 * A deliberately small ModelRuntime facade for the bundled Pi AgentSession.
 *
 * The canonical NARS provider adapter remains the only provider transport. Pi
 * receives a synthetic, admitted model descriptor and a stream facade that
 * delegates one already-admitted turn to NARS. No Pi credential lookup,
 * provider discovery, or network transport is performed here.
 */

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resourceId(value) {
  if (typeof value === 'string') return value.trim().replace(/^(?:model|inference-provider):/, '');
  if (value && typeof value === 'object') return resourceId(value.id ?? null);
  return null;
}

function modelForBinding(binding) {
  const provider = resourceId(binding?.provider);
  const model = resourceId(binding?.model);
  if (!provider || !model) return null;
  return {
    id: model,
    name: model,
    api: 'openai-completions',
    provider,
    baseUrl: 'http://nars-admitted-provider.invalid',
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };
}

function responseMessage(outcome, model) {
  const response = outcome?.response ?? outcome;
  const choice = Array.isArray(response?.choices) ? response.choices[0] : null;
  const source = choice?.message ?? (response?.role === 'assistant' ? response : null) ?? {};
  const content = [];
  if (typeof source.content === 'string' && source.content.length > 0) {
    content.push({ type: 'text', text: source.content });
  } else if (Array.isArray(source.content)) {
    for (const part of source.content) {
      if (part?.type === 'text' && typeof part.text === 'string') content.push({ type: 'text', text: part.text });
      if (part?.type === 'toolCall' && part.id && part.name) content.push({
        type: 'toolCall',
        id: String(part.id),
        name: String(part.name),
        arguments: part.arguments && typeof part.arguments === 'object' ? structuredClone(part.arguments) : {},
      });
    }
  }
  for (const toolCall of Array.isArray(source.tool_calls) ? source.tool_calls : []) {
    const name = toolCall?.function?.name ?? toolCall?.name;
    if (!name) continue;
    let argumentsValue = toolCall?.function?.arguments ?? toolCall?.arguments ?? {};
    if (typeof argumentsValue === 'string') {
      try { argumentsValue = JSON.parse(argumentsValue); } catch { argumentsValue = {}; }
    }
    content.push({
      type: 'toolCall',
      id: String(toolCall.id ?? `${name}:${content.length}`),
      name: String(name),
      arguments: argumentsValue && typeof argumentsValue === 'object' ? argumentsValue : {},
    });
  }
  if (content.length === 0) content.push({ type: 'text', text: '' });
  const stopReason = outcome?.error
    ? (outcome.error.code === 'aborted' ? 'aborted' : 'error')
    : choice?.finish_reason === 'length'
      ? 'length'
      : content.some((part) => part.type === 'toolCall')
        ? 'toolUse'
        : 'stop';
  return {
    role: 'assistant',
    content,
    api: model?.api ?? 'openai-completions',
    provider: model?.provider ?? 'nars-admitted-provider',
    model: model?.id ?? 'nars-admitted-model',
    usage: source.usage ?? {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    ...(outcome?.error ? { errorMessage: String(outcome.error.message ?? outcome.error) } : {}),
    timestamp: Date.now(),
  };
}

function createEventStream(outcomePromise, model) {
  const messagePromise = outcomePromise.then((outcome) => responseMessage(outcome, model));
  return {
    async *[Symbol.asyncIterator]() {
      const message = await messagePromise;
      let partial = { ...message, content: [] };
      yield { type: 'start', partial };
      for (const part of message.content) {
        if (part.type === 'text') {
          partial = { ...partial, content: [...partial.content, { type: 'text', text: '' }] };
          yield { type: 'text_start', contentIndex: partial.content.length - 1, partial };
          partial = {
            ...partial,
            content: partial.content.slice(0, -1).concat({ type: 'text', text: part.text }),
          };
          if (part.text) yield {
            type: 'text_delta',
            contentIndex: partial.content.length - 1,
            delta: part.text,
            partial,
          };
          yield { type: 'text_end', contentIndex: partial.content.length - 1, content: part.text, partial };
        } else if (part.type === 'toolCall') {
          partial = { ...partial, content: [...partial.content, { ...part, arguments: {} }] };
          yield { type: 'toolcall_start', contentIndex: partial.content.length - 1, partial };
          partial = { ...partial, content: partial.content.slice(0, -1).concat(part) };
          yield { type: 'toolcall_end', contentIndex: partial.content.length - 1, partial };
        }
      }
      yield {
        type: message.stopReason === 'error' || message.stopReason === 'aborted' ? 'error' : 'done',
        reason: message.stopReason,
        ...(message.stopReason === 'error' ? { error: message.errorMessage } : {}),
        message,
      };
    },
    result: async () => messagePromise,
  };
}

/** Create a NARS-owned, in-memory model runtime for the pinned Pi SDK. */
export function createNarsProjectedPiModelRuntime({ providerInvoker, getCurrentInput = () => null } = {}) {
  if (typeof providerInvoker !== 'function') throw new Error('pi_projected_provider_invoker_required');
  let binding = null;
  const runtime = {
    setAdmittedBinding(nextBinding = {}) {
      binding = {
        provider: resourceId(nextBinding.provider),
        model: resourceId(nextBinding.model),
        thinking: nonEmpty(nextBinding.thinking),
      };
    },
    getModel(provider, model) {
      const requested = { provider: resourceId(provider), model: resourceId(model) };
      if (!binding || requested.provider !== binding.provider || requested.model !== binding.model) return undefined;
      return modelForBinding(binding);
    },
    getModels(provider) {
      const model = runtime.getModel(binding?.provider, binding?.model);
      return model && (!provider || resourceId(provider) === model.provider) ? [model] : [];
    },
    getProviders() {
      const model = modelForBinding(binding);
      return model ? [{ id: model.provider, name: model.provider }] : [];
    },
    getAvailable: async () => runtime.getModels(),
    getAvailableSnapshot: () => runtime.getModels(),
    hasConfiguredAuth(provider) {
      return Boolean(binding?.provider && resourceId(provider) === binding.provider);
    },
    checkAuth(provider) {
      return runtime.hasConfiguredAuth(provider);
    },
    getAuth: async () => undefined,
    isUsingOAuth: () => false,
    streamSimple(model, context, options = {}) {
      const input = getCurrentInput() ?? {};
      const turnInvoker = typeof input.providerInvoker === 'function' ? input.providerInvoker : providerInvoker;
      const providerInput = {
        ...input,
        // The first context comes from NARS. Subsequent Pi tool turns are
        // represented only in the disposable SDK context, so prefer the
        // current Pi-projected message list once the model loop has appended
        // an assistant tool call and its gateway result. Never write that
        // continuation back as canonical NARS history here.
        messages: Array.isArray(context?.messages)
          ? context.messages
          : Array.isArray(input.messages) ? input.messages : [],
        tools: Array.isArray(input.tools) ? input.tools : [],
        provider: model?.provider ?? input.provider,
        model: model?.id ?? input.model,
        thinking: options.reasoning ?? input.thinking ?? binding?.thinking ?? null,
        abortSignal: options.signal ?? input.abortSignal ?? null,
      };
      const outcomePromise = Promise.resolve().then(() => turnInvoker(providerInput));
      return createEventStream(outcomePromise, model);
    },
    completeSimple: async (model, context, options = {}) => {
      const stream = runtime.streamSimple(model, context, options);
      return stream.result();
    },
  };
  return runtime;
}
