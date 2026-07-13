import { agentIdentityDisplay, agentIdentityGroupKey } from '@narada2/agent-identity';
import { NARS_SESSION_CORE_METHOD_LIST, NARS_SESSION_CORE_METHODS, isNarsSessionCoreMethod } from '@narada2/nars-session-core/session-control-contract';

export { NARS_SESSION_CORE_METHOD_LIST, NARS_SESSION_CORE_METHODS, isNarsSessionCoreMethod };

export const NARS_COMMAND_METHOD = 'session.command.execute';
export const NARS_AFFORDANCE_ACTION_REQUEST_METHOD = 'session.affordance.action.request';
export const NARS_AFFORDANCE_ACTION_CONFIRM_METHOD = 'session.affordance.action.confirm';
export const NARS_AFFORDANCE_ACTION_CANCEL_METHOD = 'session.affordance.action.cancel';

export const NARS_AFFORDANCE_ACTION_EVENTS = Object.freeze({
  requested: 'session_affordance_action_requested',
  result: 'session_affordance_action_result',
  refused: 'session_affordance_action_refused',
  confirmationRequired: 'session_affordance_confirmation_required',
  confirmed: 'session_affordance_action_confirmed',
  cancelled: 'session_affordance_action_cancelled',
});

export const NARS_AFFORDANCE_ACTION_SCHEMAS = Object.freeze({
  request: 'narada.nars.affordance_action_request.v1',
  result: 'narada.nars.affordance_action_result.v1',
  refusal: 'narada.nars.affordance_action_refusal.v1',
  confirmationRequired: 'narada.nars.affordance_action_confirmation_required.v1',
  confirmed: 'narada.nars.affordance_action_confirmed.v1',
  cancelled: 'narada.nars.affordance_action_cancelled.v1',
});

export const NARS_AFFORDANCE_ACTION_POSTURES = Object.freeze({
  confirmationRequired: 'confirmation_required',
  readOnlyOrIdempotent: 'read_only_or_idempotent',
  unsafe: 'unsafe',
});

export const NARS_AFFORDANCE_ACTION_REFUSAL_CODES = Object.freeze({
  requiredIdentity: 'surface_id_and_action_id_required',
  surfaceNotFound: 'surface_affordance_not_found',
  actionNotFound: 'surface_affordance_action_not_found',
  targetNotExecutable: 'affordance_action_target_not_executable',
  confirmationRequired: 'affordance_action_confirmation_required',
  notReadOnly: 'affordance_action_not_read_only',
  serverUnavailable: 'surface_mcp_server_unavailable',
  toolUnavailable: 'surface_affordance_tool_unavailable',
  confirmationNotFound: 'affordance_action_confirmation_not_found',
});

export const NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS = Object.freeze([
  'conversation',
  'operations',
  'diagnostics',
  'raw',
]);

export const NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY = 'conversation';

export const NARS_CLIENT_PROJECTION_VERBOSITY_RANK = Object.freeze({
  conversation: 0,
  operations: 1,
  diagnostics: 2,
  raw: 3,
});

// These are the only controls admitted by the local session-core transport.
// Event subscription/read are transport controls handled by the event stream.
export const AGENT_WEB_UI_NARS_METHOD_LIST = NARS_SESSION_CORE_METHOD_LIST;

// Retained only for the deprecated predecessor and the Cloudflare adapter.
// These methods are not part of the local session-core control contract.
export const AGENT_WEB_UI_LEGACY_METHOD_LIST = Object.freeze([
  'session.artifacts.register',
  'session.artifacts.read',
  'session.artifacts.summary',
  'session.surface.affordances',
  NARS_AFFORDANCE_ACTION_REQUEST_METHOD,
  NARS_AFFORDANCE_ACTION_CONFIRM_METHOD,
  NARS_AFFORDANCE_ACTION_CANCEL_METHOD,
  'session.sop.summary',
  'session.inbox.summary',
  'session.delegation.summary',
  'session.git.summary',
  'session.surface_feedback.summary',
  'session.mailbox.summary',
  'session.scheduler.summary',
  'session.task_lifecycle.summary',
  'conversation.send',
  'conversation.enqueue',
  'session.status',
  'session.operations',
  'observers.status',
  'observer.mute',
  'observer.unmute',
  NARS_COMMAND_METHOD,
  'conversation.interrupt',
  'conversation.steer',
]);

export const AGENT_WEB_UI_CLOUDFLARE_METHOD_LIST = Object.freeze([
  ...NARS_SESSION_CORE_METHOD_LIST,
  ...AGENT_WEB_UI_LEGACY_METHOD_LIST,
]);

export const AGENT_WEB_UI_SESSION_COMMANDS = Object.freeze([
  '/goal',
  '/stats',
  '/model',
  '/thinking',
  '/tool-output',
  '/tools',
  '/help, /clear, /status, /health, /events, /recovery, /ops, /interrupt, /tools, /queue, /goal, /model, /thinking, /exit',
  'Ordinary text is submitted with session.submit. Active-turn queueing uses delivery_mode=admit_after_active_turn.',
]);

export const NARS_CLIENT_EVENT_TONES = Object.freeze({
  assistant: 'assistant',
  operator: 'operator',
  tool: 'tool',
  session: 'session',
  status: 'status',
  error: 'error',
  local: 'local',
  unknown: 'unknown',
});

export const NARS_CLIENT_EVENT_LABELS = Object.freeze({
  assistant_message: 'Agent',
  assistant_message_stream: 'Agent',
  user_message: 'Operator',
  tool_call: 'Tool call',
  tool_result: 'Tool result',
  session_started: 'Session started',
  session_closed: 'Session closed',
  turn_started: 'Turn started',
  turn_complete: 'Turn complete',
  turn_failed: 'Turn failed',
  session_events_subscription_started: 'Replay attached',
  session_artifact_registered: 'Artifact registered',
  session_artifact_read: 'Artifact',
  session_health: 'Health',
  runtime_projection_failure: 'Runtime projection failure',
  runtime_control_input_bridge_error: 'Control-input bridge error',
  runtime_intelligence_reconfiguration: 'Intelligence reconfiguration',
  provider_runtime_reconfiguration_state_transition: 'Intelligence reconfiguration state',
  carrier_diagnostic_recorded: 'Diagnostic',
  mcp_runtime_fault: 'MCP runtime fault',
  authority_session_revoked: 'Session revoked',
  projection_revoked: 'Projection revoked',
  session_status: 'Status',
  [NARS_AFFORDANCE_ACTION_EVENTS.requested]: 'Affordance action',
  [NARS_AFFORDANCE_ACTION_EVENTS.result]: 'Affordance result',
  [NARS_AFFORDANCE_ACTION_EVENTS.refused]: 'Affordance refused',
  [NARS_AFFORDANCE_ACTION_EVENTS.confirmationRequired]: 'Confirmation required',
  [NARS_AFFORDANCE_ACTION_EVENTS.confirmed]: 'Affordance confirmed',
  [NARS_AFFORDANCE_ACTION_EVENTS.cancelled]: 'Affordance cancelled',
  session_recovery: 'Recovery',
  session_operations: 'Operations',
  observers_status: 'Observers',
  error: 'Error',
  websocket_error: 'WebSocket error',
  web_ui_decode_error: 'Decode error',
  web_ui_input_not_sent: 'Input not sent',
  agent_web_ui_help: 'Help',
  agent_web_ui_message: 'Message',
  operator_input_submitted: 'Operator input',
  conversation_enqueue_requested: 'Input queued',
  authority_source_draining: 'Authority draining',
  authority_source_sealed: 'Authority sealed',
  authority_source_write_refused: 'Source write refused',
  authority_target_prepared: 'Target prepared',
  authority_target_active: 'Target active',
  authority_target_write_refused: 'Target write refused',
  authority_target_activation_refused: 'Target activation refused',
  authority_source_status: 'Authority status',
  authority_target_status: 'Authority status',
  input_queued_for_turn_boundary: 'Queued input',
  input_admitted_to_turn: 'Input admitted',
  input_dropped_by_operator: 'Input dropped',
  input_abandoned_on_session_end: 'Input abandoned',
  input_completed: 'Input complete',
});

export const AGENT_WEB_UI_NARS_METHODS = new Set(AGENT_WEB_UI_NARS_METHOD_LIST);
export const AGENT_WEB_UI_LEGACY_METHODS = new Set(AGENT_WEB_UI_LEGACY_METHOD_LIST);
export const AGENT_WEB_UI_CLOUDFLARE_METHODS = new Set(AGENT_WEB_UI_CLOUDFLARE_METHOD_LIST);

