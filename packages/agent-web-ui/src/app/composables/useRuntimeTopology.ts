import { computed, type Ref } from 'vue';
import type { McpInventorySummary } from './useMcpInventory';
import type { SessionIdentitySummary } from './useNarsEvents';

export interface RuntimeTopologyNode {
  id: string;
  label: string;
  state: string;
  detail: string;
  metadata: { label: string; value: string }[];
}

function controlInputBridgeNode(bridge: Record<string, unknown> | null): RuntimeTopologyNode {
  const status = stringField(bridge, 'status');
  const lastReadStatus = stringField(bridge, 'last_read_status');
  const errorCount = numberField(bridge, 'error_count') ?? 0;
  const state = bridge
    ? errorCount > 0 ? 'error' : status ?? lastReadStatus ?? 'advertised'
    : 'not advertised';
  return {
    id: 'control-input-bridge',
    label: 'Control Input',
    state,
    detail: stringField(bridge, 'path') ?? 'control input bridge not advertised',
    metadata: compactMetadata([
      ['Read status', lastReadStatus],
      ['Offset', numberField(bridge, 'offset')],
      ['Reads', numberField(bridge, 'read_count')],
      ['Records emitted', numberField(bridge, 'emitted_count')],
      ['Errors', numberField(bridge, 'error_count')],
      ['Last error', stringField(objectField(bridge, 'last_error'), 'code') ?? stringField(objectField(bridge, 'last_error'), 'message')],
    ]),
  };
}

export interface RuntimeTopologySummary {
  status: 'live' | 'degraded' | 'stale' | 'unavailable';
  statusText: string;
  verdictLabel: string;
  primaryCause: string;
  operatorHint: string;
  nodes: RuntimeTopologyNode[];
  stale: boolean;
  inputPolicy: string | null;
  canSendInput: boolean;
  sessionId: string | null;
  authorityRuntimeId: string | null;
  endpoints: {
    health: string | null;
    eventStream: string | null;
  };
}

export interface RuntimeTopologyOptions {
  eventEndpoint: string | null;
  healthEndpoint: string | null;
  inputEndpoint: string | null;
  streamText: Ref<string>;
  healthText: Ref<string>;
  healthBody: Ref<Record<string, unknown> | null>;
  sessionIdentity: Ref<SessionIdentitySummary>;
  authorityTransition: Ref<Record<string, unknown> | null>;
  mcpInventory: Ref<McpInventorySummary>;
}

export function useRuntimeTopology(options: RuntimeTopologyOptions) {
  const topology = computed<RuntimeTopologySummary>(() => {
    const canonical = canonicalRuntimeTopology(options.healthBody.value);
    if (canonical) return canonical;
    return fallbackRuntimeTopology(options);
  });
  return { topology };
}

