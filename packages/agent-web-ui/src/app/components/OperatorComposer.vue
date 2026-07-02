<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';

const draft = defineModel<string>({ required: true });
defineProps<{ disabled?: boolean; disabledReason?: string }>();
const emit = defineEmits<{ submit: [] }>();
const inputRef = ref<HTMLTextAreaElement | null>(null);

onMounted(async () => {
  await nextTick();
  inputRef.value?.focus();
});

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return;
  event.preventDefault();
  emit('submit');
}
</script>

<template>
  <form id="operator-form" class="composer" aria-label="Operator input" @submit.prevent="emit('submit')">
    <textarea
      id="operator-input"
      ref="inputRef"
      v-model="draft"
      rows="3"
      autocomplete="off"
      spellcheck="true"
      placeholder="Enter to submit. Shift+Enter for new line"
      :disabled="disabled"
      @keydown="handleKeydown"
    />
    <button type="submit" :disabled="disabled">Send</button>
    <p v-if="disabled" class="composer-status">{{ disabledReason }}</p>
  </form>
</template>
