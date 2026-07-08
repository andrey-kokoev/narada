<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import EventRow from './EventRow.vue';
import type { AgentActivityState } from '../composables/useAgentActivity';
import type { ProjectionVerbosity } from '../composables/useProjectionVerbosity';
import type { ProjectedEventRow } from '../lib/eventProjection';

const props = defineProps<{
  rows: ProjectedEventRow[];
  verbosity: ProjectionVerbosity;
  agentActivity: AgentActivityState;
  followLatestRevision: number;
}>();
const emit = defineEmits<{ 'intent-selected': [intent: string] }>();

const scroller = ref<HTMLElement | null>(null);
const stickToBottom = ref(true);
const renderedRowRevision = computed(() => props.rows.map((row) => `${row.key}:${row.kind}:${summaryLength(row.summary)}`).join('|'));

function summaryLength(summary: unknown): number {
  if (typeof summary === 'string') return summary.length;
  if (Array.isArray(summary)) return summary.length;
  if (summary === null || summary === undefined) return 0;
  return String(summary).length;
}

function updateScrollState() {
  const element = scroller.value;
  if (!element) return;
  stickToBottom.value = element.scrollHeight - element.scrollTop - element.clientHeight <= 96;
}

function scrollToBottom() {
  const element = scroller.value;
  if (!element) return;
  element.scrollTop = element.scrollHeight;
  updateScrollState();
}

function forceScrollToBottom() {
  stickToBottom.value = true;
  nextTick(() => {
    scrollToBottom();
    window.requestAnimationFrame(() => {
      scrollToBottom();
    });
  });
}

onMounted(() => nextTick(scrollToBottom));

watch(renderedRowRevision, () => {
  const shouldFollow = stickToBottom.value;
  nextTick(() => {
    if (shouldFollow) scrollToBottom();
    else updateScrollState();
  });
});

watch(() => props.followLatestRevision, () => {
  forceScrollToBottom();
});
</script>

<template>
  <div ref="scroller" class="events-scroll" @scroll="updateScrollState">
    <ol id="events" class="events" aria-label="NARS session events">
      <EventRow v-for="row in rows" :key="row.key" :row="row" :verbosity="verbosity" @intent-selected="emit('intent-selected', $event)" />
      <li
        v-if="agentActivity.active && (verbosity === 'conversation' || verbosity === 'operations')"
        class="event event-agent-activity event-tone-assistant"
        :data-event-kind="`activity_${agentActivity.state}`"
        data-event-tone="assistant"
      >
        <div class="event-heading">
          <span class="event-label">Activity</span>
          <span class="event-kind">{{ agentActivity.state }}</span>
        </div>
        <div class="event-detail">
          <div class="event-summary agent-activity-summary">
            <span class="activity-pulse" aria-hidden="true"></span>
            <span>{{ agentActivity.label }}</span>
            <span v-if="agentActivity.elapsedSeconds >= 5" class="agent-activity-elapsed">{{ agentActivity.elapsedSeconds }}s</span>
            <span v-if="agentActivity.detail" class="agent-activity-detail">{{ agentActivity.detail }}</span>
          </div>
        </div>
      </li>
    </ol>
  </div>
</template>
