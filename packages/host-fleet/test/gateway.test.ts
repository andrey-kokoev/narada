import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostRecord } from '../src/contract.ts';
import { createHostGatewayClient, resolveHostGatewayEnvironmentCredential } from '../src/gateway.ts';

const record = createHostRecord({
  host_id: 'zima-board-2',
  host_instance_id: 'instance-z',
  display_name: 'ZimaBoard 2',
  platform: 'linux',
  gateway: {
    endpoint: 'http://127.0.0.1:61730',
    transport: 'ssh-tunnel',
    admitted_paths: ['/health', '/console/routes', '/console/sessions/api/sessions'],
  },
  credential_ref: 'secret://narada/zima-gateway',
  admitted_sites: ['sonar'],
});

const dedicatedRecord = createHostRecord({
  host_id: 'zima-board-2',
  host_instance_id: 'instance-dedicated',
  display_name: 'ZimaBoard 2 dedicated gateway',
  platform: 'linux',
  gateway: {
    endpoint: 'http://127.0.0.1:61730',
    transport: 'ssh-tunnel',
    admitted_paths: ['/health'],
    credential: {
      schema: 'narada.host_fleet.gateway_credential.v1',
      class: 'dedicated_host_gateway',
      not_before: null,
      expires_at: '2026-08-01T12:00:00.000Z',
    },
  },
  credential_ref: 'secret://narada/zima-dedicated-gateway',
  admitted_sites: ['sonar'],
});

