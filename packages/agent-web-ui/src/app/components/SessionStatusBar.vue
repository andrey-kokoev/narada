<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import BoxVisibilitySelector, { type BoxVisibilitySelectorItem } from './BoxVisibilitySelector.vue';
import BoxRowShell from './BoxRowShell.vue';
import ProjectionVerbositySelect from './ProjectionVerbositySelect.vue';
import ProjectionViewCustomizer from './ProjectionViewCustomizer.vue';
import { useBoxVisibilityPreference } from '../composables/useBoxVisibilityPreference';
import { AGENT_WEB_UI_PREFERENCE_KEYS } from '../lib/browserPreferences.ts';
import { NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD } from '@narada2/nars-client-projection-contract';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@narada2/ui-vue';
import type { AgentActivityState } from '../composables/useAgentActivity';
import type { useCloudflareProjection } from '../composables/useCloudflareProjection';
import type { HealthIntelligenceSummary } from '../composables/useHealthStatus';
import type { IntelligenceReconfigurationUiState } from '../composables/useIntelligenceReconfiguration';
import type { ProjectionVerbosity } from '../composables/useProjectionVerbosity';
import type { SessionIdentitySummary } from '../composables/useNarsEvents';
import type { CustomProjectionView } from '../composables/useProjectionVerbosity';
import type { ProjectionViewDraft, ProjectionViewFacetOption, ProjectionViewOption } from '../lib/projectionViews';
import {
  isCompleteIntelligenceSelection,
  modelsForProvider,
  providerChoicesFor,
  sameIntelligenceSelection,
  thinkingChoicesFor,
  type IntelligenceSelectionDraft,
} from '../lib/intelligenceSelection';

const props = defineProps<{
  eventEndpoint: string | null;
  healthEndpoint: string | null;
  healthTransport: string;
  streamText: string;
  healthText: string;
  intelligence: HealthIntelligenceSummary;
  intelligenceReconfiguration: IntelligenceReconfigurationUiState;
  intelligenceReconfigurationRefreshing?: boolean;
  sessionIdentity: SessionIdentitySummary;
  summarizedStateSampleCount: number;
  verbosity: ProjectionVerbosity;
  viewId: string;
  viewOptions: readonly ProjectionViewOption[];
  customViews: readonly CustomProjectionView[];
  viewFacetOptions: readonly ProjectionViewFacetOption[];
  agentActivity: AgentActivityState;
  authorityTransition: Record<string, unknown> | null;
  supportsProtocolMethod: (method: string) => boolean;
  cloudflareProjection: ReturnType<typeof useCloudflareProjection>;
  collapsible?: boolean;
}>();
const emit = defineEmits<{
  'update:view': [value: string];
  'save-view': [view: ProjectionViewDraft];
  'delete-view': [id: string];
  'publish-cloudflare': [cloudflareApiBaseUrl: string];
  'request-intelligence-reconfiguration': [change: IntelligenceSelectionDraft];
  'cancel-intelligence-reconfiguration': [];
  'refresh-intelligence-reconfiguration': [];
  collapse: [];
}>();
const cloudflareApiBaseUrl = ref(props.cloudflareProjection.defaultApiBaseUrl.value);
const copyLabel = ref('Copy');
const draftProvider = ref<string | null>(props.intelligence.provider);
const draftModel = ref<string | null>(props.intelligence.model);
const draftModelRef = ref<string | null>(props.intelligence.modelRef ?? null);
const draftThinking = ref<string | null>(props.intelligence.thinking);
const STATUS_BOX_STORAGE_KEY = AGENT_WEB_UI_PREFERENCE_KEYS.statusBoxes;
const DEFAULT_STATUS_BOX_IDS = ['events', 'health', 'intelligence', 'authority', 'view', 'cloudflare'] as const;
type StatusBoxId = typeof DEFAULT_STATUS_BOX_IDS[number];
const DEFAULT_VISIBLE_STATUS_BOX_IDS: readonly StatusBoxId[] = ['intelligence', 'view'];
const statusBoxDefinitions: Record<StatusBoxId, Omit<BoxVisibilitySelectorItem, 'visible'>> = {
  events: { id: 'events', label: 'Events', description: 'NARS event stream endpoint used by this browser.' },
  health: { id: 'health', label: 'Health', description: 'HTTP health endpoint used to poll the runtime.' },
  intelligence: { id: 'intelligence', label: 'Intelligence', description: 'Provider, model, and thinking level.' },
  authority: { id: 'authority', label: 'Authority Detail', description: 'Low-level write authority and stale-session posture.' },
  view: { id: 'view', label: 'View', description: 'Projection level for the event feed.' },
  cloudflare: { id: 'cloudflare', label: 'Cloudflare Projection', description: 'Optional remote browser projection controls.' },
};
const availableStatusBoxIds = computed(() => DEFAULT_STATUS_BOX_IDS.filter((id) => id !== 'cloudflare' || props.cloudflareProjection.available.value));
const statusBoxVisibility = useBoxVisibilityPreference({
  storageKey: STATUS_BOX_STORAGE_KEY,
  itemIds: DEFAULT_STATUS_BOX_IDS,
  defaultVisibleIds: DEFAULT_VISIBLE_STATUS_BOX_IDS,
  availableIds: availableStatusBoxIds,
});
const statusBoxSelectorItems = computed(() => availableStatusBoxIds.value.map((id) => ({
  ...statusBoxDefinitions[id],
  visible: statusBoxVisibility.isVisible(id),
})));

