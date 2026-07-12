<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ArrowLeft, Check, Eye, RotateCcw, Save, Search, ShieldAlert } from 'lucide-vue-next';
import type {
  RegistryManagementOperation,
  RegistrySiteRecord,
  SiteRegistryManagementResponse,
  SiteRegistryMutationRequest,
  SiteVariant,
} from '@narada2/site-registry-contract';
import { useSiteRegistry } from '../site-registry/composables/useSiteRegistry';
import { useSiteRegistryMutation } from '../site-registry/composables/useSiteRegistryMutation';

const props = defineProps<{ mode: 'add' | 'manage' }>();

interface Draft {
  siteId: string;
  root: string;
  variant: SiteVariant | '';
  substrate: string;
  source: string;
  sourceRef: string;
  reason: string;
  controlEndpoint: string;
  aliases: string;
  aimJson: string;
  clearControlEndpoint: boolean;
  clearAliases: boolean;
  clearAimJson: boolean;
}

interface OperationOption {
  value: RegistryManagementOperation;
  label: string;
  enabled: boolean;
}

const registry = useSiteRegistry();
const mutation = useSiteRegistryMutation();
const operation = ref<RegistryManagementOperation>(props.mode === 'add' ? 'add' : 'edit');
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
const validationErrors = ref<Record<string, string>>({});

const draft = reactive<Draft>({
  siteId: '',
  root: '',
  variant: props.mode === 'add' ? 'native' : '',
  substrate: '',
  source: props.mode === 'add' ? 'manual' : '',
  sourceRef: '',
  reason: '',
  controlEndpoint: '',
  aliases: '',
  aimJson: '',
  clearControlEndpoint: false,
  clearAliases: false,
  clearAimJson: false,
});

const busy = computed(() => mutation.state.value === 'planning' || mutation.state.value === 'applying');
const mutationState = computed(() => mutation.state.value);
const isAdd = computed(() => operation.value === 'add');
const isEdit = computed(() => operation.value === 'edit');
const isMetadataOperation = computed(() => isAdd.value || isEdit.value);
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

const availableOperations = computed<RegistryManagementOperation[]>(() => {
  if (props.mode === 'add') return ['add'];
  const lifecycle = selectedSite.value?.lifecycleStatus;
  const available: RegistryManagementOperation[] = ['add'];
  if (lifecycle === 'active') available.push('edit', 'retire');
  if (lifecycle === 'retired') available.push('restore', 'purge');
  return available;
});

const operationOptions = computed<OperationOption[]>(() => [
  { value: 'add', label: 'Add a new Site', enabled: availableOperations.value.includes('add') },
  { value: 'edit', label: 'Edit Site metadata', enabled: availableOperations.value.includes('edit') },
  { value: 'retire', label: 'Retire a Site', enabled: availableOperations.value.includes('retire') },
  { value: 'restore', label: 'Restore a retired Site', enabled: availableOperations.value.includes('restore') },
  { value: 'purge', label: 'Purge retired metadata', enabled: availableOperations.value.includes('purge') },
]);

const operationTitle = computed(() => {
  switch (operation.value) {
    case 'add': return 'Add Site';
    case 'edit': return 'Edit Site';
    case 'retire': return 'Retire Site';
    case 'restore': return 'Restore Site';
    case 'purge': return 'Purge Site';
  }
});

const operationHelp = computed(() => {
  switch (operation.value) {
    case 'add': return 'Register a Site that does not yet have a canonical record. Start with its stable ID and absolute root folder.';
    case 'edit': return 'Choose an existing Site. The current record is loaded into the form; change only the metadata that needs correction.';
    case 'retire': return 'Retirement keeps a reversible registry tombstone. Choose the Site and record why it should no longer be active.';
    case 'restore': return 'Restore returns a retired record to the active catalog. Choose the Site and explain why it is being brought back.';
    case 'purge': return 'Purge permanently removes retired registry metadata. It never deletes the Site folder.';
  }
});

const statusText = computed(() => {
  if (!planResult.value) return 'No preview yet.';
  if (planResult.value.status === 'refused') return 'The registry refused this operation.';
  if (planResult.value.status === 'unchanged') return 'The registry reports no changes.';
  return planResult.value.mutationPerformed ? 'Change applied.' : 'Preview ready.';
});

