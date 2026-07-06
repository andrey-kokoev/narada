<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SurfaceFeedbackSummary } from '../composables/useSurfaceFeedbackSummary';

const props = defineProps<{
  available: boolean;
  summary: SurfaceFeedbackSummary;
  triggerless?: boolean;
}>();
const emit = defineEmits<{
  refresh: [];
}>();

const open = defineModel<boolean>('open', { default: false });
const copyLabel = ref('Copy diagnostics');
const expandedItems = ref(new Set<string>());

const feedbackLabel = computed(() => `Feedback: ${props.summary.status === 'not_loaded' ? 'ready' : props.summary.status} · ${props.summary.feedback.count} visible`);
const subtitle = computed(() => props.summary.serverName ? `${props.summary.serverName} · backlog projection` : 'backlog projection');
const byKind = computed(() => objectField(props.summary.stats.by_kind));
const byStatus = computed(() => objectField(props.summary.stats.by_status));
const bySurface = computed(() => objectField(props.summary.stats.by_surface));
const totalLabel = computed(() => String(numberField(props.summary.stats, 'total') ?? props.summary.feedback.count));

watch(open, (value) => {
  if (value) emit('refresh');
});

function itemKey(item: Record<string, unknown>, index = 0): string {
  return textField(item, 'feedback_id') || `${textField(item, 'surface_id')}-${index}`;
}

function isExpanded(key: string): boolean {
  return expandedItems.value.has(key);
}

function toggleItem(key: string) {
  const next = new Set(expandedItems.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedItems.value = next;
}

function itemTitle(item: Record<string, unknown>): string {
  return textField(item, 'summary') || textField(item, 'feedback_id') || '(untitled feedback)';
}

function itemMeta(item: Record<string, unknown>): string {
  return [
    textField(item, 'status'),
    textField(item, 'kind'),
    textField(item, 'surface_id') ? `surface ${textField(item, 'surface_id')}` : null,
    textField(item, 'submitter_site_id') ? `from ${textField(item, 'submitter_site_id')}` : null,
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
    if (typeof value === 'boolean') return value ? 'true' : 'false';
  }
  return '';
}

function numberField(record: Record<string, unknown> | null, field: string): number | null {
  const value = record?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function objectField(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
  <div v-if="available && !triggerless" class="surface-feedback-panel-shell">
    <button v-if="!triggerless" type="button" class="mcp-panel-trigger surface-feedback-panel-trigger" :aria-expanded="open" aria-controls="surface-feedback-panel" @click="open = !open">
      <span class="chip-dot" aria-hidden="true"></span>
      <span>{{ feedbackLabel }}</span>
    </button>
  </div>
  <Teleport v-if="available" to="body">
      <Transition name="mcp-drawer">
        <div v-if="open" class="mcp-drawer-layer" role="presentation">
          <button type="button" class="mcp-drawer-backdrop" aria-label="Close Feedback panel" @click="open = false"></button>
          <aside id="surface-feedback-panel" class="mcp-panel surface-feedback-panel" aria-label="Surface feedback projection">
            <header class="mcp-panel-header">
              <div>
                <h2>Feedback</h2>
                <p>{{ subtitle }}</p>
              </div>
              <button type="button" class="mcp-panel-close" aria-label="Close Feedback panel" @click="open = false">Close</button>
            </header>
            <dl class="mcp-panel-summary">
              <div><dt>State</dt><dd>{{ summary.status }}</dd></div>
              <div><dt>Total</dt><dd>{{ totalLabel }}</dd></div>
              <div><dt>Visible</dt><dd>{{ summary.feedback.count }}</dd></div>
              <div><dt>Store</dt><dd>{{ textField(summary.doctor, 'storage_posture') || 'not advertised' }}</dd></div>
            </dl>
            <div class="mcp-panel-actions">
              <button type="button" @click="emit('refresh')">Refresh</button>
              <button type="button" @click="copyDiagnostics">{{ copyLabel }}</button>
            </div>
            <section class="sop-section surface-feedback-counts" aria-label="Feedback counts">
              <h3>Counts</h3>
              <dl class="mcp-panel-summary">
                <div v-for="([key, value]) in countEntries(byStatus)" :key="`status-${key}`"><dt>{{ key }}</dt><dd>{{ value }}</dd></div>
                <div v-for="([key, value]) in countEntries(byKind)" :key="`kind-${key}`"><dt>{{ key }}</dt><dd>{{ value }}</dd></div>
              </dl>
              <p v-if="!countEntries(byStatus).length && !countEntries(byKind).length" class="mcp-panel-empty">No aggregate counts reported.</p>
            </section>
            <div class="sop-items-scroll surface-feedback-items-scroll">
              <section class="sop-section surface-feedback-section" aria-label="Recent feedback">
                <h3>Recent feedback</h3>
                <ol v-if="summary.feedback.items.length" class="mcp-server-list surface-feedback-list">
                  <li v-for="(item, index) in summary.feedback.items" :key="itemKey(item, index)" class="mcp-server-item surface-feedback-item">
                    <button type="button" class="mcp-server-row surface-feedback-row" :aria-expanded="isExpanded(itemKey(item, index))" @click="toggleItem(itemKey(item, index))">
                      <span class="mcp-server-main"><strong>{{ itemTitle(item) }}</strong><span>{{ itemMeta(item) }}</span></span>
                      <span class="mcp-server-chevron" aria-hidden="true">{{ isExpanded(itemKey(item, index)) ? '-' : '+' }}</span>
                    </button>
                    <div v-if="isExpanded(itemKey(item, index))" class="mcp-tool-list surface-feedback-detail">
                      <span v-if="textField(item, 'feedback_id')">Feedback {{ textField(item, 'feedback_id') }}</span>
                      <span v-if="textField(item, 'resolution_note')">Resolution: {{ textField(item, 'resolution_note') }}</span>
                      <span>Status updates and new feedback submission are candidate-only until NARS admits explicit mutation methods.</span>
                    </div>
                  </li>
                </ol>
                <p v-else class="mcp-panel-empty">No feedback entries reported by the surface-feedback MCP.</p>
              </section>
              <section v-if="countEntries(bySurface).length" class="sop-section surface-feedback-section" aria-label="Feedback by surface">
                <h3>By surface</h3>
                <dl class="mcp-panel-summary">
                  <div v-for="([key, value]) in countEntries(bySurface)" :key="`surface-${key}`"><dt>{{ key }}</dt><dd>{{ value }}</dd></div>
                </dl>
              </section>
              <p v-if="summary.errors.length" class="mcp-panel-empty">{{ summary.errors.map((error) => error.message ?? error.code ?? 'Feedback read error').join('; ') }}</p>
            </div>
          </aside>
        </div>
      </Transition>
  </Teleport>
</template>
