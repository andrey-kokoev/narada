import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { HOST_FLEET_HEARTBEAT_SCHEMA } from '@narada-core/host-fleet';
import {
  HOST_FLEET_RUNTIME_CONFIG_SCHEMA,
  HostFleetAuthority,
  HostFleetReplayRefusal,
  HostFleetSqliteStore,
  hostFleetSigningRequestHeaders,
  loadHostFleetCredential,
  signHostFleetBody,
  validateHostFleetRuntimeConfig,
  type HostFleetRuntimeConfig,
} from '../src/index.js';

const NOW = '2026-08-01T12:00:00.000Z';
const SECRET = 'host-fleet-membership-secret-with-more-than-32-bytes';

async function fixture(): Promise<{ root: string; config: HostFleetRuntimeConfig }> {
  const root = await mkdtemp(join(tmpdir(), 'narada-host-fleet-'));
  const secret = join(root, 'active.secret');
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
    listener: { host: '127.0.0.1', port: 61732 },
    credentials: { active: { key_id: 'active', file: secret, accept_until: null }, previous: null },
    heartbeat: { interval_ms: 15_000, stale_after_ms: 45_000, max_clock_skew_ms: 60_000, max_body_bytes: 4_096 },
    probe: { interval_ms: 15_000, timeout_ms: 3_000 },
    roster: [
      {
        host_id: 'desktop',
        display_name: 'Desktop',
        platform: 'windows',
        operator_console_url: 'https://desktop.example.test/console',
        operator_console_health_url: 'https://desktop.example.test/health',
      },
      {
        host_id: 'zima',
        display_name: 'Zima',
        platform: 'linux',
        operator_console_url: 'https://zima.example.test/console',
        operator_console_health_url: 'https://zima.example.test/health',
      },
    ],
  });
  return { root, config };
}

test('authority derives freshness and effective health from receipt time', async (t) => {
  const { root, config } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  let now = new Date(NOW);
  const authority = new HostFleetAuthority({ config, state_path: join(root, 'state.sqlite'), now: () => now });
  await authority.initialize();
  const credential = await loadHostFleetCredential(config.credentials.active);
  const body = Buffer.from(JSON.stringify({
    schema: HOST_FLEET_HEARTBEAT_SCHEMA,
    fleet_id: 'home',
    host_id: 'zima',
    observed_at: NOW,
    health: { status: 'healthy', detail: null },
  }));
  const signed = signHostFleetBody(body, credential, NOW, 'abcdefghijklmnop');
  authority.admit(body, hostFleetSigningRequestHeaders(signed));

  const fresh = authority.snapshot().hosts.find((host) => host.identity.host_id === 'zima')!;
  assert.equal(fresh.reachability.publisher_freshness, 'fresh');
  assert.equal(fresh.health.status, 'healthy');
  assert.equal(fresh.health.reported_status, 'healthy');

  now = new Date('2026-08-01T12:00:46.000Z');
  const stale = authority.snapshot().hosts.find((host) => host.identity.host_id === 'zima')!;
  assert.equal(stale.reachability.publisher_freshness, 'stale');
  assert.equal(stale.health.status, 'unknown');
  assert.equal(stale.health.reported_status, 'healthy');
  authority.store.close();
});

test('authority rejects a validly signed heartbeat from another Fleet', async (t) => {
  const { root, config } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const authority = new HostFleetAuthority({ config, state_path: join(root, 'state.sqlite'), now: () => new Date(NOW) });
  await authority.initialize();
  const credential = await loadHostFleetCredential(config.credentials.active);
  const body = Buffer.from(JSON.stringify({
    schema: HOST_FLEET_HEARTBEAT_SCHEMA,
    fleet_id: 'another-fleet',
    host_id: 'zima',
    observed_at: NOW,
    health: { status: 'healthy', detail: null },
  }));
  const signed = signHostFleetBody(body, credential, NOW, 'anotherfleetnonce');
  assert.throws(
    () => authority.admit(body, hostFleetSigningRequestHeaders(signed)),
    /host_fleet_id_mismatch/,
  );
  assert.equal(authority.store.observations().has('zima'), false);
  authority.store.close();
});

test('authority never projects retained observations from a previous Fleet configuration', async (t) => {
  const { root, config } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const statePath = join(root, 'state.sqlite');
  const priorStore = new HostFleetSqliteStore(statePath);
  priorStore.admit({
    heartbeat: {
      schema: HOST_FLEET_HEARTBEAT_SCHEMA,
      fleet_id: 'previous-fleet',
      host_id: 'zima',
      observed_at: NOW,
      health: { status: 'healthy', detail: null },
    },
    key_id: 'active',
    nonce: 'previousfleetnonce',
    received_at: NOW,
    nonce_cutoff: '2026-08-01T11:58:00.000Z',
  });
  priorStore.close();

  const authority = new HostFleetAuthority({ config, state_path: statePath, now: () => new Date(NOW) });
  const host = authority.snapshot().hosts.find((candidate) => candidate.identity.host_id === 'zima')!;
  assert.equal(host.reachability.publisher_freshness, 'unknown');
  assert.equal(host.reachability.heartbeat_received_at, null);
  assert.equal(host.health.status, 'unknown');
  authority.store.close();
});

test('SQLite admission rejects nonce replay without replacing the prior observation', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'narada-host-fleet-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new HostFleetSqliteStore(join(root, 'state.sqlite'));
  const heartbeat = {
    schema: HOST_FLEET_HEARTBEAT_SCHEMA,
    fleet_id: 'home',
    host_id: 'zima',
    observed_at: NOW,
    health: { status: 'healthy' as const, detail: null },
  };
  const input = { heartbeat, key_id: 'active', nonce: 'abcdefghijklmnop', received_at: NOW, nonce_cutoff: '2026-08-01T11:58:00.000Z' };
  store.admit(input);
  assert.throws(() => store.admit(input), HostFleetReplayRefusal);
  assert.equal(store.observations().get('zima')?.heartbeat.health.status, 'healthy');
  store.close();
});

test('SQLite probe evidence cannot move backward in observation time', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'narada-host-fleet-probe-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new HostFleetSqliteStore(join(root, 'state.sqlite'));
  store.recordProbe({ host_id: 'zima', status: 'reachable', observed_at: '2026-08-01T12:00:01.000Z' });
  store.recordProbe({ host_id: 'zima', status: 'unreachable', observed_at: '2026-08-01T12:00:00.000Z' });
  assert.equal(store.probes().get('zima')?.status, 'reachable');
  assert.equal(store.probes().get('zima')?.observed_at, '2026-08-01T12:00:01.000Z');
  store.close();
});

test('active probes remain separate from publisher freshness', async (t) => {
  const { root, config } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const requested: string[] = [];
  const authority = new HostFleetAuthority({
    config,
    state_path: join(root, 'state.sqlite'),
    now: () => new Date(NOW),
    fetch_fn: async (input) => {
      requested.push(String(input));
      return new Response(null, { status: String(input).includes('desktop') ? 200 : 503 });
    },
  });
  await authority.initialize();
  await authority.probeHosts();
  const hosts = authority.snapshot().hosts;
  assert.equal(hosts.find((host) => host.identity.host_id === 'desktop')?.reachability.status, 'reachable');
  assert.equal(hosts.find((host) => host.identity.host_id === 'zima')?.reachability.status, 'unreachable');
  assert.equal(hosts.find((host) => host.identity.host_id === 'zima')?.reachability.publisher_freshness, 'unknown');
  assert.equal(requested.length, 2);
  authority.store.close();
});
