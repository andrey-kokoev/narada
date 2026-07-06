<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SchedulerSummary } from '../composables/useSchedulerSummary';

const props = defineProps<{
  available: boolean;
  summary: SchedulerSummary;
  triggerless?: boolean;
}>();
const emit = defineEmits<{
  refresh: [];
}>();

const open = defineModel<boolean>('open', { default: false });
const copyLabel = ref('Copy diagnostics');
const expandedTasks = ref(new Set<string>());

const tasks = computed(() => props.summary.tasks.items);
const schedulerLabel = computed(() => `Scheduler: ${props.summary.status === 'not_loaded' ? 'ready' : props.summary.status} · ${props.summary.tasks.count} tasks`);
const subtitle = computed(() => props.summary.serverName ? `${props.summary.serverName} · scheduled task projection` : 'scheduled task projection');

watch(open, (value) => {
  if (value) emit('refresh');
});

function isExpanded(key: string): boolean {
  return expandedTasks.value.has(key);
}

function toggleTask(key: string) {
  const next = new Set(expandedTasks.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedTasks.value = next;
}

function taskKey(task: Record<string, unknown>): string {
  return textField(task, 'task_name') || textField(task, 'title') || JSON.stringify(task);
}

function taskMeta(task: Record<string, unknown>): string {
  return [
    textField(task, 'status'),
    textField(task, 'schedule'),
    textField(task, 'next_run') ? `next ${textField(task, 'next_run')}` : null,
    textField(task, 'last_run') ? `last ${textField(task, 'last_run')}` : null,
    textField(task, 'last_result') ? `result ${textField(task, 'last_result')}` : null,
  ].filter(Boolean).join(' · ');
}

function candidateActions(task: Record<string, unknown>): string[] {
  const value = task.available_actions;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.startsWith('candidate_')) : [];
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
  <div v-if="available && !triggerless" class="scheduler-panel-shell">
    <button v-if="!triggerless" type="button" class="mcp-panel-trigger scheduler-panel-trigger" :aria-expanded="open" aria-controls="scheduler-panel" @click="open = !open">
      <span class="chip-dot" aria-hidden="true"></span>
      <span>{{ schedulerLabel }}</span>
    </button>
  </div>
  <Teleport v-if="available" to="body">
      <Transition name="mcp-drawer">
        <div v-if="open" class="mcp-drawer-layer" role="presentation">
          <button type="button" class="mcp-drawer-backdrop" aria-label="Close Scheduler panel" @click="open = false"></button>
          <aside id="scheduler-panel" class="mcp-panel scheduler-panel" aria-label="Scheduler projection">
            <header class="mcp-panel-header">
              <div>
                <h2>Scheduler</h2>
                <p>{{ subtitle }}</p>
              </div>
              <button type="button" class="mcp-panel-close" aria-label="Close Scheduler panel" @click="open = false">Close</button>
            </header>
            <dl class="mcp-panel-summary">
              <div><dt>State</dt><dd>{{ summary.status }}</dd></div>
              <div><dt>Tasks</dt><dd>{{ summary.tasks.count }}</dd></div>
              <div><dt>Ready</dt><dd>{{ summary.posture.ready }}</dd></div>
              <div><dt>Running</dt><dd>{{ summary.posture.running }}</dd></div>
              <div><dt>Disabled</dt><dd>{{ summary.posture.disabled }}</dd></div>
            </dl>
            <div class="mcp-panel-actions">
              <button type="button" @click="emit('refresh')">Refresh</button>
              <button type="button" @click="copyDiagnostics">{{ copyLabel }}</button>
            </div>
            <div class="sop-items-scroll scheduler-items-scroll">
              <section class="sop-section scheduler-section" aria-label="Scheduled tasks">
                <h3>Tasks</h3>
                <ol v-if="tasks.length" class="mcp-server-list scheduler-task-list">
                  <li v-for="task in tasks" :key="taskKey(task)" class="mcp-server-item scheduler-task-item">
                    <button type="button" class="mcp-server-row scheduler-task-row" :aria-expanded="isExpanded(taskKey(task))" @click="toggleTask(taskKey(task))">
                      <span class="mcp-server-main">
                        <strong>{{ textField(task, 'title') || textField(task, 'task_name') }}</strong>
                        <span>{{ taskMeta(task) }}</span>
                      </span>
                      <span class="mcp-server-chevron" aria-hidden="true">{{ isExpanded(taskKey(task)) ? '-' : '+' }}</span>
                    </button>
                    <div v-if="isExpanded(taskKey(task))" class="mcp-tool-list scheduler-task-detail">
                      <span v-if="textField(task, 'task_name')">Task {{ textField(task, 'task_name') }}</span>
                      <span v-if="textField(task, 'command')">Command {{ textField(task, 'command') }}</span>
                      <span v-if="candidateActions(task).length">Candidate actions {{ candidateActions(task).join(', ') }}</span>
                    </div>
                  </li>
                </ol>
                <p v-else class="mcp-panel-empty">No scheduled tasks are currently reported by the scheduler MCP.</p>
              </section>
              <p v-if="summary.errors.length" class="mcp-panel-empty">{{ summary.errors.map((error) => error.message ?? error.code ?? 'Scheduler read error').join('; ') }}</p>
            </div>
          </aside>
        </div>
      </Transition>
  </Teleport>
</template>
