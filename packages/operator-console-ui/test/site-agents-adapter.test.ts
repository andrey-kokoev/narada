import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteAgentsAdapter, SiteAgentsApiError } from '../src/site-agents/adapter.ts';

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
