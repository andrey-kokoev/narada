<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ProjectionVerbositySelect from './ProjectionVerbositySelect.vue';
import StatusBoxSelector, { type StatusBoxSelectorItem } from './StatusBoxSelector.vue';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
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
  cloudflareProjection: ReturnType<typeof useCloudflareProjection>;
}>();
const emit = defineEmits<{
  'update:verbosity': [value: ProjectionVerbosity];
  'publish-cloudflare': [cloudflareApiBaseUrl: string];
  'request-affordance-action': [request: { surfaceId: string; actionId: string; args: Record<string, unknown> }];
}>();
const cloudflareApiBaseUrl = ref(props.cloudflareProjection.defaultApiBaseUrl.value);
const copyLabel = ref('Copy');
const pendingModel = ref<string | null>(null);
const pendingThinking = ref<string | null>(null);
const STATUS_BOX_STORAGE_KEY = 'narada:agent-web-ui:status-boxes.v2';
const DEFAULT_STATUS_BOX_IDS = ['events', 'health', 'intelligence', 'authority', 'view', 'cloudflare'] as const;
type StatusBoxId = typeof DEFAULT_STATUS_BOX_IDS[number];
const DEFAULT_VISIBLE_STATUS_BOX_IDS: readonly StatusBoxId[] = ['intelligence', 'authority', 'view', 'cloudflare'];
const statusBoxDefinitions: Record<StatusBoxId, Omit<StatusBoxSelectorItem, 'visible'>> = {
  events: { id: 'events', label: 'Events', description: 'NARS event stream endpoint used by this browser.' },
  health: { id: 'health', label: 'Health', description: 'HTTP health endpoint used to poll the runtime.' },
  intelligence: { id: 'intelligence', label: 'Intelligence', description: 'Provider, model, and thinking level.' },
  authority: { id: 'authority', label: 'Authority', description: 'Write authority and stale-session posture.' },
  view: { id: 'view', label: 'View', description: 'Projection level for the event feed.' },
  cloudflare: { id: 'cloudflare', label: 'Cloudflare', description: 'Remote browser projection controls.' },
};
const visibleStatusBoxIds = ref(loadStatusBoxIds());
const availableStatusBoxIds = computed(() => DEFAULT_STATUS_BOX_IDS.filter((id) => id !== 'cloudflare' || props.cloudflareProjection.available.value));
const statusBoxSelectorItems = computed(() => availableStatusBoxIds.value.map((id) => ({
  ...statusBoxDefinitions[id],
  visible: isStatusBoxVisible(id),
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

function loadStatusBoxIds(): Set<StatusBoxId> {
  if (typeof window === 'undefined') return new Set(DEFAULT_VISIBLE_STATUS_BOX_IDS);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STATUS_BOX_STORAGE_KEY) ?? 'null') as unknown;
    if (!Array.isArray(parsed)) return new Set(DEFAULT_VISIBLE_STATUS_BOX_IDS);
    const allowed = new Set(DEFAULT_STATUS_BOX_IDS);
    const loaded = parsed.filter((id): id is StatusBoxId => typeof id === 'string' && allowed.has(id as StatusBoxId));
    return loaded.length ? new Set(loaded) : new Set(DEFAULT_VISIBLE_STATUS_BOX_IDS);
  } catch {
    return new Set(DEFAULT_VISIBLE_STATUS_BOX_IDS);
  }
}

function persistStatusBoxIds(ids: Set<StatusBoxId>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STATUS_BOX_STORAGE_KEY, JSON.stringify([...ids]));
}

function isStatusBoxVisible(id: StatusBoxId): boolean {
  return availableStatusBoxIds.value.includes(id) && visibleStatusBoxIds.value.has(id);
}

function toggleStatusBox(id: string) {
  if (!availableStatusBoxIds.value.includes(id as StatusBoxId)) return;
  const next = new Set(visibleStatusBoxIds.value);
  if (next.has(id as StatusBoxId)) next.delete(id as StatusBoxId);
  else next.add(id as StatusBoxId);
  visibleStatusBoxIds.value = next;
  persistStatusBoxIds(next);
}

function resetStatusBoxes() {
  const next = new Set(DEFAULT_VISIBLE_STATUS_BOX_IDS);
  visibleStatusBoxIds.value = next;
  persistStatusBoxIds(next);
}

function authorityText(authority: Record<string, unknown> | null): string {
  if (!authority) return 'not advertised';
  const host = typeof authority.authority_runtime_host === 'string' ? authority.authority_runtime_host : 'unknown';
  const epoch = Number.isInteger(authority.authority_epoch) ? ` e${authority.authority_epoch}` : '';
  const transition = typeof authority.authority_transition_state === 'string' && authority.authority_transition_state ? ` · ${authority.authority_transition_state}` : '';
  const writes = typeof authority.source_write_admission === 'string' && authority.source_write_admission ? ` · writes ${authority.source_write_admission}` : '';
  return `${host}${epoch}${transition}${writes}`;
}

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
  authority: 'Runtime authority for accepting operator writes. "local" means this browser is attached to the local NARS authority; "eN" is the authority epoch/version used to detect stale clients; "writes active" means operator input is currently admitted.',
  view: 'Projection level for the event feed: conversation, operations, diagnostics, or raw.',
  cloudflare: 'Optional remote browser projection for exposing this local NARS session through a Cloudflare Worker.',
};

