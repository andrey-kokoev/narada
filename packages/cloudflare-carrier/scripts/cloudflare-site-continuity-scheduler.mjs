#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

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
  nodeCommand = process.env.NARADA_NODE_COMMAND ?? 'node',
  dryRun = true,
} = {}) {
  const root = resolve(repoRoot);
  const syncEntryPoint = resolve(root, syncEntrypoint);
  const taskEntryPoint = resolve(root, scheduledTaskEntrypoint);
  const effectiveLocalRoot = resolvePath(root, localRoot ?? root);
  const effectivePacketPath = packetPath ? resolvePath(effectiveLocalRoot, packetPath) : null;
  const effectiveOutputPath = outputPath ? resolvePath(effectiveLocalRoot, outputPath) : null;
  const interval = normalizeIntervalMinutes(intervalMinutes);
  const status = readLocalSchedulerStatus({
    root,
    syncEntryPoint,
    taskEntryPoint,
    localRoot: effectiveLocalRoot,
    packetPath: effectivePacketPath,
    outputPath: effectiveOutputPath,
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
    default:
      throw new Error(`unknown_site_continuity_scheduler_action:${action}`);
  }
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

export function readLocalSchedulerStatus({ root, syncEntryPoint, taskEntryPoint, localRoot, packetPath, outputPath }) {
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
    site_configured: Boolean(process.env.CLOUDFLARE_CARRIER_SITE_ID || process.env.NARADA_SITE_CONTINUITY_SITE_ID),
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

function normalizeIntervalMinutes(value) {
  const parsed = Number.parseInt(value ?? DEFAULT_INTERVAL_MINUTES, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_INTERVAL_MINUTES;
  return Math.min(parsed, 60);
}

function resolvePath(root, value) {
  return isAbsolute(value) ? value : resolve(root, value);
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
    else if (arg === '--node-command') args.nodeCommand = argv[++index];
    else throw new Error(`unknown_argument:${arg}`);
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan = buildSiteContinuitySchedulerPlan(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(plan, null, 2));
}
