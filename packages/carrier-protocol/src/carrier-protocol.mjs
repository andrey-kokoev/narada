export const INPUT_EVENT_SCHEMA = 'narada.carrier.input_event.v1';
export const CONTROL_INPUT_EVENT_SCHEMA = 'narada.carrier.control.input_event.v1';
export const SESSION_EVENT_SCHEMA = 'narada.carrier.session_event.v1';
export const PAYLOAD_REF_SCHEMA = 'narada.carrier.payload_ref.v1';
export const PAYLOAD_POLICY_SCHEMA = 'narada.carrier.payload_policy.v1';
export const PROVIDER_REQUEST_PAYLOAD_SCHEMA = 'narada.agent_tui.provider_request_payload.v0';
export const PROVIDER_OUTPUT_PAYLOAD_SCHEMA = 'narada.agent_tui.provider_output_payload.v0';
export const TURN_TERMINAL_PAYLOAD_SCHEMA = 'narada.agent_tui.turn_terminal_payload.v0';
export const SESSION_EVENT_FIXTURE_MANIFEST_SCHEMA = 'narada.carrier.session_event_fixture_manifest.v1';
export const TOOL_EFFECT_ADMISSION_CASES_SCHEMA = 'narada.carrier.tool_effect_admission_cases.v1';
export const NARS_LIFECYCLE_HOOK_SCHEMA = 'narada.nars.lifecycle_hook.v1';
export const NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_SCHEMA = 'narada.nars.authority_runtime_host_transition.v1';
export const NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_REFUSAL_SCHEMA = 'narada.nars.authority_runtime_host_transition_refusal.v1';
export const NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_CASES_SCHEMA = 'narada.nars.authority_runtime_host_transition_cases.v1';
export const CANONICAL_STARTUP_COMMAND_NAME = 'agent_context_startup_sequence';

export const SOURCE_KINDS = Object.freeze(['operator', 'system', 'agent', 'external']);
export const OBSERVER_VISIBILITIES = Object.freeze(['record_only', 'operator_visible', 'agent_visible', 'conversation_visible']);
export const DIRECTIVE_VISIBILITIES = OBSERVER_VISIBILITIES;
export const DIRECTIVE_KINDS = Object.freeze(['operation_heartbeat', 'operation_attention']);
export const DIRECTIVE_TARGET_KINDS = Object.freeze(['carrier_session', 'operation', 'site', 'operator', 'observer']);
export const DIRECTIVE_TRIGGER_KINDS = Object.freeze(['cadence', 'runtime_trigger', 'operator_authorized']);
export const DIRECTIVE_SUPPRESSION_REASONS = Object.freeze([
  'directive_emission_disabled',
  'directive_emission_rule_inactive',
  'directive_emission_target_missing',
  'directive_emission_unsupported_kind',
]);
export const CARRIER_DIRECTIVE_EMITTER_REGISTRY = Object.freeze({
  operation_heartbeat: Object.freeze({
    directive_kind: 'operation_heartbeat',
    default_visibility: 'record_only',
    default_cadence: 'PT1M',
    trigger_kind: 'cadence',
    target_kind: 'carrier_session',
    default_source_kind: 'system',
    default_source_id: 'narada-proper.system.directive_emitter',
    default_authorized_emitter: Object.freeze({ kind: 'system', id: 'narada-proper.system.directive_emitter' }),
    default_authority: Object.freeze({ locus: 'narada_proper', basis: 'operator_authorized_system_directive' }),
    default_reason: 'operation_continuity_heartbeat',
    delivery_mode: 'admit_for_current_turn',
    content: '',
  }),
  operation_attention: Object.freeze({
    directive_kind: 'operation_attention',
    default_visibility: 'operator_visible',
    default_cadence: null,
    trigger_kind: 'runtime_trigger',
    target_kind: 'operation',
    default_source_kind: 'system',
    default_source_id: 'narada-proper.system.directive_emitter',
    default_authorized_emitter: Object.freeze({ kind: 'system', id: 'narada-proper.system.directive_emitter' }),
    default_authority: Object.freeze({ locus: 'narada_proper', basis: 'operator_authorized_system_directive' }),
    default_reason: 'operation_requires_attention',
    delivery_mode: 'admit_for_current_turn',
    content: '',
  }),
});
export const OBSERVER_CONFIDENCES = Object.freeze(['low', 'medium', 'high']);
export const PAYLOAD_REF_READER_TOOLS = Object.freeze([
  'mcp_payload_read',
  'mcp_payload_show',
  'mcp_output_show',
  'carrier_host_command_output_read',
]);
export const TRANSPORTS = Object.freeze([
  'interactive_terminal',
  'control_jsonl',
  'startup_injection',
  'carrier_server_api',
  'test_harness',
]);
export const DELIVERY_MODES = Object.freeze(['admit_for_current_turn', 'admit_after_active_turn']);
export const OPERATOR_INPUT_ADMISSION_CONSTRUCTORS = Object.freeze({
  send: Object.freeze({
    method: 'conversation.send',
    input_kind: 'operator_message',
    turn_timing: 'current_or_next_idle_turn',
    active_turn_effect: 'none',
    queue_durability: 'none',
    ordering: 'immediate',
    authority: 'operator',
  }),
  enqueue: Object.freeze({
    method: 'conversation.enqueue',
    input_kind: 'operator_message',
    turn_timing: 'after_active_turn',
    active_turn_effect: 'none',
    queue_durability: 'nars_session_durable',
    ordering: 'fifo_after_active_turn',
    authority: 'operator',
  }),
  steer: Object.freeze({
    method: 'conversation.steer',
    input_kind: 'operator_steering',
    turn_timing: 'after_active_turn',
    active_turn_effect: 'interrupt',
    queue_durability: 'nars_session_durable',
    ordering: 'front_after_interrupt',
    authority: 'operator',
  }),
});
export const HOLD_CONDITIONS = Object.freeze(['composer_clear_required']);
export const TURN_STATES = Object.freeze(['idle', 'active', 'interrupt_requested', 'completed', 'interrupted', 'failed']);
export const TERMINAL_TURN_STATES = Object.freeze(['completed', 'interrupted', 'failed']);
export const QUEUE_STATES = Object.freeze([
  'queued_for_turn_boundary',
  'admitted_to_turn',
  'dropped_by_operator',
  'abandoned_on_session_end',
]);
export const TOOL_RESULT_STATUSES = Object.freeze(['ok', 'denied', 'failed']);
export const TOOL_EFFECT_ADMISSION_ACTIONS = Object.freeze(['admit', 'deny']);
export const TOOL_EFFECT_ADMISSION_REASONS = Object.freeze([
  'read_only_tool_effect_admitted',
  'tool_effect_adapter_unconfigured',
  'tool_effect_admission_required',
  'unsupported_tool_effect',
  'tool_effect_authority_denied',
  'write_tool_effect_admitted',
]);
export const NARS_AUTHORITY_RUNTIME_HOST_KINDS = Object.freeze(['local', 'cloudflare-host']);
export const NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES = Object.freeze([
  'not_requested',
  'proposed',
  'preparing_target',
  'source_draining',
  'source_sealed',
  'target_activating',
  'target_active',
  'source_retired',
  'preparation_failed',
  'drain_failed',
  'seal_failed',
  'target_activation_failed',
  'transition_aborted',
]);
export const NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_TERMINAL_STATES = Object.freeze([
  'source_retired',
  'preparation_failed',
  'drain_failed',
  'seal_failed',
  'target_activation_failed',
  'transition_aborted',
]);
export const NARS_AUTHORITY_RUNTIME_SOURCE_WRITE_ADMISSIONS = Object.freeze(['active', 'draining', 'sealed', 'retired']);
export const NARS_AUTHORITY_RUNTIME_TARGET_WRITE_ADMISSIONS = Object.freeze(['not_before_source_seal', 'active_after_epoch_token', 'refused']);
export const NARS_AUTHORITY_RUNTIME_EVENT_LOG_HANDOFF_MODES = Object.freeze(['checkpoint_plus_cursor']);
export const NARS_AUTHORITY_RUNTIME_QUEUE_HANDOFF_MODES = Object.freeze(['drain_before_seal', 'transfer_after_seal', 'refuse_new_until_target_active']);
export const NARS_AUTHORITY_RUNTIME_ARTIFACT_HANDOFF_MODES = Object.freeze(['registry_plus_admitted_content', 'registry_only_lazy_content', 'none']);
export const NARS_AUTHORITY_RUNTIME_MCP_FABRIC_HANDOFF_MODES = Object.freeze(['compatibility_report_required', 'explicit_degraded_acceptance']);
export const NARS_AUTHORITY_RUNTIME_MCP_FABRIC_STATUSES = Object.freeze(['pending', 'compatible', 'degraded_explicit', 'incompatible']);
export const NARS_AUTHORITY_RUNTIME_PROVIDER_HANDOFF_MODES = Object.freeze(['unsupported_for_synthetic_slice', 'not_present']);
export function classifyToolEffectAdmission(toolCall = {}, {
  adapterConfigured = false,
  admissionRequired = false,
  supportedTools = [],
  admitReason = 'read_only_tool_effect_admitted',
} = {}) {
  const toolName = String(toolCall.tool_name ?? toolCall.name ?? '').trim();
  const supported_tools = Array.isArray(supportedTools) ? [...supportedTools] : [];
  if (!adapterConfigured) {
    return {
      action: 'deny',
      reason: 'tool_effect_adapter_unconfigured',
      tool_name: toolName,
      supported_tools: [],
    };
  }
  if (!supported_tools.includes(toolName)) {
    return {
      action: 'deny',
      reason: 'unsupported_tool_effect',
      tool_name: toolName,
      supported_tools,
    };
  }
  if (admissionRequired) {
    return {
      action: 'deny',
      reason: 'tool_effect_admission_required',
      tool_name: toolName,
      supported_tools,
    };
  }
  if (!TOOL_EFFECT_ADMISSION_REASONS.includes(admitReason)) {
    return {
      action: 'deny',
      reason: 'unsupported_tool_effect',
      tool_name: toolName,
      supported_tools,
    };
  }
  return {
    action: 'admit',
    reason: admitReason,
    tool_name: toolName,
    supported_tools,
  };
}
export const SESSION_EVENT_KINDS = Object.freeze([
  'carrier_session_started',
  'input_queued_for_turn_boundary',
  'input_admitted_to_turn',
  'input_dropped_by_operator',
  'input_abandoned_on_session_end',
  'input_completed',
  'system_directive_held',
  'system_directive_released',
  'directive_emission_authorized',
  'directive_emission_rule_recorded',
  'directive_emitted',
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
  'observer_observation_recorded',
  'observer_interjection_proposed',
  'observer_interjection_admitted',
  'observer_interjection_visible',
  'observer_interjection_suppressed',
  'carrier_host_command_requested',
  'carrier_host_command_admitted',
  'carrier_host_command_rejected',
  'carrier_host_command_started',
  'carrier_host_command_completed',
  'carrier_host_command_failed',
  'carrier_command_executed',
  'carrier_diagnostic_recorded',
  'carrier_session_closed',
]);
export const NARS_SESSION_LIFECYCLE_HOOKS = Object.freeze([
  'beforeSessionBind',
  'afterSessionStarted',
  'afterSessionStatus',
  'beforeSessionClose',
  'afterSessionClosed',
  'onSessionError',
]);
export const NARS_TURN_LIFECYCLE_HOOKS = Object.freeze([
  'beforeDirectiveAccept',
  'afterDirectiveAccepted',
  'beforeTurnStart',
  'onAssistantMessage',
  'onToolCall',
  'onToolResult',
  'onCommandResult',
  'afterTurnComplete',
  'onRuntimeError',
]);
export const NARS_LIFECYCLE_HOOKS = Object.freeze([
  ...NARS_SESSION_LIFECYCLE_HOOKS,
  ...NARS_TURN_LIFECYCLE_HOOKS,
]);
export const NARS_SESSION_EVENT_KINDS = Object.freeze([
  'session_started',
  'session_status',
  'session_health',
  'session_closed',
  'runtime_error',
]);
export const NARS_TURN_EVENT_KINDS = Object.freeze([
  'directive_received',
  'directive_receipt_recorded',
  'directive_carrier_accepted_recorded',
  'turn_started',
  'assistant_message',
  'assistant_message_stream',
  'tool_call',
  'tool_result',
  'command_result',
  'turn_complete',
  'turn_interrupted',
  'turn_failed',
  'runtime_error',
]);
export const NARS_RUNTIME_EVENT_KINDS = Object.freeze([
  ...NARS_SESSION_EVENT_KINDS,
  ...NARS_TURN_EVENT_KINDS.filter((eventKind) => !NARS_SESSION_EVENT_KINDS.includes(eventKind)),
]);
export const NARS_RUNTIME_EVENT_ALIASES = Object.freeze({
  carrier_command_result: 'command_result',
  directive_complete: 'turn_complete',
  error: 'runtime_error',
});
export const NARS_TURN_TERMINAL_STATES = Object.freeze([
  'accepted',
  'completed',
  'completed_after_dispatch',
  'completed_without_provider',
  'interrupted',
  'interrupted_requested',
  'failed',
  'rejected',
  'unsupported',
  'invalid',
  'unavailable',
]);
export const NARS_SESSION_TERMINAL_STATES = Object.freeze([
  'closed',
  'failed',
]);
export const NARS_EVENT_TO_LIFECYCLE_HOOKS = Object.freeze({
  session_started: Object.freeze(['afterSessionStarted']),
  session_status: Object.freeze(['afterSessionStatus']),
  session_health: Object.freeze(['afterSessionStatus']),
  session_closed: Object.freeze(['beforeSessionClose', 'afterSessionClosed']),
  directive_received: Object.freeze(['beforeDirectiveAccept']),
  directive_carrier_accepted_recorded: Object.freeze(['afterDirectiveAccepted']),
  turn_started: Object.freeze(['beforeTurnStart']),
  assistant_message: Object.freeze(['onAssistantMessage']),
  assistant_message_stream: Object.freeze(['onAssistantMessage']),
  tool_call: Object.freeze(['onToolCall']),
  tool_result: Object.freeze(['onToolResult']),
  command_result: Object.freeze(['onCommandResult']),
  turn_complete: Object.freeze(['afterTurnComplete']),
  turn_interrupted: Object.freeze(['afterTurnComplete']),
  turn_failed: Object.freeze(['afterTurnComplete', 'onRuntimeError']),
  runtime_error: Object.freeze(['onRuntimeError']),
});
export const CARRIER_CONTROL_METHODS = Object.freeze([
  'session.status',
  'session.health',
  'session.events.subscribe',
  'session.events.read',
  'session.recovery',
  'session.operations',
  'preflight.recovery',
  'session.sync',
  'session.close',
  'conversation.interrupt',
  'conversation.steer',
  'conversation.enqueue',
  'conversation.send',
  'system_directive.deliver',
  'carrier.input.deliver',
  'carrier.command.execute',
  'observers.status',
  'observer.mute',
  'observer.unmute',
]);

