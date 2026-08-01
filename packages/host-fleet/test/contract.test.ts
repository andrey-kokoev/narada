import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOST_GATEWAY_CREDENTIAL_SCHEMA,
  HOST_FLEET_ENROLLMENT_INTENT_SCHEMA,
  HOST_FLEET_LIFECYCLE_INTENT_SCHEMA,
  HOST_FLEET_LAUNCH_INTENT_SCHEMA,
  HOST_FLEET_CREDENTIAL_ROTATION_INTENT_SCHEMA,
  HOST_RECORD_SCHEMA,
  createHostRecord,
  hostKey,
  preflightHostFleetEnrollmentIntent,
  preflightHostFleetLifecycleIntent,
  preflightHostFleetLaunchIntent,
  preflightHostFleetCredentialRotationIntent,
  qualifyEvent,
  validateRuntimeTarget,
} from '../src/index.ts';

const input = {
  host_id: 'desktop-sunroom-2',
  host_instance_id: 'instance-a',
  display_name: 'Desktop Sunroom 2',
  platform: 'windows' as const,
  gateway: {
    endpoint: 'http://127.0.0.1:61730',
    transport: 'loopback' as const,
    admitted_paths: ['/health', '/console/routes', '/console/sessions/api/sessions'],
  },
  credential_ref: 'secret://narada/desktop-gateway',
};

test('creates a host record with qualified identity and no raw secret value', () => {
  const record = createHostRecord(input, new Date('2026-07-31T12:00:00.000Z'));
  assert.equal(record.schema, HOST_RECORD_SCHEMA);
  assert.equal(hostKey(record), 'desktop-sunroom-2@instance-a');
  assert.equal(record.credential_ref, 'secret://narada/desktop-gateway');
  assert.equal(record.health.status, 'unknown');
  assert.deepEqual(record.gateway.credential, {
    schema: HOST_GATEWAY_CREDENTIAL_SCHEMA,
    class: 'bridge_compatibility',
    not_before: null,
    expires_at: null,
  });
});

test('accepts an explicit dedicated gateway credential policy and validates its lifetime', () => {
  const record = createHostRecord({
    ...input,
    gateway: {
      ...input.gateway,
      credential: {
        schema: HOST_GATEWAY_CREDENTIAL_SCHEMA,
        class: 'dedicated_host_gateway',
        not_before: '2026-07-31T12:00:00.000Z',
        expires_at: '2026-08-01T12:00:00.000Z',
      },
    },
  }, new Date('2026-07-31T12:00:00.000Z'));
  assert.equal(record.gateway.credential.class, 'dedicated_host_gateway');
  assert.throws(() => createHostRecord({
    ...input,
    gateway: {
      ...input.gateway,
      credential: {
        schema: HOST_GATEWAY_CREDENTIAL_SCHEMA,
        class: 'dedicated_host_gateway',
        not_before: '2026-08-01T12:00:00.000Z',
        expires_at: '2026-07-31T12:00:00.000Z',
      },
    },
  }), /host_gateway_credential_expiry_order_invalid/);
});

test('rejects a non-loopback endpoint for a loopback transport', () => {
  assert.throws(() => createHostRecord({
    ...input,
    gateway: { ...input.gateway, endpoint: 'http://192.168.1.20:61730' },
  }), /host_gateway_loopback_required/);
});

test('preflights a lifecycle intent without mutating the current host record', () => {
  const record = createHostRecord(input);
  const preflight = preflightHostFleetLifecycleIntent({
    schema: HOST_FLEET_LIFECYCLE_INTENT_SCHEMA,
    request_id: 'request-revoke-desktop-1',
    operation: 'revoke',
    host: { host_id: record.host_id, host_instance_id: record.host_instance_id },
    expected_revision: record.revision,
    confirmation: hostKey(record),
    reason: 'operator_test',
  }, record);
  assert.equal(preflight.status, 'ready');
  assert.equal(preflight.mutation_performed, false);
  assert.deepEqual(preflight.intent?.host, { host_id: 'desktop-sunroom-2', host_instance_id: 'instance-a' });
  assert.equal(record.lifecycle_state, 'pending');
});

test('refuses stale lifecycle intent revisions and mismatched confirmation', () => {
  const record = createHostRecord(input);
  const stale = preflightHostFleetLifecycleIntent({
    schema: HOST_FLEET_LIFECYCLE_INTENT_SCHEMA,
    request_id: 'request-revoke-desktop-stale',
    operation: 'revoke',
    host: { host_id: record.host_id, host_instance_id: record.host_instance_id },
    expected_revision: record.revision + 1,
    confirmation: hostKey(record),
    reason: null,
  }, record);
  assert.deepEqual(stale.refusals, ['host_revision_conflict']);

  const confirmation = preflightHostFleetLifecycleIntent({
    schema: HOST_FLEET_LIFECYCLE_INTENT_SCHEMA,
    request_id: 'request-revoke-desktop-confirmation',
    operation: 'revoke',
    host: { host_id: record.host_id, host_instance_id: record.host_instance_id },
    expected_revision: record.revision,
    confirmation: 'other-host@other-instance',
    reason: null,
  }, record);
  assert.deepEqual(confirmation.refusals, ['host_lifecycle_confirmation_invalid']);
});