test('projects existing host-local gateway health into a qualified envelope', async () => {
  let request: Request | null = null;
  const client = createHostGatewayClient(record, {
    credential_resolver: () => 'runtime-secret-not-stored',
    now: () => '2026-07-31T12:00:00.000Z',
    fetch_fn: async (_input, init) => {
      request = new Request(String(_input), init);
      return new Response(JSON.stringify({
      schema: 'narada.operator_console_remote_gateway.health.v1',
      status: 'healthy',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const health = await client.health();
  assert.equal(health.schema, 'narada.host_fleet.gateway_health.v1');
  assert.equal(health.host.host_id, 'zima-board-2');
  assert.equal(health.status, 'online');
  assert.equal(health.gateway_schema, 'narada.operator_console_remote_gateway.health.v1');
  assert.equal(request?.headers.get('x-narada-host-id'), 'zima-board-2');
  assert.equal(request?.headers.get('x-narada-host-instance-id'), 'instance-z');
  assert.equal(request?.headers.get('x-narada-operator-console-bridge-token'), 'runtime-secret-not-stored');
});

test('uses the dedicated host gateway header and enforces its expiry', async () => {
  let request: Request | null = null;
  const client = createHostGatewayClient(dedicatedRecord, {
    credential_resolver: () => 'dedicated-secret',
    now: () => '2026-07-31T12:00:00.000Z',
    fetch_fn: async (_input, init) => {
      request = new Request(String(_input), init);
      return new Response(JSON.stringify({ status: 'healthy' }), { status: 200 });
    },
  });
  await client.health();
  assert.equal(request?.headers.get('x-narada-host-gateway-token'), 'dedicated-secret');
  assert.equal(request?.headers.get('x-narada-operator-console-bridge-token'), null);

  const expired = createHostGatewayClient(dedicatedRecord, {
    credential_resolver: () => 'dedicated-secret',
    now: () => '2026-08-01T12:00:00.000Z',
  });
  await assert.rejects(() => expired.requestJson('/health'), /host_gateway_credential_expired/);
});

test('emits bounded host-qualified request observations without payloads or credentials', async () => {
  const observations: Array<Record<string, unknown>> = [];
  const client = createHostGatewayClient(record, {
    credential_resolver: () => 'secret-that-must-not-be-observed',
    now: () => '2026-07-31T12:00:00.000Z',
    observe_request: (observation) => observations.push(observation),
    fetch_fn: async (_input, init) => {
      const request = new Request(String(_input), init);
      assert.match(request.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/u);
      return new Response(JSON.stringify({ status: 'healthy' }), { status: 200 });
    },
  });
  await client.health();
  assert.equal(observations.length, 1);
  assert.deepEqual(observations[0], {
    schema: 'narada.host_fleet.gateway_request_observation.v1',
    request_id: observations[0]?.request_id,
    host: { host_id: 'zima-board-2', host_instance_id: 'instance-z' },
    method: 'GET',
    path: '/health',
    status: 200,
    outcome: 'success',
    duration_ms: observations[0]?.duration_ms,
    reason: null,
    observed_at: '2026-07-31T12:00:00.000Z',
  });
  assert.doesNotMatch(JSON.stringify(observations), /secret-that-must-not-be-observed/u);
});

test('refuses paths that are not declared by the host gateway', async () => {
  const client = createHostGatewayClient(record, { credential_resolver: () => 'secret' });
  await assert.rejects(() => client.requestJson('/console/agents'), /host_gateway_path_not_admitted/);
});

test('projects gateway server errors as degraded rather than offline', async () => {
  const client = createHostGatewayClient(record, {
    credential_resolver: () => 'secret',
    fetch_fn: async () => new Response(JSON.stringify({ code: 'host_gateway_http_503' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    }),
  });
  const health = await client.health();
  assert.equal(health.status, 'degraded');
});

test('discovers sessions with host-qualified targets and preserves bounded refusals', async () => {
  const client = createHostGatewayClient(record, {
    credential_resolver: () => 'secret',
    now: () => '2026-07-31T12:00:00.000Z',
    fetch_fn: async (input, init) => {
      const request = new Request(String(input), init);
      assert.equal(request.url, 'http://127.0.0.1:61730/console/sessions/api/sessions');
      return new Response(JSON.stringify({
        schema: 'narada.operator_console.agent_sessions.v1',
        status: 'success',
        generated_at: '2026-07-31T12:00:00.000Z',
        count: 2,
        sessions: [
          {
            session_id: 'session-z',
            site_id: 'sonar',
            agent_id: 'resident',
            display_state: 'active',
            health_status: 'healthy',
            started_at: '2026-07-31T11:59:00.000Z',
            last_seen_at: '2026-07-31T12:00:00.000Z',
          },
          { session_id: 'malformed', site_id: 'sonar', display_state: 'active' },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const discovery = await client.sessions();
  assert.equal(discovery.status, 'success');
  assert.equal(discovery.sessions.length, 1);
  assert.equal(discovery.sessions[0]?.target.host_id, 'zima-board-2');
  assert.equal(discovery.sessions[0]?.target.runtime_session_id, 'session-z');
  assert.equal(discovery.refusals.length, 1);
  assert.equal(discovery.refusals[0]?.reason, 'host_session_record_invalid');
});

test('refuses malformed session discovery envelopes instead of guessing targets', async () => {
  const client = createHostGatewayClient(record, {
    credential_resolver: () => 'secret',
    fetch_fn: async () => new Response(JSON.stringify({ sessions: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  const discovery = await client.sessions();
  assert.equal(discovery.status, 'refused');
  assert.equal(discovery.sessions.length, 0);
  assert.equal(discovery.refusals[0]?.reason, 'host_session_discovery_contract_invalid');
});

test('does not project sessions for Sites outside the host admission list', async () => {
  const client = createHostGatewayClient(record, {
    credential_resolver: () => 'secret',
    fetch_fn: async () => new Response(JSON.stringify({
      schema: 'narada.operator_console.agent_sessions.v1',
      sessions: [{ session_id: 'other-session', site_id: 'other-site', agent_id: 'resident', display_state: 'active' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  const discovery = await client.sessions();
  assert.equal(discovery.status, 'refused');
  assert.equal(discovery.sessions.length, 0);
  assert.equal(discovery.refusals[0]?.reason, 'host_site_not_admitted');
});

test('does not allow request headers to override gateway identity or credentials', async () => {
  const client = createHostGatewayClient(record, { credential_resolver: () => 'secret' });
  await assert.rejects(
    () => client.requestJson('/console/routes', { headers: { 'x-narada-host-id': 'other-host' } }),
    /host_gateway_reserved_header_override/,
  );
});

test('rejects untrusted request identifiers and query-bearing observation paths', async () => {
  const client = createHostGatewayClient(record, { credential_resolver: () => 'secret', fetch_fn: async () => new Response('{}') });
  await assert.rejects(() => client.requestJson('/health', { request_id: 'bad id' }), /host_gateway_request_id_invalid/);
  await assert.rejects(() => client.requestJson('/health?token=secret'), /host_gateway_path_not_admitted/);
});

test('resolves documented env credential references without exposing the value in the reference', () => {
  const name = 'NARADA_HOST_FLEET_TEST_TOKEN';
  const previous = process.env[name];
  process.env[name] = 'test-secret';
  try {
    assert.equal(resolveHostGatewayEnvironmentCredential(`env://${name}`), 'test-secret');
    assert.equal(resolveHostGatewayEnvironmentCredential(`env:/${name}`), 'test-secret');
    assert.equal(resolveHostGatewayEnvironmentCredential(`env://${name}?unexpected=true`), null);
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
});
