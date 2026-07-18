<script setup lang="ts">
import { computed, watch } from 'vue';
import { Archive, Pencil, Play, RotateCcw, SearchCheck, Trash2 } from 'lucide-vue-next';
import { OPERATOR_CONSOLE_REGISTRY_MANAGE_PATH } from '@narada2/operator-console-contract';
import type { SiteDetailProjection } from '../projections';
import { operatorConsoleNavigationHref } from '../../console/routes';
import { useOperatorWorkspaceRouteDirectory } from '../../console/route-directory';
import { useSiteLaunch } from '../composables/useSiteLaunch';

const props = defineProps<{ site: SiteDetailProjection | null; loading: boolean }>();
const routeDirectory = useOperatorWorkspaceRouteDirectory();
const actionsBlocked = computed(() => Boolean(routeDirectory?.error.value));
const siteLaunch = useSiteLaunch();

watch(() => props.site?.siteId, () => siteLaunch.reset());

function actionHref(actionId: string, siteId: string): string {
  const managePath = operatorConsoleNavigationHref(
    routeDirectory?.error.value ? undefined : routeDirectory?.directory.value,
    'manage',
    OPERATOR_CONSOLE_REGISTRY_MANAGE_PATH,
  );
  return managePath + '?site=' + encodeURIComponent(siteId) + '&operation=' + encodeURIComponent(actionId);
}

async function checkPosture(siteId: string): Promise<void> {
  await siteLaunch.launch(siteId, true);
}

async function ensureNow(siteId: string): Promise<void> {
  if (!window.confirm(`Ensure runtime posture for ${siteId}? This runs one bounded site-loop pass with --ensure-resident via the Site's own CLI.`)) return;
  await siteLaunch.launch(siteId, false);
}
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
      <nav v-if="site.actions.some((action) => action.available) && !actionsBlocked" class="detail-actions" aria-label="Selected Site actions">
        <template v-for="action in site.actions" :key="action.id">
          <a v-if="action.available" class="detail-action" :href="actionHref(action.id, site.siteId)">
            <Pencil v-if="action.id === 'edit'" :size="14" aria-hidden="true" />
            <Archive v-else-if="action.id === 'retire'" :size="14" aria-hidden="true" />
            <RotateCcw v-else-if="action.id === 'restore'" :size="14" aria-hidden="true" />
            <Trash2 v-else :size="14" aria-hidden="true" />
            {{ action.label }}
          </a>
        </template>
      </nav>
      <p v-if="site.actions.some((action) => action.available) && actionsBlocked" class="detail-muted action-recovery-note">
        Site changes are paused while the live route directory is unavailable. Retry the route directory above before opening a mutation workflow.
      </p>
      <dl class="detail-grid">
        <dt>Root</dt><dd><code>{{ site.root }}</code></dd>
        <dt>Variant</dt><dd>{{ site.variant }} / {{ site.substrate }}</dd>
        <dt>Lifecycle</dt><dd>{{ site.lifecycle }}</dd>
        <dt>Last seen</dt><dd>{{ site.lastSeen }}</dd>
        <dt>Revision</dt><dd>{{ site.revision }}</dd>
        <dt>Created</dt><dd>{{ site.createdAt }}</dd>
        <dt>Updated</dt><dd>{{ site.updatedAt }}</dd>
      </dl>
      <div class="detail-section launch-section" aria-labelledby="site-launch-title">
        <h3 id="site-launch-title">Runtime posture</h3>
        <div class="launch-actions">
          <button type="button" class="detail-action launch-action" :disabled="siteLaunch.loading.value" @click="checkPosture(site.siteId)">
            <SearchCheck :size="14" aria-hidden="true" />
            Check posture
          </button>
          <button type="button" class="detail-action launch-action" :disabled="siteLaunch.loading.value" @click="ensureNow(site.siteId)">
            <Play :size="14" aria-hidden="true" />
            Ensure now
          </button>
        </div>
        <p v-if="siteLaunch.error.value" class="detail-muted launch-error" role="alert">{{ siteLaunch.error.value }}</p>
        <div v-if="siteLaunch.result.value" class="launch-result">
          <p class="launch-status" :data-tone="siteLaunch.result.value.status === 'failed' ? 'danger' : siteLaunch.result.value.status === 'degraded' ? 'warning' : 'positive'">
            {{ siteLaunch.result.value.status }}{{ siteLaunch.result.value.dry_run ? ' (dry run)' : '' }}
          </p>
          <ul>
            <li v-for="check in siteLaunch.result.value.checks" :key="check.id">
              <strong>[{{ check.status }}]</strong> {{ check.summary }}
              <span v-if="check.next_command" class="launch-next">next: <code>{{ check.next_command }}</code></span>
            </li>
          </ul>
        </div>
      </div>
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
.detail-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin: 0 0 18px; }
.action-recovery-note { margin: 0 0 18px; line-height: 1.45; }
.detail-action { display: inline-flex; align-items: center; gap: 6px; padding: 6px 8px; border: 1px solid var(--line); border-radius: var(--radius); color: var(--text); font-size: 12px; text-decoration: none; }
.detail-action:hover { border-color: var(--operator); background: var(--surface-muted); }
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
.launch-section h3 { margin-bottom: 10px; }
.launch-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.launch-action { background: transparent; cursor: pointer; font: inherit; }
.launch-action:disabled { cursor: wait; opacity: .55; }
.launch-error { margin-top: 10px; color: var(--danger, #b42318); }
.launch-result { margin-top: 12px; }
.launch-status { margin: 0 0 8px; font-size: 12px; font-weight: 650; }
.launch-status[data-tone="positive"] { color: var(--success, #18794e); }
.launch-status[data-tone="warning"] { color: var(--warning, #996500); }
.launch-status[data-tone="danger"] { color: var(--danger, #b42318); }
.launch-result ul { list-style: none; padding-left: 0; }
.launch-result li { margin-bottom: 6px; }
.launch-next { display: block; margin-top: 2px; }
</style>
