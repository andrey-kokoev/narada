<script setup lang="ts">
import EventRow from './EventRow.vue';
import TurnSummaryRow from './TurnSummaryRow.vue';
import type { ProjectionVerbosity } from '../composables/useProjectionVerbosity';
import type { ProjectedTurnGroupRow } from '../lib/eventProjection';

const props = defineProps<{
  row: ProjectedTurnGroupRow;
  verbosity: ProjectionVerbosity;
}>();

const emit = defineEmits<{ 'intent-selected': [intent: string] }>();
</script>

<template>
  <li
    class="turn-group event-turn_group event-tone-assistant"
    :data-event-kind="props.row.kind"
    data-event-tone="assistant"
    :data-turn-id="props.row.turnId"
  >
    <ol class="turn-group-events narada-list-reset" :aria-label="`Turn ${props.row.turnId}`">
      <EventRow
        v-for="child in props.row.children"
        :key="child.key"
        :row="child"
        :verbosity="verbosity"
        @intent-selected="emit('intent-selected', $event)"
      />
      <TurnSummaryRow v-if="props.row.turnSummary" :row="props.row.turnSummary" />
    </ol>
  </li>
</template>
