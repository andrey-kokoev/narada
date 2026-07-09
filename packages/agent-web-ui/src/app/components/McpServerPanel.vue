<script setup lang="ts">
import { computed, ref } from 'vue';
import type { McpInventorySummary } from '../composables/useMcpInventory';
import type { SurfaceAffordanceItem, SurfaceAffordanceSummary } from '../composables/useSurfaceAffordances';

const props = defineProps<{
  inventory: McpInventorySummary;
  surfaceAffordances: SurfaceAffordanceSummary;
  triggerless?: boolean;
}>();
const emit = defineEmits<{
  'open-surface-panel': [surfaceKind: string];
}>();

const open = defineModel<boolean>('open', { default: false });
const copyLabel = ref('Copy diagnostics');
const searchText = ref('');
const expandedServers = ref(new Set<string>());

const mcpLabel = computed(() => {
  const count = props.inventory.serverCount ?? props.inventory.servers.length;
  const state = props.inventory.operationalState ?? 'unknown';
  return `MCP Catalog: ${count} ${state}`;
});

const sortedServers = computed(() => [...props.inventory.servers].sort((a, b) => a.serverName.localeCompare(b.serverName)));
const showSearch = computed(() => props.inventory.servers.length >= 5);
const filteredServers = computed(() => {
  const query = searchText.value.trim().toLowerCase();
  if (!showSearch.value || !query) return sortedServers.value;
  return sortedServers.value.filter((server) => [
    server.serverName,
    server.operationalState,
    `${server.toolCount ?? ''} tools`,
  ].some((value) => String(value ?? '').toLowerCase().includes(query)));
});
const panelAffordancesByServer = computed(() => {
  const entries = new Map<string, SurfaceAffordanceItem>();
  for (const affordance of props.surfaceAffordances.items) {
    if (!affordance.serverName || !isPanelAffordance(affordance)) continue;
    entries.set(affordance.serverName, affordance);
  }
  return entries;
});
const emptyMessage = computed(() => {
  if (!props.inventory.servers.length) return 'Waiting for NARS to advertise MCP server details.';
  return 'No matching tool surfaces.';
});

function isExpanded(serverName: string): boolean {
  return expandedServers.value.has(serverName);
}

function toggleServer(serverName: string) {
  const next = new Set(expandedServers.value);
  if (next.has(serverName)) next.delete(serverName);
  else next.add(serverName);
  expandedServers.value = next;
}

function displayToolCount(server: { toolCount: number | null; tools: unknown[] }): string {
  const count = server.toolCount ?? server.tools.length;
  return Number.isFinite(count) ? String(count) : '?';
}

function panelAffordanceForServer(server: { serverName: string }): SurfaceAffordanceItem | null {
  const exact = panelAffordancesByServer.value.get(server.serverName);
  if (exact) return exact;
  const serverName = server.serverName.toLowerCase();
  return props.surfaceAffordances.items.find((affordance) => (
    isPanelAffordance(affordance)
    && serverName.includes(surfaceKindServerFragment(affordance.surfaceKind))
  )) ?? null;
}

function panelLabel(affordance: SurfaceAffordanceItem): string {
  return affordance.title ? `Open ${affordance.title}` : 'Open panel';
}

function panelLabelForServer(server: { serverName: string }): string {
  const affordance = panelAffordanceForServer(server);
  return affordance ? panelLabel(affordance) : 'Open panel';
}

function openSurfacePanelForServer(server: { serverName: string }) {
  const affordance = panelAffordanceForServer(server);
  if (!affordance) return;
  emit('open-surface-panel', surfacePanelKey(affordance));
  open.value = false;
}

function surfacePanelKey(affordance: SurfaceAffordanceItem): string {
  if (affordance.renderer === 'generic_mcp_affordance') return `generic:${affordance.surfaceId ?? affordance.serverName ?? affordance.surfaceKind}`;
  return affordance.surfaceKind;
}

function isPanelAffordance(affordance: SurfaceAffordanceItem): boolean {
  return affordance.renderer === 'generic_mcp_affordance' || isPanelSurfaceKind(affordance.surfaceKind);
}

function isPanelSurfaceKind(surfaceKind: string): boolean {
  return [
    'delegation',
    'artifacts',
    'git',
    'inbox',
    'mailbox',
    'scheduler',
    'sop',
    'surface_feedback',
    'task_lifecycle',
  ].includes(surfaceKind);
}

