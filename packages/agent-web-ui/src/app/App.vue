<script setup lang="ts">
import { computed, nextTick, provide, ref, watch } from 'vue';
import NarsSessionShell from './components/NarsSessionShell.vue';
import { useAgentActivity } from './composables/useAgentActivity';
import { useAffordanceConfirmations, type AffordanceConfirmationItem } from './composables/useAffordanceConfirmations';
import { useArtifactsSummary } from './composables/useArtifactsSummary';
import { useCloudflareProjection, type ProjectionControlConfig } from './composables/useCloudflareProjection';
import { useDelegationSummary } from './composables/useDelegationSummary';
import { useGitSummary } from './composables/useGitSummary';
import { useHealthStatus } from './composables/useHealthStatus';
import { useInboxSummary } from './composables/useInboxSummary';
import { useMailboxSummary } from './composables/useMailboxSummary';
import { useMcpInventory } from './composables/useMcpInventory';
import { useNarsConnection } from './composables/useNarsConnection';
import { useNarsEvents } from './composables/useNarsEvents';
import { useOperatorInput } from './composables/useOperatorInput';
import { useOperatorQueue } from './composables/useOperatorQueue';
import { useOperatorSnippets, type OperatorSnippet, type OperatorSnippetCommandEvent, type OperatorSnippetFeedback, type OperatorSnippetOpenRequest } from './composables/useOperatorSnippets';
import { useProjectionVerbosity } from './composables/useProjectionVerbosity';
import { useRetainedEvents } from './composables/useRetainedEvents';
import { useRuntimeTopology } from './composables/useRuntimeTopology';
import { useResolvedFavicon } from './composables/useResolvedFavicon.js';
import { useSchedulerSummary } from './composables/useSchedulerSummary';
import { useSopSummary } from './composables/useSopSummary';
import { useSurfaceAffordances } from './composables/useSurfaceAffordances';
import { useSurfaceFeedbackSummary } from './composables/useSurfaceFeedbackSummary';
import { useTaskLifecycleSummary } from './composables/useTaskLifecycleSummary';
import { ArtifactRenderingConfigKey } from './lib/artifactConfig';
import { buildAffordanceActionCancelFrame, buildAffordanceActionConfirmFrame, buildAffordanceActionRequestFrame, buildArtifactsSummaryRequestFrame, buildDelegationSummaryRequestFrame, buildGitSummaryRequestFrame, buildInboxSummaryRequestFrame, buildMailboxSummaryRequestFrame, buildSchedulerSummaryRequestFrame, buildSopSummaryRequestFrame, buildSurfaceAffordancesRequestFrame, buildSurfaceFeedbackSummaryRequestFrame, buildTaskLifecycleSummaryRequestFrame } from './lib/narsFrames';

interface AgentWebUiConfig {
  eventEndpoint: string | null;
  healthEndpoint: string | null;
  healthTransport: string;
  inputEndpoint?: string | null;
  browserToken?: string | null;
  artifactBasePath?: string | null;
  artifactTransport?: string | null;
  projectionControl?: ProjectionControlConfig | null;
  authorityTransition?: Record<string, unknown> | null;
  maxReplay?: number;
}

