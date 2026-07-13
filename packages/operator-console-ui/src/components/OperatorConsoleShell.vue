<script setup lang="ts">
import { OperatorSurfaceShell } from '@narada2/ui-vue';
import type { OperatorConsoleNavItem } from '../console/routes';

defineProps<{
  eyebrow: string;
  title: string;
  backHref: string;
  backLabel: string;
  navItems: readonly OperatorConsoleNavItem[];
}>();
</script>

<template>
  <OperatorSurfaceShell
    :eyebrow="eyebrow"
    :title="title"
    :back-href="backHref"
    :back-label="backLabel"
    :nav-items="navItems"
  >
    <slot />
  </OperatorSurfaceShell>
</template>
