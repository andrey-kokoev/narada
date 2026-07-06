<script setup lang="ts">
import { ref } from 'vue';
import type { IntentRefContent } from '../../lib/messageContent';

const props = defineProps<{
  content: string;
  intent?: IntentRefContent;
  language?: string;
  ordinal?: number;
}>();

const copied = ref(false);

function tooltip() {
  return [props.intent?.description, props.intent?.intent].filter(Boolean).join(' · ');
}

async function copyIntent() {
  const intent = props.intent?.intent?.trim();
  if (!intent) return;
  try {
    await navigator.clipboard.writeText(intent);
    copied.value = true;
    window.setTimeout(() => {
      copied.value = false;
    }, 1200);
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <button
    type="button"
    class="message-part intent-ref-part"
    :title="tooltip()"
    :aria-label="tooltip() || content"
    @click="copyIntent"
  >
    <span class="intent-ref-label">{{ content }}</span>
    <span class="intent-ref-token">{{ copied ? 'Copied' : intent?.intent }}</span>
  </button>
</template>