function canonicalRuntimeTopology(health: Record<string, unknown> | null): RuntimeTopologySummary | null {
  const raw = objectField(health, 'runtime_topology');
  if (stringField(raw, 'schema') !== 'narada.nars.runtime_topology.v1') return null;
  const authority = objectField(raw, 'authority');
  const runtime = objectField(raw, 'runtime');
  const endpoints = objectField(raw, 'endpoints');
  const heartbeat = objectField(raw, 'heartbeat');
  const controlInputBridge = objectField(health, 'control_input_bridge');
  const mcp = objectField(raw, 'mcp');
  const mcpChildren = arrayField(mcp, 'children');
  const status = canonicalStatus(stringField(raw, 'status'), booleanField(authority, 'stale_source') === true);
  const inputPolicy = stringField(authority, 'input_policy');
  const stale = booleanField(authority, 'stale_source') === true;
  const sessionId = stringField(raw, 'session_id');
  const authorityRuntimeId = stringField(authority, 'runtime_id') ?? stringField(authority, 'runtime_host');
  const endpointsSummary = {
    health: stringField(endpoints, 'health'),
    eventStream: stringField(endpoints, 'event_stream'),
  };
  const posture = runtimePosture({
    status,
    stale,
    inputPolicy,
    sessionId,
    mcpStartupFailures: numberField(mcp, 'startup_failure_count') ?? 0,
    mcpRuntimeFaults: numberField(mcp, 'runtime_fault_count') ?? 0,
  });
  return {
    status,
    statusText: posture.verdictLabel,
    verdictLabel: posture.verdictLabel,
    primaryCause: posture.primaryCause,
    operatorHint: posture.operatorHint,
    stale,
    inputPolicy,
    canSendInput: posture.canSendInput,
    sessionId,
    authorityRuntimeId,
    endpoints: endpointsSummary,
    nodes: [
      {
        id: 'runtime',
        label: 'Runtime',
        state: stringField(runtime, 'kind') ?? 'not advertised',
        detail: `pid ${numberField(runtime, 'pid') ?? 'not advertised'}`,
        metadata: compactMetadata([
          ['Started', stringField(runtime, 'started_at')],
          ['Mode', stringField(runtime, 'mode')],
          ['Operator surface', stringField(runtime, 'operator_surface_kind')],
          ['Launch session', stringField(raw, 'launch_session_id')],
        ]),
      },
      controlInputBridgeNode(controlInputBridge),
      {
        id: 'session',
        label: 'Session',
        state: sessionId ? 'bound' : 'not bound',
        detail: sessionId ?? 'session id not advertised',
        metadata: compactMetadata([
          ['Site', stringField(raw, 'site_id')],
          ['Agent', stringField(raw, 'agent_id')],
          ['Site root', stringField(raw, 'site_root')],
        ]),
      },
      {
        id: 'authority',
        label: 'Authority',
        state: stale ? 'stale' : stringField(authority, 'source_write_admission') ?? 'not advertised',
        detail: authorityRuntimeId ?? 'authority runtime not advertised',
        metadata: compactMetadata([
          ['Host', stringField(authority, 'runtime_host')],
          ['Transition', stringField(authority, 'transition_state')],
          ['Input', inputPolicy],
          ['Superseded by', stringField(authority, 'superseded_by_session_id')],
        ]),
      },
      endpointNode('Event Stream', endpointsSummary.eventStream, endpointsSummary.eventStream ? 'configured' : 'not configured'),
      endpointNode('Health', endpointsSummary.health, endpointsSummary.health ? 'configured' : 'not configured'),
      {
        id: 'heartbeat',
        label: 'Heartbeat',
        state: stringField(heartbeat, 'freshness') ?? 'not advertised',
        detail: stringField(heartbeat, 'path') ?? 'heartbeat path not advertised',
        metadata: compactMetadata([
          ['Last written', stringField(heartbeat, 'last_written_at')],
          ['Age ms', numberField(heartbeat, 'age_ms')],
        ]),
      },
      {
        id: 'mcp',
        label: 'MCP Children',
        state: stringField(mcp, 'operational_state') ?? 'not advertised',
        detail: `${numberField(mcp, 'server_count') ?? mcpChildren.length} server${(numberField(mcp, 'server_count') ?? mcpChildren.length) === 1 ? '' : 's'}`,
        metadata: compactMetadata([
          ['Startup failures', numberField(mcp, 'startup_failure_count')],
          ['Runtime faults', numberField(mcp, 'runtime_fault_count')],
        ]),
      },
      ...mcpChildren.map((child, index) => ({
        id: `mcp-${stringField(child, 'id') ?? index}`,
        label: `MCP: ${stringField(child, 'label') ?? stringField(child, 'id') ?? 'unknown'}`,
        state: stringField(child, 'state') ?? 'unknown',
        detail: `pid ${numberField(child, 'pid') ?? 'not advertised'}`,
        metadata: compactMetadata([
          ['Tools', numberField(child, 'tool_count')],
          ['Kind', stringField(child, 'kind')],
        ]),
      })),
    ],
  };
}

