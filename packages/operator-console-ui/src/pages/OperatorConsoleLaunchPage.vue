<script setup lang="ts">
import { OPERATOR_CONSOLE_REGISTRY_PATH } from '@narada2/operator-console-contract';
import OperatorConsoleShell from '../components/OperatorConsoleShell.vue';
import SiteRegistryList from '../site-registry/components/SiteRegistryList.vue';
import { useSiteRegistry } from '../site-registry/composables/useSiteRegistry';

const registry = useSiteRegistry();

function registrySiteHref(siteId: string): string {
  return `${OPERATOR_CONSOLE_REGISTRY_PATH}?site=${encodeURIComponent(siteId)}`;
}

function openSiteLaunchActions(siteId: string): void {
  window.location.assign(registrySiteHref(siteId));
}
</script>

<template>
  <OperatorConsoleShell
    eyebrow="Operator Console"
    title="Site Runtime"
    back-href="/"
    back-label="Back to Operator Workspace"
    navigation-key="launcher"
  >
    <main class="runtime-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Site runtime</p>
          <h2>Site Runtime</h2>
          <p class="subtitle">
            Launch is per-Site or per-agent: ensure a Site's declared runtime posture from its registry entry,
            or launch a single agent. Interactive group launching is deprecated.
          </p>
        </div>
      </header>

      <SiteRegistryList
        :sites="registry.sites.value"
        :tiles="registry.tiles.value"
        :selected-site-id="null"
        :loading="registry.loading.value"
        :error="registry.error.value"
        :list-stale="registry.listStale.value"
        :last-successful-load-at="registry.lastSuccessfulLoadAt.value"
        @select="openSiteLaunchActions"
        @refresh="registry.load"
      />

      <section class="guidance-panel" aria-labelledby="guidance-title">
        <p class="eyebrow">How to launch</p>
        <h3 id="guidance-title">Two supported shapes</h3>
        <dl class="guidance-grid">
          <dt>Site runtime</dt>
          <dd>
            Open a Site above and use <strong>Check posture</strong> / <strong>Ensure now</strong>, or run
            <code>narada sites launch &lt;site-id&gt;</code>. Ensure runs one bounded site-loop pass with
            <code>--ensure-resident</code> from the Site manifest.
          </dd>
          <dt>Single agent</dt>
          <dd>
            Launch one agent with <code>narada launcher workspace-launch --agent &lt;id&gt;</code>
            or the User Site <code>Start-NaradaAgent.ps1</code> primitive.
          </dd>
        </dl>
        <p class="guidance-note">
          Deprecated: interactive group selection (<code>--interactive-selection*</code>),
          <code>narada launcher workspace-recover</code>, and the CLI-owned launcher session dashboard.
          Boot-time fleet bring-up continues through <code>narada onboarding start</code>.
        </p>
      </section>
    </main>
  </OperatorConsoleShell>
</template>

<style scoped>
.runtime-page {
  min-height: calc(100vh - 64px);
  padding: 28px clamp(14px, 4vw, 44px) 48px;
  background: var(--background);
  color: var(--text);
}

.page-header,
.guidance-panel {
  max-width: 960px;
  margin-inline: auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h2,
.guidance-panel h3 {
  margin: 0;
  font-size: 22px;
}

.guidance-panel h3 {
  font-size: 17px;
}

.eyebrow {
  margin: 0 0 5px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.subtitle {
  max-width: 680px;
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.runtime-page :deep(.registry-list) {
  max-width: 960px;
  margin: 0 auto 28px;
}

.guidance-panel {
  display: block;
  margin-top: 28px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.guidance-grid {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 10px 14px;
  margin: 12px 0 0;
  font-size: 13px;
}

.guidance-grid dt {
  color: var(--text);
  font-weight: 650;
}

.guidance-grid dd {
  margin: 0;
  color: var(--muted);
  line-height: 1.5;
}

.guidance-grid code,
.guidance-note code {
  font: 12px/1.5 var(--mono);
}

.guidance-note {
  margin: 16px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
</style>
