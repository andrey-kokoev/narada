export const NARS_COMMAND_METHOD = 'carrier.command.execute';
export const NARS_COMMAND_COMPATIBILITY_METHODS = Object.freeze(['agent-cli.command']);

export const AGENT_WEB_UI_NARS_METHOD_LIST = Object.freeze([
  'session.events.subscribe',
  'conversation.send',
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
  'Ordinary text is submitted as conversation.send; during active turns it is submitted as conversation.steer.',
]);

export const AGENT_WEB_UI_NARS_METHODS = new Set(AGENT_WEB_UI_NARS_METHOD_LIST);

export function isAgentWebUiNarsMethod(method) {
  return AGENT_WEB_UI_NARS_METHODS.has(method);
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
      frame: options.activeTurn ? buildAgentWebUiConversationSteerFrame(content, options) : buildAgentWebUiConversationSendFrame(content, options),
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

export const NARS_CLIENT_PROJECTION_REGISTRY = Object.freeze({
  schema: 'narada.nars.client_projection_registry.v1',
  clients: Object.freeze({
    agent_cli: Object.freeze({
      id: 'agent_cli',
      package: '@narada2/agent-cli',
      bin: 'narada-agent-cli',
      attach_template: 'narada-agent-cli --attach <event_endpoint>',
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
    agent_web_ui: `narada-agent-web-ui --event-endpoint ${event}${agentWebUiHealth}`,
    protocol: '{"id":"events-1","method":"session.events.subscribe","params":{"include_replay":true,"max_replay":20}}',
    operator_input_protocol: '{"id":"input-1","method":"conversation.send","params":{"message":"<operator message>","source":"agent-web-ui"}}',
    slash_command_protocol: `{"id":"command-1","method":"${NARS_COMMAND_METHOD}","params":{"command":"/status","value":""}}`,
    compatibility_methods: [...NARS_COMMAND_COMPATIBILITY_METHODS],
  };
}