function fallbackRuntimeTopology(options: RuntimeTopologyOptions): RuntimeTopologySummary {
  const health = options.healthBody.value;
  const authority = options.authorityTransition.value;
  const stale = booleanField(authority, 'stale_source') === true;
  const inputPolicy = stringField(authority, 'input_policy');
  const sessionId = options.sessionIdentity.value.sessionId ?? stringField(health, 'session_id');
  const healthText = options.healthText.value;
  const streamText = options.streamText.value;
  const healthUnavailable = healthText.toLowerCase().includes('unavailable');
  const mcpDegraded = (options.mcpInventory.value.startupFailureCount ?? 0) > 0 || (options.mcpInventory.value.runtimeFaultCount ?? 0) > 0;
  const status: RuntimeTopologySummary['status'] = stale
    ? 'stale'
    : healthUnavailable || !options.healthEndpoint
      ? 'unavailable'
      : mcpDegraded || streamText !== 'connected'
        ? 'degraded'
        : 'live';
  const posture = runtimePosture({
    status,
    stale,
    inputPolicy,
    sessionId,
    mcpStartupFailures: options.mcpInventory.value.startupFailureCount ?? 0,
    mcpRuntimeFaults: options.mcpInventory.value.runtimeFaultCount ?? 0,
  });
  return {
    status,
    statusText: posture.verdictLabel,
    verdictLabel: posture.verdictLabel,
    primaryCause: posture.primaryCause,
    operatorHint: posture.operatorHint,
    nodes: [
      fallbackLaunchNode(health, healthText),
      fallbackSessionNode(health, options.sessionIdentity.value, sessionId, streamText),
      fallbackAuthorityNode(authority),
      controlInputBridgeNode(objectField(health, 'control_input_bridge')),
      endpointNode('Event Stream', options.eventEndpoint, streamText),
      endpointNode('Health', options.healthEndpoint, healthText),
      endpointNode('Operator Input', options.inputEndpoint, inputPolicy ?? 'input policy not advertised'),
      fallbackMcpNode(options.mcpInventory.value),
    ],
    stale,
    inputPolicy,
    canSendInput: posture.canSendInput,
    sessionId,
    authorityRuntimeId: stringField(authority, 'authority_runtime_id'),
    endpoints: {
      health: options.healthEndpoint,
      eventStream: options.eventEndpoint,
    },
  };
}

function fallbackLaunchNode(health: Record<string, unknown> | null, healthText: string): RuntimeTopologyNode {
  return {
    id: 'launch',
    label: 'Launch',
    state: stringField(health, 'runtime') ?? stringField(health, 'runtime_host_kind') ?? 'not advertised',
    detail: healthText,
    metadata: compactMetadata([
      ['Site', stringField(health, 'site_id')],
      ['Agent', stringField(health, 'agent_id')],
      ['Role', stringField(health, 'role')],
      ['Provider', stringField(objectField(health, 'intelligence'), 'provider') ?? stringField(health, 'provider')],
    ]),
  };
}

function fallbackSessionNode(health: Record<string, unknown> | null, identity: SessionIdentitySummary, sessionId: string | null, streamText: string): RuntimeTopologyNode {
  return {
    id: 'session',
    label: 'Session',
    state: sessionId ? 'bound' : 'not bound',
    detail: sessionId ?? 'session id not advertised',
    metadata: compactMetadata([
      ['Stream', streamText],
      ['Site', identity.siteId],
      ['Agent', identity.agentId],
      ['Health session', stringField(health, 'session_id')],
    ]),
  };
}

function fallbackAuthorityNode(authority: Record<string, unknown> | null): RuntimeTopologyNode {
  const stale = booleanField(authority, 'stale_source') === true;
  return {
    id: 'authority',
    label: 'Authority',
    state: stale ? 'stale' : stringField(authority, 'source_write_admission') ?? 'not advertised',
    detail: stringField(authority, 'authority_runtime_id') ?? stringField(authority, 'authority_runtime_host') ?? 'authority locator not advertised',
    metadata: compactMetadata([
      ['Host', stringField(authority, 'authority_runtime_host')],
      ['Epoch', numberField(authority, 'authority_epoch')],
      ['Input', stringField(authority, 'input_policy')],
      ['Superseded by', stringField(authority, 'superseded_by_session_id')],
    ]),
  };
}

