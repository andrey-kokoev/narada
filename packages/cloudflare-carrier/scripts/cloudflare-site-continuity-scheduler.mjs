#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readCloudflareSiteRegistryLocalProjection } from '@narada2/cloudflare-site-registry';
import {
  materializeCloudflareSiteRegistryProjection,
  resolveCloudflareSiteRegistryProjectionInputs,
} from './cloudflare-carrier-site-registry-projection.mjs';

const DEFAULT_TASK_NAME = 'Narada Cloudflare Site Continuity Sync';
const DEFAULT_INTERVAL_MINUTES = 5;

export function buildSiteContinuitySchedulerPlan({
  action = 'status',
  repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),
  taskName = DEFAULT_TASK_NAME,
  intervalMinutes = DEFAULT_INTERVAL_MINUTES,
  syncEntrypoint = 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs',
  scheduledTaskEntrypoint = 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-scheduled-task.mjs',
  localRoot = null,
  siteId = process.env.CLOUDFLARE_CARRIER_SITE_ID ?? process.env.NARADA_SITE_CONTINUITY_SITE_ID ?? null,
  packetPath = process.env.NARADA_SITE_CONTINUITY_PACKET ?? null,
  outputPath = process.env.NARADA_SITE_CONTINUITY_SYNC_OUT ?? '.narada/site-continuity/cloudflare-sync-last.json',
  artifactDirectory = process.env.NARADA_SITE_CONTINUITY_ARTIFACT_DIR ?? null,
  configuredSites = process.env.NARADA_SITE_CONTINUITY_SITES ?? null,
  sitesFilePath = process.env.NARADA_SITE_CONTINUITY_SITES_FILE ?? null,
  siteRegistryProjectionPath = process.env.NARADA_CLOUDFLARE_SITE_REGISTRY_PROJECTION ?? '.narada/site-registry/cloudflare-sites.json',
  nodeCommand = process.env.NARADA_NODE_COMMAND ?? 'node',
  dryRun = true,
} = {}) {
  const root = resolve(repoRoot);
  const syncEntryPoint = resolve(root, syncEntrypoint);
  const taskEntryPoint = resolve(root, scheduledTaskEntrypoint);
  const effectiveLocalRoot = resolvePath(root, localRoot ?? root);
  const effectivePacketPath = packetPath ? resolvePath(effectiveLocalRoot, packetPath) : null;
  const effectiveOutputPath = outputPath ? resolvePath(effectiveLocalRoot, outputPath) : null;
  const effectiveArtifactDirectory = artifactDirectory ? resolvePath(effectiveLocalRoot, artifactDirectory) : effectiveOutputPath ? dirname(effectiveOutputPath) : null;
  const effectiveSitesFilePath = sitesFilePath ? resolvePath(effectiveLocalRoot, sitesFilePath) : null;
  const effectiveSiteRegistryProjectionPath = siteRegistryProjectionPath ? resolvePath(effectiveLocalRoot, siteRegistryProjectionPath) : null;
  const localConfiguredSites = readLocalConfiguredSites({
    root,
    explicitSites: configuredSites,
    sitesFilePath: effectiveSitesFilePath,
    siteRegistryProjectionPath: effectiveSiteRegistryProjectionPath,
  });
  const interval = normalizeIntervalMinutes(intervalMinutes);
  const status = readLocalSchedulerStatus({
    root,
    syncEntryPoint,
    taskEntryPoint,
    localRoot: effectiveLocalRoot,
    packetPath: effectivePacketPath,
    outputPath: effectiveOutputPath,
    configuredSites: localConfiguredSites,
  });
  const taskCommand = buildTaskCommand({
    nodeCommand,
    entrypoint: taskEntryPoint,
    siteId,
    packetPath: effectivePacketPath,
    outputPath: effectiveOutputPath,
  });

  const base = {
    schema: 'narada.cloudflare_carrier.site_continuity_scheduler_plan.v1',
    action,
    dry_run: dryRun,
    task_name: taskName,
    interval_minutes: interval,
    node_command: nodeCommand,
    repo_root: root,
    sync_entrypoint: syncEntryPoint,
    scheduled_task_entrypoint: taskEntryPoint,
    local_root: effectiveLocalRoot,
    site_id: siteId ?? null,
    packet_path: effectivePacketPath,
    output_path: effectiveOutputPath,
    artifact_directory: effectiveArtifactDirectory,
    sites_file_path: effectiveSitesFilePath,
    site_registry_projection_path: effectiveSiteRegistryProjectionPath,
    configured_sites: localConfiguredSites,
    credential_posture: 'external_env_file_or_process_environment_only',
    embeds_credentials: false,
    cloudflare_mutation: 'site_continuity_packet_and_loop_report_only',
    filesystem_mutation_admission: 'local_sync_report_artifact_write_only',
    repository_publication_admission: 'not_admitted',
    task_command: taskCommand,
    status,
  };

  switch (action) {
    case 'install':
      return {
        ...base,
        plan_status: dryRun ? 'dry_run_install_plan' : 'live_install_requires_operator_execution',
        scheduled_task_command: [
          'schtasks',
          '/Create',
          '/TN', taskName,
          '/SC', 'MINUTE',
          '/MO', String(interval),
          '/TR', taskCommand,
          '/F',
        ],
      };
    case 'disable':
    case 'pause':
      return {
        ...base,
        plan_status: dryRun ? 'dry_run_disable_plan' : 'live_disable_requires_operator_execution',
        scheduled_task_command: ['schtasks', '/Change', '/TN', taskName, '/DISABLE'],
      };
    case 'resume':
      return {
        ...base,
        plan_status: dryRun ? 'dry_run_resume_plan' : 'live_resume_requires_operator_execution',
        scheduled_task_command: ['schtasks', '/Change', '/TN', taskName, '/ENABLE'],
      };
    case 'uninstall':
      return {
        ...base,
        plan_status: dryRun ? 'dry_run_uninstall_plan' : 'live_uninstall_requires_operator_execution',
        scheduled_task_command: ['schtasks', '/Delete', '/TN', taskName, '/F'],
      };
    case 'status':
      return {
        ...base,
        plan_status: 'status_only_no_cloudflare_access',
        scheduled_task_command: ['schtasks', '/Query', '/TN', taskName, '/FO', 'LIST'],
      };
    case 'read-last':
    case 'last':
      return {
        ...base,
        plan_status: 'last_sync_artifact_read_only_no_cloudflare_access',
        scheduled_task_command: ['schtasks', '/Query', '/TN', taskName, '/FO', 'LIST'],
        last_sync: readLastSyncArtifact(effectiveOutputPath),
      };
    case 'status-all':
    case 'status-local':
      return {
        ...base,
        plan_status: 'local_sync_artifact_inventory_read_only_no_cloudflare_access',
        scheduled_task_command: ['schtasks', '/Query', '/TN', taskName, '/FO', 'LIST'],
        local_sync_artifacts: readLocalSyncArtifactInventory(effectiveArtifactDirectory, {
          lastOutputPath: effectiveOutputPath,
          configuredSites: localConfiguredSites.sites,
        }),
      };
    default:
      throw new Error(`unknown_site_continuity_scheduler_action:${action}`);
  }
}

