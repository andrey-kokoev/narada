<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ArtifactsSummary } from '../composables/useArtifactsSummary';

const props = defineProps<{
  available: boolean;
  summary: ArtifactsSummary;
  triggerless?: boolean;
}>();
const emit = defineEmits<{
  refresh: [];
}>();

const open = defineModel<boolean>('open', { default: false });
const copyLabel = ref('Copy diagnostics');
const search = ref('');

const artifactsLabel = computed(() => `Artifacts: ${props.summary.status === 'not_loaded' ? 'ready' : props.summary.status} · ${props.summary.artifacts.total} total`);
const subtitle = computed(() => props.summary.sessionId ? `${props.summary.sessionId} · session artifacts` : 'session artifacts');
const byKind = computed(() => objectField(props.summary.counts.by_kind));
const byState = computed(() => objectField(props.summary.counts.by_state));
const filteredItems = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return props.summary.artifacts.items;
  return props.summary.artifacts.items.filter((item) => [itemTitle(item), itemMeta(item), textField(item, 'artifact_id')].join(' ').toLowerCase().includes(query));
});

watch(open, (value) => {
  if (value) emit('refresh');
});

function itemKey(item: Record<string, unknown>, index = 0): string {
  return textField(item, 'artifact_id') || `artifact-${index}`;
}

function itemTitle(item: Record<string, unknown>): string {
  return textField(item, 'title') || textField(item, 'artifact_id') || '(untitled artifact)';
}

function itemMeta(item: Record<string, unknown>): string {
  return [
    textField(item, 'kind'),
    textField(item, 'content_type'),
    textField(item, 'lifecycle_state') ? `state ${textField(item, 'lifecycle_state')}` : null,
    textField(item, 'created_at') ? `created ${textField(item, 'created_at')}` : null,
  ].filter(Boolean).join(' · ');
}

function countEntries(record: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(record).map(([key, value]) => [key, typeof value === 'number' || typeof value === 'string' ? String(value) : '0']);
}

function textField(record: Record<string, unknown> | null, ...fields: string[]): string {
  if (!record) return '';
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function objectField(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function copyText(value: string) {
  if (!value) return;
  await navigator.clipboard.writeText(value);
}

async function copyDiagnostics() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(props.summary, null, 2));
    copyLabel.value = 'Copied';
    setTimeout(() => { copyLabel.value = 'Copy diagnostics'; }, 1400);
  } catch {
    copyLabel.value = 'Copy failed';
    setTimeout(() => { copyLabel.value = 'Copy diagnostics'; }, 1800);
  }
}
</script>

<template>
  <div v-if="available && !triggerless" class="artifacts-panel-shell">
    <button v-if="!triggerless" type="button" class="mcp-panel-trigger artifacts-panel-trigger" :aria-expanded="open" aria-controls="artifacts-panel" @click="open = !open">
      <span class="chip-dot" aria-hidden="true"></span>
      <span>{{ artifactsLabel }}</span>
    </button>
  </div>
  <Teleport v-if="available" to="body">
      <Transition name="mcp-drawer">
        <div v-if="open" class="mcp-drawer-layer" role="presentation">
          <button type="button" class="mcp-drawer-backdrop" aria-label="Close Artifacts panel" @click="open = false"></button>
          <aside id="artifacts-panel" class="mcp-panel artifacts-panel" aria-label="NARS artifact index">
            <header class="mcp-panel-header">
              <div>
                <h2>Artifacts</h2>
                <p>{{ subtitle }}</p>
              </div>
              <button type="button" class="mcp-panel-close" aria-label="Close Artifacts panel" @click="open = false">Close</button>
            </header>
            <dl class="mcp-panel-summary">
              <div><dt>State</dt><dd>{{ summary.status }}</dd></div>
              <div><dt>Total</dt><dd>{{ summary.artifacts.total }}</dd></div>
              <div><dt>Visible</dt><dd>{{ filteredItems.length }}</dd></div>
              <div><dt>Page</dt><dd>{{ summary.artifacts.offset }} + {{ summary.artifacts.limit }}</dd></div>
            </dl>
            <div class="mcp-panel-actions">
              <input v-if="summary.artifacts.items.length >= 5" v-model="search" class="mcp-panel-search" type="search" placeholder="Filter artifacts" aria-label="Filter artifacts" />
              <button type="button" @click="emit('refresh')">Refresh</button>
              <button type="button" @click="copyDiagnostics">{{ copyLabel }}</button>
            </div>
            <section class="sop-section artifacts-counts" aria-label="Artifact counts">
              <h3>Counts</h3>
              <dl class="mcp-panel-summary">
                <div v-for="([key, value]) in countEntries(byKind)" :key="`kind-${key}`"><dt>{{ key }}</dt><dd>{{ value }}</dd></div>
                <div v-for="([key, value]) in countEntries(byState)" :key="`state-${key}`"><dt>{{ key }}</dt><dd>{{ value }}</dd></div>
              </dl>
              <p v-if="!countEntries(byKind).length && !countEntries(byState).length" class="mcp-panel-empty">No artifacts registered yet.</p>
            </section>
            <div class="sop-items-scroll artifacts-items-scroll">
              <section class="sop-section artifacts-section" aria-label="Recent artifacts">
                <h3>Recent artifacts</h3>
                <ol v-if="filteredItems.length" class="mcp-server-list artifacts-list narada-list-reset">
                  <li v-for="(item, index) in filteredItems" :key="itemKey(item, index)" class="mcp-server-item artifacts-item">
                    <div class="mcp-server-row artifacts-row">
                      <span class="mcp-server-main"><strong>{{ itemTitle(item) }}</strong><span>{{ itemMeta(item) }}</span></span>
                      <span class="artifact-actions-inline">
                        <button v-if="textField(item, 'artifact_id')" type="button" @click="copyText(textField(item, 'artifact_id'))">Copy id</button>
                        <a v-if="textField(item, 'content_url')" :href="textField(item, 'content_url')" target="_blank" rel="noreferrer">Open</a>
                      </span>
                    </div>
                  </li>
                </ol>
                <p v-else class="mcp-panel-empty">No matching artifacts in this page.</p>
                <p v-if="summary.artifacts.truncated" class="mcp-panel-empty">More artifacts exist beyond this bounded page.</p>
                <p v-if="summary.error" class="mcp-panel-empty">{{ summary.error }}</p>
              </section>
            </div>
          </aside>
        </div>
      </Transition>
  </Teleport>
</template>
