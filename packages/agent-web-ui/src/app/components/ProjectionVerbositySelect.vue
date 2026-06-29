<script setup lang="ts">
import type { ProjectionVerbosity } from '../composables/useProjectionVerbosity';

defineProps<{
  modelValue: ProjectionVerbosity;
  levels: readonly ProjectionVerbosity[];
}>();
const emit = defineEmits<{ 'update:modelValue': [value: ProjectionVerbosity] }>();
</script>

<template>
  <select
    id="projection-verbosity"
    aria-label="Projection verbosity"
    :value="modelValue"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value as ProjectionVerbosity)"
  >
    <option v-for="level in levels" :key="level" :value="level">{{ level }}</option>
  </select>
</template>