async function copyRemoteUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    copyLabel.value = 'Copied';
    setTimeout(() => { copyLabel.value = 'Copy'; }, 1400);
  } catch {
    copyLabel.value = 'Copy failed';
    setTimeout(() => { copyLabel.value = 'Copy'; }, 1800);
  }
}

function isStatusBoxVisible(id: StatusBoxId): boolean {
  return statusBoxVisibility.isVisible(id);
}

function toggleStatusBox(id: string) {
  statusBoxVisibility.toggle(id);
}

function resetStatusBoxes() {
  statusBoxVisibility.reset();
}

function authorityText(authority: Record<string, unknown> | null): string {
  if (!authority) return 'not advertised';
  const host = typeof authority.authority_runtime_host === 'string' ? authority.authority_runtime_host : 'unknown';
  const epoch = Number.isInteger(authority.authority_epoch) ? ` e${authority.authority_epoch}` : '';
  const transition = typeof authority.authority_transition_state === 'string' && authority.authority_transition_state ? ` · ${authority.authority_transition_state}` : '';
  const writes = typeof authority.source_write_admission === 'string' && authority.source_write_admission ? ` · writes ${authority.source_write_admission}` : '';
  return `${host}${epoch}${transition}${writes}`;}

function reattachText(authority: Record<string, unknown> | null): string | null {
  if (!authority?.stale_source) return null;
  const reattach = authority.reattach && typeof authority.reattach === 'object' && !Array.isArray(authority.reattach) ? authority.reattach as Record<string, unknown> : null;
  const target = typeof reattach?.target_session_id === 'string' && reattach.target_session_id
    ? reattach.target_session_id
    : typeof authority.superseded_by_session_id === 'string' && authority.superseded_by_session_id
      ? authority.superseded_by_session_id
      : typeof authority.authority_locator_ref === 'string' && authority.authority_locator_ref
        ? authority.authority_locator_ref
        : 'target authority';
  return `Stale authority; reattach to ${target}.`;
}

const statusTooltips = {
  events: 'NARS event stream endpoint used by this browser to receive session events.',
  health: 'HTTP health endpoint used to poll current runtime state and identity.',
  intelligence: 'Active intelligence provider, model, and thinking level reported by NARS health.',
  authority: 'Low-level authority detail. Connection is the preferred operator-facing summary for whether this browser can send input.',
  view: 'Projection level for the event feed: conversation, operations, diagnostics, or raw.',
  cloudflare: 'Optional remote browser projection for exposing this local NARS session through a Cloudflare Worker.',
};

