<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  text: string;
  className?: string;
}>();

const copied = ref(false);

const title = computed(() => copied.value ? 'Copied' : 'Copy');

async function copyText() {
  if (!props.text) return;
  try {
    await navigator.clipboard.writeText(props.text);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1200);
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <button type="button" class="copyable-text" :class="className" :title="title" :aria-label="`Copy ${text}`" @click.stop="copyText">
    <slot>{{ text }}</slot>
  </button>
</template>