export async function buildSiteContinuitySchedulerPlanWithOptionalRefresh(
  options = {},
  { env = process.env, materializeSiteRegistryProjection = materializeCloudflareSiteRegistryProjection } = {},
) {
  if (!options.refreshSiteRegistryProjection) return buildSiteContinuitySchedulerPlan(options);

  const root = resolve(options.repoRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../..'));
  const projectionRefresh = await refreshSiteRegistryProjection({
    ...options,
    repoRoot: root,
    env,
    materializeSiteRegistryProjection,
  });
  return {
    ...buildSiteContinuitySchedulerPlan({ ...options, repoRoot: root }),
    site_registry_projection_refresh: projectionRefresh,
  };
}

async function refreshSiteRegistryProjection({
  repoRoot,
  siteRegistryProjectionPath = process.env.NARADA_CLOUDFLARE_SITE_REGISTRY_PROJECTION ?? '.narada/site-registry/cloudflare-sites.json',
  projectionWorkerUrl = null,
  projectionToken = null,
  projectionTokenFile = null,
  envPath = null,
  env = process.env,
  materializeSiteRegistryProjection,
}) {
  try {
    const inputs = resolveCloudflareSiteRegistryProjectionInputs({
      repoRoot,
      env,
      args: {
        outputPath: siteRegistryProjectionPath,
        workerUrl: projectionWorkerUrl,
        token: projectionToken,
        tokenFile: projectionTokenFile,
        envPath,
        dryRun: false,
      },
    });
    const result = await materializeSiteRegistryProjection(inputs);
    return summarizeSiteRegistryProjectionRefresh(result);
  } catch (error) {
    return {
      schema: 'narada.cloudflare_site_registry.local_projection_refresh_summary.v1',
      status: 'failed',
      reason: error.message,
      output_path: siteRegistryProjectionPath ? resolvePath(repoRoot, siteRegistryProjectionPath) : null,
      embeds_credentials: false,
      written: false,
    };
  }
}

function summarizeSiteRegistryProjectionRefresh(result) {
  return {
    schema: 'narada.cloudflare_site_registry.local_projection_refresh_summary.v1',
    status: result?.status ?? 'failed',
    reason: result?.reason ?? null,
    http_status: result?.http_status ?? null,
    code: result?.code ?? null,
    worker_url: result?.worker_url ?? null,
    token_source: result?.token_source ?? null,
    output_path: result?.output_path ?? null,
    written: result?.written ?? false,
    embeds_credentials: false,
    site_count: result?.projection?.site_count ?? null,
    generated_at: result?.projection?.generated_at ?? null,
  };
}

export function readLocalSyncArtifactInventory(artifactDirectory, { lastOutputPath = null, configuredSites = [] } = {}) {
  const normalizedConfiguredSites = normalizeConfiguredSiteList(configuredSites);
  if (!artifactDirectory) {
    return {
      state: 'not_configured',
      artifact_directory: null,
      artifact_count: 0,
      configured_site_count: normalizedConfiguredSites.length,
      status: 'needs_configuration',
      artifacts: [],
      configured_site_sync_statuses: buildConfiguredSiteSyncStatuses(normalizedConfiguredSites, []),
    };
  }
  if (!existsSync(artifactDirectory)) {
    return {
      state: 'missing_directory',
      artifact_directory: artifactDirectory,
      artifact_count: 0,
      configured_site_count: normalizedConfiguredSites.length,
      status: normalizedConfiguredSites.length > 0 ? 'needs_attention' : 'never_synced',
      artifacts: [],
      configured_site_sync_statuses: buildConfiguredSiteSyncStatuses(normalizedConfiguredSites, []),
      last_sync: lastOutputPath ? readLastSyncArtifact(lastOutputPath) : null,
    };
  }
  const artifacts = readdirSync(artifactDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readLastSyncArtifact(join(artifactDirectory, entry.name)))
    .sort(compareArtifactSummaries);
  const configuredSiteSyncStatuses = buildConfiguredSiteSyncStatuses(normalizedConfiguredSites, artifacts);
  const needsAttention = artifacts.some((artifact) => artifact.status !== 'synced')
    || configuredSiteSyncStatuses.some((site) => site.status !== 'synced');
  const lastSync = lastOutputPath ? readLastSyncArtifact(lastOutputPath) : null;
  return {
    state: 'read',
    artifact_directory: artifactDirectory,
    artifact_count: artifacts.length,
    configured_site_count: normalizedConfiguredSites.length,
    status: artifacts.length === 0 && normalizedConfiguredSites.length === 0 ? 'never_synced' : needsAttention ? 'needs_attention' : 'synced',
    last_sync: lastSync,
    artifacts,
    configured_site_sync_statuses: configuredSiteSyncStatuses,
  };
}

export function readLocalConfiguredSites({ root, explicitSites = null, sitesFilePath = null, siteRegistryProjectionPath = null } = {}) {
  const sources = [];
  const sites = [];
  const explicit = normalizeConfiguredSiteList(explicitSites);
  if (explicit.length > 0) {
    sources.push('explicit_sites');
    sites.push(...explicit);
  }
  const fileSites = readConfiguredSitesFile(sitesFilePath);
  if (fileSites.state === 'read' && fileSites.sites.length > 0) {
    sources.push('sites_file');
    sites.push(...fileSites.sites);
  }
  const siteRegistryProjection = readCloudflareSiteRegistryLocalProjection(siteRegistryProjectionPath);
  if (siteRegistryProjection.state === 'read' && siteRegistryProjection.sites.length > 0) {
    sources.push('cloudflare_site_registry_local_projection');
    sites.push(...siteRegistryProjection.sites);
  }
  const envSites = readConfiguredSitesFromEnvFile(root ? resolve(root, '.env') : null);
  if (envSites.sites.length > 0) {
    sources.push('safe_env_file_site_keys');
    sites.push(...envSites.sites);
  }
  const processSites = normalizeConfiguredSiteList([
    process.env.CLOUDFLARE_CARRIER_SITE_ID,
    process.env.NARADA_SITE_CONTINUITY_SITE_ID,
    process.env.NARADA_SITE_CONTINUITY_SITES,
  ]);
  if (processSites.length > 0) {
    sources.push('process_environment_site_keys');
    sites.push(...processSites);
  }
  const normalizedSites = normalizeConfiguredSiteList(sites);
  return {
    state: normalizedSites.length > 0 ? 'configured' : 'not_configured',
    sources,
    site_count: normalizedSites.length,
    sites: normalizedSites,
    sites_file: fileSites,
    site_registry_projection: siteRegistryProjection,
  };
}

export function readLastSyncArtifact(outputPath) {
  if (!outputPath) {
    return {
      state: 'not_configured',
      artifact_present: false,
      status: 'needs_configuration',
    };
  }
  if (!existsSync(outputPath)) {
    return {
      state: 'missing',
      artifact_path: outputPath,
      artifact_present: false,
      status: 'never_synced',
    };
  }
  const stat = statSync(outputPath);
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(outputPath, 'utf8'));
  } catch (error) {
    return {
      state: 'invalid_json',
      artifact_path: outputPath,
      artifact_present: true,
      artifact_updated_at: stat.mtime.toISOString(),
      status: 'needs_attention',
      reason: 'last_sync_artifact_json_invalid',
      error: error.message,
    };
  }
  const loopReport = artifact?.continuity_loop_report ?? null;
  const cloudflarePush = loopReport?.cloudflare_push ?? null;
  const status = artifact?.status === 'ok' && loopReport?.status === 'ok' ? 'synced' : 'needs_attention';
  return {
    state: 'read',
    artifact_path: outputPath,
    artifact_present: true,
    artifact_updated_at: stat.mtime.toISOString(),
    status,
    schema: artifact?.schema ?? null,
    site_id: artifact?.site_id ?? loopReport?.site_id ?? null,
    worker_url: artifact?.worker_url ?? loopReport?.cloudflare_worker_url ?? null,
    generated_at: loopReport?.generated_at ?? null,
    pushed_packet_id: artifact?.pushed_packet_id ?? cloudflarePush?.pushed_packet_id ?? null,
    pulled_packet_id: artifact?.pulled_packet_id ?? cloudflarePush?.returned_packet_id ?? null,
    cloudflare_push_status: cloudflarePush?.status ?? null,
    cloudflare_push_durability_action: cloudflarePush?.durability_action ?? null,
    cloudflare_push_imported_at: cloudflarePush?.imported_at ?? null,
    cloudflare_push_previous_imported_at: cloudflarePush?.previous_imported_at ?? null,
    continuity_loop_report_recorded: artifact?.continuity_loop_report_recorded ?? null,
  };
}

