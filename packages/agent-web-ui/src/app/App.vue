<script setup lang="ts">
import NarsSessionShell from './components/NarsSessionShell.vue';
import { useHealthStatus } from './composables/useHealthStatus';
import { useNarsConnection } from './composables/useNarsConnection';
import { useNarsEvents } from './composables/useNarsEvents';
import { useOperatorInput } from './composables/useOperatorInput';
import { useProjectionVerbosity } from './composables/useProjectionVerbosity';
import { useRetainedEvents } from './composables/useRetainedEvents';

interface AgentWebUiConfig {
  eventEndpoint: string | null;
  healthEndpoint: string | null;
  healthTransport: string;
  maxReplay?: number;
}

const props = defineProps<{ config: AgentWebUiConfig }>();
const retained = useRetainedEvents();
const projection = useProjectionVerbosity();
const connection = useNarsConnection({ eventEndpoint: props.config.eventEndpoint, maxReplay: props.config.maxReplay }, retained.retain);
const events = useNarsEvents(retained.events, projection.verbosity);
const health = useHealthStatus({ endpoint: props.config.healthEndpoint });
const input = useOperatorInput(connection.connection, retained.retain, retained.clear);
const draft = input.draft;
</script>

<template>
  <NarsSessionShell
    v-model:draft="draft"
    :event-endpoint="config.eventEndpoint"
    :health-endpoint="config.healthEndpoint"
    :health-transport="config.healthTransport"
    :stream-text="connection.streamText.value"
    :health-text="health.text.value"
    :dropped-count="retained.state.droppedCount"
    :verbosity="projection.verbosity.value"
    :verbosity-levels="projection.levels"
    :rows="events.rows.value"
    @update:verbosity="projection.setVerbosity"
    @submit="input.submit"
  />
</template>
