import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteRegistryAdapter } from '../src/site-registry/adapter.ts';
import { createSiteRegistryTransport, type SiteRegistryFetch } from '../src/site-registry/transport.ts';

const wireSite = {
  site_id: 'site-a',
  site_root: 'D:/sites/site-a',
  variant: 'native',
  substrate: 'windows',
  aim_json: null,
  control_endpoint: null,
  last_seen_at: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-12T00:00:00.000Z',
  lifecycle_status: 'active',
  observation_status: 'present',
  sources: [],
  aliases: [],
  revision: 2,
  retired_at: null,
  retire_reason: null,
};

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('Site Registry transport carries HTTP and adapter returns typed domain responses', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetchLike: SiteRegistryFetch = async (input, init) => {
    calls.push({ input, init });
    return response({
      schema: 'narada.site_registry.management.v0',
      status: 'success',
      operation: 'list',
      mutation_performed: false,
      registry_path: 'D:/registry.sqlite',
      catalog_source: 'user_site_site_registry',
      count: 1,
      sites: [wireSite],
    });
  };

  const adapter = createSiteRegistryAdapter(createSiteRegistryTransport('/registry', fetchLike));
  const result = await adapter.list();

  assert.equal(result.sites[0]?.siteId, 'site-a');
  assert.equal(calls[0]?.input, '/registry/sites');
  assert.equal(calls[0]?.init?.headers && new Headers(calls[0].init.headers).get('Accept'), 'application/json');
});

test('Site Registry adapter rejects a malformed contract at the adapter boundary', async () => {
  const fetchLike: SiteRegistryFetch = async () => response({ schema: 'wrong' });
  const adapter = createSiteRegistryAdapter(createSiteRegistryTransport('/registry', fetchLike));

  await assert.rejects(() => adapter.list(), /did not match its contract/);
});