export function readLocalSchedulerStatus({ root, syncEntryPoint, taskEntryPoint, localRoot, packetPath, outputPath, configuredSites = null }) {
  const envPath = resolve(root, '.env');
  const envKeys = existsSync(envPath) ? readEnvKeys(envPath) : [];
  return {
    state: 'not_queried',
    task_scheduler_query_required: true,
    repo_root_exists: existsSync(root),
    sync_entrypoint_exists: existsSync(syncEntryPoint),
    scheduled_task_entrypoint_exists: existsSync(taskEntryPoint),
    local_root_exists: existsSync(localRoot),
    packet_path_exists: packetPath ? existsSync(packetPath) : false,
    output_path_parent_exists: outputPath ? existsSync(dirname(outputPath)) : false,
    env_file_present: existsSync(envPath),
    required_env_keys_observed: [
      'CLOUDFLARE_CARRIER_URL',
      envKeys.includes('CLOUDFLARE_CARRIER_TOKEN_FILE') ? 'CLOUDFLARE_CARRIER_TOKEN_FILE' : envKeys.includes('CLOUDFLARE_CARRIER_TOKEN') ? 'CLOUDFLARE_CARRIER_TOKEN' : null,
    ].filter(Boolean),
    site_configured: Boolean(process.env.CLOUDFLARE_CARRIER_SITE_ID || process.env.NARADA_SITE_CONTINUITY_SITE_ID || configuredSites?.site_count > 0),
    packet_configured: Boolean(process.env.NARADA_SITE_CONTINUITY_PACKET || packetPath),
    command_args_complete: Boolean(packetPath && outputPath),
    embeds_credentials: false,
  };
}

