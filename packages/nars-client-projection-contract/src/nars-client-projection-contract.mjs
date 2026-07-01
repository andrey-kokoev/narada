export const NARS_COMMAND_METHOD = 'carrier.command.execute';

export const NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS = Object.freeze([
  'conversation',
  'operations',
  'diagnostics',
  'raw',
]);

export const NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY = 'operations';

export const NARS_CLIENT_PROJECTION_VERBOSITY_RANK = Object.freeze({
  conversation: 0,
  operations: 1,
  diagnostics: 2,
  raw: 3,
});

export const AGENT_WEB_UI_NARS_METHOD_LIST = Object.freeze([
  'session.events.subscribe',
  'session.events.read',
  'session.artifacts.register',
  'session.artifacts.read',
  'conversation.send',
  'conversation.enqueue',
  'session.status',
  'session.health',
  'session.recovery',
  'session.operations',
  'observers.status',
  'observer.mute',
  'observer.unmute',
  NARS_COMMAND_METHOD,
  'conversation.interrupt',
  'conversation.steer',
  'session.close',
]);

export const AGENT_WEB_UI_CARRIER_COMMANDS = Object.freeze([
  '/goal',
  '/stats',
  '/model',
  '/thinking',
  '/tool-output',
  '/tool-outputs',
  '/tools',
  '/tool',
  '/queue',
]);

export const AGENT_WEB_UI_HELP_LINES = Object.freeze([
  'Commands',
  '/help, /clear, /status, /health, /events, /recovery, /ops, /interrupt, /tools, /queue, /goal, /model, /thinking, /exit',
  'Ordinary text is submitted as conversation.send when idle and conversation.enqueue during active turns. Use /interrupt or explicit JSON for interruptive steering.',
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
  session_status: 'Status',
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
  input_queued_for_turn_boundary: 'Queued input',
  input_admitted_to_turn: 'Input admitted',
  input_dropped_by_operator: 'Input dropped',
  input_abandoned_on_session_end: 'Input abandoned',
  input_completed: 'Input complete',
});

export const AGENT_WEB_UI_NARS_METHODS = new Set(AGENT_WEB_UI_NARS_METHOD_LIST);

