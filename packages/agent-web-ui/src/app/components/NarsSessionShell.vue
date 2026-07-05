<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ArtifactsPanel from './ArtifactsPanel.vue';
import ConversationTranscript from './ConversationTranscript.vue';
import CopyableText from './CopyableText.vue';
import DelegationPanel from './DelegationPanel.vue';
import GitPanel from './GitPanel.vue';
import InboxPanel from './InboxPanel.vue';
import MailboxPanel from './MailboxPanel.vue';
import McpServerPanel from './McpServerPanel.vue';
import OperatorComposer from './OperatorComposer.vue';
import OperatorQueuePanel from './OperatorQueuePanel.vue';
import SchedulerPanel from './SchedulerPanel.vue';
import SessionStatusBar from './SessionStatusBar.vue';
import SiteInfoPanel from './SiteInfoPanel.vue';
import SopPanel from './SopPanel.vue';
import SurfaceFeedbackPanel from './SurfaceFeedbackPanel.vue';
import TaskLifecyclePanel from './TaskLifecyclePanel.vue';
import type { AgentActivityState } from '../composables/useAgentActivity';
import type { ArtifactsSummary } from '../composables/useArtifactsSummary';
import type { useCloudflareProjection } from '../composables/useCloudflareProjection';
import type { HealthIntelligenceSummary } from '../composables/useHealthStatus';
import type { DelegationSummary } from '../composables/useDelegationSummary';
import type { GitSummary } from '../composables/useGitSummary';
import type { InboxSummary } from '../composables/useInboxSummary';
import type { McpInventorySummary } from '../composables/useMcpInventory';
import type { MailboxSummary } from '../composables/useMailboxSummary';
import type { OperatorQueueItem } from '../composables/useOperatorInput';
import type { ProjectionVerbosity } from '../composables/useProjectionVerbosity';
import type { SchedulerSummary } from '../composables/useSchedulerSummary';
import type { SessionIdentitySummary } from '../composables/useNarsEvents';
import type { SopSummary } from '../composables/useSopSummary';
import type { SurfaceAffordanceSummary } from '../composables/useSurfaceAffordances';
import type { SurfaceFeedbackSummary } from '../composables/useSurfaceFeedbackSummary';
import type { TaskLifecycleSummary } from '../composables/useTaskLifecycleSummary';
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
  artifactsSummary: ArtifactsSummary;
  delegationSummary: DelegationSummary;
  gitSummary: GitSummary;
  inboxSummary: InboxSummary;
  mailboxSummary: MailboxSummary;
  schedulerSummary: SchedulerSummary;
  sopSummary: SopSummary;
  surfaceFeedbackSummary: SurfaceFeedbackSummary;
  taskLifecycleSummary: TaskLifecycleSummary;
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
  'request-artifacts-summary': [];
  'request-sop-summary': [];
  'request-delegation-summary': [];
  'request-git-summary': [];
  'request-inbox-summary': [];
  'request-mailbox-summary': [];
  'request-scheduler-summary': [];
  'request-surface-affordances': [];
  'request-surface-feedback-summary': [];
  'request-task-lifecycle-summary': [];
}>();
const STATUS_ROW_OPEN_STORAGE_KEY = 'narada:agent-web-ui:status-row-open.v1';
const statusRowOpen = ref(loadBooleanPreference(STATUS_ROW_OPEN_STORAGE_KEY, true));
const artifactsPanelOpen = ref(false);
const mcpPanelOpen = ref(false);
const delegationPanelOpen = ref(false);
const gitPanelOpen = ref(false);
const inboxPanelOpen = ref(false);
const mailboxPanelOpen = ref(false);
const schedulerPanelOpen = ref(false);
const sopPanelOpen = ref(false);
const surfaceFeedbackPanelOpen = ref(false);
const taskLifecyclePanelOpen = ref(false);
const titleSiteLabel = computed(() => props.sessionIdentity.siteId ?? sitePartFromAgentId(props.sessionIdentity.agentId));
const titleAgentLabel = computed(() => props.sessionIdentity.siteId ? props.sessionIdentity.agentId : agentPartFromAgentId(props.sessionIdentity.agentId));
const hasArtifactsSurface = computed(() => Boolean(props.artifactBasePath));
const sopAffordance = computed(() => props.surfaceAffordances.items.find((item) => item.surfaceKind === 'sop') ?? null);
const hasSopSurface = computed(() => Boolean(sopAffordance.value));
const surfaceFeedbackAffordance = computed(() => props.surfaceAffordances.items.find((item) => item.surfaceKind === 'surface_feedback') ?? null);
const hasSurfaceFeedbackSurface = computed(() => Boolean(surfaceFeedbackAffordance.value));
const delegationAffordance = computed(() => props.surfaceAffordances.items.find((item) => item.surfaceKind === 'delegation') ?? null);
const hasDelegationSurface = computed(() => Boolean(delegationAffordance.value));
const gitAffordance = computed(() => props.surfaceAffordances.items.find((item) => item.surfaceKind === 'git') ?? null);
const hasGitSurface = computed(() => Boolean(gitAffordance.value));
const inboxAffordance = computed(() => props.surfaceAffordances.items.find((item) => item.surfaceKind === 'inbox') ?? null);
const hasInboxSurface = computed(() => Boolean(inboxAffordance.value));
const mailboxAffordance = computed(() => props.surfaceAffordances.items.find((item) => item.surfaceKind === 'mailbox') ?? null);
const hasMailboxSurface = computed(() => Boolean(mailboxAffordance.value));
const schedulerAffordance = computed(() => props.surfaceAffordances.items.find((item) => item.surfaceKind === 'scheduler') ?? null);
const hasSchedulerSurface = computed(() => Boolean(schedulerAffordance.value));
const taskLifecycleAffordance = computed(() => props.surfaceAffordances.items.find((item) => item.surfaceKind === 'task_lifecycle') ?? null);
const hasTaskLifecycleSurface = computed(() => Boolean(taskLifecycleAffordance.value));
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
                :has-artifacts="hasArtifactsSurface"
                :has-delegation-mcp="hasDelegationSurface"
                :has-git-mcp="hasGitSurface"
                :has-inbox-mcp="hasInboxSurface"
                :has-sop-mcp="hasSopSurface"
                :has-surface-feedback-mcp="hasSurfaceFeedbackSurface"
                :has-mailbox-mcp="hasMailboxSurface"
                :has-scheduler-mcp="hasSchedulerSurface"
                :has-task-lifecycle-mcp="hasTaskLifecycleSurface"
                @open-mcp-panel="mcpPanelOpen = true"
                @open-artifacts-panel="artifactsPanelOpen = true"
                @open-delegation-panel="delegationPanelOpen = true"
                @open-git-panel="gitPanelOpen = true"
                @open-inbox-panel="inboxPanelOpen = true"
                @open-sop-panel="sopPanelOpen = true"
                @open-surface-feedback-panel="surfaceFeedbackPanelOpen = true"
                @open-mailbox-panel="mailboxPanelOpen = true"
                @open-scheduler-panel="schedulerPanelOpen = true"
                @open-task-lifecycle-panel="taskLifecyclePanelOpen = true"
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
        <ArtifactsPanel v-model:open="artifactsPanelOpen" :available="hasArtifactsSurface" :summary="artifactsSummary" @refresh="emit('request-artifacts-summary')" />
        <McpServerPanel v-model:open="mcpPanelOpen" :inventory="mcpInventory" />
        <DelegationPanel v-model:open="delegationPanelOpen" :available="hasDelegationSurface" :summary="delegationSummary" @refresh="emit('request-delegation-summary')" />
        <GitPanel v-model:open="gitPanelOpen" :available="hasGitSurface" :summary="gitSummary" @refresh="emit('request-git-summary')" />
        <InboxPanel v-model:open="inboxPanelOpen" :available="hasInboxSurface" :summary="inboxSummary" @refresh="emit('request-inbox-summary')" />
        <MailboxPanel v-model:open="mailboxPanelOpen" :available="hasMailboxSurface" :summary="mailboxSummary" @refresh="emit('request-mailbox-summary')" />
        <SchedulerPanel v-model:open="schedulerPanelOpen" :available="hasSchedulerSurface" :summary="schedulerSummary" @refresh="emit('request-scheduler-summary')" />
        <TaskLifecyclePanel v-model:open="taskLifecyclePanelOpen" :available="hasTaskLifecycleSurface" :summary="taskLifecycleSummary" @refresh="emit('request-task-lifecycle-summary')" />
        <SopPanel v-model:open="sopPanelOpen" :available="hasSopSurface" :summary="sopSummary" @refresh="emit('request-sop-summary')" />
        <SurfaceFeedbackPanel v-model:open="surfaceFeedbackPanelOpen" :available="hasSurfaceFeedbackSurface" :summary="surfaceFeedbackSummary" @refresh="emit('request-surface-feedback-summary')" />
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
