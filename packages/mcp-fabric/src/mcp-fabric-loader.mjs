import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMcpSurfaceRegistry, registryServerNames, registrySurfaces, siteControlRoot } from '@narada2/carrier-action-admission/tool-metadata';
import { McpFabricError } from './mcp-fabric-errors.mjs';
import { mcpFabricRepairPlan } from './mcp-fabric-repair-plans.mjs';
import { createMcpFabricLifecycle, transitionMcpFabricLifecycle } from './mcp-fabric-state.mjs';

export function loadSiteMcpFabric(siteRoot, options = {}) {
  const required = options.required ?? false;
  const validateRegistry = options.validateRegistry ?? 'diagnostic';
  const injectionScopeFilter = normalizeInjectionScopeFilter(options.injectionScope ?? options.injection_scope ?? null);
  const runtimeKindFilter = normalizeRuntimeKindFilter(options.runtimeKind ?? options.runtime_kind ?? null);
  const fabricDirectory = resolveSiteMcpFabricDirectory(siteRoot, options.workspaceRoot ?? options.workspace_root ?? null);
  const mcpDir = fabricDirectory.mcpDir;
  const lifecycle = transitionMcpFabricLifecycle(createMcpFabricLifecycle(), 'loaded');
  const surfaceRegistry = loadMcpSurfaceRegistry(siteRoot);
  const registryProjectionEntries = registryRuntimeBindingEntries(surfaceRegistry);
  if (!existsSync(mcpDir) && registryProjectionEntries.length === 0) {
    if (!required) {
      const empty = emptyFabric(siteRoot, mcpDir);
      empty.source = fabricDirectory.source;
      empty.candidate_mcp_dirs = fabricDirectory.candidates;
      if (validateRegistry !== false) {
        empty.registry_validation = validateFabricAgainstRegistry(siteRoot, mcpDir, [], {}, {});
      }
      return empty;
    }
    throw new McpFabricError('mcp_fabric_missing', `MCP fabric directory not found: ${mcpDir}`, {
      siteRoot,
      mcpDir,
      candidate_mcp_dirs: fabricDirectory.candidates,
    });
  }

  const candidateFiles = existsSync(mcpDir)
    ? readdirSync(mcpDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
    : [];
  const projectionEntries = candidateFiles.length > 0
    ? candidateFiles.map((file) => ({ file, packet: parseJsonFile(join(mcpDir, file)) }))
    : registryProjectionEntries;
  const materializationSource = candidateFiles.length > 0
    ? 'client_config_projection'
    : registryProjectionEntries.length > 0 ? 'surface_registry_runtime_binding' : 'empty';
  const servers = {};
  const sources = {};
  const skipped = [];
  const activeFiles = [];
  const canonicalSources = new Map();

  for (const { file, packet } of projectionEntries) {
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

      const registrySurface = authoritativeRegistrySurface(surfaceRegistry, serverName, file, normalized.surface_id);
      const authoritativeProjection = registrySurface?.surface_projection;
      const authoritativeInjectionScope = normalizeInjectionScopeToken(authoritativeProjection?.injection_scope ?? null);
      if (authoritativeInjectionScope && injectionScopeFilter && !injectionScopeFilter.has(authoritativeInjectionScope)) {
        skipped.push({
          file,
          server_name: serverName,
          reason: 'injection_scope_not_requested',
          injection_scope: authoritativeInjectionScope,
          declared_injection_scope: normalized.injection_scope,
          surface_id: registrySurface?.surface_id ?? normalized.surface_id ?? null,
          canonical_surface_id: registrySurface?.catalog_surface_id ?? authoritativeProjection?.surface_id ?? normalized.surface_id ?? null,
        });
        continue;
      }
      if (registrySurface) {
        if (typeof registrySurface.surface_id === 'string' && !normalized.surface_id) {
          normalized.surface_id = registrySurface.surface_id;
        }
        const canonicalSurfaceId = registrySurface.catalog_surface_id
          ?? authoritativeProjection?.surface_id
          ?? normalized.surface_id;
        if (canonicalSurfaceId) normalized.canonical_surface_id = String(canonicalSurfaceId);
        if (authoritativeInjectionScope) normalized.injection_scope = authoritativeInjectionScope;
        if (authoritativeProjection && typeof authoritativeProjection === 'object' && !Array.isArray(authoritativeProjection)) {
          normalized.surface_projection = {
            ...(normalized.surface_projection ?? {}),
            ...authoritativeProjection,
          };
        }
      }

      const canonicalKey = canonicalSurfaceProjectionKey(normalized);
      if (canonicalKey && canonicalSources.has(canonicalKey)) {
        throw new McpFabricError('mcp_fabric_duplicate_canonical_surface_projection', `Conflicting MCP surface projection for ${canonicalKey}`, {
          canonical_surface_projection: canonicalKey,
          firstFile: canonicalSources.get(canonicalKey),
          secondFile: file,
          serverName,
          siteRoot,
          mcpDir,
        });
      }
      if (canonicalKey) canonicalSources.set(canonicalKey, file);

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

  const registryValidation = validateFabricAgainstRegistry(siteRoot, mcpDir, activeFiles, servers, sources);
  if (validateRegistry === true && registryValidation.status === 'mismatch') {
    const details = {
      siteRoot,
      mcpDir,
      registryPath: registryValidation.registry_path,
      missing: registryValidation.missing,
      unexpected: registryValidation.unexpected,
      server_name_mismatches: registryValidation.server_name_mismatches,
    };
    details.repair_plan = mcpFabricRepairPlan('mcp_fabric_registry_mismatch', details);
    throw new McpFabricError('mcp_fabric_registry_mismatch', `MCP fabric does not match registry ${normalize(registryValidation.registry_path)}`, details);
  }

  return {
    schema: 'narada.mcp.fabric.loaded.v1',
    site_root: siteRoot,
    source: materializationSource === 'surface_registry_runtime_binding'
      ? 'surface-registry:runtime-binding'
      : fabricDirectory.source,
    materialization_source: materializationSource,
    registry_path: surfaceRegistry.status === 'loaded' ? surfaceRegistry.path : null,
    mcp_dir: mcpDir,
    candidate_mcp_dirs: fabricDirectory.candidates,
    files: loadedSourceFiles(sources),
    candidate_files: candidateFiles,
    servers,
    sources,
    skipped,
    runtime_kind: runtimeKindFilter,
    registry_validation: validateRegistry === false ? undefined : registryValidation,
    lifecycle_state: lifecycle.state,
    lifecycle_history: lifecycle.history,
  };
}

function registryRuntimeBindingEntries(registry) {
  if (registry?.status !== 'loaded') return [];
  return registrySurfaces(registry).flatMap((surface) => {
    const serverName = registryServerNames(surface)[0] ?? null;
    const transport = surface?.runtime_binding?.transport;
    if (!serverName || !transport || typeof transport !== 'object' || Array.isArray(transport)) return [];
    const generatedPath = surface?.client_config?.generated_path;
    const generatedFile = generatedPath ? basename(String(generatedPath)) : `${serverName}.registry.json`;
    const projection = objectValue(surface?.surface_projection) ? { ...surface.surface_projection } : {};
    const canonicalSurfaceId = surface?.catalog_surface_id ?? surface?.surface_id ?? null;
    if (canonicalSurfaceId && !projection.surface_id) projection.surface_id = String(canonicalSurfaceId);
    if (surface?.surface_id && !projection.projection_id) projection.projection_id = String(surface.surface_id);
    if (!projection.injection_scope) projection.injection_scope = 'local_site';
    if (!Array.isArray(projection.runtime_requirements)) projection.runtime_requirements = [];
    const injectionScope = projection.injection_scope;
    const tools = Array.isArray(surface?.tool_contract?.exposed_tools)
      ? surface.tool_contract.exposed_tools
      : surface?.registered_live_tools;
    return [{
      file: generatedFile,
      packet: {
        mcpServers: {
          [serverName]: {
            transport: transport.type ?? 'stdio',
            command: transport.command,
            args: Array.isArray(transport.args) ? transport.args : [],
            ...(objectValue(transport.env) ? { env: transport.env } : {}),
            ...(Array.isArray(transport.env_vars) ? { env_vars: transport.env_vars } : {}),
            ...(surface?.surface_id ? { surface_id: String(surface.surface_id) } : {}),
            surface_projection: projection,
            injection_scope: injectionScope,
            ...(Array.isArray(tools) ? { tools } : {}),
            ...(surface?.authority_boundary?.posture ? { authority_posture: String(surface.authority_boundary.posture) } : {}),
            ...(Array.isArray(surface?.operator_affordances) ? { operator_affordances: surface.operator_affordances } : {}),
            ...(Number.isFinite(Number(surface?.runtime_binding?.startup_timeout_sec))
              ? { startup_timeout_sec: Number(surface.runtime_binding.startup_timeout_sec) }
              : {}),
          },
        },
      },
    }];
  });
}

function resolveSiteMcpFabricDirectory(siteRoot, workspaceRoot = null) {
  const candidateEntries = [
    ...(workspaceRoot ? [{ path: join(resolve(workspaceRoot), '.ai', 'mcp'), source: 'workspace:.ai/mcp' }] : []),
    { path: join(siteRoot, '.ai', 'mcp'), source: '.ai/mcp' },
    { path: join(siteControlRoot(siteRoot), '.ai', 'mcp'), source: '.narada/.ai/mcp' },
  ];
  const uniqueEntries = candidateEntries.filter((entry, index, entries) =>
    entries.findIndex((candidate) => normalize(candidate.path) === normalize(entry.path)) === index);
  const candidates = uniqueEntries.map((entry) => entry.path);
  const selected = uniqueEntries.find((entry) => existsSync(entry.path)) ?? uniqueEntries[0];
  return { mcpDir: selected.path, source: selected.source, candidates };
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
    lifecycle_state: 'loaded',
    lifecycle_history: ['discovered', 'loaded'],
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

function authoritativeRegistrySurface(registry, serverName, generatedFile, declaredSurfaceId) {
  const surfaces = Array.isArray(registry?.surfaces) ? registry.surfaces : [];
  return surfaces.find((surface) => {
    const configuredServerName = String(surface?.server_name ?? surface?.client_config?.server_name ?? '');
    return configuredServerName === serverName;
  })
    ?? surfaces.find((surface) => String(surface?.surface_id ?? '') === String(declaredSurfaceId ?? ''))
    ?? null;
}

function canonicalSurfaceProjectionKey(server) {
  const surfaceId = String(server?.canonical_surface_id
    ?? server?.surface_projection?.surface_id
    ?? server?.surface_id
    ?? '').trim();
  if (!surfaceId) return null;
  const projectionId = String(server?.projection_id
    ?? server?.surface_projection?.projection_id
    ?? 'default').trim() || 'default';
  return `${surfaceId}::${projectionId}`;
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

function validateFabricAgainstRegistry(siteRoot, mcpDir, files, servers, sources) {
  const registryPath = join(siteControlRoot(siteRoot), 'capabilities', 'mcp-surfaces.json');
  if (!existsSync(registryPath)) {
    return {
      status: 'missing',
      registry_path: registryPath,
      missing: [],
      server_name_mismatches: [],
    };
  }

  const registry = parseJsonFile(registryPath);
  const expectedSurfaces = [];
  for (const surface of registrySurfaces(registry)) {
    const generatedPath = surface?.client_config?.generated_path;
    const surfaceId = surface?.surface_id;
    if (!generatedPath || !surfaceId) continue;
    const configuredServerName = String(surface?.server_name ?? surface?.client_config?.server_name ?? '').trim();
    expectedSurfaces.push({
      surface_id: String(surfaceId),
      generated_file: basename(String(generatedPath)),
      ...(configuredServerName ? { server_name: configuredServerName } : {}),
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
  const expectedNamedSurfacesByFile = new Map();
  for (const surface of expectedSurfaces) {
    if (!surface.server_name) continue;
    const surfacesForFile = expectedNamedSurfacesByFile.get(surface.generated_file) ?? [];
    surfacesForFile.push(surface);
    expectedNamedSurfacesByFile.set(surface.generated_file, surfacesForFile);
  }
  const serverNameMismatches = [];
  for (const [actualServerName, server] of Object.entries(servers)) {
    const generatedFile = sources?.[actualServerName];
    const expectedNamedSurfaces = expectedNamedSurfacesByFile.get(generatedFile) ?? [];
    if (expectedNamedSurfaces.length === 0) continue;
    const expectedSurfaceForId = server.surface_id
      ? expectedNamedSurfaces.find((surface) => surface.surface_id === String(server.surface_id))
      : null;
    const expectedServerNames = expectedSurfaceForId
      ? [expectedSurfaceForId.server_name]
      : expectedNamedSurfaces.map((surface) => surface.server_name);
    if (expectedServerNames.includes(actualServerName)) continue;
    serverNameMismatches.push({
      generated_file: generatedFile,
      surface_id: expectedSurfaceForId?.surface_id ?? server.surface_id ?? null,
      actual_server_name: actualServerName,
      expected_server_name: expectedSurfaceForId?.server_name ?? (expectedServerNames.length === 1 ? expectedServerNames[0] : null),
      expected_server_names: expectedServerNames,
    });
  }
  return {
    status: missing.length === 0 && unexpected.length === 0 && serverNameMismatches.length === 0 ? 'ok' : 'mismatch',
    registry_path: registryPath,
    expected_count: expectedSurfaces.length,
    missing,
    unexpected,
    server_name_mismatches: serverNameMismatches,
  };
}

function isRetiredEmptyMcpSidecar(packet) {
  return Object.keys(packet?.mcpServers ?? {}).length === 0
    && typeof packet?.description === 'string'
    && /(?:\bsidecar\b.*\bretired\b|\bretired\b.*\bsidecar\b)/i.test(packet.description);
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
