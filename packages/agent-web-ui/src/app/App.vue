<script setup lang="ts">
import { computed, nextTick, provide, ref, watch } from 'vue';
import NarsSessionShell from './components/NarsSessionShell.vue';
import { useAffordanceConfirmations, type AffordanceConfirmationItem } from './composables/useAffordanceConfirmations';
import { useArtifactsSummary } from './composables/useArtifactsSummary';
import { useCloudflareProjection, type ProjectionControlConfig } from './composables/useCloudflareProjection';
import { useDelegationSummary } from './composables/useDelegationSummary';
import { useGitSummary } from './composables/useGitSummary';
import { useInboxSummary } from './composables/useInboxSummary';
import { useMailboxSummary } from './composables/useMailboxSummary';
import { useMcpInventory } from './composables/useMcpInventory';
import { useSessionState } from './composables/useSessionState';
import { useSessionActions } from './composables/useSessionActions';
import { useOperatorInput, type OperatorQueueItem } from './composables/useOperatorInput';
import { useOperatorQueue } from './composables/useOperatorQueue';
import { useOperatorSnippets, type OperatorSnippet, type OperatorSnippetCommandEvent, type OperatorSnippetFeedback, type OperatorSnippetOpenRequest } from './composables/useOperatorSnippets';
import { useProjectionVerbosity, type ProjectionVerbosity } from './composables/useProjectionVerbosity';
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
  onboarding?: { mode: 'user-site' } | null;
  maxReplay?: number;
  admittedMethods?: readonly string[];
}

const props = defineProps<{ config: AgentWebUiConfig }>();
const supportsProtocolMethod = (method: string) => !props.config.admittedMethods || props.config.admittedMethods.includes(method);
const preferSessionCoreInput = supportsProtocolMethod('session.submit') && !supportsProtocolMethod('conversation.send');
provide(ArtifactRenderingConfigKey, {
  artifactBasePath: props.config.artifactBasePath ?? null,
  artifactTransport: props.config.artifactTransport ?? null,
  browserToken: props.config.browserToken ?? null,
});
const projection = useProjectionVerbosity();
const session = useSessionState(projection.verbosity, {
  eventEndpoint: props.config.eventEndpoint,
  healthEndpoint: props.config.healthEndpoint,
  inputEndpoint: props.config.inputEndpoint,
  browserToken: props.config.browserToken ?? null,
  maxReplay: props.config.maxReplay,
});
const sessionActions = useSessionActions(session.connection.connection, session.retain, supportsProtocolMethod);
const affordanceConfirmations = useAffordanceConfirmations(session.events);
const mcpInventory = useMcpInventory(session.events, session.health.body);
const artifactsSummary = useArtifactsSummary(session.events);
const delegationSummary = useDelegationSummary(session.events);
const gitSummary = useGitSummary(session.events);
const inboxSummary = useInboxSummary(session.events);
const mailboxSummary = useMailboxSummary(session.events);
const schedulerSummary = useSchedulerSummary(session.events);
const sopSummary = useSopSummary(session.events);
const surfaceFeedbackSummary = useSurfaceFeedbackSummary(session.events);
const taskLifecycleSummary = useTaskLifecycleSummary(session.events);
const surfaceAffordances = useSurfaceAffordances(session.events, session.health.body);
const runtimeTopology = useRuntimeTopology({
  eventEndpoint: props.config.eventEndpoint,
  healthEndpoint: props.config.healthEndpoint,
  inputEndpoint: props.config.inputEndpoint ?? null,
  streamText: session.streamText,
  healthText: session.health.text,
  healthBody: session.health.body,
  sessionIdentity: session.sessionIdentity,
  authorityTransition: computed(() => props.config.authorityTransition ?? null),
  mcpInventory: mcpInventory.inventory,
});
const operatorQueue = useOperatorQueue(session.health.body);
const operatorSnippets = useOperatorSnippets();
const cloudflareProjection = useCloudflareProjection(props.config.projectionControl?.cloudflare ?? null);
const canSteerActiveTurn = computed(() => (
  Boolean(session.activeTurnId.value)
  && session.activity.value.active === true
  && (session.activity.value.state === 'thinking' || session.activity.value.state === 'streaming')
));
const input = useOperatorInput(session.connection.connection, session.retain, session.clear, props.config.authorityTransition ?? null, () => canSteerActiveTurn.value, preferSessionCoreInput, supportsProtocolMethod, sessionActions.send, () => session.activeTurnId.value);
const draft = input.draft;
const followLatestRevision = ref(0);
const surfaceAffordancesRequested = ref(false);
const operatorSnippetFeedback = ref<OperatorSnippetFeedback | null>(null);
const operatorSnippetOpenRequest = ref<OperatorSnippetOpenRequest | null>(null);
const faviconOverride = ref(null);
useResolvedFavicon({ tabOverride: faviconOverride, healthBody: session.health.body });

