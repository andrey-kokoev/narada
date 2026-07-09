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
import StatusBoxSelector, { type StatusBoxSelectorItem } from './StatusBoxSelector.vue';
import SurfaceNavigator from './SurfaceNavigator.vue';
import SurfaceFeedbackPanel from './SurfaceFeedbackPanel.vue';
import TaskLifecyclePanel from './TaskLifecyclePanel.vue';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { summarizeSessionTitleParts } from '../../session-identity.js';
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
const STATUS_ROW_OPEN_STORAGE_KEY = 'narada:agent-web-ui:status-row-open.v1';
const HEADER_ITEM_STORAGE_KEY = 'narada:agent-web-ui:header-items.v2';
const HEADER_ITEM_IDS = ['identity', 'snippets', 'surfaces', 'runtime', 'session', 'status_toggle'] as const;
type HeaderItemId = typeof HEADER_ITEM_IDS[number];
const DEFAULT_VISIBLE_HEADER_ITEM_IDS: readonly HeaderItemId[] = ['identity', 'surfaces', 'runtime', 'status_toggle'];
const statusRowOpen = ref(loadBooleanPreference(STATUS_ROW_OPEN_STORAGE_KEY, true));
const visibleHeaderItemIds = ref(loadHeaderItemIds());
const artifactsPanelOpen = ref(false);
const runtimeTopologyPanelOpen = ref(false);
const mcpPanelOpen = ref(false);
const snippetPanelOpen = ref(false);
const surfaceNavigatorOpen = ref(false);
const genericAffordancePanelOpen = ref(false);
const selectedGenericAffordanceKey = ref<string | null>(null);
const delegationPanelOpen = ref(false);
const gitPanelOpen = ref(false);
const inboxPanelOpen = ref(false);
const mailboxPanelOpen = ref(false);
const schedulerPanelOpen = ref(false);
const sopPanelOpen = ref(false);
const surfaceFeedbackPanelOpen = ref(false);
const taskLifecyclePanelOpen = ref(false);
const titleParts = computed(() => summarizeSessionTitleParts(props.sessionIdentity));
const titleSiteLabel = computed(() => titleParts.value.siteLabel);
const titleAgentLabel = computed(() => titleParts.value.agentLabel);
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
const genericAffordances = computed(() => props.surfaceAffordances.items.filter((item) => item.renderer === 'generic_mcp_affordance'));
const selectedGenericAffordance = computed(() => genericAffordances.value.find((item) => genericSurfaceKey(item) === selectedGenericAffordanceKey.value) ?? genericAffordances.value[0] ?? null);
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
      { key: 'task_lifecycle', label: 'Tasks', detail: props.taskLifecycleSummary.status, available: hasTaskLifecycleSurface.value },
      { key: 'inbox', label: 'Inbox', detail: `${props.inboxSummary.status} · ${props.inboxSummary.envelopes.count} received`, available: hasInboxSurface.value },
      { key: 'mailbox', label: 'Email', detail: `${props.mailboxSummary.status} · ${props.mailboxSummary.messages.count} messages`, available: hasMailboxSurface.value },
      { key: 'artifacts', label: 'Artifacts', detail: `${props.artifactsSummary.status} · ${props.artifactsSummary.artifacts.total} total`, available: hasArtifactsSurface.value },
    ],
  },
  {
    title: 'Automation',
    items: [
      { key: 'delegation', label: 'Delegation', detail: `${props.delegationSummary.status} · ${props.delegationSummary.workers.count + props.delegationSummary.delegatedTasks.count} visible`, available: hasDelegationSurface.value },
      { key: 'sop', label: 'SOP', detail: `${props.sopSummary.status} · ${props.sopSummary.templates.count} templates`, available: hasSopSurface.value },
      { key: 'scheduler', label: 'Scheduler', detail: `${props.schedulerSummary.status} · ${props.schedulerSummary.tasks.count} tasks`, available: hasSchedulerSurface.value },
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
        available: hasGitSurface.value,
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
      { key: 'surface_feedback', label: 'Surface Feedback', detail: props.surfaceFeedbackSummary.status, available: hasSurfaceFeedbackSurface.value },
    ],
  },
]);
const headerItemDefinitions: Record<HeaderItemId, Omit<StatusBoxSelectorItem, 'visible'>> = {
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
watch(visibleHeaderItemIds, (value) => persistHeaderItemIds(value));
watch(() => props.operatorSnippetOpenRequest, (request) => {
  if (request) snippetPanelOpen.value = true;
});

function compactSessionId(sessionId: string): string {
  if (sessionId.length <= 26) return sessionId;
  return `${sessionId.slice(0, 14)}...${sessionId.slice(-8)}`;
}

function openSurfacePanel(surfaceKind: string) {
  if (surfaceKind === 'runtime_topology') runtimeTopologyPanelOpen.value = true;
  else if (surfaceKind === 'mcp') mcpPanelOpen.value = true;
  else if (surfaceKind.startsWith('generic:')) {
    selectedGenericAffordanceKey.value = surfaceKind;
    genericAffordancePanelOpen.value = true;
  }
  else if (surfaceKind === 'artifacts') artifactsPanelOpen.value = true;
  else if (surfaceKind === 'delegation') delegationPanelOpen.value = true;
  else if (surfaceKind === 'git') gitPanelOpen.value = true;
  else if (surfaceKind === 'inbox') inboxPanelOpen.value = true;
  else if (surfaceKind === 'mailbox') mailboxPanelOpen.value = true;
  else if (surfaceKind === 'scheduler') schedulerPanelOpen.value = true;
  else if (surfaceKind === 'sop') sopPanelOpen.value = true;
  else if (surfaceKind === 'surface_feedback') surfaceFeedbackPanelOpen.value = true;
  else if (surfaceKind === 'task_lifecycle') taskLifecyclePanelOpen.value = true;
}

function genericSurfaceKey(item: { surfaceId: string | null; serverName: string | null; surfaceKind: string }): string {
  return `generic:${item.surfaceId ?? item.serverName ?? item.surfaceKind}`;
}

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

function loadHeaderItemIds(): Set<HeaderItemId> {
  if (typeof window === 'undefined') return new Set(DEFAULT_VISIBLE_HEADER_ITEM_IDS);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HEADER_ITEM_STORAGE_KEY) ?? 'null') as unknown;
    if (!Array.isArray(parsed)) return new Set(DEFAULT_VISIBLE_HEADER_ITEM_IDS);
    const allowed = new Set(HEADER_ITEM_IDS);
    const loaded = parsed.filter((id): id is HeaderItemId => typeof id === 'string' && allowed.has(id as HeaderItemId));
    return loaded.length ? new Set(loaded) : new Set(DEFAULT_VISIBLE_HEADER_ITEM_IDS);
  } catch {
    return new Set(DEFAULT_VISIBLE_HEADER_ITEM_IDS);
  }
}

