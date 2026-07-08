<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { OperatorQueueItem } from '../composables/useOperatorInput';

const props = defineProps<{
  items: OperatorQueueItem[];
  activeTurnId: string | boolean | null;
  canSteerActiveTurn: boolean;
}>();
const emit = defineEmits<{
  edit: [item: OperatorQueueItem];
  remove: [item: OperatorQueueItem];
  steer: [item: OperatorQueueItem];
}>();

const OPERATOR_QUEUE_OPEN_STORAGE_KEY = 'narada:agent-web-ui:operator-queue-open.v1';
const open = ref(loadBooleanPreference(OPERATOR_QUEUE_OPEN_STORAGE_KEY, true));
const countLabel = computed(() => `${props.items.length} queued`);
watch(open, (value) => persistBooleanPreference(OPERATOR_QUEUE_OPEN_STORAGE_KEY, value));

function loadBooleanPreference(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return fallback;
}

function persistBooleanPreference(key: string, value: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, String(value));
}
</script>

<template>
  <section v-if="items.length" class="operator-queue" :data-open="open" aria-label="Queued operator instructions">
    <button type="button" class="operator-queue-toggle" :aria-expanded="open" @click="open = !open">
      <span>Queued Operator Instructions</span>
      <span>{{ countLabel }} · {{ open ? 'collapse' : 'expand' }}</span>
    </button>
    <ol v-if="open" class="operator-queue-list">
      <li v-for="item in items" :key="item.event_id ?? item.index" class="operator-queue-item">
        <p>{{ item.content }}</p>
        <div class="operator-queue-meta">
          <span>#{{ item.index }}</span>
          <span v-if="item.delivery_mode">{{ item.delivery_mode }}</span>
          <span v-if="item.created_at">{{ item.created_at }}</span>
        </div>
        <div class="operator-queue-actions">
          <button type="button" @click="emit('edit', item)">Edit</button>
          <button type="button" @click="emit('remove', item)">Remove</button>
          <button type="button" :disabled="!activeTurnId || !canSteerActiveTurn" @click="emit('steer', item)">Send now to steer</button>
        </div>
      </li>
    </ol>
  </section>
</template>