const props = defineProps<{ config: AgentWebUiConfig }>();
provide(ArtifactRenderingConfigKey, {
  artifactBasePath: props.config.artifactBasePath ?? null,
  artifactTransport: props.config.artifactTransport ?? null,
  browserToken: props.config.browserToken ?? null,
});
const retained = useRetainedEvents();
const projection = useProjectionVerbosity();
const health = useHealthStatus({ endpoint: props.config.healthEndpoint, browserToken: props.config.browserToken ?? null });
const connection = useNarsConnection(
  { eventEndpoint: props.config.eventEndpoint, inputEndpoint: props.config.inputEndpoint, browserToken: props.config.browserToken ?? null, maxReplay: props.config.maxReplay },
  retained.retain,
  retained.retainMany,
);
const events = useNarsEvents(retained.events, projection.verbosity, health.identity);
const agentActivity = useAgentActivity(retained.events, health.body);
const affordanceConfirmations = useAffordanceConfirmations(retained.events);
const mcpInventory = useMcpInventory(retained.events, health.body);
const artifactsSummary = useArtifactsSummary(retained.events);
const delegationSummary = useDelegationSummary(retained.events);
const gitSummary = useGitSummary(retained.events);
const inboxSummary = useInboxSummary(retained.events);
const mailboxSummary = useMailboxSummary(retained.events);
const schedulerSummary = useSchedulerSummary(retained.events);
const sopSummary = useSopSummary(retained.events);
const surfaceFeedbackSummary = useSurfaceFeedbackSummary(retained.events);
const taskLifecycleSummary = useTaskLifecycleSummary(retained.events);
const surfaceAffordances = useSurfaceAffordances(retained.events, health.body);
const runtimeTopology = useRuntimeTopology({
  eventEndpoint: props.config.eventEndpoint,
  healthEndpoint: props.config.healthEndpoint,
  inputEndpoint: props.config.inputEndpoint ?? null,
  streamText: connection.streamText,
  healthText: health.text,
  healthBody: health.body,
  sessionIdentity: events.sessionIdentity,
  authorityTransition: computed(() => props.config.authorityTransition ?? null),
  mcpInventory: mcpInventory.inventory,
});
const operatorQueue = useOperatorQueue(health.body);
const operatorSnippets = useOperatorSnippets();
const cloudflareProjection = useCloudflareProjection(props.config.projectionControl?.cloudflare ?? null);
const canSteerActiveTurn = computed(() => (
  Boolean(connection.activeTurnId.value)
  && agentActivity.activity.value.active === true
  && (agentActivity.activity.value.state === 'thinking' || agentActivity.activity.value.state === 'streaming')
));
const input = useOperatorInput(connection.connection, retained.retain, retained.clear, props.config.authorityTransition ?? null, () => canSteerActiveTurn.value);
const draft = input.draft;
const followLatestRevision = ref(0);
const surfaceAffordancesRequested = ref(false);
const operatorSnippetFeedback = ref<OperatorSnippetFeedback | null>(null);
const operatorSnippetOpenRequest = ref<OperatorSnippetOpenRequest | null>(null);
const faviconOverride = ref(null);
useResolvedFavicon({ tabOverride: faviconOverride, healthBody: health.body });

watch(connection.streamText, (status) => {
  if (surfaceAffordancesRequested.value || status !== 'connected') return;
  surfaceAffordancesRequested.value = connection.connection.value?.sendFrame(buildSurfaceAffordancesRequestFrame()) ?? false;
}, { immediate: true });

function submitOperatorDraft(deliveryMode: 'default' | 'enqueue' = 'default') {
  const trimmedDraft = draft.value.trim();
  const snippetsMatch = /^\/snippets(?:\s+([\s\S]+))?$/i.exec(trimmedDraft);
  if (snippetsMatch) {
    openOperatorSnippets(snippetsMatch[1] ?? '', 'list');
    draft.value = '';
    followLatestRevision.value += 1;
    return;
  }
  if (/^\/snippet\s*$/i.test(trimmedDraft)) {
    draft.value = '/snippet ';
    followLatestRevision.value += 1;
    return;
  }
  const snippetSearchMatch = /^\/snippet\s+search(?:\s+([\s\S]+))?$/i.exec(trimmedDraft);
  if (snippetSearchMatch) {
    openOperatorSnippets(snippetSearchMatch[1] ?? '', 'list');
    draft.value = '';
    followLatestRevision.value += 1;
    return;
  }
  if (/^\/snippet(?:\s|$)/i.test(trimmedDraft)) {
    const action = operatorSnippets.handleSnippetCommand(trimmedDraft.replace(/^\/snippet\s*/i, ''));
    if (action.kind === 'local_event') {
      retainSnippetEvent(action.event);
      draft.value = '';
      followLatestRevision.value += 1;
      return;
    }
    if (action.kind === 'run') {
      if (input.submitConversationText(action.snippet.body, action.deliveryMode ?? deliveryMode)) {
        operatorSnippets.markSnippetUsed(action.snippet.name);
        retainSnippetRunEvent(action.snippet, action.deliveryMode ?? deliveryMode);
        draft.value = '';
        followLatestRevision.value += 1;
      }
      return;
    }
  }
  if (input.submit(deliveryMode)) followLatestRevision.value += 1;
}

function openOperatorSnippets(query = '', mode: 'list' | 'create' = 'list') {
  operatorSnippetOpenRequest.value = { id: Date.now(), query: query.trim(), mode };
  retainSnippetEvent(operatorSnippets.commandEvent(query.trim() ? `Opened snippets for: ${query.trim()}` : 'Opened snippets.', { ok: true }));
}

