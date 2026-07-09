<template>
  <section class="box-row-shell" :class="className" :aria-label="rowLabel">
    <div class="box-row-items">
      <slot />
    </div>
    <div class="box-row-controls" aria-label="Row controls">
      <slot name="controls" />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  rowLabel: string;
  className?: string;
}>();
</script>
