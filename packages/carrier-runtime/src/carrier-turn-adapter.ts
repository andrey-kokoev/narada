/**
 * Stateless intelligence-invocation boundary. Session state, journals, and tool-process
 * ownership are intentionally supplied by the caller rather than retained here.
 */

export type JsonRecord = Record<string, unknown>;

export type CarrierEventSink = (event: CarrierEvent) => Promise<unknown> | unknown;

export interface CarrierEvent extends JsonRecord {
  kind: string;
}

export interface CarrierTurnMetadata extends JsonRecord {
  turn_id: string | null | undefined;
  input_event_id: string | null | undefined;
  runtime_request_id: string | null | undefined;
  idempotency_key: string | null | undefined;
  turn_attempt: number;
  execution_policy: CarrierExecutionPolicy;
}

export interface CarrierExecutionPolicy extends JsonRecord {
  schema: string;
  scope: string;
  source: CarrierExecutionPolicySource;
  tool_loop: CarrierToolLoopPolicy;
}

export interface CarrierExecutionPolicySource extends JsonRecord {
  kind: string;
  ref: string | null;
  revision: number | string;
}

export interface CarrierToolLoopPolicy extends JsonRecord {
  max_rounds: number;
}

export interface CarrierTurnContext extends JsonRecord {
  invokeIntelligence?: CarrierInvokeIntelligence;
  turnId?: string | null;
  turn_id?: string | null;
  inputEventId?: string | null;
  input_event_id?: string | null;
  runtimeRequestId?: string | null;
  runtime_request_id?: string | null;
  idempotencyKey?: string | null;
  idempotency_key?: string | null;
  turnAttempt?: number;
  turn_attempt?: number;
  messages?: unknown[];
  tools?: unknown[];
  settings?: JsonRecord;
  abortSignal?: AbortSignal | null;
  maxToolRounds?: number;
  execution_policy?: JsonRecord | null;
  executionPolicy?: JsonRecord | null;
}

export interface CarrierInvocationRequest extends JsonRecord {
  messages: unknown[];
  tools: unknown;
  settings: JsonRecord;
  abortSignal: AbortSignal | null;
  turnId: string | null | undefined;
  inputEventId: string | null | undefined;
  runtimeRequestId: string | null | undefined;
  runtime_request_id: string | null | undefined;
  idempotencyKey: string | null | undefined;
  idempotency_key: string | null | undefined;
  turnAttempt: number;
  turn_attempt: number;
  executionPolicy: CarrierExecutionPolicy;
  execution_policy: CarrierExecutionPolicy;
  invocationEventSink: CarrierEventSink;
  toolGateway: CarrierToolGateway;
}

export type CarrierInvokeIntelligence = (
  request: CarrierInvocationRequest,
) => Promise<JsonRecord> | JsonRecord;

export interface CarrierToolInvocationRequest extends JsonRecord {
  toolName: unknown;
  tool_name: unknown;
  arguments: JsonRecord;
  abortSignal: AbortSignal | null;
  turnId: string | null | undefined;
  turn_id: string | null | undefined;
  inputEventId: string | null | undefined;
  input_event_id: string | null | undefined;
  runtimeRequestId: string | null | undefined;
  runtime_request_id: string | null | undefined;
  idempotencyKey: string | null | undefined;
  idempotency_key: string | null | undefined;
  turnAttempt: number;
  turn_attempt: number;
  execution_policy: CarrierExecutionPolicy;
  toolCallId: unknown;
  tool_call_id: unknown;
  piMessageId: unknown;
  pi_message_id: unknown;
  capabilityIdentity: string;
  capability_identity: string;
  authorityPosture: string;
  authority_posture: string;
}

export interface CarrierToolGateway {
  toolCatalog?: () => Promise<unknown> | unknown;
  invoke?: (request: CarrierToolInvocationRequest) => Promise<unknown> | unknown;
}

export interface CarrierTurnAdapterOptions {
  invokeIntelligence?: CarrierInvokeIntelligence;
}

export interface CarrierTurnAdapter {
  runTurn: (
    context?: CarrierTurnContext,
    eventSink?: CarrierEventSink,
    toolGateway?: CarrierToolGateway,
  ) => Promise<JsonRecord>;
}

const EXECUTION_POLICY_SCHEMA = 'narada.nars.execution_policy.v1';
const DEFAULT_MAX_TOOL_ROUNDS = 200;
const MIN_MAX_TOOL_ROUNDS = 1;
const MAX_MAX_TOOL_ROUNDS = 500;

