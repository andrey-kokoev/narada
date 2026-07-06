<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SopSummary } from '../composables/useSopSummary';

const props = defineProps<{
  available: boolean;
  summary: SopSummary;
  triggerless?: boolean;
}>();
const emit = defineEmits<{
  refresh: [];
}>();

const open = defineModel<boolean>('open', { default: false });
const copyLabel = ref('Copy diagnostics');
const expandedItems = ref(new Set<string>());

const templates = computed(() => props.summary.templates.items);
const runs = computed(() => props.summary.recentRuns.items.length ? props.summary.recentRuns.items : props.summary.runs.items);
const activeRun = computed(() => props.summary.activeRun);
const itemCount = computed(() => templates.value.length + runs.value.length);
const sopLabel = computed(() => `SOP: ${props.summary.status === 'not_loaded' ? 'ready' : props.summary.status} · ${itemCount.value} items`);
const subtitle = computed(() => props.summary.serverName ? `${props.summary.serverName} · SOP database items` : 'SOP database items');

watch(open, (value) => {
  if (value) emit('refresh');
});

function isExpanded(key: string): boolean {
  return expandedItems.value.has(key);
}

function actionList(record: Record<string, unknown> | null): string[] {
  if (!record) return [];
  const value = record.available_actions;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item)) : [];
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    open_run: 'Open run',
    refresh_run: 'Refresh',
    advance_run: 'Advance',
    confirm_operator_step: 'Confirm step',
    cancel_run: 'Cancel run',
    start_run: 'Start run',
  };
  return labels[action] ?? action.replaceAll('_', ' ');
}

function runStatusLine(run: Record<string, unknown>): string {
  return [
    textField(run, 'run_id'),
    textField(run, 'status'),
    textField(run, 'next_awaits_confirmation') === 'true' ? 'awaits confirmation' : null,
  ].filter(Boolean).join(' · ');
}

function runMetaLine(run: Record<string, unknown>): string {
  return [
    textField(run, 'started_at') ? `started ${textField(run, 'started_at')}` : null,
    textField(run, 'updated_at') ? `updated ${textField(run, 'updated_at')}` : null,
    textField(run, 'completed_at') ? `completed ${textField(run, 'completed_at')}` : null,
  ].filter(Boolean).join(' · ');
}

function nextStepSummary(run: Record<string, unknown> | null): string {
  if (!run) return '';
  const next = run.next_step;
  if (!next || typeof next !== 'object' || Array.isArray(next)) return '';
  return stepTitle(next as Record<string, unknown>);
}

