import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENT_WEB_UI_COMMANDS,
  AGENT_WEB_UI_NARS_METHOD_LIST,
  NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY,
  NARS_CLIENT_PROJECTION_REGISTRY,
  NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS,
  LEGACY_CARRIER_COMMAND_METHOD,
  NARS_COMMAND_METHOD,
  buildAgentWebUiConversationEnqueueFrame,
  buildAgentWebUiConversationSendFrame,
  buildAgentWebUiConversationSteerFrame,
  buildAgentWebUiEventsReadFrame,
  buildAgentWebUiHelpText,
  buildAgentWebUiOperatorInputAction,
  buildAgentWebUiSopSummaryFrame,
  buildAgentWebUiSurfaceAffordancesFrame,
  buildAgentWebUiSubscribeFrame,
  buildNarsAttachCommands,
  classifyNarsClientEventProjection,
  filterAgentWebUiCommands,
  findAgentWebUiCommand,
  isAgentWebUiNarsMethod,
  isAgentWebUiProtocolFrame,
  projectNarsClientEvent,
  shouldProjectNarsClientEvent,
  shouldProjectNarsClientProjection,
} from './nars-client-projection-contract.mjs';

test('NARS client projection contract owns attach commands and web UI capabilities', () => {
  assert.equal(NARS_COMMAND_METHOD, 'session.command.execute');
  assert.equal(LEGACY_CARRIER_COMMAND_METHOD, 'carrier.command.execute');
  assert.equal(AGENT_WEB_UI_NARS_METHOD_LIST.includes('conversation.send'), true);
  assert.equal(AGENT_WEB_UI_NARS_METHOD_LIST.includes('conversation.enqueue'), true);
  assert.equal(AGENT_WEB_UI_NARS_METHOD_LIST.includes('conversation.interrupt'), true);
  assert.equal(AGENT_WEB_UI_NARS_METHOD_LIST.includes('conversation.steer'), true);
  assert.equal(AGENT_WEB_UI_NARS_METHOD_LIST.includes('session.events.read'), true);
  assert.equal(AGENT_WEB_UI_NARS_METHOD_LIST.includes('session.surface.affordances'), true);
  assert.equal(AGENT_WEB_UI_NARS_METHOD_LIST.includes('session.sop.summary'), true);
  assert.equal(AGENT_WEB_UI_NARS_METHOD_LIST.includes('command.execute'), false);
  assert.equal(NARS_CLIENT_PROJECTION_REGISTRY.clients.agent_web_ui.admitted_methods, AGENT_WEB_UI_NARS_METHOD_LIST);
  assert.equal(NARS_CLIENT_PROJECTION_REGISTRY.clients.agent_tui.attach_template, 'agent-tui --attach <event_endpoint>');
  assert.deepEqual(buildNarsAttachCommands({ eventEndpoint: 'ws://127.0.0.1/events', healthEndpoint: 'http://127.0.0.1/health' }), {
    registry_schema: 'narada.nars.client_projection_registry.v1',
    agent_cli: 'narada-agent-cli --attach ws://127.0.0.1/events',
    agent_tui: 'agent-tui --attach ws://127.0.0.1/events',
    agent_web_ui: 'narada-agent-web-ui --event-endpoint ws://127.0.0.1/events --health-endpoint http://127.0.0.1/health',
    protocol: '{"id":"events-1","method":"session.events.subscribe","params":{"include_replay":true,"max_replay":20}}',
    operator_input_protocol: '{"id":"input-1","method":"conversation.send","params":{"message":"<operator message>","source":"agent-web-ui"}}',
    queued_operator_input_protocol: '{"id":"input-2","method":"conversation.enqueue","params":{"message":"<operator message>","source":"agent-web-ui"}}',
    slash_command_protocol: '{"id":"command-1","method":"session.command.execute","params":{"command":"/status","value":""}}',
  });
  assert.equal(NARS_CLIENT_PROJECTION_REGISTRY.default_verbosity, 'conversation');
  assert.equal(NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY, 'conversation');
  assert.deepEqual(NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS, ['conversation', 'operations', 'diagnostics', 'raw']);
});

