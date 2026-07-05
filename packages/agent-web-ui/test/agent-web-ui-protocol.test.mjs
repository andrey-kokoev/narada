import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildConversationEnqueueFrame,
  buildConversationSendFrame,
  buildConversationSteerFrame,
  buildEventsReadFrame,
  buildOperatorInputAction,
  buildSopSummaryRequestFrame,
  buildSurfaceAffordancesRequestFrame,
  buildSubscribeFrame,
  isAgentWebUiNarsMethod,
  isAgentWebUiProtocolFrame,
} from '../src/agent-web-ui.js';

test('agent-web-ui emits admitted NARS methods for event attach and operator input', () => {
  const subscribe = buildSubscribeFrame({ id: 'sub-1', maxReplay: 25, includeReplay: true });
  assert.equal(subscribe.method, 'session.events.subscribe');
  assert.deepEqual(subscribe.params, { include_replay: true, max_replay: 25 });
  assert.equal(isAgentWebUiProtocolFrame(subscribe), true);

  const readPage = buildEventsReadFrame({ id: 'read-1', beforeSequence: 50, direction: 'backward', limit: 25 });
  assert.deepEqual(readPage, { id: 'read-1', method: 'session.events.read', params: { limit: 25, before_sequence: 50, direction: 'backward' } });
  assert.equal(isAgentWebUiProtocolFrame(readPage), true);

  assert.deepEqual(buildSopSummaryRequestFrame({ id: 'sop-1', templateLimit: 10, runLimit: 5, includeTerminal: false }), {
    id: 'sop-1',
    method: 'session.sop.summary',
    params: { template_limit: 10, run_limit: 5, include_terminal: false },
  });
  assert.equal(isAgentWebUiProtocolFrame(buildSopSummaryRequestFrame()), true);
  assert.deepEqual(buildSurfaceAffordancesRequestFrame({ id: 'surface-1' }), { id: 'surface-1', method: 'session.surface.affordances', params: {} });
  assert.equal(isAgentWebUiProtocolFrame(buildSurfaceAffordancesRequestFrame()), true);

  const input = buildConversationSendFrame('run startup sequence', { id: 'input-1' });
  assert.deepEqual(input, {
    id: 'input-1',
    method: 'conversation.send',
    params: { message: 'run startup sequence', source: 'agent-web-ui' },
  });
  assert.equal(isAgentWebUiProtocolFrame(input), true);
  assert.deepEqual(buildConversationEnqueueFrame('run after this', { id: 'enqueue-1', activeTurnId: 'turn_1' }), {
    id: 'enqueue-1',
    method: 'conversation.enqueue',
    params: { message: 'run after this', source: 'agent-web-ui', active_turn_id: 'turn_1' },
  });
  assert.equal(buildConversationSendFrame('   '), null);
  assert.deepEqual(buildConversationSteerFrame('change course', { id: 'steer-1', activeTurnId: 'turn_1' }), {
    id: 'steer-1',
    method: 'conversation.steer',
    params: { message: 'change course', source: 'agent-web-ui', active_turn_id: 'turn_1' },
  });
  assert.equal(isAgentWebUiProtocolFrame(buildConversationSteerFrame('change course', { id: 'steer-1' })), true);
  assert.deepEqual(buildOperatorInputAction('change course', { id: 'steer-2', activeTurn: true, activeTurnId: 'turn_1' }).frame, {
    id: 'steer-2',
    method: 'conversation.steer',
    params: { message: 'change course', source: 'agent-web-ui', active_turn_id: 'turn_1' },
  });
  assert.deepEqual(buildOperatorInputAction('run after this', { id: 'enqueue-2', activeTurn: true, activeTurnId: 'turn_1', deliveryMode: 'enqueue' }).frame, {
    id: 'enqueue-2',
    method: 'conversation.enqueue',
    params: { message: 'run after this', source: 'agent-web-ui', active_turn_id: 'turn_1' },
  });

  assert.equal(buildOperatorInputAction('/status', { id: 'status-1' }).frame.method, 'session.status');
  assert.equal(buildOperatorInputAction('/health', { id: 'health-1' }).frame.method, 'session.health');
  assert.equal(buildOperatorInputAction('/events', { id: 'events-1' }).frame.method, 'session.events.subscribe');
  assert.equal(buildOperatorInputAction('/recovery', { id: 'recovery-1' }).frame.method, 'session.recovery');
  assert.equal(buildOperatorInputAction('/ops', { id: 'ops-1' }).frame.method, 'session.operations');
  assert.equal(buildOperatorInputAction('/interrupt', { id: 'interrupt-1' }).frame.method, 'conversation.interrupt');
  assert.equal(buildOperatorInputAction('/tools mcp', { id: 'tools-1' }).frame.method, 'session.command.execute');
  assert.deepEqual(buildOperatorInputAction('/observer mute', { id: 'mute-1' }).frame, { id: 'mute-1', method: 'observer.mute', params: {} });
  assert.equal(buildOperatorInputAction('/clear').kind, 'local_clear');
  assert.equal(buildOperatorInputAction('/help').kind, 'local_help');

  for (const method of ['command.execute', 'session.sync']) {
    assert.equal(isAgentWebUiNarsMethod(method), false, method);
    assert.equal(isAgentWebUiProtocolFrame({ id: 'blocked', method, params: {} }), false, method);
  }
});
