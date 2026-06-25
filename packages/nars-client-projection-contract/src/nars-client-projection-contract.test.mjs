import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENT_WEB_UI_NARS_METHOD_LIST,
  NARS_CLIENT_PROJECTION_REGISTRY,
  NARS_COMMAND_COMPATIBILITY_METHODS,
  NARS_COMMAND_METHOD,
  buildAgentWebUiConversationSendFrame,
  buildAgentWebUiHelpText,
  buildAgentWebUiOperatorInputAction,
  buildAgentWebUiSubscribeFrame,
  buildNarsAttachCommands,
  isAgentWebUiNarsMethod,
  isAgentWebUiProtocolFrame,
} from './nars-client-projection-contract.mjs';

test('NARS client projection contract owns attach commands and web UI capabilities', () => {
  assert.equal(NARS_COMMAND_METHOD, 'carrier.command.execute');
  assert.deepEqual(NARS_COMMAND_COMPATIBILITY_METHODS, ['agent-cli.command']);
  assert.equal(AGENT_WEB_UI_NARS_METHOD_LIST.includes('conversation.send'), true);
  assert.equal(AGENT_WEB_UI_NARS_METHOD_LIST.includes('conversation.interrupt'), true);
  assert.equal(AGENT_WEB_UI_NARS_METHOD_LIST.includes('command.execute'), false);
  assert.equal(NARS_CLIENT_PROJECTION_REGISTRY.clients.agent_web_ui.admitted_methods, AGENT_WEB_UI_NARS_METHOD_LIST);
  assert.deepEqual(buildNarsAttachCommands({ eventEndpoint: 'ws://127.0.0.1/events', healthEndpoint: 'http://127.0.0.1/health' }), {
    registry_schema: 'narada.nars.client_projection_registry.v1',
    agent_cli: 'narada-agent-cli --attach ws://127.0.0.1/events',
    agent_web_ui: 'narada-agent-web-ui --event-endpoint ws://127.0.0.1/events --health-endpoint http://127.0.0.1/health',
    protocol: '{"id":"events-1","method":"session.events.subscribe","params":{"include_replay":true,"max_replay":20}}',
    operator_input_protocol: '{"id":"input-1","method":"conversation.send","params":{"message":"<operator message>","source":"agent-web-ui"}}',
    slash_command_protocol: '{"id":"command-1","method":"carrier.command.execute","params":{"command":"/status","value":""}}',
    compatibility_methods: ['agent-cli.command'],
  });
});

test('NARS client projection contract owns web UI operator input projection', () => {
  assert.deepEqual(buildAgentWebUiSubscribeFrame({ id: 'events-1', maxReplay: 20, includeReplay: true }), {
    id: 'events-1',
    method: 'session.events.subscribe',
    params: { include_replay: true, max_replay: 20 },
  });
  assert.deepEqual(buildAgentWebUiConversationSendFrame('run startup sequence', { id: 'input-1' }), {
    id: 'input-1',
    method: 'conversation.send',
    params: { message: 'run startup sequence', source: 'agent-web-ui' },
  });
  assert.equal(buildAgentWebUiConversationSendFrame('   '), null);
  assert.equal(buildAgentWebUiOperatorInputAction('/help').kind, 'local_help');
  assert.equal(buildAgentWebUiOperatorInputAction('/clear').kind, 'local_clear');
  assert.equal(buildAgentWebUiOperatorInputAction('/status', { id: 'status-1' }).frame.method, 'session.status');
  assert.equal(buildAgentWebUiOperatorInputAction('/health', { id: 'health-1' }).frame.method, 'session.health');
  assert.equal(buildAgentWebUiOperatorInputAction('/events', { id: 'events-2' }).frame.method, 'session.events.subscribe');
  assert.equal(buildAgentWebUiOperatorInputAction('/recovery', { id: 'recovery-1' }).frame.method, 'session.recovery');
  assert.equal(buildAgentWebUiOperatorInputAction('/ops', { id: 'ops-1' }).frame.method, 'session.operations');
  assert.equal(buildAgentWebUiOperatorInputAction('/interrupt', { id: 'interrupt-1' }).frame.method, 'conversation.interrupt');
  assert.equal(buildAgentWebUiOperatorInputAction('/tools mcp', { id: 'tools-1' }).frame.method, 'carrier.command.execute');
  assert.deepEqual(buildAgentWebUiOperatorInputAction('/observer mute', { id: 'mute-1' }).frame, { id: 'mute-1', method: 'observer.mute', params: {} });
  assert.equal(buildAgentWebUiOperatorInputAction('/observer').message, 'Usage: /observer mute|unmute');
  assert.match(buildAgentWebUiHelpText(), /Ordinary text is submitted as conversation\.send\./);
  assert.equal(isAgentWebUiNarsMethod('carrier.command.execute'), true);
  assert.equal(isAgentWebUiNarsMethod('command.execute'), false);
  assert.equal(isAgentWebUiProtocolFrame({ id: 'ok', method: 'conversation.send', params: {} }), true);
  assert.equal(isAgentWebUiProtocolFrame({ id: 'blocked', method: 'session.sync', params: {} }), false);
});
