<script setup lang="ts">
import { computed, ref } from 'vue';
import type { McpInventorySummary } from '../composables/useMcpInventory';

const props = defineProps<{
  inventory: McpInventorySummary;
}>();

const open = defineModel<boolean>('open', { default: false });
const copyLabel = ref('Copy diagnostics');
const searchText = ref('');
const expandedServers = ref(new Set<string>());

const mcpLabel = computed(() => {
  const count = props.inventory.serverCount ?? props.inventory.servers.length;
  const state = props.inventory.operationalState ?? 'unknown';
  return `Tool Surfaces (MCP): ${count} ${state}`;
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
  <div class="mcp-panel-shell">
    <button type="button" class="mcp-panel-trigger" :aria-expanded="open" aria-controls="mcp-server-panel" @click="open = !open">
      <span class="chip-dot" aria-hidden="true"></span>
      <span>{{ mcpLabel }}</span>
    </button>
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
  </div>
</template>
