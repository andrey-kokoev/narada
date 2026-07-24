/**
 * Stateless intelligence-invocation boundary. Session state, journals, and tool-process
 * ownership are intentionally supplied by the caller rather than retained here.
 */
const EXECUTION_POLICY_SCHEMA = 'narada.nars.execution_policy.v1';
const DEFAULT_MAX_TOOL_ROUNDS = 200;
const MIN_MAX_TOOL_ROUNDS = 1;
const MAX_MAX_TOOL_ROUNDS = 500;

export async function runTurn(context = {}, eventSink = () => {}, toolGateway = {}) {
  const invokeIntelligence = context.invokeIntelligence;
  if (typeof invokeIntelligence !== 'function') throw new Error('carrier_turn_invoke_intelligence_required');
  const executionPolicy = resolveExecutionPolicy(context);
  const maxToolRounds = executionPolicy.tool_loop.max_rounds;

  const turn = {
    turn_id: context.turnId ?? null,
    input_event_id: context.inputEventId ?? context.input_event_id ?? null,
    runtime_request_id: context.runtimeRequestId ?? context.runtime_request_id ?? null,
    idempotency_key: context.idempotencyKey ?? context.idempotency_key ?? null,
    turn_attempt: context.turnAttempt ?? context.turn_attempt ?? 1,
    execution_policy: executionPolicy,
  };
  await eventSink({ kind: 'carrier_turn_started', ...turn });
  try {
    const tools = typeof toolGateway.toolCatalog === 'function'
      ? await toolGateway.toolCatalog()
      : Array.isArray(context.tools) ? context.tools : [];
    const messages = [...(Array.isArray(context.messages) ? context.messages : [])];
    let result = null;
    for (let round = 0; round < maxToolRounds; round += 1) {
      result = await invokeIntelligence({
        messages,
        tools,
        settings: context.settings ?? {},
        abortSignal: context.abortSignal ?? null,
        turnId: context.turnId ?? null,
        inputEventId: context.inputEventId ?? null,
        runtimeRequestId: context.runtimeRequestId ?? context.runtime_request_id ?? null,
        runtime_request_id: context.runtimeRequestId ?? context.runtime_request_id ?? null,
        idempotencyKey: context.idempotencyKey ?? context.idempotency_key ?? null,
        idempotency_key: context.idempotencyKey ?? context.idempotency_key ?? null,
        turnAttempt: context.turnAttempt ?? context.turn_attempt ?? 1,
        turn_attempt: context.turnAttempt ?? context.turn_attempt ?? 1,
        executionPolicy: executionPolicy,
        execution_policy: executionPolicy,
        invocationEventSink: eventSink,
        toolGateway,
      });
      const toolCalls = providerToolCalls(result);
      if (toolCalls.length === 0) break;
      if (typeof toolGateway.invoke !== 'function') throw new Error('carrier_turn_tool_gateway_required');
      messages.push(providerAssistantMessage(result));
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name ?? toolCall.name;
        const toolCallId = toolCall.id ?? null;
        const args = parseToolArguments(toolCall.function?.arguments ?? toolCall.arguments);
        await eventSink({ kind: 'carrier_tool_requested', ...turn, tool_name: toolName, tool_call_id: toolCallId });
        const invocation = await toolGateway.invoke({
          toolName,
          tool_name: toolName,
          arguments: args,
          abortSignal: context.abortSignal ?? null,
          turnId: context.turnId ?? null,
          turn_id: context.turnId ?? null,
          inputEventId: context.inputEventId ?? null,
          input_event_id: context.inputEventId ?? null,
          runtimeRequestId: context.runtimeRequestId ?? context.runtime_request_id ?? null,
          runtime_request_id: context.runtimeRequestId ?? context.runtime_request_id ?? null,
          idempotencyKey: context.idempotencyKey ?? context.idempotency_key ?? null,
          idempotency_key: context.idempotencyKey ?? context.idempotency_key ?? null,
          turnAttempt: context.turnAttempt ?? context.turn_attempt ?? 1,
          turn_attempt: context.turnAttempt ?? context.turn_attempt ?? 1,
          execution_policy: executionPolicy,
          toolCallId,
          tool_call_id: toolCallId,
          piMessageId: toolCall.message_id ?? toolCall.messageId ?? null,
          pi_message_id: toolCall.message_id ?? toolCall.messageId ?? null,
          capabilityIdentity: toolCall.capability_identity ?? toolCall.capabilityIdentity ?? `capability:${toolName}`,
          capability_identity: toolCall.capability_identity ?? toolCall.capabilityIdentity ?? `capability:${toolName}`,
          authorityPosture: 'nars-admitted',
          authority_posture: 'nars-admitted',
        });
        await eventSink({
          kind: 'carrier_tool_completed',
          ...turn,
          tool_name: toolName,
          tool_call_id: toolCallId,
          status: invocation?.status ?? 'unknown',
          effect_confirmation: 'not-confirmed',
        });
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
    for (const [index, chunk] of providerAssistantStream(result).entries()) {
      await eventSink({
        kind: 'assistant_message_stream',
        ...turn,
        content: chunk.content,
        done: chunk.done,
        stream_index: index,
        ...(chunk.stream_id ? { stream_id: chunk.stream_id } : {}),
      });
    }
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
    const interrupted = context.abortSignal?.aborted === true
      || error?.name === 'AbortError'
      || error?.code === 'ABORT_ERR'
      || message === 'carrier_tool_interrupted';
    const interruptionReason = context.abortSignal?.aborted
      ? context.abortSignal.reason instanceof Error
        ? context.abortSignal.reason.message
        : String(context.abortSignal.reason ?? 'abort_requested')
      : message;
    await eventSink(interrupted
      ? { kind: 'carrier_turn_interrupted', ...turn, error: `carrier_turn_aborted:${interruptionReason}`, cause: message }
      : { kind: 'carrier_turn_failed', ...turn, error: message });
    throw error;
  }
}

function providerToolCalls(result) {
  const calls = result?.choices?.[0]?.message?.tool_calls ?? result?.tool_calls ?? [];
  return Array.isArray(calls) ? calls : [];
}

function normalizeMaxToolRounds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_TOOL_ROUNDS;
  return Math.min(MAX_MAX_TOOL_ROUNDS, Math.max(MIN_MAX_TOOL_ROUNDS, Math.trunc(parsed)));
}

