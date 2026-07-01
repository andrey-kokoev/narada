<script setup lang="ts">
import { provide, ref } from 'vue';
import NarsSessionShell from './components/NarsSessionShell.vue';
import { useAgentActivity } from './composables/useAgentActivity';
import { useHealthStatus } from './composables/useHealthStatus';
import { useNarsConnection } from './composables/useNarsConnection';
import { useNarsEvents } from './composables/useNarsEvents';
import { useOperatorInput } from './composables/useOperatorInput';
import { useProjectionVerbosity } from './composables/useProjectionVerbosity';
import { useRetainedEvents } from './composables/useRetainedEvents';
import { ArtifactRenderingConfigKey } from './lib/artifactConfig';

interface AgentWebUiConfig {
  eventEndpoint: string | null;
  healthEndpoint: string | null;
  healthTransport: string;
  artifactBasePath?: string | null;
  artifactTransport?: string | null;
  maxReplay?: number;
}

const props = defineProps<{ config: AgentWebUiConfig }>();
provide(ArtifactRenderingConfigKey, {
  artifactBasePath: props.config.artifactBasePath ?? null,
  artifactTransport: props.config.artifactTransport ?? null,
});
const retained = useRetainedEvents();
const projection = useProjectionVerbosity();
const health = useHealthStatus({ endpoint: props.config.healthEndpoint });
const connection = useNarsConnection(
  { eventEndpoint: props.config.eventEndpoint, maxReplay: props.config.maxReplay },
  retained.retain,
  retained.retainMany,
);
const events = useNarsEvents(retained.events, projection.verbosity, health.identity);
const agentActivity = useAgentActivity(retained.events);
const input = useOperatorInput(connection.connection, retained.retain, retained.clear);
const draft = input.draft;
const followLatestRevision = ref(0);

function submitOperatorDraft() {
  if (input.submit()) followLatestRevision.value += 1;
}
</script>

<template>
  <NarsSessionShell
    v-model:draft="draft"
    :event-endpoint="config.eventEndpoint"
    :health-endpoint="config.healthEndpoint"
    :health-transport="config.healthTransport"
    :stream-text="connection.streamText.value"
    :health-text="health.text.value"
    :summarized-state-sample-count="events.summarizedStateSampleCount.value"
    :verbosity="projection.verbosity.value"
    :verbosity-levels="projection.levels"
    :rows="events.rows.value"
    :session-identity="events.sessionIdentity.value"
    :agent-activity="agentActivity.activity.value"
    :follow-latest-revision="followLatestRevision"
    @update:verbosity="projection.setVerbosity"
    @submit="submitOperatorDraft"
  />
</template>
