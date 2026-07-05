export const NARS_COMMAND_METHOD = 'session.command.execute';
export const LEGACY_CARRIER_COMMAND_METHOD = 'carrier.command.execute';

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

export const AGENT_WEB_UI_NARS_METHOD_LIST = Object.freeze([
  'session.events.subscribe',
  'session.events.read',
  'session.artifacts.register',
  'session.artifacts.read',
  'session.surface.affordances',
  'session.sop.summary',
  'session.mailbox.summary',
  'session.scheduler.summary',
  'session.task_lifecycle.summary',
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
  LEGACY_CARRIER_COMMAND_METHOD,
  'conversation.interrupt',
  'conversation.steer',
  'session.close',
]);

export const AGENT_WEB_UI_SESSION_COMMANDS = Object.freeze([
  '/goal',
  '/stats',
  '/model',
  '/thinking',
  '/tool-output',
  '/tool-outputs',
  '/tools',
  '/tool',
  '/help, /clear, /status, /health, /events, /recovery, /ops, /interrupt, /tools, /queue, /goal, /model, /thinking, /exit',
  'Ordinary text is submitted as conversation.send when idle and conversation.steer during active turns. Press Tab in agent-web-ui to queue with conversation.enqueue.',
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
  carrier_diagnostic_recorded: 'Diagnostic',
  mcp_runtime_fault: 'MCP runtime fault',
  authority_session_revoked: 'Session revoked',
  projection_revoked: 'Projection revoked',
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

export function isAgentWebUiNarsMethod(method) {
  return AGENT_WEB_UI_NARS_METHODS.has(method);
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
    palette: Object.freeze({ visible: options.visible !== false, rank: options.rank ?? 500, danger: options.danger === true }),
    buildAction: options.buildAction,
  });
}

