import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMcpSurfaceRegistry, registrySurfaces, siteControlRoot } from '../../carrier-action-admission/src/tool-metadata.mjs';
import { McpFabricError } from './mcp-fabric-errors.mjs';
import { mcpFabricRepairPlan } from './mcp-fabric-repair-plans.mjs';

export function loadSiteMcpFabric(siteRoot, options = {}) {
  const required = options.required ?? false;
  const validateRegistry = options.validateRegistry ?? 'diagnostic';
  const injectionScopeFilter = normalizeInjectionScopeFilter(options.injectionScope ?? options.injection_scope ?? null);
  const runtimeKindFilter = normalizeRuntimeKindFilter(options.runtimeKind ?? options.runtime_kind ?? null);
  const fabricDirectory = resolveSiteMcpFabricDirectory(siteRoot);
  const mcpDir = fabricDirectory.mcpDir;
  if (!existsSync(mcpDir)) {
    if (!required) {
      const empty = emptyFabric(siteRoot, mcpDir);
      empty.source = fabricDirectory.source;
      empty.candidate_mcp_dirs = fabricDirectory.candidates;
      if (validateRegistry !== false) {
        empty.registry_validation = validateFabricAgainstRegistry(siteRoot, mcpDir, [], {});
      }
      return empty;
    }
    throw new McpFabricError('mcp_fabric_missing', `MCP fabric directory not found: ${mcpDir}`, {
      siteRoot,
      mcpDir,
      candidate_mcp_dirs: fabricDirectory.candidates,
    });
  }

  const candidateFiles = readdirSync(mcpDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const servers = {};
  const sources = {};
  const skipped = [];
  const activeFiles = [];
  const surfaceRegistry = loadMcpSurfaceRegistry(siteRoot);

  for (const file of candidateFiles) {
    const path = join(mcpDir, file);
    const packet = parseJsonFile(path);
    if (isRetiredEmptyMcpSidecar(packet)) {
      skipped.push({ file, reason: 'retired_empty_sidecar' });
      continue;
    }
    activeFiles.push(file);
    const serverEntries = Object.entries(packet.mcpServers ?? {});
    for (const [serverName, rawServer] of serverEntries) {
      const injectionScope = serverInjectionScope(rawServer);
      if (injectionScopeFilter && !injectionScopeFilter.has(injectionScope)) {
        skipped.push({ file, server_name: serverName, reason: 'injection_scope_not_requested', injection_scope: injectionScope });
        continue;
      }
      const runtimeRequirements = serverRuntimeRequirements(rawServer);
      if (!runtimeRequirementsMatch(runtimeRequirements, runtimeKindFilter)) {
        skipped.push({
          file,
          server_name: serverName,
          reason: 'runtime_kind_not_requested',
          runtime_kind: runtimeKindFilter,
          runtime_requirements: runtimeRequirements,
        });
        continue;
      }
      const normalized = normalizeServerConfig(serverName, rawServer, siteRoot);
      if (!normalized) {
        skipped.push({ file, server_name: serverName, reason: 'transport_not_stdio', transport: rawServer?.transport ?? null });
        continue;
      }

      if (servers[serverName]) {
        if (canonicalJson(servers[serverName]) !== canonicalJson(normalized)) {
          const details = {
            serverName,
            firstFile: sources[serverName],
            secondFile: file,
            siteRoot,
            mcpDir,
          };
          details.repair_plan = mcpFabricRepairPlan('mcp_fabric_duplicate_server_conflict', details);
          throw new McpFabricError('mcp_fabric_duplicate_server_conflict', `Conflicting MCP server definition for ${serverName}`, details);
        }
        continue;
      }

      servers[serverName] = normalized;
      sources[serverName] = file;
    }
  }

  for (const [serverName, server] of Object.entries(servers)) {
    const sourceFile = sources[serverName];
    const surfaceTools = server.surface_id ? surfaceRegistry.tools_by_surface_id[server.surface_id] ?? null : null;
    const generatedFileTools = sourceFile ? surfaceRegistry.tools_by_generated_file[sourceFile] ?? null : null;
    const serverNameTools = surfaceRegistry.tools_by_server_name?.[serverName] ?? null;
    const registryTools = serverNameTools ?? surfaceTools ?? generatedFileTools ?? null;
    server.registry_tools = registryTools ? { ...registryTools } : {};
    server.registry_source = surfaceRegistry.status === 'loaded' ? surfaceRegistry.path : null;
    server.registry_metadata_authoritative = surfaceRegistry.status === 'loaded' && !!registryTools;
  }

  const unsupportedTransportSkipped = skipped.filter((entry) => entry.reason === 'transport_not_stdio');
  if (required && unsupportedTransportSkipped.length > 0) {
    throw new McpFabricError('mcp_fabric_unsupported_transport', `Unsupported MCP transport found in ${mcpDir}`, {
      siteRoot,
      mcpDir,
      skipped: unsupportedTransportSkipped,
    });
  }

  const runtimeFilteredServerCount = skipped.filter((entry) => entry.reason === 'runtime_kind_not_requested').length;
  if (required && Object.keys(servers).length === 0 && runtimeFilteredServerCount === 0) {
    throw new McpFabricError('mcp_fabric_empty', `No stdio MCP servers found in ${mcpDir}`, { siteRoot, mcpDir, files: candidateFiles });
  }

  const nonCanonicalServerNames = Object.keys(servers)
    .filter((serverName) => !serverName.startsWith('narada-'))
    .sort((a, b) => a.localeCompare(b));
  if (required && nonCanonicalServerNames.length > 0) {
    throw new McpFabricError(
      'temporary_mcp_server_name_missing_narada_prefix',
      `Temporary MCP leak identification gate refused non-canonical server names: ${nonCanonicalServerNames.join(', ')}`,
      {
        siteRoot,
        mcpDir,
        non_canonical_server_names: nonCanonicalServerNames,
        remediation: 'Temporary MCP leak identification gate: Site-local MCP server names must start with narada- while launcher fabric leakage is being identified.',
      },
    );
  }

  const registryValidation = validateFabricAgainstRegistry(siteRoot, mcpDir, activeFiles, servers);
  if (validateRegistry === true && registryValidation.status === 'mismatch') {
    const details = {
      siteRoot,
      mcpDir,
      registryPath: registryValidation.registry_path,
      missing: registryValidation.missing,
      unexpected: registryValidation.unexpected,
    };
    details.repair_plan = mcpFabricRepairPlan('mcp_fabric_registry_mismatch', details);
    throw new McpFabricError('mcp_fabric_registry_mismatch', `MCP fabric does not match registry ${normalize(registryValidation.registry_path)}`, details);
  }

  return {
    schema: 'narada.mcp.fabric.loaded.v1',
    site_root: siteRoot,
    source: fabricDirectory.source,
    mcp_dir: mcpDir,
    candidate_mcp_dirs: fabricDirectory.candidates,
    files: loadedSourceFiles(sources),
    candidate_files: candidateFiles,
    servers,
    sources,
    skipped,
    runtime_kind: runtimeKindFilter,
    registry_validation: validateRegistry === false ? undefined : registryValidation,
  };
}

function resolveSiteMcpFabricDirectory(siteRoot) {
  const primary = join(siteRoot, '.ai', 'mcp');
  const contained = join(siteControlRoot(siteRoot), '.ai', 'mcp');
  const candidates = [primary, contained];
  if (existsSync(primary)) {
    return { mcpDir: primary, source: '.ai/mcp', candidates };
  }
  if (existsSync(contained)) {
    return { mcpDir: contained, source: '.narada/.ai/mcp', candidates };
  }
  return { mcpDir: primary, source: '.ai/mcp', candidates };
}


function emptyFabric(siteRoot, mcpDir) {
  return {
    schema: 'narada.mcp.fabric.loaded.v1',
    site_root: siteRoot,
    source: '.ai/mcp',
    mcp_dir: mcpDir,
    files: [],
    servers: {},
    sources: {},
    skipped: [],
    runtime_kind: null,
  };
}

function parseJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new McpFabricError('mcp_fabric_invalid_json', `Invalid MCP config JSON: ${path}`, {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeServerConfig(serverName, rawServer, siteRoot) {
  if (!rawServer || typeof rawServer !== 'object') {
    throw new McpFabricError('mcp_fabric_invalid_server', `Invalid MCP server definition for ${serverName}`, { serverName });
  }
  const transport = rawServer.transport ?? (rawServer.command ? 'stdio' : null);
  if (transport !== 'stdio') return null;
  const command = normalizeCommand(rawServer.command);
  const siteRootResolved = resolve(siteRoot);
  const portableSiteRoot = siteRootResolved.replaceAll('\\', '/');
  const targetSiteRoot = rawServer.target_site_root
    ? String(rawServer.target_site_root).replaceAll('{site_root}', portableSiteRoot)
    : portableSiteRoot;
  const args = Array.isArray(rawServer.args)
    ? rawServer.args.map((arg) => normalizePortablePathText(String(arg).replaceAll('{site_root}', portableSiteRoot)))
    : [];
  const normalizedTargetSiteRoot = normalizePortablePathText(targetSiteRoot);
  const runtimeRequirements = serverRuntimeRequirements(rawServer);
  const selectedRuntimeKind = rawServer.surface_projection?.runtime_kind === 'nars' ? 'nars' : null;
  const surfaceProjection = normalizeSurfaceProjection(rawServer, runtimeRequirements, selectedRuntimeKind);
  const projectionId = typeof rawServer.projection_id === 'string'
    ? rawServer.projection_id
    : typeof surfaceProjection?.projection_id === 'string' ? surfaceProjection.projection_id : null;
  const pathPolicyViolation = firstServerPathPolicyViolation(serverName, siteRootResolved, args, normalizedTargetSiteRoot);
  if (pathPolicyViolation) {
    throw new McpFabricError(
      'mcp_fabric_server_path_outside_site_root',
      `MCP server ${serverName} contains a path outside the Site root`,
      pathPolicyViolation,
    );
  }
  return {
    transport: 'stdio',
    command,
    args,
    env: objectStringValues(rawServer.env),
    env_vars: Array.isArray(rawServer.env_vars) ? rawServer.env_vars.map(String) : [],
    ...rawServerToolList(rawServer),
    ...(rawServer.surface_id ? { surface_id: String(rawServer.surface_id) } : {}),
    ...(projectionId ? { projection_id: projectionId } : {}),
    ...(surfaceProjection ? { surface_projection: surfaceProjection } : {}),
    target_site_root: normalizedTargetSiteRoot,
    ...(rawServer.authority_posture ? { authority_posture: String(rawServer.authority_posture) } : {}),
    injection_scope: serverInjectionScope(rawServer),
    ...(rawServer.authority_locus && typeof rawServer.authority_locus === 'object' ? { authority_locus: rawServer.authority_locus } : {}),
    ...(rawServer.mutation_locus && typeof rawServer.mutation_locus === 'object' ? { mutation_locus: rawServer.mutation_locus } : {}),
    ...(rawServer.restart_owner ? { restart_owner: String(rawServer.restart_owner) } : {}),
    ...(rawServer.bound_into_site ? { bound_into_site: String(rawServer.bound_into_site) } : {}),
    ...(rawServer.narada_scope && typeof rawServer.narada_scope === 'object' ? { narada_scope: rawServer.narada_scope } : {}),
    ...(runtimeRequirements.length > 0 ? { runtime_requirements: runtimeRequirements } : {}),
    ...(selectedRuntimeKind ? { runtime_kind: selectedRuntimeKind } : {}),
    ...surfaceAffordanceFields(rawServer),
    ...(Number.isFinite(Number(rawServer.startup_timeout_sec)) ? { startup_timeout_sec: Number(rawServer.startup_timeout_sec) } : {}),
  };
}

function surfaceAffordanceFields(rawServer) {
  const fields = {};
  if (Array.isArray(rawServer.operator_affordances)) fields.operator_affordances = rawServer.operator_affordances.filter(objectValue);
  if (Array.isArray(rawServer.surface_affordances)) fields.surface_affordances = rawServer.surface_affordances.filter(objectValue);
  if (rawServer.operator_affordance && typeof rawServer.operator_affordance === 'object') fields.operator_affordance = rawServer.operator_affordance;
  if (rawServer.presentation && typeof rawServer.presentation === 'object') fields.presentation = rawServer.presentation;
  return fields;
}

function normalizeSurfaceProjection(rawServer, runtimeRequirements, selectedRuntimeKind) {
  const rawProjection = rawServer?.surface_projection;
  if (!rawProjection || typeof rawProjection !== 'object' || Array.isArray(rawProjection)) return null;
  const projection = { ...rawProjection };
  if (typeof rawServer.surface_id === 'string' && projection.surface_id === undefined) {
    projection.surface_id = rawServer.surface_id;
  }
  if (!Array.isArray(projection.runtime_requirements) && runtimeRequirements.length > 0) {
    projection.runtime_requirements = runtimeRequirements;
  }
  if (selectedRuntimeKind && projection.runtime_kind === undefined) {
    projection.runtime_kind = selectedRuntimeKind;
  }
  return projection;
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function loadedSourceFiles(sources) {
  return Array.from(new Set(Object.values(sources).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function normalizeInjectionScopeFilter(value) {
  if (!value) return null;
  const values = Array.isArray(value) ? value : [value];
  return new Set(values.map(normalizeInjectionScopeToken).filter(Boolean));
}

function serverInjectionScope(rawServer) {
  return normalizeInjectionScopeToken(rawServer?.narada_scope?.injection_scope ?? rawServer?.injection_scope ?? 'local_site') ?? 'local_site';
}

function normalizeInjectionScopeToken(value) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (normalized === 'host') return 'host';
  if (normalized === 'user_site') return 'user_site';
  if (normalized === 'local_site') return 'local_site';
  return null;
}

function normalizeRuntimeKindFilter(value) {
  if (value === 'nars') return 'nars';
  return null;
}

function serverRuntimeRequirements(rawServer) {
  const projection = rawServer?.surface_projection;
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) return [];
  if (!Array.isArray(projection.runtime_requirements)) return [];
  return projection.runtime_requirements.filter((value) => value === 'nars');
}

function runtimeRequirementsMatch(requirements, runtimeKind) {
  return requirements.length === 0 || (runtimeKind !== null && requirements.includes(runtimeKind));
}

function firstServerPathPolicyViolation(serverName, siteRoot, args, targetSiteRoot) {
  const siteRootResolved = resolve(siteRoot);
  for (const [index, arg] of args.entries()) {
    const violation = pathPolicyViolationForValue({
      siteRoot,
      siteRootResolved,
      value: arg,
      field: `args[${index}]`,
      serverName,
    });
    if (violation) return violation;
  }
  if (targetSiteRoot) {
    return pathPolicyViolationForValue({
      siteRoot,
      siteRootResolved,
      value: targetSiteRoot,
      field: 'target_site_root',
      serverName,
    });
  }
  return null;
}

function pathPolicyViolationForValue({ siteRoot, siteRootResolved, value, field, serverName }) {
  const text = String(value ?? '');
  if (!/(^|[\\/])\.\.([\\/]|$)/.test(text)) return null;
  const candidate = isAbsolute(text) ? resolve(text) : resolve(siteRoot, text);
  if (isPathInside(candidate, siteRootResolved)) return null;
  return {
    server_name: serverName,
    field,
    value: text,
    resolved_path: normalizePortablePathText(candidate),
    site_root: normalizePortablePathText(siteRootResolved),
  };
}

function isPathInside(candidate, root) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function validateFabricAgainstRegistry(siteRoot, mcpDir, files, servers) {
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
  const expectedFiles = new Set(expectedSurfaces.map((surface) => surface.generated_file));
  const missing = expectedSurfaces.filter((surface) => {
    return !presentFiles.has(surface.generated_file);
  });
  const unexpected = files
    .filter((file) => !expectedFiles.has(file))
    .map((file) => ({ generated_file: file }));
  return {
    status: missing.length === 0 && unexpected.length === 0 ? 'ok' : 'mismatch',
    registry_path: registryPath,
    expected_count: expectedSurfaces.length,
    missing,
    unexpected,
  };
}

function isRetiredEmptyMcpSidecar(packet) {
  return Object.keys(packet?.mcpServers ?? {}).length === 0
    && typeof packet?.description === 'string'
    && /\bsidecar\b.*\bretired\b/i.test(packet.description);
}

function normalizeCommand(command) {
  if (String(command ?? '').toLowerCase() === 'node') return process.execPath;
  return String(command ?? '');
}

function normalizePortablePathText(value) {
  return value.replaceAll('\\', '/');
}

function objectStringValues(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, String(entry)]));
}

function rawServerToolList(rawServer) {
  const tools = mergeUnique([
    ...(Array.isArray(rawServer.tools) ? rawServer.tools : []),
    ...(Array.isArray(rawServer.allowed_tools) ? rawServer.allowed_tools : []),
    ...(Array.isArray(rawServer.tool_names) ? rawServer.tool_names : []),
  ]);
  return tools.length > 0 ? { tools } : {};
}

function mergeUnique(values) {
  return Array.from(new Set(values.filter((value) => value !== null && value !== undefined && String(value).length > 0).map(String))).sort((a, b) => a.localeCompare(b));
}

function canonicalJson(value) {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map((key) => [key, sortDeep(value[key])]));
}

function isMainModule() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}
