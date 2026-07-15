<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import BoxVisibilitySelector, { type BoxVisibilitySelectorItem } from './BoxVisibilitySelector.vue';
import BoxRowShell from './BoxRowShell.vue';
import ProjectionVerbositySelect from './ProjectionVerbositySelect.vue';
import { useBoxVisibilityPreference } from '../composables/useBoxVisibilityPreference';
import { AGENT_WEB_UI_PREFERENCE_KEYS } from '../lib/browserPreferences.js';
import { NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD } from '@narada2/nars-client-projection-contract';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@narada2/ui-vue';
import type { AgentActivityState } from '../composables/useAgentActivity';
import type { useCloudflareProjection } from '../composables/useCloudflareProjection';
import type { HealthIntelligenceSummary } from '../composables/useHealthStatus';
import type { ProjectionVerbosity } from '../composables/useProjectionVerbosity';
import type { SessionIdentitySummary } from '../composables/useNarsEvents';
import type { SurfaceAffordanceSummary } from '../composables/useSurfaceAffordances';

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
  verbosityLevels: readonly ProjectionVerbosity[];
  agentActivity: AgentActivityState;
  authorityTransition: Record<string, unknown> | null;
  surfaceAffordances: SurfaceAffordanceSummary;
  supportsProtocolMethod: (method: string) => boolean;
  cloudflareProjection: ReturnType<typeof useCloudflareProjection>;
  collapsible?: boolean;
}>();
const emit = defineEmits<{
  'update:verbosity': [value: ProjectionVerbosity];
  'publish-cloudflare': [cloudflareApiBaseUrl: string];
  'request-affordance-action': [request: { surfaceId: string; actionId: string; args: Record<string, unknown> }];
  'request-intelligence-reconfiguration': [change: { provider?: string; model?: string; thinking?: string }];
  collapse: [];
}>();
const cloudflareApiBaseUrl = ref(props.cloudflareProjection.defaultApiBaseUrl.value);
const copyLabel = ref('Copy');
const pendingProvider = ref<string | null>(null);
const pendingModel = ref<string | null>(null);
const pendingThinking = ref<string | null>(null);
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

const intelligenceAffordance = computed(() => props.surfaceAffordances.items.find((item) => item.surfaceKind === 'intelligence') ?? null);
const intelligenceActions = computed(() => actionList(intelligenceAffordance.value?.raw));
const setProviderAction = computed(() => intelligenceActions.value.find((action) => action.id === 'set_provider') ?? null);
const setModelAction = computed(() => intelligenceActions.value.find((action) => action.id === 'set_model') ?? null);
const setThinkingAction = computed(() => intelligenceActions.value.find((action) => action.id === 'set_thinking') ?? null);
const providerActionId = computed(() => setProviderAction.value?.id ?? 'set_provider');
const modelActionId = computed(() => setModelAction.value?.id ?? 'set_model');
const thinkingActionId = computed(() => setThinkingAction.value?.id ?? 'set_thinking');
const providerChoices = computed(() => {
  const choices = objectField(objectField(setProviderAction.value?.raw, 'args'), 'provider')?.choices;
  const values = [
    ...(Array.isArray(choices) ? choices : []),
    ...props.intelligence.providerChoices,
  ].filter((choice): choice is string => typeof choice === 'string' && choice.length > 0);
  const current = props.intelligence.provider;
  return [...new Set([current, ...values].filter((value): value is string => typeof value === 'string' && value.length > 0))];
});
const thinkingChoices = computed(() => {
  const choices = objectField(objectField(setThinkingAction.value?.raw, 'args'), 'thinking')?.choices;
  const values = [
    ...(Array.isArray(choices) ? choices : []),
    ...props.intelligence.thinkingChoices,
  ].filter((choice): choice is string => typeof choice === 'string' && choice.length > 0);
  return values.length ? values : ['none', 'low', 'medium', 'high', 'xhigh'];
});
const modelChoices = computed(() => {
  const choices = objectField(objectField(setModelAction.value?.raw, 'args'), 'model')?.choices;
  const values = [
    ...(Array.isArray(choices) ? choices : []),
    ...props.intelligence.modelChoices,
  ].filter((choice): choice is string => typeof choice === 'string' && choice.length > 0);
  const current = props.intelligence.model;
  return [...new Set([current, ...values].filter((value): value is string => typeof value === 'string' && value.length > 0))];
});
const providerInputValue = computed(() => pendingProvider.value ?? props.intelligence.provider ?? '');
const modelInputValue = computed(() => pendingModel.value ?? props.intelligence.model ?? '');
const thinkingInputValue = computed(() => pendingThinking.value ?? props.intelligence.thinking ?? 'medium');

watch(() => props.intelligence.provider, (provider) => {
  if (pendingProvider.value && pendingProvider.value === provider) pendingProvider.value = null;
});

