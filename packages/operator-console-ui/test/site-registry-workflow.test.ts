import test from 'node:test';
import assert from 'node:assert/strict';
import { computed, ref } from 'vue';
import type {
  RegistrySiteRecord,
  SiteRegistryManagementResponse,
} from '@narada2/site-registry-contract';
import { toSiteDetailProjection, toSiteListProjection, toSiteTileProjection } from '../src/site-registry/projections.ts';
import type { UseSiteRegistryState } from '../src/site-registry/composables/useSiteRegistry.ts';
import {
  type SiteRegistryMutationState,
  type UseSiteRegistryMutationState,
} from '../src/site-registry/composables/useSiteRegistryMutation.ts';
import { useSiteRegistryWorkflow } from '../src/site-registry/composables/useSiteRegistryWorkflow.ts';

const activeSite: RegistrySiteRecord = {
  siteId: 'site-a',
  variant: 'native',
  siteRoot: 'D:/sites/site-a',
  substrate: 'windows',
  aimJson: null,
  controlEndpoint: null,
  lastSeenAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
  lifecycleStatus: 'active',
  observationStatus: 'present',
  sources: [{ kind: 'manual', ref: 'operator', observedAt: '2026-07-12T00:00:00.000Z' }],
  aliases: [{ value: 'primary-site', source: 'operator' }],
  revision: 4,
  retiredAt: null,
  retireReason: null,
};

const retiredSite: RegistrySiteRecord = {
  ...activeSite,
  lifecycleStatus: 'retired',
  revision: 7,
  retiredAt: '2026-07-12T01:00:00.000Z',
  retireReason: 'replaced',
};

function registryDouble(records: RegistrySiteRecord[]): UseSiteRegistryState {
  const recordState = ref(records);
  const selectedSiteId = ref<string | null>(null);
  const selectedRecord = ref<RegistrySiteRecord | null>(null);
  return {
    records: recordState,
    sites: computed(() => recordState.value.map((site) => toSiteListProjection(site))),
    tiles: computed(() => recordState.value.map((site) => toSiteTileProjection(site))),
    selectedSiteId,
    selectedRecord,
    selected: computed(() => selectedRecord.value ? toSiteDetailProjection(selectedRecord.value) : null),
    loading: ref(false),
    loadingDetail: ref(false),
    error: ref<string | null>(null),
    load: async () => {},
    select: async (reference: string) => {
      const selected = recordState.value.find((site) => (
        site.siteId === reference || site.aliases.some((alias) => alias.value === reference)
      )) ?? null;
      selectedRecord.value = selected;
      selectedSiteId.value = selected?.siteId ?? null;
    },
    clearSelection: () => {
      selectedRecord.value = null;
      selectedSiteId.value = null;
    },
  };
}

function response(
  status: SiteRegistryManagementResponse['status'],
  operation: SiteRegistryManagementResponse['operation'],
  before: RegistrySiteRecord | null,
  after: RegistrySiteRecord | null,
  extra: Partial<SiteRegistryManagementResponse> = {},
): SiteRegistryManagementResponse {
  return {
    schema: 'narada.site_registry.management.v0',
    status,
    operation,
    mutationPerformed: status === 'applied',
    siteId: after?.siteId ?? before?.siteId ?? 'site-a',
    before,
    after,
    changes: [],
    conflicts: [],
    refusals: [],
    auditRef: null,
    registryPath: 'D:/registry.sqlite',
    catalogSource: 'user_site_site_registry',
    confirmationRequired: null,
    ...extra,
  };
}

