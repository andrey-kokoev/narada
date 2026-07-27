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
  collapse: [];
}>();
const cloudflareApiBaseUrl = ref(props.cloudflareProjection.defaultApiBaseUrl.value);
const copyLabel = ref('Copy');
const draftProvider = ref<string | null>(props.intelligence.provider);
const draftModel = ref<string | null>(props.intelligence.model);
const draftThinking = ref<string | null>(props.intelligence.thinking);
const requestPending = ref(false);
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
const activeSelection = computed<IntelligenceSelectionDraft>(() => ({
  inferenceProvider: props.intelligence.provider,
  model: props.intelligence.model,
  thinking: props.intelligence.thinking,
}));
const draftSelection = computed<IntelligenceSelectionDraft>(() => ({
  inferenceProvider: draftProvider.value,
  model: draftModel.value,
  thinking: draftThinking.value,
}));
const draftChanged = computed(() => !sameIntelligenceSelection(activeSelection.value, draftSelection.value));
const canRequestChange = computed(() => props.supportsProtocolMethod(NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD)
  && draftChanged.value
  && isCompleteIntelligenceSelection(props.intelligence, draftSelection.value));
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
  () => [props.intelligence.provider, props.intelligence.model, props.intelligence.thinking] as const,
  () => {
    if (sameIntelligenceSelection(activeSelection.value, draftSelection.value)) requestPending.value = false;
    if (!draftChanged.value || !requestPending.value) {
      draftProvider.value = activeSelection.value.inferenceProvider;
      draftModel.value = activeSelection.value.model;
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
  draftThinking.value = null;
  requestPending.value = false;
}

function requestModelChange(event: Event) {
  const model = (event.target as HTMLInputElement | HTMLSelectElement | null)?.value.trim() ?? '';
  if (!model || model === draftModel.value) return;
  draftModel.value = model;
  draftThinking.value = null;
  requestPending.value = false;
}

function requestThinkingChange(event: Event) {
  const thinking = (event.target as HTMLSelectElement | null)?.value.trim() ?? '';
  if (!thinking || thinking === draftThinking.value) return;
  draftThinking.value = thinking;
  requestPending.value = false;
}

function requestDraftChange() {
  if (!canRequestChange.value) return;
  requestPending.value = true;
  requestIntelligenceChange(draftSelection.value);
}

function cancelDraftChange() {
  draftProvider.value = activeSelection.value.inferenceProvider;
  draftModel.value = activeSelection.value.model;
  draftThinking.value = activeSelection.value.thinking;
  requestPending.value = false;
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
              <select
                class="intelligence-provider-select"
                :value="providerInputValue"
                :disabled="!providerChoices.length"
                aria-label="Provider"
                @change="requestProviderChange"
                @click.stop
                @keydown.stop
              >
                <option value="" disabled>{{ providerChoices.length ? 'Select provider' : 'Capabilities unavailable' }}</option>
                <option v-for="choice in providerChoices" :key="choice" :value="choice">{{ choice }}</option>
              </select>
              <span class="status-token-line status-secondary-token-line intelligence-control-line">
                <select
                  class="intelligence-model-select"
                  :style="modelSelectStyle"
                  :value="modelInputValue"
                  aria-label="Model"
                  :disabled="!draftProvider || !modelChoices.length"
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
                  :disabled="!draftModel"
                  @change="requestThinkingChange"
                  @click.stop
                  @keydown.stop
                >
                  <option value="" disabled>Select thinking</option>
                  <option v-for="choice in thinkingChoices" :key="choice" :value="choice">{{ choice }}</option>
                </select>
                <template v-else-if="intelligence.thinking">
                  <span>{{ intelligence.thinking }}</span>
                </template>
              </span>
            </div>
            <div class="intelligence-change-actions">
              <button type="button" :disabled="!canRequestChange || requestPending" @click.stop="requestDraftChange">
                Request change
              </button>
              <button type="button" :disabled="!draftChanged && !requestPending" @click.stop="cancelDraftChange">
                Cancel
              </button>
            </div>
            <span v-if="requestPending" class="retention-note">change requested</span>
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