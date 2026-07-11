<script setup lang="ts">
defineProps<{ active?: boolean; danger?: boolean; optionId?: string }>();
</script>

<template>
  <div
    :id="optionId"
    class="command-option"
    :class="{ 'command-option-active': active, 'command-option-danger': danger }"
    role="option"
    :aria-selected="active"
    tabindex="-1"
  >
    <slot />
  </div>
</template>
