<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { DelegationSummary } from '../composables/useDelegationSummary';

const props = defineProps<{
  available: boolean;
  summary: DelegationSummary;
  triggerless?: boolean;
}>();
const emit = defineEmits<{
  refresh: [];
}>();

const open = defineModel<boolean>('open', { default: false });
const copyLabel = ref('Copy diagnostics');
const expandedSections = ref(new Set<string>(['workers', 'delegated_tasks']));

const visibleCount = computed(() => props.summary.workers.count + props.summary.delegatedTasks.count);
const delegationLabel = computed(() => `Delegation: ${props.summary.status === 'not_loaded' ? 'ready' : props.summary.status} · ${visibleCount.value} visible`);
const subtitle = computed(() => [props.summary.workerServerName, props.summary.delegatedTaskServerName].filter(Boolean).join(' + ') || 'worker and delegated task projection');

watch(open, (value) => {
  if (value) emit('refresh');
});

function isExpanded(key: string): boolean {
  return expandedSections.value.has(key);
}

function toggleSection(key: string) {
  const next = new Set(expandedSections.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedSections.value = next;
}

function postureValue(key: string): string {
  const value = props.summary.posture[key];
  return typeof value === 'number' || typeof value === 'string' ? String(value) : '0';
}

function rowKey(row: Record<string, unknown>, index: number): string {
  return textField(row, 'run_id') || textField(row, 'task_id') || String(index);
}

function workerTitle(row: Record<string, unknown>): string {
  return textField(row, 'run_id') || '(unknown worker run)';
}

function taskTitle(row: Record<string, unknown>): string {
  return textField(row, 'objective') || textField(row, 'task_id') || '(unknown delegated task)';
}

function rowMeta(row: Record<string, unknown>): string {
  return [
    textField(row, 'status'),
    textField(row, 'runtime'),
    textField(row, 'owner_site_id') ? `site ${textField(row, 'owner_site_id')}` : null,
    textField(row, 'worker_session_id') ? `session ${textField(row, 'worker_session_id')}` : null,
    textField(row, 'started_at') ? `started ${textField(row, 'started_at')}` : null,
    textField(row, 'updated_at') ? `updated ${textField(row, 'updated_at')}` : null,
    textField(row, 'error') ? `error ${textField(row, 'error')}` : null,
  ].filter(Boolean).join(' · ');
}

function textField(record: Record<string, unknown>, ...fields: string[]): string {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
  }
  return '';
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
  <div v-if="available && !triggerless" class="delegation-panel-shell">
    <button v-if="!triggerless" type="button" class="mcp-panel-trigger delegation-panel-trigger" :aria-expanded="open" aria-controls="delegation-panel" @click="open = !open">
      <span class="chip-dot" aria-hidden="true"></span>
      <span>{{ delegationLabel }}</span>
    </button>
  </div>
  <Teleport v-if="available" to="body">
      <Transition name="mcp-drawer">
        <div v-if="open" class="mcp-drawer-layer" role="presentation">
          <button type="button" class="mcp-drawer-backdrop" aria-label="Close Delegation panel" @click="open = false"></button>
          <aside id="delegation-panel" class="mcp-panel delegation-panel" aria-label="Delegation projection">
            <header class="mcp-panel-header">
              <div>
                <h2>Delegation</h2>
                <p>{{ subtitle }}</p>
              </div>
              <button type="button" class="mcp-panel-close" aria-label="Close Delegation panel" @click="open = false">Close</button>
            </header>
            <dl class="mcp-panel-summary">
              <div><dt>State</dt><dd>{{ summary.status }}</dd></div>
              <div><dt>Active</dt><dd>{{ postureValue('active') }}</dd></div>
              <div><dt>Queued</dt><dd>{{ postureValue('queued') }}</dd></div>
              <div><dt>Failed</dt><dd>{{ postureValue('failed') }}</dd></div>
              <div><dt>Blocked</dt><dd>{{ postureValue('blocked') }}</dd></div>
            </dl>
            <div class="mcp-panel-actions">
              <button type="button" @click="emit('refresh')">Refresh</button>
              <button type="button" @click="copyDiagnostics">{{ copyLabel }}</button>
            </div>
            <div class="sop-items-scroll delegation-items-scroll">
              <section class="sop-section delegation-section">
                <button type="button" class="mcp-server-row delegation-section-row" :aria-expanded="isExpanded('workers')" @click="toggleSection('workers')">
                  <span class="mcp-server-main"><strong>Worker runs</strong><span>{{ summary.workers.count }} item(s)</span></span>
                  <span class="mcp-server-chevron" aria-hidden="true">{{ isExpanded('workers') ? '-' : '+' }}</span>
                </button>
                <ol v-if="isExpanded('workers') && summary.workers.items.length" class="mcp-server-list delegation-list narada-list-reset">
                  <li v-for="(run, index) in summary.workers.items" :key="rowKey(run, index)" class="mcp-server-item delegation-item">
                    <span class="mcp-server-main"><strong>{{ workerTitle(run) }}</strong><span>{{ rowMeta(run) }}</span></span>
                  </li>
                </ol>
                <p v-else-if="isExpanded('workers')" class="mcp-panel-empty">No worker runs reported.</p>
              </section>
              <section class="sop-section delegation-section">
                <button type="button" class="mcp-server-row delegation-section-row" :aria-expanded="isExpanded('delegated_tasks')" @click="toggleSection('delegated_tasks')">
                  <span class="mcp-server-main"><strong>Delegated tasks</strong><span>{{ summary.delegatedTasks.count }} item(s)</span></span>
                  <span class="mcp-server-chevron" aria-hidden="true">{{ isExpanded('delegated_tasks') ? '-' : '+' }}</span>
                </button>
                <ol v-if="isExpanded('delegated_tasks') && summary.delegatedTasks.items.length" class="mcp-server-list delegation-list narada-list-reset">
                  <li v-for="(task, index) in summary.delegatedTasks.items" :key="rowKey(task, index)" class="mcp-server-item delegation-item">
                    <span class="mcp-server-main"><strong>{{ taskTitle(task) }}</strong><span>{{ rowMeta(task) }}</span></span>
                  </li>
                </ol>
                <p v-else-if="isExpanded('delegated_tasks')" class="mcp-panel-empty">No delegated tasks reported.</p>
              </section>
              <p v-if="summary.errors.length" class="mcp-panel-empty">{{ summary.errors.map((error) => error.message ?? error.code ?? 'Delegation read error').join('; ') }}</p>
            </div>
          </aside>
        </div>
      </Transition>
  </Teleport>
</template>
