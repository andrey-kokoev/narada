<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AffordanceConfirmationPanel from './AffordanceConfirmationPanel.vue';
import ArtifactsPanel from './ArtifactsPanel.vue';
import BoxRowShell from './BoxRowShell.vue';
import ConversationTranscript from './ConversationTranscript.vue';
import CopyableText from './CopyableText.vue';
import DelegationPanel from './DelegationPanel.vue';
import GenericAffordancePanel from './GenericAffordancePanel.vue';
import GitPanel from './GitPanel.vue';
import InboxPanel from './InboxPanel.vue';
import MailboxPanel from './MailboxPanel.vue';
import McpServerPanel from './McpServerPanel.vue';
import OperatorComposer from './OperatorComposer.vue';
import OperatorQueuePanel from './OperatorQueuePanel.vue';
import OperatorSnippetPanel from './OperatorSnippetPanel.vue';
import RuntimeTopologyPanel from './RuntimeTopologyPanel.vue';
import SchedulerPanel from './SchedulerPanel.vue';
import SessionStatusBar from './SessionStatusBar.vue';
import SiteInfoPanel from './SiteInfoPanel.vue';
import SopPanel from './SopPanel.vue';
import BoxVisibilitySelector, { type BoxVisibilitySelectorItem } from './BoxVisibilitySelector.vue';
import SurfaceNavigator from './SurfaceNavigator.vue';
import SurfaceFeedbackPanel from './SurfaceFeedbackPanel.vue';
import TaskLifecyclePanel from './TaskLifecyclePanel.vue';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { summarizeSessionTitleParts } from '../../session-identity.js';
import { useBoxVisibilityPreference } from '../composables/useBoxVisibilityPreference';
import { useSessionPanels } from '../composables/useSessionPanels';
import { AGENT_WEB_UI_PREFERENCE_KEYS, readBooleanPreference, writeBooleanPreference } from '../lib/browserPreferences.js';
import type { SessionPanelId } from '../panel-registry';
import type { AgentActivityState } from '../composables/useAgentActivity';
import type { AffordanceConfirmationItem } from '../composables/useAffordanceConfirmations';
import type { ArtifactsSummary } from '../composables/useArtifactsSummary';
import type { useCloudflareProjection } from '../composables/useCloudflareProjection';
import type { HealthIntelligenceSummary } from '../composables/useHealthStatus';
import type { DelegationSummary } from '../composables/useDelegationSummary';
import type { GitSummary } from '../composables/useGitSummary';
import type { InboxSummary } from '../composables/useInboxSummary';
import type { McpInventorySummary } from '../composables/useMcpInventory';
import type { MailboxSummary } from '../composables/useMailboxSummary';
import type { OperatorQueueItem } from '../composables/useOperatorInput';
import type { OperatorSnippet, OperatorSnippetFeedback, OperatorSnippetOpenRequest } from '../composables/useOperatorSnippets';
import type { ProjectionVerbosity } from '../composables/useProjectionVerbosity';
import type { RuntimeTopologySummary } from '../composables/useRuntimeTopology';
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
  affordanceConfirmations: AffordanceConfirmationItem[];
  operatorQueueItems: OperatorQueueItem[];
  operatorSnippets: OperatorSnippet[];
  operatorSnippetsExportJson: string;
  operatorSnippetFeedback: OperatorSnippetFeedback | null;
  operatorSnippetOpenRequest: OperatorSnippetOpenRequest | null;
  activeTurnId: string | boolean | null;
  mcpInventory: McpInventorySummary;
  runtimeTopology: RuntimeTopologySummary;
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
  'run-snippet': [snippet: OperatorSnippet, deliveryMode?: 'default' | 'enqueue'];
  'save-snippet': [name: string, body: string, mode: 'save' | 'edit'];
  'restore-snippet': [snippet: OperatorSnippet];
  'rename-snippet': [oldName: string, newName: string, body: string];
  'delete-snippet': [name: string];
  'pin-snippet': [name: string];
  'import-snippets': [json: string];
  'fill-snippet': [snippet: OperatorSnippet];
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
  'request-surface-feedback-summary': [];
  'request-task-lifecycle-summary': [];
  'request-affordance-action': [request: { surfaceId: string; actionId: string; args: Record<string, unknown> }];
  'confirm-affordance-action': [item: AffordanceConfirmationItem];
  'cancel-affordance-action': [item: AffordanceConfirmationItem];
  'intent-selected': [intent: string];
}>();
const STATUS_ROW_OPEN_STORAGE_KEY = AGENT_WEB_UI_PREFERENCE_KEYS.statusRowOpen;
const HEADER_ITEM_STORAGE_KEY = AGENT_WEB_UI_PREFERENCE_KEYS.headerItems;
const HEADER_ITEM_IDS = ['identity', 'snippets', 'surfaces', 'runtime', 'session', 'status_toggle'] as const;
type HeaderItemId = typeof HEADER_ITEM_IDS[number];
const DEFAULT_VISIBLE_HEADER_ITEM_IDS: readonly HeaderItemId[] = ['identity', 'surfaces', 'runtime', 'status_toggle'];
const statusRowOpen = ref(loadBooleanPreference(STATUS_ROW_OPEN_STORAGE_KEY, true));
const headerVisibility = useBoxVisibilityPreference({
  storageKey: HEADER_ITEM_STORAGE_KEY,
  itemIds: HEADER_ITEM_IDS,
  defaultVisibleIds: DEFAULT_VISIBLE_HEADER_ITEM_IDS,
  requiredIds: ['identity'],
});
const snippetPanelOpen = ref(false);
const surfaceNavigatorOpen = ref(false);
const titleParts = computed(() => summarizeSessionTitleParts(props.sessionIdentity));
const titleSiteLabel = computed(() => titleParts.value.siteLabel);
const titleAgentLabel = computed(() => titleParts.value.agentLabel);
const genericAffordances = computed(() => props.surfaceAffordances.items.filter((item) => item.renderer === 'generic_mcp_affordance'));
const panelCapabilities = computed(() => ({
  artifactBasePath: props.artifactBasePath,
  surfaceKinds: props.surfaceAffordances.items.map((item) => item.surfaceKind),
  genericAffordanceCount: genericAffordances.value.length,
}));
const panels = useSessionPanels(panelCapabilities);
const selectedGenericAffordance = computed(() => genericAffordances.value.find((item) => genericSurfaceKey(item) === panels.selectedGenericAffordanceKey.value) ?? genericAffordances.value[0] ?? null);
const genericSurfaceNavigatorItems = computed(() => genericAffordances.value.map((item) => ({
  key: genericSurfaceKey(item),
  label: item.title,
  detail: item.serverName ?? item.surfaceKind,
  available: true,
})));
const canInterruptModel = computed(() => (
  Boolean(props.activeTurnId)
  && props.agentActivity.active === true
  && (props.agentActivity.state === 'thinking' || props.agentActivity.state === 'streaming')
));
const canSteerActiveTurn = computed(() => canInterruptModel.value);
const staleAuthority = computed(() => props.authorityTransition?.stale_source === true);
const composerDisabled = computed(() => staleAuthority.value || props.authorityTransition?.input_policy === 'disabled_source_sealed');
const composerDisabledReason = computed(() => staleAuthority.value
  ? 'This browser is attached to stale authority. Start a new session or explicitly attach to the live authority before sending.'
  : 'Source authority is sealed. Reattach to the target authority before sending.');