function toggleItem(key: string) {
  const next = new Set(expandedItems.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedItems.value = next;
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

function arrayField(record: Record<string, unknown>, ...fields: string[]): Record<string, unknown>[] {
  for (const field of fields) {
    const value = record[field];
    if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  }
  return [];
}

function stringArrayField(record: Record<string, unknown>, ...fields: string[]): string[] {
  for (const field of fields) {
    const value = record[field];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && Boolean(item));
  }
  return [];
}

function templateKey(template: Record<string, unknown>): string {
  return `template:${textField(template, 'sop_id')}:${textField(template, 'version')}`;
}

function runKey(run: Record<string, unknown>): string {
  return `run:${textField(run, 'run_id')}`;
}

function stepTitle(step: Record<string, unknown>): string {
  const id = textField(step, 'id', 'step_id');
  const title = textField(step, 'title');
  return title && id ? `${id}. ${title}` : title || id || 'Untitled step';
}

function stepMeta(step: Record<string, unknown>): string {
  const parts = [
    textField(step, 'executor'),
    textField(step, 'status'),
    textField(step, 'blocking') === 'true' ? 'blocking' : null,
    textField(step, 'started_at') ? `started ${textField(step, 'started_at')}` : null,
    textField(step, 'completed_at') ? `completed ${textField(step, 'completed_at')}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function stepResultSummary(step: Record<string, unknown>): string {
  if (textField(step, 'error_message')) return `Error: ${textField(step, 'error_message')}`;
  const result = step.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return '';
  const record = result as Record<string, unknown>;
  return textField(record, 'summary', 'status', 'receipt_id', 'artifact_ref');
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
  <div v-if="available && !triggerless" class="sop-panel-shell">
    <button v-if="!triggerless" type="button" class="mcp-panel-trigger sop-panel-trigger" :aria-expanded="open" aria-controls="sop-panel" @click="open = !open">
      <span class="chip-dot" aria-hidden="true"></span>
      <span>{{ sopLabel }}</span>
    </button>
  </div>
  <Teleport v-if="available" to="body">
      <Transition name="mcp-drawer">
        <div v-if="open" class="mcp-drawer-layer" role="presentation">
          <button type="button" class="mcp-drawer-backdrop" aria-label="Close SOP panel" @click="open = false"></button>
          <aside id="sop-panel" class="mcp-panel sop-panel" aria-label="SOP database items">
            <header class="mcp-panel-header">
              <div>
                <h2>SOP</h2>
                <p>{{ subtitle }}</p>
              </div>
              <button type="button" class="mcp-panel-close" aria-label="Close SOP panel" @click="open = false">Close</button>
            </header>
            <dl class="mcp-panel-summary">
              <div>
                <dt>State</dt>
                <dd>{{ summary.status }}</dd>
              </div>
              <div>
                <dt>Active</dt>
                <dd>{{ activeRun ? textField(activeRun, 'run_id') || 'present' : 'none' }}</dd>
              </div>
              <div>
                <dt>Templates</dt>
                <dd>{{ summary.templates.count }}</dd>
              </div>
              <div>
                <dt>Runs</dt>
                <dd>{{ summary.runs.count }}</dd>
              </div>
            </dl>
            <div class="mcp-panel-actions">
              <button type="button" @click="emit('refresh')">Refresh</button>
              <button type="button" @click="copyDiagnostics">{{ copyLabel }}</button>
            </div>
            <div class="sop-items-scroll">
              <section class="sop-section" aria-label="Active SOP run">
                <h3>Active run</h3>
                <article v-if="activeRun" class="sop-active-run">
                  <strong>{{ textField(activeRun, 'sop_title') || textField(activeRun, 'sop_id') }}</strong>
                  <span>{{ runStatusLine(activeRun) }}</span>
                  <span v-if="runMetaLine(activeRun)">{{ runMetaLine(activeRun) }}</span>
                  <span v-if="nextStepSummary(activeRun)">Next: {{ nextStepSummary(activeRun) }}</span>
                  <div v-if="actionList(activeRun).length" class="sop-action-list" aria-label="Available SOP actions">
                    <span v-for="action in actionList(activeRun)" :key="action">{{ actionLabel(action) }}</span>
                  </div>
                </article>
                <p v-else class="mcp-panel-empty">No active SOP run is currently reported.</p>
              </section>
              <section class="sop-section" aria-label="SOP templates">
                <h3>Templates</h3>
                <ol v-if="templates.length" class="mcp-server-list sop-item-list">
                  <li v-for="template in templates" :key="templateKey(template)" class="mcp-server-item sop-item">
                    <button type="button" class="mcp-server-row sop-item-row" :aria-expanded="isExpanded(templateKey(template))" @click="toggleItem(templateKey(template))">
                      <span class="mcp-server-main">
                        <strong>{{ textField(template, 'title') || textField(template, 'sop_id') }}</strong>
                        <span>{{ textField(template, 'sop_id') }} · v{{ textField(template, 'version') }} · {{ textField(template, 'status') }}</span>
                        <span v-if="textField(template, 'description')">{{ textField(template, 'description') }}</span>
                      </span>
                      <span class="mcp-server-tools-count">{{ textField(template, 'step_count') || arrayField(template, 'steps').length }} steps</span>
                      <span class="mcp-server-chevron" aria-hidden="true">{{ isExpanded(templateKey(template)) ? '−' : '+' }}</span>
                    </button>
                    <ol v-if="isExpanded(templateKey(template))" class="mcp-tool-list sop-step-list">
                      <li v-for="step in arrayField(template, 'steps')" :key="textField(step, 'id', 'step_id') || stepTitle(step)" class="mcp-tool-row sop-step-row">
                        <strong>{{ stepTitle(step) }}</strong>
                        <span v-if="stepMeta(step)">{{ stepMeta(step) }}</span>
                        <span v-if="stringArrayField(step, 'depends_on').length">Depends on {{ stringArrayField(step, 'depends_on').join(', ') }}</span>
                        <span v-if="textField(step, 'instructions')">{{ textField(step, 'instructions') }}</span>
                      </li>
                    </ol>
                  </li>
                </ol>
                <p v-else class="mcp-panel-empty">No SOP templates are currently advertised by the site SOP MCP.</p>
              </section>
              <section class="sop-section" aria-label="Recent SOP runs">
                <h3>Recent runs</h3>
                <ol v-if="runs.length" class="mcp-server-list sop-item-list">
                  <li v-for="run in runs" :key="runKey(run)" class="mcp-server-item sop-item">
                    <button type="button" class="mcp-server-row sop-item-row" :aria-expanded="isExpanded(runKey(run))" @click="toggleItem(runKey(run))">
                      <span class="mcp-server-main">
                        <strong>{{ textField(run, 'sop_title') || textField(run, 'sop_id') }}</strong>
                        <span>{{ runStatusLine(run) }}</span>
                        <span v-if="runMetaLine(run)">{{ runMetaLine(run) }}</span>
                        <span v-if="nextStepSummary(run)">Next: {{ nextStepSummary(run) }}</span>
                      </span>
                      <span class="mcp-server-tools-count">{{ textField(run, 'step_count') || arrayField(run, 'step_timeline', 'step_states').length }} steps</span>
                      <span class="mcp-server-chevron" aria-hidden="true">{{ isExpanded(runKey(run)) ? '−' : '+' }}</span>
                    </button>
                    <ol v-if="isExpanded(runKey(run))" class="mcp-tool-list sop-step-list">
                      <li v-for="step in arrayField(run, 'step_timeline', 'step_states')" :key="textField(step, 'id', 'step_id') || stepTitle(step)" class="mcp-tool-row sop-step-row">
                        <strong>{{ stepTitle(step) }}</strong>
                        <span v-if="stepMeta(step)">{{ stepMeta(step) }}</span>
                        <span v-if="stepResultSummary(step)">{{ stepResultSummary(step) }}</span>
                      </li>
                    </ol>
                    <div v-if="isExpanded(runKey(run)) && actionList(run).length" class="sop-action-list sop-action-list-expanded" aria-label="Available SOP actions">
                      <span v-for="action in actionList(run)" :key="action">{{ actionLabel(action) }}</span>
                    </div>
                  </li>
                </ol>
                <p v-else class="mcp-panel-empty">No SOP runs are currently reported by the site SOP MCP.</p>
              </section>
              <p v-if="summary.errors.length" class="mcp-panel-empty">{{ summary.errors.map((error) => error.message ?? error.code ?? 'SOP read error').join('; ') }}</p>
            </div>
          </aside>
        </div>
      </Transition>
  </Teleport>
</template>
