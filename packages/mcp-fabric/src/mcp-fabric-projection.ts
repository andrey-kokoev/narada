import { normalizedMcpNodeCommand } from './mcp-server-command.js';

type AnyRecord = Record<string, any>;

export function codexMcpEnvVarNames(): string[] {
  return [
    'NARADA_AGENT_ID',
    'NARADA_AGENT_START_EVENT_ID',
    'NARADA_NARS_SESSION_ID',
    'NARADA_RUNTIME_SESSION_ID',
    'NARADA_CARRIER_SESSION_ID',
    'NARADA_SITE_ROOT',
    'NARADA_WORKSPACE_ROOT',
    'NARADA_AGENT_CONTEXT_DB',
  ];
}

function projectCarrierCommand(command: any): any {
  return normalizedMcpNodeCommand(command) ?? command;
}
function projectServerTimeouts(server: AnyRecord): AnyRecord {
  return {
    ...(Number.isFinite(Number(server.startup_timeout_sec)) ? { startup_timeout_sec: Number(server.startup_timeout_sec) } : {}),
    ...(Number.isFinite(Number(server.request_timeout_ms)) ? { request_timeout_ms: Number(server.request_timeout_ms) } : {}),
  };
}

export function projectFabricForCodex(fabric: AnyRecord): AnyRecord[] {
  const envVars = codexMcpEnvVarNames();
  return Object.entries(fabric.servers as AnyRecord).map(([name, serverValue]) => {
    const server = serverValue as AnyRecord;
    return ({
    name,
    command: projectCarrierCommand(server.command),
    args: server.args,
    env_vars: mergeUnique([...(server.env_vars ?? []), ...envVars]),
    ...projectServerTimeouts(server),
    });
  });
}

export function projectFabricForAgentTui(fabric: AnyRecord, envValues: AnyRecord): AnyRecord {
  const mcpServers: AnyRecord = {};
  for (const [name, serverValue] of Object.entries(fabric.servers as AnyRecord)) {
    const server = serverValue as AnyRecord;
    const tools = agentTuiToolNames(server);
    if (tools.length === 0) continue;
    mcpServers[name] = {
      command: projectCarrierCommand(server.command),
      args: server.args,
      ...(server.target_site_root ? { target_site_root: server.target_site_root } : {}),
      ...projectServerTimeouts(server),
      env: {
        ...projectServerEnvironment(server),
        ...envValues,
      },
      tools,
    };
  }
  return { mcpServers };
}

export function projectFabricForClaudeCode(fabric: AnyRecord, envValues: AnyRecord): AnyRecord {
  const mcpServers: AnyRecord = {};
  for (const [name, serverValue] of Object.entries(fabric.servers as AnyRecord)) {
    const server = serverValue as AnyRecord;
    mcpServers[name] = {
      command: projectCarrierCommand(server.command),
      args: server.args,
      ...projectServerTimeouts(server),
      env: {
        ...projectServerEnvironment(server),
        ...envValues,
      },
    };
  }
  return { mcpServers };
}

export function projectServerEnvironment(server: AnyRecord, baseEnv: AnyRecord = process.env): AnyRecord {
  const inherited: AnyRecord = {};
  for (const name of server.env_vars ?? []) {
    if (Object.prototype.hasOwnProperty.call(baseEnv, name) && baseEnv[name] !== undefined) {
      inherited[name] = String(baseEnv[name]);
    }
  }
  return {
    ...inherited,
    ...(server.env ?? {}),
  };
}

export function mcpServerNames(fabric: AnyRecord): string[] {
  return Object.keys(fabric.servers).sort((a, b) => a.localeCompare(b));
}

function agentTuiToolNames(server: AnyRecord): string[] {
  if (server.registry_metadata_authoritative === true) {
    return expandAgentContextStartupAliases(server, mergeUnique((Object.values((server.registry_tools ?? {}) as AnyRecord) as AnyRecord[])
      .filter((tool) => tool && tool.refused !== true)
      .map((tool: AnyRecord) => tool.name)));
  }
  return expandAgentContextStartupAliases(server, mergeUnique([
    ...(server.tools ?? []),
    ...(server.allowed_tools ?? []),
    ...(server.tool_names ?? []),
  ]));
}

function expandAgentContextStartupAliases(server: AnyRecord, tools: string[]): string[] {
  if (!isAgentContextSurface(server)) return tools;
  const toolSet = new Set(tools);
  if (toolSet.has('startup_sequence') || toolSet.has('agent_context_startup_sequence')) {
    toolSet.add('agent_context_startup_sequence');
    toolSet.delete('startup_sequence');
  }
  return mergeUnique([...toolSet]);
}

function isAgentContextSurface(server: AnyRecord): boolean {
  if (String(server.surface_id ?? '') === 'agent-context-mcp.local') return true;
  const registryToolNames = Object.keys(server.registry_tools ?? {});
  return registryToolNames.some((tool) => tool.startsWith('agent_context_'));
}

function mergeUnique(values: any[]): string[] {
  return Array.from(new Set(values.filter((value) => value !== null && value !== undefined && String(value).length > 0).map(String))).sort((a, b) => a.localeCompare(b));
}
