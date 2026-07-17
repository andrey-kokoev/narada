<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import EventRow from './EventRow.vue';
import type { AgentActivityState } from '../composables/useAgentActivity';
import type { ProjectionVerbosity } from '../composables/useProjectionVerbosity';
import type { ProjectedEventRow } from '../lib/eventProjection';

const props = defineProps<{
  rows: ProjectedEventRow[];
  verbosity: ProjectionVerbosity;
  agentActivity: AgentActivityState;
  followLatestRevision: number;
  hasEarlierEvents: boolean;
  historyTruncated: boolean;
  loadingEarlier: boolean;
}>();
const emit = defineEmits<{ 'intent-selected': [intent: string]; 'load-earlier': [] }>();

type ScrollAuthority = 'auto_follow' | 'operator_controlled' | 'force_follow_once';

const scroller = ref<HTMLElement | null>(null);
const scrollAuthority = ref<ScrollAuthority>('auto_follow');
const hasUnseenRows = ref(false);
const renderedRowRevision = computed(() => [
  ...props.rows.map((row) => `${row.key}:${row.kind}:${summaryLength(row.summary)}`),
  agentActivityRevision(),
].filter(Boolean).join('|'));
let scrollSettleTimer: number | null = null;
let prependAnchor: { scrollHeight: number; scrollTop: number } | null = null;

function summaryLength(summary: unknown): number {
  if (typeof summary === 'string') return summary.length;
  if (Array.isArray(summary)) return summary.length;
  if (summary === null || summary === undefined) return 0;
  return String(summary).length;
}

function agentActivityRevision(): string {
  if (!props.agentActivity.active || (props.verbosity !== 'conversation' && props.verbosity !== 'operations')) return '';
  return `activity:${props.agentActivity.state}:${props.agentActivity.label}:${props.agentActivity.detail ?? ''}`;
}

function updateScrollState() {
  const element = scroller.value;
  if (!element) return;
  if (isAtBottom(element)) {
    scrollAuthority.value = 'auto_follow';
    hasUnseenRows.value = false;
  } else {
    scrollAuthority.value = 'operator_controlled';
  }
}

function scrollToBottom() {
  const element = scroller.value;
  if (!element || scrollAuthority.value === 'operator_controlled') return;
  element.scrollTop = element.scrollHeight;
  updateScrollState();
}

function scheduleScrollToBottom(authority: ScrollAuthority = scrollAuthority.value) {
  if (authority === 'operator_controlled') return;
  if (authority === 'force_follow_once') scrollAuthority.value = 'force_follow_once';
  nextTick(() => {
    scrollToBottom();
    window.requestAnimationFrame(() => {
      scrollToBottom();
      window.requestAnimationFrame(() => {
        scrollToBottom();
      });
    });
    if (scrollSettleTimer !== null) window.clearTimeout(scrollSettleTimer);
    scrollSettleTimer = window.setTimeout(() => {
      scrollSettleTimer = null;
      scrollToBottom();
    }, 75);
  });
}

function forceScrollToBottom() {
  scheduleScrollToBottom('force_follow_once');
}

function requestLoadEarlier() {
  const element = scroller.value;
  prependAnchor = element
    ? { scrollHeight: element.scrollHeight, scrollTop: element.scrollTop }
    : null;
  emit('load-earlier');
}

function isAtBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 96;
}

onMounted(() => scheduleScrollToBottom('force_follow_once'));

onBeforeUnmount(() => {
  if (scrollSettleTimer !== null) window.clearTimeout(scrollSettleTimer);
});

watch(renderedRowRevision, () => {
  if (scrollAuthority.value === 'operator_controlled') {
    hasUnseenRows.value = true;
    nextTick(updateScrollState);
    return;
  }
  scheduleScrollToBottom(scrollAuthority.value);
}, { flush: 'post' });

watch(() => props.followLatestRevision, () => {
  forceScrollToBottom();
}, { flush: 'post' });

watch(() => props.loadingEarlier, (loading, wasLoading) => {
  if (loading || !wasLoading || !prependAnchor) return;
  const anchor = prependAnchor;
  prependAnchor = null;
  nextTick(() => {
    const element = scroller.value;
    if (!element) return;
    element.scrollTop = anchor.scrollTop + (element.scrollHeight - anchor.scrollHeight);
    updateScrollState();
  });
}, { flush: 'post' });
</script>

<template>
  <div ref="scroller" class="events-scroll" @scroll="updateScrollState">
    <div class="history-actions" aria-live="polite">
      <button
        v-if="hasEarlierEvents"
        type="button"
        class="load-earlier-button"
        :disabled="loadingEarlier"
        @click="requestLoadEarlier"
      >
        {{ loadingEarlier ? 'Loading earlier events…' : 'Load earlier events' }}
      </button>
      <p v-if="historyTruncated" class="history-gap-notice" role="status">
        Earlier history is unavailable because the remote projection cache has evicted events.
      </p>
    </div>
    <ol id="events" class="events narada-list-reset" aria-label="NARS session events">
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
    <button
      v-if="hasUnseenRows"
      type="button"
      class="new-messages-button"
      aria-label="Show latest messages"
      @click="forceScrollToBottom"
    >
      New messages
    </button>
  </div>
</template>
