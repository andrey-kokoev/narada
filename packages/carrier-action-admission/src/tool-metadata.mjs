import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { siteControlRoot } from '../../site-common-tools/src/site-layout.mjs';

function loadMcpSurfaceRegistry(siteRoot) {
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
  let registry;
  try {
    registry = JSON.parse(readFileSync(path, 'utf8'));
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
  const toolsBySurfaceId = {};
  const toolsByGeneratedFile = {};
  const toolsByServerName = {};
  for (const surface of surfaces) {
    const surfaceId = stringOrNull(surface?.surface_id);
    if (!surfaceId) continue;
    const surfaceTools = projectSurfaceTools(surface);
    toolsBySurfaceId[surfaceId] = surfaceTools;
    const generatedPath = stringOrNull(surface?.client_config?.generated_path);
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

function projectSurfaceTools(surface) {
  const surfaceId = stringOrNull(surface?.surface_id);
  const serverName = registryServerNames(surface)[0] ?? null;
  const generatedPath = stringOrNull(surface?.client_config?.generated_path);
  const generatedFile = generatedPath ? basename(generatedPath) : null;
  const contract = surface?.tool_contract ?? {};
  const tools = {};
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

function registeredLiveToolDefaultMetadata(toolName) {
  return {
    name: toolName,
    read_only: null,
    family: 'unknown_action_family',
    authority_owner: null,
    source: 'surface_registry_uncontracted_live_tool',
    reason: 'registered_live_tool_without_tool_contract_refused',
  };
}

function resolveToolMetadata({ toolName, server = null, tool = null }) {
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

function stringOrNull(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function registrySurfaces(registry) {
  if (Array.isArray(registry?.surfaces)) return registry.surfaces;
  if (Array.isArray(registry?.mcp_surfaces)) return registry.mcp_surfaces;
  return [];
}

function registryServerNames(surface) {
  const names = new Set();
  const explicitServerName = stringOrNull(surface?.server_name);
  if (explicitServerName) names.add(explicitServerName);
  const displayName = stringOrNull(surface?.display_name);
  if (displayName) names.add(displayName);
  const clientConfigServerName = stringOrNull(surface?.client_config?.server_name);
  if (clientConfigServerName) names.add(clientConfigServerName);
  const pkg = stringOrNull(surface?.package);
  if (pkg) {
    const packageBase = pkg.split('/').pop();
    if (packageBase?.endsWith('-mcp')) names.add(packageBase.slice(0, -4));
    if (packageBase) names.add(packageBase);
  }
  const path = stringOrNull(surface?.path);
  if (path) {
    const pathBase = basename(path).replace(/\.(mjs|cjs|js|ts)$/i, '');
    if (pathBase.endsWith('-mcp')) names.add(pathBase.slice(0, -4));
    names.add(pathBase);
  }
  return [...names].filter(Boolean);
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}

export {
  loadMcpSurfaceRegistry,
  registrySurfaces,
  registryServerNames,
  resolveToolMetadata,
  siteControlRoot,
};
