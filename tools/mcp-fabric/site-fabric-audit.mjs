#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registrySurfaces, siteControlRoot } from '../../packages/carrier-action-admission/src/tool-metadata.mjs';
import { loadSiteMcpFabric, projectFabricForAgentTui } from '../../packages/mcp-fabric/src/mcp-fabric.mjs';

const DEFAULT_LAUNCH_REGISTRY = 'C:/Users/Andrey/Narada/config/launch/agents.psd1';

function registryPathForSite(siteRoot) {
  return join(siteControlRoot(siteRoot), 'capabilities', 'mcp-surfaces.json');
}

function auditAgentTuiProjection(siteRoot, fabric) {
  if (!fabric) {
    return {
      status: 'not_checked',
      reason: 'fabric_not_loaded',
    };
  }
  const siteMcpFabricRoot = join(siteRoot, '.ai', 'mcp');
  const sessionScopedConfigPath = join(siteMcpFabricRoot, 'agent-tui', 'carrier_audit', 'mcp-config.json');
  const staleGlobalConfigPath = join(siteMcpFabricRoot, 'agent-tui', 'mcp-config.json');
  const projection = projectFabricForAgentTui(fabric, {
    NARADA_AGENT_ID: 'narada.audit',
    NARADA_CARRIER_SESSION_ID: 'carrier_audit',
    NARADA_SITE_ROOT: siteRoot,
  });
  const projectedServers = Object.entries(projection.mcpServers ?? {}).map(([name, server]) => ({
    name,
    tool_count: Array.isArray(server.tools) ? server.tools.length : 0,
    tools: Array.isArray(server.tools) ? server.tools : [],
  }));
  const projectedTools = new Set(projectedServers.flatMap((server) => server.tools));
  const agentContextProjected = projectedServers.some((server) => {
    return server.tools.some((tool) => String(tool).startsWith('agent_context_')) || server.tools.includes('startup_sequence');
  });
  const missingStartupTools = agentContextProjected
    ? ['agent_context_startup_sequence', 'startup_sequence', 'mcp_output_show'].filter((tool) => !projectedTools.has(tool))
    : [];
  const staleGlobalConfigPresent = existsSync(staleGlobalConfigPath);
  const configPathInsideFabric = sessionScopedConfigPath.startsWith(`${siteMcpFabricRoot}${sep}`);
  const failureCodes = [];
  if (staleGlobalConfigPresent) failureCodes.push('agent_tui_stale_global_config_present');
  if (!configPathInsideFabric) failureCodes.push('agent_tui_config_path_outside_site_mcp_fabric');
  if (Object.keys(fabric.servers ?? {}).length > 0 && projectedServers.length === 0) failureCodes.push('agent_tui_no_admitted_projected_servers');
  if (projectedServers.some((server) => server.tool_count === 0)) failureCodes.push('agent_tui_projected_server_without_tools');
  if (missingStartupTools.length > 0) failureCodes.push('agent_tui_agent_context_startup_tools_missing');

  return {
    schema: 'narada.agent_tui.mcp_projection_audit.v1',
    status: failureCodes.length === 0 ? 'ok' : 'fail',
    failure_codes: failureCodes,
    site_mcp_fabric_root: siteMcpFabricRoot,
    session_scoped_config_path_example: sessionScopedConfigPath,
    config_path_policy: 'inside_site_mcp_fabric_without_parent_traversal_session_scoped',
    stale_global_config_path: staleGlobalConfigPath,
    stale_global_config_present: staleGlobalConfigPresent,
    projected_server_count: projectedServers.length,
    projected_servers: projectedServers,
    agent_context_projected: agentContextProjected,
    required_startup_tools: agentContextProjected ? ['agent_context_startup_sequence', 'startup_sequence', 'mcp_output_show'] : [],
    missing_startup_tools: missingStartupTools,
    mutation_performed: false,
  };
}

function mcpDirForSite(siteRoot) {
  return join(siteRoot, '.ai', 'mcp');
}

function effectiveSiteRoot(inputRoot) {
  const normalized = normalize(inputRoot);
  if (basename(normalized).toLowerCase() === '.narada') return normalized;
  if (existsSync(join(normalized, '.ai', 'mcp'))) return normalized;
  const nestedNaradaRoot = join(normalized, '.narada');
  if (existsSync(join(nestedNaradaRoot, '.ai', 'mcp')) || existsSync(join(nestedNaradaRoot, 'capabilities', 'mcp-surfaces.json'))) {
    return nestedNaradaRoot;
  }
  return normalized;
}