watch(() => props.intelligence.model, (model) => {
  if (pendingModel.value && pendingModel.value === model) pendingModel.value = null;
});

watch(() => props.intelligence.thinking, (thinking) => {
  if (pendingThinking.value && pendingThinking.value === thinking) pendingThinking.value = null;
});

function requestIntelligenceChange(args: { provider?: string; model?: string; thinking?: string }, actionId: string) {
  const surfaceId = intelligenceAffordance.value?.surfaceId;
  if (props.supportsProtocolMethod(NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD)) {
    emit('request-intelligence-reconfiguration', args);
    return;
  }
  if (!surfaceId) return;
  emit('request-affordance-action', { surfaceId, actionId, args });
}

function requestProviderChange(event: Event) {
  const provider = (event.target as HTMLInputElement | HTMLSelectElement | null)?.value.trim() ?? '';
  if (!provider || provider === props.intelligence.provider) return;
  pendingProvider.value = provider;
  requestIntelligenceChange({ provider }, providerActionId.value);
}

function requestModelChange(event: Event) {
  const model = (event.target as HTMLInputElement | HTMLSelectElement | null)?.value.trim() ?? '';
  if (!model || model === props.intelligence.model) return;
  pendingModel.value = model;
  requestIntelligenceChange({ model }, modelActionId.value);
}

function requestThinkingChange(event: Event) {
  const thinking = (event.target as HTMLSelectElement | null)?.value.trim() ?? '';
  if (!thinking || thinking === props.intelligence.thinking) return;
  pendingThinking.value = thinking;
  requestIntelligenceChange({ thinking }, thinkingActionId.value);
}

function actionList(record: Record<string, unknown> | null | undefined): { id: string; raw: Record<string, unknown> }[] {
  const actions = arrayField(objectField(record, 'affordance_document'), 'actions');
  return actions
    .map((action) => ({ id: stringField(action, 'id'), raw: action }))    .filter((action): action is { id: string; raw: Record<string, unknown> } => Boolean(action.id));
}

function objectField(record: unknown, field: string): Record<string, unknown> | null {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const value = (record as Record<string, unknown>)[field];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayField(record: Record<string, unknown> | null, field: string): Record<string, unknown>[] {
  const value = record?.[field];
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : [];
}

function stringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === 'string' && value ? value : null;
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
            <select
              v-if="providerChoices.length"
              class="intelligence-provider-select"
              :value="providerInputValue"
              aria-label="Provider"
              @change="requestProviderChange"
              @click.stop
              @keydown.stop
            >
              <option v-for="choice in providerChoices" :key="choice" :value="choice">{{ choice }}</option>
            </select>
            <input
              v-else
              class="intelligence-provider-input"
              :value="providerInputValue"
              placeholder="Provider name"
              aria-label="Provider"
              @change="requestProviderChange"
              @click.stop
              @keydown.stop
            >
            <span class="status-token-line status-secondary-token-line intelligence-control-line">
              <select
                v-if="modelChoices.length"
                class="intelligence-model-select"
                :value="modelInputValue"
                aria-label="Model"
                @change="requestModelChange"
                @click.stop
                @keydown.stop
              >
                <option v-for="choice in modelChoices" :key="choice" :value="choice">{{ choice }}</option>
              </select>
              <input
                v-else
                class="intelligence-model-input"
                :value="modelInputValue"
                placeholder="model"
                aria-label="Model"
                @change="requestModelChange"
                @click.stop
                @keydown.stop
              />
              <template v-if="modelChoices.length && thinkingChoices.length">
                <span class="session-token-separator">·</span>
              </template>
              <select
                v-if="thinkingChoices.length"
                class="intelligence-thinking-select"
                :value="thinkingInputValue"
                aria-label="Thinking level"
                @change="requestThinkingChange"                @click.stop
                @keydown.stop
              >
                <option v-for="choice in thinkingChoices" :key="choice" :value="choice">{{ choice }}</option>
              </select>
              <template v-else-if="intelligence.thinking">
                <span>{{ intelligence.thinking }}</span>
              </template>
            </span>
            <span v-if="pendingProvider || pendingModel || pendingThinking" class="retention-note">change requested</span>
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

      <Tooltip v-if="isStatusBoxVisible('view')">
        <TooltipTrigger as-child>
          <div class="view-status-box">
            <label class="label" for="projection-verbosity">View</label>
            <ProjectionVerbositySelect :model-value="verbosity" :levels="verbosityLevels" @update:model-value="emit('update:verbosity', $event)" />
            <span v-if="summarizedStateSampleCount && (verbosity === 'diagnostics' || verbosity === 'raw')" class="retention-note">{{ summarizedStateSampleCount }} routine status update{{ summarizedStateSampleCount === 1 ? '' : 's' }} folded into State</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">{{ statusTooltips.view }}</TooltipContent>
      </Tooltip>

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