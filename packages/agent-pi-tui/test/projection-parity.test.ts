import { describe, expect, it } from 'vitest';
import {
  NARS_CLIENT_CONFORMANCE_FIXTURES,
  classifyNarsClientEventProjection,
  projectNarsClientEvent,
} from '@narada2/nars-client-projection-contract';
import { NarsProjectionAdapter } from '../src/projection/projection-adapter.js';
import { TranscriptModel } from '../src/projection/transcript-model.js';

describe('agent-pi-tui projection parity', () => {
  it('uses the shared class for provider telemetry, operations, and artifacts', () => {
    const providerAgent = {
      event_sequence: 40,
      session_id: 'fixture-session',
      event: { type: 'item.completed', item: { id: 'provider-agent-1', type: 'agent_message', text: 'provider telemetry' } },
    };
    const adapter: any = new NarsProjectionAdapter({ verbosity: 'raw' });
    const rows: any[] = adapter.projectMany([
      providerAgent,
      NARS_CLIENT_CONFORMANCE_FIXTURES.canonical_events[10],
    ]);

    expect(rows[0]?.projectionClass).toBe(classifyNarsClientEventProjection(projectNarsClientEvent(providerAgent)!));
    expect(rows[0]?.projectionClass).toBe('diagnostics');
    expect(rows[1]?.projectionClass).toBe('operations');
  });

  it('uses the shared five-lane policy when filtering the transcript', () => {
    const events: any[] = [
      { event: 'user_message', event_id: 'user-1', event_sequence: 1, content: 'hello' },
      { event: 'tool_call', event_id: 'tool-1', event_sequence: 2, request_id: 'tool-request-1', tool_name: 'fixture.read' },
      {
        event_sequence: 3,
        event_id: 'provider-agent-1',
        session_id: 'fixture-session',
        event: { type: 'item.completed', item: { id: 'provider-agent-1', type: 'agent_message', text: 'provider telemetry' } },
      },
      { event: 'session_events_subscription_started', event_id: 'protocol-1', event_sequence: 4, replay_count: 1 },
    ];
    const adapter = new NarsProjectionAdapter({ verbosity: 'raw' });
    const transcript = new TranscriptModel();
    transcript.ingestMany(adapter.projectMany(events));

    expect(transcript.rows('conversation').map((row) => row.kind)).toEqual(['user_message']);
    expect(transcript.rows('operations').map((row) => row.kind)).toEqual(['user_message', 'tool_call']);
    expect(transcript.rows('diagnostics').map((row) => row.kind)).toEqual(['user_message', 'tool_call', 'provider_agent_message', 'session_events_subscription_started']);
    expect(transcript.rows('protocol').map((row) => row.kind)).toEqual(['session_events_subscription_started']);
    expect(transcript.rows('raw').map((row) => row.kind)).toEqual(['user_message', 'tool_call', 'provider_agent_message', 'session_events_subscription_started']);
  });
});