function registryShape(siteRoot) {
  const path = registryPathForSite(siteRoot);
  if (!existsSync(path)) {
    return {
      status: 'absent',
      path,
      shape: 'absent',
      surface_count: 0,
      authoritative_claim: false,
    };
  }
  try {
    const registry = JSON.parse(readFileSync(path, 'utf8'));
    const hasSurfaces = Array.isArray(registry.surfaces);
    const hasMcpSurfaces = Array.isArray(registry.mcp_surfaces);
    const surfaces = registrySurfaces(registry);
    return {
      status: 'loaded',
      path,
      schema: typeof registry.schema === 'string' ? registry.schema : null,
      shape: hasSurfaces ? 'surfaces' : (hasMcpSurfaces ? 'mcp_surfaces' : 'unknown'),
      surface_count: surfaces.length,
      authoritative_claim: surfaces.length > 0,
    };
  } catch (error) {
    return {
      status: 'invalid',
      path,
      shape: 'invalid',
      surface_count: 0,
      authoritative_claim: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function loadStrictValidation(siteRoot) {
  try {
    const fabric = loadSiteMcpFabric(siteRoot, { required: false, validateRegistry: true });
    return {
      status: fabric.registry_validation?.status ?? 'not_checked',
      missing: fabric.registry_validation?.missing ?? [],
    };
  } catch (error) {
    if (error?.code === 'mcp_fabric_registry_mismatch') {
      return {
        status: 'mismatch',
        code: error.code,
        message: error instanceof Error ? error.message : String(error),
        missing: error?.details?.missing ?? [],
      };
    }
    return {
      status: 'error',
      code: error?.code ?? null,
      message: error instanceof Error ? error.message : String(error),
      missing: error?.details?.missing ?? [],
    };
  }
}

function auditSiteFabric(siteRoot, source = {}) {
  const launcherRoot = normalize(siteRoot);
  const normalizedSiteRoot = effectiveSiteRoot(launcherRoot);
  const mcpDir = mcpDirForSite(normalizedSiteRoot);
  const registry = registryShape(normalizedSiteRoot);
  const strictValidation = loadStrictValidation(normalizedSiteRoot);
  let tolerantLoad;
  let fabric = null;

  try {
    fabric = loadSiteMcpFabric(normalizedSiteRoot, { required: false });
    tolerantLoad = {
      status: 'ok',
      registry_validation_status: fabric.registry_validation?.status ?? null,
    };
  } catch (error) {
    tolerantLoad = {
      status: 'error',
      code: error?.code ?? null,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const servers = fabric?.servers ?? {};
  const serverSummaries = Object.entries(servers).map(([name, server]) => ({
    name,
    source_file: fabric.sources?.[name] ?? null,
    surface_id: server.surface_id ?? null,
    registry_metadata_authoritative: server.registry_metadata_authoritative === true,
    registry_tool_count: Object.keys(server.registry_tools ?? {}).length,
  }));
  const liveUnboundServers = serverSummaries
    .filter((server) => !server.registry_metadata_authoritative)
    .map((server) => server.name);
  const agentTui = auditAgentTuiProjection(normalizedSiteRoot, fabric);
  const recommendation = siteRecommendation({
    registry,
    tolerantLoad,
    strictValidation,
    serverCount: serverSummaries.length,
    liveUnboundServers,
  });

  return {
    schema: 'narada.mcp_fabric.site_audit.v1',
    site_root: normalizedSiteRoot,
    launcher_root: launcherRoot,
    source,
    mcp_dir: mcpDir,
    mcp_dir_present: existsSync(mcpDir),
    registry,
    tolerant_load: tolerantLoad,
    strict_validation: strictValidation,
    mcp_server_count: serverSummaries.length,
    authoritative_server_count: serverSummaries.filter((server) => server.registry_metadata_authoritative).length,
    live_unbound_servers: liveUnboundServers,
    stale_registry_surfaces: strictValidation.missing ?? [],
    agent_tui: agentTui,
    servers: serverSummaries,
    recommendation,
    mutation_performed: false,
  };
}

function siteRecommendation({ registry, tolerantLoad, strictValidation, serverCount, liveUnboundServers }) {
  if (tolerantLoad.status !== 'ok') return 'fix_mcp_fabric_load_error';
  if (registry.status === 'invalid') return 'fix_invalid_registry_json';
  if (strictValidation.status === 'mismatch') return 'remove_stale_surfaces';
  if (registry.status === 'absent' && serverCount > 0) return 'no_registry_claim';
  if (registry.status === 'loaded' && registry.authoritative_claim !== true) return 'no_registry_claim';
  if (registry.status === 'loaded' && liveUnboundServers.length > 0) return 'add_registry_metadata';
  if (registry.status === 'loaded' && registry.authoritative_claim === true && strictValidation.status === 'ok') return 'ok';
  return 'no_registry_claim';
}

function parseLaunchRegistry(path) {
  const text = readFileSync(path, 'utf8');
  return parseLaunchRegistryText(text);
}

function parseLaunchRegistryText(text) {
  const defaultsText = text.slice(0, Math.max(0, text.search(/Agents\s*=/i)));
  const defaults = {
    narada_root: firstStringValue(defaultsText, 'NaradaRoot'),
    launcher: firstStringValue(defaultsText, 'Launcher'),
    launcher_path: firstStringValue(defaultsText, 'LauncherPath'),
    runtime: firstStringValue(defaultsText, 'Runtime'),
    enable_native_shell: firstBooleanValue(defaultsText, 'EnableNativeShell'),
  };
  const records = [];
  const blocks = agentBlocks(text);
  for (const block of blocks) {
    const agent = firstStringValue(block, 'Agent');
    const naradaRoot = firstStringValue(block, 'NaradaRoot') ?? defaults.narada_root;
    if (!agent || !naradaRoot) continue;
    records.push({
      agent,
      title: firstStringValue(block, 'Title'),
      narada_root: naradaRoot,
      launcher: firstStringValue(block, 'Launcher') ?? defaults.launcher,
      launcher_path: firstStringValue(block, 'LauncherPath') ?? defaults.launcher_path,
      runtime: firstStringValue(block, 'Runtime') ?? defaults.runtime ?? 'codex',
      enable_native_shell: firstBooleanValue(block, 'EnableNativeShell') ?? defaults.enable_native_shell ?? false,
    });
  }
  return records;
}

function agentBlocks(text) {
  const blocks = [];
  const lines = text.split(/\r?\n/);
  let inAgents = false;
  let inBlock = false;
  let blockLines = [];
  for (const line of lines) {
    if (!inAgents && /\bAgents\s*=/.test(line)) {
      inAgents = true;
      continue;
    }
    if (!inAgents) continue;
    if (!inBlock && /^\s*@\{\s*$/.test(line)) {
      inBlock = true;
      blockLines = [line];
      continue;
    }
    if (!inBlock) continue;
    blockLines.push(line);
    if (/^\s*\}\s*$/.test(line)) {
      blocks.push(blockLines.join('\n'));
      inBlock = false;
      blockLines = [];
    }
  }
  return blocks;
}

function firstStringValue(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*=\\s*"([^"]*)"`, 'i').exec(text);
  return match?.[1] ?? null;
}

function firstBooleanValue(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*=\\s*\\$(true|false)`, 'i').exec(text);
  if (!match) return null;
  return match[1].toLowerCase() === 'true';
}

function launcherKnownSites(registryPath = DEFAULT_LAUNCH_REGISTRY) {
  const records = parseLaunchRegistry(registryPath);
  const sites = new Map();
  for (const record of records) {
    const siteRoot = normalize(record.narada_root);
    const existing = sites.get(siteRoot) ?? {
      site_root: siteRoot,
      agents: [],
      runtimes: [],
      launch_registry_path: registryPath,
    };
    existing.agents.push(record.agent);
    if (!existing.runtimes.includes(record.runtime)) existing.runtimes.push(record.runtime);
    sites.set(siteRoot, existing);
  }
  return [...sites.values()].sort((a, b) => a.site_root.localeCompare(b.site_root));
}

function auditLauncherKnownSites(registryPath = DEFAULT_LAUNCH_REGISTRY) {
  const sites = launcherKnownSites(registryPath);
  return {
    schema: 'narada.mcp_fabric.launcher_known_sites_audit.v1',
    generated_at: new Date().toISOString(),
    launch_registry_path: registryPath,
    site_count: sites.length,
    mutation_performed: false,
    sites: sites.map((site) => auditSiteFabric(site.site_root, {
      kind: 'launcher_registry',
      launch_registry_path: registryPath,
      agents: site.agents,
      runtimes: site.runtimes,
    })),
  };
}

function parseArgs(argv) {
  const options = {
    registryPath: DEFAULT_LAUNCH_REGISTRY,
    siteRoots: [],
    pretty: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--registry' && argv[i + 1]) {
      options.registryPath = argv[++i];
    } else if (arg === '--site-root' && argv[i + 1]) {
      options.siteRoots.push(argv[++i]);
    } else if (arg === '--pretty') {
      options.pretty = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }
  return options;
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log('Usage: node tools/mcp-fabric/site-fabric-audit.mjs [--registry <agents.psd1>] [--site-root <root> ...] [--pretty]');
    return 0;
  }
  const result = options.siteRoots.length > 0
    ? {
      schema: 'narada.mcp_fabric.explicit_sites_audit.v1',
      generated_at: new Date().toISOString(),
      mutation_performed: false,
      site_count: options.siteRoots.length,
      sites: options.siteRoots.map((siteRoot) => auditSiteFabric(resolve(siteRoot), { kind: 'explicit' })),
    }
    : auditLauncherKnownSites(options.registryPath);
  console.log(JSON.stringify(result, null, options.pretty ? 2 : 0));
  return 0;
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

export {
  auditLauncherKnownSites,
  auditAgentTuiProjection,
  auditSiteFabric,
  effectiveSiteRoot,
  agentBlocks,
  launcherKnownSites,
  parseLaunchRegistry,
  parseLaunchRegistryText,
  registryPathForSite,
  registryShape,
  siteRecommendation,
};

if (isEntrypoint) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    console.error(JSON.stringify({
      schema: 'narada.mcp_fabric.site_audit_error.v1',
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      mutation_performed: false,
    }));
    process.exitCode = 1;
  }
}