const sessionChipStreamText = computed(() => props.streamText && props.streamText !== 'connected' ? props.streamText : null);
const composerTargetLabel = computed(() => {
  const agent = props.sessionIdentity.agentId ?? 'agent';
  const session = props.sessionIdentity.sessionId ?? props.runtimeTopology.sessionId;
  return session ? `${agent} · ${compactSessionId(session)}` : agent;
});
const composerTargetState = computed(() => props.runtimeTopology.verdictLabel);
const surfaceGroups = computed(() => [
  {
    title: 'Workflows',
    items: [
      { key: 'task_lifecycle', label: 'Tasks', detail: props.taskLifecycleSummary.status, available: panels.isAvailable('task_lifecycle') },
      { key: 'inbox', label: 'Inbox', detail: `${props.inboxSummary.status} · ${props.inboxSummary.envelopes.count} received`, available: panels.isAvailable('inbox') },
      { key: 'mailbox', label: 'Email', detail: `${props.mailboxSummary.status} · ${props.mailboxSummary.messages.count} messages`, available: panels.isAvailable('mailbox') },
      { key: 'artifacts', label: 'Artifacts', detail: `${props.artifactsSummary.status} · ${props.artifactsSummary.artifacts.total} total`, available: panels.isAvailable('artifacts') },
    ],
  },
  {
    title: 'Automation',
    items: [
      { key: 'delegation', label: 'Delegation', detail: `${props.delegationSummary.status} · ${props.delegationSummary.workers.count + props.delegationSummary.delegatedTasks.count} visible`, available: panels.isAvailable('delegation') },
      { key: 'sop', label: 'SOP', detail: `${props.sopSummary.status} · ${props.sopSummary.templates.count} templates`, available: panels.isAvailable('sop') },
      { key: 'scheduler', label: 'Scheduler', detail: `${props.schedulerSummary.status} · ${props.schedulerSummary.tasks.count} tasks`, available: panels.isAvailable('scheduler') },
    ],
  },
  {
    title: 'Diagnostics',
    items: [
      {
        key: 'runtime_topology',
        label: 'Connection',
        detail: props.runtimeTopology.statusText,
        available: true,
      },
      {
        key: 'git',
        label: 'Git',
        detail: `${props.gitSummary.status} · ${props.gitSummary.changedFiles.count} changed`,
        available: panels.isAvailable('git'),
      },
      {
        key: 'mcp',
        label: 'MCP Catalog',
        detail: `${props.mcpInventory.serverCount ?? props.mcpInventory.servers.length} ${props.mcpInventory.operationalState ?? 'unknown'}`,
        available: true,
      },
    ],
  },
  {
    title: 'Other Tools',
    items: genericSurfaceNavigatorItems.value,
  },
  {
    title: 'Feedback',
    items: [
      { key: 'surface_feedback', label: 'Surface Feedback', detail: props.surfaceFeedbackSummary.status, available: panels.isAvailable('surface_feedback') },
    ],
  },
]);
const headerItemDefinitions: Record<HeaderItemId, Omit<BoxVisibilitySelectorItem, 'visible'>> = {
  identity: { id: 'identity', label: 'Identity', description: 'Site and agent identity title for this session.', required: true },
  snippets: { id: 'snippets', label: 'Snippets', description: 'Browser-local reusable operator inputs.' },
  surfaces: { id: 'surfaces', label: 'Navigate', description: 'Navigation drawer for workflow and diagnostic panels.' },
  runtime: { id: 'runtime', label: 'Connection', description: 'Browser attachment, live session, authority, endpoints, and MCP child posture.' },
  session: { id: 'session', label: 'Session', description: 'Health, agent identity, and session ID chip.' },
  status_toggle: { id: 'status_toggle', label: 'Status Toggle', description: 'Button that expands the status box row after it is collapsed.' },
};
const headerItemSelectorItems = computed(() => HEADER_ITEM_IDS.map((id) => ({
  ...headerItemDefinitions[id],
  visible: isHeaderItemVisible(id),
})));
const headerTooltips = {
  identity: 'Current Narada Site and agent identity. Click the site name to inspect site-level configuration.',
  snippets: 'Open browser-local reusable operator inputs. Hidden by default to keep the main header quiet.',
  surfaces: 'Open workflow and diagnostic panels attached to this session.',
  runtime: 'Connection status for this browser: input authority, live session, endpoints, and MCP child posture.',
  session: 'Legacy compact session chip. Connection is the preferred default.',
  status_toggle: 'Expand or collapse the status box row.',
  header_selector: 'Choose which controls appear in the first row.',
};
watch(statusRowOpen, (value) => persistBooleanPreference(STATUS_ROW_OPEN_STORAGE_KEY, value));
watch(() => props.operatorSnippetOpenRequest, (request) => {
  if (request) snippetPanelOpen.value = true;
});

