import test from 'node:test';
import assert from 'node:assert/strict';
import { toSiteDetailProjection, toSiteListProjection, toSiteTileProjection } from '../src/site-registry/projections.ts';

const site = {
  siteId: 'site-a',
  variant: 'native' as const,
  siteRoot: 'D:/sites/site-a',
  substrate: 'windows',
  aimJson: '{"purpose":"operations"}',
  controlEndpoint: null,
  lastSeenAt: '2026-07-12T00:00:00.000Z',
  createdAt: '2026-07-01T00:00:00.000Z',
  lifecycleStatus: 'active' as const,
  observationStatus: 'present' as const,
  sources: [{ kind: 'filesystem', ref: 'D:/sites/site-a', observedAt: '2026-07-12T00:00:00.000Z' }],
  aliases: [{ value: 'a', source: 'operator' }],
  revision: 2,
  updatedAt: '2026-07-12T00:00:00.000Z',
  retiredAt: null,
  retireReason: null,
};

test('projections preserve one canonical Site identity', () => {
  const list = toSiteListProjection(site, Date.parse('2026-07-12T00:01:00.000Z'));
  const tile = toSiteTileProjection(site, Date.parse('2026-07-12T00:01:00.000Z'));
  const detail = toSiteDetailProjection(site, Date.parse('2026-07-12T00:01:00.000Z'));
  assert.equal(list.siteId, 'site-a');
  assert.equal(tile.siteId, list.siteId);
  assert.equal(detail.siteId, list.siteId);
  assert.equal(list.statusTone, 'positive');
  assert.equal(tile.sourceCount, 1);
  assert.equal(detail.revision, 'Revision 2');
});

test('projection tone follows lifecycle and observation posture', () => {
  assert.equal(toSiteListProjection({ ...site, observationStatus: 'stale' }, Date.now()).statusTone, 'warning');
  assert.equal(toSiteListProjection({ ...site, observationStatus: 'missing' }, Date.now()).statusTone, 'danger');
  assert.equal(toSiteListProjection({ ...site, lifecycleStatus: 'retired' }, Date.now()).statusTone, 'warning');
});
