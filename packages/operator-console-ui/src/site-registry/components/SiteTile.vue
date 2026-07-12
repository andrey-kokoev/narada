<script setup lang="ts">
import { computed } from 'vue';
import { ArrowUpRight } from 'lucide-vue-next';
import type { SiteTileProjection } from '../projections';

const props = withDefaults(defineProps<{ site: SiteTileProjection; selected?: boolean; compact?: boolean }>(), { selected: false, compact: false });
const emit = defineEmits<{ select: [siteId: string] }>();
const classes = computed(() => ({ selected: props.selected, compact: props.compact }));
</script>

<template>
  <button type="button" class="site-tile" :class="classes" :aria-pressed="selected" @click="emit('select', site.siteId)">
    <span class="site-tile__topline">
      <span class="site-tile__name">{{ site.label }}</span>
      <ArrowUpRight :size="16" aria-hidden="true" />
    </span>
    <span class="site-tile__summary">{{ compact ? site.observation : site.summary }}</span>
    <span class="site-tile__meta">
      <span class="site-status" :data-tone="site.statusTone">{{ site.lifecycle }}</span>
      <span>{{ site.lastSeen }}</span>
    </span>
  </button>
</template>

<style scoped>
.site-tile { display: flex; width: 100%; min-height: 132px; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--text); text-align: left; cursor: pointer; transition: border-color .15s ease, background .15s ease; }
.site-tile:hover, .site-tile.selected { border-color: var(--operator); background: var(--surface-muted); }
.site-tile.compact { min-height: 92px; gap: 8px; padding: 12px; }
.site-tile__topline, .site-tile__meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.site-tile__name { min-width: 0; overflow: hidden; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.site-tile__summary, .site-tile__meta { color: var(--muted); font-size: 12px; line-height: 1.4; }
.site-tile__summary { min-height: 34px; }
.site-status { color: var(--text); }
.site-status[data-tone="positive"] { color: var(--success, #18794e); }
.site-status[data-tone="warning"] { color: var(--warning, #996500); }
.site-status[data-tone="danger"] { color: var(--danger, #b42318); }
</style>
