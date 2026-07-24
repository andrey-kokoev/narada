import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENT_WEB_UI_COMMANDS,
  AGENT_WEB_UI_CLOUDFLARE_METHOD_LIST,
  AGENT_WEB_UI_NARS_METHOD_LIST,
  AGENT_WEB_UI_SNIPPET_ACTIONS,
  AGENT_WEB_UI_SNIPPET_USAGE,
  NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY,
  NARS_CLIENT_PROJECTION_REGISTRY,
  NARS_CLIENT_CONFORMANCE_FIXTURES,
  NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS,
  NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD,
  NARS_AFFORDANCE_ACTION_EVENTS,
  NARS_AFFORDANCE_ACTION_POSTURES,
  NARS_AFFORDANCE_ACTION_REFUSAL_CODES,
  NARS_AFFORDANCE_ACTION_CANCEL_METHOD,
  NARS_AFFORDANCE_ACTION_CONFIRM_METHOD,
  NARS_AFFORDANCE_ACTION_REQUEST_METHOD,
  NARS_COMMAND_METHOD,
  buildAgentWebUiAffordanceActionCancelFrame,
  buildAgentWebUiAffordanceActionConfirmFrame,
  buildAgentWebUiAffordanceActionRequestFrame,
  buildAgentWebUiArtifactsSummaryFrame,
  buildAgentWebUiConversationEnqueueFrame,
  buildAgentWebUiConversationSendFrame,
  buildAgentWebUiConversationSteerFrame,
  buildAgentWebUiDelegationSummaryFrame,
  buildAgentWebUiEventsReadFrame,
  buildAgentWebUiGitSummaryFrame,
  buildAgentWebUiHelpText,
  buildAgentWebUiInboxSummaryFrame,
  buildAgentWebUiIntelligenceReconfigureFrame,
  buildAgentWebUiMailboxSummaryFrame,
  buildAgentWebUiOperatorInputAction,
  buildAgentWebUiSchedulerSummaryFrame,
  buildAgentWebUiSopSummaryFrame,
  buildAgentWebUiSurfaceAffordancesFrame,
  buildAgentWebUiSurfaceFeedbackSummaryFrame,
  buildAgentWebUiTaskLifecycleSummaryFrame,
  buildAgentWebUiSubscribeFrame,
  buildNarsAttachCommands,
  buildNarsIntentRefPart,
  buildNarsAffordanceActionConfirmationRequiredEvent,
  buildNarsAffordanceActionConfirmedEvent,
  buildNarsAffordanceActionCancelledEvent,
  buildNarsAffordanceActionFailureEvent,
  buildNarsAffordanceActionRefusalEvent,
  buildNarsAffordanceActionRequestedEvent,
  buildNarsAffordanceActionResultEvent,
  classifyNarsClientEventProjection,
  filterAgentWebUiCommands,
  filterAgentWebUiSnippetActions,
  findAgentWebUiCommand,
  findAgentWebUiSnippetAction,
  isAgentWebUiNarsMethod,
  isAgentWebUiCloudflareProtocolFrame,
  isAgentWebUiProtocolFrame,
  isNarsSessionCoreMethod,
  isNarsSessionCoreProtocolFrame,
  translateAgentWebUiFrameForCloudflare,
  isAgentWebUiSnippetManagementAction,
  isAgentWebUiSnippetSelectionAction,
  parseAgentWebUiSnippetCommand,
  projectNarsClientEvent,
  shouldProjectNarsClientEvent,
  shouldProjectNarsClientProjection,
} from './nars-client-projection-contract.mjs';

test('NARS client projection contract owns attach commands and web UI capabilities', () => {
  assert.equal(NARS_COMMAND_METHOD, 'session.command.execute');
  assert.deepEqual(AGENT_WEB_UI_NARS_METHOD_LIST, [
    'session.events.subscribe',
    'session.events.read',
    'session.submit',
    'session.command.execute',
    'session.health',
    'session.recovery',
    'session.cancel',
    'session.close',
    'runtime.intelligence.reconfigure',
  ]);
  assert.equal(AGENT_WEB_UI_CLOUDFLARE_METHOD_LIST.includes('conversation.send'), true);
  assert.equal(AGENT_WEB_UI_CLOUDFLARE_METHOD_LIST.includes('session.surface.affordances'), true);
  assert.equal(AGENT_WEB_UI_CLOUDFLARE_METHOD_LIST.includes('runtime.intelligence.reconfigure'), false);
  assert.equal(AGENT_WEB_UI_NARS_METHOD_LIST.includes(NARS_AFFORDANCE_ACTION_REQUEST_METHOD), false);
  assert.equal(AGENT_WEB_UI_NARS_METHOD_LIST.includes('session.sop.summary'), false);
  assert.equal(AGENT_WEB_UI_NARS_METHOD_LIST.includes('conversation.steer'), false);
  assert.equal(AGENT_WEB_UI_NARS_METHOD_LIST.includes(NARS_COMMAND_METHOD), true);
  assert.equal(AGENT_WEB_UI_NARS_METHOD_LIST.includes('command.execute'), false);
  assert.equal(AGENT_WEB_UI_NARS_METHOD_LIST.includes('carrier.command.execute'), false);
  assert.equal(NARS_CLIENT_PROJECTION_REGISTRY.clients.agent_web_ui.admitted_methods, AGENT_WEB_UI_NARS_METHOD_LIST);
  assert.equal(NARS_CLIENT_PROJECTION_REGISTRY.clients.agent_pi_tui.admitted_methods, AGENT_WEB_UI_NARS_METHOD_LIST);
  assert.equal(NARS_CLIENT_PROJECTION_REGISTRY.clients.agent_web_ui.adapter_methods, AGENT_WEB_UI_CLOUDFLARE_METHOD_LIST);
  assert.equal(NARS_CLIENT_PROJECTION_REGISTRY.clients.agent_tui.attach_template, 'agent-tui --attach <event_endpoint>');
  assert.deepEqual(buildNarsAttachCommands({ eventEndpoint: 'ws://127.0.0.1/events', healthEndpoint: 'http://127.0.0.1/health' }), {
    registry_schema: 'narada.nars.client_projection_registry.v1',
    agent_cli: 'narada-agent-cli --attach ws://127.0.0.1/events',
    agent_tui: 'agent-tui --attach ws://127.0.0.1/events',
    agent_pi_tui: 'narada-agent-pi-tui --attach ws://127.0.0.1/events',
    agent_web_ui: 'narada-agent-web-ui --event-endpoint ws://127.0.0.1/events --health-endpoint http://127.0.0.1/health',
    protocol: '{"id":"events-1","method":"session.events.subscribe","params":{"include_replay":true,"page_size":20}}',
    operator_input_protocol: '{"id":"input-1","method":"session.submit","params":{"content":"<operator message>","source":"manual_operator"}}',
    queued_operator_input_protocol: '{"id":"input-2","method":"session.submit","params":{"content":"<operator message>","source":"operator_steering","delivery_mode":"admit_after_active_turn"}}',
    slash_command_protocol: '{"id":"command-1","method":"session.command.execute","params":{"command":"/status","value":""}}',
  });
  assert.equal(NARS_CLIENT_PROJECTION_REGISTRY.default_verbosity, 'conversation');
  assert.equal(NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY, 'conversation');
  assert.deepEqual(NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS, ['conversation', 'operations', 'diagnostics', 'raw']);
});