const providerChoices = computed(() => providerChoicesFor(props.intelligence).map(({ provider }) => provider));
const modelChoiceRecords = computed(() => modelsForProvider(props.intelligence, draftProvider.value));
const modelChoices = computed(() => modelChoiceRecords.value.map(({ model }) => model));
const thinkingChoices = computed(() => thinkingChoicesFor(props.intelligence, draftProvider.value, draftModel.value));
const providerInputValue = computed(() => draftProvider.value ?? '');
const modelInputValue = computed(() => draftModel.value ?? '');
const thinkingInputValue = computed(() => draftThinking.value ?? '');
const hasQualifiedCatalog = computed(() => props.intelligence.selectionChoices.length > 0);
const activeSelection = computed<IntelligenceSelectionDraft>(() => ({
  inferenceProvider: props.intelligence.provider,
  model: props.intelligence.model,
  modelRef: props.intelligence.modelRef ?? null,
  thinking: props.intelligence.thinking,
}));
const draftSelection = computed<IntelligenceSelectionDraft>(() => ({
  inferenceProvider: draftProvider.value,
  model: draftModel.value,
  modelRef: draftModelRef.value,
  thinking: draftThinking.value,
}));
const synchronizedSelection = ref<IntelligenceSelectionDraft>({ ...activeSelection.value });
const draftChanged = computed(() => !sameIntelligenceSelection(activeSelection.value, draftSelection.value));
const remoteOperationPending = computed(() => ['dispatching', 'accepted', 'switching', 'cancelling', 'unconfirmed'].includes(props.intelligenceReconfiguration.phase));
const canEditIntelligence = computed(() => props.supportsProtocolMethod(NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD)
  && hasQualifiedCatalog.value);
const canRequestChange = computed(() => props.supportsProtocolMethod(NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD)
  && draftChanged.value
  && isCompleteIntelligenceSelection(props.intelligence, draftSelection.value)
  && !remoteOperationPending.value);
const canCancelRemote = computed(() => props.supportsProtocolMethod('runtime.intelligence.reconfigure.cancel')
  && ['dispatching', 'accepted'].includes(props.intelligenceReconfiguration.phase));
const showDraftActions = computed(() => draftChanged.value && !remoteOperationPending.value);
const showReconcileAction = computed(() => props.intelligenceReconfiguration.phase === 'unconfirmed');
const showChangeActions = computed(() => showDraftActions.value || canCancelRemote.value || showReconcileAction.value);
const intelligenceCapabilityMessage = computed(() => {
  if (!props.supportsProtocolMethod(NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD)) {
    return 'Runtime intelligence reconfiguration is unavailable on this attached surface.';
  }
  if (!props.intelligence.selectionChoices.length) {
    return 'Qualified intelligence capabilities are unavailable; current selection is read-only.';
  }
  return null;
});
const operationMessage = computed(() => {
  if (props.intelligenceReconfiguration.message) return props.intelligenceReconfiguration.message;
  switch (props.intelligenceReconfiguration.phase) {
    case 'dispatching': return 'sending change request';
    case 'accepted': return 'change request accepted';
    case 'switching': return 'switching intelligence';
    case 'cancelling': return 'cancelling change request';
    case 'applied': return 'change applied; waiting for health convergence';
    case 'cancelled': return 'change request cancelled';
    case 'refused': return 'change request refused';
    case 'failed': return 'change request failed';
    case 'unconfirmed': return 'runtime result unconfirmed; refresh state to reconcile';
    default: return null;
  }
});
const modelSelectStyle = computed(() => ({
  inlineSize: selectInlineSize(modelChoices.value, modelInputValue.value),
}));
const thinkingSelectStyle = computed(() => ({
  minInlineSize: selectInlineSize(thinkingChoices.value, thinkingInputValue.value),
}));
const intelligenceControlStackStyle = computed(() => ({
  minInlineSize: selectInlineSize(providerChoices.value, providerInputValue.value),
}));

