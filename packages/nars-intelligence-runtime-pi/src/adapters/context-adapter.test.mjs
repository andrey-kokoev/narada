import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPiContextFromNarsRecords } from './context-adapter.mjs';

test('Pi context is rebuilt from NARS records and remains reconstructable after Pi state loss', () => {
  const context = buildPiContextFromNarsRecords({
    sessionSnapshot: { session_id: 'session' },
    events: [
      { event: 'user_message', turn_id: 'old', content: 'old input' },
      { event: 'assistant_message', turn_id: 'old', content: 'old response' },
    ],
    turn: { turn_id: 'new', messages: [{ role: 'user', content: 'new input' }] },
  });
  assert.equal(context.source, 'nars-owned-records');
  assert.deepEqual(context.messages.map((message) => message.content), ['old input', 'old response', 'new input']);
  assert.equal(context.canonical_history_reconstructable, true);
});

test('context projection removes only the journal/current-prefix overlap', () => {
  const context = buildPiContextFromNarsRecords({
    events: [
      { event: 'user_message', content: 'hello' },
      { event: 'assistant_message', content: 'previous' },
    ],
    turn: {
      turn_id: 'turn-2',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'previous' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'call-1' }] },
        { role: 'tool', tool_call_id: 'call-1', content: '{"status":"completed"}' },
      ],
    },
  });
  assert.deepEqual(context.messages, [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'previous' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'call-1' }] },
    { role: 'tool', tool_call_id: 'call-1', content: '{"status":"completed"}' },
  ]);
});

test('context reconstruction includes explicitly recorded admitted tool results', () => {
  const context = buildPiContextFromNarsRecords({
    events: [
      { event: 'user_message', content: 'look up the note' },
      { event: 'assistant_message', content: null },
      { event: 'tool_execution_completed', tool_call_id: 'call-1', result: { status: 'completed', result: { note: 'read-only' } } },
    ],
    turn: { turn_id: 'next-turn', messages: [] },
  });
  assert.deepEqual(context.messages.map((message) => message.role), ['user', 'tool']);
  assert.match(context.messages[1].content, /read-only/);
  assert.equal(context.messages[1].tool_call_id, 'call-1');
});

test('context reconstruction excludes queued but not yet admitted input events', () => {
  const context = buildPiContextFromNarsRecords({
    events: [
      { event: 'input_event_queued', event_id: 'queued-1', content: 'must not reach Pi' },
      { event: 'user_message', input_event_id: 'admitted-1', content: 'admitted input' },
    ],
  });
  assert.deepEqual(context.messages, [{ role: 'user', content: 'admitted input' }]);
});