export const NARS_COMMAND_METHOD = 'carrier.command.execute';

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
  nars_lifecycle_hook: Object.freeze({
    schema: NARS_LIFECYCLE_HOOK_SCHEMA,
    required: Object.freeze(['schema', 'hook', 'hook_kind', 'agent_id', 'session_id', 'timestamp']),
    optional: Object.freeze(['event_kind', 'request_id', 'turn_id', 'directive_id', 'terminal_state', 'error', 'metadata', 'source_event']),
  }),
  nars_authority_runtime_host_transition: Object.freeze({
    schema: NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_SCHEMA,
    required: Object.freeze([
      'schema',
      'transition_id',
      'session_id',
      'session_lineage_id',
      'agent_id',
      'site_id',
      'state',
      'source_authority_runtime',
      'target_authority_runtime',
      'handoff',
      'fencing',
      'evidence_refs',
    ]),
    optional: Object.freeze(['requested_by', 'requested_at', 'completed_at', 'terminal_reason']),
  }),
  nars_authority_runtime_host_transition_refusal: Object.freeze({
    schema: NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_REFUSAL_SCHEMA,
    required: Object.freeze(['schema', 'status', 'reason_code', 'reason', 'failed_invariant', 'operator_repair', 'transition_request', 'evidence_refs']),
  }),
  nars_authority_runtime_host_transition_cases: Object.freeze({
    schema: NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_CASES_SCHEMA,
    required: Object.freeze(['schema', 'provenance', 'valid_records', 'refusal_records', 'invalid_records']),
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
  tool_effect_admission_cases: Object.freeze({
    schema: TOOL_EFFECT_ADMISSION_CASES_SCHEMA,
    required: Object.freeze(['schema', 'cases']),
  }),
});

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function classifyCarrierControlRequest(request = {}) {
  if (!isObject(request)) {
    return {
      request_id: null,
      method: null,
      method_kind: 'invalid',
      concurrent_allowed: false,
      allowed_when_closed: false,
      error: {
        code: 'invalid_request',
        message: 'Carrier control request must be an object.',
      },
    };
  }
  const nativeControlInput = request.schema === CONTROL_INPUT_EVENT_SCHEMA;
  const method = nativeControlInput ? 'carrier.input.deliver' : request.method;
  const requestId = request.id ?? request.control_event_id ?? null;
  const base = {
    request_id: requestId,
    method,
    concurrent_allowed: false,
    allowed_when_closed: false,
    native_control_input: nativeControlInput,
    observer_action: null,
    error: null,
  };
  if (nativeControlInput || method === 'carrier.input.deliver') {
    return { ...base, method_kind: 'carrier_input_deliver' };
  }
  if (method === 'session.status') return { ...base, method_kind: 'session_status', allowed_when_closed: true };
  if (method === 'session.health') return { ...base, method_kind: 'session_health', allowed_when_closed: true, concurrent_allowed: true };
  if (method === 'session.events.subscribe') return { ...base, method_kind: 'session_events_subscribe', allowed_when_closed: true, concurrent_allowed: true };
  if (method === 'session.events.read') return { ...base, method_kind: 'session_events_read', allowed_when_closed: true, concurrent_allowed: true };
  if (method === 'session.recovery') return { ...base, method_kind: 'session_recovery' };
  if (method === 'session.operations') return { ...base, method_kind: 'session_operations' };
  if (method === 'preflight.recovery') return { ...base, method_kind: 'preflight_recovery' };
  if (method === 'session.sync') return { ...base, method_kind: 'session_sync' };
  if (method === 'session.close') return { ...base, method_kind: 'session_close', allowed_when_closed: true };
  if (method === 'authority.source.drain') return { ...base, method_kind: 'authority_source_drain', concurrent_allowed: true };
  if (method === 'authority.source.seal') return { ...base, method_kind: 'authority_source_seal', concurrent_allowed: true };
  if (method === 'authority.source.status') return { ...base, method_kind: 'authority_source_status', allowed_when_closed: true, concurrent_allowed: true };
  if (method === 'authority.target.prepare') return { ...base, method_kind: 'authority_target_prepare', concurrent_allowed: true };
  if (method === 'authority.target.activate') return { ...base, method_kind: 'authority_target_activate', concurrent_allowed: true };
  if (method === 'authority.target.status') return { ...base, method_kind: 'authority_target_status', allowed_when_closed: true, concurrent_allowed: true };
  if (method === 'conversation.interrupt') return { ...base, method_kind: 'conversation_interrupt', concurrent_allowed: true };
  if (method === 'conversation.steer') return { ...base, method_kind: 'conversation_steer', concurrent_allowed: true };
  if (method === 'conversation.enqueue') return { ...base, method_kind: 'conversation_enqueue', concurrent_allowed: true };
  if (method === 'conversation.send') return { ...base, method_kind: 'conversation_send' };
  if (method === 'system_directive.deliver') return { ...base, method_kind: 'system_directive_deliver' };
  if (method === 'observers.status') return { ...base, method_kind: 'observers_status' };
  if (method === 'observer.mute') return { ...base, method_kind: 'observer_set_muted', observer_action: 'mute' };
  if (method === 'observer.unmute') return { ...base, method_kind: 'observer_set_muted', observer_action: 'unmute' };
  if (method === NARS_COMMAND_METHOD) {
    return { ...base, method_kind: 'carrier_command_execute' };
  }
  return {
    ...base,
    method_kind: 'unsupported',
    error: {
      code: 'unsupported_method',
      message: `Unsupported method: ${method}`,
    },
  };
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
  return transport;
}