export function isAgentWebUiNarsMethod(method) {
  return AGENT_WEB_UI_NARS_METHODS.has(method);
}

export function isAgentWebUiLegacyNarsMethod(method) {
  return AGENT_WEB_UI_LEGACY_METHODS.has(method);
}

export function isAgentWebUiCloudflareMethod(method) {
  return AGENT_WEB_UI_CLOUDFLARE_METHODS.has(method);
}

function authorityTransitionSummary(event, kind) {
  const source = event.authority_transition_source && typeof event.authority_transition_source === 'object' ? event.authority_transition_source : null;
  const target = event.authority_transition_target && typeof event.authority_transition_target === 'object' ? event.authority_transition_target : null;
  const locator = source?.target_authority_locator ?? target?.target_authority_locator ?? null;
  const locatorText = authorityLocatorSummary(locator, source?.authority_locator_ref ?? target?.authority_locator_ref ?? null);
  if (kind === 'authority_source_draining') return 'source draining; new source writes refused';
  if (kind === 'authority_source_sealed') return `${source?.state ?? 'source sealed'}${locatorText ? `; target ${locatorText}` : ''}`;
  if (kind === 'authority_source_write_refused') return `${event.code ?? 'source write refused'}${locatorText ? `; reattach ${locatorText}` : ''}`;
  if (kind === 'authority_target_prepared') return `target prepared; writes ${target?.target_write_admission ?? 'not admitted'}${locatorText ? `; ${locatorText}` : ''}`;
  if (kind === 'authority_target_active') return `target active epoch ${event.authority_epoch_token?.target_authority_epoch ?? 'unknown'}; first event ${event.target_first_sequence ?? 'unknown'}${locatorText ? `; ${locatorText}` : ''}`;
  if (kind === 'authority_target_write_refused') return event.code ?? 'target write refused';
  if (kind === 'authority_target_activation_refused') {
    const refusals = Array.isArray(event.refusals) ? event.refusals.map((entry) => entry?.reason_code).filter(Boolean).join(', ') : '';
    return refusals ? `target activation refused: ${refusals}` : 'target activation refused';
  }
  if (kind === 'authority_source_status' || kind === 'authority_target_status') {
    return `source ${source?.state ?? 'unknown'}; target ${target?.state ?? 'unknown'}${locatorText ? `; ${locatorText}` : ''}`;
  }
  return event.message ?? kind;
}

function authorityLocatorSummary(locator, fallbackRef = null) {
  if (locator && typeof locator === 'object') {
    const host = locator.kind ?? locator.host_kind ?? 'target';
    const session = locator.session_id ?? locator.sessionId ?? null;
    const site = locator.site_id ?? locator.siteId ?? null;
    if (session && site) return `${host}/${site}/${session}`;
    if (session) return `${host}/${session}`;
    if (site) return `${host}/${site}`;
    return String(host);
  }
  return typeof fallbackRef === 'string' && fallbackRef.trim() ? fallbackRef.trim() : null;
}

export function buildNarsArtifactRefPart({ artifactId, artifact_id, kind = null, title = null, renderHint = null, render_hint = null } = {}) {
  const id = artifact_id ?? artifactId;
  if (!id) return null;
  return {
    type: 'artifact_ref',
    artifact_id: String(id),
    ...(kind ? { kind: String(kind) } : {}),
    ...(title ? { title: String(title) } : {}),
    ...(render_hint ?? renderHint ? { render_hint: String(render_hint ?? renderHint) } : {}),
  };
}

export function buildNarsIntentRefPart({
  intent,
  intentRef,
  intent_ref,
  label = null,
  description = null,
  target = null,
  action = null,
  args = null,
} = {}) {
  const token = intent_ref ?? intentRef ?? intent;
  if (!token) return null;
  return {
    type: 'intent_ref',
    intent: String(token),
    ...(label ? { label: String(label) } : {}),
    ...(description ? { description: String(description) } : {}),
    ...(target ? { target: String(target) } : {}),
    ...(action ? { action: String(action) } : {}),
    ...(args && typeof args === 'object' && !Array.isArray(args) ? { args } : {}),
  };
}

export function buildAgentWebUiConversationEnqueueFrame(text, options = {}) {
  const message = String(text ?? '').trim();
  if (!message) return null;
  return {
    id: options.id ?? `agent-web-ui-enqueue-${Date.now()}`,
    method: 'session.submit',
    params: {
      content: message,
      source: 'operator_steering',
      delivery_mode: 'admit_after_active_turn',
      ...(options.activeTurnId ? { active_turn_id: options.activeTurnId } : {}),
    },
  };
}

export function buildAgentWebUiEventsReadFrame(options = {}) {
  const params = {
    limit: Number.isFinite(options.limit) ? options.limit : 100,
  };
  if (options.afterSequence !== undefined) params.after_sequence = options.afterSequence;
  if (options.beforeSequence !== undefined) params.before_sequence = options.beforeSequence;
  if (options.sinceTimestamp !== undefined) params.since_timestamp = options.sinceTimestamp;
  if (options.direction !== undefined) params.direction = options.direction;
  if (options.filters && typeof options.filters === 'object') params.filters = options.filters;
  return {
    id: options.id ?? `agent-web-ui-events-read-${Date.now()}`,
    method: 'session.events.read',
    params,
  };
}

export function buildAgentWebUiSopSummaryFrame(options = {}) {
  return {
    id: options.id ?? `agent-web-ui-sop-summary-${Date.now()}`,
    method: 'session.sop.summary',
    params: {
      template_limit: Number.isFinite(options.templateLimit) ? options.templateLimit : 50,
      run_limit: Number.isFinite(options.runLimit) ? options.runLimit : 50,
      include_terminal: options.includeTerminal !== false,
    },
  };
}

export function buildAgentWebUiMailboxSummaryFrame(options = {}) {
  return {
    id: options.id ?? `agent-web-ui-mailbox-summary-${Date.now()}`,
    method: 'session.mailbox.summary',
    params: {
      account_limit: Number.isFinite(options.accountLimit) ? options.accountLimit : 20,
      message_limit: Number.isFinite(options.messageLimit) ? options.messageLimit : 25,
      ...(typeof options.query === 'string' && options.query ? { query: options.query } : {}),
    },
  };
}

export function buildAgentWebUiInboxSummaryFrame(options = {}) {
  return {
    id: options.id ?? `agent-web-ui-inbox-summary-${Date.now()}`,
    method: 'session.inbox.summary',
    params: {
      limit: Number.isFinite(options.limit) ? options.limit : 20,
      status: typeof options.status === 'string' && options.status ? options.status : 'received',
      ...(typeof options.targetRole === 'string' && options.targetRole ? { target_role: options.targetRole } : {}),
    },
  };
}

export function buildAgentWebUiDelegationSummaryFrame(options = {}) {
  return {
    id: options.id ?? `agent-web-ui-delegation-summary-${Date.now()}`,
    method: 'session.delegation.summary',
    params: {
      worker_limit: Number.isFinite(options.workerLimit) ? options.workerLimit : 20,
      task_limit: Number.isFinite(options.taskLimit) ? options.taskLimit : 20,
      include_terminal: options.includeTerminal !== false,
    },
  };
}

export function buildAgentWebUiGitSummaryFrame(options = {}) {
  return {
    id: options.id ?? `agent-web-ui-git-summary-${Date.now()}`,
    method: 'session.git.summary',
    params: {
      changed_limit: Number.isFinite(options.changedLimit) ? options.changedLimit : 25,
      log_limit: Number.isFinite(options.logLimit) ? options.logLimit : 5,
    },
  };
}

export function buildAgentWebUiArtifactsSummaryFrame(options = {}) {
  return {
    id: options.id ?? `agent-web-ui-artifacts-summary-${Date.now()}`,
    method: 'session.artifacts.summary',
    params: {
      limit: Number.isFinite(options.limit) ? options.limit : 25,
      offset: Number.isFinite(options.offset) ? options.offset : 0,
      ...(typeof options.kind === 'string' && options.kind ? { kind: options.kind } : {}),
    },
  };
}

export function buildAgentWebUiSurfaceFeedbackSummaryFrame(options = {}) {
  return {
    id: options.id ?? `agent-web-ui-surface-feedback-summary-${Date.now()}`,
    method: 'session.surface_feedback.summary',
    params: {
      limit: Number.isFinite(options.limit) ? options.limit : 25,
      offset: Number.isFinite(options.offset) ? options.offset : 0,
      ...(typeof options.status === 'string' && options.status ? { status: options.status } : {}),
      ...(typeof options.kind === 'string' && options.kind ? { kind: options.kind } : {}),
      ...(typeof options.surfaceId === 'string' && options.surfaceId ? { surface_id: options.surfaceId } : {}),
    },
  };
}

