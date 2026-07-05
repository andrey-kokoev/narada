<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TaskLifecycleSummary } from '../composables/useTaskLifecycleSummary';

const props = defineProps<{
  available: boolean;
  summary: TaskLifecycleSummary;
}>();
const emit = defineEmits<{
  refresh: [];
}>();

const open = defineModel<boolean>('open', { default: false });
const copyLabel = ref('Copy diagnostics');
const expandedSections = ref(new Set<string>(['in_progress']));

const taskLifecycleLabel = computed(() => `Tasks: ${props.summary.status === 'not_loaded' ? 'ready' : props.summary.status} · ${totalVisibleItems.value} visible`);
const subtitle = computed(() => props.summary.serverName ? `${props.summary.serverName} · workboard projection` : 'workboard projection');
const totalVisibleItems = computed(() => props.summary.inProgress.count + props.summary.pendingReviews.count + props.summary.obligations.count);
const recommendationText = computed(() => textField(props.summary.recommendation ?? {}, 'action') || textField(props.summary.recommendation ?? {}, 'reason') || 'No recommendation reported yet.');

const sections = computed(() => [
  { key: 'in_progress', title: 'In progress', collection: props.summary.inProgress },
  { key: 'pending_reviews', title: 'Pending reviews', collection: props.summary.pendingReviews },
  { key: 'obligations', title: 'Obligations', collection: props.summary.obligations },
]);

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

function taskKey(task: Record<string, unknown>, index: number): string {
  return textField(task, 'task_id') || textField(task, 'obligation_id') || `${textField(task, 'task_number')}-${index}`;
}

function taskTitle(task: Record<string, unknown>): string {
  const number = textField(task, 'task_number');
  const title = textField(task, 'title') || '(untitled task)';
  return number ? `${number} ${title}` : title;
}

function taskMeta(task: Record<string, unknown>): string {
  return [
    textField(task, 'status'),
    textField(task, 'kind'),
    textField(task, 'assigned_agent') ? `assigned ${textField(task, 'assigned_agent')}` : null,
    textField(task, 'target_role') ? `role ${textField(task, 'target_role')}` : null,
    textField(task, 'updated_at') ? `updated ${textField(task, 'updated_at')}` : null,
  ].filter(Boolean).join(' · ');
}

function countLabel(key: string): string {
  const value = props.summary.counts[key];
  return typeof value === 'number' || typeof value === 'string' ? String(value) : '0';
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
  <div v-if="available" class="task-lifecycle-panel-shell">
    <button type="button" class="mcp-panel-trigger task-lifecycle-panel-trigger" :aria-expanded="open" aria-controls="task-lifecycle-panel" @click="open = !open">
      <span class="chip-dot" aria-hidden="true"></span>
      <span>{{ taskLifecycleLabel }}</span>
    </button>
    <Teleport to="body">
      <Transition name="mcp-drawer">
        <div v-if="open" class="mcp-drawer-layer" role="presentation">
          <button type="button" class="mcp-drawer-backdrop" aria-label="Close Tasks panel" @click="open = false"></button>
          <aside id="task-lifecycle-panel" class="mcp-panel task-lifecycle-panel" aria-label="Task lifecycle projection">
            <header class="mcp-panel-header">
              <div>
                <h2>Tasks</h2>
                <p>{{ subtitle }}</p>
              </div>
              <button type="button" class="mcp-panel-close" aria-label="Close Tasks panel" @click="open = false">Close</button>
            </header>
            <dl class="mcp-panel-summary">
              <div><dt>State</dt><dd>{{ summary.status }}</dd></div>
              <div><dt>Agent</dt><dd>{{ summary.agentId ?? 'not advertised' }}</dd></div>
              <div><dt>In progress</dt><dd>{{ summary.inProgress.count }}</dd></div>
              <div><dt>Reviews</dt><dd>{{ summary.pendingReviews.count }}</dd></div>
              <div><dt>Obligations</dt><dd>{{ summary.obligations.count }}</dd></div>
            </dl>
            <div class="mcp-panel-actions">
              <button type="button" @click="emit('refresh')">Refresh</button>
              <button type="button" @click="copyDiagnostics">{{ copyLabel }}</button>
            </div>
            <section class="sop-section task-lifecycle-recommendation" aria-label="Recommended task action">
              <h3>Recommendation</h3>
              <p class="mcp-panel-empty">{{ recommendationText }}</p>
            </section>
            <dl class="mcp-panel-summary task-lifecycle-counts" aria-label="Task count samples">
              <div><dt>Review waits</dt><dd>{{ countLabel('pending_reviews') }}</dd></div>
              <div><dt>In progress</dt><dd>{{ countLabel('in_progress') }}</dd></div>
              <div><dt>Deferred</dt><dd>{{ countLabel('deferred') }}</dd></div>
            </dl>
            <div class="sop-items-scroll task-lifecycle-items-scroll">
              <section v-for="section in sections" :key="section.key" class="sop-section task-lifecycle-section">
                <button type="button" class="mcp-server-row task-lifecycle-section-row" :aria-expanded="isExpanded(section.key)" @click="toggleSection(section.key)">
                  <span class="mcp-server-main"><strong>{{ section.title }}</strong><span>{{ section.collection.count }} item(s)</span></span>
                  <span class="mcp-server-chevron" aria-hidden="true">{{ isExpanded(section.key) ? '-' : '+' }}</span>
                </button>
                <ol v-if="isExpanded(section.key) && section.collection.items.length" class="mcp-server-list task-lifecycle-list">
                  <li v-for="(task, index) in section.collection.items" :key="taskKey(task, index)" class="mcp-server-item task-lifecycle-item">
                    <span class="mcp-server-main">
                      <strong>{{ taskTitle(task) }}</strong>
                      <span>{{ taskMeta(task) }}</span>
                    </span>
                  </li>
                </ol>
                <p v-else-if="isExpanded(section.key)" class="mcp-panel-empty">No {{ section.title.toLowerCase() }} reported.</p>
              </section>
              <p v-if="summary.errors.length" class="mcp-panel-empty">{{ summary.errors.map((error) => error.message ?? error.code ?? 'Task lifecycle read error').join('; ') }}</p>
            </div>
          </aside>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