export async function runTurn(
  context: CarrierTurnContext = {},
  eventSink: CarrierEventSink = async () => {},
  toolGateway: CarrierToolGateway = {},
): Promise<JsonRecord> {
  const invokeIntelligence = context.invokeIntelligence;
  if (typeof invokeIntelligence !== 'function') {
    throw new Error('carrier_turn_invoke_intelligence_required');
  }
  const executionPolicy = resolveExecutionPolicy(context);
  const maxToolRounds = executionPolicy.tool_loop.max_rounds;

  const turn: CarrierTurnMetadata = {
    turn_id: context.turnId ?? context.turn_id ?? null,
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
    let result: JsonRecord | null = null;
    for (let round = 0; round < maxToolRounds; round += 1) {
      result = await invokeIntelligence({
        messages,
        tools,
        settings: context.settings ?? {},
        abortSignal: context.abortSignal ?? null,
        turnId: context.turnId ?? context.turn_id ?? null,
        inputEventId: context.inputEventId ?? context.input_event_id ?? null,
        runtimeRequestId: context.runtimeRequestId ?? context.runtime_request_id ?? null,
        runtime_request_id: context.runtimeRequestId ?? context.runtime_request_id ?? null,
        idempotencyKey: context.idempotencyKey ?? context.idempotency_key ?? null,
        idempotency_key: context.idempotencyKey ?? context.idempotency_key ?? null,
        turnAttempt: context.turnAttempt ?? context.turn_attempt ?? 1,
        turn_attempt: context.turnAttempt ?? context.turn_attempt ?? 1,
        executionPolicy,
        execution_policy: executionPolicy,
        invocationEventSink: eventSink,
        toolGateway,
      });
      const toolCalls = providerToolCalls(result);
      if (toolCalls.length === 0) break;
      if (typeof toolGateway.invoke !== 'function') {
        throw new Error('carrier_turn_tool_gateway_required');
      }
      messages.push(providerAssistantMessage(result));
      for (const toolCall of toolCalls) {
        const functionRecord = asRecord(toolCall.function);
        const toolName = functionRecord?.name ?? toolCall.name;
        const toolCallId = toolCall.id ?? null;
        const args = parseToolArguments(functionRecord?.arguments ?? toolCall.arguments);
        await eventSink({
          kind: 'carrier_tool_requested',
          ...turn,
          tool_name: toolName,
          tool_call_id: toolCallId,
        });
        const invocation = await toolGateway.invoke({
          toolName,
          tool_name: toolName,
          arguments: args,
          abortSignal: context.abortSignal ?? null,
          turnId: context.turnId ?? context.turn_id ?? null,
          turn_id: context.turnId ?? context.turn_id ?? null,
          inputEventId: context.inputEventId ?? context.input_event_id ?? null,
          input_event_id: context.inputEventId ?? context.input_event_id ?? null,
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
          capabilityIdentity: String(
            toolCall.capability_identity
              ?? toolCall.capabilityIdentity
              ?? `capability:${String(toolName)}`,
          ),
          capability_identity: String(
            toolCall.capability_identity
              ?? toolCall.capabilityIdentity
              ?? `capability:${String(toolName)}`,
          ),
          authorityPosture: 'nars-admitted',
          authority_posture: 'nars-admitted',
        });
        const invocationRecord = asRecord(invocation);
        await eventSink({
          kind: 'carrier_tool_completed',
          ...turn,
          tool_name: toolName,
          tool_call_id: toolCallId,
          status: invocationRecord?.status ?? 'unknown',
          effect_confirmation: 'not-confirmed',
        });
        if (invocationRecord?.status === 'interrupted') {
          throw new Error('carrier_tool_interrupted');
        }
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id ?? toolName,
          content: JSON.stringify(invocation ?? { status: 'failed', error: 'empty_tool_result' }),
        });
      }
    }
    if (providerToolCalls(result).length > 0) {
      throw new Error(`carrier_turn_tool_round_limit_exceeded:${maxToolRounds}`);
    }
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
    return result as JsonRecord;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const errorRecord = asRecord(error);
    const errorName = typeof errorRecord?.name === 'string' ? errorRecord.name : null;
    const errorCode = typeof errorRecord?.code === 'string' ? errorRecord.code : null;
    const interrupted = context.abortSignal?.aborted === true
      || errorName === 'AbortError'
      || errorCode === 'ABORT_ERR'
      || message === 'carrier_tool_interrupted';
    const abortReason = context.abortSignal?.reason;
    const interruptionReason = context.abortSignal?.aborted
      ? abortReason instanceof Error
        ? abortReason.message
        : String(abortReason ?? 'abort_requested')
      : message;
    await eventSink(interrupted
      ? {
        kind: 'carrier_turn_interrupted',
        ...turn,
        error: `carrier_turn_aborted:${interruptionReason}`,
        cause: message,
      }
      : { kind: 'carrier_turn_failed', ...turn, error: message });
    throw error;
  }
}

