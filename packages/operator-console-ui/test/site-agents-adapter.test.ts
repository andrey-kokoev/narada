import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteAgentsAdapter, SiteAgentsApiError } from '../src/site-agents/adapter.ts';
import { createSiteAgentsTransport, SiteAgentsTransportError } from '../src/site-agents/transport.ts';

const overview = {
  schema: 'narada.operator_console.site_agent_overview.v1',
  status: 'success',
  generated_at: '2026-07-18T00:00:00.000Z',
  refusals: [],
  groups: [{
    id: 'sites',
    label: 'Sites',
    sites: [{
      site_id: 'sonar',
      display_name: 'Sonar',
      site_kind: 'site',
      group_id: 'sites',
      observation_status: 'present',
      agents: [{
        agent_id: 'sonar.resident',
        local_agent_id: 'resident',
        title: 'Resident',
        role: 'resident',
        admission_status: 'admitted',
        runtime: { state: 'stopped', session_count: 0, healthy_session_ids: [], selected_session_id: null },
        work: { state: 'available', detail: null, source: 'principal-runtime' },
        actions: { start: true, inspect: false, inspect_reason: 'No healthy session is available.' },
      }],
    }],
  }],
};

test('site agents adapter accepts governed overview and launch contracts', async () => {
  const adapter = createSiteAgentsAdapter({
    overview: async () => overview,
    launch: async () => ({
      schema: 'narada.operator_console.agent_launch.v1',
      status: 'launched',
      site_id: 'sonar',
      agent_id: 'sonar.resident',
      session_id: 'session-1',
      reason: null,
    }),
  });
  assert.equal((await adapter.overview()).groups[0]?.sites[0]?.agents[0]?.agent_id, 'sonar.resident');
  assert.equal((await adapter.launch('sonar', 'sonar.resident')).session_id, 'session-1');
});

test('site agents adapter refuses malformed authority projections', async () => {
  const adapter = createSiteAgentsAdapter({ overview: async () => ({ ...overview, groups: [{}] }), launch: async () => null });
  await assert.rejects(() => adapter.overview(), (error: unknown) => error instanceof SiteAgentsApiError && error.code === 'invalid_overview');
  await assert.rejects(() => adapter.launch('sonar', 'sonar.resident'), (error: unknown) => error instanceof SiteAgentsApiError && error.code === 'invalid_launch');
});

test('site agents adapter refuses malformed launch diagnostics', async () => {
  const adapter = createSiteAgentsAdapter({
    overview: async () => overview,
    launch: async () => ({
      schema: 'narada.operator_console.agent_launch.v1',
      status: 'failed',
      site_id: 'sonar',
      agent_id: 'sonar.resident',
      session_id: null,
      reason: 'workspace_launch_failed',
      failure: { phase: 'not-a-phase', code: 42, message: null, diagnostic_ref: {} },
    }),
  });
  await assert.rejects(() => adapter.launch('sonar', 'sonar.resident'), (error: unknown) => error instanceof SiteAgentsApiError && error.code === 'invalid_launch');
});

test('site agents adapter flags semantically invalid overview payloads', async () => {
  const violating = {
    ...overview,
    groups: [{
      id: 'sites',
      label: 'Sites',
      sites: [{
        ...overview.groups[0].sites[0],
        agents: [{
          ...overview.groups[0].sites[0].agents[0],
          runtime: { state: 'running', session_count: 0, healthy_session_ids: [], selected_session_id: null },
          actions: { start: true, inspect: false, inspect_reason: null },
        }],
      }],
    }],
  };
  const adapter = createSiteAgentsAdapter({ overview: async () => violating, launch: async () => null });
  const response = await adapter.overview();
  assert.ok(response.refusals.some((entry) => entry.startsWith('invariant_violation:runtime_running_shape:')));
  assert.ok(response.refusals.some((entry) => entry.startsWith('invariant_violation:action_state_mismatch:')));
});

test('site agents transport preserves structured launch diagnostics from HTTP 500', async () => {
  const payload = {
    schema: 'narada.operator_console.agent_launch.v1',
    status: 'failed',
    site_id: 'sonar',
    agent_id: 'sonar.resident',
    session_id: null,
    reason: 'workspace_launch_exit',
    request_id: 'request-1',
    failure: {
      phase: 'workspace_launch',
      code: 'workspace_launch_exit',
      message: 'provider unavailable',
      diagnostic_ref: 'D:/runtime/failure.json',
    },
  };
  const transport = createSiteAgentsTransport('/console/agents/api', async () => new Response(JSON.stringify(payload), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  }));
  await assert.rejects(
    () => transport.launch('sonar', 'sonar.resident'),
    (error: unknown) => {
      assert.ok(error instanceof SiteAgentsTransportError);
      assert.equal(error.status, 500);
      assert.deepEqual(error.payload, payload);
      assert.equal(error.message, 'Agent launch failed: provider unavailable');
      return true;
    },
  );
});
