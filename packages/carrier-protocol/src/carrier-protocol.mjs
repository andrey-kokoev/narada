export const INPUT_EVENT_SCHEMA = 'narada.carrier.input_event.v1';
export const CONTROL_INPUT_EVENT_SCHEMA = 'narada.carrier.control.input_event.v1';
export const SESSION_EVENT_SCHEMA = 'narada.carrier.session_event.v1';
export const PAYLOAD_REF_SCHEMA = 'narada.carrier.payload_ref.v1';
export const PAYLOAD_POLICY_SCHEMA = 'narada.carrier.payload_policy.v1';
export const PROVIDER_REQUEST_PAYLOAD_SCHEMA = 'narada.agent_tui.provider_request_payload.v0';
export const PROVIDER_OUTPUT_PAYLOAD_SCHEMA = 'narada.agent_tui.provider_output_payload.v0';
export const TURN_TERMINAL_PAYLOAD_SCHEMA = 'narada.agent_tui.turn_terminal_payload.v0';
export const SESSION_EVENT_FIXTURE_MANIFEST_SCHEMA = 'narada.carrier.session_event_fixture_manifest.v1';
export const CANONICAL_STARTUP_COMMAND_NAME = 'agent_context_startup_sequence';
export const LEGACY_STARTUP_COMMAND_NAME = 'startup_sequence';

export const SOURCE_KINDS = Object.freeze(['operator', 'system', 'agent', 'external']);
export const TRANSPORTS = Object.freeze([
  'interactive_terminal',
  'control_jsonl',
  'startup_injection',
  'carrier_server_api',
  'test_harness',
]);
export const LEGACY_TRANSPORT_ALIASES = Object.freeze({
  agent_cli_server_api: 'carrier_server_api',
});
export const DELIVERY_MODES = Object.freeze(['admit_for_current_turn', 'admit_after_active_turn']);
export const HOLD_CONDITIONS = Object.freeze(['composer_clear_required']);
export const TURN_STATES = Object.freeze(['idle', 'active', 'interrupt_requested', 'completed', 'interrupted', 'failed']);
export const TERMINAL_TURN_STATES = Object.freeze(['completed', 'interrupted', 'failed']);
export const QUEUE_STATES = Object.freeze([
  'queued_for_turn_boundary',
  'admitted_to_turn',
  'dropped_by_operator',
  'abandoned_on_session_end',
]);
export const SESSION_EVENT_KINDS = Object.freeze([
  'input_queued_for_turn_boundary',
  'input_admitted_to_turn',
  'input_dropped_by_operator',
  'input_abandoned_on_session_end',
  'input_completed',
  'system_directive_held',
  'system_directive_released',
  'directive_receipt_recorded',
  'directive_carrier_accepted_recorded',
  'turn_started',
  'provider_request_recorded',
  'provider_text_delta_recorded',
  'provider_tool_call_requested',
  'turn_completed',
  'turn_interrupted',
  'turn_failed',
  'interrupt_requested',
  'tool_call_requested',
  'tool_result_received',
  'carrier_command_executed',
  'carrier_diagnostic_recorded',
]);

const RFC3339_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ID_PREFIXES = Object.freeze({
  input: 'input_',
  control: 'control_',
  session_event: 'session_event_',
  payload: 'payload_',
});
const STARTUP_NUDGE_PATTERN = /^(?:please\s+)?(?:run|do|start|execute)?\s*(?:the\s+)?(?:startup|start\s+up)(?:\s+sequence)?\s*$/iu;

export const CARRIER_PROTOCOL_SCHEMAS = Object.freeze({
  input_event: Object.freeze({
    schema: INPUT_EVENT_SCHEMA,
    required: Object.freeze(['schema', 'event_id', 'source_kind', 'source_id', 'transport', 'delivery_mode', 'content', 'created_at']),
    optional: Object.freeze(['hold_condition', 'authority_ref', 'directive_id', 'metadata']),
  }),
  control_input_event: Object.freeze({
    schema: CONTROL_INPUT_EVENT_SCHEMA,
    required: Object.freeze(['schema', 'control_event_id', 'input_event_id', 'written_at', 'input']),
  }),
  session_event: Object.freeze({
    schema: SESSION_EVENT_SCHEMA,
    required: Object.freeze(['schema', 'event_kind', 'event_id', 'occurred_at', 'carrier_session_id', 'agent_id', 'site_id', 'site_root', 'payload']),
  }),
  payload_ref: Object.freeze({
    schema: PAYLOAD_REF_SCHEMA,
    required: Object.freeze(['schema', 'payload_ref', 'reader_tool', 'summary']),
  }),
  payload_policy: Object.freeze({
    schema: PAYLOAD_POLICY_SCHEMA,
    required: Object.freeze(['schema', 'max_inline_chars', 'max_inline_bytes', 'sensitive_payloads_require_ref']),
  }),
  session_event_fixture_manifest: Object.freeze({
    schema: SESSION_EVENT_FIXTURE_MANIFEST_SCHEMA,
    required: Object.freeze(['schema', 'fixtures']),
  }),
});

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function nowIso() {
  return new Date().toISOString();
}