function buildTaskCommand({ nodeCommand, entrypoint, siteId, packetPath, outputPath }) {
  const parts = [quote(nodeCommand), quote(entrypoint)];
  if (siteId) parts.push('--site', quote(siteId));
  if (packetPath) parts.push('--packet', quote(packetPath));
  if (outputPath) parts.push('--out', quote(outputPath));
  return parts.join(' ');
}

function readEnvKeys(envPath) {
  const keys = [];
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) keys.push(trimmed.slice(0, eq).trim());
  }
  return keys;
}

function readConfiguredSitesFromEnvFile(envPath) {
  if (!envPath || !existsSync(envPath)) return { state: 'missing', sites: [] };
  const values = [];
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!['CLOUDFLARE_CARRIER_SITE_ID', 'NARADA_SITE_CONTINUITY_SITE_ID', 'NARADA_SITE_CONTINUITY_SITES'].includes(key)) continue;
    values.push(stripEnvValueQuotes(trimmed.slice(eq + 1).trim()));
  }
  return { state: 'read', sites: normalizeConfiguredSiteList(values) };
}

function readConfiguredSitesFile(sitesFilePath) {
  if (!sitesFilePath) return { state: 'not_configured', path: null, sites: [] };
  if (!existsSync(sitesFilePath)) return { state: 'missing', path: sitesFilePath, sites: [] };
  let value;
  try {
    value = JSON.parse(readFileSync(sitesFilePath, 'utf8'));
  } catch (error) {
    return { state: 'invalid_json', path: sitesFilePath, sites: [], reason: 'configured_sites_file_json_invalid', error: error.message };
  }
  const sourceSites = Array.isArray(value) ? value : value?.sites ?? value?.configured_sites ?? [];
  return { state: 'read', path: sitesFilePath, sites: normalizeConfiguredSiteList(sourceSites) };
}