function providerToolCalls(result: unknown): JsonRecord[] {
  const resultRecord = asRecord(result);
  const choices = resultRecord?.choices;
  const firstChoice = Array.isArray(choices) ? asRecord(choices[0]) : null;
  const message = asRecord(firstChoice?.message);
  const calls = message?.tool_calls ?? resultRecord?.tool_calls ?? [];
  return Array.isArray(calls) ? calls.filter(isRecord) : [];
}

function normalizeMaxToolRounds(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_TOOL_ROUNDS;
  return Math.min(MAX_MAX_TOOL_ROUNDS, Math.max(MIN_MAX_TOOL_ROUNDS, Math.trunc(parsed)));
}

function snapshotExecutionPolicy(candidate: JsonRecord, maxRounds: number): CarrierExecutionPolicy {
  const sourceCandidate = candidate.source;
  const source = asRecord(sourceCandidate) ?? {};
  const rawRevision = source.revision ?? 1;
  const revision = typeof rawRevision === 'number' && Number.isInteger(rawRevision) && rawRevision >= 1
    ? rawRevision
    : typeof rawRevision === 'string' && rawRevision.trim()
      ? rawRevision.trim()
      : 1;
  return Object.freeze({
    schema: EXECUTION_POLICY_SCHEMA,
    scope: String(candidate.scope ?? 'session').trim() || 'session',
    source: Object.freeze({
      kind: String(source.kind ?? 'carrier-input').trim() || 'carrier-input',
      ref: source.ref == null ? null : String(source.ref).trim() || null,
      revision,
    }),
    tool_loop: Object.freeze({ max_rounds: maxRounds }),
  });
}

function resolveExecutionPolicy(context: CarrierTurnContext): CarrierExecutionPolicy {
  const candidate = context.execution_policy ?? context.executionPolicy;
  if (candidate != null) {
    const candidateRecord = asRecord(candidate) ?? {};
    const toolLoop = asRecord(candidateRecord.tool_loop);
    const maxRounds = Number(toolLoop?.max_rounds);
    if (candidateRecord.schema !== EXECUTION_POLICY_SCHEMA
      || !Number.isInteger(maxRounds)
      || maxRounds < MIN_MAX_TOOL_ROUNDS
      || maxRounds > MAX_MAX_TOOL_ROUNDS) {
      throw new Error('carrier_execution_policy_invalid');
    }
    return snapshotExecutionPolicy(candidateRecord, maxRounds);
  }
  const maxToolRounds = normalizeMaxToolRounds(
    context.maxToolRounds ?? context.settings?.maxToolRounds,
  );
  return snapshotExecutionPolicy({
    schema: EXECUTION_POLICY_SCHEMA,
    scope: 'session',
    source: { kind: 'legacy-compatibility', ref: null, revision: 1 },
    tool_loop: { max_rounds: maxToolRounds },
  }, maxToolRounds);
}

function providerAssistantMessage(result: unknown): JsonRecord {
  const resultRecord = asRecord(result);
  const choices = resultRecord?.choices;
  const firstChoice = Array.isArray(choices) ? asRecord(choices[0]) : null;
  const message = asRecord(firstChoice?.message);
  return message ?? { role: 'assistant', content: resultRecord?.content ?? null };
}

interface CarrierAssistantStreamChunk {
  content: string;
  done: boolean;
  stream_id?: string;
}

function providerAssistantStream(result: unknown): CarrierAssistantStreamChunk[] {
  const resultRecord = asRecord(result);
  const chunks = resultRecord?.narada_stream;
  if (!Array.isArray(chunks)) return [];
  return chunks.flatMap((chunk): CarrierAssistantStreamChunk[] => {
    const chunkRecord = asRecord(chunk);
    if (!chunkRecord || typeof chunkRecord.content !== 'string') return [];
    return [{
      content: chunkRecord.content,
      done: chunkRecord.done === true,
      ...(typeof chunkRecord.stream_id === 'string' && chunkRecord.stream_id.trim()
        ? { stream_id: chunkRecord.stream_id.trim() }
        : {}),
    }];
  });
}

function parseToolArguments(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as JsonRecord
      : {};
  } catch {
    return {};
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createCarrierTurnAdapter(
  { invokeIntelligence }: CarrierTurnAdapterOptions = {},
): CarrierTurnAdapter {
  if (typeof invokeIntelligence !== 'function') {
    throw new Error('carrier_turn_invoke_intelligence_required');
  }
  return Object.freeze({
    runTurn: (
      context?: CarrierTurnContext,
      eventSink?: CarrierEventSink,
      toolGateway?: CarrierToolGateway,
    ) => runTurn(
      { ...(context ?? {}), invokeIntelligence },
      eventSink,
      toolGateway,
    ),
  });
}
