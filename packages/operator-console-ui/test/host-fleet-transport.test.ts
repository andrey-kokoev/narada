import assert from 'node:assert/strict';
import test from 'node:test';
import { createHostFleetAdapter } from '../src/host-fleet/adapter.ts';
import { createHostFleetTransport } from '../src/host-fleet/transport.ts';

const target = {
  hostId: 'zima-board-2',
  hostInstanceId: 'zima-instance-2026-07',
  siteId: 'sonar',
  agentId: 'resident',
  runtimeSessionId: 'session-zima',
};

function cloudflareHost() {
  return {
    host_id: target.hostId,
    host_instance_id: target.hostInstanceId,
    display_name: 'ZimaBoard 2',
    platform: 'linux',
    lifecycle_state: 'active',
    admitted_sites: ['sonar'],
    capabilities: ['sessions', 'events'],
    gateway: { transport: 'service-binding', admitted_path_count: 3 },
  };
}

function cloudflareSession() {
  return {
    target: {
      host_id: target.hostId,
      host_instance_id: target.hostInstanceId,
      site_id: target.siteId,
      agent_id: target.agentId,
      runtime_session_id: target.runtimeSessionId,
    },
    state: 'active',
    health_status: 'online',
    started_at: '2026-07-31T12:00:00.000Z',
    last_seen_at: '2026-07-31T12:01:00.000Z',
  };
}

