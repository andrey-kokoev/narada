/**
 * Small internal session shape used when the optional Pi SDK is not installed.
 * It is deliberately memory-only and receives a provider invoker selected by
 * NARS; it cannot create a session identity or write a session file.
 */

function admittedModelOptions(input: any = {}) {
  const invocation: any = input.provider_invocation && typeof input.provider_invocation === 'object'
    ? input.provider_invocation
    : {};
  const plan: any = invocation.plan && typeof invocation.plan === 'object' ? invocation.plan : {};
  const selected: any = plan.selected && typeof plan.selected === 'object' ? plan.selected : {};
  const selectedProvider: any = selected.inference_provider ?? selected.inferenceProvider;
  const selectedModel: any = selected.model;
  const offering: any = invocation.offering && typeof invocation.offering === 'object' ? invocation.offering : {};
  const selectedOffering: any = plan.route?.offering && typeof plan.route.offering === 'object'
    ? plan.route.offering
    : {};
  const modelResource: any = invocation.model && typeof invocation.model === 'object' ? invocation.model : {};
  const model: any = typeof offering.invocation_model_key === 'string' && offering.invocation_model_key.trim()
    ? offering.invocation_model_key.trim()
    : typeof invocation.invocation_model_key === 'string' && invocation.invocation_model_key.trim()
      ? invocation.invocation_model_key.trim()
      : typeof selectedModel?.id === 'string' && selectedModel.id.trim()
        ? selectedModel.id.replace(/^model:/, '').trim()
        : typeof modelResource.id === 'string' && modelResource.id.trim()
          ? modelResource.id.replace(/^model:/, '').trim()
    : typeof input.model === 'string' && input.model.trim()
      ? input.model.trim()
      : null;
  const provider: any = typeof invocation.inferenceProvider?.id === 'string' && invocation.inferenceProvider.id.trim()
    ? invocation.inferenceProvider.id.trim()
    : typeof selectedProvider?.id === 'string' && selectedProvider.id.trim()
      ? selectedProvider.id.trim()
      : typeof invocation.provider === 'string' && invocation.provider.trim()
        ? invocation.provider.trim()
        : typeof input.provider === 'string' && input.provider.trim()
      ? input.provider.trim()
      : null;
  const thinking: any = typeof plan.options?.thinking === 'string' && plan.options.thinking.trim()
    ? plan.options.thinking.trim()
    : typeof input.thinking === 'string' && input.thinking.trim()
      ? input.thinking.trim()
      : null;
  return {
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(thinking ? { thinking } : {}),
    ...(selectedOffering.id ? { offering_id: selectedOffering.id } : {}),
  };
}

export function resolveAdmittedPiModelOptions(input: any = {}) {
  return admittedModelOptions(input);
}

function admittedInputText(input: any = {}) {
  const content: any = input.content ?? input.text ?? input.message ?? input.input;
  if (typeof content === 'string') return content;
  if (content == null) return '';
  return JSON.stringify(content);
}

function messageText(message: any) {
  if (typeof message === 'string') return message;
  if (!message || typeof message !== 'object') return '';
  const content: any = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => typeof part === 'string' ? part : part?.type === 'text' ? part.text : '')
      .filter(Boolean)
      .join('');
  }
  return '';
}

