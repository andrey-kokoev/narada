<script setup lang="ts">
import type { SiteDetailProjection } from '../projections';

defineProps<{ site: SiteDetailProjection | null; loading: boolean }>();
</script>

<template>
  <aside class="site-detail" aria-labelledby="site-detail-title">
    <template v-if="loading">
      <h2 id="site-detail-title">Site details</h2>
      <p class="detail-muted">Loading selected Site...</p>
    </template>
    <template v-else-if="site">
      <header class="site-detail__header">
        <div>
          <p class="eyebrow">Selected Site</p>
          <h2 id="site-detail-title">{{ site.label }}</h2>
        </div>
        <span class="site-status" :data-tone="site.statusTone">{{ site.observation }}</span>
      </header>
      <dl class="detail-grid">
        <dt>Root</dt><dd><code>{{ site.root }}</code></dd>
        <dt>Variant</dt><dd>{{ site.variant }} / {{ site.substrate }}</dd>
        <dt>Lifecycle</dt><dd>{{ site.lifecycle }}</dd>
        <dt>Last seen</dt><dd>{{ site.lastSeen }}</dd>
        <dt>Revision</dt><dd>{{ site.revision }}</dd>
        <dt>Created</dt><dd>{{ site.createdAt }}</dd>
        <dt>Updated</dt><dd>{{ site.updatedAt }}</dd>
      </dl>
      <div class="detail-section"><h3>Aim</h3><p>{{ site.aim }}</p></div>
      <div class="detail-section"><h3>Aliases</h3><p v-if="!site.aliases.length" class="detail-muted">None</p><ul v-else><li v-for="alias in site.aliases" :key="`${alias.source}:${alias.value}`">{{ alias.value }} <span>({{ alias.source }})</span></li></ul></div>
      <div class="detail-section"><h3>Sources</h3><p v-if="!site.sources.length" class="detail-muted">None</p><ul v-else><li v-for="source in site.sources" :key="`${source.kind}:${source.ref}`"><strong>{{ source.kind }}</strong> {{ source.ref }} <span>{{ source.observedAt }}</span></li></ul></div>
    </template>
    <template v-else>
      <h2 id="site-detail-title">Site details</h2>
      <p class="detail-muted">Select a Site to inspect its canonical record.</p>
    </template>
  </aside>
</template>

<style scoped>
.site-detail { min-width: 0; padding: 18px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.site-detail__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.site-detail h2 { margin: 0; font-size: 18px; font-weight: 650; overflow-wrap: anywhere; }
.eyebrow { margin: 0 0 4px; color: var(--muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
.site-status { color: var(--text); font-size: 12px; font-weight: 600; }
.site-status[data-tone="positive"] { color: var(--success, #18794e); }
.site-status[data-tone="warning"] { color: var(--warning, #996500); }
.site-status[data-tone="danger"] { color: var(--danger, #b42318); }
.detail-grid { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 8px 12px; margin: 0; font-size: 12px; }
.detail-grid dt { color: var(--muted); }
.detail-grid dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
code { font: 12px/1.4 var(--mono); }
.detail-section { margin-top: 20px; }
.detail-section h3 { margin: 0 0 7px; font-size: 13px; font-weight: 650; }
.detail-section p, .detail-section ul { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
.detail-section ul { padding-left: 18px; }
.detail-section li { overflow-wrap: anywhere; }
.detail-section span, .detail-muted { color: var(--muted); }
</style>
