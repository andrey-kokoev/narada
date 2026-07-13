<script setup lang="ts">
import { onMounted } from 'vue';
import OperatorConsoleNotFound from './components/OperatorConsoleNotFound.vue';
import OperatorConsoleLaunchPage from './pages/OperatorConsoleLaunchPage.vue';
import AgentSessionsPage from './pages/AgentSessionsPage.vue';
import SiteRegistryMutationPage from './pages/SiteRegistryMutationPage.vue';
import SiteRegistryPage from './pages/SiteRegistryPage.vue';
import { resolveOperatorConsoleRoute } from './console/routes';
import {
  createOperatorWorkspaceRouteDirectoryState,
  provideOperatorWorkspaceRouteDirectory,
} from './console/route-directory';

const route = resolveOperatorConsoleRoute(window.location.pathname, window.location.search);
const routeDirectory = createOperatorWorkspaceRouteDirectoryState();
provideOperatorWorkspaceRouteDirectory(routeDirectory);

onMounted(() => { void routeDirectory.load(); });
</script>

<template>
  <SiteRegistryPage v-if="route.kind === 'site-registry'" />
  <SiteRegistryMutationPage v-else-if="route.kind === 'site-registry-add'" mode="add" />
  <SiteRegistryMutationPage v-else-if="route.kind === 'site-registry-manage'" mode="manage" />
  <OperatorConsoleLaunchPage v-else-if="route.kind === 'launcher'" />
  <AgentSessionsPage v-else-if="route.kind === 'agent-sessions'" />
  <OperatorConsoleNotFound v-else :path="route.path" />
</template>
