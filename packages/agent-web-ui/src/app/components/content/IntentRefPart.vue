<script setup lang="ts">
import { ref } from 'vue';
import type { IntentRefContent } from '../../lib/messageContent';

const props = defineProps<{
  content: string;
  intent?: IntentRefContent;
  language?: string;
  ordinal?: number;
}>();
const emit = defineEmits<{ 'intent-selected': [intent: string] }>();

const staged = ref(false);

function tooltip() {
  return [props.intent?.description, props.intent?.intent].filter(Boolean).join(' · ');
}

function stageIntent() {
  const intent = props.intent?.intent?.trim();
  if (!intent) return;
  emit('intent-selected', intent);
  staged.value = true;
  window.setTimeout(() => {
    staged.value = false;
  }, 1200);
}
</script>

<template>
  <button
    type="button"
    class="message-part intent-ref-part"
    :data-status="staged ? 'staged' : undefined"
    :title="tooltip()"
    :aria-label="tooltip() || content"
    @click="stageIntent"
  >
    <span class="intent-ref-label">{{ content }}</span>
    <span class="intent-ref-token">{{ staged ? 'Staged' : intent?.intent }}</span>
  </button>
</template>