test('NARS client projection contract owns web UI operator input projection', () => {
  assert.deepEqual(buildAgentWebUiSubscribeFrame({ id: 'events-1', maxReplay: 20, includeReplay: true }), {
    id: 'events-1',
    method: 'session.events.subscribe',
    params: { include_replay: true, max_replay: 20 },
  });
  assert.deepEqual(buildAgentWebUiEventsReadFrame({ id: 'events-read-1', beforeSequence: 50, direction: 'backward', limit: 25 }), {
    id: 'events-read-1',
    method: 'session.events.read',
    params: { limit: 25, before_sequence: 50, direction: 'backward' },
  });
  assert.deepEqual(buildAgentWebUiSopSummaryFrame({ id: 'sop-1', templateLimit: 10, runLimit: 5, includeTerminal: false }), {
    id: 'sop-1',
    method: 'session.sop.summary',
    params: { template_limit: 10, run_limit: 5, include_terminal: false },
  });
  assert.deepEqual(buildAgentWebUiSurfaceAffordancesFrame({ id: 'affordances-1' }), {
    id: 'affordances-1',
    method: 'session.surface.affordances',
    params: {},
  });
  assert.deepEqual(buildAgentWebUiConversationSendFrame('run startup sequence', { id: 'input-1' }), {
    id: 'input-1',
    method: 'conversation.send',
    params: { message: 'run startup sequence', source: 'agent-web-ui' },
  });
  assert.equal(buildAgentWebUiConversationSendFrame('   '), null);
  assert.deepEqual(buildAgentWebUiConversationSteerFrame('change course', { id: 'steer-1', activeTurnId: 'turn_1' }), {
    id: 'steer-1',
    method: 'conversation.steer',
    params: { message: 'change course', source: 'agent-web-ui', active_turn_id: 'turn_1' },
  });
  assert.deepEqual(buildAgentWebUiConversationEnqueueFrame('run after this', { id: 'enqueue-1', activeTurnId: 'turn_2' }), {
    id: 'enqueue-1',
    method: 'conversation.enqueue',
    params: { message: 'run after this', source: 'agent-web-ui', active_turn_id: 'turn_2' },
  });
  assert.deepEqual(buildAgentWebUiOperatorInputAction('change course', { id: 'steer-2', activeTurn: true, activeTurnId: 'turn_2' }).frame, {
    id: 'steer-2',
    method: 'conversation.steer',
    params: { message: 'change course', source: 'agent-web-ui', active_turn_id: 'turn_2' },
  });
  assert.deepEqual(buildAgentWebUiOperatorInputAction('run after this', { id: 'enqueue-2', activeTurn: true, activeTurnId: 'turn_2', deliveryMode: 'enqueue' }).frame, {
    id: 'enqueue-2',
    method: 'conversation.enqueue',
    params: { message: 'run after this', source: 'agent-web-ui', active_turn_id: 'turn_2' },
  });
  assert.equal(buildAgentWebUiOperatorInputAction('/help').kind, 'local_help');
  assert.equal(buildAgentWebUiOperatorInputAction('/clear').kind, 'local_clear');
  assert.equal(buildAgentWebUiOperatorInputAction('/status', { id: 'status-1' }).frame.method, 'session.status');
  assert.equal(buildAgentWebUiOperatorInputAction('/health', { id: 'health-1' }).frame.method, 'session.health');
  assert.equal(buildAgentWebUiOperatorInputAction('/events', { id: 'events-2' }).frame.method, 'session.events.subscribe');
  assert.equal(buildAgentWebUiOperatorInputAction('/recovery', { id: 'recovery-1' }).frame.method, 'session.recovery');
  assert.equal(buildAgentWebUiOperatorInputAction('/ops', { id: 'ops-1' }).frame.method, 'session.operations');
  assert.equal(buildAgentWebUiOperatorInputAction('/interrupt', { id: 'interrupt-1' }).frame.method, 'conversation.interrupt');
  assert.equal(buildAgentWebUiOperatorInputAction('/tools mcp', { id: 'tools-1' }).frame.method, 'session.command.execute');
  assert.deepEqual(buildAgentWebUiOperatorInputAction('/observer mute', { id: 'mute-1' }).frame, { id: 'mute-1', method: 'observer.mute', params: {} });
  assert.equal(buildAgentWebUiOperatorInputAction('/observer').message, 'Usage: /observer mute|unmute');
  assert.match(buildAgentWebUiHelpText(), /conversation\.enqueue/);
  assert.equal(isAgentWebUiNarsMethod('session.command.execute'), true);
  assert.equal(isAgentWebUiNarsMethod('carrier.command.execute'), true);
  assert.equal(isAgentWebUiNarsMethod('command.execute'), false);
  assert.equal(isAgentWebUiProtocolFrame({ id: 'ok', method: 'conversation.send', params: {} }), true);
  assert.equal(isAgentWebUiProtocolFrame({ id: 'read', method: 'session.events.read', params: {} }), true);
  assert.equal(isAgentWebUiProtocolFrame({ id: 'blocked', method: 'session.sync', params: {} }), false);
});

