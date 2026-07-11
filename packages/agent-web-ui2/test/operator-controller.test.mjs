import test from 'node:test';
import assert from 'node:assert/strict';
import { shallowRef } from 'vue';
import { emptySessionSnapshot } from '../src/domain/session.ts';
import { createOperatorController } from '../src/features/operator/operator-controller.ts';

function fakeSession(activeTurnId = null, supportsProtocolMethod = () => true) {
  const snapshot = emptySessionSnapshot();
  snapshot.activeTurnId = activeTurnId;
  const frames = [];
  const local = [];
  return {
    snapshot: shallowRef(snapshot),
    runtimeTopology: shallowRef({ canSendInput: true, primaryCause: null }),
    rows: null,
    capabilities: null,
    start() {},
    stop() {},
    refreshHealth: async () => null,
    supportsProtocolMethod,
    sendFrame(frame) { frames.push(frame); return true; },
    clearEvents() { local.push({ kind: 'clear' }); },
    appendLocal(kind, payload) { local.push({ kind, payload }); },
    frames,
    local,
  };
}

test('operator controller derives steering from the active session turn', () => {
  const session = fakeSession('turn_7');
  const operator = createOperatorController(session);
  assert.equal(operator.submit('change course'), true);
  assert.equal(session.frames[0].method, 'session.submit');
  assert.equal(session.frames[0].params.delivery_mode, 'admit_after_active_turn');
  assert.equal(session.frames[0].params.active_turn_id, 'turn_7');
});

test('snippet slash commands are handled by the browser-local snippet controller', () => {
  const session = fakeSession();
  const operator = createOperatorController(session);
  assert.equal(operator.submit('/snippet save launch run startup sequence'), true);
  assert.equal(operator.snippets.snippets.value[0].name, 'launch');
  assert.equal(operator.submit('/snippet enqueue launch'), true);
  assert.equal(session.frames[0].method, 'session.submit');
  assert.equal(session.frames[0].params.delivery_mode, 'admit_after_active_turn');
});

test('snippet runs preserve slash-prefixed bodies as direct conversation text', () => {
  const session = fakeSession();
  const operator = createOperatorController(session);
  const snippet = { id: 'snippet-literal-command', name: 'literal-command', body: '/status', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', pinned: false, lastUsedAt: null, useCount: 0 };
  assert.equal(operator.runSnippet(snippet), true);
  assert.equal(session.frames[0].method, 'session.submit');
  assert.equal(session.frames[0].params.content, '/status');
  assert.equal(operator.runSnippet(snippet, 'enqueue'), true);
  assert.equal(session.frames[1].method, 'session.submit');
  assert.equal(session.frames[1].params.delivery_mode, 'admit_after_active_turn');
});

test('operator controller projects queue state and centralizes remove and steer actions', () => {
  const session = fakeSession('turn_7', () => true);
  session.snapshot.value.health = { status: 'healthy', operator_input_queue: { items: [{ index: 2, content: 'wait for approval', delivery_mode: 'enqueue' }] } };
  const operator = createOperatorController(session);
  const [item] = operator.queueItems.value;
  assert.equal(item.content, 'wait for approval');
  assert.equal(operator.removeQueued(item), true);
  assert.equal(session.frames[0].method, 'session.command.execute');
  assert.equal(operator.steerQueued(item), true);
  assert.equal(session.frames[2].method, 'session.submit');
  assert.equal(session.frames[2].params.delivery_mode, 'admit_after_active_turn');
  assert.equal(session.frames[2].params.active_turn_id, 'turn_7');
});

test('operator controller refuses adapter-only queue mutation on the local session transport', () => {
  const session = fakeSession('turn_7', (method) => method === 'session.submit');
  session.snapshot.value.health = { status: 'healthy', operator_input_queue: { items: [{ index: 2, content: 'wait for approval', delivery_mode: 'enqueue' }] } };
  const operator = createOperatorController(session);
  const [item] = operator.queueItems.value;
  assert.equal(operator.removeQueued(item), false);
  assert.equal(session.frames.length, 0);
  assert.deepEqual(session.local[0], {
    kind: 'web_ui_input_not_sent',
    payload: { content: '/queue drop 2', reason: 'unsupported_session_control', method: 'session.command.execute' },
  });
});

test('operator controller keeps browser-local actions out of the transport', () => {
  const session = fakeSession();
  const operator = createOperatorController(session);
  assert.equal(operator.submit('/clear'), true);
  assert.equal(session.frames.length, 0);
  assert.deepEqual(session.local, [{ kind: 'clear' }]);
});

test('operator controller projects shared help and unknown-command responses without sending frames', () => {
  const session = fakeSession();
  const operator = createOperatorController(session);
  assert.equal(operator.submit('/help'), true);
  assert.equal(operator.submit('/not-a-command'), true);
  assert.equal(session.frames.length, 0);
  assert.match(session.local[0].payload.content, /^Commands\n/);
  assert.match(session.local[0].payload.content, /\/status/);
  assert.equal(session.local[1].payload.content, 'Unknown command: /not-a-command. Type /help.');
});

test('operator controller refuses adapter-only controls on the local session transport', () => {
  const session = fakeSession(null, (method) => method.startsWith('session.') && !['session.operations', 'session.command.execute'].includes(method));
  const operator = createOperatorController(session);
  assert.equal(operator.submit('/ops'), false);
  assert.equal(session.frames.length, 0);
  assert.deepEqual(session.local[0], {
    kind: 'web_ui_input_not_sent',
    payload: { content: '/ops', reason: 'unsupported_session_control', method: 'session.operations' },
  });
  assert.equal(operator.submit('/help'), true);
  assert.doesNotMatch(session.local[1].payload.content, /\/ops|\/queue|\/observer/);
});

test('operator controller refuses NARS input when runtime authority seals it', () => {
  const session = fakeSession('turn_7');
  session.runtimeTopology.value = { canSendInput: false, primaryCause: 'runtime authority is sealed' };
  const operator = createOperatorController(session);
  assert.equal(operator.submit('change course'), false);
  assert.equal(session.frames.length, 0);
  assert.deepEqual(session.local, [{ kind: 'web_ui_input_not_sent', payload: { content: 'change course', reason: 'runtime authority is sealed' } }]);
});