test('Cloudflare Host Fleet transport uses its qualified route shape', async () => {
  const requests: string[] = [];
  const transport = createHostFleetTransport({
    basePath: '/api/narada/fleet/hosts',
    routeShape: 'cloudflare-projection',
  }, async (input) => {
    requests.push(input);
    const path = input.split('?')[0];
    const payload = path === '/api/narada/fleet/hosts'
      ? {
        schema: 'narada.cloudflare.host_fleet.overview.v1',
        status: 'success',
        generated_at: '2026-07-31T12:00:00.000Z',
        registry_revision: 7,
        count: 1,
        hosts: [cloudflareHost()],
        refusals: [],
      }
      : path.endsWith('/sessions')
        ? {
          schema: 'narada.cloudflare.host_fleet.sessions.v1',
          status: 'success',
          generated_at: '2026-07-31T12:00:00.000Z',
          host: cloudflareHost(),
          count: 1,
          sessions: [cloudflareSession()],
          refusals: [],
        }
        : path.endsWith('/health')
          ? {
            schema: 'narada.host_fleet.gateway_health.v1',
            host: { host_id: target.hostId, host_instance_id: target.hostInstanceId },
            status: 'online',
            observed_at: '2026-07-31T12:02:00.000Z',
            detail: null,
          }
        : { status: 'success' };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  await transport.list();
  await transport.sessions?.();
  await transport.resolveTarget?.(target);
  assert.equal(transport.hostConsolePath?.(target), null);

  assert.deepEqual(requests, [
    '/api/narada/fleet/hosts',
    '/api/narada/fleet/hosts/zima-board-2/zima-instance-2026-07/health',
    '/api/narada/fleet/hosts',
    '/api/narada/fleet/hosts/zima-board-2/zima-instance-2026-07/sessions',
    '/api/narada/fleet/hosts/zima-board-2/zima-instance-2026-07/target?site_id=sonar&agent_id=resident&runtime_session_id=session-zima',
  ]);
  const overview = await transport.list();
  assert.equal((overview as { hosts: Array<{ health: { status: string } }> }).hosts[0]?.health.status, 'online');
});

test('local Host Fleet transport refreshes host health through the same qualified route shape', async () => {
  const requests: string[] = [];
  const transport = createHostFleetTransport('/console/hosts/api', async (input) => {
    requests.push(input);
    const path = input.split('?')[0];
    const payload = path === '/console/hosts/api'
      ? {
        schema: 'narada.operator_console.host_fleet.v1',
        status: 'success',
        generated_at: '2026-07-31T12:00:00.000Z',
        count: 1,
        hosts: [{
          host_id: target.hostId,
          host_instance_id: target.hostInstanceId,
          display_name: 'ZimaBoard 2',
          platform: 'linux',
          gateway: { transport: 'ssh-tunnel', admitted_path_count: 3 },
          capabilities: ['sessions', 'events'],
          admitted_sites: ['sonar'],
          lifecycle_state: 'active',
          health: { status: 'unknown', observed_at: null, detail: null },
          last_seen_at: null,
          revision: 2,
        }],
        refusals: [],
      }
      : {
        schema: 'narada.host_fleet.gateway_health.v1',
        host: { host_id: target.hostId, host_instance_id: target.hostInstanceId },
        status: 'online',
        observed_at: '2026-07-31T12:02:00.000Z',
        gateway_schema: 'narada.operator_console_remote_gateway.health.v1',
        detail: null,
      };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  const overview = await createHostFleetAdapter(transport).list();
  assert.equal(overview.hosts[0]?.healthStatus, 'online');
  assert.equal(transport.hostConsolePath?.(target), '/console/hosts/api/zima-board-2/zima-instance-2026-07/console/');
  assert.deepEqual(requests, [
    '/console/hosts/api',
    '/console/hosts/api/zima-board-2/zima-instance-2026-07/health',
  ]);
});

test('adapter normalizes Cloudflare Host Fleet envelopes and preserves qualified identity', async () => {
  const client = createHostFleetAdapter({
    list: async () => ({
      schema: 'narada.cloudflare.host_fleet.overview.v1',
      status: 'success',
      generated_at: '2026-07-31T12:00:00.000Z',
      registry_revision: 7,
      count: 1,
      hosts: [cloudflareHost()],
      refusals: [],
    }),
    sessions: async () => ({
      schema: 'narada.cloudflare.host_fleet.sessions.v1',
      status: 'success',
      generated_at: '2026-07-31T12:01:00.000Z',
      host: cloudflareHost(),
      count: 1,
      sessions: [cloudflareSession()],
      refusals: [],
    }),
    resolveTarget: async () => ({
      schema: 'narada.cloudflare.host_fleet.target.v1',
      status: 'resolved',
      generated_at: '2026-07-31T12:01:00.000Z',
      target: cloudflareSession().target,
      session: cloudflareSession(),
      refusal: null,
    }),
    openEvents: () => { throw new Error('not used'); },
  });

  const overview = await client.list();
  const sessions = await client.sessions();
  const resolution = await client.resolveTarget(target);

  assert.equal(overview.hosts[0]?.hostId, target.hostId);
  assert.equal(overview.hosts[0]?.healthStatus, 'unknown');
  assert.equal(overview.hosts[0]?.revision, 7);
  assert.equal(sessions.hosts[0]?.sessions[0]?.target.runtimeSessionId, target.runtimeSessionId);
  assert.equal(resolution.target?.hostInstanceId, target.hostInstanceId);
});

test('adapter keeps Cloudflare refusal reasons typed at the boundary', async () => {
  const client = createHostFleetAdapter({
    list: async () => ({
      schema: 'narada.host_fleet.refusal.v1',
      status: 'refused',
      reason: 'host_fleet_registry_schema_invalid',
    }),
    sessions: async () => ({
      schema: 'narada.host_fleet.refusal.v1',
      status: 'refused',
      reason: 'host_not_registered',
    }),
    resolveTarget: async () => ({
      schema: 'narada.host_fleet.refusal.v1',
      status: 'refused',
      reason: 'runtime_target_not_found_or_ambiguous',
    }),
    openEvents: () => { throw new Error('not used'); },
  });

  await assert.rejects(() => client.list(), /Host Fleet refused the list request/);
  await assert.rejects(
    () => client.sessions(),
    (error: unknown) => error instanceof Error
      && error.message.includes('host_not_registered')
      && (error as { refusals?: string[] }).refusals?.includes('host_not_registered') === true,
  );
  await assert.rejects(() => client.resolveTarget(target), /runtime_target_not_found_or_ambiguous/);
});

test('local Host Fleet mutation transport sends explicit confirmation envelope', async () => {
  let requestPath = '';
  let requestInit: RequestInit | undefined;
  const transport = createHostFleetTransport({ basePath: '/console/hosts/api', routeShape: 'local-console' }, async (input, init) => {
    requestPath = input;
    requestInit = init;
    return new Response(JSON.stringify({
      schema: 'narada.host_fleet.lifecycle_result.v1',
      status: 'applied',
      mutation_performed: true,
      request_id: 'host-lifecycle:test',
      operation: 'revoke',
      host: { host_id: target.hostId, host_instance_id: target.hostInstanceId },
      lifecycle_state: 'revoked',
      revision: 3,
      reason: null,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  assert.equal(transport.mutationScope, 'local-authority');
  await transport.applyLifecycle?.({
    schema: 'narada.host_fleet.lifecycle_intent.v1',
    request_id: 'host-lifecycle:test',
    operation: 'revoke',
    host: { host_id: target.hostId, host_instance_id: target.hostInstanceId },
    expected_revision: 2,
    confirmation: `${target.hostId}@${target.hostInstanceId}`,
    reason: 'operator test',
  }, 'operator-console.test');

  assert.equal(requestPath, '/console/hosts/api/lifecycle');
  assert.equal(requestInit?.method, 'POST');
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    intent: {
      schema: 'narada.host_fleet.lifecycle_intent.v1',
      request_id: 'host-lifecycle:test',
      operation: 'revoke',
      host: { host_id: target.hostId, host_instance_id: target.hostInstanceId },
      expected_revision: 2,
      confirmation: `${target.hostId}@${target.hostInstanceId}`,
      reason: 'operator test',
    },
    actor: 'operator-console.test',
    operator_confirmed: true,
  });
});

test('Cloudflare Host Fleet mutation transport fails closed without a network request', async () => {
  let requestCount = 0;
  const transport = createHostFleetTransport({ basePath: '/api/narada/fleet/hosts', routeShape: 'cloudflare-projection' }, async () => {
    requestCount += 1;
    return new Response('{}');
  });
  const intent = {
    schema: 'narada.host_fleet.lifecycle_intent.v1' as const,
    request_id: 'host-lifecycle:cloudflare',
    operation: 'retire' as const,
    host: { host_id: target.hostId, host_instance_id: target.hostInstanceId },
    expected_revision: 2,
    confirmation: `${target.hostId}@${target.hostInstanceId}`,
    reason: null,
  };

  assert.equal(transport.mutationScope, 'projection-only');
  const result = await transport.applyLifecycle?.(intent, 'operator-console.test');
  assert.equal(requestCount, 0);
  assert.equal((result as { status: string }).status, 'refused');
  assert.equal((result as { reason: string }).reason, 'host_fleet_authority_local_only');
});

test('lifecycle preflight stays a non-mutating qualified GET on both route shapes', async () => {
  const intent = {
    schema: 'narada.host_fleet.lifecycle_intent.v1' as const,
    request_id: 'host-lifecycle:preflight',
    operation: 'retire' as const,
    host: { host_id: target.hostId, host_instance_id: target.hostInstanceId },
    expected_revision: 4,
    confirmation: `${target.hostId}@${target.hostInstanceId}`,
    reason: 'planned maintenance',
  };
  const requests: string[] = [];
  const fetchLike = async (input: string, init?: RequestInit) => {
    requests.push(`${init?.method ?? 'GET'} ${input}`);
    return new Response(JSON.stringify({
      schema: 'narada.host_fleet.lifecycle_preflight.v1',
      status: 'ready',
      mutation_performed: false,
      intent,
      current_revision: 4,
      current_lifecycle_state: 'active',
      refusals: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const local = createHostFleetTransport({ basePath: '/console/hosts/api', routeShape: 'local-console' }, fetchLike);
  const cloudflare = createHostFleetTransport({ basePath: '/api/narada/fleet/hosts', routeShape: 'cloudflare-projection' }, fetchLike);
  await local.preflightLifecycle?.(intent);
  await cloudflare.preflightLifecycle?.(intent);
  assert.match(requests[0]!, /^GET \/console\/hosts\/api\/lifecycle\/preflight\?/);
  assert.match(requests[1]!, /^GET \/api\/narada\/fleet\/hosts\/lifecycle\/preflight\?/);
  assert.equal(requests[0]?.includes('expected_revision=4'), true);
  assert.equal(requests[1]?.includes('operation=retire'), true);
});
