<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ProjectedEventRow } from '../lib/eventProjection';

const props = defineProps<{
  row: ProjectedEventRow;
}>();

const expanded = ref(false);

const summary = computed<TurnSummaryContent | null>(() => {
  const raw = props.row.summary;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  return {
    text: typeof s.text === 'string' ? s.text : 'Turn summary',
    tools: Array.isArray(s.tools) ? s.tools.filter((t): t is string => typeof t === 'string') : [],
    durationSeconds: typeof s.durationSeconds === 'number' ? s.durationSeconds : null,
    toolCallCount: typeof s.toolCallCount === 'number' ? s.toolCallCount : 0,
    toolResultCount: typeof s.toolResultCount === 'number' ? s.toolResultCount : 0,
    toolFailureCount: typeof s.toolFailureCount === 'number' ? s.toolFailureCount : 0,
  };
});

type TurnSummaryContent = {
  text: string;
  tools: string[];
  durationSeconds: number | null;
  toolCallCount: number;
  toolResultCount: number;
  toolFailureCount: number;
};

function toggle() {
  expanded.value = !expanded.value;
}
</script>

<template>
  <li
    :class="[
      'event',
      'event-turn_summary',
      'event-disposition-conversation_fact',
      'event-tone-status',
    ]"
    :data-event-kind="row.kind"
    data-event-tone="status"
  >
    <div class="event-heading">
      <span class="event-label">Turn</span>
    </div>
    <div class="event-detail">
      <button
        type="button"
        class="event-summary turn-summary-toggle"
        :aria-expanded="expanded"
        @click="toggle"
      >
        <span class="turn-summary-text">{{ summary?.text ?? 'Turn summary' }}</span>
        <span class="turn-summary-chevron" aria-hidden="true">{{ expanded ? '▾' : '▸' }}</span>
      </button>
      <div v-if="expanded && summary && summary.tools.length > 0" class="turn-summary-tools">
        <span class="turn-summary-tools-label">Tools:</span>
        <ul class="turn-summary-tools-list">
          <li v-for="tool in summary.tools" :key="tool">{{ tool }}</li>
        </ul>
      </div>
      <div v-else-if="expanded && summary && summary.tools.length === 0" class="turn-summary-tools">
        <span class="turn-summary-tools-empty">No tools called.</span>
      </div>
    </div>
  </li>
</template>