test('NARS client conformance fixtures remain representation-neutral and complete', () => {
  assert.equal(NARS_CLIENT_CONFORMANCE_FIXTURES.schema, 'narada.nars.client_conformance_fixtures.v1');
  assert.ok(NARS_CLIENT_CONFORMANCE_FIXTURES.scenarios.includes('replay_live_overlap'));
  assert.ok(NARS_CLIENT_CONFORMANCE_FIXTURES.scenarios.includes('operator_controlled_scroll'));
  assert.equal(NARS_CLIENT_CONFORMANCE_FIXTURES.canonical_events[0].event, 'session_started');
  assert.equal(NARS_CLIENT_CONFORMANCE_FIXTURES.canonical_events.at(-1).event, 'session_closed');
  assert.equal(NARS_CLIENT_CONFORMANCE_FIXTURES.protocol_frames.ordinary_input.method, 'session.submit');
  assert.equal(NARS_CLIENT_CONFORMANCE_FIXTURES.protocol_frames.intelligence_reconfigure.method, NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD);
});

test('NARS client projection contract builds the direct runtime intelligence control frame', () => {
  const frame = buildAgentWebUiIntelligenceReconfigureFrame({ model: 'next-model' }, { id: 'ui-reconfigure-1' });
  assert.equal(isAgentWebUiNarsMethod(frame?.method), true);
  assert.equal(isAgentWebUiCloudflareProtocolFrame(frame), false);
  assert.deepEqual(frame, {
    id: 'ui-reconfigure-1',
    method: 'runtime.intelligence.reconfigure',
    params: { request_id: 'ui-reconfigure-1', model: 'next-model' },
  });
});

test('NARS client projection contract owns canonical intent references', () => {
  assert.deepEqual(buildNarsIntentRefPart({
    intent: 'entity_number:dismiss',
    label: 'Dismiss',
    description: 'Dismiss the selected entity number row.',
    target: 'entity_number',
    action: 'dismiss',
    args: { entity_number: 4 },
  }), {
    type: 'intent_ref',
    intent: 'entity_number:dismiss',
    label: 'Dismiss',
    description: 'Dismiss the selected entity number row.',
    target: 'entity_number',
    action: 'dismiss',
    args: { entity_number: 4 },
  });
  assert.deepEqual(buildNarsIntentRefPart({ intentRef: 'queue:publish', label: 'Publish' }), {
    type: 'intent_ref',
    intent: 'queue:publish',
    label: 'Publish',
  });
  assert.equal(buildNarsIntentRefPart({}), null);
});