function surfaceKindServerFragment(surfaceKind: string): string {
  if (surfaceKind === 'surface_feedback') return 'surface-feedback';
  if (surfaceKind === 'task_lifecycle') return 'task-lifecycle';
  return surfaceKind.replace(/_/g, '-');
}

async function copyDiagnostics() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(props.inventory, null, 2));
    copyLabel.value = 'Copied';
    setTimeout(() => { copyLabel.value = 'Copy diagnostics'; }, 1400);
  } catch {
    copyLabel.value = 'Copy failed';
    setTimeout(() => { copyLabel.value = 'Copy diagnostics'; }, 1800);
  }
}
</script>

<template>
  <div v-if="!triggerless" class="mcp-panel-shell">
    <button v-if="!triggerless" type="button" class="mcp-panel-trigger" :aria-expanded="open" aria-controls="mcp-server-panel" @click="open = !open">
      <span class="chip-dot" aria-hidden="true"></span>
      <span>{{ mcpLabel }}</span>
    </button>
  </div>
  <Teleport to="body">
      <Transition name="mcp-drawer">
        <div v-if="open" class="mcp-drawer-layer" role="presentation">
          <button type="button" class="mcp-drawer-backdrop" aria-label="Close MCP server panel" @click="open = false"></button>
          <aside id="mcp-server-panel" class="mcp-panel" aria-label="Runtime MCP servers">
            <header class="mcp-panel-header">
              <div>
                <h2>Runtime MCP</h2>
                <p>{{ inventory.source === 'none' ? 'No runtime inventory received yet.' : `Inventory from ${inventory.source}.` }}</p>
              </div>
              <button type="button" class="mcp-panel-close" aria-label="Close MCP server panel" @click="open = false">Close</button>
            </header>
            <dl class="mcp-panel-summary">
              <div>
                <dt>State</dt>
                <dd>{{ inventory.operationalState ?? 'unknown' }}</dd>
              </div>
              <div>
                <dt>Servers</dt>
                <dd>{{ inventory.serverCount ?? inventory.servers.length }}</dd>
              </div>
              <div>
                <dt>Startup failures</dt>
                <dd>{{ inventory.startupFailureCount ?? 0 }}</dd>
              </div>
              <div>
                <dt>Runtime faults</dt>
                <dd>{{ inventory.runtimeFaultCount ?? 0 }}</dd>
              </div>
            </dl>
            <div class="mcp-panel-actions">
              <label v-if="showSearch" class="mcp-panel-search">
                <span>Search</span>
                <input v-model="searchText" type="search" autocomplete="off" spellcheck="false" placeholder="Filter tool surfaces" />
              </label>
              <button type="button" @click="copyDiagnostics">{{ copyLabel }}</button>
            </div>
            <ol v-if="filteredServers.length" class="mcp-server-list">
              <li v-for="server in filteredServers" :key="server.serverName" class="mcp-server-item" :data-state="server.operationalState">
                <button type="button" class="mcp-server-row" :aria-expanded="isExpanded(server.serverName)" @click="toggleServer(server.serverName)">
                  <span class="mcp-server-main">
                    <strong>{{ server.serverName }}</strong>
                    <span>{{ server.operationalState }}</span>
                  </span>
                  <span class="mcp-server-tools-count">{{ displayToolCount(server) }} tools</span>
                  <span class="mcp-server-chevron" aria-hidden="true">{{ isExpanded(server.serverName) ? '−' : '+' }}</span>
                </button>
                <button
                  v-if="panelAffordanceForServer(server)"
                  type="button"
                  class="mcp-server-panel-action"
                  @click.stop="openSurfacePanelForServer(server)"
                >
                  {{ panelLabelForServer(server) }}
                </button>
                <ol v-if="isExpanded(server.serverName)" class="mcp-tool-list">
                  <li v-for="tool in server.tools" :key="tool.toolName" class="mcp-tool-row">
                    <strong>{{ tool.toolName }}</strong>
                    <span v-if="tool.description">{{ tool.description }}</span>
                  </li>
                  <li v-if="!server.tools.length" class="mcp-tool-row mcp-tool-row-empty">Tool names are not available in the current runtime inventory.</li>
                </ol>
              </li>
            </ol>
            <p v-else class="mcp-panel-empty">{{ emptyMessage }}</p>
          </aside>
        </div>
      </Transition>
  </Teleport>
</template>