export function isStartupNudge(content) {
  return typeof content === 'string' && STARTUP_NUDGE_PATTERN.test(content.trim());
}

export function startupCommandFromLaunchPacket(launchPacket = {}) {
  const command = isObject(launchPacket.startup_command) ? launchPacket.startup_command : null;
  const rawName = typeof command?.name === 'string' && command.name.length > 0
    ? command.name
    : CANONICAL_STARTUP_COMMAND_NAME;
  const name = rawName;
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

function validateRequiredFields(record, requiredFields, prefix = '') {
  const errors = [];
  for (const field of requiredFields) {
    if (!hasOwn(record, field)) errors.push(`${prefix}missing_required_field:${field}`);
  }
  return errors;
}

function validateNonEmptyString(value, errorCode) {
  return typeof value === 'string' && value.trim().length > 0 ? [] : [errorCode];
}

function validateNonNegativeInteger(value, errorCode) {
  return Number.isInteger(value) && value >= 0 ? [] : [errorCode];
}

function validatePositiveInteger(value, errorCode) {
  return Number.isInteger(value) && value >= 1 ? [] : [errorCode];
}

function validateStringArray(value, errorCode) {
  if (!Array.isArray(value)) return [errorCode];
  return value.every((entry) => typeof entry === 'string') ? [] : [errorCode];
}

function validateAuthorityRuntimeRef(ref, prefix) {
  const errors = [];
  if (!isObject(ref)) return [`${prefix}.not_object`];
  errors.push(...validateRequiredFields(ref, ['authority_runtime_id', 'host_kind', 'authority_epoch', 'health_ref', 'authority_role'], `${prefix}.`));
  errors.push(...validateNonEmptyString(ref.authority_runtime_id, `${prefix}.invalid_authority_runtime_id`));
  if (!enumIncludes(NARS_AUTHORITY_RUNTIME_HOST_KINDS, ref.host_kind)) errors.push(`${prefix}.invalid_host_kind:${String(ref.host_kind)}`);
  errors.push(...validatePositiveInteger(ref.authority_epoch, `${prefix}.invalid_authority_epoch`));
  errors.push(...validateNonEmptyString(ref.health_ref, `${prefix}.invalid_health_ref`));
  if (ref.authority_role !== 'canonical_session_runtime') errors.push(`${prefix}.not_canonical_authority_role:${String(ref.authority_role)}`);
  if (ref.event_cursor !== undefined) {
    if (!isObject(ref.event_cursor)) {
      errors.push(`${prefix}.event_cursor_not_object`);
    } else {
      errors.push(...validateRequiredFields(ref.event_cursor, ['last_sequence'], `${prefix}.event_cursor.`));
      errors.push(...validateNonNegativeInteger(ref.event_cursor.last_sequence, `${prefix}.event_cursor.invalid_last_sequence`));
    }
  }
  return errors;
}

function validateTransitionHandoff(handoff) {
  const errors = [];
  if (!isObject(handoff)) return ['handoff_not_object'];
  errors.push(...validateRequiredFields(handoff, ['event_log', 'operator_input_queue', 'artifacts', 'health', 'mcp_fabric', 'provider_state'], 'handoff.'));
  const eventLog = handoff.event_log;
  if (!isObject(eventLog)) {
    errors.push('handoff.event_log_not_object');
  } else {
    if (!enumIncludes(NARS_AUTHORITY_RUNTIME_EVENT_LOG_HANDOFF_MODES, eventLog.mode)) errors.push(`handoff.event_log.invalid_mode:${String(eventLog.mode)}`);
    errors.push(...validateNonNegativeInteger(eventLog.source_last_sequence, 'handoff.event_log.invalid_source_last_sequence'));
    errors.push(...validatePositiveInteger(eventLog.target_first_sequence, 'handoff.event_log.invalid_target_first_sequence'));
    if (Number.isInteger(eventLog.source_last_sequence) && Number.isInteger(eventLog.target_first_sequence) && eventLog.target_first_sequence <= eventLog.source_last_sequence) {
      errors.push('handoff.event_log.target_first_sequence_must_follow_source_last_sequence');
    }
  }
  const queue = handoff.operator_input_queue;
  if (!isObject(queue)) {
    errors.push('handoff.operator_input_queue_not_object');
  } else {
    if (!enumIncludes(NARS_AUTHORITY_RUNTIME_QUEUE_HANDOFF_MODES, queue.mode)) errors.push(`handoff.operator_input_queue.invalid_mode:${String(queue.mode)}`);
    errors.push(...validateNonNegativeInteger(queue.pending_count_at_request, 'handoff.operator_input_queue.invalid_pending_count_at_request'));
    errors.push(...validateNonNegativeInteger(queue.pending_count_at_seal, 'handoff.operator_input_queue.invalid_pending_count_at_seal'));
  }
  const artifacts = handoff.artifacts;
  if (!isObject(artifacts)) {
    errors.push('handoff.artifacts_not_object');
  } else {
    if (!enumIncludes(NARS_AUTHORITY_RUNTIME_ARTIFACT_HANDOFF_MODES, artifacts.mode)) errors.push(`handoff.artifacts.invalid_mode:${String(artifacts.mode)}`);
    if (artifacts.source_paths_exposed !== false) errors.push('handoff.artifacts.source_paths_exposed_must_be_false');
  }
  const health = handoff.health;
  if (!isObject(health)) {
    errors.push('handoff.health_not_object');
  } else {
    if (!enumIncludes(['source_sealed', 'transition_aborted'], health.source_health_until)) errors.push(`handoff.health.invalid_source_health_until:${String(health.source_health_until)}`);
    if (!enumIncludes(['target_activating', 'target_active'], health.target_health_required_before)) errors.push(`handoff.health.invalid_target_health_required_before:${String(health.target_health_required_before)}`);
  }
  const mcpFabric = handoff.mcp_fabric;
  if (!isObject(mcpFabric)) {
    errors.push('handoff.mcp_fabric_not_object');
  } else {
    if (!enumIncludes(NARS_AUTHORITY_RUNTIME_MCP_FABRIC_HANDOFF_MODES, mcpFabric.mode)) errors.push(`handoff.mcp_fabric.invalid_mode:${String(mcpFabric.mode)}`);
    if (!enumIncludes(NARS_AUTHORITY_RUNTIME_MCP_FABRIC_STATUSES, mcpFabric.status)) errors.push(`handoff.mcp_fabric.invalid_status:${String(mcpFabric.status)}`);
  }
  const providerState = handoff.provider_state;
  if (!isObject(providerState)) {
    errors.push('handoff.provider_state_not_object');
  } else if (!enumIncludes(NARS_AUTHORITY_RUNTIME_PROVIDER_HANDOFF_MODES, providerState.mode)) {
    errors.push(`handoff.provider_state.invalid_mode:${String(providerState.mode)}`);
  }
  return errors;
}

function validateTransitionFencing(fencing) {
  const errors = [];
  if (!isObject(fencing)) return ['fencing_not_object'];
  errors.push(...validateRequiredFields(fencing, ['source_write_admission', 'target_write_admission', 'split_brain_guard'], 'fencing.'));
  if (!enumIncludes(NARS_AUTHORITY_RUNTIME_SOURCE_WRITE_ADMISSIONS, fencing.source_write_admission)) errors.push(`fencing.invalid_source_write_admission:${String(fencing.source_write_admission)}`);
  if (!enumIncludes(NARS_AUTHORITY_RUNTIME_TARGET_WRITE_ADMISSIONS, fencing.target_write_admission)) errors.push(`fencing.invalid_target_write_admission:${String(fencing.target_write_admission)}`);
  if (fencing.split_brain_guard !== 'authority_epoch_token_required') errors.push(`fencing.invalid_split_brain_guard:${String(fencing.split_brain_guard)}`);
  if (fencing.source_write_admission === 'active' && fencing.target_write_admission === 'active_after_epoch_token') {
    errors.push('fencing.split_authority_write_admission');
  }
  return errors;
}

export function validateNarsAuthorityRuntimeHostTransitionRecord(record) {
  const errors = [];
  if (!isObject(record)) return ['authority_runtime_host_transition_not_object'];
  if (record.schema !== NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_SCHEMA) errors.push(`invalid_schema:${String(record.schema)}`);
  errors.push(...validateRequiredFields(record, CARRIER_PROTOCOL_SCHEMAS.nars_authority_runtime_host_transition.required));
  if (typeof record.transition_id !== 'string' || !record.transition_id.startsWith('arht_')) errors.push('invalid_transition_id');
  errors.push(...validateNonEmptyString(record.session_id, 'invalid_session_id'));
  errors.push(...validateNonEmptyString(record.session_lineage_id, 'invalid_session_lineage_id'));
  errors.push(...validateNonEmptyString(record.agent_id, 'invalid_agent_id'));
  errors.push(...validateNonEmptyString(record.site_id, 'invalid_site_id'));
  if (record.requested_by !== undefined) errors.push(...validateNonEmptyString(record.requested_by, 'invalid_requested_by'));
  if (record.requested_at !== undefined && !isRfc3339Utc(record.requested_at)) errors.push('invalid_requested_at');
  if (!enumIncludes(NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES, record.state)) errors.push(`invalid_state:${String(record.state)}`);
  errors.push(...validateAuthorityRuntimeRef(record.source_authority_runtime, 'source_authority_runtime'));
  errors.push(...validateAuthorityRuntimeRef(record.target_authority_runtime, 'target_authority_runtime'));
  if (isObject(record.source_authority_runtime) && isObject(record.target_authority_runtime)) {
    if (record.source_authority_runtime.host_kind === record.target_authority_runtime.host_kind) errors.push('authority_runtime_hosts_not_distinct');
    if (Number.isInteger(record.source_authority_runtime.authority_epoch) && Number.isInteger(record.target_authority_runtime.authority_epoch) && record.target_authority_runtime.authority_epoch <= record.source_authority_runtime.authority_epoch) {
      errors.push('target_authority_epoch_must_exceed_source_authority_epoch');
    }
  }
  errors.push(...validateTransitionHandoff(record.handoff));
  errors.push(...validateTransitionFencing(record.fencing));
  errors.push(...validateStringArray(record.evidence_refs, 'invalid_evidence_refs'));
  if (record.completed_at !== undefined && record.completed_at !== null && !isRfc3339Utc(record.completed_at)) errors.push('invalid_completed_at');
  if (record.terminal_reason !== undefined && record.terminal_reason !== null && typeof record.terminal_reason !== 'string') errors.push('invalid_terminal_reason');
  if (record.state === 'target_active') {
    if (record.fencing?.source_write_admission !== 'sealed' && record.fencing?.source_write_admission !== 'retired') errors.push('target_active_requires_source_sealed_or_retired');
    if (record.fencing?.target_write_admission !== 'active_after_epoch_token') errors.push('target_active_requires_target_write_admission');
  }
  if (NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_TERMINAL_STATES.includes(record.state) && record.state !== 'source_retired') {
    if (record.completed_at === undefined || record.completed_at === null) errors.push('terminal_transition_requires_completed_at');
    if (record.terminal_reason === undefined) errors.push('terminal_transition_requires_terminal_reason');
  }
  return errors;
}

export function assertValidNarsAuthorityRuntimeHostTransitionRecord(record) {
  const errors = validateNarsAuthorityRuntimeHostTransitionRecord(record);
  if (errors.length > 0) throw new Error(`invalid_nars_authority_runtime_host_transition:${errors.join(',')}`);
}

export function validateNarsAuthorityRuntimeHostTransitionRefusal(refusal) {
  const errors = [];
  if (!isObject(refusal)) return ['authority_runtime_host_transition_refusal_not_object'];
  if (refusal.schema !== NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_REFUSAL_SCHEMA) errors.push(`invalid_schema:${String(refusal.schema)}`);
  errors.push(...validateRequiredFields(refusal, CARRIER_PROTOCOL_SCHEMAS.nars_authority_runtime_host_transition_refusal.required));
  if (refusal.status !== 'refused') errors.push(`invalid_status:${String(refusal.status)}`);
  errors.push(...validateNonEmptyString(refusal.reason_code, 'invalid_reason_code'));
  errors.push(...validateNonEmptyString(refusal.reason, 'invalid_reason'));
  errors.push(...validateNonEmptyString(refusal.failed_invariant, 'invalid_failed_invariant'));
  errors.push(...validateNonEmptyString(refusal.operator_repair, 'invalid_operator_repair'));
  if (!isObject(refusal.transition_request)) {
    errors.push('transition_request_not_object');
  } else {
    errors.push(...validateNonEmptyString(refusal.transition_request.session_id, 'transition_request.invalid_session_id'));
    if (!enumIncludes(NARS_AUTHORITY_RUNTIME_HOST_KINDS, refusal.transition_request.source_host_kind)) errors.push(`transition_request.invalid_source_host_kind:${String(refusal.transition_request.source_host_kind)}`);
    if (!enumIncludes(NARS_AUTHORITY_RUNTIME_HOST_KINDS, refusal.transition_request.target_host_kind)) errors.push(`transition_request.invalid_target_host_kind:${String(refusal.transition_request.target_host_kind)}`);
    if (refusal.transition_request.source_host_kind === refusal.transition_request.target_host_kind) errors.push('transition_request.host_kinds_not_distinct');
  }
  errors.push(...validateStringArray(refusal.evidence_refs, 'invalid_evidence_refs'));
  return errors;
}

export function assertValidNarsAuthorityRuntimeHostTransitionRefusal(refusal) {
  const errors = validateNarsAuthorityRuntimeHostTransitionRefusal(refusal);
  if (errors.length > 0) throw new Error(`invalid_nars_authority_runtime_host_transition_refusal:${errors.join(',')}`);
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
  if (!enumIncludes(PAYLOAD_REF_READER_TOOLS, ref.reader_tool)) errors.push(`invalid_reader_tool:${String(ref.reader_tool)}`);
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
  if (event.metadata?.observer !== undefined && event.source_kind !== 'agent') {
    errors.push('observer_metadata_requires_agent_source');
  }
  if (event.source_kind === 'agent') {
    if (event.metadata?.observer !== undefined) {
      if (!isObserverSourceId(event.source_id)) errors.push('observer.source_id_not_observer');
      if (event.metadata?.agent_control_input === true) errors.push('observer.cannot_be_agent_control_input');
      errors.push(...validateObserverMetadata(event.metadata.observer).map((error) => `observer.${error}`));
    } else if (event.metadata?.agent_control_input !== true) {
      errors.push('agent_source_requires_agent_control_input_metadata');
    }
  }
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

export function validateObserverMetadata(observer) {
  const errors = [];
  if (observer === undefined) return ['missing_metadata'];
  if (!isObject(observer)) return ['metadata_not_object'];
  if (observer.role !== 'observer') errors.push(`invalid_role:${String(observer.role)}`);
  if (typeof observer.rule_id !== 'string' || observer.rule_id.length === 0) errors.push('invalid_rule_id');
  if (!enumIncludes(OBSERVER_VISIBILITIES, observer.visibility)) errors.push(`invalid_visibility:${String(observer.visibility)}`);
  if (observer.confidence !== undefined && !enumIncludes(OBSERVER_CONFIDENCES, observer.confidence)) errors.push(`invalid_confidence:${String(observer.confidence)}`);
  if (observer.impersonates_operator === true || observer.impersonates_system === true || observer.impersonates_agent === true) errors.push('observer_impersonation_forbidden');
  return errors;
}

export function observerMetadata(input = {}) {
  return input?.metadata?.observer ?? null;
}

export function observerVisibility(input = {}) {
  const visibility = observerMetadata(input)?.visibility;
  return enumIncludes(OBSERVER_VISIBILITIES, visibility) ? visibility : 'operator_visible';
}

export function isObserverInputEvent(input = {}) {
  return Boolean(observerMetadata(input));
}

export function directiveMetadata(input = {}) {
  return isObject(input?.metadata?.directive) ? input.metadata.directive : null;
}

export function isDirectiveInputEvent(input = {}) {
  return Boolean(input?.directive_id) || directiveMetadata(input) !== null;
}

export function directiveVisibility(input = {}) {
  const visibility = directiveMetadata(input)?.visibility;
  return enumIncludes(DIRECTIVE_VISIBILITIES, visibility) ? visibility : 'agent_visible';
}

export function directivePayload(input = {}, extra = {}) {
  const metadata = directiveMetadata(input) ?? {};
  return {
    directive_id: input.directive_id ?? metadata.directive_id ?? null,
    input_event_id: input.event_id ?? null,
    directive_kind: metadata.kind ?? metadata.directive_kind ?? null,
    visibility: directiveVisibility(input),
    source_kind: input.source_kind ?? null,
    source_id: input.source_id ?? null,
    authority_ref: input.authority_ref ?? null,
    content_kind: metadata.content_kind ?? metadata.content?.kind ?? null,
    ...extra,
  };
}

export function classifyCarrierDirectiveInput(input = {}) {
  const isDirective = isDirectiveInputEvent(input);
  const visibility = directiveVisibility(input);
  const renderToAgent = isDirective && (visibility === 'agent_visible' || visibility === 'conversation_visible');
  const visibleToOperator = isDirective && (visibility === 'operator_visible' || visibility === 'conversation_visible');
  return {
    is_directive: isDirective,
    visibility,
    visible_to_operator: visibleToOperator,
    render_to_agent: renderToAgent,
    creates_turn: !isDirective || renderToAgent,
    completes_without_provider: isDirective && !renderToAgent,
    payload: isDirective ? directivePayload(input) : null,
  };
}

export function carrierDirectiveEmitterSpec(directive_kind = 'operation_heartbeat') {
  const normalizedDirectiveKind = enumIncludes(DIRECTIVE_KINDS, directive_kind) ? directive_kind : 'operation_heartbeat';
  return CARRIER_DIRECTIVE_EMITTER_REGISTRY[normalizedDirectiveKind] ?? CARRIER_DIRECTIVE_EMITTER_REGISTRY.operation_heartbeat;
}

export function classifyDirectiveEmissionRequest({ directive_kind = 'operation_heartbeat', enabled = true, rule = null, target = null } = {}) {
  const spec = CARRIER_DIRECTIVE_EMITTER_REGISTRY[directive_kind] ?? null;
  if (!spec) return { action: 'suppress', reason: 'directive_emission_unsupported_kind', directive_kind };
  if (!enabled) return { action: 'suppress', reason: 'directive_emission_disabled', directive_kind };
  if (rule && rule.status !== 'active') return { action: 'suppress', reason: 'directive_emission_rule_inactive', directive_kind };
  if (!target?.id) return { action: 'suppress', reason: 'directive_emission_target_missing', directive_kind };
  return { action: 'emit', reason: 'directive_emission_admitted', directive_kind, spec };
}

export function createCarrierDirectiveInput({
  directive_kind = 'operation_heartbeat',
  event_id,
  directive_id,
  authorization_id,
  rule_id,
  operation_id,
  carrier_session_id = null,
  site_id = null,
  operator_id = null,
  observer_id = null,
  created_at = nowIso(),
  source_id,
  authority_ref = null,
  cadence,
  visibility,
  reason,
  content,
  trigger_kind,
  target = null,
} = {}) {
  const spec = carrierDirectiveEmitterSpec(directive_kind);
  const normalizedDirectiveKind = spec.directive_kind;
  const normalizedOperationId = String(operation_id ?? '').trim();
  const normalizedVisibility = enumIncludes(DIRECTIVE_VISIBILITIES, visibility ?? spec.default_visibility) ? visibility ?? spec.default_visibility : spec.default_visibility;
  const normalizedCadence = cadence ?? spec.default_cadence ?? null;
  const normalizedTarget = target ?? { kind: spec.target_kind, id: carrier_session_id ?? operation_id ?? site_id ?? operator_id ?? observer_id ?? null };
  return createInputEvent({
    event_id: event_id ?? `input_${normalizedDirectiveKind}_${randomIdPart()}`,
    source_kind: spec.default_source_kind ?? 'system',
    source_id: source_id ?? spec.default_source_id ?? 'narada-proper.system.directive_emitter',
    transport: 'carrier_server_api',
    delivery_mode: spec.delivery_mode ?? 'admit_for_current_turn',
    hold_condition: null,
    content: content ?? spec.content ?? '',
    created_at,
    authority_ref: authority_ref ?? (authorization_id ? `directive_emission_authorization:${authorization_id}` : null),
    directive_id: directive_id ?? `dir_${normalizedDirectiveKind}_${randomIdPart()}`,
    metadata: {
      directive_provenance: { kind: 'system_directive' },
      directive: {
        kind: normalizedDirectiveKind,
        visibility: normalizedVisibility,
        ...(normalizedCadence ? { cadence: normalizedCadence } : {}),
        trigger_kind: trigger_kind ?? spec.trigger_kind,
        target: normalizedTarget,
        ...(normalizedOperationId ? { operation_id: normalizedOperationId } : {}),
        ...(carrier_session_id ? { carrier_session_id } : {}),
        ...(site_id ? { site_id } : {}),
        ...(operator_id ? { operator_id } : {}),
        ...(observer_id ? { observer_id } : {}),
        ...(authorization_id ? { authorization_id } : {}),
        ...(rule_id ? { rule_id } : {}),
        reason: reason ?? spec.default_reason,
      },
    },
  });
}

export function createDirectiveEmissionAuthorization({
  authorization_id,
  directive_kind = 'operation_heartbeat',
  cadence = 'PT1M',
  authorized_by = { kind: 'system', id: 'principal:service' },
  authorized_emitter = { kind: 'system', id: 'narada-proper.system.directive_emitter' },
  authority = { locus: 'narada_proper', basis: 'operator_authorized_system_directive' },
  target = { kind: 'carrier_session', id: null },
  status = 'authorized',
  created_at = nowIso(),
} = {}) {
  const spec = carrierDirectiveEmitterSpec(directive_kind);
  const normalizedDirectiveKind = spec.directive_kind;
  return {
    schema: 'narada.directive_emission_authorization.v1',
    authorization_id: authorization_id ?? `auth_${normalizedDirectiveKind}_${randomIdPart()}`,
    directive_kind: normalizedDirectiveKind,
    cadence: cadence ?? spec.default_cadence,
    authorized_by,
    authorized_emitter: authorized_emitter ?? spec.default_authorized_emitter,
    authority: authority ?? spec.default_authority,
    target,
    status,
    created_at,
  };
}

export function createDirectiveEmissionRule({
  rule_id,
  authorization_id,
  directive_kind = 'operation_heartbeat',
  cadence = 'PT1M',
  visibility = 'record_only',
  target = { kind: 'carrier_session', id: null },
  status = 'active',
  created_at = nowIso(),
} = {}) {
  const spec = carrierDirectiveEmitterSpec(directive_kind);
  const normalizedDirectiveKind = spec.directive_kind;
  return {
    schema: 'narada.directive_emission_rule.v1',
    rule_id: rule_id ?? `directive_emission_rule_${normalizedDirectiveKind}_${randomIdPart()}`,
    authorization_id: authorization_id ?? null,
    directive_kind: normalizedDirectiveKind,
    cadence: cadence ?? spec.default_cadence,
    trigger_kind: spec.trigger_kind,
    visibility: enumIncludes(DIRECTIVE_VISIBILITIES, visibility ?? spec.default_visibility) ? visibility ?? spec.default_visibility : spec.default_visibility,
    target,
    status,
    created_at,
  };
}

export function createOperationHeartbeatDirectiveInput({
  event_id,
  directive_id,
  authorization_id,
  rule_id,
  operation_id,
  carrier_session_id = null,
  created_at = nowIso(),
  source_id = 'narada-proper.system.directive_emitter',
  authority_ref = null,
  cadence = 'PT1M',
  reason = 'operation_continuity_heartbeat',
} = {}) {
  return createCarrierDirectiveInput({
    directive_kind: 'operation_heartbeat',
    event_id,
    directive_id,
    authorization_id,
    rule_id,
    operation_id,
    carrier_session_id,
    created_at,
    source_id,
    authority_ref,
    cadence,
    visibility: 'record_only',
    reason,
  });
}

export function directiveEmissionPayload({ authorization = null, rule = null, input = null, emitted_at = nowIso(), extra = {} } = {}) {
  return {
    authorization_id: authorization?.authorization_id ?? rule?.authorization_id ?? input?.metadata?.directive?.authorization_id ?? null,
    rule_id: rule?.rule_id ?? input?.metadata?.directive?.rule_id ?? null,
    directive_kind: rule?.directive_kind ?? input?.metadata?.directive?.kind ?? null,
    cadence: rule?.cadence ?? input?.metadata?.directive?.cadence ?? null,
    trigger_kind: rule?.trigger_kind ?? input?.metadata?.directive?.trigger_kind ?? null,
    visibility: rule?.visibility ?? directiveVisibility(input ?? {}),
    target: rule?.target ?? input?.metadata?.directive?.target ?? null,
    input_event_id: input?.event_id ?? null,
    directive_id: input?.directive_id ?? null,
    operation_id: input?.metadata?.directive?.operation_id ?? null,
    carrier_session_id: input?.metadata?.directive?.carrier_session_id ?? null,
    emitted_at,
    ...extra,
  };
}

export function observerPayload(input = {}, extra = {}) {
  const metadata = observerMetadata(input) ?? {};
  return {
    observer_id: input.source_id ?? 'narada.observer',
    rule_id: metadata.rule_id ?? 'manual-observer-interjection',
    visibility: observerVisibility(input),
    ...(metadata.confidence ? { confidence: metadata.confidence } : {}),
    content: String(input.content ?? '').trim(),
    ...(input.event_id ? { input_event_id: input.event_id } : {}),
    ...extra,
  };
}

export function classifyCarrierObserverInput(input = {}, { observerMuted = false } = {}) {
  const isObserver = isObserverInputEvent(input);
  const visibility = observerVisibility(input);
  const visibleToOperator = isObserver && (visibility === 'operator_visible' || visibility === 'conversation_visible');
  const dispatchToAgent = isObserver && (visibility === 'agent_visible' || visibility === 'conversation_visible');
  const interjection = isObserver && visibility !== 'record_only';
  const suppressed = interjection && observerMuted === true;
  return {
    is_observer: isObserver,
    visibility,
    observer_muted: observerMuted === true,
    suppressed,
    suppression_reason: suppressed ? 'observer_muted' : null,
    visible_to_operator: visibleToOperator && !suppressed,
    dispatch_to_agent: dispatchToAgent && !suppressed,
    creates_turn: !isObserver || dispatchToAgent && !suppressed,
    completes_without_provider: isObserver && (!dispatchToAgent || suppressed),
    handle_outside_turn: isObserver && (suppressed || !dispatchToAgent),
    payload: isObserver ? observerPayload(input, suppressed ? { suppression_reason: 'observer_muted' } : {}) : null,
  };
}

export function classifyCarrierInputAdmission(input = {}, state = {}) {
  const inputAdmission = classifyInputAdmission(input, state);
  const event = inputAdmission.event;
  const observer = classifyCarrierObserverInput(event, { observerMuted: state.observerMuted === true });
  const directive = classifyCarrierDirectiveInput(event);
  const inputEventId = event?.event_id ?? null;
  const queueEvents = [];
  const admissionEvents = [];
  const visibleEvents = [];
  let terminalState = null;
  if (inputAdmission.action === 'queue' && inputAdmission.queue_state === 'queued_for_turn_boundary') {
    queueEvents.push({
      event_kind: 'input_queued_for_turn_boundary',
      payload: {
        input_event_id: inputEventId,
        queue_state: inputAdmission.queue_state,
      },
    });
  }
  if (observer.is_observer) {
    admissionEvents.push({
      event_kind: 'observer_observation_recorded',
      payload: observerPayload(event),
    });
    if (observer.visibility !== 'record_only') {
      admissionEvents.push({
        event_kind: 'observer_interjection_proposed',
        payload: observerPayload(event),
      });
    }
    if (inputAdmission.action === 'admit') {
      if (observer.suppressed) {
        admissionEvents.push({
          event_kind: 'observer_interjection_suppressed',
          payload: observer.payload,
        });
        terminalState = 'completed_without_provider';
      } else if (observer.visibility !== 'record_only') {
        admissionEvents.push({
          event_kind: 'observer_interjection_admitted',
          payload: observer.payload,
        });
      }
      if (observer.visible_to_operator) {
        visibleEvents.push({
          event_kind: 'observer_interjection_visible',
          payload: observer.payload,
        });
      }
      if (observer.completes_without_provider) terminalState = 'completed_without_provider';
    }
  }
  if (directive.is_directive && inputAdmission.action === 'admit') {
    admissionEvents.push({
      event_kind: 'directive_receipt_recorded',
      payload: directivePayload(event),
    });
    admissionEvents.push({
      event_kind: 'directive_carrier_accepted_recorded',
      payload: directivePayload(event, { carrier_acceptance: 'accepted_for_session_flow' }),
    });
    if (directive.completes_without_provider) terminalState = 'completed_without_provider';
  }
  const createsTurn = inputAdmission.action === 'admit' && observer.creates_turn && directive.creates_turn;
  const providerDispatchSurface = observer.is_observer || directive.is_directive;
  const observerAllowsProviderDispatch = !observer.is_observer || observer.dispatch_to_agent;
  const directiveAllowsProviderDispatch = !directive.is_directive || directive.render_to_agent;
  const dispatchToProvider = inputAdmission.action === 'admit'
    && providerDispatchSurface
    && observerAllowsProviderDispatch
    && directiveAllowsProviderDispatch;
  if (createsTurn) {
    admissionEvents.push({
      event_kind: 'input_admitted_to_turn',
      payload: {
        input_event_id: inputEventId,
      },
    });
  }
  return {
    input_event_id: inputEventId,
    source_kind: event?.source_kind ?? null,
    source_id: event?.source_id ?? null,
    admission_action: inputAdmission.action,
    admission_reason: inputAdmission.reason,
    queue_state: inputAdmission.queue_state ?? null,
    is_observer: observer.is_observer,
    visibility: observer.is_observer ? observer.visibility : null,
    suppressed: observer.suppressed,
    suppression_reason: observer.suppression_reason,
    visible_to_operator: observer.visible_to_operator,
    dispatch_to_provider: dispatchToProvider,
    is_directive: directive.is_directive,
    directive_visibility: directive.is_directive ? directive.visibility : null,
    directive_render_to_agent: directive.render_to_agent,
    creates_turn: createsTurn,
    complete_without_provider: inputAdmission.action === 'admit' && (observer.completes_without_provider || directive.completes_without_provider),
    terminal_state: terminalState,
    queue_events: queueEvents,
    admission_events: admissionEvents,
    visible_events: visibleEvents,
    event,
  };
}

export function classifyCarrierInputQueueAdmission(input = {}, state = {}) {
  const admission = classifyCarrierInputAdmission(input, state);
  const queueEvents = [...admission.queue_events];
  const shouldRecordTurnBoundaryQueue = admission.event?.delivery_mode === 'admit_after_active_turn';
  const alreadyRecordedTurnBoundaryQueue = queueEvents.some((event) => (
    event.event_kind === 'input_queued_for_turn_boundary'
      && event.payload?.input_event_id === admission.input_event_id
  ));
  if (shouldRecordTurnBoundaryQueue && !alreadyRecordedTurnBoundaryQueue) {
    queueEvents.push({
      event_kind: 'input_queued_for_turn_boundary',
      payload: {
        input_event_id: admission.input_event_id,
        queue_state: 'queued_for_turn_boundary',
      },
    });
  }
  return {
    ...admission,
    queue_action: 'enqueue',
    queue_state: shouldRecordTurnBoundaryQueue ? 'queued_for_turn_boundary' : admission.queue_state,
    queue_events: queueEvents,
  };
}

export function classifyCarrierInputHold(input = {}, state = {}) {
  const metadata = isObject(input.metadata) ? input.metadata : {};
  const directiveProvenance = isObject(metadata.directive_provenance) ? metadata.directive_provenance : {};
  const isSystemDirective = input.source_kind === 'system'
    || input.source === 'system_directive'
    || directiveProvenance.kind === 'system_directive';
  const inputEventId = input.event_id ?? null;
  const directiveId = input.directive_id ?? null;
  const occurredAt = state.occurredAt ?? nowIso();
  const shouldHold = isSystemDirective
    && Boolean(state.composerHasDraft)
    && (input.hold_condition === 'composer_clear_required' || input.source === 'system_directive');
  if (state.release === true) {
    if (!isSystemDirective || state.alreadyHeld !== true) {
      return {
        input_event_id: inputEventId,
        is_system_directive: isSystemDirective,
        hold_action: 'none',
        hold_reason: null,
        should_defer: false,
        hold_events: [],
        release_events: [],
        events: [],
        event: input,
      };
    }
    const releaseEvent = {
      event_kind: 'system_directive_released',
      payload: {
        input_event_id: inputEventId,
        ...(directiveId ? { directive_id: directiveId } : {}),
        released_at: occurredAt,
      },
    };
    return {
      input_event_id: inputEventId,
      is_system_directive: isSystemDirective,
      hold_action: 'release',
      hold_reason: null,
      should_defer: false,
      hold_events: [],
      release_events: [releaseEvent],
      events: [releaseEvent],
      event: input,
    };
  }
  if (!shouldHold || state.alreadyHeld === true) {
    return {
      input_event_id: inputEventId,
      is_system_directive: isSystemDirective,
      hold_action: shouldHold ? 'hold' : 'none',
      hold_reason: shouldHold ? 'composer_nonempty' : null,
      should_defer: shouldHold,
      hold_events: [],
      release_events: [],
      events: [],
      event: input,
    };
  }
  const holdEvent = {
    event_kind: 'system_directive_held',
    payload: {
      input_event_id: inputEventId,
      ...(directiveId ? { directive_id: directiveId } : {}),
      held_at: occurredAt,
      held_reason: 'composer_nonempty',
      original_delivery_mode: input.delivery_mode ?? null,
    },
  };
  return {
    input_event_id: inputEventId,
    is_system_directive: isSystemDirective,
    hold_action: 'hold',
    hold_reason: 'composer_nonempty',
    should_defer: true,
    hold_events: [holdEvent],
    release_events: [],
    events: [holdEvent],
    event: input,
  };
}

function isObserverSourceId(sourceId) {
  if (typeof sourceId !== 'string') return false;
  return sourceId === 'narada.observer'
    || sourceId.startsWith('narada.observer.')
    || sourceId.endsWith('.observer');
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
  if (record.schema === INPUT_EVENT_SCHEMA) {
    return createControlInputRecord({
      control_event_id: record.control_event_id ?? createControlEventId(),
      written_at: record.written_at ?? record.created_at ?? nowIso(),
      input: normalizeInputEvent(record),
    });
  }
  if (record.input && isObject(record.input)) {
    if (record.input.schema !== INPUT_EVENT_SCHEMA) {
      throw new Error('invalid_carrier_control_input_record:input.invalid_schema');
    }
    return createControlInputRecord({
      control_event_id: record.control_event_id ?? record.event_id ?? createControlEventId(),
      written_at: record.written_at ?? record.created_at ?? nowIso(),
      input: normalizeInputEvent(record.input),
    });
  }
  throw new Error('invalid_carrier_control_input_record:unsupported_shape');
}

const SESSION_PAYLOAD_VALIDATORS = Object.freeze({
  carrier_session_started: (payload) => requireFields(payload, [
    'carrier_kind',
    'carrier_host',
    'protocol_version',
    'runtime_contract_version',
  ]),
  input_queued_for_turn_boundary: (payload) => requireFields(payload, ['input_event_id', 'queue_state']),
  input_admitted_to_turn: (payload) => requireFields(payload, ['input_event_id']),
  input_dropped_by_operator: (payload) => requireFields(payload, ['input_event_id', 'drop_reason']),
  input_abandoned_on_session_end: (payload) => requireFields(payload, ['input_event_id']),
  input_completed: (payload) => requireFields(payload, ['input_event_id', 'terminal_state']),
  system_directive_held: validateSystemDirectiveHeldPayload,
  system_directive_released: validateSystemDirectiveReleasedPayload,
  directive_emission_authorized: (payload) => requireFields(payload, ['authorization_id', 'directive_kind', 'cadence', 'authorized_emitter', 'authority', 'status']),
  directive_emission_rule_recorded: (payload) => requireFields(payload, ['rule_id', 'authorization_id', 'directive_kind', 'cadence', 'visibility', 'status']),
  directive_emitted: (payload) => requireFields(payload, ['authorization_id', 'rule_id', 'directive_kind', 'cadence', 'visibility', 'input_event_id', 'directive_id', 'emitted_at']),
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
  observer_observation_recorded: validateObserverPayload,
  observer_interjection_proposed: validateObserverPayload,
  observer_interjection_admitted: validateObserverPayload,
  observer_interjection_visible: validateObserverPayload,
  observer_interjection_suppressed: validateObserverPayload,
  carrier_command_executed: (payload) => requireFields(payload, ['command']),
  carrier_diagnostic_recorded: validateCarrierDiagnosticPayload,
  carrier_session_closed: (payload) => requireFields(payload, ['reason']),
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
  if (!enumIncludes(TOOL_RESULT_STATUSES, payload.status)) errors.push(`payload.invalid_status:${String(payload.status)}`);
  if (payload.admission_action !== undefined && !enumIncludes(TOOL_EFFECT_ADMISSION_ACTIONS, payload.admission_action)) errors.push(`payload.invalid_admission_action:${String(payload.admission_action)}`);
  if (payload.admission_reason !== undefined && !enumIncludes(TOOL_EFFECT_ADMISSION_REASONS, payload.admission_reason)) errors.push(`payload.invalid_admission_reason:${String(payload.admission_reason)}`);
  if (payload.admission_action !== undefined && payload.admission_reason === undefined) errors.push('payload.missing_admission_reason');
  if (payload.admission_reason !== undefined && payload.admission_action === undefined) errors.push('payload.missing_admission_action');
  if (payload.admission_action === 'deny' && payload.status !== 'denied') errors.push('payload.admission_action_status_mismatch');
  if (payload.admission_action === 'admit' && payload.status === 'denied') errors.push('payload.admission_action_status_mismatch');
  if (payload.admission_action === 'admit' && ['tool_effect_adapter_unconfigured', 'tool_effect_admission_required', 'unsupported_tool_effect', 'tool_effect_authority_denied'].includes(payload.admission_reason)) errors.push('payload.admission_reason_action_mismatch');
  if (payload.admission_action === 'deny' && ['read_only_tool_effect_admitted', 'write_tool_effect_admitted'].includes(payload.admission_reason)) errors.push('payload.admission_reason_action_mismatch');
  if (payload.capability_ref !== undefined && (typeof payload.capability_ref !== 'string' || payload.capability_ref.length === 0)) errors.push('payload.invalid_capability_ref');
  if (payload.effect_scope !== undefined && (typeof payload.effect_scope !== 'string' || payload.effect_scope.length === 0)) errors.push('payload.invalid_effect_scope');
  if (payload.authority_ref !== undefined && (typeof payload.authority_ref !== 'string' || payload.authority_ref.length === 0)) errors.push('payload.invalid_authority_ref');
  if (typeof payload.duration_ms !== 'number' || payload.duration_ms < 0) errors.push('payload.invalid_duration_ms');
  if (typeof payload.result_summary !== 'string') errors.push('payload.invalid_result_summary');
  errors.push(...validateOptionalPayloadRef(payload, 'result_ref'));
  return errors;
}

function validateObserverPayload(payload) {
  const errors = requireFields(payload, ['observer_id', 'rule_id', 'visibility', 'content']);
  if (errors.length > 0) return errors;
  if (typeof payload.observer_id !== 'string' || payload.observer_id.length === 0) errors.push('payload.invalid_observer_id');
  if (typeof payload.rule_id !== 'string' || payload.rule_id.length === 0) errors.push('payload.invalid_rule_id');
  if (!enumIncludes(OBSERVER_VISIBILITIES, payload.visibility)) errors.push(`payload.invalid_visibility:${String(payload.visibility)}`);
  if (payload.confidence !== undefined && !enumIncludes(OBSERVER_CONFIDENCES, payload.confidence)) errors.push(`payload.invalid_confidence:${String(payload.confidence)}`);
  if (typeof payload.content !== 'string' || payload.content.length === 0) errors.push('payload.invalid_content');
  if (payload.input_event_id !== undefined && (typeof payload.input_event_id !== 'string' || !payload.input_event_id.startsWith('input_'))) errors.push('payload.invalid_input_event_id');
  if (payload.suppression_reason !== undefined && (typeof payload.suppression_reason !== 'string' || payload.suppression_reason.length === 0)) errors.push('payload.invalid_suppression_reason');
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

export function createToolCallPayload({ tool_name, arguments_summary, requesting_agent_id, arguments_ref = null }) {
  return {
    tool_name,
    arguments_summary,
    arguments_ref,
    requesting_agent_id,
  };
}

export function createToolResultPayload({
  tool_name,
  status,
  duration_ms,
  result_summary,
  result_ref = null,
  admission_action = undefined,
  admission_reason = undefined,
  capability_ref = undefined,
  effect_scope = undefined,
  authority_ref = undefined,
}) {
  return {
    tool_name,
    status,
    ...(admission_action === undefined ? {} : { admission_action }),
    ...(admission_reason === undefined ? {} : { admission_reason }),
    ...(capability_ref === undefined ? {} : { capability_ref }),
    ...(effect_scope === undefined ? {} : { effect_scope }),
    ...(authority_ref === undefined ? {} : { authority_ref }),
    duration_ms,
    result_summary,
    result_ref,
  };
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

export function normalizeNarsRuntimeEventKind(eventKind) {
  if (typeof eventKind !== 'string') return eventKind;
  return NARS_RUNTIME_EVENT_ALIASES[eventKind] ?? eventKind;
}

export function narsLifecycleHookKind(hook) {
  if (NARS_SESSION_LIFECYCLE_HOOKS.includes(hook)) return 'session';
  if (NARS_TURN_LIFECYCLE_HOOKS.includes(hook)) return 'turn';
  return null;
}

export function isNarsRuntimeEventKind(eventKind) {
  return NARS_RUNTIME_EVENT_KINDS.includes(normalizeNarsRuntimeEventKind(eventKind));
}

export function narsLifecycleHooksForEvent(event) {
  const eventKind = normalizeNarsRuntimeEventKind(isObject(event) ? event.event : event);
  return NARS_EVENT_TO_LIFECYCLE_HOOKS[eventKind] ?? Object.freeze([]);
}

export function createNarsLifecycleHookPayload({
  hook,
  agent_id,
  session_id,
  request_id = undefined,
  turn_id = undefined,
  directive_id = undefined,
  event_kind = undefined,
  timestamp = nowIso(),
  terminal_state = undefined,
  error = undefined,
  metadata = undefined,
  source_event = undefined,
}) {
  const normalizedEventKind = event_kind === undefined ? undefined : normalizeNarsRuntimeEventKind(event_kind);
  const payload = {
    schema: NARS_LIFECYCLE_HOOK_SCHEMA,
    hook,
    hook_kind: narsLifecycleHookKind(hook),
    agent_id,
    session_id,
    timestamp,
    ...(normalizedEventKind === undefined ? {} : { event_kind: normalizedEventKind }),
    ...(request_id === undefined ? {} : { request_id }),
    ...(turn_id === undefined ? {} : { turn_id }),
    ...(directive_id === undefined ? {} : { directive_id }),
    ...(terminal_state === undefined ? {} : { terminal_state }),
    ...(error === undefined ? {} : { error }),
    ...(metadata === undefined ? {} : { metadata }),
    ...(source_event === undefined ? {} : { source_event }),
  };
  assertValidNarsLifecycleHookPayload(payload);
  return payload;
}

export function narsLifecycleHookPayloadFromEvent({ hook, event, timestamp = nowIso(), metadata = undefined }) {
  const eventKind = normalizeNarsRuntimeEventKind(event?.event);
  return createNarsLifecycleHookPayload({
    hook,
    agent_id: event?.agent_id,
    session_id: event?.session_id,
    request_id: event?.request_id,
    turn_id: event?.turn_id,
    directive_id: event?.directive_id,
    event_kind: eventKind,
    timestamp: event?.timestamp ?? timestamp,
    terminal_state: event?.terminal_state,
    error: event?.error ?? (event?.code || event?.message ? { code: event.code ?? 'runtime_error', message: event.message ?? String(event.code) } : undefined),
    metadata,
    source_event: event,
  });
}

export function validateNarsLifecycleHookPayload(payload) {
  const errors = [];
  if (!isObject(payload)) return ['nars_lifecycle_hook_not_object'];
  if (payload.schema !== NARS_LIFECYCLE_HOOK_SCHEMA) errors.push(`invalid_schema:${String(payload.schema)}`);
  for (const field of CARRIER_PROTOCOL_SCHEMAS.nars_lifecycle_hook.required) {
    if (!hasOwn(payload, field)) errors.push(`missing_required_field:${field}`);
  }
  const hookKind = narsLifecycleHookKind(payload.hook);
  if (!hookKind) errors.push(`invalid_hook:${String(payload.hook)}`);
  if (payload.hook_kind !== hookKind) errors.push(`invalid_hook_kind:${String(payload.hook_kind)}`);
  for (const field of ['agent_id', 'session_id']) {
    if (typeof payload[field] !== 'string' || payload[field].length === 0) errors.push(`invalid_${field}`);
  }
  if (!isRfc3339Utc(payload.timestamp)) errors.push('invalid_timestamp');
  if (payload.event_kind !== undefined && !isNarsRuntimeEventKind(payload.event_kind)) errors.push(`invalid_event_kind:${String(payload.event_kind)}`);
  for (const field of ['request_id', 'turn_id', 'directive_id', 'terminal_state']) {
    if (payload[field] !== undefined && payload[field] !== null && typeof payload[field] !== 'string') errors.push(`invalid_${field}`);
  }
  if (payload.terminal_state !== undefined && payload.terminal_state !== null) {
    const terminalStates = payload.hook_kind === 'session' ? NARS_SESSION_TERMINAL_STATES : NARS_TURN_TERMINAL_STATES;
    if (!terminalStates.includes(payload.terminal_state)) errors.push(`invalid_terminal_state:${String(payload.terminal_state)}`);
  }
  if (payload.error !== undefined && payload.error !== null && typeof payload.error !== 'string' && !isObject(payload.error)) errors.push('invalid_error');
  if (payload.metadata !== undefined && payload.metadata !== null && !isObject(payload.metadata)) errors.push('invalid_metadata');
  if (payload.source_event !== undefined && payload.source_event !== null && !isObject(payload.source_event)) errors.push('invalid_source_event');
  return errors;
}

export function assertValidNarsLifecycleHookPayload(payload) {
  const errors = validateNarsLifecycleHookPayload(payload);
  if (errors.length > 0) throw new Error(`invalid_nars_lifecycle_hook:${errors.join(',')}`);
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