function endpointNode(label: string, endpoint: string | null, state: string): RuntimeTopologyNode {
  return {
    id: label.toLowerCase().replace(/\s+/g, '-'),
    label,
    state: endpoint ? state : 'not configured',
    detail: endpoint ?? 'endpoint not configured',
    metadata: [],
  };
}

function fallbackMcpNode(inventory: McpInventorySummary): RuntimeTopologyNode {
  const serverCount = inventory.serverCount ?? inventory.servers.length;
  return {
    id: 'mcp',
    label: 'MCP Children',
    state: inventory.operationalState ?? 'not advertised',
    detail: `${serverCount} server${serverCount === 1 ? '' : 's'}`,
    metadata: compactMetadata([
      ['Startup failures', inventory.startupFailureCount],
      ['Runtime faults', inventory.runtimeFaultCount],
      ['Inventory source', inventory.source],
    ]),
  };
}

function canonicalStatus(status: string | null, stale: boolean): RuntimeTopologySummary['status'] {
  if (stale) return 'stale';
  if (status === 'live') return 'live';
  if (status === 'degraded' || status === 'closed') return 'degraded';
  return 'unavailable';
}

function runtimePosture({
  status,
  stale,
  inputPolicy,
  sessionId,
  mcpStartupFailures,
  mcpRuntimeFaults,
}: {
  status: RuntimeTopologySummary['status'];
  stale: boolean;
  inputPolicy: string | null;
  sessionId: string | null;
  mcpStartupFailures: number;
  mcpRuntimeFaults: number;
}): Pick<RuntimeTopologySummary, 'verdictLabel' | 'primaryCause' | 'operatorHint' | 'canSendInput'> {
  if (stale) {
    return {
      verdictLabel: 'stale attachment',
      primaryCause: 'This browser is attached to superseded authority.',
      operatorHint: 'Start a new session or attach to the live authority before sending input.',
      canSendInput: false,
    };
  }
  if (inputPolicy === 'disabled_source_sealed') {
    return {
      verdictLabel: 'read-only attachment',
      primaryCause: 'Source authority is sealed for input.',
      operatorHint: 'Reattach to the target authority before sending input.',
      canSendInput: false,
    };
  }
  if (!sessionId || status === 'unavailable') {
    return {
      verdictLabel: 'not attached',
      primaryCause: 'No live runtime health binding is available.',
      operatorHint: 'Start a new session from the launcher before sending input.',
      canSendInput: false,
    };
  }
  if (mcpStartupFailures > 0 || mcpRuntimeFaults > 0) {
    return {
      verdictLabel: 'attached with surface issues',
      primaryCause: `${mcpStartupFailures + mcpRuntimeFaults} MCP surface issue${mcpStartupFailures + mcpRuntimeFaults === 1 ? '' : 's'} reported.`,
      operatorHint: 'Inspect MCP children before relying on surface-backed operations.',
      canSendInput: true,
    };
  }
  if (status === 'degraded') {
    return {
      verdictLabel: 'attached, degraded',
      primaryCause: 'Runtime health is degraded, but authority is not stale.',
      operatorHint: 'Check endpoints and heartbeat before starting sensitive work.',
      canSendInput: true,
    };
  }
  return {
    verdictLabel: 'attached',
    primaryCause: 'This browser is attached to the active runtime.',
    operatorHint: 'Input can be sent to this session.',
    canSendInput: true,
  };
}

function compactMetadata(values: [string, string | number | null | undefined][]): { label: string; value: string }[] {
  return values
    .filter((entry): entry is [string, string | number] => entry[1] !== null && entry[1] !== undefined && String(entry[1]).length > 0)
    .map(([label, value]) => ({ label, value: String(value) }));
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

function booleanField(record: unknown, field: string): boolean | null {
  if (!record || typeof record !== 'object') return null;
  const value = (record as Record<string, unknown>)[field];
  return typeof value === 'boolean' ? value : null;
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