function mutationDouble(
  planResult: SiteRegistryManagementResponse,
  applyResult = planResult,
): { mutation: UseSiteRegistryMutationState; planRequests: unknown[]; applyRequests: unknown[] } {
  const state = ref<SiteRegistryMutationState>('idle');
  const result = ref<SiteRegistryManagementResponse | null>(null);
  const error = ref<string | null>(null);
  const planRequests: unknown[] = [];
  const applyRequests: unknown[] = [];
  return {
    planRequests,
    applyRequests,
    mutation: {
      state,
      result,
      error,
      plan: async (request) => {
        planRequests.push(request);
        state.value = planResult.status === 'refused' ? 'error' : 'complete';
        result.value = planResult;
        return planResult;
      },
      apply: async (request) => {
        applyRequests.push(request);
        state.value = applyResult.status === 'refused' ? 'error' : 'complete';
        result.value = applyResult;
        return applyResult;
      },
    },
  };
}

test('workflow canonicalizes alias selection and populates the typed draft', async () => {
  const workflow = useSiteRegistryWorkflow('manage', {
    registry: registryDouble([activeSite]),
    mutation: mutationDouble(response('planned', 'edit', activeSite, activeSite)).mutation,
  });

  workflow.selectedReference.value = 'primary-site';
  await workflow.chooseExisting();

  assert.equal(workflow.selectedReference.value, 'site-a');
  assert.equal(workflow.selectedSite.value?.siteId, 'site-a');
  assert.equal(workflow.draft.root, 'D:/sites/site-a');
  assert.equal(workflow.draft.variant, 'native');
  assert.equal(workflow.draft.aliases, 'primary-site');
});

test('workflow preserves the previous selection when a dirty draft is not discarded', async () => {
  const workflow = useSiteRegistryWorkflow('manage', {
    registry: registryDouble([activeSite, { ...activeSite, siteId: 'site-b', siteRoot: 'D:/sites/site-b' }]),
    mutation: mutationDouble(response('planned', 'edit', activeSite, activeSite)).mutation,
    confirmDiscard: () => false,
  });

  workflow.selectedReference.value = 'site-a';
  await workflow.chooseExisting();
  workflow.markDirty();
  workflow.selectedReference.value = 'site-b';
  await workflow.chooseExisting();

  assert.equal(workflow.selectedReference.value, 'site-a');
  assert.equal(workflow.draftDirty.value, true);
});

test('workflow exposes retired-record recovery after a refused add preview', async () => {
  const refusal = response('refused', 'add', null, null, {
    refusals: ['retired_record_requires_restore_or_re_admit'],
  });
  const workflow = useSiteRegistryWorkflow('add', {
    registry: registryDouble([retiredSite]),
    mutation: mutationDouble(refusal).mutation,
  });

  workflow.draft.siteId = 'site-a';
  workflow.draft.root = 'D:/sites/site-a';
  await workflow.preview();

  assert.equal(workflow.planResult.value?.status, 'refused');
  assert.equal(workflow.reAdmitAvailable.value, true);
});

test('workflow keeps purge confirmation and expected revision in the apply boundary', async () => {
  const planned = response('planned', 'purge', retiredSite, null, {
    confirmationRequired: 'site-a',
  });
  const applied = response('applied', 'purge', retiredSite, null);
  const doubles = mutationDouble(planned, applied);
  const workflow = useSiteRegistryWorkflow('manage', {
    registry: registryDouble([retiredSite]),
    mutation: doubles.mutation,
  });

  workflow.selectedReference.value = 'site-a';
  await workflow.chooseExisting();
  workflow.operation.value = 'purge';
  workflow.onOperationChange();
  workflow.draft.reason = 'remove obsolete metadata';
  await workflow.preview();

  workflow.confirmApply.value = true;
  assert.equal(workflow.canApply.value, false);
  workflow.purgeConfirmation.value = 'site-a';
  assert.equal(workflow.canApply.value, true);

  await workflow.apply();

  assert.equal(doubles.planRequests.length, 1);
  assert.equal(doubles.applyRequests.length, 1);
  assert.deepEqual(doubles.applyRequests[0], {
    operation: 'purge',
    reference: 'site-a',
    reason: 'remove obsolete metadata',
    expected_revision: 7,
    confirm_site_id: 'site-a',
  });
});
