import { describe, expect, it } from 'vitest';
import { NarsProjectionAdapter } from '../src/projection/projection-adapter.js';
import { TranscriptModel } from '../src/projection/transcript-model.js';
import { sharedConformanceEvents, sharedEvents } from './fixtures/shared-events.js';

describe('agent-pi-tui projection', () => {
  it('uses the shared projection contract for semantic row identity', () => {
    const adapter = new NarsProjectionAdapter({ verbosity: 'raw' });
    const rows = adapter.projectMany(sharedEvents);
    expect(rows.map((row) => row.projectionClass)).toEqual([
      'operations',
      'conversation',
      'conversation',
      'conversation',
      'diagnostics',
    ]);
    expect(rows[2]?.renderKey).toBe('assistant:fixture-turn-1');
    expect(rows[3]?.renderKey).toBe('assistant:fixture-turn-1');
  });

  it('upserts streaming rows without creating duplicate canonical rows', () => {
    const adapter = new NarsProjectionAdapter({ verbosity: 'raw' });
    const transcript = new TranscriptModel();
    for (const row of adapter.projectMany(sharedEvents)) transcript.ingest(row);
    expect(transcript.allRows()).toHaveLength(4);
    expect(transcript.allRows().filter((row) => row.renderKey === 'assistant:fixture-turn-1')).toHaveLength(1);
    expect(transcript.lastSequence).toBe(6);
  });

  it('projects the complete shared conformance fixture deterministically', () => {
    const adapter = new NarsProjectionAdapter({ verbosity: 'raw' });
    const first = adapter.projectMany(sharedConformanceEvents);
    const second = adapter.projectMany(sharedConformanceEvents);
    expect(second).toEqual(first);
    expect(first.some((row) => row.kind === 'tool_call')).toBe(true);
    expect(first.some((row) => row.kind === 'session_health')).toBe(true);
    expect(first.some((row) => row.content.some((part) => part.type === 'artifact_ref'))).toBe(true);
  });
});