function frameCommand(id, slash, method, options = {}) {
  return localCommand(id, slash, {
    ...options,
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
    kind: 'nars_session_command',
    group: options.group ?? 'session',
    buildAction: (input) => ({ kind: 'frame', frame: commandFrame(slash, input.value) }),
  });
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
  frameCommand('status', '/status', 'session.status', { title: 'Show session status', description: 'Request the current NARS session status.', group: 'session', rank: 100 }),
  frameCommand('health', '/health', 'session.health', { title: 'Check health', description: 'Request current runtime and MCP health.', group: 'session', rank: 110 }),
  localCommand('events', '/events', {
    kind: 'nars_protocol',
    title: 'Replay recent events',
    description: 'Subscribe with a short replay of recent session events.',
    group: 'diagnostics',
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
    usage: '/observer mute|unmute',
    keywords: ['mute', 'unmute'],
    rank: 160,
    buildAction: (input, context = {}) => {
      if (input.value === 'mute') return { kind: 'frame', frame: { id: context.id ?? requestIdForCommand('observer-mute'), method: 'observer.mute', params: {} } };
      if (input.value === 'unmute') return { kind: 'frame', frame: { id: context.id ?? requestIdForCommand('observer-unmute'), method: 'observer.unmute', params: {} } };
      return { kind: 'message', message: 'Usage: /observer mute|unmute' };
    },
  }),
  frameCommand('interrupt', '/interrupt', 'conversation.interrupt', { title: 'Interrupt response', description: 'Ask NARS to interrupt the active model turn.', group: 'conversation', rank: 200, danger: true }),
  frameCommand('exit', '/exit', 'session.close', { title: 'Close session', description: 'Close this NARS session.', aliases: ['/quit'], group: 'session', rank: 900, danger: true }),
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
        return isAgentWebUiProtocolFrame(frame) ? { kind: 'frame', frame } : { kind: 'message', message: 'JSON frame method is not admitted for agent-web-ui.' };
      } catch (error) {
        return { kind: 'message', message: `Invalid JSON frame: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  }),
  sessionCommand('goal', '/goal', { title: 'Goal command', description: 'Run the NARS-compatible goal session command.', group: 'conversation', rank: 300 }),
  sessionCommand('stats', '/stats', { title: 'Stats command', description: 'Run the NARS-compatible stats session command.', group: 'diagnostics', rank: 310 }),
  sessionCommand('model', '/model', { title: 'Model command', description: 'Run the NARS-compatible model session command.', group: 'settings', rank: 320 }),
  sessionCommand('thinking', '/thinking', { title: 'Thinking command', description: 'Run the NARS-compatible thinking session command.', group: 'settings', rank: 330 }),
  sessionCommand('tool-output', '/tool-output', { title: 'Tool output command', description: 'Run the NARS-compatible tool-output session command.', aliases: ['/tool-outputs'], group: 'settings', rank: 340 }),
  sessionCommand('tools', '/tools', { title: 'Tools command', description: 'Run the NARS-compatible tools session command.', aliases: ['/tool'], group: 'diagnostics', rank: 350 }),
  sessionCommand('queue', '/queue', { title: 'Queue command', description: 'Run the NARS-compatible queue session command.', group: 'conversation', rank: 360 }),
]);

export const AGENT_WEB_UI_COMMAND_GROUP_LABELS = Object.freeze({
  conversation: 'Conversation control',
  session: 'Session state',
  diagnostics: 'Diagnostics',
  settings: 'Settings',
  local: 'Local UI',
  advanced: 'Advanced',
});

const COMMAND_GROUP_ORDER = Object.freeze(['conversation', 'session', 'diagnostics', 'settings', 'local', 'advanced']);

export const AGENT_WEB_UI_HELP_LINES = Object.freeze([
  'Commands',
  ...COMMAND_GROUP_ORDER.flatMap((group) => {
    const commands = AGENT_WEB_UI_COMMANDS.filter((command) => command.group === group && command.palette.visible !== false);
    if (!commands.length) return [];
    return [AGENT_WEB_UI_COMMAND_GROUP_LABELS[group] ?? group, commands.map((command) => command.usage ?? command.slash).join(', ')];
  }),
  'Ordinary text is submitted as conversation.send when idle and conversation.steer during active turns. Press Tab in agent-web-ui to queue with conversation.enqueue.',
]);

export function buildAgentWebUiHelpText() {
  return AGENT_WEB_UI_HELP_LINES.join('\n');
}

export function findAgentWebUiCommand(rawCommand) {
  const command = String(rawCommand ?? '').trim().toLowerCase();
  if (!command) return null;
  return AGENT_WEB_UI_COMMANDS.find((entry) => entry.slash === command || entry.aliases.includes(command)) ?? null;
}

export function filterAgentWebUiCommands(query = '') {
  const normalized = String(query ?? '').trim().toLowerCase().replace(/^\//, '');
  const commands = AGENT_WEB_UI_COMMANDS.filter((entry) => entry.palette.visible !== false);
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
  const terms = [entry.slash, ...entry.aliases, entry.title, entry.description, entry.group, ...(entry.keywords ?? [])].map((term) => String(term).toLowerCase().replace(/^\//, ''));
  let best = -1;
  for (const term of terms) {
    if (term === query) best = best < 0 ? 0 : Math.min(best, 0);
    else if (term.startsWith(query)) best = best < 0 ? 1 : Math.min(best, 1);
    else if (term.includes(query)) best = best < 0 ? 2 : Math.min(best, 2);
  }
  return best;
}

export function buildAgentWebUiOperatorInputAction(text, options = {}) {
  const content = String(text ?? '').trim();
  if (!content) return null;
  const lower = content.toLowerCase();
  if (lower === 'exit' || lower === '/exit' || lower === '/quit') {
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
  if (kind === 'tool_call' || kind === 'tool_result' || kind === 'turn_failed') return 'operations';
  if (kind === 'session_artifact_registered' || kind === 'session_artifact_read') return 'conversation';
  if (kind === 'conversation_enqueue_requested' || kind === 'input_queued_for_turn_boundary' || kind === 'input_admitted_to_turn' || kind === 'input_dropped_by_operator' || kind === 'input_abandoned_on_session_end' || kind === 'input_completed') return 'operations';
  if (kind === 'session_health') return isRoutineHealthyNarsSessionHealth(event) ? 'diagnostics' : 'operations';
  if (kind?.startsWith?.('authority_source_') || kind?.startsWith?.('authority_target_')) return 'operations';
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

function eventTone(kind) {
  if (kind === 'assistant_message' || kind === 'provider_agent_message') return NARS_CLIENT_EVENT_TONES.assistant;
  if (kind === 'user_message') return NARS_CLIENT_EVENT_TONES.operator;
  if (kind === 'tool_call' || kind === 'tool_result') return NARS_CLIENT_EVENT_TONES.tool;
  if (kind === 'session_artifact_registered' || kind === 'session_artifact_read') return NARS_CLIENT_EVENT_TONES.status;
  if (kind === 'error' || kind === 'websocket_error' || kind === 'web_ui_decode_error' || kind === 'turn_failed' || kind === 'authority_session_revoked' || kind === 'projection_revoked' || kind === 'mcp_runtime_fault') return NARS_CLIENT_EVENT_TONES.error;
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
  if (kind === 'tool_call') return event.tool_name ?? event.name ?? 'tool call';
  if (kind === 'tool_result') return `${event.tool_name ?? event.name ?? 'tool result'}${event.status ? ` ${event.status}` : ''}`;
  if (kind === 'session_started') return `${event.agent_id ?? 'agent'} / ${event.session_id ?? 'session'}`;
  if (kind === 'authority_session_revoked') return event.code ?? 'session_revoked';
  if (kind === 'projection_revoked') return event.code ?? 'projection_revoked';
  if (kind === 'session_events_subscription_started') return `${event.replay_count ?? 0} replayed event(s)`;
  if (kind === 'session_artifact_registered') return artifactSummary(event, 'artifact registered');
  if (kind === 'session_artifact_read') return artifactSummary(event, 'artifact');
  if (kind === 'session_health') return `${event.status ?? 'health'} · ${event.agent_id ?? 'agent'} · ${event.session_id ?? 'session'}`;
  if (kind === 'mcp_runtime_fault' || kind === 'carrier_diagnostic_recorded') return diagnosticSummary(event, kind);
  if (kind === 'turn_complete') return event.terminal_state ?? 'turn complete';
  if (kind === 'turn_started') return event.turn_id ?? 'turn started';
  if (kind === 'conversation_enqueue_requested') return event.delivery_semantics ?? 'queued for next turn';
  if (kind?.startsWith?.('authority_source_') || kind?.startsWith?.('authority_target_')) return authorityTransitionSummary(event, kind);
  if (kind?.startsWith?.('input_')) return `${event.input_event_id ?? event.event_id ?? 'input'}${event.terminal_state ? ` ${event.terminal_state}` : ''}`;
  if (kind === 'error' || kind === 'websocket_error' || kind === 'web_ui_decode_error') return event.message ?? event.code ?? 'error';
  if (typeof event?.message === 'string') return event.message;
  if (typeof event?.content === 'string') return event.content;
  return '';
}

function diagnosticSummary(event, kind) {
  if (kind === 'mcp_runtime_fault' || event?.diagnostic_code === 'mcp_runtime_fault') {
    const server = event.server_name ?? 'unknown';
    const tool = event.tool_name ?? '<missing>';
    const error = event.error_code ?? event.error ?? event.message ?? null;
    return `MCP runtime fault ${server}:${tool}${error ? ` ${error}` : ''}`;
  }
  return event?.message ?? event?.diagnostic_code ?? kind;
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
  const renderKey = genericRenderKey(event, kind);
  return {
    kind,
    label,
    tone: eventTone(kind),
    summary,
    event,
    ...(renderKey ? { renderKey } : {}),
  };
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
  return `${prefix}:provider-item:${event?.agent_id ?? 'agent'}:${event?.session_id ?? 'session'}:${itemId}`;
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