const canPlan = computed(() => !busy.value && availableOperations.value.includes(operation.value));
const canApply = computed(() => Boolean(
  plannedRequest.value
  && planResult.value?.status === 'planned'
  && confirmApply.value
  && (operation.value !== 'purge' || purgeConfirmation.value === planResult.value?.confirmationRequired),
));

const confirmationRequired = computed(() => planResult.value?.confirmationRequired ?? '');
const technicalPreview = computed(() => planResult.value ? JSON.stringify(planResult.value, null, 2) : '');

const diffRows = computed(() => {
  const before = planResult.value?.before;
  const after = planResult.value?.after;
  if (!before && !after) return [];
  const fields: Array<{ label: string; before: unknown; after: unknown }> = [
    { label: 'Site ID', before: before?.siteId, after: after?.siteId },
    { label: 'Root', before: before?.siteRoot, after: after?.siteRoot },
    { label: 'Variant', before: before?.variant, after: after?.variant },
    { label: 'Substrate', before: before?.substrate, after: after?.substrate },
    { label: 'Control endpoint', before: before?.controlEndpoint, after: after?.controlEndpoint },
    { label: 'Aliases', before: before?.aliases.map((alias) => alias.value), after: after?.aliases.map((alias) => alias.value) },
    { label: 'Lifecycle', before: before?.lifecycleStatus, after: after?.lifecycleStatus },
    { label: 'Revision', before: before?.revision, after: after?.revision },
  ];
  return fields
    .filter((field) => JSON.stringify(field.before) !== JSON.stringify(field.after))
    .map((field) => ({
      label: field.label,
      before: formatValue(field.before),
      after: formatValue(field.after),
    }));
});

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function aliasesFromDraft(): string[] | undefined {
  const values = draft.aliases.split(',').map((item) => item.trim()).filter(Boolean);
  return values.length ? values : undefined;
}

function isManagementOperation(value: string): value is RegistryManagementOperation {
  return value === 'add' || value === 'edit' || value === 'retire' || value === 'restore' || value === 'purge';
}

function isAbsoluteRoot(value: string): boolean {
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/|https?:\/\/)/.test(value);
}

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
  selectedReference.value = '';
  previousReference.value = '';
  registry.clearSelection();
  draft.siteId = '';
  draft.root = '';
  draft.variant = 'native';
  draft.substrate = '';
  draft.source = 'manual';
  draft.sourceRef = '';
  draft.reason = '';
  draft.controlEndpoint = '';
  draft.aliases = '';
  draft.aimJson = '';
  draftDirty.value = false;
  clearPlan();
  validationErrors.value = {};
  reAdmitAvailable.value = false;
  reAdmit.value = false;
}

function validate(forApply = false): boolean {
  const errors: Record<string, string> = {};
  if (!availableOperations.value.includes(operation.value)) {
    errors.operation = selectedSite.value
      ? 'This operation is not available for the selected Site lifecycle.'
      : 'Choose an existing Site before using this operation.';
  }
  if (operation.value !== 'add' && !selectedReference.value) errors.reference = 'Choose an existing Site first.';
  if (operation.value === 'add') {
    if (!draft.siteId.trim()) errors.siteId = 'Enter a canonical Site ID.';
    else if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(draft.siteId.trim())) errors.siteId = 'Use letters, numbers, dots, underscores, or hyphens for the Site ID.';
    if (!draft.root.trim()) errors.root = 'Enter the absolute Site root folder.';
    else if (!isAbsoluteRoot(draft.root.trim())) errors.root = 'Enter an absolute root, such as D:/code/my-site or /home/andrey/my-site.';
  }
  if (['retire', 'restore', 'purge'].includes(operation.value) && !draft.reason.trim()) errors.reason = 'Enter a reason for this change.';
  if (isMetadataOperation.value) {
    if (draft.controlEndpoint.trim() && !draft.controlEndpoint.startsWith('http://') && !draft.controlEndpoint.startsWith('https://')) {
      errors.controlEndpoint = 'Control endpoint must use http:// or https://.';
    }
    if (draft.aimJson.trim() && !draft.clearAimJson) {
      try {
        JSON.parse(draft.aimJson);
      } catch {
        errors.aimJson = 'Purpose metadata must be valid JSON.';
      }
    }
  }
  if (forApply && operation.value === 'purge') {
    if (!confirmationRequired.value || purgeConfirmation.value !== confirmationRequired.value) {
      errors.purgeConfirmation = 'Type the exact canonical Site ID shown in the preview.';
    }
  }
  validationErrors.value = errors;
  return Object.keys(errors).length === 0;
}

