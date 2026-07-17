<script setup lang="ts">
import { computed } from 'vue';
import { OperatorSurfaceShell } from '@narada2/ui-vue';
import { RotateCcw } from 'lucide-vue-next';
import {
  operatorConsoleNavigationHref,
  operatorConsoleNavigation,
  operatorConsoleNavigationFromDirectory,
  type OperatorConsoleNavigationKey,
} from '../console/routes';
import { useOperatorWorkspaceRouteDirectory } from '../console/route-directory';

const props = defineProps<{
  eyebrow: string;
  title: string;
  backHref?: string;
  backNavigationKey?: OperatorConsoleNavigationKey;
  backLabel: string;
  navigationKey?: OperatorConsoleNavigationKey;
  navigationGuard?: (href: string) => boolean;
}>();

const routeDirectory = useOperatorWorkspaceRouteDirectory();
const effectiveNavItems = computed(() => {
  if (!props.navigationKey) return [];
  const directory = routeDirectory?.directory.value;
  const items = directory
    ? operatorConsoleNavigationFromDirectory(directory, props.navigationKey)
    : operatorConsoleNavigation(props.navigationKey);
  if (!routeDirectory?.error.value) return items;
  return items.filter((item) => item.key !== 'add' && item.key !== 'manage');
});

const effectiveBackHref = computed(() => props.backNavigationKey
  ? operatorConsoleNavigationHref(
    routeDirectory?.error.value ? undefined : routeDirectory?.directory.value,
    props.backNavigationKey,
    props.backHref ?? '/',
  )
  : props.backHref ?? '/');

function formatTimestamp(value: string | null): string {
  if (!value) return 'unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function retryRouteDirectory(): void {
  void routeDirectory?.retry();
}
</script>

<template>
  <OperatorSurfaceShell
    :eyebrow="eyebrow"
    :title="title"
    :back-href="effectiveBackHref"
    :back-label="backLabel"
    :nav-items="effectiveNavItems"
    :navigation-guard="props.navigationGuard"
  >
    <div v-if="routeDirectory?.error.value" class="route-directory-warning" role="status" aria-live="polite">
      <p>
        Live route directory unavailable.
        <span v-if="routeDirectory.directory.value">
          Showing the last known read-only console routes; last verified {{ formatTimestamp(routeDirectory.lastSuccessfulLoadAt.value) }}.
        </span>
        <span v-else>No live route snapshot is available; mutation navigation is paused.</span>
        <span v-if="routeDirectory.errorCode.value">Code: <code>{{ routeDirectory.errorCode.value }}</code>.</span>
        <span v-if="routeDirectory.errorStatus.value !== null"> HTTP {{ routeDirectory.errorStatus.value }}.</span>
        <span>{{ routeDirectory.error.value }}</span>
      </p>
      <button type="button" :disabled="routeDirectory.loading.value" @click="retryRouteDirectory">
        <RotateCcw :size="14" aria-hidden="true" />
        {{ routeDirectory.loading.value ? 'Retrying...' : 'Retry route directory' }}
      </button>
    </div>
    <slot />
  </OperatorSurfaceShell>
</template>

<style scoped>
.route-directory-warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  padding: 8px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 12px;
}

.route-directory-warning p {
  margin: 0;
  line-height: 1.4;
}

.route-directory-warning button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 5px 9px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}

.route-directory-warning button:disabled {
  cursor: wait;
  opacity: .6;
}

@media (max-width: 720px) {
  .route-directory-warning {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