test('NARS client projection contract owns affordance action request and event vocabulary', () => {
  assert.equal(NARS_AFFORDANCE_ACTION_REQUEST_METHOD, 'session.affordance.action.request');
  assert.equal(NARS_AFFORDANCE_ACTION_CONFIRM_METHOD, 'session.affordance.action.confirm');
  assert.equal(NARS_AFFORDANCE_ACTION_CANCEL_METHOD, 'session.affordance.action.cancel');
  assert.deepEqual(NARS_AFFORDANCE_ACTION_EVENTS, {
    requested: 'session_affordance_action_requested',
    result: 'session_affordance_action_result',
    refused: 'session_affordance_action_refused',
    confirmationRequired: 'session_affordance_confirmation_required',
    confirmed: 'session_affordance_action_confirmed',
    cancelled: 'session_affordance_action_cancelled',
  });
  assert.equal(NARS_AFFORDANCE_ACTION_POSTURES.readOnlyOrIdempotent, 'read_only_or_idempotent');
  assert.equal(NARS_AFFORDANCE_ACTION_REFUSAL_CODES.confirmationRequired, 'affordance_action_confirmation_required');
  assert.equal(NARS_AFFORDANCE_ACTION_REFUSAL_CODES.notReadOnly, 'affordance_action_not_read_only');

  assert.deepEqual(buildAgentWebUiAffordanceActionRequestFrame({
    surfaceId: 'fixture.surface',
    actionId: 'refresh',
    args: { topic: 'status' },
    clientCorrelationId: 'ui-1',
  }, { id: 'action-1' }), {
    id: 'action-1',
    method: NARS_AFFORDANCE_ACTION_REQUEST_METHOD,
    params: {
      surface_id: 'fixture.surface',
      action_id: 'refresh',
      args: { topic: 'status' },
      client_correlation_id: 'ui-1',
    },
  });
  assert.deepEqual(buildAgentWebUiAffordanceActionConfirmFrame({ confirmationId: 'confirm-1' }, { id: 'confirm-frame-1' }), {
    id: 'confirm-frame-1',
    method: NARS_AFFORDANCE_ACTION_CONFIRM_METHOD,
    params: { confirmation_id: 'confirm-1' },
  });
  assert.deepEqual(buildAgentWebUiAffordanceActionCancelFrame({ confirmationId: 'confirm-1', reason: 'operator_declined' }, { id: 'cancel-frame-1' }), {
    id: 'cancel-frame-1',
    method: NARS_AFFORDANCE_ACTION_CANCEL_METHOD,
    params: { confirmation_id: 'confirm-1', reason: 'operator_declined' },
  });

  assert.deepEqual(buildNarsAffordanceActionRequestedEvent({
    requestId: 'req-1',
    surfaceId: 'fixture.surface',
    actionId: 'refresh',
    clientCorrelationId: 'ui-1',
  }), {
    schema: 'narada.nars.affordance_action_request.v1',
    event: NARS_AFFORDANCE_ACTION_EVENTS.requested,
    request_id: 'req-1',
    transport: 'jsonl_stdio',
    surface_id: 'fixture.surface',
    action_id: 'refresh',
    client_correlation_id: 'ui-1',
  });

  assert.deepEqual(buildNarsAffordanceActionResultEvent({
    requestId: 'req-1',
    surfaceId: 'fixture.surface',
    actionId: 'refresh',
    serverName: 'fixture-server',
    toolName: 'fixture_read',
    clientCorrelationId: 'ui-1',
    result: { ok: true },
  }), {
    schema: 'narada.nars.affordance_action_result.v1',
    event: NARS_AFFORDANCE_ACTION_EVENTS.result,
    request_id: 'req-1',
    transport: 'jsonl_stdio',
    terminal_state: 'completed',
    status: 'ok',
    surface_id: 'fixture.surface',
    action_id: 'refresh',
    server_name: 'fixture-server',
    tool_name: 'fixture_read',
    client_correlation_id: 'ui-1',
    result: { ok: true },
  });

  assert.deepEqual(buildNarsAffordanceActionFailureEvent({
    requestId: 'req-1',
    surfaceId: 'fixture.surface',
    actionId: 'refresh',
    serverName: 'fixture-server',
    toolName: 'fixture_read',
    error: new Error('boom'),
  }), {
    schema: 'narada.nars.affordance_action_result.v1',
    event: NARS_AFFORDANCE_ACTION_EVENTS.result,
    request_id: 'req-1',
    transport: 'jsonl_stdio',
    terminal_state: 'failed',
    status: 'error',
    surface_id: 'fixture.surface',
    action_id: 'refresh',
    server_name: 'fixture-server',
    tool_name: 'fixture_read',
    client_correlation_id: null,
    error: 'boom',
  });

  assert.equal(buildNarsAffordanceActionRefusalEvent({
    requestId: 'req-1',
    surfaceId: 'fixture.surface',
    actionId: 'mutate',
    code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.notReadOnly,
    message: 'blocked',
    posture: NARS_AFFORDANCE_ACTION_POSTURES.unsafe,
  }).event, NARS_AFFORDANCE_ACTION_EVENTS.refused);

  assert.deepEqual(buildNarsAffordanceActionConfirmationRequiredEvent({
    requestId: 'req-1',
    surfaceId: 'fixture.surface',
    actionId: 'mutate',
    code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.confirmationRequired,
    message: 'confirm',
    posture: NARS_AFFORDANCE_ACTION_POSTURES.confirmationRequired,
    confirmationId: 'confirm-1',
  }), {
    schema: 'narada.nars.affordance_action_confirmation_required.v1',
    event: NARS_AFFORDANCE_ACTION_EVENTS.confirmationRequired,
    request_id: 'req-1',
    transport: 'jsonl_stdio',
    terminal_state: 'awaiting_confirmation',
    status: 'confirmation_required',
    surface_id: 'fixture.surface',
    action_id: 'mutate',
    server_name: null,
    tool_name: null,
    client_correlation_id: null,
    code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.confirmationRequired,
    message: 'confirm',
    posture: NARS_AFFORDANCE_ACTION_POSTURES.confirmationRequired,
    confirmation_id: 'confirm-1',
    expires_at: null,
  });

  assert.deepEqual(buildNarsAffordanceActionConfirmedEvent({
    requestId: 'req-2',
    confirmationId: 'confirm-1',
    surfaceId: 'fixture.surface',
    actionId: 'mutate',
  }), {
    schema: 'narada.nars.affordance_action_confirmed.v1',
    event: NARS_AFFORDANCE_ACTION_EVENTS.confirmed,
    request_id: 'req-2',
    transport: 'jsonl_stdio',
    terminal_state: 'confirmed',
    status: 'confirmed',
    confirmation_id: 'confirm-1',
    surface_id: 'fixture.surface',
    action_id: 'mutate',
  });

  assert.deepEqual(buildNarsAffordanceActionCancelledEvent({
    requestId: 'req-3',
    confirmationId: 'confirm-1',
    surfaceId: 'fixture.surface',
    actionId: 'mutate',
    reason: 'operator_cancelled',
  }), {
    schema: 'narada.nars.affordance_action_cancelled.v1',
    event: NARS_AFFORDANCE_ACTION_EVENTS.cancelled,
    request_id: 'req-3',
    transport: 'jsonl_stdio',
    terminal_state: 'cancelled',
    status: 'cancelled',
    confirmation_id: 'confirm-1',
    surface_id: 'fixture.surface',
    action_id: 'mutate',
    reason: 'operator_cancelled',
  });
});

