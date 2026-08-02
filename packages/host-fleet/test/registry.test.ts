import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HOST_FLEET_MEMBERSHIP_AUTHORITY_SCHEMA,
  HostFleetMembershipRefusal,
  createEmptyHostFleetReadModel,
  createHostFleetReadRegistry,
  type HostFleetAuthenticatedObservation,
} from '../src/index.js';

const SECRET = 'host-fleet-membership-secret-with-32-bytes';
const NOW = '2026-08-01T12:00:00.000Z';

function observation(hostId: string, proof = SECRET): HostFleetAuthenticatedObservation {
  return {
    host_fleet_membership_secret: proof,
    host: {
      identity: { host_id: hostId, display_name: hostId, platform: 'linux' },
      reachability: { status: 'reachable', observed_at: NOW, publisher_freshness: 'fresh', heartbeat_received_at: NOW },
      health: { status: 'healthy', reported_status: 'healthy', observed_at: NOW, detail: null },
      operator_console: { status: 'available', url: `https://${hostId}.example.test/console` },
    },
  };
}

function authority() {
  return {
    schema: HOST_FLEET_MEMBERSHIP_AUTHORITY_SCHEMA,
    scope: 'host' as const,
    host_fleet_membership_secret: SECRET,
  };
}

test('authenticated observations produce a deterministic read-only registry', async () => {
  const registry = createHostFleetReadRegistry({
    authority: authority(),
    observations: [observation('zima'), observation('desktop')],
    generated_at: NOW,
  });
  assert.deepEqual(Object.keys(registry), ['list']);
  const first = await registry.list();
  assert.deepEqual(first.hosts.map((host) => host.identity.host_id), ['desktop', 'zima']);
  assert.equal(JSON.stringify(first).includes(SECRET), false);

  first.hosts[0]!.identity.display_name = 'mutated caller copy';
  const second = await registry.list();
  assert.equal(second.hosts[0]!.identity.display_name, 'desktop');
});

test('invalid membership proof fails closed without secret disclosure', () => {
  assert.throws(
    () => createHostFleetReadRegistry({
      authority: authority(),
      observations: [observation('zima', 'different-membership-secret-that-is-long-enough')],
      generated_at: NOW,
    }),
    (error: unknown) => error instanceof HostFleetMembershipRefusal
      && !error.message.includes(SECRET),
  );
});

test('duplicate host identities are refused', () => {
  assert.throws(() => createHostFleetReadRegistry({
    authority: authority(),
    observations: [observation('zima'), observation('ZIMA')],
    generated_at: NOW,
  }), /host_fleet_host_duplicate/);
});

test('empty registry remains a valid read model', async () => {
  const registry = createEmptyHostFleetReadModel(() => new Date(NOW));
  assert.deepEqual(await registry.list(), {
    schema: 'narada.host_fleet.snapshot.v2',
    generated_at: NOW,
    hosts: [],
  });
});