function selectInlineSize(choices: readonly string[], currentValue: string): string {
  return selectInlineSizeValue(choices, currentValue);
}

function selectInlineSizeValue(choices: readonly string[], currentValue: string): string {
  const longest = Math.max(1, ...[currentValue, ...choices].map((choice) => [...choice].length));
  return `calc(${longest}ch + 28px)`;
}

watch(
  () => [props.intelligence.provider, props.intelligence.model, props.intelligence.modelRef, props.intelligence.thinking, props.intelligenceReconfiguration.phase] as const,
  () => {
    const locallyEdited = !sameIntelligenceSelection(synchronizedSelection.value, draftSelection.value);
    synchronizedSelection.value = { ...activeSelection.value };
    const appliedAndConverged = props.intelligenceReconfiguration.phase === 'applied'
      && sameIntelligenceSelection(activeSelection.value, draftSelection.value);
    if (!remoteOperationPending.value && (!locallyEdited || props.intelligenceReconfiguration.phase === 'cancelled' || appliedAndConverged)) {
      draftProvider.value = activeSelection.value.inferenceProvider;
      draftModel.value = activeSelection.value.model;
      draftModelRef.value = activeSelection.value.modelRef ?? null;
      draftThinking.value = activeSelection.value.thinking;
    }
  },
);

function requestIntelligenceChange(change: IntelligenceSelectionDraft) {
  if (!props.supportsProtocolMethod(NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD)) return;
  emit('request-intelligence-reconfiguration', change);
}

function requestProviderChange(event: Event) {
  const provider = (event.target as HTMLInputElement | HTMLSelectElement | null)?.value.trim() ?? '';
  if (!provider || provider === draftProvider.value) return;
  draftProvider.value = provider;
  draftModel.value = null;
  draftModelRef.value = null;
  draftThinking.value = null;
}

function requestModelChange(event: Event) {
  const model = (event.target as HTMLInputElement | HTMLSelectElement | null)?.value.trim() ?? '';
  if (!model || model === draftModel.value) return;
  draftModel.value = model;
  draftModelRef.value = modelChoiceRecords.value.find((choice) => choice.model === model)?.modelRef ?? null;
  draftThinking.value = null;
}

function requestThinkingChange(event: Event) {
  const thinking = (event.target as HTMLSelectElement | null)?.value.trim() ?? '';
  if (!thinking || thinking === draftThinking.value) return;
  draftThinking.value = thinking;
}

function requestDraftChange() {
  if (!canRequestChange.value) return;
  requestIntelligenceChange(draftSelection.value);
}

function cancelDraftChange() {
  if (canCancelRemote.value) {
    emit('cancel-intelligence-reconfiguration');
    return;
  }
  if (remoteOperationPending.value) return;
  if (!draftChanged.value) return;
  draftProvider.value = activeSelection.value.inferenceProvider;
  draftModel.value = activeSelection.value.model;
  draftModelRef.value = activeSelection.value.modelRef ?? null;
  draftThinking.value = activeSelection.value.thinking;
  synchronizedSelection.value = { ...activeSelection.value };
}

</script>