function retainSnippetEvent(event: OperatorSnippetCommandEvent) {
  input.retainLocal(event);
  operatorSnippetFeedback.value = { id: Date.now(), event };
}

function runOperatorSnippet(snippet: OperatorSnippet, deliveryMode: 'default' | 'enqueue' = 'default') {
  if (input.submitConversationText(snippet.body, deliveryMode)) {
    operatorSnippets.markSnippetUsed(snippet.name);
    retainSnippetRunEvent(snippet, deliveryMode);
    draft.value = '';
    followLatestRevision.value += 1;
  }
}

function fillOperatorSnippet(snippet: OperatorSnippet) {
  draft.value = snippet.body;
  retainSnippetEvent(operatorSnippets.commandEvent(`Filled composer with snippet: ${snippet.name}`, { snippet_name: snippet.name }));
  followLatestRevision.value += 1;
}

function saveOperatorSnippet(name: string, body: string, mode: 'save' | 'edit') {
  retainSnippetEvent(operatorSnippets.saveSnippet(name, body, mode));
  followLatestRevision.value += 1;
}

function restoreOperatorSnippet(snippet: OperatorSnippet) {
  retainSnippetEvent(operatorSnippets.restoreSnippet(snippet));
  followLatestRevision.value += 1;
}

function renameOperatorSnippet(oldName: string, newName: string, body: string) {
  retainSnippetEvent(operatorSnippets.renameSnippet(oldName, newName, body));
  followLatestRevision.value += 1;
}

function deleteOperatorSnippet(name: string) {
  retainSnippetEvent(operatorSnippets.deleteSnippet(name));
  followLatestRevision.value += 1;
}

function pinOperatorSnippet(name: string) {
  retainSnippetEvent(operatorSnippets.togglePinned(name));
  followLatestRevision.value += 1;
}

function importOperatorSnippets(json: string) {
  retainSnippetEvent(operatorSnippets.importSnippetsJson(json));
  followLatestRevision.value += 1;
}

function retainSnippetRunEvent(snippet: OperatorSnippet, deliveryMode: 'default' | 'enqueue') {
  const verb = deliveryMode === 'enqueue' ? 'Queued' : 'Ran';
  retainSnippetEvent(operatorSnippets.commandEvent(`${verb} snippet: ${snippet.name}`, { snippet_name: snippet.name, delivery_mode: deliveryMode }));
}
function fillIntentRef(intentText: string) {
  const normalized = intentText.trim();
  if (!normalized) return;
  draft.value = normalized;
  input.retainLocal({ event: 'agent_web_ui_message', message: 'Filled composer with intent affordance.', intent: normalized });
  followLatestRevision.value += 1;
  nextTick(() => {
    const inputElement = document.querySelector<HTMLTextAreaElement>('#operator-input');
    inputElement?.focus();
    inputElement?.setSelectionRange(inputElement.value.length, inputElement.value.length);
  });
}

function interruptModel() {
  if (input.interrupt()) followLatestRevision.value += 1;
}

function requestSopSummary() {
  connection.connection.value?.sendFrame(buildSopSummaryRequestFrame());
}

function requestInboxSummary() {
  connection.connection.value?.sendFrame(buildInboxSummaryRequestFrame());
}

function requestDelegationSummary() {
  connection.connection.value?.sendFrame(buildDelegationSummaryRequestFrame());
}

function requestGitSummary() {
  connection.connection.value?.sendFrame(buildGitSummaryRequestFrame());
}

function requestArtifactsSummary() {
  connection.connection.value?.sendFrame(buildArtifactsSummaryRequestFrame());
}

function requestMailboxSummary() {
  connection.connection.value?.sendFrame(buildMailboxSummaryRequestFrame());
}

function requestSchedulerSummary() {
  connection.connection.value?.sendFrame(buildSchedulerSummaryRequestFrame());
}

function requestTaskLifecycleSummary() {
  connection.connection.value?.sendFrame(buildTaskLifecycleSummaryRequestFrame());
}

function requestSurfaceFeedbackSummary() {
  connection.connection.value?.sendFrame(buildSurfaceFeedbackSummaryRequestFrame());
}

