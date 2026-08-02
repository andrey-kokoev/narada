import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HOST_FLEET_HOST_SCHEMA,
  HOST_FLEET_HEARTBEAT_SCHEMA,
  HOST_FLEET_MEMBERSHIP_AUTHORITY_SCHEMA,
  HOST_FLEET_SNAPSHOT_SCHEMA,
  validateHostFleetAuthenticatedObservation,
  validateHostFleetHostInput,
  validateHostFleetHeartbeat,
  validateHostFleetReadResponse,
  validateHostFleetMembershipAuthority,
  validateHostFleetSnapshot,
  type HostFleetHostInput,
} from '../src/contract.js';

const NOW = '2026-08-01T12:00:00.000Z';
const SECRET = 'host-fleet-membership-secret-with-32-bytes';

function host(): HostFleetHostInput {
  return {
    identity: { host_id: 'Desktop-Sunroom-2', display_name: 'Desktop Sunroom', platform: 'windows' },
    reachability: { status: 'reachable', observed_at: NOW, publisher_freshness: 'fresh', heartbeat_received_at: NOW },
    health: { status: 'healthy', reported_status: 'healthy', observed_at: NOW, detail: null },
    operator_console: { status: 'available', url: 'https://desktop.example.test/console' },
  };
}

test('host contract exposes only identity, reachability, health, and console location', () => {
  const parsed = validateHostFleetHostInput(host());
  assert.deepEqual(Object.keys(parsed).sort(), ['health', 'identity', 'operator_console', 'reachability']);
  assert.deepEqual(Object.keys(parsed.identity).sort(), ['display_name', 'host_id', 'platform']);
  assert.equal(parsed.identity.host_id, 'desktop-sunroom-2');

  const snapshot = validateHostFleetSnapshot({
    schema: HOST_FLEET_SNAPSHOT_SCHEMA,
    generated_at: NOW,
    hosts: [{ schema: HOST_FLEET_HOST_SCHEMA, ...parsed }],
  });
  assert.deepEqual(Object.keys(snapshot).sort(), ['generated_at', 'hosts', 'schema']);
  assert.equal(snapshot.hosts.length, 1);
});

test('strict schemas reject every internal-host identity family at the Fleet boundary', () => {
  for (const key of ['site_id', 'sites', 'agent_id', 'agents', 'session_id', 'sessions', 'runtime_session_id']) {
    assert.throws(
      () => validateHostFleetHostInput({ ...host(), [key]: 'forbidden' }),
      /host_fleet_host_keys_invalid/,
      key,
    );
  }
  assert.throws(
    () => validateHostFleetHostInput({
      ...host(),
      identity: { ...host().identity, site_id: 'forbidden' },
    }),
    /host_fleet_identity_keys_invalid/,
  );
});

test('membership authority is host-scoped and its proof never enters a host projection', () => {
  const authority = validateHostFleetMembershipAuthority({
    schema: HOST_FLEET_MEMBERSHIP_AUTHORITY_SCHEMA,
    scope: 'host',
    host_fleet_membership_secret: SECRET,
  });
  assert.equal(authority.scope, 'host');
  assert.throws(() => validateHostFleetMembershipAuthority({
    schema: HOST_FLEET_MEMBERSHIP_AUTHORITY_SCHEMA,
    scope: 'site',
    host_fleet_membership_secret: SECRET,
  }), /host_fleet_membership_authority_scope_invalid/);
  assert.throws(() => validateHostFleetMembershipAuthority({
    schema: HOST_FLEET_MEMBERSHIP_AUTHORITY_SCHEMA,
    scope: 'host',
    host_fleet_membership_secret: SECRET,
    site_id: 'forbidden',
  }), /host_fleet_membership_authority_keys_invalid/);

  const observation = validateHostFleetAuthenticatedObservation({
    host: host(),
    host_fleet_membership_secret: SECRET,
  });
  assert.equal(JSON.stringify(observation.host).includes(SECRET), false);
});

test('host health, reachability, and console locations remain internally coherent', () => {
  assert.throws(() => validateHostFleetHostInput({
    ...host(),
    reachability: { status: 'reachable', observed_at: null, publisher_freshness: 'fresh', heartbeat_received_at: NOW },
  }), /host_fleet_reachability_observation_required/);
  assert.throws(() => validateHostFleetHostInput({
    ...host(),
    health: { status: 'healthy', reported_status: 'healthy', observed_at: null, detail: null },
  }), /host_fleet_health_observation_required/);
  assert.throws(() => validateHostFleetHostInput({
    ...host(),
    operator_console: { status: 'available', url: null },
  }), /host_fleet_operator_console_url_required/);
  assert.throws(() => validateHostFleetHostInput({
    ...host(),
    operator_console: { status: 'available', url: 'file:///etc/passwd' },
  }), /host_fleet_operator_console_url_invalid/);
});

test('heartbeat identity is explicitly Fleet-bound', () => {
  const heartbeat = validateHostFleetHeartbeat({
    schema: HOST_FLEET_HEARTBEAT_SCHEMA,
    fleet_id: 'Home',
    host_id: 'Zima',
    observed_at: NOW,
    health: { status: 'healthy', detail: null },
  });
  assert.equal(heartbeat.fleet_id, 'home');
  assert.equal(heartbeat.host_id, 'zima');
  assert.throws(() => validateHostFleetHeartbeat({
    schema: HOST_FLEET_HEARTBEAT_SCHEMA,
    host_id: 'zima',
    observed_at: NOW,
    health: { status: 'healthy', detail: null },
  }), /host_fleet_heartbeat_keys_invalid/);
});

test('readiness envelopes cannot mix ready and unavailable evidence', () => {
  assert.throws(() => validateHostFleetReadResponse({
    schema: 'narada.host_fleet.read_response.v1',
    runtime: {
      status: 'ready', authority_host_id: null, checked_at: NOW, detail_code: null, correlation_id: null,
    },
    snapshot: { schema: HOST_FLEET_SNAPSHOT_SCHEMA, generated_at: NOW, hosts: [] },
  }), /host_fleet_ready_runtime_incoherent/);
  assert.throws(() => validateHostFleetReadResponse({
    schema: 'narada.host_fleet.read_response.v1',
    runtime: {
      status: 'degraded', authority_host_id: 'desktop', checked_at: NOW,
      detail_code: 'host_fleet_runtime_unavailable', correlation_id: 'diagnostic-1',
    },
    snapshot: { schema: HOST_FLEET_SNAPSHOT_SCHEMA, generated_at: NOW, hosts: [] },
  }), /host_fleet_unavailable_runtime_incoherent/);
});