function compactSessionId(sessionId: string): string {
  if (sessionId.length <= 26) return sessionId;
  return `${sessionId.slice(0, 14)}...${sessionId.slice(-8)}`;
}

function openSurfacePanel(surfaceKind: string) {
  if (surfaceKind === 'runtime_topology' || surfaceKind === 'mcp') panels.open(surfaceKind as SessionPanelId);
  else if (surfaceKind.startsWith('generic:')) {
    panels.openGeneric(surfaceKind);
  }
  else if (surfaceKind === 'artifacts' || surfaceKind === 'delegation' || surfaceKind === 'git' || surfaceKind === 'inbox' || surfaceKind === 'mailbox' || surfaceKind === 'scheduler' || surfaceKind === 'sop' || surfaceKind === 'surface_feedback' || surfaceKind === 'task_lifecycle') panels.open(surfaceKind as SessionPanelId);
}

function genericSurfaceKey(item: { surfaceId: string | null; serverName: string | null; surfaceKind: string }): string {
  return `generic:${item.surfaceId ?? item.serverName ?? item.surfaceKind}`;
}

function loadBooleanPreference(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  return readBooleanPreference(key, fallback);
}

function persistBooleanPreference(key: string, value: boolean) {
  if (typeof window === 'undefined') return;
  writeBooleanPreference(key, value);
}