function requestAffordanceAction(request: { surfaceId: string; actionId: string; args: Record<string, unknown> }) {
  const frame = buildAffordanceActionRequestFrame({ surfaceId: request.surfaceId, actionId: request.actionId, args: request.args });
  if (frame) {
    connection.connection.value?.sendFrame(frame);
    void health.refresh();
  }
}

function confirmAffordanceAction(item: AffordanceConfirmationItem) {
  const frame = buildAffordanceActionConfirmFrame({ confirmationId: item.confirmationId });
  if (frame) connection.connection.value?.sendFrame(frame);
}

function cancelAffordanceAction(item: AffordanceConfirmationItem) {
  const frame = buildAffordanceActionCancelFrame({ confirmationId: item.confirmationId });
  if (frame) connection.connection.value?.sendFrame(frame);
}
</script>

<template>
  <NarsSessionShell
    v-model:draft="draft"
    :event-endpoint="config.eventEndpoint"
    :health-endpoint="config.healthEndpoint"
    :health-transport="config.healthTransport"
    :input-endpoint="config.inputEndpoint ?? null"
    :artifact-base-path="config.artifactBasePath ?? null"
    :artifact-transport="config.artifactTransport ?? null"
    :health-body="health.body.value"
    :stream-text="connection.streamText.value"
    :health-text="health.text.value"
    :intelligence="health.intelligence.value"
    :summarized-state-sample-count="events.summarizedStateSampleCount.value"
    :verbosity="projection.verbosity.value"
    :verbosity-levels="projection.levels"
    :rows="events.rows.value"
    :session-identity="events.sessionIdentity.value"
    :agent-activity="agentActivity.activity.value"
    :affordance-confirmations="affordanceConfirmations.items.value"
    :operator-queue-items="operatorQueue.items.value"
    :operator-snippets="operatorSnippets.snippets.value"
    :operator-snippets-export-json="operatorSnippets.exportSnippetsJson()"
    :operator-snippet-feedback="operatorSnippetFeedback"
    :operator-snippet-open-request="operatorSnippetOpenRequest"
    :active-turn-id="connection.activeTurnId.value"
    :mcp-inventory="mcpInventory.inventory.value"
    :runtime-topology="runtimeTopology.topology.value"
    :surface-affordances="surfaceAffordances.summary.value"
    :artifacts-summary="artifactsSummary.summary.value"
    :delegation-summary="delegationSummary.summary.value"
    :git-summary="gitSummary.summary.value"
    :inbox-summary="inboxSummary.summary.value"
    :mailbox-summary="mailboxSummary.summary.value"
    :scheduler-summary="schedulerSummary.summary.value"
    :sop-summary="sopSummary.summary.value"
    :surface-feedback-summary="surfaceFeedbackSummary.summary.value"
    :task-lifecycle-summary="taskLifecycleSummary.summary.value"
    :authority-transition="config.authorityTransition ?? null"
    :cloudflare-projection="cloudflareProjection"
    :follow-latest-revision="followLatestRevision"
    @update:verbosity="projection.setVerbosity"
    @publish-cloudflare="cloudflareProjection.publish"
    @submit="submitOperatorDraft"
    @run-snippet="runOperatorSnippet"
    @save-snippet="saveOperatorSnippet"
    @restore-snippet="restoreOperatorSnippet"
    @rename-snippet="renameOperatorSnippet"
    @delete-snippet="deleteOperatorSnippet"
    @pin-snippet="pinOperatorSnippet"
    @import-snippets="importOperatorSnippets"
    @fill-snippet="fillOperatorSnippet"
    @interrupt="interruptModel"
    @edit-queued="input.editQueued"
    @remove-queued="input.dropQueued($event.index)"
    @steer-queued="input.steerQueuedNow"
    @request-artifacts-summary="requestArtifactsSummary"
    @request-delegation-summary="requestDelegationSummary"
    @request-git-summary="requestGitSummary"
    @request-inbox-summary="requestInboxSummary"
    @request-mailbox-summary="requestMailboxSummary"
    @request-scheduler-summary="requestSchedulerSummary"
    @request-sop-summary="requestSopSummary"
    @request-task-lifecycle-summary="requestTaskLifecycleSummary"
    @request-surface-feedback-summary="requestSurfaceFeedbackSummary"
    @request-affordance-action="requestAffordanceAction"
    @confirm-affordance-action="confirmAffordanceAction"
    @cancel-affordance-action="cancelAffordanceAction"
    @intent-selected="fillIntentRef"
  />
</template>
