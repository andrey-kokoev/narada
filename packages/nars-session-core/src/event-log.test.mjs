import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { readNarsEventLogPage } from './event-log.mjs';

test('event views filter before applying the page limit', () => {
  const directory = mkdtempSync(join(tmpdir(), 'narada-event-log-'));
  const eventsPath = join(directory, 'events.jsonl');
  const events = [
    { event: 'session_health', event_sequence: 1 },
    { event: 'session_health', event_sequence: 2 },
    { event: 'session_started', event_sequence: 3 },
    { event: 'tool_call', event_sequence: 4 },
    { event: 'user_message', event_sequence: 5, text: 'first' },
    { event: 'session_health', event_sequence: 6 },
    { event: 'assistant_message', event_sequence: 7, text: 'second' },
    { event: 'tool_result', event_sequence: 8 },
    { event: 'assistant_message', event_sequence: 9, text: 'third' },
    { event: 'runtime_output_failure', event_sequence: 10 },
  ];
  writeFileSync(eventsPath, events.map((event) => JSON.stringify(event)).join('\n'));

  try {
    const conversation = readNarsEventLogPage({ eventsPath, view: 'conversation', limit: 2 });
    assert.deepEqual(conversation.events.map((event) => event.event_sequence), [5, 7]);
    assert.equal(conversation.has_more, true);

    const operations = readNarsEventLogPage({ eventsPath, view: 'operations', limit: 20 });
    assert.deepEqual(operations.events.map((event) => event.event_sequence), [3, 4, 5, 7, 8, 9]);

    const diagnostics = readNarsEventLogPage({ eventsPath, view: 'diagnostics', limit: 20 });
    assert.deepEqual(diagnostics.events.map((event) => event.event_sequence), [1, 2, 6, 10]);

    const earlier = readNarsEventLogPage({ eventsPath, view: 'conversation', beforeSequence: 9, direction: 'backward', limit: 1 });
    assert.deepEqual(earlier.events.map((event) => event.event_sequence), [7]);
    assert.equal(earlier.cursor.before_sequence, 7);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('selector filters find an old input event beyond the raw event tail', () => {
  const directory = mkdtempSync(join(tmpdir(), 'narada-event-log-selector-'));
  const eventsPath = join(directory, 'events.jsonl');
  const events = [
    { event: 'user_message', event_sequence: 1, request_id: 'target-request', input_event_id: 'target-input' },
    ...Array.from({ length: 120 }, (_, index) => ({ event: 'session_health', event_sequence: index + 2 })),
  ];
  writeFileSync(eventsPath, events.map((event) => JSON.stringify(event)).join('\n'));

  try {
    const result = readNarsEventLogPage({
      eventsPath,
      view: 'conversation',
      direction: 'backward',
      limit: 10,
      filters: { any_of: { request_id: 'target-request', input_event_id: 'target-input' } },
    });
    assert.deepEqual(result.events.map((event) => event.event_sequence), [1]);
    assert.equal(result.has_more, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('invalid event views are rejected', () => {
  assert.throws(() => readNarsEventLogPage({ eventsPath: 'missing', view: 'not-a-view' }), /invalid_nars_session_event_view/);
});

test('conversation view carries operator delivery lifecycle facts before applying its limit', () => {
  const directory = mkdtempSync(join(tmpdir(), 'narada-event-log-delivery-'));
  const eventsPath = join(directory, 'events.jsonl');
  const events = [
    { event: 'session_health', event_sequence: 1 },
    { event: 'input_event_queued', event_sequence: 2, request_id: 'request-1' },
    { event: 'tool_call', event_sequence: 3 },
    { event: 'input_event_started', event_sequence: 4, request_id: 'request-1' },
    { event: 'session_control_response', event_sequence: 5, request_id: 'request-1' },
    { event: 'carrier_turn_completed', event_sequence: 6, turn_id: 'turn-1' },
    { event: 'input_event_completed', event_sequence: 7, request_id: 'request-1', terminal_state: 'completed' },
  ];
  writeFileSync(eventsPath, events.map((event) => JSON.stringify(event)).join('\n'));

  try {
    const conversation = readNarsEventLogPage({ eventsPath, view: 'conversation', limit: 3 });
    assert.deepEqual(conversation.events.map((event) => event.event_sequence), [2, 4, 5]);
    assert.equal(conversation.has_more, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
