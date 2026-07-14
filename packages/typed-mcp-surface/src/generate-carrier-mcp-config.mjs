#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { assertCanonicalSiteLocus } from '../../site-common-tools/src/site-locus-shim.mjs';

const args = parseArgs(process.argv.slice(2));
const siteRoot = resolve(args.siteRoot ?? process.cwd());
const carrier = args.carrier ?? 'all';
const write = args.write === true;
const check = args.check === true;
const explicitCrossingSurfaceIds = new Set(asArray(args.allowCrossSiteMutationSurface));

const carriers = carrier === 'all' ? ['kimi', 'codex'] : [carrier];
const registry = readJson(join(siteControlRoot(siteRoot), 'capabilities', 'mcp-surfaces.json'));
const registryFingerprint = createHash('sha256').update(canonicalJson(registry)).digest('hex');
const siteId = assertCanonicalSiteLocus(registry.site_id ?? 'andrey-user', 'registry.site_id');
const boundSiteId = assertCanonicalSiteLocus(args.boundSiteId ?? siteId, 'bound_site_id');
const boundSiteLocus = assertCanonicalSiteLocus(args.boundSiteLocus ?? siteId, 'bound_site_locus');
const snippetPolicy = {
  default: 'registry_only',
  registry_is_source_of_truth: true,
  generated_snippets_are_never_inputs: true,
  tracked_exception_policy: 'Generated carrier projections are disposable outputs and never configuration authority.',
};
const outputs = carriers.map((name) => buildCarrierConfig(name));
const result = {
  schema: 'narada.mcp.carrier_config_generation.v0',
  status: 'ok',
  site_root: siteRoot,
  carrier,
  bound_site: {
    site_id: boundSiteId,
    site_locus: boundSiteLocus,
    source: args.boundSiteId || args.boundSiteLocus ? 'generator_argument' : 'registry_default',
  },
  write,
  check,
  snippet_policy: snippetPolicy,
  outputs: outputs.map((output) => ({
    carrier: output.carrier,
    path: output.path,
    server_count: Object.keys(output.config.mcpServers).length,
    missing_generated_snippets: output.missing_generated_snippets,
    surface_availability: output.config.surface_availability,
    intentional_exclusions: output.config.carrier_policy.intentional_exclusions,
  })),
};

function siteControlRoot(root) {
  const normalized = resolve(root);
  return basename(normalized).toLowerCase() === '.narada' ? normalized : join(normalized, '.narada');
}

let mismatch = false;
for (const output of outputs) {
  if (write) writeJsonFile(output.path, output.config);
  if (check) {
    if (!existsSync(output.path)) {
      mismatch = true;
      output.check_status = 'missing';
    } else {
      const current = readJson(output.path);
      if (JSON.stringify(current) !== JSON.stringify(output.config)) {
        mismatch = true;
        output.check_status = 'mismatch';
      } else {
        output.check_status = 'ok';
      }
    }
  }
}

