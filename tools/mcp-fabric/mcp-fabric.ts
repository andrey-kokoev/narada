import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, normalize } from 'node:path';
import { loadMcpSurfaceRegistry, registrySurfaces, siteControlRoot } from '../carrier-action-admission/tool-metadata.ts';

export class McpFabricError extends Error {
  code: any;
  details: any;
  constructor(code: any, message: any, details: any= {}) {
    super(message);
    this.name = 'McpFabricError';
    this.code = code;
    this.details = details;
  }
}

export function loadSiteMcpFabric(siteRoot: any, options: any= {}): any {
  const required = options.required ?? false;
  const validateRegistry = options.validateRegistry ?? 'diagnostic';
  const mcpDir = join(siteRoot, '.ai', 'mcp');
  if (!existsSync(mcpDir)) {
    if (!required) {
      const empty: any = emptyFabric(siteRoot, mcpDir);
      if (validateRegistry !== false) {
        empty.registry_validation = validateFabricAgainstRegistry(siteRoot, mcpDir, [], {});
      }
      return empty;
    }
    throw new McpFabricError('mcp_fabric_missing', `MCP fabric directory not found: ${mcpDir}`, { siteRoot, mcpDir });
  }

  const files = readdirSync(mcpDir, { withFileTypes: true })
    .filter((entry: any) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry: any) => entry.name)
    .sort((a: any, b: any) => a.localeCompare(b));
  const servers: Record<string, any> = {};
  const sources: Record<string, string> = {};
  const skipped: any[] = [];
  const surfaceRegistry = loadMcpSurfaceRegistry(siteRoot);

  for (const file of files) {
    const path = join(mcpDir, file);
    const packet = parseJsonFile(path);
    const serverEntries = Object.entries<any>(packet.mcpServers ?? {});
    for (const [serverName, rawServer] of serverEntries) {
      const normalized = normalizeServerConfig(serverName, rawServer, siteRoot);
      if (!normalized) {
        skipped.push({ file, server_name: serverName, reason: 'transport_not_stdio', transport: rawServer?.transport ?? null });
        continue;
      }

      if (servers[serverName]) {
        if (canonicalJson(servers[serverName]) !== canonicalJson(normalized)) {
          throw new McpFabricError('mcp_fabric_duplicate_server_conflict', `Conflicting MCP server definition for ${serverName}`, {
            serverName,
            firstFile: sources[serverName],
            secondFile: file,
          });
        }
        continue;
      }

      servers[serverName] = normalized;
      sources[serverName] = file;
    }
  }

  for (const [serverName, server] of Object.entries<any>(servers)) {
    const sourceFile = sources[serverName];
    const surfaceTools = server.surface_id ? surfaceRegistry.tools_by_surface_id[server.surface_id] ?? null : null;
    const generatedFileTools = sourceFile ? surfaceRegistry.tools_by_generated_file[sourceFile] ?? null : null;
    const serverNameTools = surfaceRegistry.tools_by_server_name?.[serverName] ?? null;
    server.registry_tools = {
      ...(serverNameTools ?? {}),
      ...(surfaceTools ?? {}),
      ...(generatedFileTools ?? {}),
    };
    server.registry_source = surfaceRegistry.status === 'loaded' ? surfaceRegistry.path : null;
    server.registry_metadata_authoritative = surfaceRegistry.status === 'loaded' && (!!serverNameTools || !!surfaceTools || !!generatedFileTools);
  }

  if (required && skipped.length > 0) {
    throw new McpFabricError('mcp_fabric_unsupported_transport', `Unsupported MCP transport found in ${mcpDir}`, {
      siteRoot,
      mcpDir,
      skipped,
    });
  }

  if (required && Object.keys(servers).length=== 0) {
    throw new McpFabricError('mcp_fabric_empty', `No stdio MCP servers found in ${mcpDir}`, { siteRoot, mcpDir, files });
  }

  const registryValidation = validateFabricAgainstRegistry(siteRoot, mcpDir, files, servers);
  if (validateRegistry=== true && registryValidation.status === 'mismatch') {
    throw new McpFabricError('mcp_fabric_registry_mismatch', `MCP fabric does not match registry ${normalize(registryValidation.registry_path)}`, {
      siteRoot,
      mcpDir,
      registryPath: registryValidation.registry_path,
      missing: registryValidation.missing,
    });
  }

  return {
    schema: 'narada.mcp.fabric.loaded.v1',
    site_root: siteRoot,
    source: '.ai/mcp',
    mcp_dir: mcpDir,
    files,
    servers,
    sources,
    skipped,
    registry_validation: validateRegistry === false ? undefined : registryValidation,
  };
}