test('Agent Web UI commands are first-class static registry entries', () => {
  const slashes = AGENT_WEB_UI_COMMANDS.map((command) => command.slash);
  assert.equal(slashes.includes('/help'), true);
  assert.equal(slashes.includes('/status'), true);
  assert.equal(slashes.includes('/json'), true);
  assert.equal(findAgentWebUiCommand('/quit').id, 'exit');
  assert.equal(findAgentWebUiCommand('/tool').id, 'tools');
  assert.equal(findAgentWebUiCommand('/missing'), null);
  assert.equal(filterAgentWebUiCommands('stat')[0].slash, '/status');
  assert.equal(filterAgentWebUiCommands('mute').some((command) => command.slash === '/observer'), true);
  assert.match(buildAgentWebUiHelpText(), /Conversation control/);
  assert.match(buildAgentWebUiHelpText(), /\/observer mute\|unmute/);
  assert.equal(buildAgentWebUiOperatorInputAction('/json').message, 'Usage: /json <protocol frame JSON>');
});

test('NARS client projection contract owns shared event rendering vocabulary', () => {
  assert.deepEqual(projectNarsClientEvent({ event: 'session_event', payload: { event: 'assistant_message', content: 'hello' } }), {
    kind: 'assistant_message',
    label: 'Agent',
    tone: 'assistant',
    summary: 'hello',
    event: { event: 'assistant_message', content: 'hello' },
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'tool_result', tool_name: 'narada-site.whoami', status: 'ok' }), {
    kind: 'tool_result',
    label: 'Tool result',
    tone: 'tool',
    summary: 'narada-site.whoami ok',
    event: { event: 'tool_result', tool_name: 'narada-site.whoami', status: 'ok' },
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'mcp_runtime_fault', server_name: 'narada-site', tool_name: 'fixture_fail', error_code: 'fixture_mcp_forced_failure' }), {
    kind: 'mcp_runtime_fault',
    label: 'MCP runtime fault',
    tone: 'error',
    summary: 'MCP runtime fault narada-site:fixture_fail fixture_mcp_forced_failure',
    event: { event: 'mcp_runtime_fault', server_name: 'narada-site', tool_name: 'fixture_fail', error_code: 'fixture_mcp_forced_failure' },
  });
  assert.equal(projectNarsClientEvent({ event: 'error', message: 'bad' }).tone, 'error');
  assert.equal(projectNarsClientEvent({ event: 'session_health', status: 'healthy', agent_id: 'narada.test', session_id: 'carrier_test' }).summary, 'healthy · narada.test · carrier_test');
  assert.deepEqual(projectNarsClientEvent({ event: 'authority_session_revoked', session_id: 'cf_session_1', code: 'session_revoked' }), {
    kind: 'authority_session_revoked',
    label: 'Session revoked',
    tone: 'error',
    summary: 'session_revoked',
    event: { event: 'authority_session_revoked', session_id: 'cf_session_1', code: 'session_revoked' },
    renderKey: 'authority-session-revoked:cf_session_1',
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'projection_revoked', projection_id: 'proj_1', code: 'projection_revoked' }), {
    kind: 'projection_revoked',
    label: 'Projection revoked',
    tone: 'error',
    summary: 'projection_revoked',
    event: { event: 'projection_revoked', projection_id: 'proj_1', code: 'projection_revoked' },
    renderKey: 'projection-revoked:proj_1',
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'conversation_enqueue_requested', request_id: 'req_1', delivery_semantics: 'queued for next turn' }), {
    kind: 'conversation_enqueue_requested',
    label: 'Input queued',
    tone: 'status',
    summary: 'queued for next turn',
    event: { event: 'conversation_enqueue_requested', request_id: 'req_1', delivery_semantics: 'queued for next turn' },
    renderKey: 'operator-input-queued:req_1',
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'session_artifact_registered', artifact: { artifact_id: 'art_1', kind: 'html', title: 'Preview', render_hint: 'inline' } }), {
    kind: 'session_artifact_registered',
    label: 'Artifact registered',
    tone: 'status',
    summary: [{ type: 'text', text: 'Preview' }, { type: 'artifact_ref', artifact_id: 'art_1', kind: 'html', title: 'Preview', render_hint: 'inline' }],
    event: { event: 'session_artifact_registered', artifact: { artifact_id: 'art_1', kind: 'html', title: 'Preview', render_hint: 'inline' } },
  });
  assert.deepEqual(projectNarsClientEvent({
    event: 'authority_source_write_refused',
    code: 'authority_source_sealed',
    authority_transition_source: {
      state: 'sealed',
      authority_locator_ref: 'authority_locator:cloudflare-host/site/cf_session',
      target_authority_locator: { kind: 'cloudflare-host', site_id: 'site', session_id: 'cf_session' },
    },
  }), {
    kind: 'authority_source_write_refused',
    label: 'Source write refused',
    tone: 'error',
    summary: 'authority_source_sealed; reattach cloudflare-host/site/cf_session',
    event: {
      event: 'authority_source_write_refused',
      code: 'authority_source_sealed',
      authority_transition_source: {
        state: 'sealed',
        authority_locator_ref: 'authority_locator:cloudflare-host/site/cf_session',
        target_authority_locator: { kind: 'cloudflare-host', site_id: 'site', session_id: 'cf_session' },
      },
    },
  });
  assert.equal(projectNarsClientEvent({
    event: 'authority_target_active',
    target_first_sequence: 42,
    authority_epoch_token: { target_authority_epoch: 11 },
    authority_transition_source: { target_authority_locator: { kind: 'cloudflare-host', session_id: 'cf_session' } },
  }).summary, 'target active epoch 11; first event 42; cloudflare-host/cf_session');
  assert.equal(projectNarsClientEvent({
    event: 'authority_target_activation_refused',
    refusals: [{ reason_code: 'source_seal_evidence_missing' }, { reason_code: 'authority_epoch_token_invalid' }],
  }).summary, 'target activation refused: source_seal_evidence_missing, authority_epoch_token_invalid');
});