function persistHeaderItemIds(ids: Set<HeaderItemId>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HEADER_ITEM_STORAGE_KEY, JSON.stringify([...ids]));
}

function isHeaderItemVisible(id: HeaderItemId): boolean {
  return visibleHeaderItemIds.value.has(id) || headerItemDefinitions[id].required === true;
}

function toggleHeaderItem(id: string) {
  if (!HEADER_ITEM_IDS.includes(id as HeaderItemId) || headerItemDefinitions[id as HeaderItemId].required) return;
  const next = new Set(visibleHeaderItemIds.value);
  if (next.has(id as HeaderItemId)) next.delete(id as HeaderItemId);
  else next.add(id as HeaderItemId);
  visibleHeaderItemIds.value = next;
}

function resetHeaderItems() {
  visibleHeaderItemIds.value = new Set(DEFAULT_VISIBLE_HEADER_ITEM_IDS);
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
                        @open-mcp-panel="mcpPanelOpen = true"
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
              <button type="button" class="mcp-panel-trigger runtime-topology-trigger" :data-state="runtimeTopology.status" :aria-expanded="runtimeTopologyPanelOpen" aria-controls="runtime-topology-panel" @click="runtimeTopologyPanelOpen = true">
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
                <StatusBoxSelector
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
    <ArtifactsPanel v-model:open="artifactsPanelOpen" triggerless :available="hasArtifactsSurface" :summary="artifactsSummary" @refresh="emit('request-artifacts-summary')" />
    <RuntimeTopologyPanel v-model:open="runtimeTopologyPanelOpen" :topology="runtimeTopology" />
    <McpServerPanel v-model:open="mcpPanelOpen" triggerless :inventory="mcpInventory" :surface-affordances="surfaceAffordances" @open-surface-panel="openSurfacePanel" />
    <GenericAffordancePanel v-model:open="genericAffordancePanelOpen" triggerless :item="selectedGenericAffordance" @action="emit('request-affordance-action', $event)" />
    <DelegationPanel v-model:open="delegationPanelOpen" triggerless :available="hasDelegationSurface" :summary="delegationSummary" @refresh="emit('request-delegation-summary')" />
    <GitPanel v-model:open="gitPanelOpen" triggerless :available="hasGitSurface" :summary="gitSummary" @refresh="emit('request-git-summary')" />
    <InboxPanel v-model:open="inboxPanelOpen" triggerless :available="hasInboxSurface" :summary="inboxSummary" @refresh="emit('request-inbox-summary')" />
    <MailboxPanel v-model:open="mailboxPanelOpen" triggerless :available="hasMailboxSurface" :summary="mailboxSummary" @refresh="emit('request-mailbox-summary')" />
    <SchedulerPanel v-model:open="schedulerPanelOpen" triggerless :available="hasSchedulerSurface" :summary="schedulerSummary" @refresh="emit('request-scheduler-summary')" />
    <TaskLifecyclePanel v-model:open="taskLifecyclePanelOpen" triggerless :available="hasTaskLifecycleSurface" :summary="taskLifecycleSummary" @refresh="emit('request-task-lifecycle-summary')" />
    <SopPanel v-model:open="sopPanelOpen" triggerless :available="hasSopSurface" :summary="sopSummary" @refresh="emit('request-sop-summary')" />
    <SurfaceFeedbackPanel v-model:open="surfaceFeedbackPanelOpen" triggerless :available="hasSurfaceFeedbackSurface" :summary="surfaceFeedbackSummary" @refresh="emit('request-surface-feedback-summary')" />
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
