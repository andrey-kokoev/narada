import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOST_RECORD_SCHEMA,
  createHostRecord,
  hostKey,
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
});

test('rejects a non-loopback endpoint for a loopback transport', () => {
  assert.throws(() => createHostRecord({
    ...input,
    gateway: { ...input.gateway, endpoint: 'http://192.168.1.20:61730' },
  }), /host_gateway_loopback_required/);
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