test('NARS client projection contract owns web UI operator input projection', () => {
  assert.deepEqual(buildAgentWebUiSubscribeFrame({ id: 'events-1', maxReplay: 20, includeReplay: true }), {
    id: 'events-1',
    method: 'session.events.subscribe',
    params: { include_replay: true, page_size: 20 },
  });
  assert.deepEqual(buildAgentWebUiEventsReadFrame({ id: 'events-read-1', beforeSequence: 50, direction: 'backward', limit: 25 }), {
    id: 'events-read-1',
    method: 'session.events.read',
    params: { limit: 25, before_sequence: 50, direction: 'backward' },
  });
  assert.deepEqual(buildAgentWebUiSubscribeFrame({ id: 'conversation-events-1', pageSize: 20, view: 'conversation' }).params, {
    include_replay: true,
    page_size: 20,
    view: 'conversation',
  });
  assert.deepEqual(buildAgentWebUiEventsReadFrame({ id: 'operations-events-1', limit: 25, view: 'operations' }).params, {
    limit: 25,
    view: 'operations',
  });
  assert.deepEqual(buildAgentWebUiSopSummaryFrame({ id: 'sop-1', templateLimit: 10, runLimit: 5, includeTerminal: false }), {
    id: 'sop-1',
    method: 'session.sop.summary',
    params: { template_limit: 10, run_limit: 5, include_terminal: false },
  });
  assert.deepEqual(buildAgentWebUiInboxSummaryFrame({ id: 'inbox-1', limit: 7, status: 'received', targetRole: 'architect' }), {
    id: 'inbox-1',
    method: 'session.inbox.summary',
    params: { limit: 7, status: 'received', target_role: 'architect' },
  });
  assert.deepEqual(buildAgentWebUiDelegationSummaryFrame({ id: 'delegation-1', workerLimit: 4, taskLimit: 6, includeTerminal: false }), {
    id: 'delegation-1',
    method: 'session.delegation.summary',
    params: { worker_limit: 4, task_limit: 6, include_terminal: false },
  });
  assert.deepEqual(buildAgentWebUiGitSummaryFrame({ id: 'git-1', changedLimit: 9, logLimit: 2 }), {
    id: 'git-1',
    method: 'session.git.summary',
    params: { changed_limit: 9, log_limit: 2 },
  });
  assert.deepEqual(buildAgentWebUiArtifactsSummaryFrame({ id: 'artifacts-1', limit: 5, offset: 2, kind: 'html' }), {
    id: 'artifacts-1',
    method: 'session.artifacts.summary',
    params: { limit: 5, offset: 2, kind: 'html' },
  });
  assert.deepEqual(buildAgentWebUiSurfaceFeedbackSummaryFrame({ id: 'feedback-1', limit: 7, status: 'submitted', kind: 'gap', surfaceId: 'scheduler' }), {
    id: 'feedback-1',
    method: 'session.surface_feedback.summary',
    params: { limit: 7, offset: 0, status: 'submitted', kind: 'gap', surface_id: 'scheduler' },
  });
  assert.deepEqual(buildAgentWebUiMailboxSummaryFrame({ id: 'mailbox-1', accountLimit: 3, messageLimit: 8, query: 'ops' }), {
    id: 'mailbox-1',
    method: 'session.mailbox.summary',
    params: { account_limit: 3, message_limit: 8, query: 'ops' },
  });
  assert.deepEqual(buildAgentWebUiSchedulerSummaryFrame({ id: 'scheduler-1', taskLimit: 4, historyLimit: 2, folder: '\\Narada' }), {
    id: 'scheduler-1',
    method: 'session.scheduler.summary',
    params: { task_limit: 4, history_limit: 2, folder: '\\Narada' },
  });
  assert.deepEqual(buildAgentWebUiTaskLifecycleSummaryFrame({ id: 'tasks-1', agentId: 'sonar.resident', limit: 5, includeObligations: false }), {
    id: 'tasks-1',
    method: 'session.task_lifecycle.summary',
    params: { agent_id: 'sonar.resident', limit: 5, include_obligations: false },
  });
  assert.deepEqual(buildAgentWebUiSurfaceAffordancesFrame({ id: 'affordances-1' }), {
    id: 'affordances-1',
    method: 'session.surface.affordances',
    params: {},
  });
  assert.deepEqual(buildAgentWebUiAffordanceActionRequestFrame({ surfaceId: 'fixture.surface', actionId: 'refresh', args: { topic: 'status' }, clientCorrelationId: 'ui-1' }, { id: 'affordance-action-1' }), {
    id: 'affordance-action-1',
    method: 'session.affordance.action.request',
    params: { surface_id: 'fixture.surface', action_id: 'refresh', args: { topic: 'status' }, client_correlation_id: 'ui-1' },
  });
  assert.equal(buildAgentWebUiAffordanceActionRequestFrame({ surfaceId: '', actionId: 'refresh' }), null);
  assert.deepEqual(buildAgentWebUiConversationSendFrame('run startup sequence', { id: 'input-1' }), {
    id: 'input-1',
    method: 'session.submit',
    params: { content: 'run startup sequence', source: 'manual_operator' },
  });
  assert.equal(buildAgentWebUiConversationSendFrame('   '), null);
  assert.deepEqual(buildAgentWebUiConversationSteerFrame('change course', { id: 'steer-1', activeTurnId: 'turn_1' }), {
    id: 'steer-1',
    method: 'session.submit',
    params: { content: 'change course', source: 'operator_steering', delivery_mode: 'admit_after_active_turn', active_turn_id: 'turn_1' },
  });
  assert.deepEqual(buildAgentWebUiConversationEnqueueFrame('run after this', { id: 'enqueue-1', activeTurnId: 'turn_2' }), {
    id: 'enqueue-1',
    method: 'session.submit',
    params: { content: 'run after this', source: 'operator_steering', delivery_mode: 'admit_after_active_turn', active_turn_id: 'turn_2' },
  });
  assert.deepEqual(buildAgentWebUiOperatorInputAction('change course', { id: 'steer-2', activeTurn: true, activeTurnId: 'turn_2' }).frame, {
    id: 'steer-2',
    method: 'session.submit',
    params: { content: 'change course', source: 'operator_steering', delivery_mode: 'admit_after_active_turn', active_turn_id: 'turn_2' },
  });
  assert.deepEqual(buildAgentWebUiOperatorInputAction('run after this', { id: 'enqueue-2', activeTurn: true, activeTurnId: 'turn_2', deliveryMode: 'enqueue' }).frame, {
    id: 'enqueue-2',
    method: 'session.submit',
    params: { content: 'run after this', source: 'operator_steering', delivery_mode: 'admit_after_active_turn', active_turn_id: 'turn_2' },
  });
  assert.equal(buildAgentWebUiOperatorInputAction('/help').kind, 'local_help');
  assert.equal(buildAgentWebUiOperatorInputAction('/clear').kind, 'local_clear');
  assert.equal(buildAgentWebUiOperatorInputAction('/status', { id: 'status-1' }).frame.method, 'session.health');
  assert.equal(buildAgentWebUiOperatorInputAction('/health', { id: 'health-1' }).frame.method, 'session.health');
  assert.equal(buildAgentWebUiOperatorInputAction('/events', { id: 'events-2' }).frame.method, 'session.events.subscribe');
  assert.equal(buildAgentWebUiOperatorInputAction('/recovery', { id: 'recovery-1' }).frame.method, 'session.recovery');
  assert.equal(buildAgentWebUiOperatorInputAction('/ops', { id: 'ops-1' }).frame.method, 'session.operations');
  assert.equal(buildAgentWebUiOperatorInputAction('/interrupt', { id: 'interrupt-1' }).frame.method, 'session.cancel');
  assert.equal(buildAgentWebUiOperatorInputAction('/tools mcp', { id: 'tools-1' }).frame.method, 'session.command.execute');
  assert.equal(buildAgentWebUiOperatorInputAction('/tool', { id: 'tool-1' }).frame.method, 'session.command.execute');
  assert.equal(buildAgentWebUiOperatorInputAction('/tool-outputs', { id: 'tool-output-1' }).frame.method, 'session.command.execute');
  assert.equal(buildAgentWebUiOperatorInputAction('/queue clear', { id: 'queue-1' }).frame.params.command, '/queue');
  assert.deepEqual(buildAgentWebUiOperatorInputAction('/observer mute', { id: 'mute-1' }).frame, { id: 'mute-1', method: 'observer.mute', params: {} });
  assert.equal(buildAgentWebUiOperatorInputAction('/observer').message, 'Usage: /observer mute|unmute');
  assert.equal(buildAgentWebUiOperatorInputAction('/snippet save launch run startup sequence').kind, 'snippet_command');
  assert.equal(buildAgentWebUiOperatorInputAction('/snippets launch').kind, 'snippet_panel_command');
  assert.equal(buildAgentWebUiOperatorInputAction('/quit', { id: 'quit-1' }).frame.method, 'session.close');
  assert.equal(buildAgentWebUiOperatorInputAction('/exit', { id: 'exit-1' }).frame.method, 'session.close');
  assert.equal(buildAgentWebUiOperatorInputAction('exit', { id: 'exit-2' }).frame.method, 'session.close');
  assert.equal(buildAgentWebUiOperatorInputAction('/snippety').message, 'Unknown command: /snippety. Type /help.');
  assert.equal(isAgentWebUiNarsMethod('session.command.execute'), true);
  assert.equal(isAgentWebUiNarsMethod('carrier.command.execute'), false);
  assert.equal(isAgentWebUiNarsMethod('command.execute'), false);
  assert.equal(isAgentWebUiProtocolFrame({ id: 'ok', method: 'conversation.send', params: {} }), true);
  assert.equal(isAgentWebUiProtocolFrame({ id: 'read', method: 'session.events.read', params: {} }), true);
  assert.equal(isAgentWebUiProtocolFrame({ id: 'blocked', method: 'session.sync', params: {} }), false);
  assert.equal(isNarsSessionCoreMethod('session.submit'), true);
  assert.equal(isNarsSessionCoreMethod('conversation.send'), false);
  assert.equal(isNarsSessionCoreProtocolFrame({ id: 'local', method: 'session.submit', params: {} }), true);
  assert.equal(isNarsSessionCoreProtocolFrame({ id: 'legacy', method: 'conversation.send', params: {} }), false);
  assert.equal(isAgentWebUiCloudflareProtocolFrame({ id: 'adapter', method: 'conversation.send', params: {} }), true);
  assert.deepEqual(translateAgentWebUiFrameForCloudflare({
    id: 'input-1',
    method: 'session.submit',
    params: { content: 'run after this', source: 'operator_steering', delivery_mode: 'admit_after_active_turn', active_turn_id: 'turn-1' },
  }), {
    id: 'input-1',
    method: 'conversation.enqueue',
    params: { message: 'run after this', source: 'operator_steering', active_turn_id: 'turn-1' },
  });
  assert.deepEqual(translateAgentWebUiFrameForCloudflare({ id: 'health-1', method: 'session.health', params: {} }), {
    id: 'health-1',
    method: 'session.health',
    params: {},
  });
  assert.equal(translateAgentWebUiFrameForCloudflare({ id: 'bad', method: 'session.sync', params: {} }), null);
});