function followLatestTranscript() {
  followLatestRevision.value += 1;
}

watch(session.streamText, (status) => {
  if (surfaceAffordancesRequested.value || status !== 'connected' || !supportsProtocolMethod('session.surface.affordances')) return;
  surfaceAffordancesRequested.value = sessionActions.send(buildSurfaceAffordancesRequestFrame());
}, { immediate: true });

function submitOperatorDraft(deliveryMode: 'default' | 'enqueue' = 'default') {
  const trimmedDraft = draft.value.trim();
  const snippetsMatch = /^\/snippets(?:\s+([\s\S]+))?$/i.exec(trimmedDraft);
  if (snippetsMatch) {
    openOperatorSnippets(snippetsMatch[1] ?? '', 'list');
    draft.value = '';
    followLatestTranscript();
    return;
  }
  if (/^\/snippet\s*$/i.test(trimmedDraft)) {
    draft.value = '/snippet ';
    followLatestTranscript();
    return;
  }
  const snippetSearchMatch = /^\/snippet\s+search(?:\s+([\s\S]+))?$/i.exec(trimmedDraft);
  if (snippetSearchMatch) {
    openOperatorSnippets(snippetSearchMatch[1] ?? '', 'list');
    draft.value = '';
    followLatestTranscript();
    return;
  }
  if (/^\/snippet(?:\s|$)/i.test(trimmedDraft)) {
    const action = operatorSnippets.handleSnippetCommand(trimmedDraft.replace(/^\/snippet\s*/i, ''));
    if (action.kind === 'local_event') {
      retainSnippetEvent(action.event);
      draft.value = '';
      followLatestTranscript();
      return;
    }
    if (action.kind === 'run') {
      if (input.submitConversationText(action.snippet.body, action.deliveryMode ?? deliveryMode)) {
        operatorSnippets.markSnippetUsed(action.snippet.name);
        retainSnippetRunEvent(action.snippet, action.deliveryMode ?? deliveryMode);
        draft.value = '';
        followLatestTranscript();
      }
      return;
    }
  }
  if (input.submit(deliveryMode)) followLatestTranscript();
}

function setProjectionVerbosity(value: ProjectionVerbosity) {
  projection.setVerbosity(value);
  followLatestTranscript();
}

function steerQueuedNow(item: OperatorQueueItem) {
  input.steerQueuedNow(item);
  followLatestTranscript();
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
    followLatestTranscript();
  }
}

function fillOperatorSnippet(snippet: OperatorSnippet) {
  draft.value = snippet.body;
  retainSnippetEvent(operatorSnippets.commandEvent(`Filled composer with snippet: ${snippet.name}`, { snippet_name: snippet.name }));
  followLatestTranscript();
}

function saveOperatorSnippet(name: string, body: string, mode: 'save' | 'edit') {
  retainSnippetEvent(operatorSnippets.saveSnippet(name, body, mode));
  followLatestTranscript();
}

function restoreOperatorSnippet(snippet: OperatorSnippet) {
  retainSnippetEvent(operatorSnippets.restoreSnippet(snippet));
  followLatestTranscript();
}

