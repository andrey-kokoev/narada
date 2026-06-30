import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readNarsEventLogPage } from './nars-event-log.mjs';

function writeEvents(path, events) {
  writeFileSync(path, `${events.map((event) => typeof event === 'string' ? event : JSON.stringify(event)).join('\n')}\n`, 'utf8');
}

test('NARS event log reader pages events.jsonl by sequence and filters', () => {
  const root = mkdtempSync(join(tmpdir(), 'nars-event-log-test-'));
  try {
    const eventsPath = join(root, 'events.jsonl');
    writeEvents(eventsPath, [
      { event_sequence: 1, sequence: 1, event: 'session_started', timestamp: '2026-06-23T00:00:00.000Z' },
      '{not-json',
      { event_sequence: 2, sequence: 2, event: 'assistant_message', request_id: 'input_1', timestamp: '2026-06-23T00:00:01.000Z' },
      { event_sequence: 3, sequence: 3, event: 'tool_call', request_id: 'input_1', timestamp: '2026-06-23T00:00:02.000Z' },
      { event_sequence: 4, sequence: 4, event: 'assistant_message', request_id: 'input_2', timestamp: '2026-06-23T00:00:03.000Z' },
    ]);

    const forward = readNarsEventLogPage({ eventsPath, afterSequence: 1, limit: 2 });
    assert.equal(forward.source, 'events_jsonl');
    assert.deepEqual(forward.events.map((event) => event.event_sequence), [2, 3]);
    assert.equal(forward.has_more, true);
    assert.equal(forward.cursor.after_sequence, 3);
    assert.equal(forward.corrupt_line_count, 1);

    const backward = readNarsEventLogPage({ eventsPath, beforeSequence: 4, direction: 'backward', limit: 2 });
    assert.deepEqual(backward.events.map((event) => event.event_sequence), [2, 3]);
    assert.equal(backward.has_more, true);
    assert.equal(backward.cursor.before_sequence, 2);

    const filtered = readNarsEventLogPage({ eventsPath, afterSequence: 0, filters: { event_kinds: ['assistant_message'], request_id: 'input_2' } });
    assert.deepEqual(filtered.events.map((event) => event.event_sequence), [4]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