function buildRequest(): SiteRegistryMutationRequest {
  const request: SiteRegistryMutationRequest = { operation: operation.value };
  if (operation.value === 'add') {
    request.site_id = draft.siteId.trim() || undefined;
    request.root = draft.root.trim() || undefined;
    if (draft.variant) request.variant = draft.variant;
    request.substrate = draft.substrate.trim() || undefined;
    request.source = draft.source.trim() || undefined;
    request.source_ref = draft.sourceRef.trim() || undefined;
    request.control_endpoint = draft.controlEndpoint.trim() || undefined;
    request.aliases = aliasesFromDraft();
    request.aim_json = draft.aimJson.trim() || undefined;
    request.reason = draft.reason.trim() || undefined;
    request.re_admit = reAdmit.value || undefined;
  } else if (operation.value === 'edit') {
    request.reference = selectedReference.value || undefined;
    request.root = draft.root.trim() || undefined;
    if (draft.variant) request.variant = draft.variant;
    request.substrate = draft.substrate.trim() || undefined;
    request.source = draft.source.trim() || undefined;
    request.source_ref = draft.sourceRef.trim() || undefined;
    request.control_endpoint = draft.clearControlEndpoint ? undefined : draft.controlEndpoint.trim() || undefined;
    request.aliases = draft.clearAliases ? undefined : aliasesFromDraft();
    request.aim_json = draft.clearAimJson ? undefined : draft.aimJson.trim() || undefined;
    request.clear_control_endpoint = draft.clearControlEndpoint || undefined;
    request.clear_aliases = draft.clearAliases || undefined;
    request.clear_aim_json = draft.clearAimJson || undefined;
    request.expected_revision = selectedSite.value?.revision;
  } else {
    request.reference = selectedReference.value || undefined;
    request.reason = draft.reason.trim() || undefined;
    request.expected_revision = selectedSite.value?.revision;
  }
  return request;
}

