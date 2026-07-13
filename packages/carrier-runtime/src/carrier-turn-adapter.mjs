/**
 * Stateless provider boundary. Session state, journals, and tool-process
 * ownership are intentionally supplied by the caller rather than retained here.
 */
export async function runTurn(context = {}, eventSink = () => {}, toolGateway = {}) {
  const callProvider = context.callProvider;
  if (typeof callProvider !== 'function') throw new Error('carrier_turn_call_provider_required');
  const maxToolRounds = normalizeMaxToolRounds(context.maxToolRounds ?? context.settings?.maxToolRounds);

  const tools = typeof toolGateway.toolCatalog === 'function'
    ? await toolGateway.toolCatalog()
    : Array.isArray(context.tools) ? context.tools : [];
  const turn = {
    turn_id: context.turnId ?? null,
    provider: context.provider ?? null,
    model: context.settings?.model ?? null,
  };
  await eventSink({ kind: 'carrier_turn_started', ...turn });
  try {
    const messages = [...(Array.isArray(context.messages) ? context.messages : [])];
    let result = null;
    for (let round = 0; round < maxToolRounds; round += 1) {
      result = await callProvider({
        messages,
        tools,
        settings: context.settings ?? {},
        abortSignal: context.abortSignal ?? null,
        turnId: context.turnId ?? null,
        inputEventId: context.inputEventId ?? null,
        invocationEventSink: eventSink,
        toolGateway,
      });
      const toolCalls = providerToolCalls(result);
      if (toolCalls.length === 0) break;
      if (typeof toolGateway.invoke !== 'function') throw new Error('carrier_turn_tool_gateway_required');
      messages.push(providerAssistantMessage(result));
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name ?? toolCall.name;
        const args = parseToolArguments(toolCall.function?.arguments ?? toolCall.arguments);
        await eventSink({ kind: 'carrier_tool_requested', ...turn, tool_name: toolName, tool_call_id: toolCall.id ?? null });
        const invocation = await toolGateway.invoke({
          toolName,
          arguments: args,
          abortSignal: context.abortSignal ?? null,
          turnId: context.turnId ?? null,
          inputEventId: context.inputEventId ?? null,
        });
        await eventSink({ kind: 'carrier_tool_completed', ...turn, tool_name: toolName, tool_call_id: toolCall.id ?? null, status: invocation?.status ?? 'unknown' });
        if (invocation?.status === 'interrupted') throw new Error('carrier_tool_interrupted');
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id ?? toolName,
          content: JSON.stringify(invocation ?? { status: 'failed', error: 'empty_tool_result' }),
        });
      }
    }
    if (providerToolCalls(result).length > 0) throw new Error(`carrier_turn_tool_round_limit_exceeded:${maxToolRounds}`);
    const assistantMessage = providerAssistantMessage(result);
    await eventSink({
      kind: 'assistant_message',
      ...turn,
      content: assistantMessage.content ?? null,
      message: assistantMessage,
    });
    await eventSink({ kind: 'carrier_turn_completed', ...turn });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await eventSink({ kind: 'carrier_turn_failed', ...turn, error: message });
    throw error;
  }
}

function providerToolCalls(result) {
  const calls = result?.choices?.[0]?.message?.tool_calls ?? result?.tool_calls ?? [];
  return Array.isArray(calls) ? calls : [];
}

function normalizeMaxToolRounds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(64, Math.max(1, Math.trunc(parsed)));
}

function providerAssistantMessage(result) {
  const message = result?.choices?.[0]?.message;
  return message && typeof message === 'object' ? message : { role: 'assistant', content: result?.content ?? null };
}

function parseToolArguments(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function createCarrierTurnAdapter({ callProvider } = {}) {
  if (typeof callProvider !== 'function') throw new Error('carrier_turn_call_provider_required');
  return Object.freeze({
    runTurn: (context, eventSink, toolGateway) => runTurn({ ...context, callProvider }, eventSink, toolGateway),
  });
}