export function isAgentWebUiNarsMethod(method) {
  return AGENT_WEB_UI_NARS_METHODS.has(method);
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

export function buildAgentWebUiConversationEnqueueFrame(text, options = {}) {
  const message = String(text ?? '').trim();
  if (!message) return null;
  return {
    id: options.id ?? `agent-web-ui-enqueue-${Date.now()}`,
    method: 'conversation.enqueue',
    params: {
      message,
      source: 'agent-web-ui',
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

export function buildAgentWebUiHelpText() {
  return AGENT_WEB_UI_HELP_LINES.join('\n');
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
    method: 'conversation.send',
    params: {
      message,
      source: 'agent-web-ui',
    },
  };
}

export function buildAgentWebUiConversationSteerFrame(text, options = {}) {
  const message = String(text ?? '').trim();
  if (!message) return null;
  return {
    id: options.id ?? `agent-web-ui-steer-${Date.now()}`,
    method: 'conversation.steer',
    params: {
      message,
      source: 'agent-web-ui',
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

export function isAgentWebUiProtocolFrame(frame) {
  return Boolean(frame && typeof frame === 'object' && isAgentWebUiNarsMethod(frame.method));
}

export function buildAgentWebUiOperatorInputAction(text, options = {}) {
  const content = String(text ?? '').trim();
  if (!content) return null;
  const lower = content.toLowerCase();
  if (lower === '/help') return { kind: 'local_help' };
  if (lower === '/clear') return { kind: 'local_clear' };
  if (lower === 'exit' || lower === '/exit' || lower === '/quit') {
    return { kind: 'frame', frame: { id: options.id ?? requestIdForCommand('exit'), method: 'session.close', params: {} } };
  }
  if (!content.startsWith('/')) {
    return {
      kind: 'frame',
      frame: options.activeTurn ? buildAgentWebUiConversationEnqueueFrame(content, options) : buildAgentWebUiConversationSendFrame(content, options),
    };
  }
  if (lower.startsWith('/json ')) {
    try {
      const frame = JSON.parse(content.slice('/json '.length));
      return isAgentWebUiProtocolFrame(frame) ? { kind: 'frame', frame } : { kind: 'message', message: 'JSON frame method is not admitted for agent-web-ui.' };
    } catch (error) {
      return { kind: 'message', message: `Invalid JSON frame: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  const [rawCommand, ...rest] = content.split(/\s+/);
  const command = rawCommand.toLowerCase();
  const value = rest.join(' ').trim();
  if (command === '/status') return { kind: 'frame', frame: { id: options.id ?? requestIdForCommand('status'), method: 'session.status', params: {} } };
  if (command === '/health') return { kind: 'frame', frame: { id: options.id ?? requestIdForCommand('health'), method: 'session.health', params: {} } };
  if (command === '/events') return { kind: 'frame', frame: buildAgentWebUiSubscribeFrame({ id: options.id ?? requestIdForCommand('events'), maxReplay: 20, includeReplay: true }) };
  if (command === '/recovery') return { kind: 'frame', frame: { id: options.id ?? requestIdForCommand('recovery'), method: 'session.recovery', params: {} } };
  if (command === '/ops') return { kind: 'frame', frame: { id: options.id ?? requestIdForCommand('ops'), method: 'session.operations', params: {} } };
  if (command === '/interrupt') return { kind: 'frame', frame: { id: options.id ?? requestIdForCommand('interrupt'), method: 'conversation.interrupt', params: {} } };
  if (command === '/observers') return { kind: 'frame', frame: { id: options.id ?? requestIdForCommand('observers'), method: 'observers.status', params: {} } };
  if (command === '/observer' && value === 'mute') return { kind: 'frame', frame: { id: options.id ?? requestIdForCommand('observer-mute'), method: 'observer.mute', params: {} } };
  if (command === '/observer' && value === 'unmute') return { kind: 'frame', frame: { id: options.id ?? requestIdForCommand('observer-unmute'), method: 'observer.unmute', params: {} } };
  if (AGENT_WEB_UI_CARRIER_COMMANDS.includes(command)) return { kind: 'frame', frame: commandFrame(command, value) };
  if (command === '/observer') return { kind: 'message', message: 'Usage: /observer mute|unmute' };
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
  const kind = projection?.kind ?? projection?.event?.event ?? 'unknown';
  const event = projection?.event ?? projection;
  if (kind === 'assistant_message' || kind === 'assistant_message_stream' || kind === 'user_message' || kind === 'operator_input_submitted' || kind === 'agent_web_ui_message' || kind === 'agent_web_ui_help') return 'conversation';
  if (kind === 'error' || kind === 'websocket_error' || kind === 'web_ui_decode_error' || kind === 'web_ui_input_not_sent' || kind === 'runtime_error') return 'conversation';
  if (kind === 'tool_call' || kind === 'tool_result' || kind === 'turn_failed') return 'operations';
  if (kind === 'session_artifact_registered' || kind === 'session_artifact_read') return 'operations';
  if (kind === 'conversation_enqueue_requested' || kind === 'input_queued_for_turn_boundary' || kind === 'input_admitted_to_turn' || kind === 'input_dropped_by_operator' || kind === 'input_abandoned_on_session_end' || kind === 'input_completed') return 'operations';
  if (kind === 'session_health') return isRoutineHealthyNarsSessionHealth(event) ? 'diagnostics' : 'operations';
  if (kind === 'session_started' || kind === 'session_closed' || kind === 'session_status' || kind === 'session_recovery' || kind === 'session_operations' || kind === 'observer_status' || kind === 'observers_status' || kind === 'carrier_command_result') return 'operations';
  if (kind === 'turn_started' || kind === 'turn_complete' || kind === 'directive_received' || kind === 'directive_receipt_recorded' || kind === 'directive_carrier_accepted_recorded' || kind === 'directive_complete' || kind === 'session_events_subscription_started' || kind === 'websocket_connected') return 'diagnostics';
  if (kind?.startsWith?.('provider_')) return 'diagnostics';
  return 'raw';
}

export function shouldProjectNarsClientProjection(projection, options = {}) {
  if (isRoutineStateSampleProjection(projection) && options.includeStateSamples !== true) return false;
  const verbosity = normalizeNarsClientProjectionVerbosity(options.verbosity);
  if (verbosity === 'raw') return true;
  const eventLevel = classifyNarsClientEventProjection(projection);
  return NARS_CLIENT_PROJECTION_VERBOSITY_RANK[eventLevel] <= NARS_CLIENT_PROJECTION_VERBOSITY_RANK[verbosity];
}

export function isRoutineStateSampleProjection(projection) {
  const kind = projection?.kind ?? projection?.event?.event ?? 'unknown';
  const event = projection?.event ?? projection;
  return kind === 'websocket_connected' || (kind === 'session_health' && isRoutineHealthyNarsSessionHealth(event));
}

export function shouldProjectNarsClientEvent(message, options = {}) {
  return shouldProjectNarsClientProjection(projectNarsClientEvent(message), options);
}

function eventTone(kind) {
  if (kind === 'assistant_message') return NARS_CLIENT_EVENT_TONES.assistant;
  if (kind === 'user_message') return NARS_CLIENT_EVENT_TONES.operator;
  if (kind === 'tool_call' || kind === 'tool_result') return NARS_CLIENT_EVENT_TONES.tool;
  if (kind === 'session_artifact_registered' || kind === 'session_artifact_read') return NARS_CLIENT_EVENT_TONES.status;
  if (kind === 'error' || kind === 'websocket_error' || kind === 'web_ui_decode_error' || kind === 'turn_failed') return NARS_CLIENT_EVENT_TONES.error;
  if (kind?.startsWith?.('agent_web_ui_') || kind === 'operator_input_submitted' || kind === 'web_ui_input_not_sent') return NARS_CLIENT_EVENT_TONES.local;
  if (kind === 'conversation_enqueue_requested' || kind?.startsWith?.('input_')) return NARS_CLIENT_EVENT_TONES.status;
  if (kind?.startsWith?.('session_') || kind?.startsWith?.('turn_')) return NARS_CLIENT_EVENT_TONES.session;
  return NARS_CLIENT_EVENT_TONES.unknown;
}

function eventSummary(event, kind) {
  if (kind === 'assistant_message') return event.content ?? event.message ?? 'assistant message';
  if (kind === 'user_message') return event.content ?? event.message ?? 'operator message';
  if (kind === 'tool_call') return event.tool_name ?? event.name ?? 'tool call';
  if (kind === 'tool_result') return `${event.tool_name ?? event.name ?? 'tool result'}${event.status ? ` ${event.status}` : ''}`;
  if (kind === 'session_started') return `${event.agent_id ?? 'agent'} / ${event.session_id ?? 'session'}`;
  if (kind === 'session_events_subscription_started') return `${event.replay_count ?? 0} replayed event(s)`;
  if (kind === 'session_artifact_registered') return event.artifact?.title ?? event.artifact?.artifact_id ?? 'artifact registered';
  if (kind === 'session_artifact_read') return event.artifact?.title ?? event.artifact?.artifact_id ?? 'artifact';
  if (kind === 'session_health') return `${event.status ?? 'health'} · ${event.agent_id ?? 'agent'} · ${event.session_id ?? 'session'}`;
  if (kind === 'turn_complete') return event.terminal_state ?? 'turn complete';
  if (kind === 'turn_started') return event.turn_id ?? 'turn started';
  if (kind === 'conversation_enqueue_requested') return event.delivery_semantics ?? 'queued for next turn';
  if (kind?.startsWith?.('input_')) return `${event.input_event_id ?? event.event_id ?? 'input'}${event.terminal_state ? ` ${event.terminal_state}` : ''}`;
  if (kind === 'error' || kind === 'websocket_error' || kind === 'web_ui_decode_error') return event.message ?? event.code ?? 'error';
  if (typeof event?.message === 'string') return event.message;
  if (typeof event?.content === 'string') return event.content;
  return '';
}

export function projectNarsClientEvent(message) {
  const event = unwrapNarsClientEvent(message);
  const kind = event?.event ?? 'unknown';
  const label = NARS_CLIENT_EVENT_LABELS[kind] ?? kind;
  const summary = eventSummary(event, kind);
  return {
    kind,
    label,
    tone: eventTone(kind),
    summary,
    event,
  };
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
    operator_input_protocol: '{"id":"input-1","method":"conversation.send","params":{"message":"<operator message>","source":"agent-web-ui"}}',
    queued_operator_input_protocol: '{"id":"input-2","method":"conversation.enqueue","params":{"message":"<operator message>","source":"agent-web-ui"}}',
    slash_command_protocol: `{"id":"command-1","method":"${NARS_COMMAND_METHOD}","params":{"command":"/status","value":""}}`,
  };
}
