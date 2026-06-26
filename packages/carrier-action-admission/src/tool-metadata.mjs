import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { siteControlRoot } from '../../site-common-tools/src/site-layout.mjs';

const NAME_PATTERN_READ_ONLY_TOOLS = new Set([
  'fs_read_file',
  'fs_read_file_range',
  'fs_stat',
  'fs_glob_search',
  'fs_grep_search',
  'mcp_output_show',
  'read_media_file',
  'task_lifecycle_list',
  'task_lifecycle_show',
  'task_lifecycle_next',
  'task_lifecycle_obligations',
  'task_lifecycle_inspect',
  'task_lifecycle_roster',
  'task_lifecycle_audit',
  'operator_surface_doctor',
  'operator_surface_health',
  'operator_surface_list_identities',
  'operator_surface_list_workspaces',
  'operator_surface_binding_status',
  'operator_surface_yasb_status',
  'operator_surface_osl_status',
  'operator_surface_komorebi_health',
  'agent_context_doctor',
  'agent_context_show_event',
  'agent_context_show_bootstrap',
  'inbox_doctor',
  'agent_context_startup_sequence',
  'site_task_lifecycle.list_tasks',
  'site_task_lifecycle.get_task',
  'site_task_lifecycle.next_task',
  'site_task_lifecycle.doctor',
  'site_task_lifecycle.plan_init',
  'site_task_lifecycle.read_task',
  'narada_site_context',
  'narada_mcp_fabric_context',
  'agent_context_memory.plan_hydration',
  'agent_context_memory.read_checkpoint_summary',
  'narada_task_read',
  'narada_task_next',
  'narada_inbox_list',
  'narada_inbox_read',
  'narada_inbox_next',
  'narada_inbox_doctor',
  'narada_inbox_show',
  'narada_ee_mcp_doctor',
  'agent_context_hydrate_current',
  'site_ops_doctor',
]);

const NAME_PATTERN_MUTATING_TOOLS = new Set([
  'site_task_lifecycle.admit_task',
  'site_task_lifecycle.materialize_task',
  'narada_task_claim',
  'narada_task_update',
  'narada_task_close',
  'narada_task_work_next',
  'narada_inbox_submit',
  'narada_inbox_claim',
  'narada_inbox_release',
  'narada_inbox_promote',
  'narada_inbox_task',
  'narada_inbox_triage',
  'agent_context_memory.record_checkpoint',
]);

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
      family: inferFamily(tool),
      authority_owner: inferAuthorityOwner(tool),
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
    const inferred = buildNamePatternToolMetadata(tool) ?? registeredLiveToolDefaultMetadata(tool);
    tools[tool] = {
      ...inferred,
      source: 'surface_registry',
      surface_id: surfaceId,
      server_name: serverName,
      generated_file: generatedFile,
      reason: `surface_registry_registered_live_tool_${inferred.read_only ? 'read_only' : 'mutating'}`,
    };
  }
  return tools;
}

function registeredLiveToolDefaultMetadata(toolName) {
  return {
    name: toolName,
    read_only: false,
    family: inferFamily(toolName),
    authority_owner: inferAuthorityOwner(toolName),
    source: 'closed_name_pattern',
    reason: 'registered_live_tool_without_tool_contract_requires_admission',
  };
}

function buildNamePatternToolMetadata(toolName) {
  if (NAME_PATTERN_READ_ONLY_TOOLS.has(toolName)) {
    return {
      name: toolName,
      read_only: true,
      family: 'read_only_context',
      authority_owner: 'target_site_read_policy',
      source: 'closed_name_pattern',
      reason: 'closed_name_pattern_read_only_tool',
    };
  }
  if (NAME_PATTERN_MUTATING_TOOLS.has(toolName)) {
    return {
      name: toolName,
      read_only: false,
      family: inferFamily(toolName),
      authority_owner: inferAuthorityOwner(toolName),
      source: 'closed_name_pattern',
      reason: 'closed_name_pattern_mutating_tool',
    };
  }
  return null;
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
  const inferred = buildNamePatternToolMetadata(toolName);
  if (inferred) {
    return {
      ...inferred,
      available: !!tool,
      server_name: server?.name ?? null,
      live_tool_catalog_seen: !!tool,
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

function inferFamily(toolName) {
  if (/task_lifecycle|task_work|narada_task|admit_task|materialize_task/i.test(toolName)) return 'task_lifecycle_mutation';
  if (/inbox|envelope/i.test(toolName)) return 'inbox_admission';
  if (/command_request|command_intent|execute_command/i.test(toolName)) return 'command';
  if (/write_file|fs_write_file|file_write|filesystem_write/i.test(toolName)) return 'site_file_mutation';
  if (/outbox|publication|mail_|email_|draft|send|reply/i.test(toolName)) return 'outbox_publication';
  return 'unknown_action_family';
}

function inferAuthorityOwner(toolName) {
  const family = inferFamily(toolName);
  if (family === 'task_lifecycle_mutation') return 'task_governance_service';
  if (family === 'inbox_admission') return 'canonical_inbox_service';
  if (family === 'command') return 'command_execution_intent_service';
  if (family === 'site_file_mutation') return 'target_site_file_authority';
  if (family === 'outbox_publication') return 'canonical_outbox_service';
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
  NAME_PATTERN_MUTATING_TOOLS,
  NAME_PATTERN_READ_ONLY_TOOLS,
  buildNamePatternToolMetadata,
  inferAuthorityOwner,
  inferFamily,
  loadMcpSurfaceRegistry,
  registrySurfaces,
  registryServerNames,
  resolveToolMetadata,
  siteControlRoot,
};
