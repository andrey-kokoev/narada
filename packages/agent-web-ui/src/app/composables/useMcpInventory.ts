import { computed, type Ref } from 'vue';
import { unwrapRuntimeEvent } from '../../runtime-events.js';

export interface McpServerInventoryEntry {
  serverName: string;
  operationalState: string;
  toolCount: number | null;
  tools: McpToolInventoryEntry[];
  source: 'health' | 'event';
}

export interface McpToolInventoryEntry {
  toolName: string;
  description: string | null;
}

export interface McpInventorySummary {
  operationalState: string | null;
  serverCount: number | null;
  startupFailureCount: number | null;
  runtimeFaultCount: number | null;
  servers: McpServerInventoryEntry[];
  source: 'health' | 'event' | 'none';
}

export function useMcpInventory(events: unknown[], healthBody: Ref<Record<string, unknown> | null>) {
  const inventory = computed<McpInventorySummary>(() => {
    const health = inventoryFromHealth(healthBody.value);
    const event = inventoryFromEvents(events);
    if (health.source === 'none') return event;
    if (event.source === 'none') return health;
    return mergeHealthInventoryWithEventTools(health, event);
  });
  return { inventory };
}

function inventoryFromHealth(body: Record<string, unknown> | null): McpInventorySummary {
  if (!body) return emptyInventory();
  const mcp = objectField(body, 'mcp');
  const rawTools = arrayField(body, 'mcp_tools').length ? arrayField(body, 'mcp_tools') : arrayField(mcp, 'tools');
  const toolMap = toolsByServer(rawTools);
  const servers = arrayField(mcp, 'servers').map((entry) => normalizeServerEntry(entry, 'health', toolMap)).filter(Boolean) as McpServerInventoryEntry[];
  const serverCount = numberField(mcp, 'server_count') ?? numberField(body, 'mcp_server_count') ?? (servers.length ? servers.length : null);
  const operationalState = stringField(mcp, 'operational_state') ?? stringField(body, 'mcp_operational_state');
  if (!operationalState && !serverCount && servers.length === 0) return emptyInventory();
  return {
    operationalState,
    serverCount,
    startupFailureCount: numberField(mcp, 'startup_failure_count') ?? numberField(body, 'mcp_startup_failure_count'),
    runtimeFaultCount: numberField(mcp, 'runtime_fault_count') ?? numberField(body, 'mcp_runtime_fault_count'),
    servers,
    source: 'health',
  };
}

function mergeHealthInventoryWithEventTools(health: McpInventorySummary, event: McpInventorySummary): McpInventorySummary {
  const eventToolsByServer = new Map(event.servers.map((server) => [server.serverName, server.tools]));
  const servers = health.servers.map((server) => ({
    ...server,
    tools: server.tools.length ? server.tools : eventToolsByServer.get(server.serverName) ?? [],
  }));
  const healthServerNames = new Set(servers.map((server) => server.serverName));
  for (const server of event.servers) {
    if (!healthServerNames.has(server.serverName)) servers.push(server);
  }
  return { ...health, servers };
}

function inventoryFromEvents(events: unknown[]): McpInventorySummary {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = unwrapRuntimeEvent(events[index]);
    if (!event || typeof event !== 'object') continue;
    const record = event as Record<string, unknown>;
    if (record.event !== 'session_started' && record.event !== 'session_health' && !record.mcp_servers && !record.mcp) continue;
    const mcp = objectField(record, 'mcp');
    const rawServers = arrayField(record, 'mcp_servers').length ? arrayField(record, 'mcp_servers') : arrayField(mcp, 'servers');
    const rawTools = arrayField(record, 'mcp_tools').length ? arrayField(record, 'mcp_tools') : arrayField(mcp, 'tools');
    const toolMap = toolsByServer(rawTools);
    const servers = rawServers.map((entry) => normalizeServerEntry(entry, 'event', toolMap)).filter(Boolean) as McpServerInventoryEntry[];
    const serverCount = numberField(record, 'mcp_server_count') ?? numberField(mcp, 'server_count') ?? (servers.length ? servers.length : null);
    const operationalState = stringField(record, 'mcp_operational_state') ?? stringField(mcp, 'operational_state');
    if (!operationalState && !serverCount && servers.length === 0) continue;
    return {
      operationalState,
      serverCount,
      startupFailureCount: numberField(record, 'mcp_startup_failure_count') ?? numberField(mcp, 'startup_failure_count'),
      runtimeFaultCount: numberField(record, 'mcp_runtime_fault_count') ?? numberField(mcp, 'runtime_fault_count'),
      servers,
      source: 'event',
    };
  }
  return emptyInventory();
}

function normalizeServerEntry(value: unknown, source: 'health' | 'event', toolMap: Map<string, McpToolInventoryEntry[]>): McpServerInventoryEntry | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const serverName = stringField(record, 'server_name') ?? stringField(record, 'name');
  if (!serverName) return null;
  return {
    serverName,
    operationalState: stringField(record, 'operational_state') ?? stringField(record, 'status') ?? 'unknown',
    toolCount: numberField(record, 'tool_count'),
    tools: toolMap.get(serverName) ?? [],
    source,
  };
}

function toolsByServer(values: unknown[]): Map<string, McpToolInventoryEntry[]> {
  const map = new Map<string, McpToolInventoryEntry[]>();
  for (const value of values) {
    const tool = normalizeToolEntry(value);
    if (!tool) continue;
    const tools = map.get(tool.serverName) ?? [];
    tools.push({ toolName: tool.toolName, description: tool.description });
    map.set(tool.serverName, tools);
  }
  for (const [serverName, tools] of map) {
    map.set(serverName, tools.sort((a, b) => a.toolName.localeCompare(b.toolName)));
  }
  return map;
}

function normalizeToolEntry(value: unknown): { serverName: string; toolName: string; description: string | null } | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const serverName = stringField(record, 'server_name') ?? stringField(record, 'serverName');
  const toolName = stringField(record, 'tool_name') ?? stringField(record, 'name');
  if (!serverName || !toolName) return null;
  return { serverName, toolName, description: stringField(record, 'description') };
}

function emptyInventory(): McpInventorySummary {
  return { operationalState: null, serverCount: null, startupFailureCount: null, runtimeFaultCount: null, servers: [], source: 'none' };
}

function objectField(record: unknown, field: string): Record<string, unknown> | null {
  if (!record || typeof record !== 'object') return null;
  const value = (record as Record<string, unknown>)[field];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayField(record: unknown, field: string): unknown[] {
  if (!record || typeof record !== 'object') return [];
  const value = (record as Record<string, unknown>)[field];
  return Array.isArray(value) ? value : [];
}

function stringField(record: unknown, field: string): string | null {
  if (!record || typeof record !== 'object') return null;
  const value = (record as Record<string, unknown>)[field];
  return typeof value === 'string' && value ? value : null;
}

function numberField(record: unknown, field: string): number | null {
  if (!record || typeof record !== 'object') return null;
  const value = (record as Record<string, unknown>)[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
