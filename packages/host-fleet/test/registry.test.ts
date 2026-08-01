import test from 'node:test';
import assert from 'node:assert/strict';
import Database from '@narada-core/sqlite';
import {
  HOST_FLEET_ENROLLMENT_INTENT_SCHEMA,
  HOST_FLEET_CREDENTIAL_ROLLBACK_INTENT_SCHEMA,
  HOST_FLEET_CREDENTIAL_ROTATION_INTENT_SCHEMA,
  HOST_FLEET_LAUNCH_INTENT_SCHEMA,
  HOST_FLEET_LIFECYCLE_INTENT_SCHEMA,
  hostKey,
} from '../src/contract.ts';
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
  assert.equal(second.getHost({ host_id: 'desktop-sunroom-2', host_instance_id: 'instance-a' })?.gateway.credential.class, 'bridge_compatibility');
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

test('stores bounded gateway observations separately from mutation audit', () => {
  const db = new Database(':memory:');
  const registry = new HostFleetRegistry(db);
  registry.registerHost(input());
  registry.recordGatewayObservation({
    schema: 'narada.host_fleet.gateway_request_observation.v1',
    request_id: 'request-1',
    host: { host_id: 'desktop-sunroom-2', host_instance_id: 'instance-a' },
    method: 'GET',
    path: '/console/sessions/api/sessions',
    status: 200,
    outcome: 'success',
    duration_ms: 42,
    reason: null,
    observed_at: '2026-07-31T12:00:00.000Z',
  });
  assert.deepEqual(registry.listGatewayObservations(), [
    {
      schema: 'narada.host_fleet.gateway_request_observation.v1',
      request_id: 'request-1',
      host: { host_id: 'desktop-sunroom-2', host_instance_id: 'instance-a' },
      method: 'GET',
      path: '/console/sessions/api/sessions',
      status: 200,
      outcome: 'success',
      duration_ms: 42,
      reason: null,
      observed_at: '2026-07-31T12:00:00.000Z',
    },
  ]);
  assert.equal(registry.listAudit().every((entry) => entry.operation !== 'health_update'), true);
  registry.close();
});

test('applies, durably replays, and fences lifecycle intents', () => {
  const db = new Database(':memory:');
  const registry = new HostFleetRegistry(db);
  const registered = registry.registerHost(input());
  const key = { host_id: 'desktop-sunroom-2', host_instance_id: 'instance-a' };
  const intent = {
    schema: HOST_FLEET_LIFECYCLE_INTENT_SCHEMA,
    request_id: 'lifecycle-revoke-1',
    operation: 'revoke',
    host: key,
    expected_revision: registered.host?.revision ?? 0,
    confirmation: hostKey(key),
    reason: 'operator_test',
  };

  const applied = registry.applyLifecycleIntent(intent, { actor: 'operator-console' });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.mutation_performed, true);
  assert.equal(applied.revision, 2);
  assert.equal(registry.getHost(key)?.lifecycle_state, 'revoked');
  const audit = registry.listAudit().find((entry) => entry.request_id === 'lifecycle-revoke-1');
  assert.equal(audit?.operation, 'revoke');
  assert.equal(audit?.request_id, 'lifecycle-revoke-1');
  assert.equal(audit?.actor, 'operator-console');
  assert.equal(audit?.status, 'applied');

  const replayed = registry.applyLifecycleIntent(intent, { actor: 'different-actor' });
  assert.equal(replayed.status, 'replayed');
  assert.equal(replayed.mutation_performed, false);
  assert.equal(registry.getHost(key)?.revision, 2);

  const conflict = registry.applyLifecycleIntent({ ...intent, reason: 'different-intent' });
  assert.equal(conflict.status, 'refused');
  assert.equal(conflict.reason, 'intent_request_id_conflict');
  assert.equal(registry.getHost(key)?.revision, 2);
  registry.close();
});