test('NARS client projection verbosity filters shared event classes', () => {
  const routineHealth = { event: 'session_health', status: 'healthy', mcp_operational_state: 'healthy', mcp_startup_failure_count: 0, mcp_runtime_fault_count: 0 };
  const unhealthy = { event: 'session_health', status: 'degraded', mcp_operational_state: 'degraded', mcp_startup_failure_count: 1, mcp_runtime_fault_count: 0 };
  const sessionStarted = { event: 'session_started', agent_id: 'resident', session_id: 'carrier_test' };
  const assistant = { event: 'assistant_message', content: 'hello' };
  const toolCall = { event: 'tool_call', tool_name: 'narada-site.whoami' };
  const toolResult = { event: 'tool_result', tool_name: 'narada-site.whoami', status: 'ok' };
  const mcpRuntimeFault = { event: 'mcp_runtime_fault', server_name: 'narada-site', tool_name: 'fixture_fail', error_code: 'fixture_mcp_forced_failure' };
  const turnComplete = { event: 'turn_complete', terminal_state: 'completed' };

  assert.equal(shouldProjectNarsClientEvent(assistant, { verbosity: 'conversation' }), true);
  assert.equal(shouldProjectNarsClientEvent(sessionStarted, { verbosity: 'conversation' }), false);
  assert.equal(shouldProjectNarsClientEvent(sessionStarted, { verbosity: 'operations' }), true);
  assert.equal(shouldProjectNarsClientEvent(toolCall, { verbosity: 'conversation' }), false);
  assert.equal(shouldProjectNarsClientEvent(toolResult, { verbosity: 'conversation' }), false);
  assert.equal(shouldProjectNarsClientEvent(toolCall, { verbosity: 'operations' }), true);
  assert.equal(shouldProjectNarsClientEvent(toolResult, { verbosity: 'operations' }), true);
  assert.equal(shouldProjectNarsClientEvent(assistant, { verbosity: 'diagnostics' }), false);
  assert.equal(shouldProjectNarsClientEvent(toolCall, { verbosity: 'diagnostics' }), false);
  assert.equal(shouldProjectNarsClientEvent(toolResult, { verbosity: 'diagnostics' }), false);
  assert.equal(shouldProjectNarsClientEvent(mcpRuntimeFault, { verbosity: 'conversation' }), false);
  assert.equal(shouldProjectNarsClientEvent(mcpRuntimeFault, { verbosity: 'operations' }), false);
  assert.equal(shouldProjectNarsClientEvent(mcpRuntimeFault, { verbosity: 'diagnostics' }), true);
  assert.equal(shouldProjectNarsClientEvent(turnComplete, { verbosity: 'conversation' }), false);
  assert.equal(shouldProjectNarsClientEvent(turnComplete, { verbosity: 'operations' }), false);
  assert.equal(shouldProjectNarsClientEvent(turnComplete, { verbosity: 'diagnostics' }), true);

  assert.equal(shouldProjectNarsClientEvent(routineHealth, { verbosity: 'operations' }), false);
  assert.equal(shouldProjectNarsClientEvent(routineHealth, { verbosity: 'diagnostics' }), false);
  assert.equal(shouldProjectNarsClientEvent(routineHealth, { verbosity: 'raw' }), false);
  assert.equal(shouldProjectNarsClientEvent(routineHealth, { verbosity: 'raw', includeStateSamples: true }), true);
  assert.equal(shouldProjectNarsClientEvent(unhealthy, { verbosity: 'operations' }), true);
  assert.equal(shouldProjectNarsClientEvent(unhealthy, { verbosity: 'diagnostics' }), true);
  assert.equal(shouldProjectNarsClientEvent({ event: 'authority_target_active' }, { verbosity: 'operations' }), true);
  assert.equal(shouldProjectNarsClientEvent({ event: 'authority_source_write_refused' }, { verbosity: 'conversation' }), false);

  assert.equal(shouldProjectNarsClientEvent({ event: 'websocket_connected' }, { verbosity: 'operations' }), false);
  assert.equal(shouldProjectNarsClientEvent({ event: 'websocket_connected' }, { verbosity: 'diagnostics' }), false);
  assert.equal(shouldProjectNarsClientEvent({ event: 'websocket_connected' }, { verbosity: 'raw', includeStateSamples: true }), true);
  assert.equal(shouldProjectNarsClientEvent({ event: 'unclassified_future_event' }, { verbosity: 'diagnostics' }), false);
  assert.equal(shouldProjectNarsClientEvent({ event: 'unclassified_future_event' }, { verbosity: 'raw' }), true);
});