<template>
  <TooltipProvider :delay-duration="250">
    <BoxRowShell row-label="Session status" class-name="status" :class="{ 'status-has-projection-control': cloudflareProjection.available.value }">
      <Tooltip v-if="isStatusBoxVisible('events')">
        <TooltipTrigger as-child>
          <div>
            <span class="label">Events</span>
            <span>{{ eventEndpoint ?? 'not configured' }}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">{{ statusTooltips.events }}</TooltipContent>
      </Tooltip>

      <Tooltip v-if="isStatusBoxVisible('health')">
        <TooltipTrigger as-child>
          <div>
            <span class="label">Health</span>
            <span>{{ healthEndpoint ? `${healthEndpoint} (${healthTransport})` : 'not configured' }}</span>
            <span v-if="streamText && streamText !== 'connected'" class="retention-note">{{ streamText }}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">{{ statusTooltips.health }}</TooltipContent>
      </Tooltip>

      <Tooltip v-if="isStatusBoxVisible('intelligence')">
        <TooltipTrigger as-child>
          <div class="intelligence-status-box">
            <span class="label">Intelligence</span>
            <div class="intelligence-control-stack" :style="intelligenceControlStackStyle">
              <template v-if="canEditIntelligence">
                <select
                  class="intelligence-provider-select"
                  :value="providerInputValue"
                  :disabled="remoteOperationPending"
                  aria-label="Provider"
                  @change="requestProviderChange"
                  @click.stop
                  @keydown.stop
                >
                  <option value="" disabled>Select provider</option>
                  <option v-for="choice in providerChoices" :key="choice" :value="choice">{{ choice }}</option>
                </select>
              </template>
              <span v-else class="status-token-line status-secondary-token-line intelligence-control-line intelligence-readonly-controls">
                <span>{{ draftProvider ?? 'not advertised' }}</span>
                <span class="session-token-separator">·</span>
                <span>{{ draftModel ?? 'model not advertised' }}</span>
                <span class="session-token-separator">·</span>
                <span>{{ draftThinking ?? 'thinking not configurable' }}</span>
              </span>
              <span v-if="canEditIntelligence" class="status-token-line status-secondary-token-line intelligence-control-line">
                <select
                  class="intelligence-model-select"
                  :style="modelSelectStyle"
                  :value="modelInputValue"
                  aria-label="Model"
                  :disabled="remoteOperationPending || !draftProvider || !modelChoices.length"
                  @change="requestModelChange"
                  @click.stop
                  @keydown.stop
                >
                  <option value="" disabled>{{ draftProvider ? (modelChoices.length ? 'Select model' : 'Capabilities unavailable') : 'Select provider first' }}</option>
                  <option v-for="choice in modelChoices" :key="choice" :value="choice">{{ choice }}</option>
                </select>
                <template v-if="modelChoices.length && thinkingChoices.length">
                  <span class="session-token-separator">·</span>
                </template>
                <select
                  v-if="thinkingChoices.length"
                  class="intelligence-thinking-select"
                  :style="thinkingSelectStyle"
                  :value="thinkingInputValue"
                  aria-label="Thinking level"
                  :disabled="remoteOperationPending || !draftModel"
                  @change="requestThinkingChange"
                  @click.stop
                  @keydown.stop
                >
                  <option value="" disabled>Select thinking</option>
                  <option v-for="choice in thinkingChoices" :key="choice" :value="choice">{{ choice }}</option>
                </select>
                <template v-else>
                  <span>{{ draftModel ? (draftThinking ?? 'thinking not configurable') : 'select model first' }}</span>
                </template>
              </span>
            </div>
            <div v-if="showChangeActions" class="intelligence-change-actions">
              <button v-if="showDraftActions" type="button" :disabled="!canRequestChange" @click.stop="requestDraftChange">
                Request change
              </button>
              <button v-if="canCancelRemote" type="button" @click.stop="cancelDraftChange">
                Cancel request
              </button>
              <button
                v-else-if="showReconcileAction"
                type="button"
                :disabled="intelligenceReconfigurationRefreshing"
                @click.stop="emit('refresh-intelligence-reconfiguration')"
              >
                {{ intelligenceReconfigurationRefreshing ? 'Refreshing state' : 'Refresh state' }}
              </button>
              <button v-else-if="showDraftActions" type="button" @click.stop="cancelDraftChange">
                Discard draft
              </button>
            </div>
            <span v-if="intelligenceCapabilityMessage" class="retention-note">{{ intelligenceCapabilityMessage }}</span>
            <span v-if="operationMessage" class="retention-note">{{ operationMessage }}</span>
            <span v-else-if="draftChanged" class="retention-note">draft not requested</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">{{ statusTooltips.intelligence }}</TooltipContent>
      </Tooltip>

      <Tooltip v-if="isStatusBoxVisible('authority')">
        <TooltipTrigger as-child>
          <div>
            <span class="label">Authority</span>
            <span>{{ authorityText(authorityTransition) }}</span>
            <span v-if="reattachText(authorityTransition)" class="retention-note">{{ reattachText(authorityTransition) }}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">{{ statusTooltips.authority }}</TooltipContent>
      </Tooltip>

      <div v-if="isStatusBoxVisible('view')" class="view-status-box">
        <div class="view-status-box-header">
          <Tooltip>
            <TooltipTrigger as-child>
              <label class="label" for="projection-verbosity">View</label>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">{{ statusTooltips.view }}</TooltipContent>
          </Tooltip>
          <ProjectionViewCustomizer
            :active-view-id="viewId"
            :view-options="viewOptions"
            :custom-views="customViews"
            :facet-options="viewFacetOptions"
            @select="emit('update:view', $event)"
            @save="emit('save-view', $event)"
            @delete="emit('delete-view', $event)"
          />
        </div>
        <div class="view-status-box-row">
          <ProjectionVerbositySelect :model-value="viewId" :options="viewOptions" @update:model-value="emit('update:view', $event)" />
        </div>
        <span v-if="summarizedStateSampleCount && (verbosity === 'diagnostics' || verbosity === 'raw')" class="retention-note">{{ summarizedStateSampleCount }} routine status update{{ summarizedStateSampleCount === 1 ? '' : 's' }} folded into State</span>
      </div>

      <Tooltip v-if="isStatusBoxVisible('cloudflare')">
        <TooltipTrigger as-child>
          <div class="projection-control">
            <div class="projection-control-heading">
              <label class="label" for="cloudflare-api-base-url">Projection</label>
              <span class="projection-status-label">{{ cloudflareProjection.statusText.value }}</span>
            </div>
            <div class="projection-control-row">
              <input
                id="cloudflare-api-base-url"
                v-model="cloudflareApiBaseUrl"
                :disabled="cloudflareProjection.busy.value"
                placeholder="Cloudflare projection Worker URL"
              />
              <div class="projection-publish-stack">
                <button type="button" :disabled="cloudflareProjection.busy.value || !cloudflareApiBaseUrl.trim()" @click="emit('publish-cloudflare', cloudflareApiBaseUrl)">
                  {{ cloudflareProjection.busy.value ? 'Publishing' : 'Publish' }}
                </button>
              </div>
            </div>
            <div v-if="cloudflareProjection.remoteUrl.value" class="projection-actions">
              <a class="projection-link" :href="cloudflareProjection.remoteUrl.value" target="_blank" rel="noreferrer">Open remote UI</a>
              <button type="button" class="projection-copy" @click="copyRemoteUrl(cloudflareProjection.remoteUrl.value)">{{ copyLabel }}</button>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">{{ statusTooltips.cloudflare }}</TooltipContent>
      </Tooltip>

      <template #controls>
        <div class="status-row-actions">
          <button
            v-if="collapsible"
            type="button"
            class="status-row-collapse-toggle"
            aria-expanded="true"
            aria-label="Collapse status boxes"
            title="Collapse status boxes"
            @click="emit('collapse')"
          >
            <span aria-hidden="true">^</span>
          </button>
          <BoxVisibilitySelector
            :boxes="statusBoxSelectorItems"
            panel-id="status-row-box-selector-panel"
            trigger-label="Status boxes"
            title="Status Boxes"
            description="Select which boxes are shown in the session status row."
            panel-aria-label="Status row boxes"
            empty-text="No matching status boxes."
            placement="row-control"
            @toggle="toggleStatusBox"
            @reset="resetStatusBoxes"
          />
        </div>
      </template>
    </BoxRowShell>
  </TooltipProvider>
</template>
