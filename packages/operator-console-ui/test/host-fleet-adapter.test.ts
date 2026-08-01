import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostFleetAdapter } from '../src/host-fleet/adapter.ts';

test('host fleet adapter preserves qualified host identity and bounded health state', async () => {
  const client = createHostFleetAdapter({
    list: async () => ({
      schema: 'narada.operator_console.host_fleet.v1',
      status: 'success',
      generated_at: '2026-07-31T12:00:00.000Z',
      count: 1,
      refusals: [],
      hosts: [{
        host_id: 'zima-board-2',
        host_instance_id: 'instance-z',
        display_name: 'ZimaBoard 2',
        platform: 'linux',
        narada_version: '0.1.0',
        gateway: { transport: 'ssh-tunnel', admitted_path_count: 2 },
        capabilities: ['operator-console'],
        admitted_sites: ['sonar'],
        lifecycle_state: 'active',
        health: { status: 'online', observed_at: '2026-07-31T11:59:00.000Z', detail: null },
        created_at: '2026-07-31T11:00:00.000Z',
        updated_at: '2026-07-31T11:59:00.000Z',
        last_seen_at: '2026-07-31T11:59:00.000Z',
        revision: 2,
      }],
    }),
  });
  await assert.doesNotReject(async () => {
    const overview = await client.list();
    assert.equal(overview.hosts[0]?.hostId, 'zima-board-2');
    assert.equal(overview.hosts[0]?.hostInstanceId, 'instance-z');
    assert.equal(overview.hosts[0]?.healthStatus, 'online');
  });
});

test('host fleet adapter refuses malformed and refused projections', async () => {
  await assert.rejects(
    () => createHostFleetAdapter({ list: async () => ({ schema: 'wrong' }) }).list(),
    /did not match its contract/,
  );
  await assert.rejects(
    () => createHostFleetAdapter({
      list: async () => ({
        schema: 'narada.operator_console.host_fleet.v1',
        status: 'refused',
        generated_at: '2026-07-31T12:00:00.000Z',
        count: 0,
        hosts: [],
        refusals: ['host_fleet_registry_unavailable'],
      }),
    }).list(),
    (error: unknown) => error instanceof Error
      && error.message.includes('Host Fleet refused')
      && 'refusals' in error
      && (error as { refusals: string[] }).refusals[0] === 'host_fleet_registry_unavailable',
  );
});

test('host fleet adapter parses host-scoped sessions and preserves exact target identity', async () => {
  const client = createHostFleetAdapter({
    list: async () => ({ schema: 'narada.operator_console.host_fleet.v1', status: 'success', generated_at: '2026-07-31T12:00:00.000Z', count: 0, hosts: [], refusals: [] }),
    sessions: async () => ({
      schema: 'narada.operator_console.host_fleet_sessions.v1',
      status: 'success',
      generated_at: '2026-07-31T12:00:00.000Z',
      count: 1,
      refusals: [],
      hosts: [{
        host: { host_id: 'zima-board-2', host_instance_id: 'instance-z', display_name: 'ZimaBoard 2', platform: 'linux', lifecycle_state: 'active' },
        status: 'success',
        sessions: [{
          target: { host_id: 'zima-board-2', host_instance_id: 'instance-z', site_id: 'sonar', agent_id: 'resident', runtime_session_id: 'session-z' },
          state: 'active',
          health_status: 'online',
          started_at: '2026-07-31T11:59:00.000Z',
          last_seen_at: '2026-07-31T12:00:00.000Z',
        }],
        refusals: [],
      }],
    }),
    resolveTarget: async () => ({
      schema: 'narada.operator_console.host_fleet_target.v1',
      status: 'resolved',
      target: { host_id: 'zima-board-2', host_instance_id: 'instance-z', site_id: 'sonar', agent_id: 'resident', runtime_session_id: 'session-z' },
      session: { target: { host_id: 'zima-board-2', host_instance_id: 'instance-z', site_id: 'sonar', agent_id: 'resident', runtime_session_id: 'session-z' }, state: 'active', health_status: 'online', started_at: null, last_seen_at: null },
      refusal: null,
    }),
    openEvents: () => { throw new Error('not used'); },
  });
  const sessions = await client.sessions();
  assert.equal(sessions.hosts[0]?.sessions[0]?.target.hostId, 'zima-board-2');
  assert.equal(sessions.hosts[0]?.sessions[0]?.target.runtimeSessionId, 'session-z');
  const resolution = await client.resolveTarget(sessions.hosts[0]!.sessions[0]!.target);
  assert.equal(resolution.target?.hostInstanceId, 'instance-z');
});

test('host fleet adapter exposes typed target refusal instead of inventing a session', async () => {
  const client = createHostFleetAdapter({
    list: async () => ({ schema: 'narada.operator_console.host_fleet.v1', status: 'success', generated_at: '2026-07-31T12:00:00.000Z', count: 0, hosts: [], refusals: [] }),
    sessions: async () => ({ schema: 'narada.operator_console.host_fleet_sessions.v1', status: 'success', generated_at: '2026-07-31T12:00:00.000Z', count: 0, hosts: [], refusals: [] }),
    resolveTarget: async () => ({ schema: 'narada.operator_console.host_fleet_target.v1', status: 'refused', target: null, session: null, refusal: 'runtime_target_ambiguous' }),
    openEvents: () => { throw new Error('not used'); },
  });
  await assert.rejects(() => client.resolveTarget({ hostId: 'zima-board-2', hostInstanceId: 'instance-z', siteId: 'sonar', agentId: 'resident', runtimeSessionId: 'session-z' }), /runtime_target_ambiguous/);
});
