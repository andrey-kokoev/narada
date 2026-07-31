import test from 'node:test';
import assert from 'node:assert/strict';
import Database from '@narada2/sqlite';
import { HostFleetRegistry } from '../src/registry.ts';

function input(instance = 'instance-a') {
  return {
    host_id: 'desktop-sunroom-2',
    host_instance_id: instance,
    display_name: 'Desktop Sunroom 2',
    platform: 'windows' as const,
    gateway: {
      endpoint: 'http://127.0.0.1:61730',
      transport: 'loopback' as const,
      admitted_paths: ['/health', '/console/routes'],
    },
    credential_ref: 'secret://narada/desktop-gateway',
  };
}

test('registers one host and preserves it across registry instances', () => {
  const db = new Database(':memory:');
  const first = new HostFleetRegistry(db);
  const registered = first.registerHost(input());
  assert.equal(registered.status, 'registered');
  assert.equal(first.listHosts().length, 1);
  const second = new HostFleetRegistry(db);
  assert.equal(second.getHost({ host_id: 'desktop-sunroom-2', host_instance_id: 'instance-a' })?.display_name, 'Desktop Sunroom 2');
  second.close();
});

test('does not create a new revision for an identical registration', () => {
  const db = new Database(':memory:');
  const registry = new HostFleetRegistry(db);
  const first = registry.registerHost(input());
  const second = registry.registerHost(input());
  assert.equal(first.host?.revision, 1);
  assert.equal(second.status, 'unchanged');
  assert.equal(second.mutation_performed, false);
  assert.equal(second.host?.revision, 1);
  registry.close();
});

test('refuses silent host-instance replacement and allows explicit reenrollment', () => {
  const db = new Database(':memory:');
  const registry = new HostFleetRegistry(db);
  registry.registerHost(input('instance-a'));
  const refused = registry.registerHost(input('instance-b'));
  assert.equal(refused.status, 'refused');
  assert.equal(refused.reason, 'host_instance_conflict_requires_explicit_reenrollment');
  const reenrolled = registry.registerHost(input('instance-b'), { allow_reenrollment: true });
  assert.equal(reenrolled.status, 'registered');
  assert.equal(registry.getHost({ host_id: 'desktop-sunroom-2', host_instance_id: 'instance-a' })?.lifecycle_state, 'retired');
  assert.equal(registry.getHost({ host_id: 'desktop-sunroom-2', host_instance_id: 'instance-b' })?.lifecycle_state, 'pending');
  registry.close();
});

test('health updates are host scoped and revocation blocks later probes', () => {
  const db = new Database(':memory:');
  const registry = new HostFleetRegistry(db);
  registry.registerHost(input());
  const updated = registry.updateHealth({ host_id: 'desktop-sunroom-2', host_instance_id: 'instance-a' }, {
    status: 'online',
    observed_at: '2026-07-31T12:00:00.000Z',
    detail: null,
    gateway_schema: 'narada.operator_console_remote_gateway.health.v1',
  });
  assert.equal(updated.host?.health.status, 'online');
  assert.equal(registry.revokeHost({ host_id: 'desktop-sunroom-2', host_instance_id: 'instance-a' }).status, 'revoked');
  const refused = registry.updateHealth({ host_id: 'desktop-sunroom-2', host_instance_id: 'instance-a' }, {
    status: 'online', observed_at: '2026-07-31T12:01:00.000Z', detail: null, gateway_schema: null,
  });
  assert.equal(refused.reason, 'host_revoked');
  registry.close();
});
