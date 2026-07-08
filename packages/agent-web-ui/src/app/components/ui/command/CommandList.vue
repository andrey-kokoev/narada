<script setup lang="ts">
defineProps<{ listId?: string; label?: string }>();
</script>

<template>
  <div :id="listId" class="command-list" role="listbox" :aria-label="label">
    <slot />
  </div>
</template>