export function buildAgentWebUiSchedulerSummaryFrame(options = {}) {
  return {
    id: options.id ?? `agent-web-ui-scheduler-summary-${Date.now()}`,
    method: 'session.scheduler.summary',
    params: {
      task_limit: Number.isFinite(options.taskLimit) ? options.taskLimit : 25,
      history_limit: Number.isFinite(options.historyLimit) ? options.historyLimit : 5,
      ...(typeof options.folder === 'string' && options.folder ? { folder: options.folder } : {}),
    },
  };
}

export function buildAgentWebUiTaskLifecycleSummaryFrame(options = {}) {
  const params = {
    limit: Number.isFinite(options.limit) ? options.limit : 8,
    include_obligations: options.includeObligations !== false,
  };
  if (typeof options.agentId === 'string' && options.agentId) params.agent_id = options.agentId;
  return {
    id: options.id ?? `agent-web-ui-task-lifecycle-summary-${Date.now()}`,
    method: 'session.task_lifecycle.summary',
    params,
  };
}

export function buildAgentWebUiSurfaceAffordancesFrame(options = {}) {
  return {
    id: options.id ?? `agent-web-ui-surface-affordances-${Date.now()}`,
    method: 'session.surface.affordances',
    params: {},
  };
}

export function buildAgentWebUiAffordanceActionRequestFrame({ surfaceId, surface_id, actionId, action_id, args = {}, clientCorrelationId, client_correlation_id } = {}, options = {}) {
  const normalizedSurfaceId = String(surface_id ?? surfaceId ?? '').trim();
  const normalizedActionId = String(action_id ?? actionId ?? '').trim();
  if (!normalizedSurfaceId || !normalizedActionId) return null;
  const normalizedArgs = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  return {
    id: options.id ?? `agent-web-ui-affordance-action-${normalizedSurfaceId.replace(/[^a-z0-9]+/gi, '-')}-${normalizedActionId.replace(/[^a-z0-9]+/gi, '-')}-${Date.now()}`,
    method: NARS_AFFORDANCE_ACTION_REQUEST_METHOD,
    params: {
      surface_id: normalizedSurfaceId,
      action_id: normalizedActionId,
      args: normalizedArgs,
      ...(client_correlation_id ?? clientCorrelationId ? { client_correlation_id: String(client_correlation_id ?? clientCorrelationId) } : {}),
    },
  };
}

export function buildAgentWebUiAffordanceActionConfirmFrame({ confirmationId, confirmation_id } = {}, options = {}) {
  const normalizedConfirmationId = String(confirmation_id ?? confirmationId ?? '').trim();
  if (!normalizedConfirmationId) return null;
  return {
    id: options.id ?? `agent-web-ui-affordance-confirm-${normalizedConfirmationId.replace(/[^a-z0-9]+/gi, '-')}-${Date.now()}`,
    method: NARS_AFFORDANCE_ACTION_CONFIRM_METHOD,
    params: {
      confirmation_id: normalizedConfirmationId,
    },
  };
}

export function buildAgentWebUiAffordanceActionCancelFrame({ confirmationId, confirmation_id, reason = 'operator_cancelled' } = {}, options = {}) {
  const normalizedConfirmationId = String(confirmation_id ?? confirmationId ?? '').trim();
  if (!normalizedConfirmationId) return null;
  return {
    id: options.id ?? `agent-web-ui-affordance-cancel-${normalizedConfirmationId.replace(/[^a-z0-9]+/gi, '-')}-${Date.now()}`,
    method: NARS_AFFORDANCE_ACTION_CANCEL_METHOD,
    params: {
      confirmation_id: normalizedConfirmationId,
      reason: String(reason ?? 'operator_cancelled'),
    },
  };
}

export function buildNarsAffordanceActionRequestedEvent({ requestId, request_id, surfaceId, surface_id, actionId, action_id, clientCorrelationId = null, client_correlation_id = null } = {}) {
  return {
    schema: NARS_AFFORDANCE_ACTION_SCHEMAS.request,
    event: NARS_AFFORDANCE_ACTION_EVENTS.requested,
    request_id: request_id ?? requestId ?? null,
    transport: 'jsonl_stdio',
    surface_id: surface_id ?? surfaceId ?? null,
    action_id: action_id ?? actionId ?? null,
    client_correlation_id: client_correlation_id ?? clientCorrelationId ?? null,
  };
}

export function buildNarsAffordanceActionResultEvent({ requestId, request_id, surfaceId, surface_id, actionId, action_id, serverName, server_name, toolName, tool_name, clientCorrelationId = null, client_correlation_id = null, result = null, status = 'ok', terminalState, terminal_state } = {}) {
  return {
    schema: NARS_AFFORDANCE_ACTION_SCHEMAS.result,
    event: NARS_AFFORDANCE_ACTION_EVENTS.result,
    request_id: request_id ?? requestId ?? null,
    transport: 'jsonl_stdio',
    terminal_state: terminal_state ?? terminalState ?? (status === 'ok' ? 'completed' : 'failed'),
    status,
    surface_id: surface_id ?? surfaceId ?? null,
    action_id: action_id ?? actionId ?? null,
    server_name: server_name ?? serverName ?? null,
    tool_name: tool_name ?? toolName ?? null,
    client_correlation_id: client_correlation_id ?? clientCorrelationId ?? null,
    result,
  };
}

export function buildNarsAffordanceActionFailureEvent({ requestId, request_id, surfaceId, surface_id, actionId, action_id, serverName, server_name, toolName, tool_name, clientCorrelationId = null, client_correlation_id = null, error } = {}) {
  const event = buildNarsAffordanceActionResultEvent({
    request_id: request_id ?? requestId ?? null,
    surface_id: surface_id ?? surfaceId ?? null,
    action_id: action_id ?? actionId ?? null,
    server_name: server_name ?? serverName ?? null,
    tool_name: tool_name ?? toolName ?? null,
    client_correlation_id: client_correlation_id ?? clientCorrelationId ?? null,
    status: 'error',
    terminal_state: 'failed',
  });
  delete event.result;
  event.error = error instanceof Error ? error.message : String(error ?? 'unknown_error');
  return event;
}

export function buildNarsAffordanceActionRefusalEvent({ requestId, request_id, surfaceId, surface_id, actionId, action_id, clientCorrelationId = null, client_correlation_id = null, code, message, serverName = null, server_name = null, toolName = null, tool_name = null, posture = null } = {}) {
  return {
    schema: NARS_AFFORDANCE_ACTION_SCHEMAS.refusal,
    event: NARS_AFFORDANCE_ACTION_EVENTS.refused,
    request_id: request_id ?? requestId ?? null,
    transport: 'jsonl_stdio',
    terminal_state: 'refused',
    status: 'refused',
    surface_id: surface_id ?? surfaceId ?? null,
    action_id: action_id ?? actionId ?? null,
    server_name: server_name ?? serverName ?? null,
    tool_name: tool_name ?? toolName ?? null,
    client_correlation_id: client_correlation_id ?? clientCorrelationId ?? null,
    code,
    message,
    ...(posture ? { posture } : {}),
  };
}

export function buildNarsAffordanceActionConfirmationRequiredEvent(options = {}) {
  const event = buildNarsAffordanceActionRefusalEvent(options);
  return {
    ...event,
    schema: NARS_AFFORDANCE_ACTION_SCHEMAS.confirmationRequired,
    event: NARS_AFFORDANCE_ACTION_EVENTS.confirmationRequired,
    terminal_state: 'awaiting_confirmation',
    status: 'confirmation_required',
    confirmation_id: options.confirmation_id ?? options.confirmationId ?? null,
    expires_at: options.expires_at ?? options.expiresAt ?? null,
  };
}

export function buildNarsAffordanceActionConfirmedEvent({ requestId, request_id, confirmationId, confirmation_id, surfaceId = null, surface_id = null, actionId = null, action_id = null } = {}) {
  return {
    schema: NARS_AFFORDANCE_ACTION_SCHEMAS.confirmed,
    event: NARS_AFFORDANCE_ACTION_EVENTS.confirmed,
    request_id: request_id ?? requestId ?? null,
    transport: 'jsonl_stdio',
    terminal_state: 'confirmed',
    status: 'confirmed',
    confirmation_id: confirmation_id ?? confirmationId ?? null,
    surface_id: surface_id ?? surfaceId,
    action_id: action_id ?? actionId,
  };
}