function snapshotExecutionPolicy(candidate, maxRounds) {
  const sourceCandidate = candidate?.source;
  const source = typeof sourceCandidate === 'string'
    ? { kind: sourceCandidate }
    : sourceCandidate && typeof sourceCandidate === 'object' && !Array.isArray(sourceCandidate)
      ? sourceCandidate
      : {};
  const rawRevision = source.revision ?? 1;
  const revision = Number.isInteger(rawRevision) && rawRevision >= 1
    ? rawRevision
    : typeof rawRevision === 'string' && rawRevision.trim()
      ? rawRevision.trim()
      : 1;
  return Object.freeze({
    schema: EXECUTION_POLICY_SCHEMA,
    scope: String(candidate?.scope ?? 'session').trim() || 'session',
    source: Object.freeze({
      kind: String(source.kind ?? 'carrier-input').trim() || 'carrier-input',
      ref: source.ref == null ? null : String(source.ref).trim() || null,
      revision,
    }),
    tool_loop: Object.freeze({ max_rounds: maxRounds }),
  });
}

function resolveExecutionPolicy(context) {
  const candidate = context.execution_policy ?? context.executionPolicy;
  if (candidate != null) {
    const maxRounds = Number(candidate?.tool_loop?.max_rounds);
    if (candidate?.schema !== EXECUTION_POLICY_SCHEMA
      || !Number.isInteger(maxRounds)
      || maxRounds < MIN_MAX_TOOL_ROUNDS
      || maxRounds > MAX_MAX_TOOL_ROUNDS) {
      throw new Error('carrier_execution_policy_invalid');
    }
    return snapshotExecutionPolicy(candidate, maxRounds);
  }
  // Compatibility is intentionally one-way: old callers may still supply
  // maxToolRounds, but the carrier turns it into an explicit snapshot and
  // never derives a model/provider option from it.
  return snapshotExecutionPolicy({
    schema: EXECUTION_POLICY_SCHEMA,
    scope: 'session',
    source: { kind: 'legacy-compatibility', ref: null, revision: 1 },
    tool_loop: { max_rounds: normalizeMaxToolRounds(context.maxToolRounds ?? context.settings?.maxToolRounds) },
  }, normalizeMaxToolRounds(context.maxToolRounds ?? context.settings?.maxToolRounds));
}

function providerAssistantMessage(result) {
  const message = result?.choices?.[0]?.message;
  return message && typeof message === 'object' ? message : { role: 'assistant', content: result?.content ?? null };
}

/**
 * Providers may return an explicit, already-admitted stream projection when
 * their transport has rendered incremental output. The provider response is
 * still the authority for the completed assistant message; these records are
 * only durable presentation evidence and never change turn admission.
 *
 * `narada_stream` is deliberately explicit rather than inferring streaming
 * from arbitrary provider fields. This keeps ordinary provider responses
 * unchanged while allowing transports and deterministic fixtures to exercise
 * the shared assistant-message upsert contract.
 */
function providerAssistantStream(result) {
  const chunks = result?.narada_stream;
  if (!Array.isArray(chunks)) return [];
  return chunks.flatMap((chunk) => {
    if (!chunk || typeof chunk !== 'object' || typeof chunk.content !== 'string') return [];
    return [{
      content: chunk.content,
      done: chunk.done === true,
      ...(typeof chunk.stream_id === 'string' && chunk.stream_id.trim()
        ? { stream_id: chunk.stream_id.trim() }
        : {}),
    }];
  });
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

export function createCarrierTurnAdapter({ invokeIntelligence } = {}) {
  if (typeof invokeIntelligence !== 'function') throw new Error('carrier_turn_invoke_intelligence_required');
  return Object.freeze({
    runTurn: (context, eventSink, toolGateway) => runTurn({ ...context, invokeIntelligence }, eventSink, toolGateway),
  });
}