test('NARS client projection contract classifies nested provider events without treating provider text as conversation', () => {
  const providerAgent = {
    event_sequence: 2,
    agent_id: 'resident',
    session_id: 'carrier_test',
    event: { type: 'item.completed', item: { id: 'provider_intro', type: 'agent_message', text: 'I am checking context first.' } },
  };
  const projectedAgent = projectNarsClientEvent(providerAgent);
  assert.equal(projectedAgent.kind, 'provider_agent_message');
  assert.equal(projectedAgent.class, 'diagnostics');
  assert.equal(projectedAgent.label, 'Provider message');
  assert.equal(projectedAgent.tone, 'assistant');
  assert.equal(projectedAgent.summary, 'I am checking context first.');
  assert.equal(projectedAgent.renderKey, 'provider-agent-message:provider-item:resident:carrier_test:provider_intro');
  assert.equal(classifyNarsClientEventProjection(projectedAgent), 'diagnostics');
  assert.equal(shouldProjectNarsClientProjection(projectedAgent, { verbosity: 'conversation' }), false);
  assert.equal(shouldProjectNarsClientProjection(projectedAgent, { verbosity: 'operations' }), false);
  assert.equal(shouldProjectNarsClientProjection(projectedAgent, { verbosity: 'diagnostics' }), true);

  const providerTool = projectNarsClientEvent({
    event_sequence: 3,
    agent_id: 'resident',
    session_id: 'carrier_test',
    event: { type: 'item.completed', item: { id: 'tool_1', type: 'mcp_tool_call', server: 'narada-sonar-agent-context', tool: 'agent_context_startup_sequence', status: 'completed' } },
  });
  assert.equal(providerTool.kind, 'tool_result');
  assert.equal(providerTool.class, 'operations');
  assert.equal(providerTool.summary, 'narada-sonar-agent-context.agent_context_startup_sequence complete');
  assert.equal(shouldProjectNarsClientProjection(providerTool, { verbosity: 'conversation' }), false);
  assert.equal(shouldProjectNarsClientProjection(providerTool, { verbosity: 'operations' }), true);

  const providerTurn = projectNarsClientEvent({ event: { type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 2 } } });
  assert.equal(providerTurn.kind, 'provider_turn_completed');
  assert.equal(providerTurn.class, 'diagnostics');
  assert.equal(providerTurn.summary, 'input 10 · output 2');
});

test('NARS client projection contract keeps lifecycle assistant messages as the canonical conversation row', () => {
  const lifecycleAssistant = projectNarsClientEvent({
    event: 'assistant_message',
    lifecycle_event: 'assistant_message',
    turn_id: 'turn_startup',
    request_id: 'input_startup',
    content: 'Startup sequence completed.',
    agent_id: 'resident',
    session_id: 'carrier_test',
  });
  assert.equal(lifecycleAssistant.kind, 'assistant_message');
  assert.equal(classifyNarsClientEventProjection(lifecycleAssistant), 'conversation');
  assert.equal(shouldProjectNarsClientProjection(lifecycleAssistant, { verbosity: 'conversation' }), true);
});
