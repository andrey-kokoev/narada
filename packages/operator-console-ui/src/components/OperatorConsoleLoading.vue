<script setup lang="ts">
import OperatorConsoleShell from './OperatorConsoleShell.vue';
</script>

<template>
  <OperatorConsoleShell
    eyebrow="Operator Console"
    title="Loading workspace"
    back-navigation-key="sites"
    back-label="Back to Site Registry"
  >
    <main class="console-loading" aria-live="polite" role="status">
      Loading operator workspace routes...
    </main>
  </OperatorConsoleShell>
</template>

<style scoped>
.console-loading {
  padding: 32px 20px;
  color: var(--muted);
}
</style>
