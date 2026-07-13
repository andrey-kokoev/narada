<script setup lang="ts">
import OperatorConsoleNotFound from './components/OperatorConsoleNotFound.vue';
import SiteRegistryMutationPage from './pages/SiteRegistryMutationPage.vue';
import SiteRegistryPage from './pages/SiteRegistryPage.vue';
import { resolveOperatorConsoleRoute } from './console/routes';

const route = resolveOperatorConsoleRoute(window.location.pathname, window.location.search);
</script>

<template>
  <SiteRegistryPage v-if="route.kind === 'site-registry'" />
  <SiteRegistryMutationPage v-else-if="route.kind === 'site-registry-add'" mode="add" />
  <SiteRegistryMutationPage v-else-if="route.kind === 'site-registry-manage'" mode="manage" />
  <OperatorConsoleNotFound v-else :path="route.path" />
</template>
