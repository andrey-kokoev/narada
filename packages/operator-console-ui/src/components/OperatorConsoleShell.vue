<script setup lang="ts">
import { computed } from 'vue';
import { OperatorSurfaceShell } from '@narada2/ui-vue';
import { operatorConsoleNavigationFromDirectory, type OperatorConsoleNavItem } from '../console/routes';
import { useOperatorWorkspaceRouteDirectory } from '../console/route-directory';

const props = defineProps<{
  eyebrow: string;
  title: string;
  backHref: string;
  backLabel: string;
  navItems: readonly OperatorConsoleNavItem[];
}>();

const routeDirectory = useOperatorWorkspaceRouteDirectory();
const currentNavigationKey = computed(() => props.navItems.find((item) => item.current)?.key);
const effectiveNavItems = computed(() => {
  const directory = routeDirectory?.directory.value;
  const current = currentNavigationKey.value;
  return directory && current
    ? operatorConsoleNavigationFromDirectory(directory, current)
    : props.navItems;
});
</script>

<template>
  <OperatorSurfaceShell
    :eyebrow="eyebrow"
    :title="title"
    :back-href="backHref"
    :back-label="backLabel"
    :nav-items="effectiveNavItems"
  >
    <p v-if="routeDirectory?.error.value" class="route-directory-warning" role="status">
      Live route directory unavailable; showing the known console routes.
    </p>
    <slot />
  </OperatorSurfaceShell>
</template>

<style scoped>
.route-directory-warning {
  margin: 0;
  padding: 8px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 12px;
}
</style>
