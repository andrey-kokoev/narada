<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { ArrowLeft, Plus } from 'lucide-vue-next';
import SiteRegistryList from '../site-registry/components/SiteRegistryList.vue';
import SiteDetail from '../site-registry/components/SiteDetail.vue';
import { toSiteTileProjection } from '../site-registry/projections';
import { useSiteRegistry } from '../site-registry/composables/useSiteRegistry';

const registry = useSiteRegistry();
const tiles = computed(() => registry.records.value.map((site) => toSiteTileProjection(site)));

onMounted(() => {
  const site = new URLSearchParams(window.location.search).get('site');
  if (site) void registry.select(site);
});
</script>

<template>
  <div class="console-page">
    <header class="console-bar">
      <div class="console-bar__identity">
        <a class="icon-link" href="/" title="Back to Operator Workspace" aria-label="Back to Operator Workspace"><ArrowLeft :size="16" aria-hidden="true" /></a>
        <div><p class="eyebrow">Operator Console</p><h1>Sites</h1></div>
      </div>
      <nav class="console-actions" aria-label="Site Registry actions">
        <a class="action-link" href="/console/registry/manage">Manage</a>
        <a class="action-link" href="/console/registry/add"><Plus :size="16" aria-hidden="true" />Add Site</a>
      </nav>
    </header>
    <main class="console-main">
      <div class="intro"><h2>Site Registry</h2><p>Inspect the canonical User Site inventory. Changes remain behind the plan and apply boundary.</p></div>
      <div class="registry-layout">
        <SiteRegistryList
          :sites="registry.sites.value"
          :tiles="tiles"
          :selected-site-id="registry.selectedSiteId.value"
          :loading="registry.loading.value"
          :error="registry.error.value"
          @select="registry.select"
          @refresh="registry.load"
        />
        <SiteDetail :site="registry.selected.value" :loading="registry.loadingDetail.value" />
      </div>
    </main>
  </div>
</template>

<style scoped>
.console-page { min-width: 320px; min-height: 100vh; background: var(--background); color: var(--text); }
.console-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 64px; padding: 12px 20px; border-bottom: 1px solid var(--line); background: var(--surface); }
.console-bar__identity { display: flex; align-items: center; gap: 12px; min-width: 0; }
.console-bar h1 { margin: 0; font-size: 18px; font-weight: 650; }
.eyebrow { margin: 0 0 3px; color: var(--muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
.icon-link, .action-link { display: inline-flex; align-items: center; gap: 7px; color: var(--text); text-decoration: none; }
.icon-link { width: 34px; height: 34px; justify-content: center; border: 1px solid var(--line); border-radius: var(--radius); }
.icon-link:hover, .action-link:hover { color: var(--operator); }
.action-link { padding: 8px 11px; border: 1px solid var(--line); border-radius: var(--radius); font-size: 13px; }
.console-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.console-main { max-width: 1240px; margin: 0 auto; padding: 24px 20px 40px; }
.intro { margin-bottom: 20px; }
.intro h2 { margin: 0; font-size: 16px; font-weight: 650; }
.intro p { max-width: 720px; margin: 5px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
.registry-layout { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(320px, .75fr); gap: 20px; align-items: start; }
@media (max-width: 860px) { .console-bar { align-items: flex-start; flex-wrap: wrap; } .console-main { padding: 18px 12px 28px; } .registry-layout { grid-template-columns: 1fr; } }
</style>
