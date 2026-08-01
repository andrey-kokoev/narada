import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { siteControlRoot } from '@narada-core/site-common-tools/site-layout';

type JsonRecord = Record<string, any>;

interface ToolMetadata extends JsonRecord {
  name?: string;
  read_only?: boolean | null;
  family?: string | null;
  authority_owner?: string | null;
  source?: string;
  reason?: string;
  available?: boolean;
  server_name?: string | null;
  surface_id?: string | null;
  registry_source?: string | null;
  generated_file?: string | null;
  registry_metadata_authoritative?: boolean;
  live_tool_catalog_seen?: boolean;
  refused?: boolean;
  registry_tools?: Record<string, ToolMetadata>;
}

interface SurfaceRecord extends JsonRecord {
  surface_id?: string;
  server_name?: string;
  display_name?: string;
  package?: string;
  path?: string;
  client_config?: JsonRecord | null;
  tool_contract?: JsonRecord | null;
  registered_live_tools?: unknown;
}

interface RegistryServer extends JsonRecord {
  name?: string;
  surface_id?: string;
  source_file?: string;
  generated_file?: string;
  registry_source?: string;
  registry_metadata_authoritative?: boolean;
  registry_tools?: Record<string, ToolMetadata>;
}

type ToolMetadataMap = Record<string, ToolMetadata>;

interface LoadedMcpSurfaceRegistry {
  schema: 'narada.mcp_surface_registry.loaded.v1';
  status: 'missing' | 'invalid' | 'loaded';
  path: string;
  error?: string;
  surfaces: SurfaceRecord[];
  tools_by_surface_id: Record<string, ToolMetadataMap>;
  tools_by_generated_file: Record<string, ToolMetadataMap>;
  tools_by_server_name?: Record<string, ToolMetadataMap>;
}

function loadMcpSurfaceRegistry(siteRoot: string): LoadedMcpSurfaceRegistry {
  const path = join(siteControlRoot(siteRoot), 'capabilities', 'mcp-surfaces.json');
  if (!existsSync(path)) {
    return {
      schema: 'narada.mcp_surface_registry.loaded.v1',
      status: 'missing',
      path,
      surfaces: [],
      tools_by_surface_id: {},
      tools_by_generated_file: {},
    };
  }
  let registry: JsonRecord;
  try {
    registry = JSON.parse(readFileSync(path, 'utf8')) as JsonRecord;
  } catch (error) {
    return {
      schema: 'narada.mcp_surface_registry.loaded.v1',
      status: 'invalid',
      path,
      error: error instanceof Error ? error.message : String(error),
      surfaces: [],
      tools_by_surface_id: {},
      tools_by_generated_file: {},
    };
  }
  const surfaces = registrySurfaces(registry);
  const toolsBySurfaceId: Record<string, ToolMetadataMap> = {};
  const toolsByGeneratedFile: Record<string, ToolMetadataMap> = {};
  const toolsByServerName: Record<string, ToolMetadataMap> = {};
  for (const surface of surfaces) {
    const surfaceId = stringOrNull(surface.surface_id);
    if (!surfaceId) continue;
    const surfaceTools = projectSurfaceTools(surface);
    toolsBySurfaceId[surfaceId] = surfaceTools;
    const generatedPath = stringOrNull(surface.client_config?.generated_path);
    if (generatedPath) toolsByGeneratedFile[basename(generatedPath)] = surfaceTools;
    for (const serverName of registryServerNames(surface)) {
      toolsByServerName[serverName] = surfaceTools;
    }
  }
  return {
    schema: 'narada.mcp_surface_registry.loaded.v1',
    status: 'loaded',
    path,
    surfaces,
    tools_by_surface_id: toolsBySurfaceId,
    tools_by_generated_file: toolsByGeneratedFile,
    tools_by_server_name: toolsByServerName,
  };
}

