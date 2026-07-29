import { describe, expect, it } from 'vitest';
import {
  NARS_CLIENT_CONFORMANCE_FIXTURES,
  classifyNarsClientEventDisposition,
  classifyNarsClientEventProjection,
  operatorViewAllowsProjection,
  operatorViewPolicyFor,
} from '@narada2/nars-client-projection-contract';
import { classifyRuntimeMessage, createSessionProjection } from '../src/session-projection.ts';

const providerAgent = {
  event_sequence: 40,
  session_id: 'fixture-session',
  event: { type: 'item.completed', item: { id: 'provider-agent-1', type: 'agent_message', text: 'provider telemetry' } },
};

const providerTool = {
  event_sequence: 41,
  session_id: 'fixture-session',
  event: { type: 'item.completed', item: { id: 'provider-tool-1', type: 'mcp_tool_call', server: 'fixture', tool: 'read' } },
};

const parityEvents = [
  ...NARS_CLIENT_CONFORMANCE_FIXTURES.canonical_events,
  providerAgent,
  providerTool,
  { event: 'session_events_subscription_started', replay_count: 1 },
];

describe('web UI projection parity', () => {
  it('delegates every fixture disposition to the shared contract', () => {
    for (const event of parityEvents) {
      expect(classifyRuntimeMessage(event)).toBe(classifyNarsClientEventDisposition(event));
    }
  });

  it('keeps provider telemetry and artifacts out of conversation while diagnostics remain cumulative', () => {
    const conversation = createSessionProjection(parityEvents, { verbosity: 'conversation' });
    expect(conversation.rows.some((row: any) => row.kind === 'assistant_message')).toBe(true);
    expect(conversation.rows.some((row: any) => row.kind === 'provider_agent_message')).toBe(false);
    expect(conversation.rows.some((row: any) => row.kind === 'session_artifact_registered')).toBe(false);

    const diagnostics = createSessionProjection(parityEvents, { verbosity: 'diagnostics' });
    expect(diagnostics.rows.some((row: any) => row.kind === 'provider_agent_message')).toBe(true);
    expect(diagnostics.rows.some((row: any) => row.kind === 'tool_result')).toBe(true);
    expect(diagnostics.rows.some((row: any) => row.kind === 'session_artifact_registered')).toBe(true);
    expect(diagnostics.rows.some((row: any) => row.kind === 'session_events_subscription_started')).toBe(true);
  });

  it('uses the shared policy for custom lane combinations', () => {
    const custom = createSessionProjection(parityEvents, {
      customView: { facets: ['conversation', 'protocol'] },
    });
    expect(custom.rows.some((row: any) => row.kind === 'assistant_message')).toBe(true);
    expect(custom.rows.some((row: any) => row.kind === 'session_events_subscription_started')).toBe(true);
    expect(custom.rows.some((row: any) => row.kind === 'provider_agent_message')).toBe(false);
    expect(custom.rows.some((row: any) => row.kind === 'tool_result')).toBe(false);

    const providerProjection = {
      kind: 'provider_agent_message',
      class: 'diagnostics',
      event: providerAgent,
    };
    expect(operatorViewAllowsProjection(providerProjection, { verbosity: 'conversation' })).toBe(false);
    expect(operatorViewAllowsProjection(providerProjection, { facets: ['diagnostics'] })).toBe(true);
    expect(operatorViewPolicyFor({ facets: ['conversation', 'protocol'] }).transportVerbosity).toBe('raw');
  });

});