test('Agent Web UI commands are first-class static registry entries', () => {
  const slashes = AGENT_WEB_UI_COMMANDS.map((command) => command.slash);
  assert.equal(slashes.includes('/help'), true);
  assert.equal(filterAgentWebUiCommands('stat')[0].slash, '/status');
  assert.equal(filterAgentWebUiCommands('snippet').some((command) => command.slash === '/snippets'), true);
  assert.equal(filterAgentWebUiCommands('snippets')[0].slash, '/snippets');
  assert.equal(filterAgentWebUiCommands('mute').some((command) => command.slash === '/observer'), true);
  assert.equal(findAgentWebUiCommand('/quit').id, 'exit');
  assert.equal(findAgentWebUiCommand('/tool').id, 'tools');
  assert.equal(findAgentWebUiCommand('/queue').id, 'queue');
  assert.equal(findAgentWebUiCommand('/missing'), null);
  assert.equal(filterAgentWebUiCommands('stat')[0].slash, '/status');
  assert.equal(filterAgentWebUiCommands('mute').some((command) => command.slash === '/observer'), true);
  assert.match(buildAgentWebUiHelpText(), /Conversation control/);
  assert.match(buildAgentWebUiHelpText(), /\/observer mute\|unmute/);
  assert.equal(buildAgentWebUiOperatorInputAction('/json').message, 'Usage: /json <protocol frame JSON>');
  assert.equal(buildAgentWebUiOperatorInputAction('/json {"id":"status-raw","method":"session.health","params":{}}').frame.method, 'session.health');
  assert.equal(buildAgentWebUiOperatorInputAction('/json {"id":"legacy","method":"session.status","params":{}}').message, 'JSON frame method is not admitted by the local session-core contract.');
  const localCommands = filterAgentWebUiCommands('', { supportsProtocolMethod: isNarsSessionCoreMethod });
  assert.equal(localCommands.some((command) => command.slash === '/status'), true);
  assert.equal(localCommands.some((command) => command.slash === '/ops'), false);
  assert.equal(localCommands.some((command) => command.slash === '/queue'), true);
  assert.doesNotMatch(buildAgentWebUiHelpText({ supportsProtocolMethod: isNarsSessionCoreMethod }), /\/ops|\/observer/);
  assert.equal(buildAgentWebUiOperatorInputAction('/json {"id":"bad","method":"bad.method","params":{}}').message, 'JSON frame method is not admitted by the local session-core contract.');
  assert.equal(buildAgentWebUiOperatorInputAction('/does-not-exist').message, 'Unknown command: /does-not-exist. Type /help.');
});

