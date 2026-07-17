<script setup lang="ts">
import { computed } from 'vue';
import type { ProjectionViewOption } from '../composables/useProjectionVerbosity';

const props = defineProps<{
  modelValue: string;
  options: readonly ProjectionViewOption[];
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const VIEW_LABELS: Record<string, string> = {
  conversation: 'Chat',
  operations: 'Operations',
  diagnostics: 'Diagnostics',
  raw: 'Raw',
};
const selectStyle = computed(() => ({
  minInlineSize: selectInlineSizeValue(props.options.map((option) => option.label)),
}));

function selectInlineSizeValue(options: readonly string[]): string {
  const longest = Math.max(1, ...options.map((option) => [...option].length));
  return `calc(${longest}ch + 28px)`;
}
</script>

<template>
  <select
    id="projection-verbosity"
    aria-label="View"
    :style="selectStyle"
    :value="props.modelValue"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-for="option in props.options" :key="option.id" :value="option.id">{{ option.label || VIEW_LABELS[option.id] }}</option>
  </select>
</template>
