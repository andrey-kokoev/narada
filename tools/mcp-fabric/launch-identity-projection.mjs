#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { effectiveSiteRoot, launcherKnownSites, parseLaunchRegistry } from './site-fabric-audit.mjs';

const DEFAULT_LAUNCH_REGISTRY = 'C:/Users/Andrey/Narada/config/launch/agents.psd1';

function identityProjectionPath(siteRoot) {
  return join(effectiveSiteRoot(normalize(siteRoot)), 'operator-surfaces', 'identities.json');
}

function buildIdentityProjection(siteRoot, records, options = {}) {
  const normalizedSiteRoot = effectiveSiteRoot(normalize(siteRoot));
  const identities = records
    .filter((record) => effectiveSiteRoot(normalize(record.narada_root)) === normalizedSiteRoot)
    .sort((a, b) => a.agent.localeCompare(b.agent))
    .map((record) => {
      const role = inferRole(record.agent);
      return {
        identity_id: record.agent,
        identity_name: record.agent,
        site_id: deriveSiteId(normalizedSiteRoot),
        agent_name: record.agent.split('.').pop(),
        role,
        agent_kind: record.runtime === 'codex' ? 'codex' : record.runtime,
        label: record.title ?? record.agent,
        display_name: record.title ?? record.agent,
        deprecated: false,
        superseded_by: null,
        previous_identity_ids: [],
        migration_history: [],
        narada_site_relation: {
          site_id: deriveSiteId(normalizedSiteRoot),
          site_kind: 'local',
          root: normalizedSiteRoot,
          relation: 'central launch registry compatibility projection',
        },
        role_metadata: {
          role,
          role_is_naming_authority: false,
        },
        projection_intent: [
          'central_launch_registry_consistency',
        ],
        distinct_from: [],
        carrier_projections: {
          [record.runtime ?? 'codex']: {
            runtime: record.runtime ?? 'codex',
            cwd: normalizedSiteRoot,
            agent_id: record.agent,
          },
        },
        label_projection: {},
        input_capabilities: [
          'focus',
          'type_text',
          'submit',
        ],
        submit_strategy: 'known_surface_submit',
        role_prompt: null,
        admitted_by: 'central_launch_registry_projection',
        admitted_at: options.generatedAt ?? new Date().toISOString(),
        updated_at: options.generatedAt ?? new Date().toISOString(),
        authority_limits: [
          'identity_projection_is_not_site_capability_authority',
          'central_launch_registry_is_launch_index_only',
          'runtime_handle_binding_is_not_admitted_here',
          'operator_surface_does_not_grant_effect_capability',
        ],
      };
    });

  return {
    schema: 'narada.operator_surfaces.identities.v0',
    owner_site_id: deriveSiteId(normalizedSiteRoot),
    description: 'Compatibility projection for central launch registry identities.',
    projection_authority: 'central_launch_registry_projection',
    projection_source: options.launchRegistryPath ?? DEFAULT_LAUNCH_REGISTRY,
    projection_note: 'This projection lets launch coherence checks bind agent ids locally. It does not grant capability, task, mailbox, or runtime effect authority.',
    identity_law: {
      role_metadata_is_naming_authority: false,
      windows_terminal_is_naming_authority: false,
      fallback_identity_inference_allowed: false,
    },
    identities,
    sites: {
      [deriveSiteId(normalizedSiteRoot)]: {},
    },
    roles: Object.fromEntries([...new Set(identities.map((identity) => identity.role))].map((role) => [role, { label: role, affinity_color: '000000' }])),
    updated_at: options.generatedAt ?? new Date().toISOString(),
  };
}

