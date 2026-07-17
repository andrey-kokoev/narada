<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { Check, Eye, RotateCcw, Save, Search, ShieldAlert } from 'lucide-vue-next';
import type { SiteRegistryManagementResponse } from '@narada2/site-registry-contract';
import OperatorConsoleShell from '../components/OperatorConsoleShell.vue';
import { useSiteRegistryWorkflow } from '../site-registry/composables/useSiteRegistryWorkflow';
import { useOperatorWorkspaceRouteDirectory } from '../console/route-directory';

const props = defineProps<{ mode: 'add' | 'manage' }>();
const workflow = useSiteRegistryWorkflow(props.mode);
const {
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
  filteredSites,
  operationOptions,
  canPlan,
  canApply,
  confirmationRequired,
  diffRows,
  markDirty,
  markReAdmitDirty,
  chooseExisting,
  onOperationChange,
  discardDraft,
  preview,
  apply,
} = workflow;
const routeDirectory = useOperatorWorkspaceRouteDirectory();
const routeDirectoryUnavailable = computed(() => Boolean(routeDirectory?.error.value));

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

function technicalDetails(result: SiteRegistryManagementResponse | null): string {
  return result ? JSON.stringify(result, null, 2) : '';
}

function allowNavigation(): boolean {
  return !draftDirty.value
    || typeof window === 'undefined'
    || window.confirm('Discard unsaved registry change?');
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!draftDirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}

onMounted(() => {
  void workflow.initializeFromLocation();
  window.addEventListener('beforeunload', handleBeforeUnload);
});

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
});
</script>


<template>
  <OperatorConsoleShell
    eyebrow="Operator Console / Sites"
    :title="operationTitle"
    back-navigation-key="sites"
    back-label="Back to Site Registry"
    :navigation-key="props.mode === 'add' ? 'add' : 'manage'"
    :navigation-guard="allowNavigation"
  >
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
        <p v-if="routeDirectoryUnavailable" class="recovery-note" role="status">
          Live route directory unavailable. Navigation and discovery may be limited, but this page remains governed by the canonical registry authority.
        </p>

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
  </OperatorConsoleShell>
</template>

<style scoped>
.eyebrow {
  margin: 0 0 4px;
  color: var(--muted);
  font-size: 11px;
  letter-spacing: .08em;
  text-transform: uppercase;
}

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
  .mutation-layout { grid-template-columns: 1fr; padding: 18px 12px 30px; }
  .preview-panel { position: static; }
}
@media (max-width: 620px) {
  .field-grid, .picker-grid { grid-template-columns: 1fr; }
  .field-span-2 { grid-column: auto; }
  .diff-row { grid-template-columns: 1fr; gap: 4px; }
  .diff-row > span[aria-hidden="true"] { display: none; }
}
</style>
