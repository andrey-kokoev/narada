#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { siteControlRoot } from '../carrier-action-admission/tool-metadata.mjs';
import { effectiveSiteRoot } from './site-fabric-audit.mjs';
import { loadSiteMcpFabric } from './mcp-fabric.mjs';

function generatedRegistryPath(siteRoot) {
  return join(siteControlRoot(siteRoot), 'capabilities', 'mcp-surfaces.json');
}

function buildMcpSurfaceRegistry(siteRoot, options = {}) {
  const normalizedSiteRoot = effectiveSiteRoot(normalize(siteRoot));
  const fabric = loadSiteMcpFabric(normalizedSiteRoot, { required: true, validateRegistry: false });
  const surfaces = Object.entries(fabric.servers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([serverName, server]) => {
      const sourceFile = fabric.sources?.[serverName];
      const surfaceId = server.surface_id ?? `${serverName}.local`;
      const toolContract = inferredToolContract(serverName);
      return {
        surface_id: surfaceId,
        display_name: serverName,
        server_name: serverName,
        authority_boundary: {
          posture: 'generated_conservative_transport_registry',
          grants_tool_authority: toolContract.read_only_tools.length > 0,
          granted_tool_authority_kind: toolContract.read_only_tools.length > 0
            ? 'read_only_declared_startup_or_lifecycle_contract'
            : 'none',
        },
        client_config: {
          generated_path: `.ai/mcp/${sourceFile}`,
          generated_file: sourceFile,
        },
        tool_contract: toolContract,
        registered_live_tools: [],
      };
    });

  return {
    schema: 'narada.site.capabilities.mcp_surfaces.v1',
    site_id: options.siteId ?? deriveSiteId(normalizedSiteRoot),
    generated_by: 'tools/mcp-fabric/generate-mcp-surface-registry.mjs',
    generated_at: options.generatedAt ?? new Date().toISOString(),
    generation_policy: {
      source: '.ai/mcp',
      mode: 'conservative_transport_authority',
      note: 'This registry binds live MCP client configs to Site authority. It may declare narrowly inferred read-only startup/lifecycle tools; all other tools remain unlisted until explicitly classified.',
    },
    surfaces,
  };
}

function writeMcpSurfaceRegistry(siteRoot, options = {}) {
  const normalizedSiteRoot = effectiveSiteRoot(normalize(siteRoot));
  const registry = buildMcpSurfaceRegistry(normalizedSiteRoot, options);
  const path = generatedRegistryPath(normalizedSiteRoot);
  mkdirSync(join(siteControlRoot(normalizedSiteRoot), 'capabilities'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  return {
    schema: 'narada.mcp_fabric.registry_generation_result.v1',
    status: 'ok',
    site_root: normalizedSiteRoot,
    registry_path: path,
    surface_count: registry.surfaces.length,
    mutation_performed: true,
  };
}

function inferredToolContract(serverName) {
  const lowerName = serverName.toLowerCase();
  if (lowerName.includes('agent-context')) {
    return {
      read_only_tools: [
        'agent_context_doctor',
        'agent_context_hydrate_current',
        'agent_context_read_current',
        'mcp_output_show',
        'startup_sequence',
      ],
      mutating_tools: [],
      refused_tools: [],
    };
  }
  if (lowerName.includes('task-lifecycle')) {
    return {
      read_only_tools: [
        'task_lifecycle_audit',
        'task_lifecycle_inspect',
        'task_lifecycle_list',
        'task_lifecycle_next',
        'task_lifecycle_obligations',
        'task_lifecycle_roster',
        'task_lifecycle_show',
      ],
      mutating_tools: [],
      refused_tools: [],
    };
  }
  return {
    read_only_tools: [],
    mutating_tools: [],
    refused_tools: [],
  };
}

function deriveSiteId(siteRoot) {
  const normalized = normalize(siteRoot);
  const base = basename(normalized).toLowerCase() === '.narada'
    ? basename(normalize(join(normalized, '..')))
    : basename(normalized);
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';
}

function parseArgs(argv) {
  const options = { siteRoots: [], pretty: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--site-root' && argv[i + 1]) {
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
  if (options.help || options.siteRoots.length === 0) {
    console.log('Usage: node tools/mcp-fabric/generate-mcp-surface-registry.mjs --site-root <root> [--site-root <root> ...] [--pretty]');
    return options.help ? 0 : 1;
  }
  const results = options.siteRoots.map((siteRoot) => writeMcpSurfaceRegistry(siteRoot));
  console.log(JSON.stringify({
    schema: 'narada.mcp_fabric.registry_generation_batch.v1',
    status: 'ok',
    result_count: results.length,
    results,
    mutation_performed: true,
  }, null, options.pretty ? 2 : 0));
  return 0;
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

export {
  buildMcpSurfaceRegistry,
  deriveSiteId,
  generatedRegistryPath,
  inferredToolContract,
  writeMcpSurfaceRegistry,
};

if (isEntrypoint) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    console.error(JSON.stringify({
      schema: 'narada.mcp_fabric.registry_generation_error.v1',
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      mutation_performed: false,
    }));
    process.exitCode = 1;
  }
}