function writeIdentityProjection(siteRoot, records, options = {}) {
  const normalizedSiteRoot = effectiveSiteRoot(normalize(siteRoot));
  const path = identityProjectionPath(normalizedSiteRoot);
  const projection = buildIdentityProjection(normalizedSiteRoot, records, options);
  mkdirSync(join(normalizedSiteRoot, 'operator-surfaces'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(projection, null, 2)}\n`, 'utf8');
  return {
    schema: 'narada.launch_identity_projection.write_result.v1',
    status: 'ok',
    site_root: normalizedSiteRoot,
    path,
    identity_count: projection.identities.length,
    mutation_performed: true,
  };
}

function auditLaunchIdentities(launchRegistryPath = DEFAULT_LAUNCH_REGISTRY) {
  const records = parseLaunchRegistry(launchRegistryPath);
  const sites = launcherKnownSites(launchRegistryPath);
  const failures = [];
  const warnings = [];
  const siteResults = sites.map((site) => {
    const normalizedSiteRoot = effectiveSiteRoot(normalize(site.site_root));
    const path = identityProjectionPath(normalizedSiteRoot);
    let identities = [];
    let status = 'missing';
    let projectionAuthority = null;
    if (existsSync(path)) {
      try {
        const projection = JSON.parse(readFileSync(path, 'utf8'));
        identities = Array.isArray(projection.identities) ? projection.identities : [];
        projectionAuthority = typeof projection.projection_authority === 'string' ? projection.projection_authority : null;
        status = 'loaded';
      } catch {
        status = 'invalid';
      }
    }
    if (projectionAuthority === 'central_launch_registry_projection') {
      warnings.push({
        code: 'identity_projection_is_launch_index_projection',
        site_root: normalizedSiteRoot,
        path,
        evidence_level: 'projection_consistency_not_independent_site_identity_authority',
      });
    }
    const activeIds = new Set(identities.filter((identity) => identity?.deprecated !== true).map((identity) => identity.identity_id));
    const activeById = new Map(identities.filter((identity) => identity?.deprecated !== true).map((identity) => [identity.identity_id, identity]));
    const siteRecords = records.filter((record) => effectiveSiteRoot(normalize(record.narada_root)) === normalizedSiteRoot);
    const missingAgents = siteRecords.map((record) => record.agent).filter((agent) => !activeIds.has(agent));
    if (status !== 'loaded') {
      failures.push({ code: 'identity_projection_missing_or_invalid', site_root: normalizedSiteRoot, path, status });
    } else if (missingAgents.length > 0) {
      failures.push({ code: 'launch_agent_missing_from_identity_projection', site_root: normalizedSiteRoot, path, missing_agents: missingAgents });
    }
    for (const record of siteRecords) {
      const launcherPath = join(record.narada_root, record.launcher ?? '');
      if (!record.launcher || !existsSync(launcherPath)) {
        failures.push({ code: 'launch_agent_launcher_missing', agent: record.agent, launcher_path: launcherPath });
      }
      const identity = activeById.get(record.agent);
      if (!identity) continue;
      const expectedRole = inferRole(record.agent);
      if (identity.role !== expectedRole) {
        failures.push({
          code: 'launch_agent_role_mismatch',
          agent: record.agent,
          expected_role: expectedRole,
          observed_role: identity.role ?? null,
          path,
        });
      }
      const expectedRuntime = record.runtime ?? 'codex';
      const projection = identity.carrier_projections?.[expectedRuntime] ?? null;
      if (!projection) {
        warnings.push({
          code: 'launch_agent_runtime_projection_missing',
          agent: record.agent,
          runtime: expectedRuntime,
          path,
          evidence_level: 'identity_id_and_role_only',
        });
      } else {
        if (projection.runtime && projection.runtime !== expectedRuntime) {
          failures.push({
            code: 'launch_agent_runtime_projection_mismatch',
            agent: record.agent,
            expected_runtime: expectedRuntime,
            observed_runtime: projection.runtime,
            path,
          });
        }
        if (projection.agent_id && projection.agent_id !== record.agent) {
          failures.push({
            code: 'launch_agent_carrier_agent_id_mismatch',
            agent: record.agent,
            observed_agent_id: projection.agent_id,
            path,
          });
        }
        if (projection.cwd && effectiveSiteRoot(normalize(projection.cwd)) !== normalizedSiteRoot) {
          failures.push({
            code: 'launch_agent_carrier_cwd_mismatch',
            agent: record.agent,
            expected_site_root: normalizedSiteRoot,
            observed_cwd: projection.cwd,
            path,
          });
        }
      }
      const expectedTitle = record.title ?? null;
      if (expectedTitle && identity.label && identity.label !== expectedTitle && identity.display_name !== expectedTitle) {
        warnings.push({
          code: 'launch_agent_title_projection_drift',
          agent: record.agent,
          expected_title: expectedTitle,
          observed_label: identity.label,
          observed_display_name: identity.display_name ?? null,
          path,
        });
      }
    }
    return {
      site_root: normalizedSiteRoot,
      path,
      status,
      launch_agent_count: siteRecords.length,
      identity_count: identities.length,
      missing_agents: missingAgents,
      projection_authority: projectionAuthority,
    };
  });
  return {
    schema: 'narada.launch_identity_projection.audit.v1',
    status: failures.length === 0 ? 'ok' : 'fail',
    launch_registry_path: launchRegistryPath,
    site_count: siteResults.length,
    sites: siteResults,
    failures,
    warnings,
    mutation_performed: false,
  };
}

function writeMissingIdentityProjections(launchRegistryPath = DEFAULT_LAUNCH_REGISTRY, options = {}) {
  const records = parseLaunchRegistry(launchRegistryPath);
  const sites = launcherKnownSites(launchRegistryPath);
  const results = [];
  for (const site of sites) {
    const normalizedSiteRoot = effectiveSiteRoot(normalize(site.site_root));
    const path = identityProjectionPath(normalizedSiteRoot);
    if (existsSync(path) && options.overwrite !== true) continue;
    results.push(writeIdentityProjection(normalizedSiteRoot, records, { ...options, launchRegistryPath }));
  }
  return {
    schema: 'narada.launch_identity_projection.batch_write_result.v1',
    status: 'ok',
    result_count: results.length,
    results,
    mutation_performed: results.length > 0,
  };
}

function deriveSiteId(siteRoot) {
  const normalized = normalize(siteRoot);
  const base = basename(normalized).toLowerCase() === '.narada'
    ? basename(normalize(join(normalized, '..')))
    : basename(normalized);
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';
}

function inferRole(agentId) {
  const suffix = agentId.split('.').pop()?.toLowerCase() ?? '';
  if (suffix === 'architect' || suffix === 'kevin') return 'architect';
  if (suffix === 'resident') return 'resident';
  return 'builder';
}

function parseArgs(argv) {
  const options = { launchRegistryPath: DEFAULT_LAUNCH_REGISTRY, pretty: false, writeMissing: false, overwrite: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--registry' && argv[i + 1]) options.launchRegistryPath = argv[++i];
    else if (argv[i] === '--write-missing') options.writeMissing = true;
    else if (argv[i] === '--overwrite') options.overwrite = true;
    else if (argv[i] === '--pretty') options.pretty = true;
    else if (argv[i] === '--help' || argv[i] === '-h') options.help = true;
  }
  return options;
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log('Usage: node tools/mcp-fabric/launch-identity-projection.mjs [--registry <agents.psd1>] [--write-missing] [--overwrite] [--pretty]');
    return 0;
  }
  const result = options.writeMissing
    ? writeMissingIdentityProjections(options.launchRegistryPath, options)
    : auditLaunchIdentities(options.launchRegistryPath);
  console.log(JSON.stringify(result, null, options.pretty ? 2 : 0));
  return result.status === 'ok' ? 0 : 1;
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

export {
  auditLaunchIdentities,
  buildIdentityProjection,
  deriveSiteId,
  identityProjectionPath,
  inferRole,
  writeIdentityProjection,
  writeMissingIdentityProjections,
};

if (isEntrypoint) {
  process.exitCode = runCli();
}
