import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAffordanceActionRequestFrame,
  buildArtifactsSummaryRequestFrame,
  buildConversationEnqueueFrame,
  buildConversationSendFrame,
  buildConversationSteerFrame,
  buildDelegationSummaryRequestFrame,
  buildEventsReadFrame,
  buildGitSummaryRequestFrame,
  buildInboxSummaryRequestFrame,
  buildMailboxSummaryRequestFrame,
  buildOperatorInputAction,
  buildSchedulerSummaryRequestFrame,
  buildSopSummaryRequestFrame,
  buildSurfaceAffordancesRequestFrame,
  buildSurfaceFeedbackSummaryRequestFrame,
  buildTaskLifecycleSummaryRequestFrame,
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
  assert.deepEqual(buildInboxSummaryRequestFrame({ id: 'inbox-1', limit: 7, status: 'received', targetRole: 'architect' }), {
    id: 'inbox-1',
    method: 'session.inbox.summary',
    params: { limit: 7, status: 'received', target_role: 'architect' },
  });
  assert.equal(isAgentWebUiProtocolFrame(buildInboxSummaryRequestFrame()), true);
  assert.deepEqual(buildDelegationSummaryRequestFrame({ id: 'delegation-1', workerLimit: 4, taskLimit: 6, includeTerminal: false }), {
    id: 'delegation-1',
    method: 'session.delegation.summary',
    params: { worker_limit: 4, task_limit: 6, include_terminal: false },
  });
  assert.equal(isAgentWebUiProtocolFrame(buildDelegationSummaryRequestFrame()), true);
  assert.deepEqual(buildGitSummaryRequestFrame({ id: 'git-1', changedLimit: 9, logLimit: 2 }), {
    id: 'git-1',
    method: 'session.git.summary',
    params: { changed_limit: 9, log_limit: 2 },
  });
  assert.equal(isAgentWebUiProtocolFrame(buildGitSummaryRequestFrame()), true);
  assert.deepEqual(buildArtifactsSummaryRequestFrame({ id: 'artifacts-1', limit: 5, offset: 2, kind: 'html' }), {
    id: 'artifacts-1',
    method: 'session.artifacts.summary',
    params: { limit: 5, offset: 2, kind: 'html' },
  });
  assert.equal(isAgentWebUiProtocolFrame(buildArtifactsSummaryRequestFrame()), true);
  assert.deepEqual(buildSurfaceFeedbackSummaryRequestFrame({ id: 'feedback-1', limit: 7, status: 'submitted', kind: 'gap', surfaceId: 'scheduler' }), {
    id: 'feedback-1',
    method: 'session.surface_feedback.summary',
    params: { limit: 7, offset: 0, status: 'submitted', kind: 'gap', surface_id: 'scheduler' },
  });
  assert.equal(isAgentWebUiProtocolFrame(buildSurfaceFeedbackSummaryRequestFrame()), true);
  assert.deepEqual(buildMailboxSummaryRequestFrame({ id: 'mailbox-1', accountLimit: 3, messageLimit: 8, query: 'ops' }), {
    id: 'mailbox-1',
    method: 'session.mailbox.summary',
    params: { account_limit: 3, message_limit: 8, query: 'ops' },
  });
  assert.equal(isAgentWebUiProtocolFrame(buildMailboxSummaryRequestFrame()), true);
  assert.deepEqual(buildSchedulerSummaryRequestFrame({ id: 'scheduler-1', taskLimit: 6, historyLimit: 2, folder: '\\Narada' }), {
    id: 'scheduler-1',
    method: 'session.scheduler.summary',
    params: { task_limit: 6, history_limit: 2, folder: '\\Narada' },
  });
  assert.equal(isAgentWebUiProtocolFrame(buildSchedulerSummaryRequestFrame()), true);
  assert.deepEqual(buildTaskLifecycleSummaryRequestFrame({ id: 'tasks-1', agentId: 'sonar.resident', limit: 5 }), {
    id: 'tasks-1',
    method: 'session.task_lifecycle.summary',
    params: { agent_id: 'sonar.resident', limit: 5, include_obligations: true },
  });
  assert.equal(isAgentWebUiProtocolFrame(buildTaskLifecycleSummaryRequestFrame()), true);
  assert.deepEqual(buildSurfaceAffordancesRequestFrame({ id: 'surface-1' }), { id: 'surface-1', method: 'session.surface.affordances', params: {} });
  assert.equal(isAgentWebUiProtocolFrame(buildSurfaceAffordancesRequestFrame()), true);
  assert.deepEqual(buildAffordanceActionRequestFrame({ surfaceId: 'fixture.surface', actionId: 'refresh', args: { topic: 'status' } }, { id: 'action-1' }), {
    id: 'action-1',
    method: 'session.affordance.action.request',
    params: { surface_id: 'fixture.surface', action_id: 'refresh', args: { topic: 'status' } },
  });
  assert.equal(isAgentWebUiProtocolFrame(buildAffordanceActionRequestFrame({ surfaceId: 'fixture.surface', actionId: 'refresh' })), true);

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
  assert.equal(buildOperatorInputAction('/snippet save launch run startup sequence').kind, 'snippet_command');
  assert.equal(buildOperatorInputAction('/snippet save launch run startup sequence').value, 'save launch run startup sequence');
  assert.deepEqual(buildOperatorInputAction('/observer mute', { id: 'mute-1' }).frame, { id: 'mute-1', method: 'observer.mute', params: {} });
  assert.equal(buildOperatorInputAction('/clear').kind, 'local_clear');
  assert.equal(buildOperatorInputAction('/help').kind, 'local_help');
  assert.equal(buildOperatorInputAction('/json {"id":"status-raw","method":"session.status","params":{}}').frame.method, 'session.status');
  assert.equal(buildOperatorInputAction('/json {"id":"bad","method":"bad.method","params":{}}').message, 'JSON frame method is not admitted for agent-web-ui.');
  assert.equal(buildOperatorInputAction('/does-not-exist').message, 'Unknown command: /does-not-exist. Type /help.');

  for (const method of ['command.execute', 'session.sync']) {
    assert.equal(isAgentWebUiNarsMethod(method), false, method);
    assert.equal(isAgentWebUiProtocolFrame({ id: 'blocked', method, params: {} }), false, method);
  }
});
