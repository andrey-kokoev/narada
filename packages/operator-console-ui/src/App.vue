<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import OperatorConsoleNotFound from './components/OperatorConsoleNotFound.vue';
import OperatorConsoleLoading from './components/OperatorConsoleLoading.vue';
import OperatorConsoleLaunchPage from './pages/OperatorConsoleLaunchPage.vue';
import AgentSessionsPage from './pages/AgentSessionsPage.vue';
import SiteRegistryMutationPage from './pages/SiteRegistryMutationPage.vue';
import SiteRegistryPage from './pages/SiteRegistryPage.vue';
import { resolveOperatorConsoleRoute } from './console/routes';
import {
  createOperatorWorkspaceRouteDirectoryState,
  createOperatorWorkspaceRouteDirectoryTransport,
  provideOperatorWorkspaceRouteDirectory,
} from './console/route-directory';

interface OperatorConsoleRuntimeConfig {
  routeDirectory?: {
    endpoint?: string | null;
    projectionId?: string | null;
    browserToken?: string | null;
  } | null;
}

function readOperatorConsoleRuntimeConfig(): OperatorConsoleRuntimeConfig {
  const element = document.getElementById('operator-console-config');
  if (!element) return {};
  try {
    const parsed = JSON.parse(element.textContent ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as OperatorConsoleRuntimeConfig : {};
  } catch {
    return {};
  }
}

const runtimeConfig = readOperatorConsoleRuntimeConfig();
const routeDirectory = createOperatorWorkspaceRouteDirectoryState(createOperatorWorkspaceRouteDirectoryTransport(
  runtimeConfig.routeDirectory?.endpoint ?? undefined,
  undefined,
  {
    projectionId: runtimeConfig.routeDirectory?.projectionId,
    browserToken: runtimeConfig.routeDirectory?.browserToken,
  },
));
provideOperatorWorkspaceRouteDirectory(routeDirectory);

const route = computed(() => resolveOperatorConsoleRoute(
  window.location.pathname,
  window.location.search,
  routeDirectory.directory.value ?? undefined,
));

function retryRouteDirectoryWhenVisible(): void {
  if (document.visibilityState === 'visible' && routeDirectory.error.value) {
    void routeDirectory.retry();
  }
}

function retryRouteDirectoryWhenOnline(): void {
  void routeDirectory.retry();
}

onMounted(() => {
  void routeDirectory.load();
  document.addEventListener('visibilitychange', retryRouteDirectoryWhenVisible);
  window.addEventListener('online', retryRouteDirectoryWhenOnline);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', retryRouteDirectoryWhenVisible);
  window.removeEventListener('online', retryRouteDirectoryWhenOnline);
});
</script>

<template>
  <OperatorConsoleLoading v-if="routeDirectory.loading.value && !routeDirectory.directory.value && !routeDirectory.hasAttempted.value" />
  <SiteRegistryPage v-else-if="route.kind === 'site-registry'" />
  <SiteRegistryMutationPage v-else-if="route.kind === 'site-registry-add'" mode="add" />
  <SiteRegistryMutationPage v-else-if="route.kind === 'site-registry-manage'" mode="manage" />
  <OperatorConsoleLaunchPage v-else-if="route.kind === 'launcher'" />
  <AgentSessionsPage v-else-if="route.kind === 'agent-sessions'" />
  <OperatorConsoleNotFound v-else :path="route.path" />
</template>