const intelligenceAffordance = computed(() => props.surfaceAffordances.items.find((item) => item.surfaceKind === 'intelligence') ?? null);
const intelligenceActions = computed(() => actionList(intelligenceAffordance.value?.raw));
const setModelAction = computed(() => intelligenceActions.value.find((action) => action.id === 'set_model') ?? null);
const setThinkingAction = computed(() => intelligenceActions.value.find((action) => action.id === 'set_thinking') ?? null);
const thinkingChoices = computed(() => {
  const choices = objectField(objectField(setThinkingAction.value?.raw, 'args'), 'thinking')?.choices;
  const values = Array.isArray(choices) ? choices.filter((choice): choice is string => typeof choice === 'string' && choice.length > 0) : [];
  return values.length ? values : ['none', 'low', 'medium', 'high', 'xhigh'];
});
const modelInputValue = computed(() => pendingModel.value ?? props.intelligence.model ?? '');
const thinkingInputValue = computed(() => pendingThinking.value ?? props.intelligence.thinking ?? 'medium');

watch(() => props.intelligence.model, (model) => {
  if (pendingModel.value && pendingModel.value === model) pendingModel.value = null;
});

watch(() => props.intelligence.thinking, (thinking) => {
  if (pendingThinking.value && pendingThinking.value === thinking) pendingThinking.value = null;
});

function requestModelChange(event: Event) {
  const surfaceId = intelligenceAffordance.value?.surfaceId;
  const actionId = setModelAction.value?.id;
  const model = (event.target as HTMLInputElement | null)?.value.trim() ?? '';
  if (!surfaceId || !actionId || !model || model === props.intelligence.model) return;
  pendingModel.value = model;
  emit('request-affordance-action', { surfaceId, actionId, args: { model } });
}

function requestThinkingChange(event: Event) {
  const surfaceId = intelligenceAffordance.value?.surfaceId;
  const actionId = setThinkingAction.value?.id;
  const thinking = (event.target as HTMLSelectElement | null)?.value.trim() ?? '';
  if (!surfaceId || !actionId || !thinking || thinking === props.intelligence.thinking) return;
  pendingThinking.value = thinking;
  emit('request-affordance-action', { surfaceId, actionId, args: { thinking } });
}

function actionList(record: Record<string, unknown> | null | undefined): { id: string; raw: Record<string, unknown> }[] {
  const actions = arrayField(objectField(record, 'affordance_document'), 'actions');
  return actions
    .map((action) => ({ id: stringField(action, 'id'), raw: action }))
    .filter((action): action is { id: string; raw: Record<string, unknown> } => Boolean(action.id));
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
    <section class="status" :class="{ 'status-has-projection-control': cloudflareProjection.available.value }" aria-label="Session status">
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
            <span>{{ intelligence.provider ?? 'provider unknown' }}</span>
            <span class="status-token-line status-secondary-token-line intelligence-control-line">
              <template v-if="setModelAction">
                <input
                  class="intelligence-model-input"
                  :value="modelInputValue"
                  placeholder="model"
                  aria-label="Model"
                  @change="requestModelChange"
                  @click.stop
                  @keydown.stop
                />
              </template>
              <template v-else-if="intelligence.model">
                <span>{{ intelligence.model }}</span>
              </template>
              <template v-if="(setModelAction || intelligence.model) && (setThinkingAction || intelligence.thinking)">
                <span class="session-token-separator">·</span>
              </template>
              <template v-if="setThinkingAction">
                <select
                  class="intelligence-thinking-select"
                  :value="thinkingInputValue"
                  aria-label="Thinking level"
                  @change="requestThinkingChange"
                  @click.stop
                  @keydown.stop
                >
                  <option v-for="choice in thinkingChoices" :key="choice" :value="choice">{{ choice }}</option>
                </select>
              </template>
              <template v-else-if="intelligence.thinking">
                <span>{{ intelligence.thinking }}</span>
              </template>
            </span>
            <span v-if="pendingModel || pendingThinking" class="retention-note">change requested</span>
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
          <div>
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
              <label class="label" for="cloudflare-api-base-url">Cloudflare</label>
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

      <StatusBoxSelector
        :boxes="statusBoxSelectorItems"
        panel-id="status-row-box-selector-panel"
        trigger-label="Status boxes"
        title="Status Boxes"
        description="Select which boxes are shown in the session status row."
        panel-aria-label="Status row boxes"
        empty-text="No matching status boxes."
        @toggle="toggleStatusBox"
        @reset="resetStatusBoxes"
      />
    </section>
  </TooltipProvider>
</template>
