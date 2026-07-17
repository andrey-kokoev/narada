<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next';
import type { SiteListProjection, SiteTileProjection } from '../projections';
import SiteTile from './SiteTile.vue';

const props = defineProps<{
  sites: SiteListProjection[];
  tiles: SiteTileProjection[];
  selectedSiteId: string | null;
  loading: boolean;
  error: string | null;
  listStale: boolean;
  lastSuccessfulLoadAt: string | null;
}>();
const emit = defineEmits<{ select: [siteId: string]; refresh: [] }>();

function formatTimestamp(value: string | null): string {
  if (!value) return 'unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
</script>

<template>
  <section class="registry-list" aria-labelledby="registry-list-title">
    <header class="registry-list__header">
      <div>
        <h2 id="registry-list-title">Registered Sites</h2>
        <p v-if="loading">Refreshing inventory...</p>
        <p v-else-if="listStale && lastSuccessfulLoadAt">Showing last successful inventory from {{ formatTimestamp(lastSuccessfulLoadAt) }}.</p>
        <p v-else-if="listStale">Site inventory is unavailable.</p>
        <p v-else>{{ sites.length }} Site{{ sites.length === 1 ? '' : 's' }}</p>
      </div>
      <button class="icon-button" type="button" title="Refresh Site Registry" aria-label="Refresh Site Registry" :disabled="loading" @click="emit('refresh')">
        <RefreshCw :size="16" aria-hidden="true" />
      </button>
    </header>

    <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
    <p v-if="!loading && sites.length === 0" class="empty-state">No Sites are registered yet.</p>

    <div v-if="sites.length" class="site-grid">
      <SiteTile
        v-for="tile in tiles"
        :key="tile.siteId"
        :site="tile"
        :selected="tile.siteId === selectedSiteId"
        @select="emit('select', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.registry-list { min-width: 0; }
.registry-list__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.registry-list__header h2 { margin: 0; font-size: 17px; font-weight: 650; }
.registry-list__header p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
.icon-button { display: inline-grid; width: 34px; height: 34px; place-items: center; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--text); cursor: pointer; }
.icon-button:hover:not(:disabled) { border-color: var(--operator); background: var(--surface-muted); }
.icon-button:disabled { cursor: wait; opacity: .55; }
.site-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.empty-state, .inline-error { padding: 14px; border: 1px dashed var(--line); color: var(--muted); font-size: 13px; }
.inline-error { border-style: solid; color: var(--danger, #b42318); }
@media (max-width: 720px) { .site-grid { grid-template-columns: 1fr; } }
</style>
