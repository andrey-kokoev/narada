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
    `event-view-${props.verbosity}`,
    `event-disposition-${String(row.disposition ?? 'unknown').replace(/[^a-z0-9_-]/gi, '-')}`,
    `event-${String(row.kind).replace(/[^a-z0-9_-]/gi, '-')}`,
    `event-tone-${row.tone}`,
  ];
}

function sessionIdFor(row: ProjectedEventRow): string | null {
  const event = row.event as Record<string, unknown> | null;
  const nested = event?.event as Record<string, unknown> | null;
  return String(event?.session_id ?? nested?.session_id ?? '') || null;
}
</script>

<template>
  <li :class="eventClass(props.row)" :data-event-kind="row.kind" :data-event-tone="row.tone">
    <div class="event-heading">
      <span class="event-label">{{ row.label }}</span>
      <span v-if="verbosity !== 'conversation'" class="event-kind">{{ row.kind }}</span>
    </div>
    <div class="event-detail">
      <MessageContent :content="row.summary" :session-id="sessionIdFor(row)" />
      <RawEventDrawer v-if="verbosity === 'raw'" :event="row.event" />
    </div>
  </li>
</template>