function renameOperatorSnippet(oldName: string, newName: string, body: string) {
  retainSnippetEvent(operatorSnippets.renameSnippet(oldName, newName, body));
  followLatestTranscript();
}

function deleteOperatorSnippet(name: string) {
  retainSnippetEvent(operatorSnippets.deleteSnippet(name));
  followLatestTranscript();
}

function pinOperatorSnippet(name: string) {
  retainSnippetEvent(operatorSnippets.togglePinned(name));
  followLatestTranscript();
}

function importOperatorSnippets(json: string) {
  retainSnippetEvent(operatorSnippets.importSnippetsJson(json));
  followLatestTranscript();
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
  followLatestTranscript();
  nextTick(() => {
    const inputElement = document.querySelector<HTMLTextAreaElement>('#operator-input');
    inputElement?.focus();
    inputElement?.setSelectionRange(inputElement.value.length, inputElement.value.length);
  });
}

function interruptModel() {
  if (input.interrupt()) followLatestTranscript();
}

function requestSopSummary() {
  sessionActions.send(buildSopSummaryRequestFrame());
}

function requestInboxSummary() {
  sessionActions.send(buildInboxSummaryRequestFrame());
}

function requestDelegationSummary() {
  sessionActions.send(buildDelegationSummaryRequestFrame());
}

function requestGitSummary() {
  sessionActions.send(buildGitSummaryRequestFrame());
}

function requestArtifactsSummary() {
  sessionActions.send(buildArtifactsSummaryRequestFrame());
}

function requestMailboxSummary() {
  sessionActions.send(buildMailboxSummaryRequestFrame());
}

function requestSchedulerSummary() {
  sessionActions.send(buildSchedulerSummaryRequestFrame());
}

function requestTaskLifecycleSummary() {
  sessionActions.send(buildTaskLifecycleSummaryRequestFrame());
}

function requestSurfaceFeedbackSummary() {
  sessionActions.send(buildSurfaceFeedbackSummaryRequestFrame());
}

function requestAffordanceAction(request: { surfaceId: string; actionId: string; args: Record<string, unknown> }) {
  const frame = buildAffordanceActionRequestFrame({ surfaceId: request.surfaceId, actionId: request.actionId, args: request.args });
  if (frame) {
    sessionActions.send(frame);
    void session.health.refresh();
  }
}

function confirmAffordanceAction(item: AffordanceConfirmationItem) {
  const frame = buildAffordanceActionConfirmFrame({ confirmationId: item.confirmationId });
  if (frame) sessionActions.send(frame);
}

function cancelAffordanceAction(item: AffordanceConfirmationItem) {
  const frame = buildAffordanceActionCancelFrame({ confirmationId: item.confirmationId });
  if (frame) sessionActions.send(frame);
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
    :health-body="session.health.body.value"
    :onboarding="config.onboarding?.mode === 'user-site'"
    :stream-text="session.streamText.value"
    :health-text="session.health.text.value"
    :intelligence="session.health.intelligence.value"
    :summarized-state-sample-count="session.summarizedStateSampleCount.value"
    :verbosity="projection.verbosity.value"
    :verbosity-levels="projection.levels"
    :rows="session.rows.value"
    :session-identity="session.sessionIdentity.value"
    :operator-delivery="session.operatorDelivery.value"
    :agent-activity="session.activity.value"
    :affordance-confirmations="affordanceConfirmations.items.value"
    :operator-queue-items="operatorQueue.items.value"
    :operator-snippets="operatorSnippets.snippets.value"
    :operator-snippets-export-json="operatorSnippets.exportSnippetsJson()"
    :operator-snippet-feedback="operatorSnippetFeedback"
    :operator-snippet-open-request="operatorSnippetOpenRequest"
    :active-turn-id="session.activeTurnId.value"
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
    @update:verbosity="setProjectionVerbosity"
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
    @steer-queued="steerQueuedNow"
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
