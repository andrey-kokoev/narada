<script setup lang="ts">
import ConversationTranscript from './ConversationTranscript.vue';
import OperatorComposer from './OperatorComposer.vue';
import SessionStatusBar from './SessionStatusBar.vue';
import type { ProjectionVerbosity } from '../composables/useProjectionVerbosity';
import type { ProjectedEventRow } from '../lib/eventProjection';

const props = defineProps<{
  eventEndpoint: string | null;
  healthEndpoint: string | null;
  healthTransport: string;
  streamText: string;
  healthText: string;
  droppedCount: number;
  verbosity: ProjectionVerbosity;
  verbosityLevels: readonly ProjectionVerbosity[];
  rows: ProjectedEventRow[];
}>();
const draft = defineModel<string>('draft', { required: true });
const emit = defineEmits<{
  'update:verbosity': [value: ProjectionVerbosity];
  submit: [];
}>();
</script>

<template>
  <main class="shell" aria-label="Narada Agent Web UI">
    <header class="shell-header">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true">N</span>
        <div>
          <h1>Narada Session</h1>
          <p>Browser projection attached to one NARS runtime.</p>
        </div>
      </div>
      <div class="session-chip" :data-state="healthText.split(' ')[0]">
        <span class="chip-dot" aria-hidden="true"></span>
        <span>{{ healthText }}</span>
      </div>
    </header>
    <SessionStatusBar
      :event-endpoint="eventEndpoint"
      :health-endpoint="healthEndpoint"
      :health-transport="healthTransport"
      :stream-text="streamText"
      :health-text="healthText"
      :dropped-count="droppedCount"
      :verbosity="verbosity"
      :verbosity-levels="verbosityLevels"
      @update:verbosity="emit('update:verbosity', $event)"
    />
    <ConversationTranscript :rows="rows" :verbosity="verbosity" />
    <OperatorComposer v-model="draft" @submit="emit('submit')" />
  </main>
</template>