export function buildNarsAffordanceActionCancelledEvent({ requestId, request_id, confirmationId, confirmation_id, surfaceId = null, surface_id = null, actionId = null, action_id = null, reason = null } = {}) {
  return {
    schema: NARS_AFFORDANCE_ACTION_SCHEMAS.cancelled,
    event: NARS_AFFORDANCE_ACTION_EVENTS.cancelled,
    request_id: request_id ?? requestId ?? null,
    transport: 'jsonl_stdio',
    terminal_state: 'cancelled',
    status: 'cancelled',
    confirmation_id: confirmation_id ?? confirmationId ?? null,
    surface_id: surface_id ?? surfaceId,
    action_id: action_id ?? actionId,
    reason,
  };
}

function requestIdForCommand(command) {
  return `agent-web-ui-${command}-${Date.now()}`;
}

function commandFrame(command, value = '') {
  return {
    id: requestIdForCommand(command.replace(/^\//, '').replace(/[^a-z0-9]+/g, '-')),
    method: NARS_COMMAND_METHOD,
    params: { command, value },
  };
}

export function buildAgentWebUiConversationSendFrame(text, options = {}) {
  const message = String(text ?? '').trim();
  if (!message) return null;
  return {
    id: options.id ?? `agent-web-ui-input-${Date.now()}`,
    method: 'session.submit',
    params: {
      content: message,
      source: 'manual_operator',
    },
  };
}

export function buildAgentWebUiConversationSteerFrame(text, options = {}) {
  const message = String(text ?? '').trim();
  if (!message) return null;
  return {
    id: options.id ?? `agent-web-ui-steer-${Date.now()}`,
    method: 'session.submit',
    params: {
      content: message,
      source: 'operator_steering',
      delivery_mode: 'admit_after_active_turn',
      ...(options.activeTurnId ? { active_turn_id: options.activeTurnId } : {}),
    },
  };
}

export function buildAgentWebUiSubscribeFrame(options = {}) {
  const params = {
    include_replay: options.includeReplay !== false,
    max_replay: Number.isFinite(options.maxReplay) ? options.maxReplay : 100,
  };
  if (options.sinceSequence !== undefined) params.since_sequence = options.sinceSequence;
  if (options.sinceTimestamp !== undefined) params.since_timestamp = options.sinceTimestamp;
  if (options.subscriptionId !== undefined) params.subscription_id = options.subscriptionId;
  if (options.filters && typeof options.filters === 'object') params.filters = options.filters;
  return {
    id: options.id ?? 'agent-web-ui-events-subscribe',
    method: 'session.events.subscribe',
    params,
  };
}

export function isNarsSessionCoreProtocolFrame(frame) {
  return Boolean(frame && typeof frame === 'object' && isNarsSessionCoreMethod(frame.method));
}

export function isAgentWebUiCloudflareProtocolFrame(frame) {
  return Boolean(frame && typeof frame === 'object' && AGENT_WEB_UI_CLOUDFLARE_METHODS.has(frame.method));
}

// Deprecated agent-web-ui callers use the broad adapter vocabulary. New local
// callers must use isNarsSessionCoreProtocolFrame instead.
export function isAgentWebUiProtocolFrame(frame) {
  return isAgentWebUiCloudflareProtocolFrame(frame);
}

// Cloudflare retains its historical endpoint vocabulary. Translate only at
// that adapter boundary; local transports must forward the original frame.
export function translateAgentWebUiFrameForCloudflare(frame) {
  if (!isAgentWebUiCloudflareProtocolFrame(frame)) return null;
  const params = frame.params && typeof frame.params === 'object' ? frame.params : {};
  if (frame.method === 'session.submit') {
    return {
      ...frame,
      method: params.delivery_mode === 'admit_after_active_turn' ? 'conversation.enqueue' : 'conversation.send',
      params: {
        message: params.content ?? params.message ?? '',
        source: params.source ?? 'agent-web-ui',
        ...(params.active_turn_id ? { active_turn_id: params.active_turn_id } : {}),
      },
    };
  }
  if (frame.method === 'session.cancel') return { ...frame, method: 'conversation.interrupt', params };
  return { ...frame, params };
}

function localCommand(id, slash, options = {}) {
  return Object.freeze({
    id,
    slash,
    kind: options.kind ?? 'local_ui',
    group: options.group ?? 'local',
    title: options.title ?? slash,
    description: options.description ?? '',
    aliases: Object.freeze(options.aliases ?? []),
    keywords: Object.freeze(options.keywords ?? []),
    usage: options.usage ?? slash,
    protocolMethods: Object.freeze(options.protocolMethods ?? []),
    palette: Object.freeze({ visible: options.visible !== false, rank: options.rank ?? 500, danger: options.danger === true }),
    buildAction: options.buildAction,
  });
}

function frameCommand(id, slash, method, options = {}) {
  return localCommand(id, slash, {
    ...options,
    protocolMethods: [method],
    kind: options.kind ?? 'nars_protocol',
    group: options.group ?? 'session',
    buildAction: (input, context = {}) => ({
      kind: 'frame',
      frame: { id: context.id ?? requestIdForCommand(id), method, params: options.params ?? {} },
    }),
  });
}

function sessionCommand(id, slash, options = {}) {
  return localCommand(id, slash, {
    ...options,
    protocolMethods: [NARS_COMMAND_METHOD],
    kind: 'nars_session_command',
    group: options.group ?? 'session',
    buildAction: (input) => ({ kind: 'frame', frame: commandFrame(slash, input.value) }),
  });
}

export const AGENT_WEB_UI_SNIPPET_USAGE = '/snippet run|enqueue|search|save|edit|delete';

export const AGENT_WEB_UI_SNIPPET_ACTIONS = Object.freeze([
  Object.freeze({ id: 'run', verbs: Object.freeze(['run']), slash: '/snippet run', title: 'Run snippet', description: 'Choose a saved snippet and send it now.', meta: 'snippet action', completion: '/snippet run ', mode: 'select', deliveryMode: 'default', rank: 10 }),
  Object.freeze({ id: 'enqueue', verbs: Object.freeze(['enqueue']), slash: '/snippet enqueue', title: 'Queue snippet', description: 'Choose a saved snippet and queue it for the next turn.', meta: 'snippet action', completion: '/snippet enqueue ', mode: 'select', deliveryMode: 'enqueue', rank: 20 }),
  Object.freeze({ id: 'search', verbs: Object.freeze(['search']), slash: '/snippet search', title: 'Search snippets', description: 'Open the snippets drawer and search panel.', meta: 'snippet action', completion: '/snippet search ', mode: 'panel', immediate: true, rank: 30 }),
  Object.freeze({ id: 'save', verbs: Object.freeze(['save']), slash: '/snippet save', title: 'Save snippet', description: 'Save the following text as a browser-local snippet.', meta: 'snippet action', completion: '/snippet save ', mode: 'write', rank: 40 }),
  Object.freeze({ id: 'edit', verbs: Object.freeze(['edit']), slash: '/snippet edit', title: 'Edit snippet', description: 'Replace a saved snippet body by name.', meta: 'snippet action', completion: '/snippet edit ', mode: 'write', rank: 50 }),
  Object.freeze({ id: 'delete', verbs: Object.freeze(['delete']), slash: '/snippet delete', title: 'Delete snippet', description: 'Delete a saved snippet by name.', meta: 'snippet action', completion: '/snippet delete ', mode: 'delete', rank: 60 }),
]);

export function findAgentWebUiSnippetAction(rawVerb = '') {
  const verb = String(rawVerb ?? '').trim().toLowerCase();
  return AGENT_WEB_UI_SNIPPET_ACTIONS.find((action) => action.id === verb || action.verbs.includes(verb)) ?? null;
}

export function filterAgentWebUiSnippetActions(query = '') {
  const normalized = String(query ?? '').trim().toLowerCase();
  const actions = normalized
    ? AGENT_WEB_UI_SNIPPET_ACTIONS.filter((action) => (
      action.id.includes(normalized)
      || action.verbs.some((verb) => verb && verb.includes(normalized))
      || action.slash.includes(normalized)
      || action.title.toLowerCase().includes(normalized)
      || action.description.toLowerCase().includes(normalized)
    ))
    : AGENT_WEB_UI_SNIPPET_ACTIONS;
  return [...actions].sort((left, right) => left.rank - right.rank);
}

export function isAgentWebUiSnippetSelectionAction(rawVerb = '') {
  return findAgentWebUiSnippetAction(rawVerb)?.mode === 'select';
}

export function isAgentWebUiSnippetManagementAction(rawVerb = '') {
  const action = findAgentWebUiSnippetAction(rawVerb);
  return Boolean(action && (action.mode === 'write' || action.mode === 'delete'));
}

export function parseAgentWebUiSnippetCommand(value = '') {
  const trimmed = String(value ?? '').trim();
  const [rawVerb = '', ...terms] = trimmed ? trimmed.split(/\s+/) : [''];
  const action = findAgentWebUiSnippetAction(rawVerb);
  return {
    action,
    verb: action?.id ?? rawVerb.toLowerCase(),
    rawVerb: rawVerb.toLowerCase(),
    remainder: terms.join(' ').trim(),
    recognized: Boolean(action),
  };
}

export const AGENT_WEB_UI_COMMANDS = Object.freeze([
  localCommand('help', '/help', {
    title: 'Show commands',
    description: 'Show Agent Web UI commands grouped by operator intent.',
    group: 'local',
    rank: 10,
    buildAction: () => ({ kind: 'local_help' }),
  }),
  localCommand('clear', '/clear', {
    title: 'Clear local view',
    description: 'Clear the browser projection without mutating the NARS session.',
    group: 'local',
    rank: 20,
    buildAction: () => ({ kind: 'local_clear' }),
  }),
  frameCommand('status', '/status', 'session.health', { title: 'Show session health', description: 'Request current runtime and MCP health.', group: 'session', rank: 100 }),
  frameCommand('health', '/health', 'session.health', { title: 'Check health', description: 'Request current runtime and MCP health.', group: 'session', rank: 110 }),
  localCommand('events', '/events', {
    kind: 'nars_protocol',
    title: 'Replay recent events',
    description: 'Subscribe with a short replay of recent session events.',
    group: 'diagnostics',
    protocolMethods: ['session.events.subscribe'],
    rank: 120,
    buildAction: (input, context = {}) => ({ kind: 'frame', frame: buildAgentWebUiSubscribeFrame({ id: context.id ?? requestIdForCommand('events'), maxReplay: 20, includeReplay: true }) }),
  }),
  frameCommand('recovery', '/recovery', 'session.recovery', { title: 'Show recovery workflow', description: 'Request recovery information for the current session.', group: 'diagnostics', rank: 130 }),
  frameCommand('ops', '/ops', 'session.operations', { title: 'Show operations', description: 'Request operator workflow and session operation information.', group: 'diagnostics', rank: 140 }),
  frameCommand('observers', '/observers', 'observers.status', { title: 'Show observers', description: 'Request observer posture.', group: 'diagnostics', rank: 150 }),
  localCommand('observer', '/observer', {
    kind: 'nars_protocol',
    title: 'Mute or unmute observers',
    description: 'Use /observer mute or /observer unmute.',
    group: 'settings',
    protocolMethods: ['observer.mute', 'observer.unmute'],
    usage: '/observer mute|unmute',
    keywords: ['mute', 'unmute'],
    rank: 160,
    buildAction: (input, context = {}) => {
      if (input.value === 'mute') return { kind: 'frame', frame: { id: context.id ?? requestIdForCommand('observer-mute'), method: 'observer.mute', params: {} } };
      if (input.value === 'unmute') return { kind: 'frame', frame: { id: context.id ?? requestIdForCommand('observer-unmute'), method: 'observer.unmute', params: {} } };
      return { kind: 'message', message: 'Usage: /observer mute|unmute' };
    },
  }),
  frameCommand('interrupt', '/interrupt', 'session.cancel', { title: 'Interrupt response', description: 'Ask NARS to interrupt the active model turn.', group: 'conversation', rank: 200, danger: true }),
  frameCommand('exit', '/exit', 'session.close', { title: 'Close session', description: 'Close this NARS session.', group: 'session', rank: 900, danger: true }),
  localCommand('json', '/json', {
    kind: 'raw_protocol_frame',
    title: 'Send JSON frame',
    description: 'Send an admitted raw protocol frame. Advanced escape hatch.',
    group: 'advanced',
    usage: '/json {"id":"...","method":"...","params":{}}',
    keywords: ['raw', 'frame', 'protocol'],
    rank: 1000,
    buildAction: (input) => {
      if (!input.value) return { kind: 'message', message: 'Usage: /json <protocol frame JSON>' };
      try {
        const frame = JSON.parse(input.value);
        return isNarsSessionCoreProtocolFrame(frame) ? { kind: 'frame', frame } : { kind: 'message', message: 'JSON frame method is not admitted by the local session-core contract.' };
      } catch (error) {
        return { kind: 'message', message: `Invalid JSON frame: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  }),
  sessionCommand('goal', '/goal', { title: 'Goal command', description: 'Run the NARS-compatible goal session command.', group: 'conversation', rank: 300 }),
  sessionCommand('queue', '/queue', { title: 'Queue command', description: 'Run the NARS-compatible operator input queue command.', group: 'conversation', rank: 305 }),
  sessionCommand('stats', '/stats', { title: 'Stats command', description: 'Run the NARS-compatible stats session command.', group: 'diagnostics', rank: 310 }),
  sessionCommand('model', '/model', { title: 'Model command', description: 'Run the NARS-compatible model session command.', group: 'settings', rank: 320 }),
  sessionCommand('thinking', '/thinking', { title: 'Thinking command', description: 'Run the NARS-compatible thinking session command.', group: 'settings', rank: 330 }),
  sessionCommand('tool-output', '/tool-output', { title: 'Tool output command', description: 'Run the NARS-compatible tool-output session command.', group: 'settings', rank: 340 }),
  sessionCommand('tools', '/tools', { title: 'Tools command', description: 'Run the NARS-compatible tools session command.', group: 'diagnostics', rank: 350 }),
  localCommand('snippet', '/snippet', {
    title: 'Snippet command',
    description: 'Save, edit, delete, search, or run local operator snippets.',
    group: 'snippets',
    usage: AGENT_WEB_UI_SNIPPET_USAGE,
    keywords: ['macro', 'saved command', 'prompt', 'short text'],
    rank: 370,
    buildAction: (input) => ({ kind: 'snippet_command', value: input.value, raw: input.raw }),
  }),
  localCommand('snippets', '/snippets', {
    title: 'Open snippets',
    description: 'Open the local snippet search and management panel.',
    group: 'snippets',
    usage: '/snippets [query]',
    keywords: ['library', 'macro', 'saved command', 'prompt', 'search snippets'],
    rank: 371,
    buildAction: (input) => ({ kind: 'snippet_panel_command', value: input.value, raw: input.raw }),
  }),
]);

export const AGENT_WEB_UI_COMMAND_GROUP_LABELS = Object.freeze({
  conversation: 'Conversation control',
  session: 'Session state',
  diagnostics: 'Diagnostics',
  settings: 'Settings',
  snippets: 'Operator snippets',
  local: 'Local UI',
  advanced: 'Advanced',
});

const COMMAND_GROUP_ORDER = Object.freeze(['conversation', 'session', 'diagnostics', 'settings', 'snippets', 'local', 'advanced']);

export const AGENT_WEB_UI_HELP_LINES = Object.freeze([
  'Commands',
  ...COMMAND_GROUP_ORDER.flatMap((group) => {
    const commands = AGENT_WEB_UI_COMMANDS.filter((command) => command.group === group && command.palette.visible !== false);
    if (!commands.length) return [];
    return [AGENT_WEB_UI_COMMAND_GROUP_LABELS[group] ?? group, commands.map((command) => command.usage ?? command.slash).join(', ')];
  }),
  'Ordinary text is submitted with session.submit. Active-turn queueing uses delivery_mode=admit_after_active_turn.',
]);

export function buildAgentWebUiHelpText(options = {}) {
  if (typeof options.supportsProtocolMethod !== 'function') return AGENT_WEB_UI_HELP_LINES.join('\n');
  const commands = filterAgentWebUiCommands('', options);
  return [
    'Commands',
    ...COMMAND_GROUP_ORDER.flatMap((group) => {
      const groupCommands = commands.filter((command) => command.group === group);
      if (!groupCommands.length) return [];
      return [AGENT_WEB_UI_COMMAND_GROUP_LABELS[group] ?? group, groupCommands.map((command) => command.usage ?? command.slash).join(', ')];
    }),
    'Ordinary text is submitted with session.submit. Active-turn queueing uses delivery_mode=admit_after_active_turn.',
  ].join('\n');
}

export function findAgentWebUiCommand(rawCommand) {
  const command = String(rawCommand ?? '').trim().toLowerCase();
  if (!command) return null;
  return AGENT_WEB_UI_COMMANDS.find((entry) => entry.slash === command || entry.aliases.includes(command)) ?? null;
}

export function filterAgentWebUiCommands(query = '', options = {}) {
  const normalized = String(query ?? '').trim().toLowerCase().replace(/^\//, '');
  const commands = AGENT_WEB_UI_COMMANDS.filter((entry) => (
    entry.palette.visible !== false
    && (typeof options.supportsProtocolMethod !== 'function'
      || entry.protocolMethods.length === 0
      || entry.protocolMethods.some((method) => options.supportsProtocolMethod(method)))
  ));
  if (!normalized) return [...commands].sort(compareAgentWebUiCommands);
  return commands
    .map((entry) => ({ entry, score: agentWebUiCommandMatchScore(entry, normalized) }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => left.score - right.score || compareAgentWebUiCommands(left.entry, right.entry))
    .map((candidate) => candidate.entry);
}

function compareAgentWebUiCommands(left, right) {
  return (left.palette.rank ?? 500) - (right.palette.rank ?? 500) || left.slash.localeCompare(right.slash);
}

function agentWebUiCommandMatchScore(entry, query) {
  const commandTerms = [entry.slash, ...entry.aliases].map((term) => String(term).toLowerCase().replace(/^\//, ''));
  const metadataTerms = [entry.title, entry.description, entry.group, ...(entry.keywords ?? [])].map((term) => String(term).toLowerCase());
  let best = -1;
  for (const term of commandTerms) {
    if (term === query) best = best < 0 ? 0 : Math.min(best, 0);
    else if (term.startsWith(query)) best = best < 0 ? 1 : Math.min(best, 1);
    else if (term.includes(query)) best = best < 0 ? 2 : Math.min(best, 2);
  }
  for (const term of metadataTerms) {
    if (term === query) best = best < 0 ? 3 : Math.min(best, 3);
    else if (term.startsWith(query)) best = best < 0 ? 4 : Math.min(best, 4);
    else if (term.includes(query)) best = best < 0 ? 5 : Math.min(best, 5);
  }
  return best;
}

export function buildAgentWebUiOperatorInputAction(text, options = {}) {
  const content = String(text ?? '').trim();
  if (!content) return null;
  const lower = content.toLowerCase();
  if (lower === '/exit') {
    return findAgentWebUiCommand('/exit').buildAction({ raw: content, command: '/exit', value: '' }, options);
  }
  if (!content.startsWith('/')) {
    return {
      kind: 'frame',
      frame: options.deliveryMode === 'enqueue'
        ? buildAgentWebUiConversationEnqueueFrame(content, options)
        : options.activeTurn
          ? buildAgentWebUiConversationSteerFrame(content, options)
          : buildAgentWebUiConversationSendFrame(content, options),
    };
  }
  const [rawCommand, ...rest] = content.split(/\s+/);
  const command = rawCommand.toLowerCase();
  const value = rest.join(' ').trim();
  const entry = findAgentWebUiCommand(command);
  if (entry) return entry.buildAction({ raw: content, command: entry.slash, enteredCommand: command, value }, options);
  return { kind: 'message', message: `Unknown command: ${command}. Type /help.` };
}

export function unwrapNarsClientEvent(message) {
  if (message?.event === 'session_event' && message.payload && typeof message.payload === 'object') {
    return message.payload;
  }
  return message;
}

export function normalizeNarsClientProjectionVerbosity(verbosity = NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY) {
  const normalized = String(verbosity ?? NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY).trim().toLowerCase();
  return NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS.includes(normalized) ? normalized : NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY;
}

export function isRoutineHealthyNarsSessionHealth(event) {
  if (!event || event.event !== 'session_health') return false;
  const status = String(event.status ?? '').toLowerCase();
  const mcpState = String(event.mcp?.operational_state ?? event.mcp_operational_state ?? '').toLowerCase();
  const startupFailures = Number(event.mcp_startup_failure_count ?? event.mcp?.startup_failure_count ?? 0);
  const runtimeFaults = Number(event.mcp_runtime_fault_count ?? event.mcp?.runtime_fault_count ?? 0);
  return status === 'healthy' && (mcpState === '' || mcpState === 'healthy') && startupFailures === 0 && runtimeFaults === 0;
}

export function classifyNarsClientEventProjection(projection) {
  if (projection?.class) return projection.class;
  const kind = projection?.kind ?? projection?.event?.event ?? 'unknown';
  const event = projection?.event ?? projection;
  if (kind === 'assistant_message' || kind === 'assistant_message_stream' || kind === 'user_message' || kind === 'operator_input_submitted' || kind === 'agent_web_ui_message' || kind === 'agent_web_ui_help') return 'conversation';
  if (kind === 'error' || kind === 'websocket_error' || kind === 'web_ui_decode_error' || kind === 'web_ui_input_not_sent' || kind === 'runtime_error') return 'conversation';
  if (kind === 'authority_session_revoked' || kind === 'projection_revoked') return 'diagnostics';
  if (kind === 'carrier_diagnostic_recorded' || kind === 'mcp_runtime_fault') return 'diagnostics';
  if (kind === 'runtime_projection_failure' || kind === 'runtime_control_input_bridge_error' || kind === 'runtime_intelligence_reconfiguration' || kind === 'provider_runtime_reconfiguration_state_transition') return 'diagnostics';
  if (kind === 'tool_call' || kind === 'tool_result' || kind === 'turn_failed') return 'operations';
  if (kind === 'session_artifact_registered' || kind === 'session_artifact_read') return 'conversation';
  if (kind === 'conversation_enqueue_requested' || kind === 'input_queued_for_turn_boundary' || kind === 'input_admitted_to_turn' || kind === 'input_dropped_by_operator' || kind === 'input_abandoned_on_session_end' || kind === 'input_completed') return 'operations';
  if (kind === 'session_health') return isRoutineHealthyNarsSessionHealth(event) ? 'diagnostics' : 'operations';
  if (kind?.startsWith?.('authority_source_') || kind?.startsWith?.('authority_target_')) return 'operations';
  if (kind === 'session_started' || kind === 'session_closed' || kind === 'session_status' || kind === 'session_recovery' || kind === 'session_operations' || kind === 'session_sync' || kind === 'observer_status' || kind === 'observers_status' || kind === 'carrier_command_result') return 'operations';
  if (kind === 'turn_started' || kind === 'turn_complete' || kind === 'directive_received' || kind === 'directive_receipt_recorded' || kind === 'directive_carrier_accepted_recorded' || kind === 'directive_complete' || kind === 'session_events_subscription_started' || kind === 'websocket_connected') return 'diagnostics';
  if (kind?.startsWith?.('provider_')) return 'diagnostics';
  return 'raw';
}

export function shouldProjectNarsClientProjection(projection, options = {}) {
  if (isRoutineStateSampleProjection(projection) && options.includeStateSamples !== true) return false;
  const verbosity = normalizeNarsClientProjectionVerbosity(options.verbosity);
  if (verbosity === 'raw') return true;
  const eventLevel = classifyNarsClientEventProjection(projection);
  if (verbosity === 'diagnostics') return isDiagnosticSignalProjection(projection, eventLevel);
  return NARS_CLIENT_PROJECTION_VERBOSITY_RANK[eventLevel] <= NARS_CLIENT_PROJECTION_VERBOSITY_RANK[verbosity];
}

function isDiagnosticSignalProjection(projection, eventLevel = classifyNarsClientEventProjection(projection)) {
  const kind = projection?.kind ?? projection?.event?.event ?? 'unknown';
  return eventLevel === 'diagnostics' || projection?.tone === NARS_CLIENT_EVENT_TONES.error || (kind === 'session_health' && !isRoutineStateSampleProjection(projection));
}

export function isRoutineStateSampleProjection(projection) {
  const kind = projection?.kind ?? projection?.event?.event ?? 'unknown';
  const event = projection?.event ?? projection;
  return kind === 'websocket_connected' || (kind === 'session_health' && isRoutineHealthyNarsSessionHealth(event));
}

export function shouldProjectNarsClientEvent(message, options = {}) {
  return shouldProjectNarsClientProjection(projectNarsClientEvent(message), options);
}

function eventTone(kind, event = null) {
  if (kind === 'assistant_message' || kind === 'assistant_message_stream' || kind === 'provider_agent_message') return NARS_CLIENT_EVENT_TONES.assistant;
  if (kind === 'user_message') return NARS_CLIENT_EVENT_TONES.operator;
  if (kind === 'tool_call' || kind === 'tool_result') return NARS_CLIENT_EVENT_TONES.tool;
  if (kind === 'session_artifact_registered' || kind === 'session_artifact_read') return NARS_CLIENT_EVENT_TONES.status;
  if (kind === 'error' || kind === 'websocket_error' || kind === 'web_ui_decode_error' || kind === 'turn_failed' || kind === 'authority_session_revoked' || kind === 'projection_revoked' || kind === 'mcp_runtime_fault' || kind === 'runtime_projection_failure' || kind === 'runtime_control_input_bridge_error') return NARS_CLIENT_EVENT_TONES.error;
  if (kind === 'runtime_intelligence_reconfiguration' || kind === 'provider_runtime_reconfiguration_state_transition') {
    const state = event?.terminal_state ?? event?.reconfiguration_state;
    return state === 'refused' || state === 'failed' ? NARS_CLIENT_EVENT_TONES.error : NARS_CLIENT_EVENT_TONES.status;
  }
  if (kind?.startsWith?.('agent_web_ui_') || kind === 'operator_input_submitted' || kind === 'web_ui_input_not_sent') return NARS_CLIENT_EVENT_TONES.local;
  if (kind === 'conversation_enqueue_requested' || kind?.startsWith?.('input_')) return NARS_CLIENT_EVENT_TONES.status;
  if (kind?.startsWith?.('authority_source_write_refused') || kind?.startsWith?.('authority_target_write_refused') || kind === 'authority_target_activation_refused') return NARS_CLIENT_EVENT_TONES.error;
  if (kind?.startsWith?.('authority_source_') || kind?.startsWith?.('authority_target_')) return NARS_CLIENT_EVENT_TONES.status;
  if (kind === 'carrier_diagnostic_recorded') return NARS_CLIENT_EVENT_TONES.status;
  if (kind?.startsWith?.('session_') || kind?.startsWith?.('turn_')) return NARS_CLIENT_EVENT_TONES.session;
  return NARS_CLIENT_EVENT_TONES.unknown;
}

function eventSummary(event, kind) {
  if (kind === 'assistant_message') return event.content ?? event.message ?? 'assistant message';
  if (kind === 'provider_agent_message') return event.provider_event?.item?.text ?? event.event?.item?.text ?? 'provider agent message';
  if (kind === 'user_message') return event.content ?? event.message ?? 'operator message';
  if (kind === 'tool_call') return event.tool_name ?? event.tool ?? event.name ?? 'tool call';
  if (kind === 'tool_result') return `${event.tool_name ?? event.tool ?? event.name ?? 'tool result'}${event.status ? ` ${event.status}` : ''}`;
  if (kind === 'session_started') return `${eventAgentDisplay(event)} / ${event.session_id ?? 'session'}`;
  if (kind === 'authority_session_revoked') return event.code ?? 'session_revoked';
  if (kind === 'projection_revoked') return event.code ?? 'projection_revoked';
  if (kind === 'session_events_subscription_started') return `${event.replay_count ?? 0} replayed event(s)`;
  if (kind === 'session_artifact_registered') return artifactSummary(event, 'artifact registered');
  if (kind === 'session_artifact_read') return artifactSummary(event, 'artifact');
  if (kind === 'session_health') return `${event.status ?? 'health'} · ${eventAgentDisplay(event)} · ${event.session_id ?? 'session'}`;
  if (kind === 'runtime_projection_failure') return runtimeProjectionFailureSummary(event);
  if (kind === 'runtime_control_input_bridge_error') return runtimeControlInputBridgeErrorSummary(event);
  if (kind === 'runtime_intelligence_reconfiguration') return runtimeIntelligenceReconfigurationSummary(event);
  if (kind === 'provider_runtime_reconfiguration_state_transition') return providerRuntimeReconfigurationStateSummary(event);
  if (kind === 'mcp_runtime_fault' || kind === 'carrier_diagnostic_recorded') return diagnosticSummary(event, kind);
  if (kind === 'turn_complete') return event.terminal_state ?? 'turn complete';
  if (kind === 'turn_failed') return errorSummary(event) ?? event.terminal_state ?? 'turn failed';
  if (kind === 'turn_started') return event.turn_id ?? 'turn started';
  if (kind === 'conversation_enqueue_requested') return event.delivery_semantics ?? 'queued for next turn';
  if (kind?.startsWith?.('authority_source_') || kind?.startsWith?.('authority_target_')) return authorityTransitionSummary(event, kind);
  if (kind?.startsWith?.('input_')) return `${event.input_event_id ?? event.event_id ?? 'input'}${event.terminal_state ? ` ${event.terminal_state}` : ''}`;
  if (kind === 'error' || kind === 'websocket_error' || kind === 'web_ui_decode_error') return event.message ?? event.code ?? 'error';
  if (typeof event?.message === 'string') return event.message;
  if (typeof event?.content === 'string') return event.content;
  return '';
}

function errorSummary(event) {
  if (!event || typeof event !== 'object') return null;
  for (const field of ['error_summary', 'error', 'message', 'reason', 'code']) {
    const value = event[field];
    if (typeof value === 'string' && value.trim()) return value;
  }
  const error = event.error;
  if (error && typeof error === 'object') {
    for (const field of ['message', 'summary', 'reason', 'code', 'type']) {
      const value = error[field];
      if (typeof value === 'string' && value.trim()) return value;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return null;
    }
  }
  return null;
}

function diagnosticSummary(event, kind) {
  if (kind === 'mcp_runtime_fault' || event?.diagnostic_code === 'mcp_runtime_fault') {
    const server = event.server_name ?? 'unknown';
    const tool = event.tool_name ?? event.tool ?? '<missing>';
    const error = event.error_code ?? event.error ?? event.message ?? null;
    return `MCP runtime fault ${server}:${tool}${error ? ` ${error}` : ''}`;
  }
  return event?.message ?? event?.diagnostic_code ?? kind;
}

function runtimeProjectionFailureSummary(event) {
  const projection = event?.projection ?? 'runtime';
  const state = event?.request_state ?? event?.state ?? 'failed';
  const error = event?.error ?? event?.reason ?? event?.code ?? null;
  return `${projection} projection ${state}${error ? ` · ${error}` : ''}`;
}

function runtimeControlInputBridgeErrorSummary(event) {
  const code = event?.error_code ?? event?.code ?? 'error';
  const error = event?.error ?? event?.message ?? null;
  return `control input bridge ${code}${error ? ` · ${error}` : ''}`;
}

function runtimeIntelligenceReconfigurationSummary(event) {
  const state = event?.terminal_state ?? event?.reconfiguration_state ?? 'unknown';
  const active = event?.active ?? event?.target ?? null;
  const provider = active?.provider ?? event?.provider ?? null;
  const model = active?.model ?? event?.model ?? null;
  const target = [provider, model].filter((value) => typeof value === 'string' && value).join(' / ');
  return `intelligence reconfiguration ${state}${target ? ` · ${target}` : ''}`;
}

function providerRuntimeReconfigurationStateSummary(event) {
  const previous = event?.previous_state ?? 'new';
  const next = event?.reconfiguration_state ?? 'unknown';
  const target = event?.target?.provider ?? event?.active?.provider ?? null;
  return `intelligence reconfiguration ${previous} -> ${next}${target ? ` · ${target}` : ''}`;
}

function artifactSummary(event, fallbackText) {
  const artifact = event?.artifact && typeof event.artifact === 'object' ? event.artifact : null;
  const artifactRef = buildNarsArtifactRefPart(artifact ?? {});
  const title = artifact?.title ?? artifact?.artifact_id ?? fallbackText;
  return artifactRef ? [{ type: 'text', text: String(title) }, artifactRef] : String(title);
}

export function projectNarsClientEvent(message) {
  const event = unwrapNarsClientEvent(message);
  const providerProjection = projectNestedProviderNarsClientEvent(event);
  if (providerProjection) return providerProjection;
  const kind = event?.event ?? 'unknown';
  const label = NARS_CLIENT_EVENT_LABELS[kind] ?? kind;
  const summary = eventSummary(event, kind);
  const renderKey = eventRenderKey(event, kind) ?? genericRenderKey(event, kind);
  return {
    kind,
    label,
    tone: eventTone(kind, event),
    summary,
    event,
    ...(renderKey ? { renderKey } : {}),
  };
}

function eventRenderKey(event, kind) {
  if (!event || typeof event !== 'object') return null;
  if (kind === 'assistant_message' || kind === 'assistant_message_stream') {
    const requestId = event.request_id ?? event.requestId ?? null;
    const turnId = event.turn_id ?? event.turnId ?? null;
    if (requestId) return `assistant:${requestId}`;
    if (turnId) return `assistant-turn:${turnId}`;
    return sequenceRenderKey(event);
  }
  if (kind === 'user_message' || kind === 'operator_input_submitted') {
    const requestId = event.request_id ?? event.requestId ?? null;
    const turnId = event.turn_id ?? event.turnId ?? null;
    if (requestId) return `operator:${requestId}`;
    if (turnId) return `operator-turn:${turnId}`;
    return sequenceRenderKey(event);
  }
  if (kind === 'tool_call' || kind === 'tool_result') {
    const requestId = event.request_id ?? event.requestId ?? null;
    const turnId = event.turn_id ?? event.turnId ?? null;
    if (requestId) return `tool:${kind}:${requestId}`;
    if (turnId) return `tool-turn:${kind}:${turnId}`;
    return sequenceRenderKey(event);
  }
  if (kind === 'turn_started' || kind === 'turn_complete' || kind === 'turn_failed') {
    const turnId = event.turn_id ?? event.turnId ?? null;
    if (turnId) return `turn:${turnId}`;
    return sequenceRenderKey(event);
  }
  if (kind === 'session_health') return sequenceRenderKey(event);
  return null;
}

function genericRenderKey(event, kind) {
  const sequenceKey = sequenceRenderKey(event);
  if (sequenceKey) return sequenceKey;
  if (kind === 'authority_session_revoked' && event?.session_id) return `authority-session-revoked:${event.session_id}`;
  if (kind === 'projection_revoked' && event?.projection_id) return `projection-revoked:${event.projection_id}`;
  if (kind === 'conversation_enqueue_requested' && event?.request_id) return `operator-input-queued:${event.request_id}`;
  if (kind === 'input_queued_for_turn_boundary' && event?.input_event_id) return `operator-input-boundary:${event.input_event_id}`;
  return null;
}

function projectNestedProviderNarsClientEvent(event) {
  const providerEvent = event?.event;
  if (!providerEvent || typeof providerEvent !== 'object') return null;
  const type = String(providerEvent.type ?? 'event');
  if (type === 'thread.started') {
    return projection({ kind: 'provider_thread_started', class: 'diagnostics', label: 'Provider thread started', tone: 'session', summary: providerEvent.thread_id ?? 'provider thread started', event, renderKey: sequenceRenderKey(event) });
  }
  if (type === 'turn.started') {
    return projection({ kind: 'provider_turn_started', class: 'diagnostics', label: 'Provider turn started', tone: 'session', summary: 'provider turn started', event, renderKey: sequenceRenderKey(event) });
  }
  if (type === 'turn.completed') {
    const usage = providerEvent.usage && typeof providerEvent.usage === 'object' ? providerEvent.usage : null;
    const summary = usage ? `input ${usage.input_tokens ?? '?'} · output ${usage.output_tokens ?? '?'}` : 'provider turn completed';
    return projection({ kind: 'provider_turn_completed', class: 'diagnostics', label: 'Provider turn complete', tone: 'session', summary, event, renderKey: sequenceRenderKey(event) });
  }
  if (type === 'item.started' || type === 'item.completed') return projectNestedProviderItemEvent(type, providerEvent.item, event);
  return projection({ kind: `provider_${safeKind(type)}`, class: 'diagnostics', label: 'Provider event', tone: 'unknown', summary: safeSummary(providerEvent), event, renderKey: sequenceRenderKey(event) });
}

function projectNestedProviderItemEvent(type, item, event) {
  if (!item || typeof item !== 'object') {
    return projection({ kind: `provider_${safeKind(type)}`, class: 'diagnostics', label: 'Provider item', tone: 'unknown', summary: type, event, renderKey: sequenceRenderKey(event) });
  }
  const completed = type === 'item.completed';
  if (item.type === 'mcp_tool_call') {
    const name = [item.server, item.tool].filter(Boolean).join('.') || 'tool call';
    const status = completed ? item.error ? 'failed' : 'complete' : 'running';
    return projection({ kind: completed ? 'tool_result' : 'tool_call', class: 'operations', label: completed ? 'Tool result' : 'Tool call', tone: item.error ? 'error' : 'tool', summary: `${name} ${status}`, event, renderKey: providerItemRenderKey(event, item, 'tool') });
  }
  if (item.type === 'agent_message') {
    return projection({ kind: 'provider_agent_message', class: 'diagnostics', label: 'Provider message', tone: 'assistant', summary: String(item.text ?? ''), event, renderKey: providerItemRenderKey(event, item, 'provider-agent-message') });
  }
  return projection({ kind: `provider_item_${safeKind(item.type ?? 'unknown')}`, class: 'diagnostics', label: 'Provider item', tone: 'unknown', summary: safeSummary(item), event, renderKey: providerItemRenderKey(event, item, 'provider-item') });
}

function projection({ kind, class: eventClass = null, label, tone, summary, event, renderKey = null }) {
  return {
    kind,
    ...(eventClass ? { class: eventClass } : {}),
    label,
    tone,
    summary,
    event,
    ...(renderKey ? { renderKey } : {}),
  };
}

function providerItemRenderKey(event, item, prefix) {
  const itemId = item?.id ?? null;
  if (!itemId) return sequenceRenderKey(event);
  return `${prefix}:provider-item:${eventAgentGroupKey(event)}:${event?.session_id ?? 'session'}:${itemId}`;
}

function eventAgentDisplay(event) {
  return agentIdentityDisplay(
    event?.agent_identity_ref,
    stringField(event, 'agent_id') ?? stringField(event, 'agentId') ?? 'agent',
  ) ?? 'agent';
}

function eventAgentGroupKey(event) {
  return agentIdentityGroupKey(
    event?.agent_identity_ref,
    stringField(event, 'agent_id') ?? stringField(event, 'agentId') ?? 'unknown',
    stringField(event, 'site_id') ?? stringField(event, 'siteId') ?? null,
  );
}

function stringField(record, field) {
  if (!record || typeof record !== 'object') return null;
  const value = record[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sequenceRenderKey(event) {
  const sequence = event?.event_sequence ?? event?.sequence;
  return Number.isFinite(Number(sequence)) ? `sequence:${sequence}` : null;
}

function safeKind(value) {
  return String(value ?? 'unknown').replace(/[^a-z0-9_]+/gi, '_');
}

function safeSummary(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'object') return String(value);
  if (typeof value.message === 'string') return value.message;
  if (typeof value.text === 'string') return value.text;
  if (typeof value.type === 'string') return value.type;
  return JSON.stringify(value);
}

export const NARS_CLIENT_PROJECTION_REGISTRY = Object.freeze({
  schema: 'narada.nars.client_projection_registry.v1',
  default_verbosity: NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY,
  verbosity_levels: NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS,
  clients: Object.freeze({
    agent_cli: Object.freeze({
      id: 'agent_cli',
      package: '@narada2/agent-cli',
      bin: 'narada-agent-cli',
      attach_template: 'narada-agent-cli --attach <event_endpoint>',
      required_endpoints: Object.freeze(['event_endpoint']),
    }),
    agent_tui: Object.freeze({
      id: 'agent_tui',
      package: 'agent-tui',
      bin: 'agent-tui',
      attach_template: 'agent-tui --attach <event_endpoint>',
      required_endpoints: Object.freeze(['event_endpoint']),
    }),
    agent_web_ui: Object.freeze({
      id: 'agent_web_ui',
      package: '@narada2/agent-web-ui',
      bin: 'narada-agent-web-ui',
      attach_template: 'narada-agent-web-ui --event-endpoint <event_endpoint> --health-endpoint <health_endpoint>',
      required_endpoints: Object.freeze(['event_endpoint', 'health_endpoint']),
      admitted_methods: AGENT_WEB_UI_NARS_METHOD_LIST,
      adapter_methods: AGENT_WEB_UI_CLOUDFLARE_METHOD_LIST,
    }),
  }),
});

export function buildNarsAttachCommands({ eventEndpoint = '<session_started.event_endpoint>', healthEndpoint = '<session_started.health_endpoint>' } = {}) {
  const event = eventEndpoint || '<session_started.event_endpoint>';
  const health = healthEndpoint || '<session_started.health_endpoint>';
  const agentWebUiHealth = health ? ` --health-endpoint ${health}` : '';
  return {
    registry_schema: NARS_CLIENT_PROJECTION_REGISTRY.schema,
    agent_cli: `narada-agent-cli --attach ${event}`,
    agent_tui: `agent-tui --attach ${event}`,
    agent_web_ui: `narada-agent-web-ui --event-endpoint ${event}${agentWebUiHealth}`,
    protocol: '{"id":"events-1","method":"session.events.subscribe","params":{"include_replay":true,"max_replay":20}}',
    operator_input_protocol: '{"id":"input-1","method":"session.submit","params":{"content":"<operator message>","source":"manual_operator"}}',
    queued_operator_input_protocol: '{"id":"input-2","method":"session.submit","params":{"content":"<operator message>","source":"operator_steering","delivery_mode":"admit_after_active_turn"}}',
    slash_command_protocol: '{"id":"command-1","method":"session.command.execute","params":{"command":"/status","value":""}}',
  };
}