test('preflights enrollment with explicit reenrollment and revision fencing', () => {
  const record = createHostRecord(input);
  const candidate = {
    ...input,
    host_instance_id: 'instance-b',
    display_name: 'Desktop Sunroom 2 replacement',
  };
  const intent = {
    schema: HOST_FLEET_ENROLLMENT_INTENT_SCHEMA,
    request_id: 'request-enroll-desktop-1',
    host: candidate,
    expected_revision: null,
    allow_reenrollment: false,
    confirmation: 'desktop-sunroom-2@instance-b',
  };
  const refused = preflightHostFleetEnrollmentIntent(intent, record);
  assert.equal(refused.status, 'refused');
  assert.deepEqual(refused.refusals, ['host_instance_conflict_requires_explicit_reenrollment']);
  assert.equal(refused.mutation_performed, false);

  const reenrollment = preflightHostFleetEnrollmentIntent({ ...intent, allow_reenrollment: true }, record);
  assert.equal(reenrollment.status, 'ready');
  assert.equal(reenrollment.mutation_performed, false);

  const stale = preflightHostFleetEnrollmentIntent({
    ...intent,
    host: input,
    expected_revision: record.revision + 1,
    confirmation: hostKey(record),
  }, record);
  assert.deepEqual(stale.refusals, ['host_revision_conflict']);
});

test('preflights exact-host launch without crossing a gateway or mutating the record', () => {
  const record = createHostRecord({ ...input, admitted_sites: ['sonar'] });
  const preflight = preflightHostFleetLaunchIntent({
    schema: HOST_FLEET_LAUNCH_INTENT_SCHEMA,
    request_id: 'request-launch-desktop-1',
    host: { host_id: record.host_id, host_instance_id: record.host_instance_id },
    expected_revision: record.revision,
    site_id: 'sonar',
    agent_id: 'resident',
    operator_surface: 'agent-web-ui',
    confirmation: hostKey(record),
  }, record);
  assert.equal(preflight.status, 'ready');
  assert.equal(preflight.mutation_performed, false);
  assert.equal(record.revision, 1);

  const stale = preflightHostFleetLaunchIntent({
    schema: HOST_FLEET_LAUNCH_INTENT_SCHEMA,
    request_id: 'request-launch-desktop-stale',
    host: { host_id: record.host_id, host_instance_id: record.host_instance_id },
    expected_revision: 2,
    site_id: 'sonar',
    agent_id: 'resident',
    operator_surface: null,
    confirmation: hostKey(record),
  }, record);
  assert.deepEqual(stale.refusals, ['host_revision_conflict']);
});

test('preflights credential rotation lifetime and revision without changing the record', () => {
  const record = createHostRecord({ ...input, admitted_sites: ['sonar'] });
  const intent = {
    schema: HOST_FLEET_CREDENTIAL_ROTATION_INTENT_SCHEMA,
    request_id: 'request-credential-rotate-1',
    host: { host_id: record.host_id, host_instance_id: record.host_instance_id },
    expected_revision: record.revision,
    credential_ref: 'env://NARADA_DESKTOP_GATEWAY_TOKEN_NEXT',
    credential: {
      schema: HOST_GATEWAY_CREDENTIAL_SCHEMA,
      class: 'dedicated_host_gateway',
      not_before: '2026-08-01T12:00:00.000Z',
      expires_at: '2026-09-01T12:00:00.000Z',
    },
    confirmation: hostKey(record),
  } as const;
  const preflight = preflightHostFleetCredentialRotationIntent(intent, record, new Date('2026-08-01T12:00:00.000Z'));
  assert.equal(preflight.status, 'ready');
  assert.equal(preflight.mutation_performed, false);
  assert.equal(record.credential_ref, 'secret://narada/desktop-gateway');

  const expired = preflightHostFleetCredentialRotationIntent(intent, record, new Date('2026-09-01T12:00:00.000Z'));
  assert.deepEqual(expired.refusals, ['host_gateway_credential_expired']);
});

test('qualifies events and runtime targets with the host instance', () => {
  const target = validateRuntimeTarget({
    host_id: 'zima-board-2',
    host_instance_id: 'instance-z',
    site_id: 'sonar',
    agent_id: 'resident',
    runtime_session_id: 'session-z',
  });
  const event = qualifyEvent({
    host: target,
    site_id: target.site_id,
    agent_id: target.agent_id,
    runtime_session_id: target.runtime_session_id,
    host_sequence: 3,
    occurred_at: '2026-07-31T12:00:00.000Z',
    event_type: 'session_started',
    payload: { ok: true },
  });
  assert.equal(event.host.host_id, 'zima-board-2');
  assert.equal(event.host.host_instance_id, 'instance-z');
  assert.equal(event.host_sequence, 3);
});