function toExternalPiMessage(message: any) {
  if (typeof message === 'string') {
    return { role: 'user', content: message, timestamp: Date.now() };
  }
  if (!message || typeof message !== 'object') return null;
  const role: any = String(message.role ?? '').trim();
  if (role === 'system') return null;
  if (role === 'user') {
    return {
      role: 'user',
      content: typeof message.content === 'string' || Array.isArray(message.content)
        ? structuredClone(message.content)
        : messageText(message),
      timestamp: Number.isFinite(Number(message.timestamp)) ? Number(message.timestamp) : Date.now(),
    };
  }
  if (role === 'assistant') {
    const content: any = Array.isArray(message.content)
      ? structuredClone(message.content)
      : [{ type: 'text', text: messageText(message) }];
    const toolCalls: any = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    for (const toolCall of toolCalls) {
      const name: any = toolCall?.function?.name ?? toolCall?.name;
      if (!name) continue;
      let argumentsValue: any = toolCall?.function?.arguments ?? toolCall?.arguments ?? {};
      if (typeof argumentsValue === 'string') {
        try { argumentsValue = JSON.parse(argumentsValue); } catch { argumentsValue = {}; }
      }
      content.push({
        type: 'toolCall',
        id: toolCall.id ?? `${name}:${content.length}`,
        name,
        arguments: argumentsValue && typeof argumentsValue === 'object' ? argumentsValue : {},
      });
    }
    return {
      role: 'assistant',
      content,
      api: message.api ?? 'narada',
      provider: message.provider ?? 'narada',
      model: message.model ?? 'admitted',
      usage: message.usage ?? {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: message.stopReason ?? 'stop',
      ...(message.errorMessage ? { errorMessage: String(message.errorMessage) } : {}),
      timestamp: Number.isFinite(Number(message.timestamp)) ? Number(message.timestamp) : Date.now(),
    };
  }
  if (role === 'tool' || role === 'toolResult') {
    return {
      role: 'toolResult',
      toolCallId: message.toolCallId ?? message.tool_call_id ?? 'nars-tool-call',
      toolName: message.toolName ?? message.tool_name ?? 'nars-tool',
      content: [{ type: 'text', text: messageText(message) || JSON.stringify(message.content ?? null) }],
      details: message.details,
      isError: message.isError === true,
      timestamp: Number.isFinite(Number(message.timestamp)) ? Number(message.timestamp) : Date.now(),
    };
  }
  return null;
}

export function createInMemoryPiSession({ providerInvoker, sessionId, eventSink = async () => {} }: any = {}) {
  if (typeof providerInvoker !== 'function') throw new Error('pi_provider_invoker_required');
  let closed: any = false;
  let active: any = null;
  const continuation: any = [];
  return Object.freeze({
    sessionId,
    async start() { return { session_id: sessionId, storage: 'in-memory-derived-continuation' }; },
    async runTurn(input: any = {}) {
      if (closed) throw new Error('pi_session_closed');
      const controller: any = new AbortController();
      active = controller;
      try {
        await eventSink({ kind: 'assistant_token', sequence: 1, id: `pi-token:${input.turn_id ?? 'turn'}:1`, content: null, done: false });
        const admittedProviderInvoker: any = typeof input.providerInvoker === 'function'
          ? input.providerInvoker
          : providerInvoker;
        const outcome: any = await runCompatibilityToolLoop({
          providerInvoker: admittedProviderInvoker,
          input,
          controller,
        });
        if (outcome?.response) continuation.push({ role: 'assistant', content: outcome.response?.choices?.[0]?.message?.content ?? outcome.response?.content ?? null });
        return outcome;
      } finally {
        active = null;
      }
    },
    async steer(input: any) {
      if (closed) return { accepted: false, reason: 'pi_session_closed', input_id: input?.input_id ?? null };
      return { accepted: false, reason: 'steering_requires_nars_admitted_turn', input_id: input?.input_id ?? null };
    },
    async cancel(reason: any = 'cancel_requested') {
      active?.abort(reason);
      return { requested: Boolean(active), reason };
    },
    async reconfigure(config: any) {
      if (closed) throw new Error('pi_session_closed');
      return { active: { provider: config?.provider ?? null, model: config?.model ?? null, thinking: config?.thinking ?? null } };
    },
    async close() { closed = true; active?.abort('pi_session_closed'); active = null; },
    continuation: () => continuation.map((message: any) => structuredClone(message)),
  });
}

function externalToolName(tool: any) {
  return String(tool?.function?.name ?? tool?.name ?? tool?.tool_name ?? '').trim();
}

function externalToolParameters(tool: any) {
  return tool?.function?.parameters
    ?? tool?.function?.input_schema
    ?? tool?.parameters
    ?? tool?.input_schema
    ?? { type: 'object', properties: {} };
}

function safeToolResultText(value: any) {
  try {
    const serialized: any = JSON.stringify(value ?? null);
    return serialized.length <= 1024 * 1024 ? serialized : `${serialized.slice(0, 1024 * 1024)}...[truncated]`;
  } catch {
    return JSON.stringify({ status: 'failed', error: 'tool_result_not_serializable' });
  }
}

function isProviderResponse(value: any) {
  return Boolean(value && typeof value === 'object' && (
    Array.isArray(value.choices)
    || value.role === 'assistant'
    || Object.prototype.hasOwnProperty.call(value, 'content')
  ));
}

function assistantMessageContent(message: any) {
  if (!message || typeof message !== 'object') return null;
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return null;
  return message.content
    .map((part: any) => typeof part === 'string' ? part : part?.type === 'text' ? part.text : '')
    .filter(Boolean)
    .join('') || null;
}

function providerResponseFromAssistantMessage(message: any) {
  if (!message || typeof message !== 'object') return null;
  return {
    choices: [{ message: {
      role: message.role ?? 'assistant',
      content: assistantMessageContent(message),
      ...(Array.isArray(message.tool_calls) ? { tool_calls: structuredClone(message.tool_calls) } : {}),
    } }],
  };
}

function providerResponseValue(value: any) {
  if (value?.response && isProviderResponse(value.response)) return value.response;
  if (isProviderResponse(value)) return value;
  return null;
}

function providerAssistantMessage(value: any) {
  const response: any = providerResponseValue(value);
  if (!response) return null;
  const choiceMessage: any = response.choices?.[0]?.message;
  if (choiceMessage && typeof choiceMessage === 'object') return choiceMessage;
  if (response.message && typeof response.message === 'object') return response.message;
  if (response.role === 'assistant') return response;
  return null;
}

function providerToolCalls(value: any) {
  const response: any = providerResponseValue(value);
  const message: any = providerAssistantMessage(value);
  const calls: any = message?.tool_calls ?? response?.tool_calls ?? [];
  return Array.isArray(calls) ? calls : [];
}

function providerToolCallName(toolCall: any) {
  return String(toolCall?.function?.name ?? toolCall?.name ?? toolCall?.tool_name ?? '').trim();
}

function providerToolCallArguments(toolCall: any) {
  const raw: any = toolCall?.function?.arguments ?? toolCall?.arguments ?? toolCall?.input ?? {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { value: raw, valid: true };
  if (typeof raw !== 'string') return { value: {}, valid: false };
  try {
    const parsed: any = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { value: parsed, valid: true }
      : { value: {}, valid: false };
  } catch {
    return { value: {}, valid: false };
  }
}

function compatibilityToolLoopMaxRounds(input: any) {
  const candidates: any[] = [
    input?.tool_loop?.execution_policy?.tool_loop?.max_rounds,
    input?.execution_policy?.tool_loop?.max_rounds,
    input?.tool_loop?.max_rounds,
  ];
  const candidate: any = candidates.find((value: any) => Number.isInteger(Number(value)));
  const maxRounds: any = Number(candidate ?? 32);
  return maxRounds >= 1 && maxRounds <= 500 ? maxRounds : 32;
}

function compatibilityToolResultText(result: any) {
  if (Array.isArray(result?.content)) {
    const text: any = result.content
      .map((part: any) => typeof part === 'string' ? part : part?.type === 'text' ? part.text : '')
      .filter(Boolean)
      .join('');
    if (text) return text;
  }
  return safeToolResultText(result);
}

function compatibilityInvalidArgumentsResult(toolName: any, toolCallId: any) {
  return {
    schema: 'narada.nars.pi.tool-proxy-result.v1',
    status: 'denied',
    admission_action: 'deny',
    admission_reason: 'tool_arguments_invalid',
    tool_name: toolName || null,
    tool_call_id: toolCallId || null,
    effect_confirmation: 'not-confirmed',
  };
}

async function runCompatibilityToolLoop({ providerInvoker, input, controller }: any = {}) {
  const admittedProviderInvoker: any = typeof input?.providerInvoker === 'function'
    ? input.providerInvoker
    : providerInvoker;
  const capabilityGateway: any = input?.capability_gateway ?? input?.capabilityGateway ?? null;
  const descriptors: any[] = Array.isArray(input?.tools) ? input.tools : [];
  const toolsByName: any = new Map(descriptors.map((tool: any) => [externalToolName(tool), tool]));
  const projectedMessages: any[] = Array.isArray(input?.messages) ? structuredClone(input.messages) : [];
  const maxRounds: any = compatibilityToolLoopMaxRounds(input);
  let outcome: any = await admittedProviderInvoker({
    ...input,
    abortSignal: input.abortSignal ?? controller.signal,
    messages: projectedMessages,
  });

  for (let round = 1; round <= maxRounds; round += 1) {
    if (input.abortSignal?.aborted || controller.signal.aborted) {
      throw new Error('pi_tool_loop_aborted');
    }
    const calls: any[] = providerToolCalls(outcome);
    if (calls.length === 0) return outcome;
    const assistant: any = providerAssistantMessage(outcome);
    if (assistant) {
      projectedMessages.push({
        role: 'assistant',
        content: assistant.content ?? null,
        tool_calls: structuredClone(calls),
      });
    }
    for (const [callIndex, toolCall] of calls.entries()) {
      const name: any = providerToolCallName(toolCall);
      const toolCallId: any = String(toolCall?.id ?? `${name || 'tool'}:${round}:${callIndex}`);
      const parsedArguments: any = providerToolCallArguments(toolCall);
      let result: any;
      if (!name || !parsedArguments.valid) {
        result = compatibilityInvalidArgumentsResult(name, toolCallId);
      } else if (!toolsByName.has(name)) {
        const execute: any = typeof capabilityGateway?.execute === 'function'
          ? capabilityGateway.execute.bind(capabilityGateway)
          : typeof capabilityGateway?.invoke === 'function'
            ? capabilityGateway.invoke.bind(capabilityGateway)
            : null;
        result = execute
          ? await execute({
            toolName: name,
            tool_name: name,
            arguments: parsedArguments.value,
            toolCallId,
            tool_call_id: toolCallId,
            abortSignal: input.abortSignal ?? controller.signal,
          })
          : { status: 'failed', admission_reason: 'pi_capability_gateway_required', tool_name: name, tool_call_id: toolCallId };
      } else {
        const proxy: any = buildExternalPiTool(toolsByName.get(name), input, capabilityGateway);
        result = await proxy.execute(toolCallId, parsedArguments.value, input.abortSignal ?? controller.signal);
      }
      projectedMessages.push({
        role: 'tool',
        tool_call_id: toolCallId,
        content: compatibilityToolResultText(result),
      });
    }
    outcome = await admittedProviderInvoker({
      ...input,
      abortSignal: input.abortSignal ?? controller.signal,
      messages: projectedMessages,
    });
  }

  return {
    ...(outcome && typeof outcome === 'object' ? outcome : {}),
    admission: 'failed',
    transportSubmitted: outcome?.transportSubmitted ?? true,
    error: {
      code: 'pi_tool_loop_exhausted',
      message: `The NARS compatibility tool loop exceeded its admitted limit of ${maxRounds} rounds.`,
      max_rounds: maxRounds,
    },
  };
}

function createExternalResponseCollector() {
  let assistantMessage: any = null;
  let streamedText: any = '';
  return {
    observe(event: any) {
      const type: any = String(event?.type ?? event?.kind ?? '').trim();
      const message: any = event?.message;
      if (type === 'message_end' && message?.role === 'assistant') assistantMessage = message;
      if (type === 'turn_end' && event?.message?.role === 'assistant') assistantMessage = event.message;
      if (type === 'agent_end' && Array.isArray(event?.messages)) {
        const lastAssistant: any = [...event.messages].reverse().find((candidate: any) => candidate?.role === 'assistant');
        if (lastAssistant) assistantMessage = lastAssistant;
      }
      if (type === 'message_update') {
        const delta: any = event.assistantMessageEvent;
        if (delta?.type === 'text_delta' && typeof delta.delta === 'string') streamedText += delta.delta;
        if (delta?.partial?.role === 'assistant') assistantMessage = delta.partial;
      }
    },
    response() {
      if (assistantMessage) return providerResponseFromAssistantMessage(assistantMessage);
      if (streamedText) return { choices: [{ message: { role: 'assistant', content: streamedText } }] };
      return null;
    },
  };
}

function buildExternalPiTool(tool: any, input: any, capabilityGateway: any) {
  const name: any = externalToolName(tool);
  if (!name || tool?.nars_gateway_proxy !== true) throw new Error('pi_gateway_tool_required');
  const invoke: any = typeof capabilityGateway?.invoke === 'function'
    ? capabilityGateway.invoke.bind(capabilityGateway)
    : typeof capabilityGateway?.execute === 'function'
      ? capabilityGateway.execute.bind(capabilityGateway)
      : null;
  if (!invoke) throw new Error('pi_capability_gateway_required');
  const capabilityIdentity: any = tool.capability_identity ?? tool.capabilityIdentity ?? `capability:${name}`;
  return {
    name,
    label: typeof tool?.function?.description === 'string' ? tool.function.description : name,
    description: typeof tool?.function?.description === 'string' ? tool.function.description : name,
    parameters: structuredClone(externalToolParameters(tool)),
    nars_gateway_proxy: true,
    async execute(toolCallId: any, params: any, signal: any) {
      const result: any = await invoke({
        toolName: name,
        tool_name: name,
        arguments: params && typeof params === 'object' ? params : {},
        abortSignal: signal ?? input.abortSignal ?? null,
        turnId: input.turn_id ?? input.turnId ?? null,
        turn_id: input.turn_id ?? input.turnId ?? null,
        inputEventId: input.input_event_id ?? input.input_id ?? input.inputEventId ?? null,
        input_event_id: input.input_event_id ?? input.input_id ?? input.inputEventId ?? null,
        toolCallId: toolCallId ?? null,
        tool_call_id: toolCallId ?? null,
        piMessageId: input.pi_message_id ?? input.piMessageId ?? null,
        pi_message_id: input.pi_message_id ?? input.piMessageId ?? null,
        agentId: input.agent_id ?? input.agentId ?? null,
        agent_id: input.agent_id ?? input.agentId ?? null,
        sessionId: input.session_id ?? input.sessionId ?? null,
        session_id: input.session_id ?? input.sessionId ?? null,
        capabilityIdentity,
        capability_identity: capabilityIdentity,
        authorityPosture: input.authority_posture ?? 'nars-admitted',
        authority_posture: input.authority_posture ?? 'nars-admitted',
        admissionEvidence: input.admission_evidence ?? null,
        admission_evidence: input.admission_evidence ?? null,
        turnAttempt: input.turn_attempt ?? input.attempt ?? 1,
        turn_attempt: input.turn_attempt ?? input.attempt ?? 1,
      });
      return {
        content: [{ type: 'text', text: safeToolResultText(result) }],
        details: {
          narada_tool_result: result,
          effect_confirmation: 'not-confirmed',
        },
        isError: ['denied', 'failed', 'refused', 'interrupted'].includes(result?.status),
      };
    },
  };
}

function installExternalContext(session: any, input: any) {
  const messages: any = Array.isArray(input.messages) ? structuredClone(input.messages) : [];
  const state: any = session?.agent?.state;
  if (state && Array.isArray(state.messages)) {
    // Pi's continuation is disposable. Replacing its current branch with the
    // NARS projection prevents an SDK session tree from becoming authority.
    state.messages = messages.map(toExternalPiMessage).filter(Boolean);
  }
  return messages;
}

function installExternalTools(session: any, input: any) {
  const descriptors: any = Array.isArray(input.tools) ? input.tools : [];
  const capabilityGateway: any = input.capability_gateway ?? input.capabilityGateway ?? null;
  const customTools: any = descriptors.map((tool: any) => buildExternalPiTool(tool, input, capabilityGateway));
  const state: any = session?.agent?.state;
  if (state && Array.isArray(state.tools)) state.tools = customTools;
  if (typeof session.setTools === 'function') session.setTools(customTools);
  return customTools;
}

export function adaptExternalPiSession(session: any, { sessionId, eventSink = async () => {} }: any = {}) {
  if (!session || typeof session !== 'object') throw new Error('pi_external_session_invalid');
  const run: any = typeof session.runTurn === 'function'
    ? (input: any) => {
      installExternalContext(session, input);
      installExternalTools(session, input);
      return session.runTurn(input);
    }
    : typeof session.prompt === 'function'
      ? async (input: any) => {
        const messages: any = installExternalContext(session, input);
        const customTools: any = installExternalTools(session, input);
        const latestUser: any = [...messages].reverse().find((message: any) => {
          if (typeof message === 'string') return true;
          return message?.role === 'user';
        });
        const prompt: any = messageText(latestUser);
        const canContinue: any = messages.length > 0 && !latestUser && typeof session.agent?.continue === 'function';
        const operation: any = canContinue
          ? () => session.agent.continue()
          : () => session.prompt(prompt, {
            messages,
            tools: customTools.map((tool: any) => tool.name),
            customTools,
            noTools: customTools.length === 0 ? 'all' : undefined,
            signal: input.abortSignal ?? undefined,
            ...admittedModelOptions(input),
          });
        // The pinned Pi SDK accepts an AbortSignal in tool execution, but its
        // AgentSession.prompt() options do not own the outer NARS signal. A
        // NARS cancellation must therefore abort the SDK session explicitly;
        // otherwise a slow custom tool can finish successfully after the
        // durable session has already recorded the cancel request.
        const externalAbort: any = input.abortSignal;
        let abortPromise: any = null;
        const abortSession: any = () => {
          if (abortPromise) return abortPromise;
          const abort: any = typeof session.abort === 'function'
            ? session.abort.bind(session)
            : typeof session.agent?.abort === 'function'
              ? session.agent.abort.bind(session.agent)
              : null;
          if (!abort) return null;
          abortPromise = Promise.resolve(abort('nars_abort_requested')).catch(() => {});
          return abortPromise;
        };
        const onAbort: any = () => { void abortSession(); };
        if (externalAbort?.aborted) onAbort();
        else externalAbort?.addEventListener?.('abort', onAbort, { once: true });
        try {
          return await operation();
        } finally {
          externalAbort?.removeEventListener?.('abort', onAbort);
        }
      }
      : null;
  if (!run) throw new Error('pi_external_session_run_operation_missing');
  const attachEvents: any = (collector: any) => {
    let eventTail: any = Promise.resolve();
    const receive: any = (event: any) => {
      const observed: any = event?.detail ?? event;
      collector.observe(observed);
      eventTail = eventTail.then(() => eventSink(observed));
      return eventTail;
    };
    if (typeof session.subscribe === 'function') {
      const unsubscribe: any = session.subscribe(receive);
      return { detach: typeof unsubscribe === 'function' ? unsubscribe : () => {}, wait: () => eventTail };
    }
    if (typeof session.onEvent === 'function') {
      const unsubscribe: any = session.onEvent(receive);
      return { detach: typeof unsubscribe === 'function' ? unsubscribe : () => {}, wait: () => eventTail };
    }
    if (typeof session.addEventListener === 'function') {
      const listener: any = receive;
      session.addEventListener('event', listener);
      return { detach: () => session.removeEventListener?.('event', listener), wait: () => eventTail };
    }
    return { detach: () => {}, wait: () => eventTail };
  };
  return Object.freeze({
    sessionId: sessionId ?? session.sessionId ?? null,
    async start(context: any) { return session.start?.(context) ?? { session_id: sessionId ?? null }; },
    async runTurn(input: any) {
      const collector: any = createExternalResponseCollector();
      const events: any = attachEvents(collector);
      try {
        const queued: any = Array.isArray(input?.steering) ? input.steering : [];
        for (const queuedInput of queued) {
          const method: any = queuedInput?.delivery_mode === 'follow-up' || queuedInput?.deliveryMode === 'follow-up'
            ? session.followUp
            : session.steer;
          if (typeof method === 'function') await method.call(session, admittedInputText(queuedInput));
        }
        const result: any = await run(input);
        await events.wait();
        if (result?.response !== undefined && result?.admission !== undefined) return result;
        if (result && typeof result === 'object' && result.admission !== undefined) {
          return { ...result, ...(result.response === undefined && collector.response() ? { response: collector.response() } : {}) };
        }
        const response: any = collector.response() ?? (isProviderResponse(result) ? result : result ?? undefined);
        return { admission: 'acknowledged', transportSubmitted: true, ...(response !== undefined ? { response } : {}) };
      } finally {
        events.detach();
      }
    },
    async steer(input: any = {}) {
      const text: any = admittedInputText(input);
      const method: any = input.delivery_mode === 'follow-up' || input.deliveryMode === 'follow-up'
        ? session.followUp
        : session.steer;
      if (typeof method !== 'function') return { accepted: false, reason: 'external_steer_unavailable' };
      await method.call(session, text);
      return { accepted: true, input_id: input.input_id ?? null, reason: 'pi_steer_accepted' };
    },
    async cancel(reason: any) {
      const result: any = session.cancel
        ? await session.cancel(reason)
        : session.abort
          ? await session.abort(reason)
          : { requested: false, reason: 'external_cancel_unavailable' };
      const queued: any = typeof session.clearQueue === 'function' ? session.clearQueue() : null;
      return { ...(result && typeof result === 'object' ? result : {}), ...(queued ? { queued_inputs_cancelled: (queued.steering?.length ?? 0) + (queued.followUp?.length ?? 0) } : {}) };
    },
    async reconfigure(config: any = {}) {
      if (typeof session.reconfigure === 'function') return session.reconfigure(config);
      if (config.modelObject && typeof session.setModel === 'function') await session.setModel(config.modelObject);
      else if ((config.model !== undefined || config.provider !== undefined) && typeof session.setModel !== 'function') {
        throw new Error('pi_sdk_model_reconfiguration_unavailable');
      }
      if (config.thinking && typeof session.setThinkingLevel === 'function') session.setThinkingLevel(config.thinking);
      else if (config.thinking && typeof session.setThinkingLevel !== 'function') {
        throw new Error('pi_sdk_thinking_reconfiguration_unavailable');
      }
      return { active: config };
    },
    async close() { await session.close?.(); },
    continuation: () => [],
  });
}