if (mismatch) {
  result.status = 'mismatch';
  result.message = write
    ? 'generated carrier config write did not match expected output'
    : 'generated carrier config differs from on-disk file; rerun with --write to update';
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

function buildCarrierConfig(carrierName) {
  if (!['kimi', 'codex'].includes(carrierName)) throw new Error(`unsupported_carrier: ${carrierName}`);
  const surfaces = registry.surfaces ?? [];
  const mcpServers = {};
  const surfaceIndex = {};
  const missingGeneratedSnippets = [];
  const surfaceAvailability = {};
  const intentionalExclusions = [];
  for (const surface of surfaces) {
    const availability = classifySurfaceAvailability(surface);
    surfaceAvailability[surface.surface_id] = availability;
    if (!availability.included) {
      intentionalExclusions.push(surface.surface_id);
      continue;
    }
    const entries = synthesizeServer(surface);
    const normalizedEntries = normalizeServersForCarrier(entries, carrierName);
    Object.assign(mcpServers, normalizedEntries);
    if (carrierName === 'codex') {
      for (const [name, server] of Object.entries(entries)) {
        if (server.surface_id) surfaceIndex[name] = server.surface_id;
      }
    }
  }
  const path = join(siteRoot, '.ai', 'mcp', 'carriers', `narada-andrey-user-${carrierName}.mcp.json`);
  return {
    carrier: carrierName,
    path,
    missing_generated_snippets: missingGeneratedSnippets,
    config: {
      schema: 'narada.mcp.carrier_client_config.v0',
      site_id: siteId,
      carrier: carrierName,
      generated_from: {
        registry_path: '.narada/capabilities/mcp-surfaces.json',
        registry_schema: registry.schema,
        registry_sha256: registryFingerprint,
        generator: 'packages/typed-mcp-surface/src/generate-carrier-mcp-config.mjs',
      },
      snippet_policy: snippetPolicy,
      mcpServers,
      ...(carrierName === 'codex' ? { surface_index: surfaceIndex } : {}),
      surface_availability_policy: {
        schema: 'narada.mcp.surface_availability_policy.v0',
        bound_site_id: boundSiteId,
        bound_site_locus: boundSiteLocus,
        default_for_mutation_capable_foreign_surfaces: 'exclude_without_explicit_crossing_authority',
        read_only_advisory_foreign_surfaces: 'include_when_surface_has_no_mutating_tools',
        explicit_crossing_surface_ids: Array.from(explicitCrossingSurfaceIds).sort(),
        invariant: 'Mutation-capable MCP tools must not be visible across Site boundaries without explicit crossing/admission authority.',
      },
      surface_availability: surfaceAvailability,
      carrier_policy: {
        private_config_materialization: 'operator_controlled',
        registry_is_source_of_truth: true,
        intentional_exclusions: intentionalExclusions,
        note: 'This file is generated inside the User Site. Applying it to private carrier config remains an operator-controlled materialization step.',
      },
    },
  };
}

function synthesizeServer(surface) {
  const transport = surface.runtime_binding?.transport ?? {};
  if (typeof transport.command !== 'string' || !Array.isArray(transport.args)) {
    throw new Error(`carrier_generation_transport_binding_missing:${surface.surface_id}`);
  }
  const generatedPath = surface.client_config?.generated_path ?? `${surface.surface_id}.json`;
  const name = basename(generatedPath, '.json')
    .replace(/-mcp$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-');
  const args = Array.isArray(transport.args)
    ? transport.args.map((arg) => String(arg).replaceAll('{site_root}', siteRoot.replaceAll('\\', '/')))
    : [];
  return {
    [name]: {
      transport: transport.type ?? 'stdio',
      command: transport.command ?? 'node',
      args,
      surface_id: surface.surface_id,
      target_site_root: siteRoot.replaceAll('\\', '/'),
      authority_posture: surface.authority_boundary?.posture ?? null,
      generated_without_snippet: true,
    },
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function writeJsonFile(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function classifySurfaceAvailability(surface) {
  const ownerSiteId = surface.runtime_binding?.owner_site_id ?? registry.site_id ?? null;
  const ownerSiteLocus = assertCanonicalSiteLocus(ownerSiteId ?? '', `surface.${surface.surface_id}.owner_site_id`);
  const { readOnlyTools, mutatingTools, classificationSource } = classifyTools(surface.tool_contract ?? {});
  const mutationCapability = mutatingTools.length > 0
    ? classifyMutationCapability(surface)
    : 'read_only_advisory';
  const sameSite = ownerSiteId === boundSiteId || ownerSiteLocus === boundSiteLocus;
  const explicitCrossing = explicitCrossingSurfaceIds.has(surface.surface_id);
  const included = mutationCapability === 'read_only_advisory' || sameSite || explicitCrossing;
  return {
    schema: 'narada.mcp.surface_availability_decision.v0',
    included,
    surface_id: surface.surface_id,
    owner_site_id: ownerSiteId,
    owner_site_locus: ownerSiteLocus,
    bound_site_id: boundSiteId,
    bound_site_locus: boundSiteLocus,
    mutation_capability: mutationCapability,
    tool_classification_source: classificationSource,
    read_only_tool_count: readOnlyTools.length,
    mutating_tool_count: mutatingTools.length,
    explicit_crossing_authorized: explicitCrossing,
    reason: included
      ? includedReason({ mutationCapability, sameSite, explicitCrossing })
      : 'foreign_mutation_capable_surface_without_explicit_crossing_authority',
  };
}

function classifyTools(toolContract) {
  const explicitReadOnlyTools = toolContract.read_only_tools;
  const explicitMutatingTools = toolContract.mutating_tools;
  if (Array.isArray(explicitReadOnlyTools) || Array.isArray(explicitMutatingTools)) {
    return {
      readOnlyTools: explicitReadOnlyTools ?? [],
      mutatingTools: explicitMutatingTools ?? [],
      classificationSource: 'explicit_tool_contract',
    };
  }
  const exposedTools = toolContract.exposed_tools ?? [];
  const mutatingTools = exposedTools.filter((toolName) => isMutationToolName(toolName));
  const readOnlyTools = exposedTools.filter((toolName) => !mutatingTools.includes(toolName));
  return {
    readOnlyTools,
    mutatingTools,
    classificationSource: exposedTools.length > 0 ? 'inferred_from_exposed_tool_names' : 'missing_tool_contract',
  };
}

function isMutationToolName(toolName) {
  return /(^|_)(admit|bind|checkpoint|claim|close|commit|complete|continue|create|defer|delete|execute|finish|promote|prove|push|register|replace|review|route|send|set|stage|start|submit|unclaim|update|write)($|_)/.test(toolName);
}

function classifyMutationCapability(surface) {
  const posture = surface.authority_boundary?.posture ?? '';
  if (posture.includes('pc')) return 'pc_locus_mutation';
  if (posture.includes('shell') || posture.includes('git')) return 'shell_git_mutation';
  if (posture.includes('crossing')) return 'explicit_crossing_mutation';
  return 'site_local_mutation';
}

function includedReason({ mutationCapability, sameSite, explicitCrossing }) {
  if (mutationCapability === 'read_only_advisory') return 'read_only_advisory_surface';
  if (sameSite) return 'surface_owner_matches_bound_site';
  if (explicitCrossing) return 'explicit_crossing_surface_authorized';
  return 'included';
}

function normalizeServersForCarrier(entries, carrierName) {
  return Object.fromEntries(Object.entries(entries).map(([name, server]) => [
    name,
    normalizeServerForCarrier(server, carrierName),
  ]));
}

function normalizeServerForCarrier(server, carrierName) {
  if (carrierName !== 'codex') return server;
  const {
    transport,
    surface_id,
    target_site_root,
    authority_posture,
    generated_without_snippet,
    env_vars: existingEnvVars,
    ...rest
  } = server;
  return {
    ...rest,
    env_vars: mergeEnvVars(existingEnvVars, ['NARADA_AGENT_ID', 'NARADA_AGENT_START_EVENT_ID']),
  };
}

function mergeEnvVars(existing, required) {
  const values = Array.isArray(existing) ? existing.map((entry) => {
    if (typeof entry === 'string') return entry;
    return entry?.name;
  }).filter(Boolean) : [];
  return Array.from(new Set([...values, ...required]));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--site-root') parsed.siteRoot = argv[++i];
    else if (arg === '--carrier') parsed.carrier = argv[++i];
    else if (arg === '--bound-site-id') parsed.boundSiteId = argv[++i];
    else if (arg === '--bound-site-locus') parsed.boundSiteLocus = argv[++i];
    else if (arg === '--allow-cross-site-mutation-surface') {
      parsed.allowCrossSiteMutationSurface = [
        ...asArray(parsed.allowCrossSiteMutationSurface),
        argv[++i],
      ];
    }
    else if (arg === '--write') parsed.write = true;
    else if (arg === '--check') parsed.check = true;
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write('Usage: node tools/typed-mcp/generate-carrier-mcp-config.mjs [--site-root <path>] [--carrier kimi|codex|all] [--bound-site-id <id>] [--bound-site-locus <locus>] [--allow-cross-site-mutation-surface <surface_id>] [--write] [--check]\n');
      process.exit(0);
    }
  }
  return parsed;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
