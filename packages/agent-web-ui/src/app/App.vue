<script setup lang="ts">
import { provide, ref } from 'vue';
import NarsSessionShell from './components/NarsSessionShell.vue';
import { useAgentActivity } from './composables/useAgentActivity';
import { useCloudflareProjection, type ProjectionControlConfig } from './composables/useCloudflareProjection';
import { useHealthStatus } from './composables/useHealthStatus';
import { useMcpInventory } from './composables/useMcpInventory';
import { useNarsConnection } from './composables/useNarsConnection';
import { useNarsEvents } from './composables/useNarsEvents';
import { useOperatorInput } from './composables/useOperatorInput';
import { useOperatorQueue } from './composables/useOperatorQueue';
import { useProjectionVerbosity } from './composables/useProjectionVerbosity';
import { useRetainedEvents } from './composables/useRetainedEvents';
import { ArtifactRenderingConfigKey } from './lib/artifactConfig';

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
const operatorQueue = useOperatorQueue(health.body);
const cloudflareProjection = useCloudflareProjection(props.config.projectionControl?.cloudflare ?? null);
const input = useOperatorInput(connection.connection, retained.retain, retained.clear, props.config.authorityTransition ?? null);
const draft = input.draft;
const followLatestRevision = ref(0);

function submitOperatorDraft(deliveryMode: 'default' | 'enqueue' = 'default') {
  if (input.submit(deliveryMode)) followLatestRevision.value += 1;
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
    :authority-transition="config.authorityTransition ?? null"
    :cloudflare-projection="cloudflareProjection"
    :follow-latest-revision="followLatestRevision"
    @update:verbosity="projection.setVerbosity"
    @publish-cloudflare="cloudflareProjection.publish"
    @submit="submitOperatorDraft"
    @edit-queued="input.editQueued"
    @remove-queued="input.dropQueued($event.index)"
    @steer-queued="input.steerQueuedNow"
  />
</template>
