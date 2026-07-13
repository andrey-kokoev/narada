import { computed, reactive, ref, watch, type ComputedRef, type Ref } from 'vue';
import type {
  RegistryManagementOperation,
  RegistrySiteRecord,
  SiteRegistryManagementResponse,
  SiteRegistryMutationRequest,
} from '@narada2/site-registry-contract';
import {
  availableSiteRegistryOperations,
  buildSiteRegistryMutationRequest,
  createSiteRegistryDraft,
  createSiteRegistryOperationOptions,
  isManagementOperation,
  toSiteRegistryDiffRows,
  validateSiteRegistryMutation,
  type SiteRegistryDiffRow,
  type SiteRegistryDraft,
  type SiteRegistryOperationOption,
  type SiteRegistryPageMode,
  type SiteRegistryValidationErrors,
} from '../domain';
import {
  type UseSiteRegistryState,
  useSiteRegistry,
} from './useSiteRegistry';
import {
  type SiteRegistryMutationState,
  type UseSiteRegistryMutationState,
  useSiteRegistryMutation,
} from './useSiteRegistryMutation';

export interface UseSiteRegistryWorkflowOptions {
  registry?: UseSiteRegistryState;
  mutation?: UseSiteRegistryMutationState;
  confirmDiscard?: (message: string) => boolean;
}

export interface UseSiteRegistryWorkflow {
  registry: UseSiteRegistryState;
  mutation: UseSiteRegistryMutationState;
  draft: SiteRegistryDraft;
  operation: Ref<RegistryManagementOperation>;
  selectedReference: Ref<string>;
  siteSearch: Ref<string>;
  draftDirty: Ref<boolean>;
  reAdmitAvailable: Ref<boolean>;
  reAdmit: Ref<boolean>;
  confirmApply: Ref<boolean>;
  purgeConfirmation: Ref<string>;
  plannedRequest: Ref<SiteRegistryMutationRequest | null>;
  planResult: Ref<SiteRegistryManagementResponse | null>;
  validationErrors: Ref<SiteRegistryValidationErrors>;
  busy: ComputedRef<boolean>;
  mutationState: ComputedRef<SiteRegistryMutationState>;
  isAdd: ComputedRef<boolean>;
  isEdit: ComputedRef<boolean>;
  isMetadataOperation: ComputedRef<boolean>;
  selectedSite: ComputedRef<RegistrySiteRecord | null>;
  sites: ComputedRef<RegistrySiteRecord[]>;
  filteredSites: ComputedRef<RegistrySiteRecord[]>;
  availableOperations: ComputedRef<RegistryManagementOperation[]>;
  operationOptions: ComputedRef<SiteRegistryOperationOption[]>;
  canPlan: ComputedRef<boolean>;
  canApply: ComputedRef<boolean>;
  confirmationRequired: ComputedRef<string>;
  diffRows: ComputedRef<SiteRegistryDiffRow[]>;
  markDirty: () => void;
  markReAdmitDirty: () => void;
  clearPlan: () => void;
  populateFromSite: (site: RegistrySiteRecord) => void;
  resetAddDraft: () => void;
  chooseExisting: () => Promise<void>;
  onOperationChange: () => void;
  discardDraft: () => void;
  preview: () => Promise<void>;
  apply: () => Promise<void>;
  initializeFromLocation: (search?: string) => Promise<void>;
}

function defaultConfirmDiscard(message: string): boolean {
  return typeof window === 'undefined' || window.confirm(message);
}

