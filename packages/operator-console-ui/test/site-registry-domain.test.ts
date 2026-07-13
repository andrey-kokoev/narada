import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableSiteRegistryOperations,
  buildSiteRegistryMutationRequest,
  createSiteRegistryDraft,
  createSiteRegistryOperationOptions,
  toSiteRegistryDiffRows,
  validateSiteRegistryMutation,
} from '../src/site-registry/domain.ts';

const activeSite = {
  siteId: 'site-a',
  variant: 'native' as const,
  siteRoot: 'D:/sites/site-a',
  substrate: 'windows',
  aimJson: null,
  controlEndpoint: 'https://example.test/control',
  lastSeenAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
  lifecycleStatus: 'active' as const,
  observationStatus: 'present' as const,
  sources: [{ kind: 'manual', ref: 'operator', observedAt: '2026-07-12T00:00:00.000Z' }],
  aliases: [{ value: 'a', source: 'operator' }],
  revision: 3,
  retiredAt: null,
  retireReason: null,
};

test('operation availability follows Site lifecycle', () => {
  assert.deepEqual(availableSiteRegistryOperations('add', null), ['add']);
  assert.deepEqual(availableSiteRegistryOperations('manage', activeSite), ['add', 'edit', 'retire']);
  assert.deepEqual(
    availableSiteRegistryOperations('manage', { ...activeSite, lifecycleStatus: 'retired' }),
    ['add', 'restore', 'purge'],
  );
  assert.equal(
    createSiteRegistryOperationOptions(['add', 'retire']).find((option) => option.value === 'edit')?.enabled,
    false,
  );
});

test('request construction keeps the contract boundary explicit', () => {
  const draft = createSiteRegistryDraft('manage');
  draft.root = 'D:/sites/site-a-v2';
  draft.variant = 'native';
  draft.substrate = 'windows';
  draft.aliases = 'primary, scheduling';
  draft.clearControlEndpoint = true;
  draft.reason = 'moved';

  assert.deepEqual(buildSiteRegistryMutationRequest('edit', draft, activeSite, false), {
    operation: 'edit',
    reference: 'site-a',
    root: 'D:/sites/site-a-v2',
    variant: 'native',
    substrate: 'windows',
    source: undefined,
    source_ref: undefined,
    control_endpoint: undefined,
    aliases: ['primary', 'scheduling'],
    aim_json: undefined,
    clear_control_endpoint: true,
    clear_aliases: undefined,
    clear_aim_json: undefined,
    expected_revision: 3,
  });
});

test('validation is typed and refuses unsafe or incomplete transitions', () => {
  const draft = createSiteRegistryDraft('add');
  draft.siteId = 'bad id';
  draft.root = 'relative/site';
  draft.controlEndpoint = 'ftp://example.test';
  draft.aimJson = '{broken';

  const errors = validateSiteRegistryMutation({
    operation: 'add',
    draft,
    selectedReference: '',
    selectedSite: null,
    availableOperations: ['add'],
  });

  assert.equal(errors.siteId !== undefined, true);
  assert.equal(errors.root !== undefined, true);
  assert.equal(errors.controlEndpoint !== undefined, true);
  assert.equal(errors.aimJson !== undefined, true);
});

test('diff rows are derived from the management result', () => {
  const rows = toSiteRegistryDiffRows({
    schema: 'narada.site_registry.management.v0',
    status: 'planned',
    operation: 'edit',
    mutationPerformed: false,
    siteId: 'site-a',
    before: activeSite,
    after: { ...activeSite, siteRoot: 'D:/sites/site-a-v2', revision: 4 },
    changes: ['root changed'],
    conflicts: [],
    refusals: [],
    auditRef: null,
    registryPath: 'D:/registry.sqlite',
    catalogSource: 'user_site_site_registry',
    confirmationRequired: null,
  });

  assert.deepEqual(rows, [{ label: 'Root', before: 'D:/sites/site-a', after: 'D:/sites/site-a-v2' }, { label: 'Revision', before: '3', after: '4' }]);
});