test('Agent Web UI snippet command grammar is shared and canonical', () => {
  assert.equal(AGENT_WEB_UI_SNIPPET_USAGE, '/snippet run|enqueue|search|save|edit|delete');
  assert.equal(AGENT_WEB_UI_SNIPPET_ACTIONS.some((action) => action.id === 'run' && action.verbs.includes('send')), false);
  assert.equal(AGENT_WEB_UI_SNIPPET_ACTIONS.some((action) => action.id === 'delete' && action.verbs.includes('remove')), false);
  assert.equal(findAgentWebUiSnippetAction('search').id, 'search');
  assert.equal(findAgentWebUiSnippetAction('search').slash, '/snippet search');
  assert.equal(findAgentWebUiSnippetAction('search').completion, '/snippet search ');
  assert.equal(findAgentWebUiSnippetAction(''), null);
  assert.equal(findAgentWebUiSnippetAction('send'), null);
  assert.equal(findAgentWebUiSnippetAction('remove'), null);
  assert.equal(findAgentWebUiSnippetAction('missing'), null);
  assert.equal(filterAgentWebUiSnippetActions('que')[0].id, 'enqueue');
  assert.deepEqual(parseAgentWebUiSnippetCommand('enqueue launch now'), {
    action: findAgentWebUiSnippetAction('enqueue'),
    verb: 'enqueue',
    rawVerb: 'enqueue',
    remainder: 'launch now',
    recognized: true,
  });
  assert.deepEqual(parseAgentWebUiSnippetCommand(''), {
    action: null,
    verb: '',
    rawVerb: '',
    remainder: '',
    recognized: false,
  });
  assert.equal(isAgentWebUiSnippetSelectionAction('send'), false);
  assert.equal(isAgentWebUiSnippetSelectionAction('search'), false);
  assert.equal(isAgentWebUiSnippetManagementAction('search'), false);
  assert.equal(isAgentWebUiSnippetManagementAction('run'), false);
});

