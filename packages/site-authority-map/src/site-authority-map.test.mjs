import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  SITE_AUTHORITY_ACTIONS,
  SITE_AUTHORITY_MAP_SCHEMA,
  SITE_EMBODIMENT_KINDS,
  SITE_MUTATION_CLASSES,
  classifySiteAuthorityRequest,
  createCloudflareSiteAuthorityMap,
  validateSiteAuthorityMap,
} from './site-authority-map.mjs';

const fixtureCases = JSON.parse(readFileSync(new URL('../fixtures/site-authority-map-cases.json', import.meta.url), 'utf8'));

test('cloudflare site authority map validates and names required mutation classes', () => {
  const map = createCloudflareSiteAuthorityMap({ site_id: 'site_fixture' });
  assert.equal(map.schema, SITE_AUTHORITY_MAP_SCHEMA);
  assert.equal(map.site_id, 'site_fixture');
  assert.deepEqual(validateSiteAuthorityMap(map), { ok: true, errors: [] });
  for (const mutationClass of Object.values(SITE_MUTATION_CLASSES)) {
    assert.equal(map.entries.some((entry) => entry.mutation_class === mutationClass), true, mutationClass);
  }
});

test('fixture cases classify stable authority routing decisions', () => {
  assert.equal(fixtureCases.schema, 'narada.site_authority_map_cases.v1');
  const map = createCloudflareSiteAuthorityMap({ site_id: 'site_fixture' });
  for (const fixture of fixtureCases.cases) {
    const decision = classifySiteAuthorityRequest(map, fixture.request);
    assert.equal(decision.action, fixture.expected.action, fixture.name);
    assert.equal(decision.reason, fixture.expected.reason, fixture.name);
    assert.equal(decision.authority_locus_kind, fixture.expected.authority_locus_kind, fixture.name);
  }
});

test('local windows embodiment admits local filesystem mutation', () => {
  const map = createCloudflareSiteAuthorityMap({ site_id: 'site_fixture' });
  const decision = classifySiteAuthorityRequest(map, {
    mutation_class: SITE_MUTATION_CLASSES.LOCAL_REPOSITORY_FILESYSTEM_MUTATION,
    embodiment_kind: SITE_EMBODIMENT_KINDS.LOCAL_WINDOWS,
  });
  assert.equal(decision.action, SITE_AUTHORITY_ACTIONS.ADMIT);
  assert.equal(decision.authority_locus_kind, 'local_site_filesystem_authority');
});

test('invalid map refuses rather than inferring authority', () => {
  const decision = classifySiteAuthorityRequest({ schema: SITE_AUTHORITY_MAP_SCHEMA, site_id: 'site_fixture' }, {
    mutation_class: SITE_MUTATION_CLASSES.HOSTED_SITE_MEMBERSHIP,
  });
  assert.equal(decision.action, SITE_AUTHORITY_ACTIONS.REFUSE);
  assert.equal(decision.reason, 'site_authority_map_invalid');
  assert.equal(decision.validation_errors.includes('site_authority_map_entries_missing'), true);
});
