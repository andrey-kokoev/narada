<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ConversationTranscript from './ConversationTranscript.vue';
import CopyableText from './CopyableText.vue';
import MailboxPanel from './MailboxPanel.vue';
import McpServerPanel from './McpServerPanel.vue';
import OperatorComposer from './OperatorComposer.vue';
import OperatorQueuePanel from './OperatorQueuePanel.vue';
import SessionStatusBar from './SessionStatusBar.vue';
import SiteInfoPanel from './SiteInfoPanel.vue';
import SopPanel from './SopPanel.vue';
import type { AgentActivityState } from '../composables/useAgentActivity';
import type { useCloudflareProjection } from '../composables/useCloudflareProjection';
import type { HealthIntelligenceSummary } from '../composables/useHealthStatus';
import type { McpInventorySummary } from '../composables/useMcpInventory';
import type { MailboxSummary } from '../composables/useMailboxSummary';
import type { OperatorQueueItem } from '../composables/useOperatorInput';
import type { ProjectionVerbosity } from '../composables/useProjectionVerbosity';
import type { SessionIdentitySummary } from '../composables/useNarsEvents';
import type { SopSummary } from '../composables/useSopSummary';
import type { SurfaceAffordanceSummary } from '../composables/useSurfaceAffordances';
import type { ProjectedEventRow } from '../lib/eventProjection';

const props = defineProps<{
  eventEndpoint: string | null;
  healthEndpoint: string | null;
  healthTransport: string;
  inputEndpoint: string | null;
  artifactBasePath: string | null;
  artifactTransport: string | null;
  healthBody: Record<string, unknown> | null;
  streamText: string;
  healthText: string;
  intelligence: HealthIntelligenceSummary;
  summarizedStateSampleCount: number;
  verbosity: ProjectionVerbosity;
  verbosityLevels: readonly ProjectionVerbosity[];
  rows: ProjectedEventRow[];
  sessionIdentity: SessionIdentitySummary;
  agentActivity: AgentActivityState;
  operatorQueueItems: OperatorQueueItem[];
  activeTurnId: string | boolean | null;
  mcpInventory: McpInventorySummary;
  surfaceAffordances: SurfaceAffordanceSummary;
  mailboxSummary: MailboxSummary;
  sopSummary: SopSummary;
  authorityTransition: Record<string, unknown> | null;
  cloudflareProjection: ReturnType<typeof useCloudflareProjection>;
  followLatestRevision: number;
}>();
const draft = defineModel<string>('draft', { required: true });
const emit = defineEmits<{
  'update:verbosity': [value: ProjectionVerbosity];
  'publish-cloudflare': [cloudflareApiBaseUrl: string];
  submit: [deliveryMode?: 'default' | 'enqueue'];
  interrupt: [];
  'edit-queued': [item: OperatorQueueItem];
  'remove-queued': [item: OperatorQueueItem];
  'steer-queued': [item: OperatorQueueItem];
  'request-sop-summary': [];
  'request-mailbox-summary': [];
  'request-surface-affordances': [];
}>();
const STATUS_ROW_OPEN_STORAGE_KEY = 'narada:agent-web-ui:status-row-open.v1';
const statusRowOpen = ref(loadBooleanPreference(STATUS_ROW_OPEN_STORAGE_KEY, true));
const mcpPanelOpen = ref(false);
const mailboxPanelOpen = ref(false);
const sopPanelOpen = ref(false);
const titleSiteLabel = computed(() => props.sessionIdentity.siteId ?? sitePartFromAgentId(props.sessionIdentity.agentId));
const titleAgentLabel = computed(() => props.sessionIdentity.siteId ? props.sessionIdentity.agentId : agentPartFromAgentId(props.sessionIdentity.agentId));
const sopAffordance = computed(() => props.surfaceAffordances.items.find((item) => item.surfaceKind === 'sop') ?? null);
const hasSopSurface = computed(() => Boolean(sopAffordance.value));
const mailboxAffordance = computed(() => props.surfaceAffordances.items.find((item) => item.surfaceKind === 'mailbox') ?? null);
const hasMailboxSurface = computed(() => Boolean(mailboxAffordance.value));
const canInterruptModel = computed(() => (
  Boolean(props.activeTurnId)
  && props.agentActivity.active === true
  && (props.agentActivity.state === 'thinking' || props.agentActivity.state === 'streaming')
));
watch(statusRowOpen, (value) => persistBooleanPreference(STATUS_ROW_OPEN_STORAGE_KEY, value));
watch(mcpPanelOpen, (value) => {
  if (value) emit('request-surface-affordances');
});

function loadBooleanPreference(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return fallback;
}

function persistBooleanPreference(key: string, value: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, String(value));
}

function sitePartFromAgentId(agentId: string | null): string | null {
  if (!agentId?.includes('.')) return null;
  return agentId.split('.')[0] || null;
}

