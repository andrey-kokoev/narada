export const KERNEL_CONTRACT_SCHEMA = 'narada.nars.intelligence_kernel_contract.v1';
export const KERNEL_HEALTH_SCHEMA = 'narada.nars.intelligence_kernel_health.v1';
export const KERNEL_START_EVIDENCE_SCHEMA = 'narada.nars.intelligence_kernel_start_evidence.v1';
export const NARS_EXECUTION_POLICY_SCHEMA = 'narada.nars.execution_policy.v1';
export const NARS_EXECUTION_POLICY_DEFAULT_MAX_ROUNDS = 200;
export const NARS_EXECUTION_POLICY_MIN_MAX_ROUNDS = 1;
export const NARS_EXECUTION_POLICY_MAX_MAX_ROUNDS = 500;

/** Kernel selection is deliberately not the operator-surface selection. */
export const INTELLIGENCE_KERNEL_KINDS = Object.freeze([
  'narada-native',
  'pi-sdk',
  'pi-rpc',
]);

export const OPERATOR_SURFACE_KINDS = Object.freeze([
  'agent-cli',
  'agent-tui',
  'agent-web-ui',
  'agent-pi-tui',
]);

export const RUNTIME_HOST_KINDS = Object.freeze(['narada-agent-runtime-server']);
export const KERNEL_STATES = Object.freeze([
  'created',
  'starting',
  'ready',
  'running',
  'cancelling',
  'reconfiguring',
  'recovering',
  'closed',
  'failed',
]);
export const KERNEL_TERMINAL_STATES = Object.freeze([
  'completed',
  'failed',
  'interrupted',
  'refused',
]);
export const NARS_KERNEL_EVENT_KINDS = Object.freeze([
  'kernel_provider_request_started',
  'kernel_provider_request_completed',
  'kernel_provider_telemetry',
  'kernel_failure',
  'kernel_turn_started',
  'assistant_message_stream',
  'kernel_provider_failure',
  'kernel_turn_observed',
  'kernel_cancellation_evidence',
  'pi_event_observed',
  'pi_event_unsupported',
  'pi_event_malformed',
  'pi_event_duplicate',
  'pi_tool_proxy_refused',
  'pi_tool_proxy_requested',
  'carrier_tool_requested',
  'pi_tool_proxy_result_observed',
  'carrier_tool_completed',
  'pi_compaction_evidence',
  'pi_retry_telemetry',
  'pi_artifact_reference_observed',
  'pi_artifact_registration_required',
  'pi_artifact_registered',
  'process_exit',
]);