export function useSiteRegistryWorkflow(
  mode: SiteRegistryPageMode,
  options: UseSiteRegistryWorkflowOptions = {},
): UseSiteRegistryWorkflow {
  const registry = options.registry ?? useSiteRegistry();
  const mutation = options.mutation ?? useSiteRegistryMutation();
  const confirmDiscard = options.confirmDiscard ?? defaultConfirmDiscard;
  const operation = ref<RegistryManagementOperation>(mode === 'add' ? 'add' : 'edit');
  const previousOperation = ref<RegistryManagementOperation>(operation.value);
  const selectedReference = ref('');
  const previousReference = ref('');
  const siteSearch = ref('');
  const draftDirty = ref(false);
  const reAdmitAvailable = ref(false);
  const reAdmit = ref(false);
  const confirmApply = ref(false);
  const purgeConfirmation = ref('');
  const plannedRequest = ref<SiteRegistryMutationRequest | null>(null);
  const planResult = ref<SiteRegistryManagementResponse | null>(null);
  const validationErrors = ref<SiteRegistryValidationErrors>({});
  const draft = reactive(createSiteRegistryDraft(mode));

  const busy = computed(() => mutation.state.value === 'planning' || mutation.state.value === 'applying');
  const mutationState = computed(() => mutation.state.value);
  const isAdd = computed(() => operation.value === 'add');
  const isEdit = computed(() => operation.value === 'edit');
  const isMetadataOperation = computed(() => operation.value === 'add' || operation.value === 'edit');
  const selectedSite = computed<RegistrySiteRecord | null>(() => {
    const selected = registry.selectedRecord.value;
    if (selected && selected.siteId === selectedReference.value) return selected;
    return registry.records.value.find((site) => site.siteId === selectedReference.value) ?? null;
  });
  const sites = computed(() => {
    const values = new Map<string, RegistrySiteRecord>();
    for (const site of registry.records.value) values.set(site.siteId, site);
    const selected = registry.selectedRecord.value;
    if (selected) values.set(selected.siteId, selected);
    return [...values.values()];
  });
  const filteredSites = computed(() => {
    const query = siteSearch.value.trim().toLowerCase();
    if (!query) return sites.value;
    return sites.value.filter((site) => {
      const aliases = site.aliases.map((alias) => alias.value).join(' ');
      return [site.siteId, site.siteRoot, aliases].join(' ').toLowerCase().includes(query);
    });
  });
  const availableOperations = computed(() => availableSiteRegistryOperations(mode, selectedSite.value));
  const operationOptions = computed(() => createSiteRegistryOperationOptions(availableOperations.value));
  const canPlan = computed(() => !busy.value && availableOperations.value.includes(operation.value));
  const canApply = computed(() => Boolean(
    plannedRequest.value
      && planResult.value?.status === 'planned'
      && confirmApply.value
      && (operation.value !== 'purge' || purgeConfirmation.value === planResult.value?.confirmationRequired),
  ));
  const confirmationRequired = computed(() => planResult.value?.confirmationRequired ?? '');
  const diffRows = computed(() => toSiteRegistryDiffRows(planResult.value));

  function clearPlan(): void {
    plannedRequest.value = null;
    planResult.value = null;
    confirmApply.value = false;
    purgeConfirmation.value = '';
  }

  function markDirty(): void {
    draftDirty.value = true;
    clearPlan();
    reAdmitAvailable.value = false;
  }

  function markReAdmitDirty(): void {
    draftDirty.value = true;
    clearPlan();
  }

  function populateFromSite(site: RegistrySiteRecord): void {
    selectedReference.value = site.siteId;
    previousReference.value = site.siteId;
    draft.siteId = site.siteId;
    draft.root = site.siteRoot;
    draft.variant = site.variant;
    draft.substrate = site.substrate;
    draft.source = site.sources[0]?.kind ?? '';
    draft.sourceRef = site.sources[0]?.ref ?? '';
    draft.reason = '';
    draft.controlEndpoint = site.controlEndpoint ?? '';
    draft.aliases = site.aliases.map((alias) => alias.value).join(', ');
    draft.aimJson = site.aimJson ?? '';
    draftDirty.value = false;
    clearPlan();
    validationErrors.value = {};
    reAdmitAvailable.value = false;
    reAdmit.value = false;
  }

  function resetAddDraft(): void {
    Object.assign(draft, createSiteRegistryDraft('add'));
    selectedReference.value = '';
    previousReference.value = '';
    registry.clearSelection();
    draftDirty.value = false;
    clearPlan();
    validationErrors.value = {};
    reAdmitAvailable.value = false;
    reAdmit.value = false;
  }

  function validate(forApply = false): boolean {
    validationErrors.value = validateSiteRegistryMutation({
      operation: operation.value,
      draft,
      selectedReference: selectedReference.value,
      selectedSite: selectedSite.value,
      availableOperations: availableOperations.value,
      forApply,
      confirmationRequired: confirmationRequired.value,
      purgeConfirmation: purgeConfirmation.value,
    });
    return Object.keys(validationErrors.value).length === 0;
  }

  function buildRequest(): SiteRegistryMutationRequest {
    return buildSiteRegistryMutationRequest(operation.value, draft, selectedSite.value, reAdmit.value);
  }

  async function chooseExisting(): Promise<void> {
    const reference = selectedReference.value;
    if (draftDirty.value && !confirmDiscard('Discard unsaved registry change?')) {
      selectedReference.value = previousReference.value;
      return;
    }
    clearPlan();
    validationErrors.value = {};
    if (!reference) {
      registry.clearSelection();
      previousReference.value = '';
      Object.assign(draft, createSiteRegistryDraft('manage'));
      return;
    }
    await registry.select(reference);
    const site = registry.selectedRecord.value;
    if (!site) {
      selectedReference.value = previousReference.value;
      return;
    }
    if (operation.value === 'add') {
      operation.value = site.lifecycleStatus === 'retired' ? 'restore' : 'edit';
      previousOperation.value = operation.value;
    }
    populateFromSite(site);
  }

  function onOperationChange(): void {
    const nextOperation = operation.value;
    if (draftDirty.value && !confirmDiscard('Discard unsaved registry change?')) {
      operation.value = previousOperation.value;
      return;
    }
    previousOperation.value = nextOperation;
    clearPlan();
    validationErrors.value = {};
    if (nextOperation === 'add') {
      resetAddDraft();
      return;
    }
    const site = selectedSite.value;
    if (site) populateFromSite(site);
  }

  function discardDraft(): void {
    if (operation.value === 'add') resetAddDraft();
    else if (selectedSite.value) populateFromSite(selectedSite.value);
    else {
      Object.assign(draft, createSiteRegistryDraft('manage'));
      draftDirty.value = false;
      clearPlan();
    }
  }

  async function preview(): Promise<void> {
    if (!validate()) return;
    const request = buildRequest();
    clearPlan();
    const result = await mutation.plan(request);
    planResult.value = result;
    if (result?.status === 'planned') plannedRequest.value = request;
    if (result?.status === 'refused' && result.refusals.includes('retired_record_requires_restore_or_re_admit')) {
      reAdmitAvailable.value = true;
    }
  }

  async function apply(): Promise<void> {
    if (!plannedRequest.value || !validate(true) || !canApply.value) return;
    const appliedOperation = operation.value;
    const request: SiteRegistryMutationRequest = {
      ...plannedRequest.value,
      ...(operation.value === 'purge' ? { confirm_site_id: purgeConfirmation.value } : {}),
    };
    const result = await mutation.apply(request);
    planResult.value = result;
    plannedRequest.value = null;
    confirmApply.value = false;
    if (result?.status === 'applied' || result?.status === 'unchanged') {
      draftDirty.value = false;
      if (appliedOperation === 'add') resetAddDraft();
      await registry.load();
      if (selectedReference.value) await registry.select(selectedReference.value);
      planResult.value = result;
    }
  }

  async function initializeFromLocation(search = typeof window === 'undefined' ? '' : window.location.search): Promise<void> {
    const query = new URLSearchParams(search);
    const queryOperation = query.get('operation');
    const querySite = query.get('site');
    if (mode === 'manage' && queryOperation && isManagementOperation(queryOperation)) {
      operation.value = queryOperation;
      previousOperation.value = queryOperation;
    }
    if (mode === 'manage' && querySite) {
      selectedReference.value = querySite;
      await chooseExisting();
    }
  }

  watch(() => registry.selectedRecord.value, (site) => {
    if (site && !draftDirty.value && mode === 'manage') populateFromSite(site);
  });

  return {
    registry,
    mutation,
    draft,
    operation,
    selectedReference,
    siteSearch,
    draftDirty,
    reAdmitAvailable,
    reAdmit,
    confirmApply,
    purgeConfirmation,
    plannedRequest,
    planResult,
    validationErrors,
    busy,
    mutationState,
    isAdd,
    isEdit,
    isMetadataOperation,
    selectedSite,
    sites,
    filteredSites,
    availableOperations,
    operationOptions,
    canPlan,
    canApply,
    confirmationRequired,
    diffRows,
    markDirty,
    markReAdmitDirty,
    clearPlan,
    populateFromSite,
    resetAddDraft,
    chooseExisting,
    onOperationChange,
    discardDraft,
    preview,
    apply,
    initializeFromLocation,
  };
}
