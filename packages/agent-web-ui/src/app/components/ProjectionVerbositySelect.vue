<script setup lang="ts">
import type { ProjectionVerbosity } from '../composables/useProjectionVerbosity';

defineProps<{
  modelValue: ProjectionVerbosity;
  levels: readonly ProjectionVerbosity[];
}>();
const emit = defineEmits<{ 'update:modelValue': [value: ProjectionVerbosity] }>();

const VIEW_LABELS: Record<ProjectionVerbosity, string> = {
  conversation: 'Chat',
  operations: 'Operations',
  diagnostics: 'Diagnostics',
  raw: 'Raw',
};
</script>

<template>
  <select
    id="projection-verbosity"
    aria-label="View"
    :value="modelValue"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value as ProjectionVerbosity)"
  >
    <option v-for="level in levels" :key="level" :value="level">{{ VIEW_LABELS[level] }}</option>
  </select>
</template>
