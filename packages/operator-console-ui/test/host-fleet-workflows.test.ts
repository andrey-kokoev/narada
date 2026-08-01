import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createHostFleetEnrollmentIntent,
  createHostFleetLaunchIntent,
  createHostFleetLifecycleIntent,
  hostFleetEnrollmentDraftFingerprint,
} from '../src/host-fleet/workflows.ts';

test('host fleet lifecycle workflow is exact-host and revision fenced', () => {
  const intent = createHostFleetLifecycleIntent({
    hostId: 'zima-board-2',
    hostInstanceId: 'instance-z',
    displayName: 'ZimaBoard 2',
    platform: 'linux',
    naradaVersion: '0.1.0',
    transport: 'ssh-tunnel',
    admittedPathCount: 3,
    capabilities: ['sessions'],
    admittedSites: ['sonar'],
    lifecycleState: 'active',
    healthStatus: 'online',
    healthObservedAt: null,
    healthDetail: null,
    lastSeenAt: null,
    revision: 7,
  }, 'revoke', 'operator test');

  assert.equal(intent.operation, 'revoke');
  assert.deepEqual(intent.host, { host_id: 'zima-board-2', host_instance_id: 'instance-z' });
  assert.equal(intent.expected_revision, 7);
  assert.equal(intent.confirmation, 'zima-board-2@instance-z');
  assert.equal(intent.reason, 'operator test');
});

test('host fleet launch planning preserves exact HostKey and revision fencing', () => {
  const intent = createHostFleetLaunchIntent({
    hostId: 'desktop-sunroom-2',
    hostInstanceId: 'desktop-instance-2026-07',
    displayName: 'Desktop Sunroom 2',
    platform: 'windows',
    naradaVersion: '0.1.0',
    transport: 'loopback',
    admittedPathCount: 4,
    capabilities: ['sessions', 'events'],
    admittedSites: ['sonar'],
    lifecycleState: 'active',
    healthStatus: 'online',
    healthObservedAt: null,
    healthDetail: null,
    lastSeenAt: null,
    revision: 12,
  }, { siteId: 'sonar', agentId: 'resident', operatorSurface: 'agent-web-ui' });

  assert.deepEqual(intent.host, { host_id: 'desktop-sunroom-2', host_instance_id: 'desktop-instance-2026-07' });
  assert.equal(intent.expected_revision, 12);
  assert.equal(intent.site_id, 'sonar');
  assert.equal(intent.operator_surface, 'agent-web-ui');
  assert.equal(intent.confirmation, 'desktop-sunroom-2@desktop-instance-2026-07');
});

test('host fleet enrollment workflow carries a credential reference, never a secret', () => {
  const intent = createHostFleetEnrollmentIntent({
    hostId: 'zima-board-2',
    hostInstanceId: 'instance-z',
    displayName: 'ZimaBoard 2',
    platform: 'linux',
    naradaVersion: '0.1.0',
    endpoint: 'http://127.0.0.1:64930',
    transport: 'ssh-tunnel',
    admittedPaths: '/health\n/events',
    credentialRef: 'env://NARADA_HOST_GATEWAY_TOKEN',
    capabilities: 'sessions\nevents',
    admittedSites: 'sonar',
    allowReenrollment: true,
  }, null);

  assert.equal(intent.host.gateway.credential?.class, 'dedicated_host_gateway');
  assert.equal(intent.host.credential_ref, 'env://NARADA_HOST_GATEWAY_TOKEN');
  assert.deepEqual(intent.host.gateway.admitted_paths, ['/health', '/events']);
  assert.deepEqual(intent.host.capabilities, ['sessions', 'events']);
  assert.deepEqual(intent.host.admitted_sites, ['sonar']);
  assert.equal(intent.allow_reenrollment, true);
  assert.equal('secret' in intent.host, false);
  assert.equal('credential_value' in intent.host, false);
});

test('enrollment workflow rejects an empty credential reference before authority submission', () => {
  assert.throws(() => createHostFleetEnrollmentIntent({
    hostId: 'zima-board-2',
    hostInstanceId: 'instance-z',
    displayName: 'ZimaBoard 2',
    platform: 'linux',
    naradaVersion: '',
    endpoint: 'http://127.0.0.1:64930',
    transport: 'ssh-tunnel',
    admittedPaths: '/health',
    credentialRef: '  ',
    capabilities: 'sessions',
    admittedSites: 'sonar',
    allowReenrollment: false,
  }, null), /host_enrollment_credential_ref_required/);
});

test('enrollment draft fingerprint changes when reviewed inputs change and normalizes lists', () => {
  const draft = {
    hostId: ' zima-board-2 ',
    hostInstanceId: 'instance-z',
    displayName: 'ZimaBoard 2',
    platform: 'linux' as const,
    naradaVersion: '0.1.0',
    endpoint: 'http://127.0.0.1:64930',
    transport: 'ssh-tunnel' as const,
    admittedPaths: '/health, /events\n/health',
    credentialRef: 'env://NARADA_HOST_GATEWAY_TOKEN',
    capabilities: 'sessions\nevents',
    admittedSites: 'sonar',
    allowReenrollment: false,
  };

  const initial = hostFleetEnrollmentDraftFingerprint(draft);
  assert.match(initial, /"host_id":"zima-board-2"/u);
  assert.match(initial, /"admitted_paths":\["\/health","\/events"\]/u);
  draft.endpoint = 'https://gateway.example.test';
  assert.notEqual(hostFleetEnrollmentDraftFingerprint(draft), initial);
});