test('refuses stale lifecycle intents and replays the durable refusal', () => {
  const db = new Database(':memory:');
  const registry = new HostFleetRegistry(db);
  registry.registerHost(input());
  const key = { host_id: 'desktop-sunroom-2', host_instance_id: 'instance-a' };
  const intent = {
    schema: HOST_FLEET_LIFECYCLE_INTENT_SCHEMA,
    request_id: 'lifecycle-stale-1',
    operation: 'retire',
    host: key,
    expected_revision: 99,
    confirmation: hostKey(key),
    reason: 'stale_operator_view',
  };

  const refused = registry.applyLifecycleIntent(intent);
  assert.equal(refused.status, 'refused');
  assert.equal(refused.mutation_performed, false);
  assert.equal(refused.reason, 'host_revision_conflict');
  assert.equal(registry.getHost(key)?.lifecycle_state, 'pending');
  const replayed = registry.applyLifecycleIntent(intent);
  assert.equal(replayed.status, 'replayed');
  assert.equal(replayed.mutation_performed, false);
  assert.equal(registry.getHost(key)?.revision, 1);
  registry.close();
});

test('applies and durably replays enrollment intents without storing raw credentials', () => {
  const db = new Database(':memory:');
  const registry = new HostFleetRegistry(db);
  const candidate = input('instance-enrollment');
  const intent = {
    schema: HOST_FLEET_ENROLLMENT_INTENT_SCHEMA,
    request_id: 'enrollment-1',
    host: candidate,
    expected_revision: null,
    allow_reenrollment: false,
    confirmation: `${candidate.host_id}@${candidate.host_instance_id}`,
  };

  const applied = registry.applyEnrollmentIntent(intent, { actor: 'operator-console' });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.mutation_performed, true);
  assert.equal(applied.host?.host_instance_id, 'instance-enrollment');
  assert.equal(registry.getHost({ host_id: candidate.host_id, host_instance_id: candidate.host_instance_id })?.credential_ref, candidate.credential_ref);

  const replayed = registry.applyEnrollmentIntent(intent);
  assert.equal(replayed.status, 'replayed');
  assert.equal(replayed.mutation_performed, false);

  const conflict = registry.applyEnrollmentIntent({ ...intent, allow_reenrollment: true });
  assert.equal(conflict.status, 'refused');
  assert.equal(conflict.reason, 'intent_request_id_conflict');

  const raw = JSON.stringify({ audits: registry.listAudit(), hosts: registry.listHosts() });
  assert.equal(raw.includes('secret://narada/desktop-gateway'), true);
  assert.equal(raw.includes('secret-value'), false);
  assert.equal(JSON.stringify(registry.listAudit()).includes(candidate.credential_ref), false);
  registry.close();
});

test('applies and durably replays revision-checked credential rotation without storing a secret', () => {
  const db = new Database(':memory:');
  const registry = new HostFleetRegistry(db);
  const registered = registry.registerHost(input());
  const key = { host_id: 'desktop-sunroom-2', host_instance_id: 'instance-a' };
  const intent = {
    schema: HOST_FLEET_CREDENTIAL_ROTATION_INTENT_SCHEMA,
    request_id: 'credential-rotate-1',
    host: key,
    expected_revision: registered.host?.revision ?? 0,
    credential_ref: 'secret://narada/desktop-gateway-v2',
    credential: {
      schema: 'narada.host_fleet.gateway_credential.v1',
      class: 'dedicated_host_gateway',
      not_before: '2026-07-31T12:00:00.000Z',
      expires_at: '2026-08-31T12:00:00.000Z',
    },
    confirmation: hostKey(key),
  };
  const applied = registry.applyCredentialRotationIntent(intent, { actor: 'operator-console' });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.mutation_performed, true);
  assert.equal(applied.revision, 2);
  assert.equal(registry.getHost(key)?.credential_ref, 'secret://narada/desktop-gateway-v2');
  assert.equal(registry.getHost(key)?.gateway.credential.class, 'dedicated_host_gateway');
  assert.equal(JSON.stringify(registry.listAudit()).includes('secret-value'), false);
  const replayed = registry.applyCredentialRotationIntent(intent, { actor: 'different-actor' });
  assert.equal(replayed.status, 'replayed');
  assert.equal(replayed.mutation_performed, false);
  assert.equal(registry.getHost(key)?.revision, 2);
  registry.close();
});

