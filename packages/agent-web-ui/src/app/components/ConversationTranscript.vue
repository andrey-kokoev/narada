<script setup lang="ts">
import EventRow from './EventRow.vue';
import type { ProjectionVerbosity } from '../composables/useProjectionVerbosity';
import type { ProjectedEventRow } from '../lib/eventProjection';

defineProps<{
  rows: ProjectedEventRow[];
  verbosity: ProjectionVerbosity;
}>();
</script>

<template>
  <ol id="events" class="events" aria-label="NARS session events">
    <EventRow v-for="row in rows" :key="row.key" :row="row" :verbosity="verbosity" />
  </ol>
</template>
