<script setup lang="ts">
import { onMounted } from 'vue';
import OperatorConsoleShell from '../components/OperatorConsoleShell.vue';
import SiteRegistryList from '../site-registry/components/SiteRegistryList.vue';
import SiteDetail from '../site-registry/components/SiteDetail.vue';
import { siteRegistryNavigation } from '../console/routes';
import { useSiteRegistry } from '../site-registry/composables/useSiteRegistry';

const registry = useSiteRegistry();

onMounted(() => {
  const site = new URLSearchParams(window.location.search).get('site');
  if (site) void registry.select(site);
});
</script>

<template>
  <OperatorConsoleShell
    eyebrow="Operator Console"
    title="Sites"
    back-href="/"
    back-label="Back to Operator Workspace"
    :nav-items="siteRegistryNavigation('sites')"
  >
    <main class="console-main">
      <div class="intro">
        <h2>Site Registry</h2>
        <p>Inspect the canonical User Site inventory. Changes remain behind the plan and apply boundary.</p>
      </div>
      <div class="registry-layout">
        <SiteRegistryList
          :sites="registry.sites.value"
          :tiles="registry.tiles.value"
          :selected-site-id="registry.selectedSiteId.value"
          :loading="registry.loading.value"
          :error="registry.error.value"
          @select="registry.select"
          @refresh="registry.load"
        />
        <SiteDetail :site="registry.selected.value" :loading="registry.loadingDetail.value" />
      </div>
    </main>
  </OperatorConsoleShell>
</template>

<style scoped>
.console-main {
  max-width: 1240px;
  margin: 0 auto;
  padding: 24px 20px 40px;
}

.intro {
  margin-bottom: 20px;
}

.intro h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}

.intro p {
  max-width: 720px;
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
}

.registry-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, .75fr);
  gap: 20px;
  align-items: start;
}

@media (max-width: 860px) {
  .console-main {
    padding: 18px 12px 28px;
  }

  .registry-layout {
    grid-template-columns: 1fr;
  }
}
</style>