export function codexMcpEnvVarNames() {
  return [
    'NARADA_AGENT_ID',
    'NARADA_AGENT_START_EVENT_ID',
    'NARADA_CARRIER_SESSION_ID',
    'NARADA_SITE_ROOT',
    'NARADA_WORKSPACE_ROOT',
    'NARADA_AGENT_CONTEXT_DB',
  ];
}

export function projectFabricForCodex(fabric: any) {
  const envVars = codexMcpEnvVarNames();
  return Object.entries(fabric.servers).map(([name, server]: any) => ({
    name,
    command: server.command,
    args: server.args,
    env_vars: mergeUnique([...(server.env_vars ?? []), ...envVars]),
  }));
}

export function projectFabricForClaudeCode(fabric: any, envValues: any) {
  const mcpServers: Record<string, any> = {};
  for (const [name, server] of Object.entries<any>(fabric.servers)) {
    mcpServers[name] = {
      command: server.command,
      args: server.args,
      env: {
        ...projectServerEnvironment(server),
        ...envValues,
      },
    };
  }
  return { mcpServers };
}

export function projectServerEnvironment(server: any, baseEnv: any= process.env) {
  const inherited: Record<string, string> = {};
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

export function mcpServerNames(fabric: any) {
  return Object.keys(fabric.servers).sort((a: any, b: any) => a.localeCompare(b));
}

function emptyFabric(siteRoot: any, mcpDir: any) {
  return {
    schema: 'narada.mcp.fabric.loaded.v1',
    site_root: siteRoot,
    source: '.ai/mcp',
    mcp_dir: mcpDir,
    files: [],
    servers: {},
    sources: {},
    skipped: [],
  };
}

function parseJsonFile(path: any) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new McpFabricError('mcp_fabric_invalid_json', `Invalid MCP config JSON: ${path}`, {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeServerConfig(serverName: any, rawServer: any, siteRoot: any) {
  if (!rawServer || typeof rawServer !== 'object') {
    throw new McpFabricError('mcp_fabric_invalid_server', `Invalid MCP server definition for ${serverName}`, { serverName });
  }
  const transport = rawServer.transport ?? (rawServer.command ? 'stdio' : null);
  if (transport !== 'stdio') return null;
  const command = normalizeCommand(rawServer.command);
  const portableSiteRoot = siteRoot.replaceAll('\\', '/');
  const args = Array.isArray(rawServer.args)
    ? rawServer.args.map((arg: any) => String(arg).replaceAll('{site_root}', portableSiteRoot))
    : [];
  return {
    transport: 'stdio',
    command,
    args,
    env: objectStringValues(rawServer.env),
    env_vars: Array.isArray(rawServer.env_vars) ? rawServer.env_vars.map(String) : [],
    ...(rawServer.surface_id ? { surface_id: String(rawServer.surface_id) } : {}),
    ...(rawServer.target_site_root ? { target_site_root: String(rawServer.target_site_root).replaceAll('{site_root}', portableSiteRoot) } : {}),
    ...(rawServer.authority_posture ? { authority_posture: String(rawServer.authority_posture) } : {}),
  };
}

function validateFabricAgainstRegistry(siteRoot: any, mcpDir: any, files: any, servers: any) {
  const registryPath = join(siteControlRoot(siteRoot), 'capabilities', 'mcp-surfaces.json');
  if (!existsSync(registryPath)) {
    return {
      status: 'missing',
      registry_path: registryPath,
      missing: [],
    };
  }

  const registry = parseJsonFile(registryPath);
  const expectedSurfaces = [];
  for (const surface of registrySurfaces(registry)) {
    const generatedPath = surface?.client_config?.generated_path;
    const surfaceId = surface?.surface_id;
    if (!generatedPath || !surfaceId) continue;
    expectedSurfaces.push({
      surface_id: String(surfaceId),
      generated_file: basename(String(generatedPath)),
    });
  }

  const presentFiles = new Set(files);
  const missing = expectedSurfaces.filter((surface: any) => {
    return !presentFiles.has(surface.generated_file);
  });
  return {
    status: missing.length === 0 ? 'ok' : 'mismatch',
    registry_path: registryPath,
    expected_count: expectedSurfaces.length,
    missing,
  };
}

function normalizeCommand(command: any) {
  if (String(command ?? '').toLowerCase() === 'node') return process.execPath;
  return String(command ?? '');
}

function objectStringValues(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, entry]: any) => [key, String(entry)]));
}

function mergeUnique(values: any) {
  return Array.from(new Set(values.filter((value: any) => value !== null && value !== undefined && String(value).length > 0).map(String))).sort((a: any, b: any) => a.localeCompare(b));
}

function canonicalJson(value: any) {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: any): any {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort((a: any, b: any) => a.localeCompare(b)).map((key: any) => [key, sortDeep(value[key])]));
}
