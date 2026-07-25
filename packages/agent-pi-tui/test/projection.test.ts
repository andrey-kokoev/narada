import { describe, expect, it } from 'vitest';
import { NarsProjectionAdapter } from '../src/projection/projection-adapter.js';
import { TranscriptModel } from '../src/projection/transcript-model.js';
import { sharedConformanceEvents, sharedEvents } from './fixtures/shared-events.js';

describe('agent-pi-tui projection', () => {
  it('uses the shared projection contract for semantic row identity', () => {
    const adapter: any = new NarsProjectionAdapter({ verbosity: 'raw' });
    const rows: any = adapter.projectMany(sharedEvents);
    expect(rows.map((row: any) => row.projectionClass)).toEqual([
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
    const adapter: any = new NarsProjectionAdapter({ verbosity: 'raw' });
    const transcript: any = new TranscriptModel();
    for (const row of adapter.projectMany(sharedEvents)) transcript.ingest(row);
    expect(transcript.allRows()).toHaveLength(4);
    expect(transcript.allRows().filter((row: any) => row.renderKey === 'assistant:fixture-turn-1')).toHaveLength(1);
    expect(transcript.lastSequence).toBe(6);
  });

  it('projects the complete shared conformance fixture deterministically', () => {
    const adapter: any = new NarsProjectionAdapter({ verbosity: 'raw' });
    const first: any = adapter.projectMany(sharedConformanceEvents);
    const second: any = adapter.projectMany(sharedConformanceEvents);
    expect(second).toEqual(first);
    expect(first.some((row: any) => row.kind === 'tool_call')).toBe(true);
    expect(first.some((row: any) => row.kind === 'session_health')).toBe(true);
    expect(first.some((row: any) => row.content.some((part: any) => part.type === 'artifact_ref'))).toBe(true);
  });
});