test('rolls back to a revision-backed credential policy and durably replays the rollback', () => {
  const db = new Database(':memory:');
  const registry = new HostFleetRegistry(db);
  const registered = registry.registerHost(input());
  const key = { host_id: 'desktop-sunroom-2', host_instance_id: 'instance-a' };
  const rotation = {
    schema: HOST_FLEET_CREDENTIAL_ROTATION_INTENT_SCHEMA,
    request_id: 'credential-rotate-for-rollback',
    host: key,
    expected_revision: registered.host?.revision ?? 0,
    credential_ref: 'secret://narada/desktop-gateway-v2',
    credential: {
      schema: 'narada.host_fleet.gateway_credential.v1' as const,
      class: 'dedicated_host_gateway' as const,
      not_before: null,
      expires_at: '2026-12-31T00:00:00.000Z',
    },
    confirmation: hostKey(key),
  };
  assert.equal(registry.applyCredentialRotationIntent(rotation).status, 'applied');
  assert.deepEqual(registry.listCredentialHistory(key).map((entry) => entry.revision), [2, 1]);

  const rollback = {
    schema: HOST_FLEET_CREDENTIAL_ROLLBACK_INTENT_SCHEMA,
    request_id: 'credential-rollback-1',
    host: key,
    expected_revision: 2,
    rollback_to_revision: 1,
    confirmation: hostKey(key),
  };
  const applied = registry.applyCredentialRollbackIntent(rollback, { actor: 'operator-console' });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.mutation_performed, true);
  assert.equal(applied.restored_from_revision, 1);
  assert.equal(applied.revision, 3);
  assert.equal(registry.getHost(key)?.credential_ref, 'secret://narada/desktop-gateway');
  assert.equal(registry.getHost(key)?.gateway.credential.class, 'bridge_compatibility');
  assert.equal(registry.listAudit({ host: key }).some((entry) => entry.operation === 'credential_rollback' && entry.status === 'applied'), true);

  const replayed = registry.applyCredentialRollbackIntent(rollback, { actor: 'different-actor' });
  assert.equal(replayed.status, 'replayed');
  assert.equal(replayed.mutation_performed, false);
  assert.equal(registry.getHost(key)?.revision, 3);
  registry.close();
});

test('records exact-host launch results with durable replay and launch audit', () => {
  const db = new Database(':memory:');
  const registry = new HostFleetRegistry(db);
  const registered = registry.registerHost({ ...input(), admitted_sites: ['sonar'] });
  const key = { host_id: 'desktop-sunroom-2', host_instance_id: 'instance-a' };
  const intent = {
    schema: HOST_FLEET_LAUNCH_INTENT_SCHEMA,
    request_id: 'host-launch-1',
    host: key,
    expected_revision: registered.host?.revision ?? 0,
    site_id: 'sonar',
    agent_id: 'resident',
    operator_surface: 'agent-web-ui',
    confirmation: hostKey(key),
  };
  assert.equal(registry.getLaunchIntentResult(intent), null);
  const result = registry.recordLaunchIntentResult(intent, {
    schema: 'narada.host_fleet.launch_result.v1',
    status: 'launched',
    mutation_performed: true,
    request_id: intent.request_id,
    host: key,
    site_id: intent.site_id,
    agent_id: intent.agent_id,
    operator_surface: intent.operator_surface,
    session_id: 'carrier-host-launch-1',
    reason: null,
  }, { actor: 'operator-console' });
  assert.equal(result.status, 'launched');
  assert.equal(result.session_id, 'carrier-host-launch-1');
  const replay = registry.getLaunchIntentResult(intent);
  assert.equal(replay?.status, 'replayed');
  assert.equal(replay?.mutation_performed, false);
  const audit = registry.listAudit().find((entry) => entry.request_id === intent.request_id);
  assert.equal(audit?.operation, 'launch');
  assert.equal(audit?.status, 'applied');
  registry.close();
});