function projectSurfaceTools(surface: SurfaceRecord): ToolMetadataMap {
  const surfaceId = stringOrNull(surface.surface_id);
  const serverName = registryServerNames(surface)[0] ?? null;
  const generatedPath = stringOrNull(surface.client_config?.generated_path);
  const generatedFile = generatedPath ? basename(generatedPath) : null;
  const contract = surface.tool_contract ?? {};
  const tools: ToolMetadataMap = {};
  const readOnlyTools = stringArray(contract.read_only_tools);
  const mutatingTools = stringArray(contract.mutating_tools);
  const refusedTools = stringArray(contract.refused_tools);
  const declaredTools = new Set([...readOnlyTools, ...mutatingTools, ...refusedTools]);

  for (const tool of readOnlyTools) {
    tools[tool] = {
      name: tool,
      read_only: true,
      family: 'read_only_context',
      authority_owner: 'target_site_read_policy',
      source: 'surface_registry',
      surface_id: surfaceId,
      server_name: serverName,
      generated_file: generatedFile,
      reason: 'surface_registry_read_only_tool',
    };
  }
  for (const tool of mutatingTools) {
    tools[tool] = {
      name: tool,
      read_only: false,
      family: 'mcp_surface_governed_mutation',
      authority_owner: 'target_site_mcp_surface',
      source: 'surface_registry',
      surface_id: surfaceId,
      server_name: serverName,
      generated_file: generatedFile,
      reason: 'surface_registry_mutating_tool',
    };
  }
  for (const tool of refusedTools) {
    tools[tool] = {
      name: tool,
      read_only: false,
      family: 'unknown_action_family',
      authority_owner: null,
      source: 'surface_registry',
      surface_id: surfaceId,
      server_name: serverName,
      generated_file: generatedFile,
      reason: 'surface_registry_refused_tool',
      refused: true,
    };
  }
  for (const tool of stringArray(surface.registered_live_tools)) {
    if (declaredTools.has(tool)) continue;
    const inferred = registeredLiveToolDefaultMetadata(tool);
    tools[tool] = {
      ...inferred,
      source: 'surface_registry',
      surface_id: surfaceId,
      server_name: serverName,
      generated_file: generatedFile,
      reason: 'registered_live_tool_without_tool_contract_refused',
    };
  }
  return tools;
}

function registeredLiveToolDefaultMetadata(toolName: string): ToolMetadata {
  return {
    name: toolName,
    read_only: null,
    family: 'unknown_action_family',
    authority_owner: null,
    source: 'surface_registry_uncontracted_live_tool',
    reason: 'registered_live_tool_without_tool_contract_refused',
  };
}

function resolveToolMetadata({
  toolName,
  server = null,
  tool = null,
}: {
  toolName: string;
  server?: RegistryServer | null;
  tool?: JsonRecord | null;
}): ToolMetadata | null {
  const registryMetadata = server?.registry_tools?.[toolName] ?? null;
  if (registryMetadata) {
    return {
      ...registryMetadata,
      available: !!tool,
      server_name: server?.name ?? null,
      registry_source: server?.registry_source ?? null,
      generated_file: registryMetadata.generated_file ?? server?.source_file ?? server?.generated_file ?? null,
      registry_metadata_authoritative: server?.registry_metadata_authoritative === true,
      live_tool_catalog_seen: !!tool,
    };
  }
  if (server?.registry_metadata_authoritative === true) {
    return {
      name: toolName,
      read_only: null,
      family: 'unknown_action_family',
      authority_owner: null,
      source: 'surface_registry_unlisted',
      available: !!tool,
      server_name: server?.name ?? null,
      surface_id: server?.surface_id ?? null,
      registry_source: server?.registry_source ?? null,
      generated_file: server?.source_file ?? server?.generated_file ?? null,
      registry_metadata_authoritative: true,
      live_tool_catalog_seen: !!tool,
      reason: 'surface_registry_tool_not_declared',
    };
  }
  if (tool) {
    return {
      name: toolName,
      read_only: null,
      family: null,
      authority_owner: null,
      source: 'live_tool_catalog_unclassified',
      available: true,
      server_name: server?.name ?? null,
      live_tool_catalog_seen: true,
      reason: 'live_tool_catalog_has_no_authority_metadata',
    };
  }
  return null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function registrySurfaces(registry: unknown): SurfaceRecord[] {
  if (isRecord(registry) && Array.isArray(registry.surfaces)) return registry.surfaces as SurfaceRecord[];
  if (isRecord(registry) && Array.isArray(registry.mcp_surfaces)) return registry.mcp_surfaces as SurfaceRecord[];
  return [];
}

function registryServerNames(surface: SurfaceRecord): string[] {
  const names = new Set<string>();
  const explicitServerName = stringOrNull(surface.server_name);
  if (explicitServerName) names.add(explicitServerName);
  const displayName = stringOrNull(surface.display_name);
  if (displayName) names.add(displayName);
  const clientConfigServerName = stringOrNull(surface.client_config?.server_name);
  if (clientConfigServerName) names.add(clientConfigServerName);
  const pkg = stringOrNull(surface.package);
  if (pkg) {
    const packageBase = pkg.split('/').pop();
    if (packageBase?.endsWith('-mcp')) names.add(packageBase.slice(0, -4));
    if (packageBase) names.add(packageBase);
  }
  const path = stringOrNull(surface.path);
  if (path) {
    const pathBase = basename(path).replace(/\.(mjs|cjs|js|ts)$/i, '');
    if (pathBase.endsWith('-mcp')) names.add(pathBase.slice(0, -4));
    names.add(pathBase);
  }
  return [...names].filter(Boolean);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export {
  loadMcpSurfaceRegistry,
  registrySurfaces,
  registryServerNames,
  resolveToolMetadata,
  siteControlRoot,
};

export type {
  JsonRecord,
  LoadedMcpSurfaceRegistry,
  RegistryServer,
  SurfaceRecord,
  ToolMetadata,
};
