import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { HOST_FLEET_HEARTBEAT_SCHEMA } from '@narada-core/host-fleet';
import {
  HOST_FLEET_RUNTIME_CONFIG_SCHEMA,
  HostFleetAuthority,
  createDefaultHostFleetProjectionReader,
  createHostFleetPublisher,
  createHostFleetRuntimeClient,
  hostFleetSigningRequestHeaders,
  loadHostFleetCredential,
  signHostFleetBody,
  validateHostFleetRuntimeConfig,
  type HostFleetRuntimeConfig,
} from '../src/index.js';

const SECRET = 'host-fleet-membership-secret-with-more-than-32-bytes';

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function authorityFixture(): Promise<{
  root: string;
  configPath: string;
  config: HostFleetRuntimeConfig;
}> {
  const root = await mkdtemp(join(tmpdir(), 'narada-host-fleet-client-'));
  const secret = join(root, 'active.secret');
  const configPath = join(root, 'config.json');
  await writeFile(secret, SECRET, 'utf8');
  const config = validateHostFleetRuntimeConfig({
    schema: HOST_FLEET_RUNTIME_CONFIG_SCHEMA,
    mode: 'authority',
    fleet_id: 'home',
    host_id: 'desktop',
    authority_host_id: 'desktop',
    ingress_url: null,
    allow_insecure_ingress: false,
    local_health_url: null,
    listener: { host: '127.0.0.1', port: await availablePort() },
    credentials: { active: { key_id: 'active', file: secret, accept_until: null }, previous: null },
    heartbeat: { interval_ms: 15_000, stale_after_ms: 45_000, max_clock_skew_ms: 60_000, max_body_bytes: 4_096 },
    probe: { interval_ms: 15_000, timeout_ms: 3_000 },
    roster: [
      { host_id: 'desktop', display_name: 'Desktop', platform: 'windows', operator_console_url: null, operator_console_health_url: null },
      { host_id: 'zima', display_name: 'Zima', platform: 'linux', operator_console_url: null, operator_console_health_url: null },
    ],
  });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return { root, configPath, config };
}

test('configured nondefault authority port carries signed admission, replay refusal, and readback end to end', async (t) => {
  const fixture = await authorityFixture();
  const authority = new HostFleetAuthority({ config: fixture.config, state_path: join(fixture.root, 'state.sqlite') });
  const running = await authority.start();
  t.after(async () => {
    await running.stop();
    await rm(fixture.root, { recursive: true, force: true });
  });

  const reader = createDefaultHostFleetProjectionReader({ config_path: fixture.configPath, timeout_ms: 1_000 });
  const initial = await reader.read();
  assert.equal(initial.runtime.status, 'ready');
  assert.equal(initial.snapshot?.hosts.length, 2);

  const observedAt = new Date().toISOString();
  const body = Buffer.from(JSON.stringify({
    schema: HOST_FLEET_HEARTBEAT_SCHEMA,
    fleet_id: 'home',
    host_id: 'zima',
    observed_at: observedAt,
    health: { status: 'healthy', detail: null },
  }));
  const credential = await loadHostFleetCredential(fixture.config.credentials.active);
  const signed = signHostFleetBody(body, credential, observedAt, 'clientendtoendnonce');
  const headers = hostFleetSigningRequestHeaders(signed);
  assert.equal((await reader.forwardHeartbeat(body, headers)).status, 202);
  assert.equal((await reader.forwardHeartbeat(body, headers)).status, 409);

  const admitted = await reader.read();
  const zima = admitted.snapshot?.hosts.find((host) => host.identity.host_id === 'zima');
  assert.equal(zima?.reachability.publisher_freshness, 'fresh');
  assert.equal(zima?.health.status, 'healthy');
});

test('default projection refuses publisher config as a local authority', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'narada-host-fleet-publisher-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const secret = join(root, 'active.secret');
  const configPath = join(root, 'config.json');
  await writeFile(secret, SECRET, 'utf8');
  const config = validateHostFleetRuntimeConfig({
    schema: HOST_FLEET_RUNTIME_CONFIG_SCHEMA,
    mode: 'publisher',
    fleet_id: 'home',
    host_id: 'zima',
    authority_host_id: 'desktop',
    ingress_url: 'https://fleet.example.test/api/fleet/observations',
    allow_insecure_ingress: false,
    local_health_url: null,
    listener: { host: '127.0.0.1', port: await availablePort() },
    credentials: { active: { key_id: 'active', file: secret, accept_until: null }, previous: null },
    heartbeat: { interval_ms: 15_000, stale_after_ms: 45_000, max_clock_skew_ms: 60_000, max_body_bytes: 4_096 },
    probe: { interval_ms: 15_000, timeout_ms: 3_000 },
    roster: [],
  });
  await writeFile(configPath, JSON.stringify(config), 'utf8');
  const reader = createDefaultHostFleetProjectionReader({ config_path: configPath });
  const response = await reader.read();
  assert.equal(response.runtime.status, 'degraded');
  assert.equal(response.runtime.detail_code, 'host_fleet_runtime_not_authority');
  assert.equal(response.runtime.authority_host_id, 'desktop');
  await assert.rejects(() => reader.forwardHeartbeat(Buffer.from('{}'), {}), /host_fleet_runtime_not_authority/);
});

test('publisher stays observable while admission is unavailable and recovers after a successful publish', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'narada-host-fleet-publisher-'));
  const secret = join(root, 'active.secret');
  await writeFile(secret, SECRET, 'utf8');
  const config = validateHostFleetRuntimeConfig({
    schema: HOST_FLEET_RUNTIME_CONFIG_SCHEMA,
    mode: 'publisher',
    fleet_id: 'home',
    host_id: 'zima',
    authority_host_id: 'desktop',
    ingress_url: 'https://fleet.example.test/api/fleet/observations',
    allow_insecure_ingress: false,
    local_health_url: null,
    listener: { host: '127.0.0.1', port: await availablePort() },
    credentials: { active: { key_id: 'active', file: secret, accept_until: null }, previous: null },
    heartbeat: { interval_ms: 15_000, stale_after_ms: 45_000, max_clock_skew_ms: 60_000, max_body_bytes: 4_096 },
    probe: { interval_ms: 15_000, timeout_ms: 3_000 },
    roster: [],
  });
  let accepts = false;
  const publisher = createHostFleetPublisher({
    config,
    fetch_fn: async () => new Response(null, { status: accepts ? 202 : 503 }),
  });
  const url = await publisher.start();
  t.after(async () => {
    await publisher.stop();
    await rm(root, { recursive: true, force: true });
  });
  const client = createHostFleetRuntimeClient({ base_url: url, timeout_ms: 1_000 });
  const degraded = await client.health();
  assert.equal(degraded.status, 'degraded');
  assert.equal(degraded.last_publish_failure_code, 'host_fleet_publish_refused_503');

  accepts = true;
  await publisher.publish();
  const healthy = await client.health();
  assert.equal(healthy.status, 'healthy');
  assert.equal(healthy.last_publish_failure_code, null);
  assert.ok(healthy.last_publish_success_at);
});