function agentPartFromAgentId(agentId: string | null): string | null {
  if (!agentId) return null;
  if (!agentId.includes('.')) return agentId;
  return agentId.split('.').slice(1).join('.') || null;
}
</script>

<template>
  <main class="shell" :class="{ 'shell-status-open': statusRowOpen }" aria-label="Narada Agent Web UI">
    <header class="shell-header">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true">N</span>
        <div>
          <h1>
            <template v-if="titleSiteLabel">
              <SiteInfoPanel
                :site-label="titleSiteLabel"
                :agent-label="titleAgentLabel"
                :event-endpoint="eventEndpoint"
                :health-endpoint="healthEndpoint"
                :health-transport="healthTransport"
                :input-endpoint="inputEndpoint"
                :artifact-base-path="artifactBasePath"
                :artifact-transport="artifactTransport"
                :health-body="healthBody"
                :authority-transition="authorityTransition"
                :has-sop-mcp="hasSopSurface"
                :has-mailbox-mcp="hasMailboxSurface"
                @open-mcp-panel="mcpPanelOpen = true"
                @open-sop-panel="sopPanelOpen = true"
                @open-mailbox-panel="mailboxPanelOpen = true"
              />
              <span v-if="titleAgentLabel" class="site-title-separator">.</span>
              <span v-if="titleAgentLabel">{{ titleAgentLabel }}</span>
            </template>
            <template v-else>{{ sessionIdentity.title }}</template>
          </h1>
          <p>{{ sessionIdentity.subtitle }}</p>
        </div>
      </div>
      <div class="shell-header-actions">
        <McpServerPanel v-model:open="mcpPanelOpen" :inventory="mcpInventory" />
        <MailboxPanel v-model:open="mailboxPanelOpen" :available="hasMailboxSurface" :summary="mailboxSummary" @refresh="emit('request-mailbox-summary')" />
        <SopPanel v-model:open="sopPanelOpen" :available="hasSopSurface" :summary="sopSummary" @refresh="emit('request-sop-summary')" />
        <div class="session-chip" :data-state="healthText.split(' ')[0]">
          <span class="chip-dot" aria-hidden="true"></span>
          <span>{{ healthText.split(' · ')[0] }}</span>
          <template v-if="sessionIdentity.agentId">
            <span class="session-token-separator">·</span>
            <CopyableText :text="sessionIdentity.agentId" class-name="session-chip-copy">{{ sessionIdentity.agentId }}</CopyableText>
          </template>
          <template v-if="sessionIdentity.sessionId">
            <span class="session-token-separator">·</span>
            <CopyableText :text="sessionIdentity.sessionId" class-name="session-chip-copy">{{ sessionIdentity.sessionId }}</CopyableText>
          </template>
        </div>
        <button
          v-if="!statusRowOpen"
          type="button"
          class="status-row-collapse-toggle status-row-collapse-toggle-header"
          :aria-expanded="statusRowOpen"
          aria-label="Expand status boxes"
          title="Expand status boxes"
          @click="statusRowOpen = true"
        >
          <span aria-hidden="true">v</span>
        </button>
      </div>
    </header>
    <section v-if="statusRowOpen" class="status-row-shell" aria-label="Session status row">
      <button
        type="button"
        class="status-row-collapse-toggle"
        :aria-expanded="statusRowOpen"
        aria-label="Collapse status boxes"
        title="Collapse status boxes"
        @click="statusRowOpen = false"
      >
        <span aria-hidden="true">^</span>
      </button>
      <SessionStatusBar
        :event-endpoint="eventEndpoint"
        :health-endpoint="healthEndpoint"
        :health-transport="healthTransport"
        :stream-text="streamText"
        :health-text="healthText"
        :intelligence="intelligence"
        :session-identity="sessionIdentity"
        :summarized-state-sample-count="summarizedStateSampleCount"
        :verbosity="verbosity"
        :verbosity-levels="verbosityLevels"
        :agent-activity="agentActivity"
        :authority-transition="authorityTransition"
        :cloudflare-projection="cloudflareProjection"
        @update:verbosity="emit('update:verbosity', $event)"
        @publish-cloudflare="emit('publish-cloudflare', $event)"
      />
    </section>
    <ConversationTranscript :rows="rows" :verbosity="verbosity" :agent-activity="agentActivity" :follow-latest-revision="followLatestRevision" />
    <OperatorQueuePanel :items="operatorQueueItems" :active-turn-id="activeTurnId" @edit="emit('edit-queued', $event)" @remove="emit('remove-queued', $event)" @steer="emit('steer-queued', $event)" />
    <OperatorComposer v-model="draft" :disabled="authorityTransition?.input_policy === 'disabled_source_sealed'" :can-interrupt="canInterruptModel" disabled-reason="Source authority is sealed. Reattach to the target authority before sending." @submit="emit('submit', $event)" @interrupt="emit('interrupt')" />
  </main>
</template>
