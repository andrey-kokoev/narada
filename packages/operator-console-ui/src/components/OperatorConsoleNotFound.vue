<script setup lang="ts">
import OperatorConsoleShell from './OperatorConsoleShell.vue';
import { siteRegistryNavigation } from '../console/routes';

defineProps<{ path: string }>();
</script>

<template>
  <OperatorConsoleShell
    eyebrow="Operator Console"
    title="Page not found"
    back-href="/console/registry"
    back-label="Back to Site Registry"
    :nav-items="siteRegistryNavigation('sites')"
  >
    <main class="not-found">
      <h2>Operator Console page not found</h2>
      <p>The requested route is not part of the current console.</p>
      <code>{{ path }}</code>
    </main>
  </OperatorConsoleShell>
</template>

<style scoped>
.not-found {
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 20px;
}

.not-found h2 {
  margin: 0;
  font-size: 20px;
}

.not-found p {
  color: var(--muted);
  line-height: 1.5;
}

.not-found code {
  color: var(--muted);
  font: 12px/1.4 var(--mono);
}
</style>