async function chooseExisting(): Promise<void> {
  const reference = selectedReference.value;
  if (draftDirty.value && !window.confirm('Discard unsaved registry change?')) {
    selectedReference.value = previousReference.value;
    return;
  }
  clearPlan();
  validationErrors.value = {};
  if (!reference) {
    registry.clearSelection();
    previousReference.value = '';
    draft.siteId = '';
    draft.root = '';
    draft.reason = '';
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
  if (draftDirty.value && !window.confirm('Discard unsaved registry change?')) {
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
    draft.siteId = '';
    draft.root = '';
    draft.reason = '';
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

function technicalDetails(result: SiteRegistryManagementResponse | null): string {
  return result ? JSON.stringify(result, null, 2) : '';
}

onMounted(async () => {
  const query = new URLSearchParams(window.location.search);
  const queryOperation = query.get('operation');
  const querySite = query.get('site');
  if (props.mode === 'manage' && queryOperation && isManagementOperation(queryOperation)) {
    operation.value = queryOperation;
    previousOperation.value = queryOperation;
  }
  if (querySite && props.mode === 'manage') {
    selectedReference.value = querySite;
    await registry.select(querySite);
    if (registry.selectedRecord.value) populateFromSite(registry.selectedRecord.value);
  }
});

watch(() => registry.selectedRecord.value, (site) => {
  if (site && !draftDirty.value && props.mode === 'manage') populateFromSite(site);
});
</script>

<template>
  <div class="mutation-page">
    <header class="console-bar">
      <div class="console-bar__identity">
        <a class="icon-link" href="/console/registry" title="Back to Site Registry" aria-label="Back to Site Registry"><ArrowLeft :size="16" aria-hidden="true" /></a>
        <div>
          <p class="eyebrow">Operator Console / Sites</p>
          <h1>{{ operationTitle }}</h1>
        </div>
      </div>
      <nav class="console-nav" aria-label="Site Registry">
        <a href="/console/registry">Sites</a>
        <a href="/console/registry/add" :aria-current="props.mode === 'add' ? 'page' : undefined">Add Site</a>
        <a href="/console/registry/manage" :aria-current="props.mode === 'manage' ? 'page' : undefined">Manage</a>
      </nav>
    </header>

    <main class="mutation-layout">
      <section class="form-panel" aria-labelledby="mutation-title">
        <header class="panel-header">
          <div>
            <p class="eyebrow">Governed registry change</p>
            <h2 id="mutation-title">{{ operationTitle }}</h2>
          </div>
          <span class="draft-state" :data-dirty="draftDirty">{{ draftDirty ? 'Unsaved changes' : 'No unsaved changes' }}</span>
        </header>
        <p class="workflow-note">{{ operationHelp }} Preview never changes the registry; applying requires explicit confirmation.</p>

        <form class="mutation-form" novalidate @submit.prevent="preview">
          <label v-if="props.mode === 'manage'" class="field">
            <span>Operation</span>
            <select v-model="operation" :disabled="busy" @change="onOperationChange">
              <option v-for="option in operationOptions" :key="option.value" :value="option.value" :disabled="!option.enabled">{{ option.label }}</option>
            </select>
            <small>Unavailable lifecycle operations remain visible so the state rule is clear.</small>
            <span v-if="validationErrors.operation" class="field-error">{{ validationErrors.operation }}</span>
          </label>

          <fieldset v-if="props.mode === 'manage' && operation !== 'add'" class="field-group">
            <legend>Existing Site</legend>
            <div class="picker-grid">
              <label class="field">
                <span>Find by ID, root, or alias</span>
                <span class="input-with-icon"><Search :size="15" aria-hidden="true" /><input v-model="siteSearch" type="search" autocomplete="off" placeholder="smart-scheduling or D:/code" /></span>
              </label>
              <label class="field">
                <span>Site record</span>
                <select v-model="selectedReference" :disabled="busy" @change="chooseExisting">
                  <option value="">Choose an existing Site...</option>
                  <option v-for="site in filteredSites" :key="site.siteId" :value="site.siteId">{{ site.siteId }} - {{ site.siteRoot }}</option>
                </select>
                <small v-if="selectedSite">Revision {{ selectedSite.revision }} / {{ selectedSite.lifecycleStatus }}</small>
                <small v-else>Choose a Site to load its current record and revision.</small>
                <span v-if="validationErrors.reference" class="field-error">{{ validationErrors.reference }}</span>
              </label>
            </div>
          </fieldset>

          <div v-if="isMetadataOperation" class="field-group">
            <h3>Site identity</h3>
            <div class="field-grid">
              <label class="field">
                <span>Canonical Site ID</span>
                <input v-model="draft.siteId" :readonly="isEdit" autocomplete="off" placeholder="smart-scheduling" @input="markDirty" />
                <small>Stable name used by Narada. Use letters, numbers, dots, underscores, or hyphens.</small>
                <span v-if="validationErrors.siteId" class="field-error">{{ validationErrors.siteId }}</span>
              </label>
              <label class="field field-span-2">
                <span>Site root folder</span>
                <input v-model="draft.root" autocomplete="off" :placeholder="draft.variant === 'wsl' ? '/mnt/d/code/my-site' : 'D:/code/my-site'" @input="markDirty" />
                <small>Use an absolute Windows, WSL, Linux, or Site URL root.</small>
                <span v-if="validationErrors.root" class="field-error">{{ validationErrors.root }}</span>
              </label>
            </div>

            <h3>Registration details</h3>
            <div class="field-grid">
              <label class="field">
                <span>Site variant</span>
                <select v-model="draft.variant" @change="markDirty">
                  <option v-if="isEdit" value="">Leave unchanged</option>
                  <option value="native">Native Windows</option>
                  <option value="wsl">WSL</option>
                  <option value="cloudflare">Cloudflare</option>
                  <option value="linux-user">Linux user</option>
                  <option value="linux-system">Linux system</option>
                </select>
              </label>
              <label class="field">
                <span>Runtime environment</span>
                <input v-model="draft.substrate" list="substrate-kinds" autocomplete="off" placeholder="windows" @input="markDirty" />
                <datalist id="substrate-kinds"><option value="windows" /><option value="wsl" /><option value="linux" /><option value="cloudflare" /></datalist>
              </label>
              <label class="field">
                <span>How it was found</span>
                <input v-model="draft.source" list="source-kinds" autocomplete="off" placeholder="manual" @input="markDirty" />
                <datalist id="source-kinds"><option value="manual" /><option value="filesystem" /><option value="launch_registry" /></datalist>
              </label>
              <label class="field">
                <span>Source reference</span>
                <input v-model="draft.sourceRef" autocomplete="off" placeholder="registry entry or file path" @input="markDirty" />
              </label>
              <label class="field field-span-2">
                <span>Reason</span>
                <input v-model="draft.reason" autocomplete="off" placeholder="e.g. moved to a new folder" @input="markDirty" />
                <small>Short operator-facing reason recorded with the change.</small>
                <span v-if="validationErrors.reason" class="field-error">{{ validationErrors.reason }}</span>
              </label>
              <label class="field field-span-2">
                <span>Control endpoint</span>
                <input v-model="draft.controlEndpoint" type="url" autocomplete="off" placeholder="https://example.invalid/control" :disabled="draft.clearControlEndpoint" @input="markDirty" />
                <label v-if="isEdit" class="clear-toggle"><input v-model="draft.clearControlEndpoint" type="checkbox" @change="markDirty" /> Clear stored endpoint</label>
                <span v-if="validationErrors.controlEndpoint" class="field-error">{{ validationErrors.controlEndpoint }}</span>
              </label>
              <label class="field field-span-2">
                <span>Other names</span>
                <input v-model="draft.aliases" autocomplete="off" placeholder="staccato, scheduling" :disabled="draft.clearAliases" @input="markDirty" />
                <small>Separate aliases with commas.</small>
                <label v-if="isEdit" class="clear-toggle"><input v-model="draft.clearAliases" type="checkbox" @change="markDirty" /> Clear all stored aliases</label>
              </label>
            </div>

            <details class="advanced">
              <summary>More metadata</summary>
              <label class="field">
                <span>Purpose metadata (JSON)</span>
                <textarea v-model="draft.aimJson" spellcheck="false" placeholder='{"purpose":"customer scheduling"}' :disabled="draft.clearAimJson" @input="markDirty" />
                <label v-if="isEdit" class="clear-toggle"><input v-model="draft.clearAimJson" type="checkbox" @change="markDirty" /> Clear purpose metadata</label>
                <span v-if="validationErrors.aimJson" class="field-error">{{ validationErrors.aimJson }}</span>
              </label>
            </details>
          </div>

          <label v-if="!isMetadataOperation" class="field lifecycle-reason">
            <span>Reason</span>
            <input v-model="draft.reason" autocomplete="off" placeholder="e.g. duplicate registry record" @input="markDirty" />
            <small>Short operator-facing reason recorded with the lifecycle change.</small>
            <span v-if="validationErrors.reason" class="field-error">{{ validationErrors.reason }}</span>
          </label>

          <div v-if="isAdd && reAdmitAvailable" class="recovery-note">
            <label class="clear-toggle"><input v-model="reAdmit" type="checkbox" @change="markReAdmitDirty" /><span><strong>Use the retired record</strong><small>A retired record matches this Site. Select this only if restoring it is intentional, then preview again.</small></span></label>
          </div>

          <div v-if="!isAdd && !selectedReference" class="empty-selection">
            Choose an existing Site before previewing this operation.
          </div>

          <div class="actions">
            <button class="button-primary" type="submit" :disabled="!canPlan"><Eye :size="16" aria-hidden="true" />{{ busy && mutationState === 'planning' ? 'Planning...' : 'Preview change' }}</button>
            <button class="button-secondary" type="button" :disabled="busy || !draftDirty" @click="discardDraft"><RotateCcw :size="16" aria-hidden="true" />Discard draft</button>
          </div>

          <div v-if="plannedRequest && planResult?.status === 'planned'" class="apply-strip">
            <label class="confirm-label"><input v-model="confirmApply" type="checkbox" :disabled="busy" /> <span>I reviewed this preview and want to apply it.</span></label>
            <label v-if="operation === 'purge'" class="field purge-confirm">
              <span>Type {{ confirmationRequired }} to confirm purge</span>
              <input v-model="purgeConfirmation" autocomplete="off" :placeholder="confirmationRequired" @input="validationErrors.purgeConfirmation = ''" />
              <small>Purge removes registry metadata permanently. It does not delete the Site folder.</small>
              <span v-if="validationErrors.purgeConfirmation" class="field-error">{{ validationErrors.purgeConfirmation }}</span>
            </label>
            <button class="button-primary" type="button" :disabled="!canApply || busy" @click="apply"><Save :size="16" aria-hidden="true" />{{ busy && mutationState === 'applying' ? 'Applying...' : 'Apply change' }}</button>
          </div>
        </form>
      </section>

      <aside class="preview-panel" aria-labelledby="preview-title">
        <header class="panel-header">
          <div>
            <p class="eyebrow">No mutation before confirmation</p>
            <h2 id="preview-title">Preview</h2>
          </div>
          <span class="status-badge" :data-status="planResult?.status || 'idle'">{{ statusText }}</span>
        </header>
        <p v-if="registry.error" class="inline-error" role="alert">{{ registry.error }}</p>
        <p v-if="mutation.error" class="inline-error" role="alert">{{ mutation.error }}</p>
        <p v-if="!planResult" class="preview-empty">Fill the form and preview the proposed registry result here.</p>
        <template v-else>
          <div v-if="diffRows.length" class="diff-table">
            <div v-for="row in diffRows" :key="row.label" class="diff-row">
              <span>{{ row.label }}</span><code>{{ row.before }}</code><span aria-hidden="true">→</span><code>{{ row.after }}</code>
            </div>
          </div>
          <p v-if="planResult.changes.length" class="preview-heading">Registry notes</p>
          <ul v-if="planResult.changes.length" class="preview-list"><li v-for="change in planResult.changes" :key="change">{{ change }}</li></ul>
          <p v-if="planResult.refusals.length" class="inline-error">Refused: {{ planResult.refusals.join(', ') }}</p>
          <p v-if="planResult.conflicts.length" class="inline-error">Conflicts: {{ planResult.conflicts.map((conflict) => conflict.message).join(', ') }}</p>
          <p v-if="planResult.confirmationRequired" class="danger-note">Exact confirmation required: {{ planResult.confirmationRequired }}</p>
          <details class="technical">
            <summary>Technical response</summary>
            <pre>{{ technicalDetails(planResult) }}</pre>
          </details>
        </template>
      </aside>
    </main>
  </div>
</template>

<style scoped>
.mutation-page { min-width: 320px; min-height: 100vh; background: var(--background); color: var(--text); }
.console-bar { display: flex; align-items: center; justify-content: space-between; gap: 18px; min-height: 64px; padding: 12px 20px; border-bottom: 1px solid var(--line); background: var(--surface); }
.console-bar__identity { display: flex; align-items: center; gap: 12px; min-width: 0; }
.console-bar h1 { margin: 0; font-size: 18px; font-weight: 650; overflow-wrap: anywhere; }
.eyebrow { margin: 0 0 4px; color: var(--muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
.icon-link { display: inline-grid; width: 34px; height: 34px; place-items: center; border: 1px solid var(--line); border-radius: var(--radius); color: var(--text); }
.console-nav { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.console-nav a { padding: 7px 9px; border: 1px solid transparent; border-radius: var(--radius); color: var(--text); font-size: 12px; text-decoration: none; }
.console-nav a:hover, .console-nav a[aria-current="page"] { border-color: var(--line); background: var(--surface-muted); }
.mutation-layout { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(320px, .75fr); gap: 20px; max-width: 1320px; margin: 0 auto; padding: 24px 20px 42px; align-items: start; }
.form-panel, .preview-panel { min-width: 0; padding: 18px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.panel-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 16px; }
.panel-header h2 { margin: 0; font-size: 17px; font-weight: 650; }
.draft-state, .status-badge { color: var(--muted); font-size: 12px; white-space: nowrap; }
.draft-state[data-dirty="true"] { color: var(--danger, #b42318); font-weight: 650; }
.status-badge[data-status="planned"] { color: var(--operator); }
.status-badge[data-status="applied"] { color: var(--success, #18794e); }
.status-badge[data-status="refused"] { color: var(--danger, #b42318); }
.workflow-note { margin: 0 0 18px; padding: 11px 13px; border-left: 3px solid var(--operator); background: var(--activity-bg); color: var(--text); font-size: 13px; line-height: 1.45; }
.field-group { min-width: 0; margin: 0 0 20px; padding: 0; border: 0; }
.field-group h3, .field-group legend { margin: 0 0 10px; padding: 0; font-size: 14px; font-weight: 650; }
.picker-grid, .field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px 15px; }
.field-span-2 { grid-column: 1 / -1; }
.field { display: grid; align-content: start; gap: 5px; min-width: 0; color: var(--text); font-size: 13px; }
.field input, .field select, .field textarea { width: 100%; min-height: 35px; border: 1px solid var(--line-strong); border-radius: calc(var(--radius) - 2px); padding: 7px 9px; background: var(--control-bg); color: var(--text); font: inherit; }
.field textarea { min-height: 96px; resize: vertical; }
.field input:disabled, .field select:disabled, .field textarea:disabled { opacity: .6; }
.field input:focus-visible, .field select:focus-visible, .field textarea:focus-visible, button:focus-visible, a:focus-visible, summary:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }
.field small, .clear-toggle, .preview-empty { color: var(--muted); font-size: 12px; line-height: 1.4; }
.input-with-icon { display: flex; align-items: center; gap: 7px; min-height: 35px; border: 1px solid var(--line-strong); border-radius: calc(var(--radius) - 2px); padding: 0 9px; background: var(--control-bg); }
.input-with-icon input { min-width: 0; min-height: 32px; padding: 0; border: 0; background: transparent; }
.field-error, .inline-error { color: var(--danger, #b42318); font-size: 12px; line-height: 1.4; }
.lifecycle-reason { max-width: 620px; margin-top: 6px; }
.clear-toggle, .confirm-label { display: flex; align-items: flex-start; gap: 7px; }
.clear-toggle input, .confirm-label input { width: auto; min-height: auto; margin-top: 2px; }
.advanced { margin-top: 13px; border-top: 1px solid var(--line); padding-top: 12px; }
.advanced summary { cursor: pointer; font-size: 13px; font-weight: 650; }
.advanced .field { margin-top: 12px; }
.recovery-note, .empty-selection { margin: 12px 0; padding: 10px 12px; border: 1px solid var(--line); background: var(--activity-bg); }
.recovery-note { border-left: 3px solid var(--warning, #996500); }
.recovery-note strong { display: block; color: var(--text); }
.actions { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; margin-top: 18px; }
button { display: inline-flex; align-items: center; gap: 7px; min-height: 35px; border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 7px 11px; background: var(--surface); color: var(--text); cursor: pointer; font: inherit; font-size: 13px; }
button:hover:not(:disabled) { background: var(--surface-muted); }
button:disabled { cursor: not-allowed; opacity: .55; }
.button-primary { border-color: var(--button-border); background: var(--button-border); color: var(--button-text); }
.apply-strip { display: grid; gap: 12px; margin-top: 14px; border-top: 1px solid var(--line); padding-top: 14px; }
.confirm-label { font-size: 13px; }
.purge-confirm { max-width: 440px; }
.preview-panel { position: sticky; top: 16px; }
.preview-heading { margin: 16px 0 7px; font-size: 13px; font-weight: 650; }
.diff-table { display: grid; gap: 1px; border: 1px solid var(--line); background: var(--line); }
.diff-row { display: grid; grid-template-columns: 110px minmax(0, 1fr) 18px minmax(0, 1fr); gap: 8px; align-items: start; padding: 9px; background: var(--surface); font-size: 12px; }
.diff-row > span:first-child { color: var(--muted); }
.diff-row code { overflow-wrap: anywhere; white-space: pre-wrap; }
.preview-list { margin: 0; padding-left: 19px; color: var(--muted); font-size: 12px; line-height: 1.5; }
.preview-list li { margin-bottom: 5px; }
.danger-note { color: var(--danger, #b42318); font-size: 12px; line-height: 1.4; }
.technical { margin-top: 16px; }
.technical summary { cursor: pointer; color: var(--muted); font-size: 12px; }
.technical pre { max-height: 340px; margin-top: 8px; overflow: auto; padding: 10px; background: var(--code-bg); color: var(--code-text); font: 11px/1.45 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 900px) {
  .console-bar { align-items: flex-start; flex-wrap: wrap; }
  .console-nav { width: 100%; }
  .mutation-layout { grid-template-columns: 1fr; padding: 18px 12px 30px; }
  .preview-panel { position: static; }
}
@media (max-width: 620px) {
  .console-bar { padding: 12px; }
  .field-grid, .picker-grid { grid-template-columns: 1fr; }
  .field-span-2 { grid-column: auto; }
  .diff-row { grid-template-columns: 1fr; gap: 4px; }
  .diff-row > span[aria-hidden="true"] { display: none; }
}
</style>