test('NARS client projection contract owns shared event rendering vocabulary', () => {
  assert.deepEqual(projectNarsClientEvent({ event: 'session_event', payload: { event: 'assistant_message', content: 'hello' } }), {
    kind: 'assistant_message',
    label: 'Agent',
    tone: 'assistant',
    summary: 'hello',
    event: { event: 'assistant_message', content: 'hello' },
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'session_events_replay_completed', replay_count: 0, has_more: false }), {
    kind: 'session_events_replay_completed',
    label: 'Replay complete',
    tone: 'session',
    summary: '0 replayed event(s); replay complete',
    event: { event: 'session_events_replay_completed', replay_count: 0, has_more: false },
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'assistant_message_stream', request_id: 'input_1', turn_id: 'turn_1', content: 'partial' }), {
    kind: 'assistant_message_stream',
    label: 'Agent',
    tone: 'assistant',
    summary: 'partial',
    event: { event: 'assistant_message_stream', request_id: 'input_1', turn_id: 'turn_1', content: 'partial' },
    renderKey: 'assistant:input_1',
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'assistant_message', request_id: 'input_1', turn_id: 'turn_1', content: 'final' }), {
    kind: 'assistant_message',
    label: 'Agent',
    tone: 'assistant',
    summary: 'final',
    event: { event: 'assistant_message', request_id: 'input_1', turn_id: 'turn_1', content: 'final' },
    renderKey: 'assistant:input_1',
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'operator_input_submitted', request_id: 'input_1', content: 'run startup sequence' }), {
    kind: 'operator_input_submitted',
    label: 'Operator input',
    tone: 'local',
    summary: 'run startup sequence',
    event: { event: 'operator_input_submitted', request_id: 'input_1', content: 'run startup sequence' },
    renderKey: 'operator:input_1',
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'tool_result', request_id: 'input_1', tool_name: 'narada-site.whoami', status: 'ok' }), {
    kind: 'tool_result',
    label: 'Tool result',
    tone: 'tool',
    summary: 'narada-site.whoami ok',
    event: { event: 'tool_result', request_id: 'input_1', tool_name: 'narada-site.whoami', status: 'ok' },
    renderKey: 'tool:tool_result:input_1',
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'tool_result', request_id: 'input_2', tool: 'fixture_read', status: 'ok' }), {
    kind: 'tool_result',
    label: 'Tool result',
    tone: 'tool',
    summary: 'fixture_read ok',
    event: { event: 'tool_result', request_id: 'input_2', tool: 'fixture_read', status: 'ok' },
    renderKey: 'tool:tool_result:input_2',
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'tool_call', request_id: 'input_1', tool_name: 'narada-site.whoami' }), {
    kind: 'tool_call',
    label: 'Tool call',
    tone: 'tool',
    summary: 'narada-site.whoami',
    event: { event: 'tool_call', request_id: 'input_1', tool_name: 'narada-site.whoami' },
    renderKey: 'tool:tool_call:input_1',
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'turn_started', turn_id: 'turn_1' }), {
    kind: 'turn_started',
    label: 'Turn started',
    tone: 'session',
    summary: 'turn_1',
    event: { event: 'turn_started', turn_id: 'turn_1' },
    renderKey: 'turn:turn_1',
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'turn_failed', turn_id: 'turn_1', error: { message: 'provider schema rejected' } }), {
    kind: 'turn_failed',
    label: 'Turn failed',
    tone: 'error',
    summary: 'provider schema rejected',
    event: { event: 'turn_failed', turn_id: 'turn_1', error: { message: 'provider schema rejected' } },
    renderKey: 'turn:turn_1',
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'mcp_runtime_fault', server_name: 'narada-site', tool_name: 'fixture_fail', error_code: 'fixture_mcp_forced_failure' }), {
    kind: 'mcp_runtime_fault',
    label: 'MCP runtime fault',
    tone: 'error',
    summary: 'MCP runtime fault narada-site:fixture_fail fixture_mcp_forced_failure',
    event: { event: 'mcp_runtime_fault', server_name: 'narada-site', tool_name: 'fixture_fail', error_code: 'fixture_mcp_forced_failure' },
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'runtime_projection_failure', projection: 'health', request_state: 'timed_out', error: 'session_health_timeout' }), {
    kind: 'runtime_projection_failure',
    label: 'Runtime projection failure',
    tone: 'error',
    summary: 'health projection timed_out · session_health_timeout',
    event: { event: 'runtime_projection_failure', projection: 'health', request_state: 'timed_out', error: 'session_health_timeout' },
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'runtime_control_input_bridge_error', error_code: 'control_input_record_invalid', error: 'Unexpected token' }), {
    kind: 'runtime_control_input_bridge_error',
    label: 'Control-input bridge error',
    tone: 'error',
    summary: 'control input bridge control_input_record_invalid · Unexpected token',
    event: { event: 'runtime_control_input_bridge_error', error_code: 'control_input_record_invalid', error: 'Unexpected token' },
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'intelligence_runtime_reconfiguration_state_transition', request_id: 'switch-1', previous_state: 'validating', reconfiguration_state: 'admitted', target: { requestedModel: { kind: 'model', id: 'model:deepseek-chat' }, requestedOptions: { thinking: 'low' } } }), {
    kind: 'intelligence_runtime_reconfiguration_state_transition',
    label: 'Intelligence reconfiguration state',
    tone: 'status',
    summary: 'intelligence reconfiguration validating -> admitted · model:deepseek-chat · thinking=low',
    event: { event: 'intelligence_runtime_reconfiguration_state_transition', request_id: 'switch-1', previous_state: 'validating', reconfiguration_state: 'admitted', target: { requestedModel: { kind: 'model', id: 'model:deepseek-chat' }, requestedOptions: { thinking: 'low' } } },
  });
  assert.deepEqual(projectNarsClientEvent({ event: 'runtime_intelligence_reconfiguration', request_id: 'switch-1', reconfiguration_state: 'refused', terminal_state: 'refused', reason: 'runtime_not_at_clean_turn_boundary' }), {
    kind: 'runtime_intelligence_reconfiguration',
    label: 'Intelligence reconfiguration',
    tone: 'error',
    summary: 'intelligence reconfiguration refused',
    event: { event: 'runtime_intelligence_reconfiguration', request_id: 'switch-1', reconfiguration_state: 'refused', terminal_state: 'refused', reason: 'runtime_not_at_clean_turn_boundary' },
  });
  assert.equal(projectNarsClientEvent({ event: 'error', message: 'bad' }).tone, 'error');
  assert.equal(projectNarsClientEvent({ event: 'session_health', status: 'healthy', agent_id: 'narada.test', session_id: 'carrier_test' }).summary, 'healthy · narada.test · carrier_test');
  assert.equal(projectNarsClientEvent({
    event: 'session_health',
    status: 'healthy',
    agent_id: 'resident',
    agent_identity_ref: { schema: 'narada.agent_identity_ref.v1', site_id: 'sonar', local_agent_id: 'resident', canonical_agent_id: 'sonar.resident' },
    session_id: 'carrier_test',
  }).summary, 'healthy · sonar.resident · carrier_test');
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
  const sessionSync = { event: 'session_sync', success: true };
  const assistant = { event: 'assistant_message', content: 'hello' };
  const toolCall = { event: 'tool_call', tool_name: 'narada-site.whoami' };
  const toolResult = { event: 'tool_result', tool_name: 'narada-site.whoami', status: 'ok' };
  const inputAccepted = { event: 'session_control_accepted', request_id: 'input-1', method: 'session.submit', acceptance_state: 'accepted' };
  const inputResponse = { event: 'session_control_response', request_id: 'input-1', method: 'session.submit', terminal_state: 'completed' };
  const inputRejected = { event: 'session_control_rejected', request_id: 'input-1', method: 'session.submit', code: 'request_dispatch_failed', error: 'provider unavailable' };
  const requestTransition = { event: 'runtime_request_state_transition', request_id: 'input-1', request_state: 'completed', terminal_state: 'completed' };
  const mcpRuntimeFault = { event: 'mcp_runtime_fault', server_name: 'narada-site', tool_name: 'fixture_fail', error_code: 'fixture_mcp_forced_failure' };
  const projectionFailure = { event: 'runtime_projection_failure', projection: 'health', request_state: 'failed', error: 'session_health_timeout' };
  const turnComplete = { event: 'turn_complete', terminal_state: 'completed' };
  const replayCompleted = { event: 'session_events_replay_completed', replay_count: 0, has_more: false };

  assert.equal(shouldProjectNarsClientEvent(assistant, { verbosity: 'conversation' }), true);
  assert.equal(shouldProjectNarsClientEvent(sessionStarted, { verbosity: 'conversation' }), false);
  assert.equal(shouldProjectNarsClientEvent(sessionStarted, { verbosity: 'operations' }), true);
  assert.equal(classifyNarsClientEventProjection(projectNarsClientEvent(sessionSync)), 'operations');
  assert.equal(shouldProjectNarsClientEvent(sessionSync, { verbosity: 'operations' }), true);
  assert.equal(shouldProjectNarsClientEvent(toolCall, { verbosity: 'conversation' }), false);
  assert.equal(shouldProjectNarsClientEvent(toolResult, { verbosity: 'conversation' }), false);
  assert.equal(shouldProjectNarsClientEvent(toolCall, { verbosity: 'operations' }), true);
  assert.equal(shouldProjectNarsClientEvent(toolResult, { verbosity: 'operations' }), true);
  assert.equal(classifyNarsClientEventProjection(projectNarsClientEvent(inputAccepted)), 'operations');
  assert.equal(classifyNarsClientEventProjection(projectNarsClientEvent(inputResponse)), 'operations');
  assert.equal(classifyNarsClientEventProjection(projectNarsClientEvent(inputRejected)), 'operations');
  assert.equal(classifyNarsClientEventProjection(projectNarsClientEvent(requestTransition)), 'operations');
  assert.equal(projectNarsClientEvent(inputAccepted).summary, 'accepted');
  assert.equal(projectNarsClientEvent(inputResponse).summary, 'completed');
  assert.equal(projectNarsClientEvent(inputRejected).summary, 'provider unavailable');
  assert.equal(projectNarsClientEvent(requestTransition).summary, 'completed');
  assert.equal(shouldProjectNarsClientEvent(inputAccepted, { verbosity: 'conversation' }), false);
  assert.equal(shouldProjectNarsClientEvent(inputAccepted, { verbosity: 'operations' }), true);
  assert.equal(shouldProjectNarsClientEvent(assistant, { verbosity: 'diagnostics' }), false);
  assert.equal(shouldProjectNarsClientEvent(toolCall, { verbosity: 'diagnostics' }), false);
  assert.equal(shouldProjectNarsClientEvent(toolResult, { verbosity: 'diagnostics' }), false);
  assert.equal(shouldProjectNarsClientEvent(mcpRuntimeFault, { verbosity: 'conversation' }), false);
  assert.equal(shouldProjectNarsClientEvent(mcpRuntimeFault, { verbosity: 'operations' }), false);
  assert.equal(shouldProjectNarsClientEvent(mcpRuntimeFault, { verbosity: 'diagnostics' }), true);
  assert.equal(shouldProjectNarsClientEvent(projectionFailure, { verbosity: 'conversation' }), false);
  assert.equal(shouldProjectNarsClientEvent(projectionFailure, { verbosity: 'operations' }), false);
  assert.equal(shouldProjectNarsClientEvent(projectionFailure, { verbosity: 'diagnostics' }), true);
  const intelligenceReconfiguration = { event: 'runtime_intelligence_reconfiguration', terminal_state: 'active' };
  assert.equal(shouldProjectNarsClientEvent(intelligenceReconfiguration, { verbosity: 'conversation' }), false);
  assert.equal(shouldProjectNarsClientEvent(intelligenceReconfiguration, { verbosity: 'operations' }), false);
  assert.equal(shouldProjectNarsClientEvent(intelligenceReconfiguration, { verbosity: 'diagnostics' }), true);
  assert.equal(shouldProjectNarsClientEvent(turnComplete, { verbosity: 'conversation' }), false);
  assert.equal(shouldProjectNarsClientEvent(turnComplete, { verbosity: 'operations' }), false);
  assert.equal(shouldProjectNarsClientEvent(turnComplete, { verbosity: 'diagnostics' }), true);
  assert.equal(classifyNarsClientEventProjection(projectNarsClientEvent(replayCompleted)), 'diagnostics');
  assert.equal(shouldProjectNarsClientEvent(replayCompleted, { verbosity: 'conversation' }), false);
  assert.equal(shouldProjectNarsClientEvent(replayCompleted, { verbosity: 'diagnostics' }), true);

  assert.equal(shouldProjectNarsClientEvent(routineHealth, { verbosity: 'operations' }), false);
  assert.equal(shouldProjectNarsClientEvent(routineHealth, { verbosity: 'diagnostics' }), false);
  assert.equal(shouldProjectNarsClientEvent(routineHealth, { verbosity: 'raw' }), false);
  assert.equal(shouldProjectNarsClientEvent(routineHealth, { verbosity: 'raw', includeStateSamples: true }), true);
  assert.equal(shouldProjectNarsClientEvent({ ...routineHealth, request_id: 'health-request-1' }, { verbosity: 'diagnostics' }), true);
  assert.equal(classifyNarsClientEventProjection(projectNarsClientEvent(unhealthy)), 'diagnostics');
  assert.equal(shouldProjectNarsClientEvent(unhealthy, { verbosity: 'operations' }), false);
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
    agent_identity_ref: { schema: 'narada.agent_identity_ref.v1', site_id: 'sonar', local_agent_id: 'resident', canonical_agent_id: 'sonar.resident' },
    session_id: 'carrier_test',
    event: { type: 'item.completed', item: { id: 'provider_intro', type: 'agent_message', text: 'I am checking context first.' } },
  };
  const projectedAgent = projectNarsClientEvent(providerAgent);
  assert.equal(projectedAgent.kind, 'provider_agent_message');
  assert.equal(projectedAgent.class, 'diagnostics');
  assert.equal(projectedAgent.label, 'Provider message');
  assert.equal(projectedAgent.tone, 'assistant');
  assert.equal(projectedAgent.summary, 'I am checking context first.');
  assert.equal(projectedAgent.renderKey, 'provider-agent-message:provider-item:sonar/sonar.resident:carrier_test:provider_intro');
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
