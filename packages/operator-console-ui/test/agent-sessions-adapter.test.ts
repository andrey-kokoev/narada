import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentSessionsApiError,
  createAgentSessionsAdapter,
} from '../src/agent-sessions/adapter.ts';
import { createAgentSessionsTransport } from '../src/agent-sessions/transport.ts';

const session = {
  session_id: 'session-1',
  site_id: 'staccato',
  agent_id: 'staccato.resident',
  runtime_kind: 'narada-agent-runtime-server',
  launch_operator_surface_kind: 'agent-web-ui',
  started_at: '2026-07-13T00:00:00.000Z',
  last_seen_at: '2026-07-13T00:01:00.000Z',
  terminal_state: null,
  display_state: 'active',
  display_state_reason: 'health_probe_succeeded',
  heartbeat_fresh: true,
  heartbeat_age_ms: 1000,
  health_status: 'healthy',
};

test('agent session adapter parses the bounded wire contract', async () => {
  const client = createAgentSessionsAdapter({
    list: async () => ({
      schema: 'narada.operator_console.agent_sessions.v1',
      status: 'success',
      generated_at: '2026-07-13T00:01:00.000Z',
      count: 1,
      sessions: [session],
      refusals: [],
    }),
  });
  const response = await client.list();
  assert.equal(response.sessions[0]?.sessionId, 'session-1');
  assert.equal(response.sessions[0]?.heartbeatFresh, true);
});

test('agent session adapter refuses malformed envelopes', async () => {
  const client = createAgentSessionsAdapter({ list: async () => ({ sessions: [] }) });
  await assert.rejects(() => client.list(), (error: unknown) => {
    assert.ok(error instanceof AgentSessionsApiError);
    assert.equal(error.code, 'invalid_response');
    return true;
  });
});

test('agent session transport uses the explicit session API base path', async () => {
  const calls: string[] = [];
  const transport = createAgentSessionsTransport('/console/sessions/api', async (input) => {
    calls.push(input);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  await transport.list();
  assert.deepEqual(calls, ['/console/sessions/api/sessions']);
});