function enumIncludes(values, value) {
  return values.includes(value);
}

function isRfc3339Utc(value) {
  return typeof value === 'string' && RFC3339_UTC_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

function randomIdPart() {
  return `${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 14)}`;
}

export function createCarrierId(kind) {
  const prefix = ID_PREFIXES[kind];
  if (!prefix) throw new Error(`unknown_carrier_id_kind:${String(kind)}`);
  return `${prefix}${randomIdPart()}`;
}

export function createInputEventId() {
  return createCarrierId('input');
}

export function createControlEventId() {
  return createCarrierId('control');
}

export function createSessionEventId() {
  return createCarrierId('session_event');
}

export function createPayloadId() {
  return createCarrierId('payload');
}

export function normalizeTransport(transport) {
  if (typeof transport !== 'string') return transport;
  return LEGACY_TRANSPORT_ALIASES[transport] ?? transport;
}

export function isStartupNudge(content) {
  return typeof content === 'string' && STARTUP_NUDGE_PATTERN.test(content.trim());
}

export function startupCommandFromLaunchPacket(launchPacket = {}) {
  const command = isObject(launchPacket.startup_command) ? launchPacket.startup_command : null;
  const rawName = typeof command?.name === 'string' && command.name.length > 0
    ? command.name
    : CANONICAL_STARTUP_COMMAND_NAME;
  const name = rawName === 'startup_sequence' ? CANONICAL_STARTUP_COMMAND_NAME : rawName;
  const args = isObject(command?.arguments) ? command.arguments : {};
  return { name, arguments: args };
}

export function classifyCarrierInputIntent(event, launchPacket = {}) {
  const normalized = normalizeInputEvent(event);
  if (isStartupNudge(normalized.content)) {
    return {
      intent: 'startup_command',
      provider_dispatch_allowed: false,
      command: startupCommandFromLaunchPacket(launchPacket),
      rule: 'startup_nudge_uses_launch_packet_mcp_affordance',
    };
  }
  return {
    intent: 'provider_turn',
    provider_dispatch_allowed: true,
  };
}

export function createPayloadRef({ payload_ref, reader_tool = 'mcp_payload_show', summary }) {
  const ref = {
    schema: PAYLOAD_REF_SCHEMA,
    payload_ref: payload_ref ?? `mcp_payload:${createPayloadId()}@v1`,
    reader_tool,
    summary,
  };
  assertValidPayloadRef(ref);
  return ref;
}

export function createPayloadPolicy({
  max_inline_chars = 4000,
  max_inline_bytes = 16384,
  sensitive_payloads_require_ref = true,
} = {}) {
  const policy = {
    schema: PAYLOAD_POLICY_SCHEMA,
    max_inline_chars,
    max_inline_bytes,
    sensitive_payloads_require_ref,
  };
  assertValidPayloadPolicy(policy);
  return policy;
}

export function validatePayloadPolicy(policy) {
  const errors = [];
  if (!isObject(policy)) return ['payload_policy_not_object'];
  if (policy.schema !== PAYLOAD_POLICY_SCHEMA) errors.push(`invalid_schema:${String(policy.schema)}`);
  if (!Number.isInteger(policy.max_inline_chars) || policy.max_inline_chars < 0) errors.push('invalid_max_inline_chars');
  if (!Number.isInteger(policy.max_inline_bytes) || policy.max_inline_bytes < 0) errors.push('invalid_max_inline_bytes');
  if (typeof policy.sensitive_payloads_require_ref !== 'boolean') errors.push('invalid_sensitive_payloads_require_ref');
  return errors;
}

export function assertValidPayloadPolicy(policy) {
  const errors = validatePayloadPolicy(policy);
  if (errors.length > 0) throw new Error(`invalid_carrier_payload_policy:${errors.join(',')}`);
}

export function validatePayloadRef(ref) {
  const errors = [];
  if (!isObject(ref)) return ['payload_ref_not_object'];
  if (ref.schema !== PAYLOAD_REF_SCHEMA) errors.push(`invalid_schema:${String(ref.schema)}`);
  if (typeof ref.payload_ref !== 'string') {
    errors.push('invalid_payload_ref');
  } else if (ref.reader_tool === 'mcp_output_show') {
    if (!/^mcp_output:[A-Za-z0-9_.:-]+$/.test(ref.payload_ref)) errors.push('invalid_payload_ref');
  } else if (!/^mcp_payload:[A-Za-z0-9_.:-]+@v\d+$/.test(ref.payload_ref)) {
    errors.push('invalid_payload_ref');
  }
  if (ref.reader_tool !== 'mcp_payload_read' && ref.reader_tool !== 'mcp_payload_show' && ref.reader_tool !== 'mcp_output_show') errors.push(`invalid_reader_tool:${String(ref.reader_tool)}`);
  if (typeof ref.summary !== 'string' || ref.summary.trim().length === 0) errors.push('invalid_summary');
  return errors;
}

export function assertValidPayloadRef(ref) {
  const errors = validatePayloadRef(ref);
  if (errors.length > 0) throw new Error(`invalid_carrier_payload_ref:${errors.join(',')}`);
}

export function validateSessionEventFixtureManifest(manifest) {
  const errors = [];
  if (!isObject(manifest)) return ['session_event_fixture_manifest_not_object'];
  if (manifest.schema !== SESSION_EVENT_FIXTURE_MANIFEST_SCHEMA) errors.push(`invalid_schema:${String(manifest.schema)}`);
  if (!Array.isArray(manifest.fixtures)) {
    errors.push('invalid_fixtures');
    return errors;
  }
  const seenKinds = new Set();
  const seenFixtures = new Set();
  manifest.fixtures.forEach((entry, index) => {
    if (!isObject(entry)) {
      errors.push(`fixtures.${index}.not_object`);
      return;
    }
    if (typeof entry.event_kind !== 'string' || !enumIncludes(SESSION_EVENT_KINDS, entry.event_kind)) {
      errors.push(`fixtures.${index}.invalid_event_kind:${String(entry.event_kind)}`);
    } else if (seenKinds.has(entry.event_kind)) {
      errors.push(`fixtures.${index}.duplicate_event_kind:${entry.event_kind}`);
    } else {
      seenKinds.add(entry.event_kind);
    }
    if (typeof entry.fixture !== 'string' || entry.fixture.length === 0 || entry.fixture.includes('/') || entry.fixture.includes('\\\\') || !entry.fixture.endsWith('.json')) {
      errors.push(`fixtures.${index}.invalid_fixture`);
    } else if (seenFixtures.has(entry.fixture)) {
      errors.push(`fixtures.${index}.duplicate_fixture:${entry.fixture}`);
    } else {
      seenFixtures.add(entry.fixture);
    }
  });
  const orderedKinds = manifest.fixtures.map((entry) => isObject(entry) ? entry.event_kind : undefined);
  if (orderedKinds.length === SESSION_EVENT_KINDS.length && !orderedKinds.every((kind, index) => kind === SESSION_EVENT_KINDS[index])) {
    errors.push('fixtures.not_in_session_event_kind_order');
  }
  for (const eventKind of SESSION_EVENT_KINDS) {
    if (!seenKinds.has(eventKind)) errors.push(`fixtures.missing_event_kind:${eventKind}`);
  }
  return errors;
}

export function assertValidSessionEventFixtureManifest(manifest) {
  const errors = validateSessionEventFixtureManifest(manifest);
  if (errors.length > 0) throw new Error(`invalid_session_event_fixture_manifest:${errors.join(',')}`);
}

export function createInputEvent({
  event_id = createInputEventId(),
  source_kind,
  source_id,
  transport,
  delivery_mode,
  hold_condition = null,
  content,
  created_at = nowIso(),
  authority_ref = null,
  directive_id = null,
  metadata = {},
}) {
  const event = {
    schema: INPUT_EVENT_SCHEMA,
    event_id,
    source_kind,
    source_id,
    transport: normalizeTransport(transport),
    delivery_mode,
    hold_condition,
    content,
    created_at,
    authority_ref,
    directive_id,
    metadata,
  };
  assertValidInputEvent(event);
  return event;
}

export function validateInputEvent(event) {
  const errors = [];
  if (!isObject(event)) return ['input_event_not_object'];
  if (event.schema !== INPUT_EVENT_SCHEMA) errors.push(`invalid_schema:${String(event.schema)}`);
  for (const field of CARRIER_PROTOCOL_SCHEMAS.input_event.required) {
    if (!hasOwn(event, field)) errors.push(`missing_required_field:${field}`);
  }
  if (typeof event.event_id !== 'string' || !event.event_id.startsWith('input_')) errors.push('invalid_event_id');
  if (!enumIncludes(SOURCE_KINDS, event.source_kind)) errors.push(`invalid_source_kind:${String(event.source_kind)}`);
  if (typeof event.source_id !== 'string' || event.source_id.length === 0) errors.push('invalid_source_id');
  const normalizedTransport = normalizeTransport(event.transport);
  if (!enumIncludes(TRANSPORTS, normalizedTransport)) errors.push(`invalid_transport:${String(event.transport)}`);
  if (!enumIncludes(DELIVERY_MODES, event.delivery_mode)) errors.push(`invalid_delivery_mode:${String(event.delivery_mode)}`);
  if (event.hold_condition !== null && event.hold_condition !== undefined && !enumIncludes(HOLD_CONDITIONS, event.hold_condition)) {
    errors.push(`invalid_hold_condition:${String(event.hold_condition)}`);
  }
  if (typeof event.content !== 'string') errors.push('invalid_content');
  if (!isRfc3339Utc(event.created_at)) errors.push('invalid_created_at');
  if (event.authority_ref !== null && event.authority_ref !== undefined && typeof event.authority_ref !== 'string') errors.push('invalid_authority_ref');
  if (event.metadata !== undefined && !isObject(event.metadata)) errors.push('invalid_metadata');
  if (event.source_kind === 'agent' && event.metadata?.agent_control_input !== true) errors.push('agent_source_requires_agent_control_input_metadata');
  if (event.source_kind === 'external' && !event.metadata?.admitted_by) errors.push('external_source_requires_admitted_by_metadata');
  if (event.directive_id !== null && event.directive_id !== undefined) {
    if (typeof event.directive_id !== 'string' || event.directive_id.length === 0) errors.push('invalid_directive_id');
    const explicitOperatorDirective = event.source_kind === 'operator'
      && event.metadata?.directive_provenance?.kind === 'explicit_operator_directive_surface';
    if (event.source_kind !== 'system' && !explicitOperatorDirective) {
      errors.push('directive_id_incompatible_with_source');
    }
    if (!event.authority_ref && !event.metadata?.directive_provenance) {
      errors.push('directive_id_missing_authority_or_provenance');
    }
  }
  return errors;
}

export function assertValidInputEvent(event) {
  const errors = validateInputEvent(event);
  if (errors.length > 0) throw new Error(`invalid_carrier_input_event:${errors.join(',')}`);
}

export function normalizeInputEvent(event) {
  if (!isObject(event)) throw new Error('invalid_carrier_input_event:input_event_not_object');
  const normalized = {
    ...event,
    schema: event.schema ?? INPUT_EVENT_SCHEMA,
    event_id: event.event_id ?? createInputEventId(),
    transport: normalizeTransport(event.transport),
    hold_condition: event.hold_condition ?? null,
    authority_ref: event.authority_ref ?? null,
    directive_id: event.directive_id ?? null,
    metadata: event.metadata ?? {},
  };
  assertValidInputEvent(normalized);
  return normalized;
}

export function normalizeLegacyInputRecord(record, defaults = {}) {
  if (!isObject(record)) throw new Error('invalid_legacy_input_record:not_object');
  const source = record.source ?? defaults.source ?? 'manual_operator';
  let source_kind = defaults.source_kind ?? 'operator';
  let delivery_mode = defaults.delivery_mode ?? 'admit_for_current_turn';
  if (source === 'system_directive') source_kind = 'system';
  if (source === 'operator_directive') source_kind = 'operator';
  if (source === 'operator_steering') delivery_mode = 'admit_after_active_turn';
  return createInputEvent({
    event_id: record.event_id ?? createInputEventId(),
    source_kind,
    source_id: record.source_id ?? defaults.source_id ?? (source_kind === 'system' ? 'system' : 'operator'),
    transport: record.transport ?? defaults.transport ?? 'carrier_server_api',
    delivery_mode,
    hold_condition: record.hold_condition ?? null,
    content: record.content,
    created_at: record.created_at ?? nowIso(),
    authority_ref: record.authority_ref ?? null,
    directive_id: record.directive_id ?? null,
    metadata: { ...(record.metadata ?? {}), legacy_source: source },
  });
}

export function classifyInputAdmission(event, state = {}) {
  const normalized = normalizeInputEvent(event);
  const activeTurn = Boolean(state.activeTurn);
  const composerHasDraft = Boolean(state.composerHasDraft);
  if (normalized.hold_condition === 'composer_clear_required' && composerHasDraft) {
    return { action: 'hold', reason: 'composer_nonempty', event: normalized };
  }
  if (normalized.delivery_mode === 'admit_for_current_turn') {
    return activeTurn
      ? { action: 'reject', reason: 'active_turn', event: normalized }
      : { action: 'admit', reason: 'no_active_turn', event: normalized };
  }
  if (normalized.delivery_mode === 'admit_after_active_turn') {
    return activeTurn
      ? { action: 'queue', reason: 'active_turn', queue_state: 'queued_for_turn_boundary', event: normalized }
      : { action: 'admit', reason: 'no_active_turn', event: normalized };
  }
  return { action: 'reject', reason: 'invalid_delivery_mode', event: normalized };
}

export function createControlInputRecord({ control_event_id = createControlEventId(), input, written_at = nowIso() }) {
  const normalizedInput = normalizeInputEvent({ ...input, transport: normalizeTransport(input.transport) });
  const record = {
    schema: CONTROL_INPUT_EVENT_SCHEMA,
    control_event_id,
    input_event_id: normalizedInput.event_id,
    written_at,
    input: normalizedInput,
  };
  assertValidControlInputRecord(record);
  return record;
}

export function validateControlInputRecord(record) {
  const errors = [];
  if (!isObject(record)) return ['control_record_not_object'];
  if (record.schema !== CONTROL_INPUT_EVENT_SCHEMA) errors.push(`invalid_schema:${String(record.schema)}`);
  if (typeof record.control_event_id !== 'string' || !record.control_event_id.startsWith('control_')) errors.push('invalid_control_event_id');
  if (typeof record.input_event_id !== 'string' || !record.input_event_id.startsWith('input_')) errors.push('invalid_input_event_id');
  if (!isRfc3339Utc(record.written_at)) errors.push('invalid_written_at');
  const inputErrors = validateInputEvent(record.input);
  errors.push(...inputErrors.map((error) => `input.${error}`));
  if (isObject(record.input) && record.input_event_id !== record.input.event_id) errors.push('input_event_id_mismatch');
  return errors;
}

export function assertValidControlInputRecord(record) {
  const errors = validateControlInputRecord(record);
  if (errors.length > 0) throw new Error(`invalid_carrier_control_input_record:${errors.join(',')}`);
}

export function normalizeControlInputRecord(record, defaults = {}) {
  if (!isObject(record)) throw new Error('invalid_carrier_control_input_record:control_record_not_object');
  if (record.schema === CONTROL_INPUT_EVENT_SCHEMA) {
    assertValidControlInputRecord(record);
    return record;
  }
  if (record.input && isObject(record.input)) {
    return createControlInputRecord({
      control_event_id: record.control_event_id ?? record.event_id ?? createControlEventId(),
      written_at: record.written_at ?? record.created_at ?? nowIso(),
      input: normalizeLegacyInputRecord(record.input, { transport: 'control_jsonl', ...defaults }),
    });
  }
  return createControlInputRecord({
    control_event_id: record.control_event_id ?? record.event_id ?? createControlEventId(),
    written_at: record.written_at ?? record.created_at ?? nowIso(),
    input: normalizeLegacyInputRecord(record, { transport: 'control_jsonl', ...defaults }),
  });
}

const SESSION_PAYLOAD_VALIDATORS = Object.freeze({
  input_queued_for_turn_boundary: (payload) => requireFields(payload, ['input_event_id', 'queue_state']),
  input_admitted_to_turn: (payload) => requireFields(payload, ['input_event_id']),
  input_dropped_by_operator: (payload) => requireFields(payload, ['input_event_id', 'drop_reason']),
  input_abandoned_on_session_end: (payload) => requireFields(payload, ['input_event_id']),
  input_completed: (payload) => requireFields(payload, ['input_event_id', 'terminal_state']),
  system_directive_held: validateSystemDirectiveHeldPayload,
  system_directive_released: validateSystemDirectiveReleasedPayload,
  directive_receipt_recorded: (payload) => requireFields(payload, ['input_event_id', 'directive_id']),
  directive_carrier_accepted_recorded: (payload) => requireFields(payload, ['input_event_id', 'directive_id']),
  turn_started: (payload) => requireFields(payload, ['input_event_id', 'turn_id']),
  provider_request_recorded: validateProviderRequestPayload,
  provider_text_delta_recorded: (payload) => validateProviderOutputPayload('text_delta', payload),
  provider_tool_call_requested: (payload) => validateProviderOutputPayload('tool_call_request', payload),
  turn_completed: (payload) => validateTurnTerminalPayload('turn_completed', payload),
  turn_interrupted: (payload) => validateTurnTerminalPayload('turn_interrupted', payload),
  turn_failed: (payload) => validateTurnTerminalPayload('turn_failed', payload),
  interrupt_requested: (payload) => requireFields(payload, ['turn_id']),
  tool_call_requested: validateToolCallPayload,
  tool_result_received: validateToolResultPayload,
  carrier_command_executed: (payload) => requireFields(payload, ['command']),
  carrier_diagnostic_recorded: validateCarrierDiagnosticPayload,
});

function requireFields(payload, fields) {
  const errors = [];
  if (!isObject(payload)) return ['invalid_payload'];
  for (const field of fields) {
    if (!hasOwn(payload, field)) errors.push(`payload.missing_required_field:${field}`);
  }
  return errors;
}

function validateOptionalPayloadRef(payload, field) {
  if (payload[field] === null || payload[field] === undefined) return [];
  return validatePayloadRef(payload[field]).map((error) => `payload.${field}.${error}`);
}

function validateToolCallPayload(payload) {
  const errors = requireFields(payload, ['tool_name', 'arguments_summary', 'requesting_agent_id']);
  if (errors.length > 0) return errors;
  if (typeof payload.tool_name !== 'string' || payload.tool_name.length === 0) errors.push('payload.invalid_tool_name');
  if (typeof payload.arguments_summary !== 'string') errors.push('payload.invalid_arguments_summary');
  if (typeof payload.requesting_agent_id !== 'string' || payload.requesting_agent_id.length === 0) errors.push('payload.invalid_requesting_agent_id');
  errors.push(...validateOptionalPayloadRef(payload, 'arguments_ref'));
  return errors;
}

function validateToolResultPayload(payload) {
  const errors = requireFields(payload, ['tool_name', 'status', 'duration_ms', 'result_summary']);
  if (errors.length > 0) return errors;
  if (typeof payload.tool_name !== 'string' || payload.tool_name.length === 0) errors.push('payload.invalid_tool_name');
  if (typeof payload.status !== 'string' || payload.status.length === 0) errors.push('payload.invalid_status');
  if (typeof payload.duration_ms !== 'number' || payload.duration_ms < 0) errors.push('payload.invalid_duration_ms');
  if (typeof payload.result_summary !== 'string') errors.push('payload.invalid_result_summary');
  errors.push(...validateOptionalPayloadRef(payload, 'result_ref'));
  return errors;
}

export function createProviderRequestPayload({
  turn_id,
  input_event_id,
  provider_request_status,
  provider_execution_enabled,
  provider_runtime_status,
  provider_adapter_admission_status,
  provider_adapter_kind = null,
  provider = null,
  model = null,
  thinking = null,
  stream,
  provider_streaming_contract,
  provider_adapter_refusal_reason = null,
  content_preview,
}) {
  return {
    schema: PROVIDER_REQUEST_PAYLOAD_SCHEMA,
    turn_id,
    input_event_id,
    provider_request_status,
    provider_execution_enabled,
    provider_runtime_status,
    provider_adapter_admission_status,
    provider_adapter_kind,
    provider,
    model,
    thinking,
    stream,
    provider_streaming_contract,
    provider_adapter_refusal_reason,
    content_preview,
  };
}

function validateProviderRequestPayload(payload) {
  const errors = requireFields(payload, [
    'schema',
    'turn_id',
    'input_event_id',
    'provider_request_status',
    'provider_execution_enabled',
    'provider_runtime_status',
    'stream',
    'provider_streaming_contract',
    'content_preview',
    'content_preview',
  ]);
  if (errors.length > 0) return errors;
  if (payload.schema !== PROVIDER_REQUEST_PAYLOAD_SCHEMA) errors.push(`payload.invalid_schema:${String(payload.schema)}`);
  for (const field of ['turn_id', 'input_event_id', 'provider_request_status', 'provider_runtime_status', 'provider_adapter_admission_status']) {
  if (typeof payload.stream !== 'boolean') errors.push('payload.invalid_stream');
  if (typeof payload.provider_streaming_contract !== 'string' || payload.provider_streaming_contract.length === 0) errors.push('payload.invalid_provider_streaming_contract');
  }
  if (typeof payload.provider_execution_enabled !== 'boolean') errors.push('payload.invalid_provider_execution_enabled');
  if (typeof payload.stream !== 'boolean') errors.push('payload.invalid_stream');
  if (typeof payload.content_preview !== 'string') errors.push('payload.invalid_content_preview');
  for (const field of ['provider_adapter_kind', 'provider', 'model', 'thinking', 'provider_adapter_refusal_reason']) {
    if (payload[field] !== null && payload[field] !== undefined && typeof payload[field] !== 'string') errors.push(`payload.invalid_${field}`);
  }
  return errors;
}

export function createProviderTextDeltaPayload({ turn_id, sequence, text_delta, text_delta_ref = null }) {
  return {
    schema: PROVIDER_OUTPUT_PAYLOAD_SCHEMA,
    turn_id,
    provider_output_kind: 'text_delta',
    sequence,
    text_delta,
    text_delta_ref,
  };
}

export function createProviderToolCallPayload({ turn_id, sequence, tool_name, arguments_summary, arguments_ref = null }) {
  return {
    schema: PROVIDER_OUTPUT_PAYLOAD_SCHEMA,
    turn_id,
    provider_output_kind: 'tool_call_request',
    sequence,
    tool_name,
    arguments_summary,
    arguments_ref,
  };
}

function validateProviderOutputPayload(expectedKind, payload) {
  const errors = requireFields(payload, ['schema', 'turn_id', 'provider_output_kind', 'sequence']);
  if (errors.length > 0) return errors;
  if (payload.schema !== PROVIDER_OUTPUT_PAYLOAD_SCHEMA) errors.push(`payload.invalid_schema:${String(payload.schema)}`);
  if (typeof payload.turn_id !== 'string' || payload.turn_id.length === 0) errors.push('payload.invalid_turn_id');
  if (payload.provider_output_kind !== expectedKind) errors.push(`payload.invalid_provider_output_kind:${String(payload.provider_output_kind)}`);
  if (!Number.isInteger(payload.sequence) || payload.sequence < 0) errors.push('payload.invalid_sequence');
  if (expectedKind === 'text_delta') {
    if (typeof payload.text_delta !== 'string') errors.push('payload.invalid_text_delta');
    errors.push(...validateOptionalPayloadRef(payload, 'text_delta_ref'));
  } else if (expectedKind === 'tool_call_request') {
    if (typeof payload.tool_name !== 'string' || payload.tool_name.length === 0) errors.push('payload.invalid_tool_name');
    if (typeof payload.arguments_summary !== 'string') errors.push('payload.invalid_arguments_summary');
    errors.push(...validateOptionalPayloadRef(payload, 'arguments_ref'));
  } else {
    errors.push(`payload.unsupported_provider_output_kind:${expectedKind}`);
  }
  return errors;
}

function validateSystemDirectiveHeldPayload(payload) {
  const errors = requireFields(payload, ['input_event_id', 'held_at', 'held_reason', 'original_delivery_mode']);
  if (errors.length > 0) return errors;
  if (!isRfc3339Utc(payload.held_at)) errors.push('payload.invalid_held_at');
  if (payload.held_reason !== 'composer_nonempty') errors.push(`payload.invalid_held_reason:${String(payload.held_reason)}`);
  if (!enumIncludes(DELIVERY_MODES, payload.original_delivery_mode)) errors.push('payload.invalid_original_delivery_mode');
  if (payload.directive_id !== undefined && (typeof payload.directive_id !== 'string' || payload.directive_id.length === 0)) errors.push('payload.invalid_directive_id');
  return errors;
}

function validateSystemDirectiveReleasedPayload(payload) {
  const errors = requireFields(payload, ['input_event_id', 'released_at']);
  if (errors.length > 0) return errors;
  if (!isRfc3339Utc(payload.released_at)) errors.push('payload.invalid_released_at');
  if (payload.directive_id !== undefined && (typeof payload.directive_id !== 'string' || payload.directive_id.length === 0)) errors.push('payload.invalid_directive_id');
  return errors;
}

export function createTurnTerminalPayload({
  turn_id,
  input_event_id = undefined,
  provider_request_status,
  terminal_status,
  provider_execution_enabled,
  error_summary = undefined,
}) {
  return {
    schema: TURN_TERMINAL_PAYLOAD_SCHEMA,
    turn_id,
    ...(input_event_id === undefined ? {} : { input_event_id }),
    provider_request_status,
    terminal_status,
    provider_execution_enabled,
    ...(error_summary === undefined ? {} : { error_summary }),
  };
}

function validateTurnTerminalPayload(kind, payload) {
  const errors = requireFields(payload, [
    'schema',
    'turn_id',
    'terminal_status',
    'provider_request_status',
    'provider_execution_enabled',
  ]);
  if (errors.length > 0) return errors;
  if (payload.schema !== TURN_TERMINAL_PAYLOAD_SCHEMA) errors.push(`payload.invalid_schema:${String(payload.schema)}`);
  if (typeof payload.turn_id !== 'string' || payload.turn_id.length === 0) errors.push('payload.invalid_turn_id');
  if (typeof payload.provider_request_status !== 'string' || payload.provider_request_status.length === 0) errors.push('payload.invalid_provider_request_status');
  if (typeof payload.provider_execution_enabled !== 'boolean') errors.push('payload.invalid_provider_execution_enabled');
  const validTerminalStatus = (
    (kind === 'turn_completed' && ['completed', 'completed_after_dispatch', 'completed_without_provider'].includes(payload.terminal_status))
    || (kind === 'turn_interrupted' && payload.terminal_status === 'interrupted')
    || (kind === 'turn_failed' && payload.terminal_status === 'failed')
  );
  if (!validTerminalStatus) errors.push(`payload.invalid_terminal_status:${String(payload.terminal_status)}`);
  if (kind === 'turn_failed' && (typeof payload.error_summary !== 'string' || payload.error_summary.length === 0)) {
    errors.push('payload.invalid_error_summary');
  }
  return errors;
}

function validateCarrierDiagnosticPayload(payload) {
  const errors = requireFields(payload, ['level', 'message']);
  if (errors.length > 0) return errors;
  if (!['debug', 'info', 'warn', 'error'].includes(payload.level)) errors.push(`payload.invalid_level:${String(payload.level)}`);
  if (typeof payload.message !== 'string' || payload.message.length === 0) errors.push('payload.invalid_message');
  if (payload.suppression_count !== undefined && (!Number.isInteger(payload.suppression_count) || payload.suppression_count < 0)) errors.push('payload.invalid_suppression_count');
  if (payload.suppression_policy !== undefined && typeof payload.suppression_policy !== 'string') errors.push('payload.invalid_suppression_policy');
  return errors;
}

export function createSessionEvent({
  event_kind,
  event_id = createSessionEventId(),
  occurred_at = nowIso(),
  carrier_session_id,
  agent_id,
  site_id,
  site_root,
  payload = {},
}) {
  const event = {
    schema: SESSION_EVENT_SCHEMA,
    event_kind,
    event_id,
    occurred_at,
    carrier_session_id,
    agent_id,
    site_id,
    site_root,
    payload,
  };
  assertValidSessionEvent(event);
  return event;
}

export function validateSessionEvent(event) {
  const errors = [];
  if (!isObject(event)) return ['session_event_not_object'];
  if (event.schema !== SESSION_EVENT_SCHEMA) errors.push(`invalid_schema:${String(event.schema)}`);
  if (!enumIncludes(SESSION_EVENT_KINDS, event.event_kind)) errors.push(`invalid_event_kind:${String(event.event_kind)}`);
  for (const field of CARRIER_PROTOCOL_SCHEMAS.session_event.required) {
    if (!hasOwn(event, field)) errors.push(`missing_required_field:${field}`);
  }
  if (typeof event.event_id !== 'string' || !event.event_id.startsWith('session_event_')) errors.push('invalid_event_id');
  if (!isRfc3339Utc(event.occurred_at)) errors.push('invalid_occurred_at');
  for (const field of ['carrier_session_id', 'agent_id', 'site_id', 'site_root']) {
    if (typeof event[field] !== 'string' || event[field].length === 0) errors.push(`invalid_${field}`);
  }
  if (!isObject(event.payload)) errors.push('invalid_payload');
  const payloadValidator = SESSION_PAYLOAD_VALIDATORS[event.event_kind];
  if (payloadValidator) errors.push(...payloadValidator(event.payload));
  return errors;
}

export function assertValidSessionEvent(event) {
  const errors = validateSessionEvent(event);
  if (errors.length > 0) throw new Error(`invalid_carrier_session_event:${errors.join(',')}`);
}

export function createQueueLifecycleSessionEvent({ lifecycle, input_event_id, carrier_session_id, agent_id, site_id, site_root, payload = {} }) {
  const eventKindByLifecycle = {
    queued_for_turn_boundary: 'input_queued_for_turn_boundary',
    admitted_to_turn: 'input_admitted_to_turn',
    dropped_by_operator: 'input_dropped_by_operator',
    abandoned_on_session_end: 'input_abandoned_on_session_end',
  };
  const event_kind = eventKindByLifecycle[lifecycle];
  if (!event_kind) throw new Error(`invalid_queue_lifecycle:${String(lifecycle)}`);
  return createSessionEvent({
    event_kind,
    carrier_session_id,
    agent_id,
    site_id,
    site_root,
    payload: {
      input_event_id,
      ...(lifecycle === 'queued_for_turn_boundary' ? { queue_state: lifecycle } : {}),
      ...(lifecycle === 'dropped_by_operator' ? { drop_reason: payload.drop_reason ?? 'operator_requested' } : {}),
      ...payload,
    },
  });
}

export function createInterruptRequestedSessionEvent({ turn_id, carrier_session_id, agent_id, site_id, site_root, payload = {} }) {
  return createSessionEvent({
    event_kind: 'interrupt_requested',
    carrier_session_id,
    agent_id,
    site_id,
    site_root,
    payload: { turn_id, ...payload },
  });
}

export function createCarrierDiagnosticSessionEvent({
  carrier_session_id,
  agent_id,
  site_id,
  site_root,
  level,
  message,
  suppression_count,
  suppression_policy,
  payload = {},
}) {
  return createSessionEvent({
    event_kind: 'carrier_diagnostic_recorded',
    carrier_session_id,
    agent_id,
    site_id,
    site_root,
    payload: {
      level,
      message,
      ...(suppression_count === undefined ? {} : { suppression_count }),
      ...(suppression_policy === undefined ? {} : { suppression_policy }),
      ...payload,
    },
  });
}

export function isTerminalTurnState(state) {
  return TERMINAL_TURN_STATES.includes(state);
}
