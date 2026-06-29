<script setup lang="ts">
import MessageContent from './content/MessageContent.vue';
import RawEventDrawer from './RawEventDrawer.vue';
import type { ProjectionVerbosity } from '../composables/useProjectionVerbosity';
import type { ProjectedEventRow } from '../lib/eventProjection';

const props = defineProps<{
  row: ProjectedEventRow;
  verbosity: ProjectionVerbosity;
}>();

function eventClass(row: ProjectedEventRow) {
  return [
    'event',
    `event-${String(row.kind).replace(/[^a-z0-9_-]/gi, '-')}`,
    `event-tone-${row.tone}`,
  ];
}
</script>

<template>
  <li :class="eventClass(props.row)" :data-event-kind="row.kind" :data-event-tone="row.tone">
    <div class="event-heading">
      <span class="event-label">{{ row.label }}</span>
      <span class="event-kind">{{ row.kind }}</span>
    </div>
    <div class="event-detail">
      <MessageContent :content="row.summary" />
      <RawEventDrawer v-if="verbosity === 'raw'" :event="row.event" />
    </div>
  </li>
</template>