function normalizeConfiguredSiteList(value) {
  const values = Array.isArray(value) ? value : [value];
  const sites = [];
  for (const item of values) {
    if (!item) continue;
    if (typeof item === 'string') {
      sites.push(...item.split(',').map((part) => part.trim()).filter(Boolean));
    } else if (typeof item === 'object') {
      const siteId = item.site_id ?? item.siteId ?? item.id ?? null;
      if (siteId) sites.push(String(siteId).trim());
    }
  }
  return [...new Set(sites.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function buildConfiguredSiteSyncStatuses(configuredSites, artifacts) {
  const artifactBySite = new Map();
  for (const artifact of artifacts) {
    if (!artifact?.site_id) continue;
    const existing = artifactBySite.get(artifact.site_id);
    if (!existing || String(artifact.artifact_updated_at ?? '') > String(existing.artifact_updated_at ?? '')) {
      artifactBySite.set(artifact.site_id, artifact);
    }
  }
  return configuredSites.map((siteId) => {
    const artifact = artifactBySite.get(siteId) ?? null;
    if (!artifact) {
      return {
        site_id: siteId,
        status: 'needs_attention',
        reason: 'configured_site_sync_artifact_missing',
        artifact_present: false,
      };
    }
    return {
      site_id: siteId,
      status: artifact.status,
      reason: artifact.status === 'synced' ? 'matching_sync_artifact_synced' : 'matching_sync_artifact_needs_attention',
      artifact_present: true,
      artifact_path: artifact.artifact_path,
      artifact_updated_at: artifact.artifact_updated_at,
      pushed_packet_id: artifact.pushed_packet_id,
      pulled_packet_id: artifact.pulled_packet_id,
    };
  });
}

function stripEnvValueQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function normalizeIntervalMinutes(value) {
  const parsed = Number.parseInt(value ?? DEFAULT_INTERVAL_MINUTES, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_INTERVAL_MINUTES;
  return Math.min(parsed, 60);
}

function resolvePath(root, value) {
  return isAbsolute(value) ? value : resolve(root, value);
}

function compareArtifactSummaries(left, right) {
  const leftSite = left.site_id ?? '';
  const rightSite = right.site_id ?? '';
  if (leftSite !== rightSite) return leftSite.localeCompare(rightSite);
  return String(left.artifact_path ?? '').localeCompare(String(right.artifact_path ?? ''));
}

function quote(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

function parseArgs(argv) {
  const args = { action: 'status', dryRun: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--live') args.dryRun = false;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--action') args.action = argv[++index];
    else if (arg === '--repo-root') args.repoRoot = argv[++index];
    else if (arg === '--task-name') args.taskName = argv[++index];
    else if (arg === '--interval-minutes') args.intervalMinutes = argv[++index];
    else if (arg === '--sync-entrypoint') args.syncEntrypoint = argv[++index];
    else if (arg === '--scheduled-task-entrypoint') args.scheduledTaskEntrypoint = argv[++index];
    else if (arg === '--local-root') args.localRoot = argv[++index];
    else if (arg === '--site') args.siteId = argv[++index];
    else if (arg === '--packet') args.packetPath = argv[++index];
    else if (arg === '--out') args.outputPath = argv[++index];
    else if (arg === '--artifact-dir') args.artifactDirectory = argv[++index];
    else if (arg === '--sites') args.configuredSites = argv[++index];
    else if (arg === '--sites-file') args.sitesFilePath = argv[++index];
    else if (arg === '--site-registry-projection') args.siteRegistryProjectionPath = argv[++index];
    else if (arg === '--refresh-site-registry-projection') args.refreshSiteRegistryProjection = true;
    else if (arg === '--projection-url') args.projectionWorkerUrl = argv[++index];
    else if (arg === '--projection-token') args.projectionToken = argv[++index];
    else if (arg === '--projection-token-file') args.projectionTokenFile = argv[++index];
    else if (arg === '--env') args.envPath = argv[++index];
    else if (arg === '--node-command') args.nodeCommand = argv[++index];
    else throw new Error(`unknown_argument:${arg}`);
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan = await buildSiteContinuitySchedulerPlanWithOptionalRefresh(parseArgs(process.argv.slice(2)));
  if (plan.site_registry_projection_refresh?.status && plan.site_registry_projection_refresh.status !== 'ok') process.exitCode = 1;
  console.log(JSON.stringify(plan, null, 2));
}