function isHeaderItemVisible(id: HeaderItemId): boolean {
  return headerVisibility.isVisible(id);
}

function toggleHeaderItem(id: string) {
  headerVisibility.toggle(id);
}

function resetHeaderItems() {
  headerVisibility.reset();
}

</script>

<template>
  <main class="shell" :class="{ 'shell-status-open': statusRowOpen }" aria-label="Narada Agent Web UI">
    <TooltipProvider :delay-duration="250">
      <header class="shell-header">
        <BoxRowShell row-label="Narada session header" class-name="header-box-row">
          <Tooltip v-if="isHeaderItemVisible('identity')">
            <TooltipTrigger as-child>
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
                        @open-mcp-panel="panels.open('mcp')"
                        @open-surface-navigator="surfaceNavigatorOpen = true"
                      />
                      <span v-if="titleAgentLabel" class="site-title-separator">.</span>
                      <span v-if="titleAgentLabel">{{ titleAgentLabel }}</span>
                    </template>
                    <template v-else>{{ sessionIdentity.title }}</template>
                  </h1>
                  <p>{{ sessionIdentity.subtitle }}</p>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">{{ headerTooltips.identity }}</TooltipContent>
          </Tooltip>
          <Tooltip v-if="isHeaderItemVisible('snippets')">
            <TooltipTrigger as-child>
              <OperatorSnippetPanel v-model:open="snippetPanelOpen" :snippets="operatorSnippets" :export-json="operatorSnippetsExportJson" :feedback="operatorSnippetFeedback" :open-request="operatorSnippetOpenRequest" @run="(snippet, mode) => emit('run-snippet', snippet, mode)" @save="(name, body, mode) => emit('save-snippet', name, body, mode)" @restore="emit('restore-snippet', $event)" @rename="(oldName, newName, body) => emit('rename-snippet', oldName, newName, body)" @delete="emit('delete-snippet', $event)" @pin="emit('pin-snippet', $event)" @import="emit('import-snippets', $event)" @fill="emit('fill-snippet', $event)" />
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">{{ headerTooltips.snippets }}</TooltipContent>
          </Tooltip>
          <Tooltip v-if="isHeaderItemVisible('surfaces')">
            <TooltipTrigger as-child>
              <SurfaceNavigator v-model:open="surfaceNavigatorOpen" :groups="surfaceGroups" @open="openSurfacePanel" />
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">{{ headerTooltips.surfaces }}</TooltipContent>
          </Tooltip>
          <Tooltip v-if="isHeaderItemVisible('runtime')">
            <TooltipTrigger as-child>
              <button type="button" class="mcp-panel-trigger runtime-topology-trigger" :data-state="runtimeTopology.status" :aria-expanded="panels.state.runtime_topology" aria-controls="runtime-topology-panel" @click="panels.open('runtime_topology')">
                <span class="chip-dot" aria-hidden="true"></span>
                <span>Connection: {{ runtimeTopology.verdictLabel }}</span>
                <template v-if="sessionChipStreamText">
                  <span class="session-token-separator">·</span>
                  <span>{{ sessionChipStreamText }}</span>
                </template>
                <template v-if="sessionIdentity.agentId">
                  <span class="session-token-separator">·</span>
                  <CopyableText :text="sessionIdentity.agentId" class-name="session-chip-copy">{{ sessionIdentity.agentId }}</CopyableText>
                </template>
                <template v-if="sessionIdentity.sessionId">
                  <span class="session-token-separator">·</span>
                  <CopyableText :text="sessionIdentity.sessionId" class-name="session-chip-copy">{{ sessionIdentity.sessionId }}</CopyableText>
                </template>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">{{ headerTooltips.runtime }}</TooltipContent>
          </Tooltip>
          <Tooltip v-if="isHeaderItemVisible('session')">
            <TooltipTrigger as-child>
              <div class="session-chip" :data-state="healthText.split(' ')[0]">
                <span class="chip-dot" aria-hidden="true"></span>
                <span>{{ healthText.split(' · ')[0] }}</span>
                <template v-if="sessionChipStreamText">
                  <span class="session-token-separator">·</span>
                  <span>{{ sessionChipStreamText }}</span>
                </template>
                <template v-if="sessionIdentity.agentId">
                  <span class="session-token-separator">·</span>
                  <CopyableText :text="sessionIdentity.agentId" class-name="session-chip-copy">{{ sessionIdentity.agentId }}</CopyableText>
                </template>
                <template v-if="sessionIdentity.sessionId">
                  <span class="session-token-separator">·</span>
                  <CopyableText :text="sessionIdentity.sessionId" class-name="session-chip-copy">{{ sessionIdentity.sessionId }}</CopyableText>
                </template>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">{{ headerTooltips.session }}</TooltipContent>
          </Tooltip>
          <Tooltip v-if="!statusRowOpen && isHeaderItemVisible('status_toggle')">
            <TooltipTrigger as-child>
              <button
                type="button"
                class="status-row-collapse-toggle status-row-collapse-toggle-header"
                :aria-expanded="statusRowOpen"
                aria-label="Expand status boxes"
                @click="statusRowOpen = true"
              >
                <span aria-hidden="true">v</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">{{ headerTooltips.status_toggle }}</TooltipContent>
          </Tooltip>
          <template #controls>
            <Tooltip>
              <TooltipTrigger as-child>
                <BoxVisibilitySelector
                  :boxes="headerItemSelectorItems"
                  panel-id="header-item-selector-panel"
                  trigger-label="Header items"
                  title="Header Items"
                  description="Select which controls are shown in the first row."
                  panel-aria-label="Header row items"
                  empty-text="No matching header items."
                  search-placeholder="Filter header items"
                  placement="row-control"
                  @toggle="toggleHeaderItem"
                  @reset="resetHeaderItems"
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">{{ headerTooltips.header_selector }}</TooltipContent>
            </Tooltip>
          </template>
        </BoxRowShell>
      </header>
    </TooltipProvider>
    <OperatorSnippetPanel
      v-if="!isHeaderItemVisible('snippets')"
      v-model:open="snippetPanelOpen"
      triggerless
      :snippets="operatorSnippets"
      :export-json="operatorSnippetsExportJson"
      :feedback="operatorSnippetFeedback"
      :open-request="operatorSnippetOpenRequest"
      @run="(snippet, mode) => emit('run-snippet', snippet, mode)"
      @save="(name, body, mode) => emit('save-snippet', name, body, mode)"
      @restore="emit('restore-snippet', $event)"
      @rename="(oldName, newName, body) => emit('rename-snippet', oldName, newName, body)"
      @delete="emit('delete-snippet', $event)"
      @pin="emit('pin-snippet', $event)"
      @import="emit('import-snippets', $event)"
      @fill="emit('fill-snippet', $event)"
    />
    <ArtifactsPanel v-model:open="panels.state.artifacts" triggerless :available="panels.isAvailable('artifacts')" :summary="artifactsSummary" @refresh="emit('request-artifacts-summary')" />
    <RuntimeTopologyPanel v-model:open="panels.state.runtime_topology" :topology="runtimeTopology" />
    <McpServerPanel v-model:open="panels.state.mcp" triggerless :inventory="mcpInventory" :surface-affordances="surfaceAffordances" @open-surface-panel="openSurfacePanel" />
    <GenericAffordancePanel v-model:open="panels.state.generic_affordance" triggerless :item="selectedGenericAffordance" @action="emit('request-affordance-action', $event)" />
    <DelegationPanel v-model:open="panels.state.delegation" triggerless :available="panels.isAvailable('delegation')" :summary="delegationSummary" @refresh="emit('request-delegation-summary')" />
    <GitPanel v-model:open="panels.state.git" triggerless :available="panels.isAvailable('git')" :summary="gitSummary" @refresh="emit('request-git-summary')" />
    <InboxPanel v-model:open="panels.state.inbox" triggerless :available="panels.isAvailable('inbox')" :summary="inboxSummary" @refresh="emit('request-inbox-summary')" />
    <MailboxPanel v-model:open="panels.state.mailbox" triggerless :available="panels.isAvailable('mailbox')" :summary="mailboxSummary" @refresh="emit('request-mailbox-summary')" />
    <SchedulerPanel v-model:open="panels.state.scheduler" triggerless :available="panels.isAvailable('scheduler')" :summary="schedulerSummary" @refresh="emit('request-scheduler-summary')" />
    <TaskLifecyclePanel v-model:open="panels.state.task_lifecycle" triggerless :available="panels.isAvailable('task_lifecycle')" :summary="taskLifecycleSummary" @refresh="emit('request-task-lifecycle-summary')" />
    <SopPanel v-model:open="panels.state.sop" triggerless :available="panels.isAvailable('sop')" :summary="sopSummary" @refresh="emit('request-sop-summary')" />
    <SurfaceFeedbackPanel v-model:open="panels.state.surface_feedback" triggerless :available="panels.isAvailable('surface_feedback')" :summary="surfaceFeedbackSummary" @refresh="emit('request-surface-feedback-summary')" />
    <section v-if="statusRowOpen" class="status-row-shell" aria-label="Session status row">
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
        :surface-affordances="surfaceAffordances"
        :cloudflare-projection="cloudflareProjection"
        collapsible
        @update:verbosity="emit('update:verbosity', $event)"
        @publish-cloudflare="emit('publish-cloudflare', $event)"
        @request-affordance-action="emit('request-affordance-action', $event)"
        @collapse="statusRowOpen = false"
      />
    </section>
    <ConversationTranscript :rows="rows" :verbosity="verbosity" :agent-activity="agentActivity" :follow-latest-revision="followLatestRevision" @intent-selected="emit('intent-selected', $event)" />
    <AffordanceConfirmationPanel :items="affordanceConfirmations" @confirm="emit('confirm-affordance-action', $event)" @cancel="emit('cancel-affordance-action', $event)" />
    <OperatorQueuePanel :items="operatorQueueItems" :active-turn-id="activeTurnId" :can-steer-active-turn="canSteerActiveTurn" @edit="emit('edit-queued', $event)" @remove="emit('remove-queued', $event)" @steer="emit('steer-queued', $event)" />
    <OperatorComposer v-model="draft" :operator-snippets="operatorSnippets" :disabled="composerDisabled" :can-interrupt="canInterruptModel" :disabled-reason="composerDisabledReason" :target-label="composerTargetLabel" :target-state="composerTargetState" @submit="emit('submit', $event)" @run-snippet="(snippet, mode) => emit('run-snippet', snippet, mode)" @interrupt="emit('interrupt')" />
  </main>
</template>
