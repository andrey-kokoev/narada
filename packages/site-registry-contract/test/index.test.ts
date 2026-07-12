import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSiteRegistryListResponse,
  parseSiteRegistryManagementResponse,
  parseSiteRegistryWireSite,
} from '../src/index.ts';

const wireSite = {
  site_id: 'site-a',
  site_root: 'D:/sites/site-a',
  variant: 'native',
  substrate: 'windows',
  aim_json: null,
  control_endpoint: null,
  last_seen_at: '2026-07-12T00:00:00.000Z',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-12T00:00:00.000Z',
  lifecycle_status: 'active',
  observation_status: 'present',
  sources: [{ kind: 'filesystem', ref: 'D:/sites/site-a', observed_at: '2026-07-12T00:00:00.000Z' }],
  aliases: [{ value: 'a', source: 'operator' }],
  revision: 2,
  retired_at: null,
  retire_reason: null,
};

test('parses a canonical wire Site without leaking snake_case into the domain', () => {
  const parsed = parseSiteRegistryWireSite(wireSite);
  assert.deepEqual(parsed?.siteId, 'site-a');
  assert.deepEqual(parsed?.siteRoot, 'D:/sites/site-a');
  assert.deepEqual(parsed?.sources[0]?.observedAt, '2026-07-12T00:00:00.000Z');
});

test('rejects malformed registry records at the browser boundary', () => {
  assert.equal(parseSiteRegistryWireSite({ ...wireSite, revision: -1 }), null);
  assert.equal(parseSiteRegistryWireSite({ ...wireSite, variant: 'unknown' }), null);
});

test('parses list and management envelopes with bounded fields', () => {
  const list = parseSiteRegistryListResponse({
    schema: 'narada.site_registry.management.v0',
    status: 'success',
    operation: 'list',
    mutation_performed: false,
    registry_path: 'D:/registry.sqlite',
    catalog_source: 'user_site_site_registry',
    count: 1,
    sites: [wireSite],
  });
  assert.equal(list?.sites[0]?.siteId, 'site-a');

  const management = parseSiteRegistryManagementResponse({
    schema: 'narada.site_registry.management.v0',
    status: 'planned',
    operation: 'edit',
    mutation_performed: false,
    site_id: 'site-a',
    registry_path: 'D:/registry.sqlite',
    catalog_source: 'user_site_site_registry',
    before: wireSite,
    after: { ...wireSite, revision: 3 },
    changes: ['revision'],
    conflicts: [],
    refusals: [],
    audit_ref: null,
  });
  assert.equal(management?.after?.revision, 3);
});
