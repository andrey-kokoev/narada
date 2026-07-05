<script setup lang="ts">
import { provide, ref } from 'vue';
import NarsSessionShell from './components/NarsSessionShell.vue';
import { useAgentActivity } from './composables/useAgentActivity';
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
import { useProjectionVerbosity } from './composables/useProjectionVerbosity';
import { useRetainedEvents } from './composables/useRetainedEvents';
import { useSchedulerSummary } from './composables/useSchedulerSummary';
import { useSopSummary } from './composables/useSopSummary';
import { useSurfaceAffordances } from './composables/useSurfaceAffordances';
import { useTaskLifecycleSummary } from './composables/useTaskLifecycleSummary';
import { ArtifactRenderingConfigKey } from './lib/artifactConfig';
import { buildDelegationSummaryRequestFrame, buildGitSummaryRequestFrame, buildInboxSummaryRequestFrame, buildMailboxSummaryRequestFrame, buildSchedulerSummaryRequestFrame, buildSopSummaryRequestFrame, buildSurfaceAffordancesRequestFrame, buildTaskLifecycleSummaryRequestFrame } from './lib/narsFrames';

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
const mcpInventory = useMcpInventory(retained.events, health.body);
const delegationSummary = useDelegationSummary(retained.events);
const gitSummary = useGitSummary(retained.events);
const inboxSummary = useInboxSummary(retained.events);
const mailboxSummary = useMailboxSummary(retained.events);
const schedulerSummary = useSchedulerSummary(retained.events);
const sopSummary = useSopSummary(retained.events);
const taskLifecycleSummary = useTaskLifecycleSummary(retained.events);
const surfaceAffordances = useSurfaceAffordances(retained.events, health.body);
const operatorQueue = useOperatorQueue(health.body);
const cloudflareProjection = useCloudflareProjection(props.config.projectionControl?.cloudflare ?? null);
const input = useOperatorInput(connection.connection, retained.retain, retained.clear, props.config.authorityTransition ?? null);
const draft = input.draft;
const followLatestRevision = ref(0);

function submitOperatorDraft(deliveryMode: 'default' | 'enqueue' = 'default') {
  if (input.submit(deliveryMode)) followLatestRevision.value += 1;
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

function requestMailboxSummary() {
  connection.connection.value?.sendFrame(buildMailboxSummaryRequestFrame());
}

function requestSchedulerSummary() {
  connection.connection.value?.sendFrame(buildSchedulerSummaryRequestFrame());
}

function requestTaskLifecycleSummary() {
  connection.connection.value?.sendFrame(buildTaskLifecycleSummaryRequestFrame());
}

function requestSurfaceAffordances() {
  connection.connection.value?.sendFrame(buildSurfaceAffordancesRequestFrame());
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
    :operator-queue-items="operatorQueue.items.value"
    :active-turn-id="connection.activeTurnId.value"
    :mcp-inventory="mcpInventory.inventory.value"
    :surface-affordances="surfaceAffordances.summary.value"
    :delegation-summary="delegationSummary.summary.value"
    :git-summary="gitSummary.summary.value"
    :inbox-summary="inboxSummary.summary.value"
    :mailbox-summary="mailboxSummary.summary.value"
    :scheduler-summary="schedulerSummary.summary.value"
    :sop-summary="sopSummary.summary.value"
    :task-lifecycle-summary="taskLifecycleSummary.summary.value"
    :authority-transition="config.authorityTransition ?? null"
    :cloudflare-projection="cloudflareProjection"
    :follow-latest-revision="followLatestRevision"
    @update:verbosity="projection.setVerbosity"
    @publish-cloudflare="cloudflareProjection.publish"
    @submit="submitOperatorDraft"
    @interrupt="interruptModel"
    @edit-queued="input.editQueued"
    @remove-queued="input.dropQueued($event.index)"
    @steer-queued="input.steerQueuedNow"
    @request-delegation-summary="requestDelegationSummary"
    @request-git-summary="requestGitSummary"
    @request-inbox-summary="requestInboxSummary"
    @request-mailbox-summary="requestMailboxSummary"
    @request-scheduler-summary="requestSchedulerSummary"
    @request-sop-summary="requestSopSummary"
    @request-task-lifecycle-summary="requestTaskLifecycleSummary"
    @request-surface-affordances="requestSurfaceAffordances"
  />
</template>
