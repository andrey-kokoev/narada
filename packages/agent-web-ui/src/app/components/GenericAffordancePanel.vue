<script setup lang="ts">
import { computed } from 'vue';
import type { SurfaceAffordanceItem } from '../composables/useSurfaceAffordances';

const props = defineProps<{
  item: SurfaceAffordanceItem | null;
  triggerless?: boolean;
}>();

const open = defineModel<boolean>('open', { default: false });

const document = computed(() => objectField(props.item?.raw, 'affordance_document'));
const title = computed(() => stringField(document.value, 'title') ?? props.item?.title ?? 'MCP Affordance');
const summary = computed(() => stringField(document.value, 'summary'));
const panels = computed(() => arrayField(document.value, 'panels').slice().sort((left, right) => priority(left) - priority(right)));
const actions = computed(() => {
  const byId = new Map<string, Record<string, unknown>>();
  for (const action of arrayField(document.value, 'actions')) {
    const id = stringField(action, 'id');
    if (id) byId.set(id, action);
  }
  return byId;
});
const refs = computed(() => arrayField(document.value, 'refs'));

function actionFor(id: unknown): Record<string, unknown> | null {
  return typeof id === 'string' ? actions.value.get(id) ?? null : null;
}

function actionLabel(action: Record<string, unknown>): string {
  return stringField(action, 'label') ?? stringField(action, 'id') ?? 'Action';
}

function actionMeta(action: Record<string, unknown>): string {
  const target = objectField(action, 'target');
  return [
    stringField(action, 'intent'),
    stringField(action, 'danger_level'),
    targetLabel(target),
  ].filter(Boolean).join(' · ');
}

function targetLabel(target: Record<string, unknown> | null): string | null {
  if (!target) return null;
  if (target.kind === 'tool') return stringField(target, 'tool');
  if (target.kind === 'resource') return stringField(target, 'uri');
  if (target.kind === 'prompt') return stringField(target, 'prompt');
  if (target.kind === 'external') return stringField(target, 'uri');
  return null;
}

function panelMetrics(panel: Record<string, unknown>): Record<string, unknown>[] {
  return arrayField(panel, 'metrics');
}

function panelActions(panel: Record<string, unknown>): Record<string, unknown>[] {
  return arrayField(panel, 'actions').map(actionFor).filter((action): action is Record<string, unknown> => Boolean(action));
}

function priority(panel: Record<string, unknown>): number {
  const value = panel.priority;
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function objectField(record: unknown, field: string): Record<string, unknown> | null {
  if (!record || typeof record !== 'object') return null;
  const value = (record as Record<string, unknown>)[field];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayField(record: unknown, field: string): Record<string, unknown>[] {
  if (!record || typeof record !== 'object') return [];
  const value = (record as Record<string, unknown>)[field];
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : [];
}

function stringField(record: unknown, field: string): string | null {
  if (!record || typeof record !== 'object') return null;
  const value = (record as Record<string, unknown>)[field];
  return typeof value === 'string' && value ? value : null;
}
</script>

<template>
  <div v-if="!triggerless && item" class="mcp-panel-shell">
    <button type="button" class="mcp-panel-trigger" :aria-expanded="open" aria-controls="generic-affordance-panel" @click="open = !open">
      <span class="chip-dot" aria-hidden="true"></span>
      <span>{{ title }}</span>
    </button>
  </div>
  <Teleport to="body">
    <Transition name="mcp-drawer">
      <div v-if="open && item" class="mcp-drawer-layer" role="presentation">
        <button type="button" class="mcp-drawer-backdrop" aria-label="Close affordance panel" @click="open = false"></button>
        <aside id="generic-affordance-panel" class="mcp-panel generic-affordance-panel" :aria-label="`${title} affordances`">
          <header class="mcp-panel-header">
            <div>
              <h2>{{ title }}</h2>
              <p>{{ summary ?? `${item.serverName ?? item.surfaceKind} declared UI-neutral MCP affordances.` }}</p>
            </div>
            <button type="button" class="mcp-panel-close" aria-label="Close affordance panel" @click="open = false">Close</button>
          </header>
          <dl class="mcp-panel-summary">
            <div>
              <dt>Surface</dt>
              <dd>{{ item.surfaceId ?? item.surfaceKind }}</dd>
            </div>
            <div>
              <dt>Server</dt>
              <dd>{{ item.serverName ?? 'unknown' }}</dd>
            </div>
            <div>
              <dt>Panels</dt>
              <dd>{{ panels.length }}</dd>
            </div>
            <div>
              <dt>Actions</dt>
              <dd>{{ actions.size }}</dd>
            </div>
          </dl>
          <section v-for="panel in panels" :key="String(panel.id)" class="generic-affordance-section">
            <h3>{{ stringField(panel, 'title') ?? stringField(panel, 'id') ?? 'Panel' }}</h3>
            <p v-if="stringField(panel, 'description')" class="mcp-panel-empty">{{ stringField(panel, 'description') }}</p>
            <dl v-if="panelMetrics(panel).length" class="mcp-panel-summary">
              <div v-for="metric in panelMetrics(panel)" :key="String(metric.id)">
                <dt>{{ stringField(metric, 'label') ?? stringField(metric, 'id') ?? 'Metric' }}</dt>
                <dd>{{ metric.value ?? 'n/a' }}</dd>
              </div>
            </dl>
            <ol v-if="panelActions(panel).length" class="mcp-tool-list">
              <li v-for="action in panelActions(panel)" :key="String(action.id)" class="mcp-tool-row">
                <strong>{{ actionLabel(action) }}</strong>
                <span v-if="actionMeta(action)">{{ actionMeta(action) }}</span>
                <span v-if="stringField(action, 'description')">{{ stringField(action, 'description') }}</span>
              </li>
            </ol>
          </section>
          <section v-if="refs.length" class="generic-affordance-section">
            <h3>References</h3>
            <ol class="mcp-tool-list">
              <li v-for="ref in refs" :key="String(ref.id)" class="mcp-tool-row">
                <strong>{{ stringField(ref, 'label') ?? stringField(ref, 'id') ?? 'Reference' }}</strong>
                <span>{{ targetLabel(objectField(ref, 'target')) ?? 'target unavailable' }}</span>
              </li>
            </ol>
          </section>
          <p v-if="!panels.length" class="mcp-panel-empty">No renderable affordance panels were declared.</p>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>
