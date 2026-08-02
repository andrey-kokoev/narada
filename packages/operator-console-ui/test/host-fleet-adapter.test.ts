import assert from 'node:assert/strict';
import test from 'node:test';
import { HostFleetApiError, createHostFleetAdapter } from '../src/host-fleet/adapter';
import { HostFleetTransportError } from '../src/host-fleet/transport';

const NOW = '2026-08-01T12:00:00.000Z';

function payload() {
  return {
    schema: 'narada.host_fleet.snapshot.v1',
    generated_at: NOW,
    hosts: [{
      schema: 'narada.host_fleet.host.v1',
      identity: { host_id: 'desktop', display_name: 'Desktop', platform: 'windows' },
      reachability: { status: 'reachable', observed_at: NOW },
      health: { status: 'healthy', observed_at: NOW, detail: null },
      operator_console: { status: 'available', url: 'https://desktop.example.test/console' },
    }],
  };
}

test('Host Fleet adapter accepts the strict host-only snapshot', async () => {
  const client = createHostFleetAdapter({ list: async () => payload() });
  const result = await client.list();
  assert.equal(result.hosts[0]?.identity.host_id, 'desktop');
  assert.equal(JSON.stringify(result).includes('site_id'), false);
});

test('Host Fleet adapter rejects an internal-host identity extension', async () => {
  const candidate = payload();
  const client = createHostFleetAdapter({
    list: async () => ({
      ...candidate,
      hosts: [{ ...candidate.hosts[0], site_id: 'forbidden' }],
    }),
  });
  await assert.rejects(
    client.list(),
    (error: unknown) => error instanceof HostFleetApiError && error.code === 'invalid_response',
  );
});

test('Host Fleet adapter preserves transport diagnostics', async () => {
  const transportError = new HostFleetTransportError('http_error', 503, 'Host Fleet unavailable.');
  const client = createHostFleetAdapter({
    list: async () => { throw transportError; },
  });
  await assert.rejects(client.list(), (error: unknown) => error === transportError);
});