export class NarsKernelContractError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}:${message}`);
    this.name = 'NarsKernelContractError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Normalize the NARS-owned execution policy that is snapshotted for one turn.
 * Model/provider options do not belong here; this policy only describes
 * runtime controls owned by NARS, currently the bounded carrier tool loop.
 */
export function normalizeNarsExecutionPolicy(value = null, {
  defaultMaxRounds = NARS_EXECUTION_POLICY_DEFAULT_MAX_ROUNDS,
  sourceKind = 'default',
  sourceRef = null,
  revision = 1,
  scope = 'session',
} = {}) {
  const candidate = value == null
    ? {}
    : assertPlainRecord(value, 'kernel_execution_policy_invalid', 'Execution policy must be a plain record.');
  if (candidate.schema != null && candidate.schema !== NARS_EXECUTION_POLICY_SCHEMA) {
    throw new NarsKernelContractError(
      'kernel_execution_policy_schema_invalid',
      `Execution policy schema must be '${NARS_EXECUTION_POLICY_SCHEMA}'.`,
      { schema: candidate.schema },
    );
  }
  rejectUnknownKeys(candidate, new Set([
    'schema', 'scope', 'source', 'tool_loop', 'toolLoop',
    'max_rounds', 'maxRounds', 'max_tool_rounds', 'maxToolRounds', 'revision',
  ]), 'kernel_execution_policy_field_unknown');
  const toolLoop = candidate.tool_loop ?? candidate.toolLoop ?? null;
  if (toolLoop != null) {
    assertPlainRecord(toolLoop, 'kernel_execution_policy_tool_loop_invalid', 'Execution policy tool_loop must be a plain record.');
    rejectUnknownKeys(toolLoop, new Set(['max_rounds', 'maxRounds']), 'kernel_execution_policy_tool_loop_field_unknown');
  }
  const rawMaxRounds = toolLoop?.max_rounds
    ?? toolLoop?.maxRounds
    ?? candidate.max_rounds
    ?? candidate.maxRounds
    ?? candidate.max_tool_rounds
    ?? candidate.maxToolRounds
    ?? defaultMaxRounds;
  const maxRounds = Number(rawMaxRounds);
  if (!Number.isInteger(maxRounds)
    || maxRounds < NARS_EXECUTION_POLICY_MIN_MAX_ROUNDS
    || maxRounds > NARS_EXECUTION_POLICY_MAX_MAX_ROUNDS) {
    throw new NarsKernelContractError(
      'kernel_execution_policy_max_rounds_invalid',
      `tool_loop.max_rounds must be an integer from ${NARS_EXECUTION_POLICY_MIN_MAX_ROUNDS} through ${NARS_EXECUTION_POLICY_MAX_MAX_ROUNDS}.`,
      { value: rawMaxRounds },
    );
  }
  const sourceCandidate = candidate.source;
  const source = sourceCandidate == null
    ? {}
    : typeof sourceCandidate === 'string'
      ? { kind: sourceCandidate }
      : assertPlainRecord(sourceCandidate, 'kernel_execution_policy_source_invalid', 'Execution policy source must be a plain record.');
  if (sourceCandidate != null && typeof sourceCandidate !== 'string') {
    rejectUnknownKeys(source, new Set(['kind', 'ref', 'revision']), 'kernel_execution_policy_source_field_unknown');
  }
  const normalizedScope = String(candidate.scope ?? scope ?? 'session').trim();
  if (!normalizedScope) throw new NarsKernelContractError('kernel_execution_policy_scope_invalid', 'Execution policy scope must be non-empty.');
  const normalizedSourceKind = String(source.kind ?? sourceKind ?? 'default').trim();
  if (!normalizedSourceKind) throw new NarsKernelContractError('kernel_execution_policy_source_kind_invalid', 'Execution policy source kind must be non-empty.');
  const normalizedSourceRef = source.ref ?? sourceRef ?? null;
  if (normalizedSourceRef != null && (typeof normalizedSourceRef !== 'string' || !normalizedSourceRef.trim())) {
    throw new NarsKernelContractError('kernel_execution_policy_source_ref_invalid', 'Execution policy source ref must be a non-empty string when present.');
  }
  const normalizedRevision = source.revision ?? candidate.revision ?? revision ?? 1;
  if (!(Number.isInteger(normalizedRevision) && normalizedRevision >= 1)
    && !(typeof normalizedRevision === 'string' && normalizedRevision.trim())) {
    throw new NarsKernelContractError('kernel_execution_policy_revision_invalid', 'Execution policy revision must be a positive integer or non-empty string.');
  }
  return Object.freeze({
    schema: NARS_EXECUTION_POLICY_SCHEMA,
    scope: normalizedScope,
    source: Object.freeze({
      kind: normalizedSourceKind,
      ref: normalizedSourceRef == null ? null : normalizedSourceRef.trim(),
      revision: typeof normalizedRevision === 'string' ? normalizedRevision.trim() : normalizedRevision,
    }),
    tool_loop: Object.freeze({ max_rounds: maxRounds }),
  });
}

export function assertNarsExecutionPolicy(value, options) {
  return normalizeNarsExecutionPolicy(value, options);
}

export function isIntelligenceKernelKind(value) {
  return typeof value === 'string' && INTELLIGENCE_KERNEL_KINDS.includes(value.trim());
}

export function normalizeIntelligenceKernelKind(value, { defaultKind = 'narada-native' } = {}) {
  const candidate = value == null || String(value).trim() === '' ? defaultKind : String(value).trim();
  if (!isIntelligenceKernelKind(candidate)) {
    throw new NarsKernelContractError(
      'intelligence_kernel_kind_invalid',
      `Unsupported intelligence kernel kind '${candidate}'.`,
      { candidate, admitted: [...INTELLIGENCE_KERNEL_KINDS] },
    );
  }
  return candidate;
}

export function assertIntelligenceKernelKind(value, options) {
  return normalizeIntelligenceKernelKind(value, options);
}

export function isOperatorSurfaceKind(value) {
  return typeof value === 'string' && OPERATOR_SURFACE_KINDS.includes(value.trim());
}

function assertPlainRecord(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new NarsKernelContractError(code, message);
  }
  return value;
}

function rejectUnknownKeys(value, allowed, code) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new NarsKernelContractError(code, `Undeclared NARS kernel fields: ${unknown.join(', ')}.`, { unknown });
  }
}

function optionalPlainRecord(value, code) {
  if (value == null) return {};
  return { ...assertPlainRecord(value, code, 'Expected a plain record.') };
}

function assertOptionalString(value, field, code) {
  if (value == null) return;
  if (typeof value !== 'string' || !value.trim()) {
    throw new NarsKernelContractError(code, `${field} must be a non-empty string when present.`);
  }
}

function assertOptionalPositiveInteger(value, field, code) {
  if (value == null) return;
  if (!Number.isInteger(value) || value < 1) {
    throw new NarsKernelContractError(code, `${field} must be a positive integer when present.`);
  }
}

function assertCorrelationFields(value, codePrefix = 'kernel_correlation') {
  for (const field of [
    'turn_id',
    'input_id',
    'input_event_id',
    'runtime_request_id',
    'idempotency_key',
    'correlation_key',
    'event_id',
    'pi_event_id',
    'pi_event_kind',
    'tool_call_id',
  ]) {
    assertOptionalString(value?.[field], field, `${codePrefix}_${field}_invalid`);
  }
  assertOptionalPositiveInteger(value?.turn_attempt, 'turn_attempt', `${codePrefix}_turn_attempt_invalid`);
  assertOptionalPositiveInteger(value?.provider_request_attempt, 'provider_request_attempt', `${codePrefix}_provider_request_attempt_invalid`);
}

function normalizeMessage(value, index) {
  const message = assertPlainRecord(value, 'kernel_message_invalid', `Message ${index} must be a plain record.`);
  rejectUnknownKeys(message, new Set(['id', 'role', 'content', 'name', 'tool_calls', 'tool_call_id', 'timestamp']), 'kernel_message_field_unknown');
  const role = String(message.role ?? '').trim();
  if (!role) throw new NarsKernelContractError('kernel_message_role_required', `Message ${index} requires role.`);
  if (message.tool_calls != null && !Array.isArray(message.tool_calls)) {
    throw new NarsKernelContractError('kernel_message_tool_calls_invalid', `Message ${index} tool_calls must be an array.`);
  }
  return {
    ...(message.id == null ? {} : { id: String(message.id) }),
    role,
    ...(Object.prototype.hasOwnProperty.call(message, 'content') ? { content: message.content } : {}),
    ...(message.name == null ? {} : { name: String(message.name) }),
    ...(message.tool_calls == null ? {} : { tool_calls: message.tool_calls.map((call) => optionalPlainRecord(call, 'kernel_tool_call_invalid')) }),
    ...(message.tool_call_id == null ? {} : { tool_call_id: String(message.tool_call_id) }),
    ...(message.timestamp == null ? {} : { timestamp: String(message.timestamp) }),
  };
}

function normalizeToolDescriptor(value, index) {
  const tool = assertPlainRecord(value, 'kernel_tool_descriptor_invalid', `Tool ${index} must be a plain record.`);
  const functionShape = assertPlainRecord(tool.function, 'kernel_tool_descriptor_function_required', `Tool ${index} requires function.`);
  rejectUnknownKeys(tool, new Set(['type', 'function', 'nars_gateway_proxy', 'capability_identity', 'authority_posture']), 'kernel_tool_descriptor_field_unknown');
  rejectUnknownKeys(functionShape, new Set(['name', 'description', 'parameters']), 'kernel_tool_function_field_unknown');
  if (tool.type !== 'function' || tool.nars_gateway_proxy !== true) {
    throw new NarsKernelContractError('kernel_tool_not_admitted_proxy', `Tool ${index} is not an explicit NARS gateway proxy.`);
  }
  const name = String(functionShape.name ?? '').trim();
  if (!name) throw new NarsKernelContractError('kernel_tool_name_required', `Tool ${index} requires function.name.`);
  return {
    type: 'function',
    function: {
      name,
      ...(functionShape.description == null ? {} : { description: String(functionShape.description) }),
      parameters: optionalPlainRecord(functionShape.parameters, 'kernel_tool_parameters_invalid'),
    },
    nars_gateway_proxy: true,
    ...(tool.capability_identity == null ? {} : { capability_identity: String(tool.capability_identity) }),
    ...(tool.authority_posture == null ? {} : { authority_posture: String(tool.authority_posture) }),
  };
}

export function assertNarsKernelStartContext(context) {
  assertPlainRecord(context, 'kernel_start_context_invalid', 'Kernel start context must be a plain record.');
  rejectUnknownKeys(context, new Set(['session_id', 'sessionId', 'agent_id', 'agentId', 'runtime_context', 'provider', 'model', 'thinking', 'tools', 'execution_policy', 'executionPolicy']), 'kernel_start_context_field_unknown');
  const sessionId = String(context.session_id ?? context.sessionId ?? '').trim();
  if (!sessionId) {
    throw new NarsKernelContractError('kernel_session_id_required', 'Kernel start requires a NARS session id.');
  }
  const agentId = String(context.agent_id ?? context.agentId ?? '').trim();
  if (!agentId) {
    throw new NarsKernelContractError('kernel_agent_id_required', 'Kernel start requires a Narada agent id.');
  }
  return {
    ...context,
    session_id: sessionId,
    agent_id: agentId,
    execution_policy: normalizeNarsExecutionPolicy(context.execution_policy ?? context.executionPolicy, {
      sourceKind: 'default',
    }),
  };
}

export function assertNarsAdmittedTurn(turn) {
  assertPlainRecord(turn, 'kernel_turn_invalid', 'An admitted turn must be a plain record.');
  rejectUnknownKeys(turn, new Set([
    'turn_id', 'turnId', 'input_id', 'input_event_id', 'inputEventId', 'runtime_request_id',
    'runtimeRequestId', 'request_id', 'requestId', 'idempotency_key', 'idempotencyKey',
    'turn_attempt', 'turnAttempt', 'attempt', 'messages', 'tools', 'settings',
    'provider_invocation', 'provider_request_attempt', 'providerRequestAttempt', 'abortSignal',
    'metadata', 'authority_posture', 'admission_evidence', 'execution_evidence', 'correlation_key',
    'execution_policy', 'executionPolicy',
  ]), 'kernel_turn_field_unknown');
  const turnId = String(turn.turn_id ?? turn.turnId ?? '').trim();
  if (!turnId) throw new NarsKernelContractError('kernel_turn_id_required', 'An admitted turn requires turn_id.');
  const inputId = String(turn.input_id ?? turn.input_event_id ?? turn.inputEventId ?? turnId).trim();
  const inputEventId = String(turn.input_event_id ?? inputId ?? turnId).trim() || inputId || turnId;
  const runtimeRequestId = String(
    turn.runtime_request_id
      ?? turn.runtimeRequestId
      ?? turn.request_id
      ?? turn.requestId
      ?? '',
  ).trim() || null;
  const idempotencyKey = String(
    turn.idempotency_key
      ?? turn.idempotencyKey
      ?? '',
  ).trim() || null;
  const requestedAttempt = Number(turn.turn_attempt ?? turn.turnAttempt ?? turn.attempt ?? 1);
  const turnAttempt = Number.isFinite(requestedAttempt) && requestedAttempt >= 1
    ? Math.max(1, Math.trunc(requestedAttempt))
    : (() => { throw new NarsKernelContractError('kernel_turn_attempt_invalid', 'turn_attempt must be a positive integer.'); })();
  if (turn.messages != null && !Array.isArray(turn.messages)) {
    throw new NarsKernelContractError('kernel_messages_invalid', 'An admitted turn messages field must be an array.');
  }
  if (turn.tools != null && !Array.isArray(turn.tools)) {
    throw new NarsKernelContractError('kernel_tools_invalid', 'An admitted turn tools field must be an array.');
  }
  if (turn.provider_invocation != null) assertPlainRecord(turn.provider_invocation, 'kernel_provider_invocation_invalid', 'provider_invocation must be a plain record.');
  const providerRequestAttempt = turn.provider_request_attempt ?? turn.providerRequestAttempt;
  if (providerRequestAttempt != null) {
    const normalizedProviderRequestAttempt = Number(providerRequestAttempt);
    if (!Number.isInteger(normalizedProviderRequestAttempt) || normalizedProviderRequestAttempt < 1) {
      throw new NarsKernelContractError('kernel_provider_request_attempt_invalid', 'provider_request_attempt must be a positive integer.');
    }
  }
  assertCorrelationFields({
    turn_id: turnId,
    input_id: inputId || turnId,
    input_event_id: inputEventId,
    runtime_request_id: runtimeRequestId,
    idempotency_key: idempotencyKey,
    correlation_key: turn.correlation_key,
    turn_attempt: turnAttempt,
    provider_request_attempt: providerRequestAttempt == null ? null : Number(providerRequestAttempt),
  }, 'kernel_turn_correlation');
  return {
    turn_id: turnId,
    input_id: inputId || turnId,
    input_event_id: inputEventId,
    runtime_request_id: runtimeRequestId,
    idempotency_key: idempotencyKey,
    turn_attempt: turnAttempt,
    messages: Array.isArray(turn.messages) ? turn.messages.map(normalizeMessage) : [],
    tools: Array.isArray(turn.tools) ? turn.tools.map(normalizeToolDescriptor) : [],
    settings: optionalPlainRecord(turn.settings, 'kernel_settings_invalid'),
    execution_policy: normalizeNarsExecutionPolicy(turn.execution_policy ?? turn.executionPolicy, {
      sourceKind: 'default',
    }),
    ...(turn.provider_invocation == null ? {} : { provider_invocation: { ...turn.provider_invocation } }),
    ...(turn.provider_request_attempt == null && turn.providerRequestAttempt == null ? {} : {
      provider_request_attempt: Number(turn.provider_request_attempt ?? turn.providerRequestAttempt),
    }),
    ...(turn.abortSignal == null ? {} : { abortSignal: turn.abortSignal }),
    ...(turn.metadata == null ? {} : { metadata: optionalPlainRecord(turn.metadata, 'kernel_metadata_invalid') }),
    ...(turn.authority_posture == null ? {} : { authority_posture: String(turn.authority_posture) }),
    ...(turn.admission_evidence == null ? {} : { admission_evidence: optionalPlainRecord(turn.admission_evidence, 'kernel_admission_evidence_invalid') }),
    ...(turn.execution_evidence == null ? {} : { execution_evidence: optionalPlainRecord(turn.execution_evidence, 'kernel_execution_evidence_invalid') }),
    ...(turn.correlation_key == null ? {} : { correlation_key: String(turn.correlation_key) }),
  };
}

/**
 * The carrier owns the tool loop for every intelligence implementation. A
 * kernel adapter may translate this round for its substrate, but it may not
 * create a second authority for messages, tools, or tool outcomes.
 */
export const NARS_TOOL_ROUND_SCHEMA = 'narada.nars.tool_round.v1';
export const NARS_TOOL_LOOP_OWNER = 'nars-session-core-carrier';

export function createNarsToolRound({
  turn,
  messages = null,
  tools = null,
  capabilityGateway,
  abortSignal = null,
  providerRequestAttempt = null,
} = {}) {
  const sourceTurn = assertNarsAdmittedTurn({
    ...(turn && typeof turn === 'object' ? turn : {}),
    messages: messages ?? turn?.messages ?? [],
    tools: tools ?? turn?.tools ?? [],
    ...(providerRequestAttempt == null ? {} : { provider_request_attempt: providerRequestAttempt }),
  });
  assertNarsKernelCapabilityGateway(capabilityGateway);
  const attempt = sourceTurn.provider_request_attempt ?? null;
  return Object.freeze({
    schema: NARS_TOOL_ROUND_SCHEMA,
    owner: NARS_TOOL_LOOP_OWNER,
    turn_id: sourceTurn.turn_id,
    input_id: sourceTurn.input_id,
    input_event_id: sourceTurn.input_event_id,
    turn_attempt: sourceTurn.turn_attempt,
    provider_request_attempt: attempt,
    execution_policy: sourceTurn.execution_policy,
    messages: Object.freeze([...sourceTurn.messages]),
    tools: Object.freeze([...sourceTurn.tools]),
    abort_signal: abortSignal,
    capability_gateway: capabilityGateway,
    tool_loop: Object.freeze({
      schema: NARS_TOOL_ROUND_SCHEMA,
      owner: NARS_TOOL_LOOP_OWNER,
      result_authority: 'nars-capability-gateway',
      terminal_authority: 'nars-session-core',
      execution_policy: sourceTurn.execution_policy,
    }),
  });
}

export function assertNarsAdmittedInput(input) {
  assertPlainRecord(input, 'kernel_input_invalid', 'An admitted input must be a plain record.');
  rejectUnknownKeys(input, new Set(['input_id', 'input_event_id', 'idempotency_key', 'turn_id', 'content', 'metadata', 'authority_posture', 'admission_evidence', 'correlation_key']), 'kernel_input_field_unknown');
  const inputId = String(input.input_id ?? input.input_event_id ?? '').trim();
  if (!inputId) throw new NarsKernelContractError('kernel_input_id_required', 'An admitted input requires input_id.');
  return {
    input_id: inputId,
    ...(input.input_event_id == null ? {} : { input_event_id: String(input.input_event_id) }),
    ...(input.idempotency_key == null ? {} : { idempotency_key: String(input.idempotency_key) }),
    ...(input.turn_id == null ? {} : { turn_id: String(input.turn_id) }),
    ...(Object.prototype.hasOwnProperty.call(input, 'content') ? { content: input.content } : {}),
    ...(input.metadata == null ? {} : { metadata: optionalPlainRecord(input.metadata, 'kernel_input_metadata_invalid') }),
    ...(input.authority_posture == null ? {} : { authority_posture: String(input.authority_posture) }),
    ...(input.admission_evidence == null ? {} : { admission_evidence: optionalPlainRecord(input.admission_evidence, 'kernel_input_admission_evidence_invalid') }),
    ...(input.correlation_key == null ? {} : { correlation_key: String(input.correlation_key) }),
  };
}

export function assertNarsKernelCapabilityGateway(gateway) {
  assertPlainRecord(gateway, 'kernel_gateway_invalid', 'A capability gateway must be a plain record.');
  if (typeof gateway.toolCatalog !== 'function' || typeof gateway.invoke !== 'function' || typeof gateway.close !== 'function') {
    throw new NarsKernelContractError(
      'kernel_gateway_incomplete',
      'A capability gateway requires toolCatalog, invoke, and close methods.',
    );
  }
  return gateway;
}

export function assertNarsKernelEventSink(eventSink) {
  if (typeof eventSink !== 'function') {
    throw new NarsKernelContractError('kernel_event_sink_required', 'Kernel execution requires an event sink.');
  }
  return async (event) => {
    assertPlainRecord(event, 'kernel_event_invalid', 'Kernel events must be plain records.');
    const kind = String(event.kind ?? '').trim();
    if (!NARS_KERNEL_EVENT_KINDS.includes(kind)) {
      throw new NarsKernelContractError('kernel_event_kind_invalid', `Undeclared kernel event kind '${kind}'.`, { kind });
    }
    if (event.sequence != null && (!Number.isInteger(event.sequence) || event.sequence < 1)) {
      throw new NarsKernelContractError('kernel_event_sequence_invalid', 'Kernel event sequence must be a positive integer.');
    }
    if (event.terminal_state != null && !KERNEL_TERMINAL_STATES.includes(event.terminal_state)) {
      throw new NarsKernelContractError('kernel_event_terminal_state_invalid', `Undeclared terminal state '${event.terminal_state}'.`);
    }
    if (event.source_event != null) assertPlainRecord(event.source_event, 'kernel_event_source_invalid', 'Kernel source_event must be a plain record.');
    if (event.error != null) assertPlainRecord(event.error, 'kernel_event_error_invalid', 'Kernel error must be a plain record.');
    assertCorrelationFields(event, 'kernel_event_correlation');
    return eventSink(event);
  };
}

export function isKernelTerminalState(value) {
  return KERNEL_TERMINAL_STATES.includes(value);
}

export function buildKernelHealthProjection({
  kernelKind,
  kernelVersion = '0.1.0',
  provider = null,
  model = null,
  thinking = null,
  kernelState = 'created',
  activeTurnId = null,
  providerStreaming = false,
  compactionState = 'idle',
  retryState = 'idle',
  continuationStatePresent = false,
  capabilityProfile = null,
  lastKernelError = null,
  piVersion = null,
  piMode = null,
  supportedCapabilities = [],
  supportedProviderFeatures = [],
  supportedThinkingLevels = [],
  executionPolicy = null,
  toolPostureVersion = 'nars-gateway-only.v1',
  eventAdapterVersion = 'nars-pi-events.v1',
  sessionPosture = 'nars-journal-canonical.v1',
  ambientResourceIsolation = 'strict',
} = {}) {
  const kind = normalizeIntelligenceKernelKind(kernelKind);
  if (!KERNEL_STATES.includes(kernelState)) {
    throw new NarsKernelContractError('kernel_state_invalid', `Unsupported kernel state '${kernelState}'.`);
  }
  return Object.freeze({
    schema: KERNEL_HEALTH_SCHEMA,
    kernel_kind: kind,
    kernel_version: kernelVersion,
    pi_version: piVersion,
    pi_mode: piMode,
    provider,
    model,
    thinking,
    execution_policy: normalizeNarsExecutionPolicy(executionPolicy, { sourceKind: 'default' }),
    kernel_state: kernelState,
    active_turn_id: activeTurnId,
    provider_streaming: Boolean(providerStreaming),
    compaction_state: compactionState,
    retry_state: retryState,
    continuation_state_present: Boolean(continuationStatePresent),
    capability_profile: capabilityProfile,
    last_kernel_error: lastKernelError,
    supported_capabilities: Object.freeze([...supportedCapabilities]),
    supported_provider_features: Object.freeze([...supportedProviderFeatures]),
    supported_thinking_levels: Object.freeze([...supportedThinkingLevels]),
    tool_posture_version: toolPostureVersion,
    event_adapter_version: eventAdapterVersion,
    session_posture: sessionPosture,
    ambient_resource_isolation: ambientResourceIsolation,
  });
}

export function buildKernelStartEvidence({
  kernelKind,
  kernelVersion = '0.1.0',
  piVersion = null,
  piMode = null,
  capabilities = [],
  providerFeatures = [],
  thinkingLevels = [],
  toolPostureVersion = 'nars-gateway-only.v1',
  eventAdapterVersion = 'nars-pi-events.v1',
  sessionPosture = 'nars-journal-canonical.v1',
  ambientResourceIsolation = 'strict',
  sessionId,
  startedAt = new Date().toISOString(),
} = {}) {
  const kind = normalizeIntelligenceKernelKind(kernelKind);
  return Object.freeze({
    schema: KERNEL_START_EVIDENCE_SCHEMA,
    kernel_kind: kind,
    kernel_version: kernelVersion,
    pi_version: piVersion,
    pi_mode: piMode,
    supported_capabilities: Object.freeze([...capabilities]),
    supported_provider_features: Object.freeze([...providerFeatures]),
    supported_thinking_levels: Object.freeze([...thinkingLevels]),
    tool_posture_version: toolPostureVersion,
    event_adapter_version: eventAdapterVersion,
    session_posture: sessionPosture,
    ambient_resource_isolation: ambientResourceIsolation,
    session_id: sessionId ?? null,
    started_at: startedAt,
  });
}
