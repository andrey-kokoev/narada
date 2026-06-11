#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const DEFAULT_TASK_NAME = '\\Narada\\CloudflareProviderLivenessRefresh';
const DEFAULT_INTERVAL_MINUTES = 2;
const DEFAULT_HIDDEN_WRAPPER_RELATIVE_PATH = '.narada/site-continuity/cloudflare-provider-liveness-refresh.hidden.vbs';

export function buildProviderLivenessSchedulerPlan({
  action = 'status',
  repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),
  taskName = DEFAULT_TASK_NAME,
  intervalMinutes = DEFAULT_INTERVAL_MINUTES,
  refreshEntrypoint = 'packages/cloudflare-carrier/scripts/cloudflare-carrier-provider-liveness-refresh.mjs',
  scheduledTaskEntrypoint = 'packages/cloudflare-carrier/scripts/cloudflare-carrier-provider-liveness-scheduled-task.mjs',
  localRoot = null,
  nodeCommand = process.env.NARADA_NODE_COMMAND ?? 'node',
  hiddenWrapperPath = null,
  dryRun = true,
} = {}) {
  const root = resolve(repoRoot);
  const refreshEntryPoint = resolve(root, refreshEntrypoint);
  const taskEntryPoint = resolve(root, scheduledTaskEntrypoint);
  const effectiveLocalRoot = resolvePath(root, localRoot ?? root);
  const interval = normalizeIntervalMinutes(intervalMinutes);
  const directTaskCommand = buildTaskCommand({ nodeCommand, entrypoint: taskEntryPoint, localRoot: effectiveLocalRoot });
  const wrapperPath = resolvePath(root, hiddenWrapperPath ?? DEFAULT_HIDDEN_WRAPPER_RELATIVE_PATH);
  const hiddenWrapperContent = buildHiddenVbsWrapperContent(directTaskCommand);
  const taskCommand = buildHiddenTaskCommand({ wrapperPath });
  const status = readLocalSchedulerStatus({ root, refreshEntryPoint, taskEntryPoint, localRoot: effectiveLocalRoot });

  const base = {
    schema: 'narada.cloudflare_carrier.provider_liveness_scheduler_plan.v1',
    action,
    dry_run: dryRun,
    task_name: taskName,
    interval_minutes: interval,
    node_command: nodeCommand,
    repo_root: root,
    refresh_entrypoint: refreshEntryPoint,
    scheduled_task_entrypoint: taskEntryPoint,
    local_root: effectiveLocalRoot,
    hidden_wrapper_path: wrapperPath,
    hidden_wrapper_kind: 'windows_wscript_vbs_hidden',
    hidden_wrapper_content: hiddenWrapperContent,
    credential_posture: 'external_env_file_or_process_environment_only',
    embeds_credentials: false,
    cloudflare_mutation: 'provider_liveness_heartbeat_only',
    filesystem_mutation_admission: action === 'install' && !dryRun ? 'hidden_wrapper_file_write_admitted' : 'not_admitted',
    repository_publication_admission: 'not_admitted',
    task_command: taskCommand,
    direct_task_command: directTaskCommand,
    status,
  };

  switch (action) {
    case 'install':
      if (!dryRun) writeHiddenWrapper({ wrapperPath, content: hiddenWrapperContent });
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
    default:
      throw new Error(`unknown_provider_liveness_scheduler_action:${action}`);
  }
}

export function readLocalSchedulerStatus({ root, refreshEntryPoint, taskEntryPoint, localRoot }) {
  const envPath = resolve(root, '.env');
  const envKeys = existsSync(envPath) ? readEnvKeys(envPath) : [];
  return {
    state: 'not_queried',
    task_scheduler_query_required: true,
    repo_root_exists: existsSync(root),
    refresh_entrypoint_exists: existsSync(refreshEntryPoint),
    scheduled_task_entrypoint_exists: existsSync(taskEntryPoint),
    local_root_exists: existsSync(localRoot),
    env_file_present: existsSync(envPath),
    required_env_keys_observed: [
      'CLOUDFLARE_CARRIER_URL',
      envKeys.includes('CLOUDFLARE_CARRIER_TOKEN_FILE') ? 'CLOUDFLARE_CARRIER_TOKEN_FILE' : envKeys.includes('CLOUDFLARE_CARRIER_TOKEN') ? 'CLOUDFLARE_CARRIER_TOKEN' : null,
    ].filter(Boolean),
    embeds_credentials: false,
  };
}

function buildTaskCommand({ nodeCommand, entrypoint, localRoot }) {
  return [
    quote(nodeCommand),
    quote(entrypoint),
    '--local-root', quote(localRoot),
  ].join(' ');
}

function buildHiddenTaskCommand({ wrapperPath }) {
  return [
    'wscript.exe',
    '//B',
    quote(wrapperPath),
  ].join(' ');
}

export function buildHiddenVbsWrapperContent(command) {
  return [
    'Set shell = CreateObject("WScript.Shell")',
    `shell.Run ${vbsString(command)}, 0, False`,
    '',
  ].join('\r\n');
}

function writeHiddenWrapper({ wrapperPath, content }) {
  mkdirSync(dirname(wrapperPath), { recursive: true });
  writeFileSync(wrapperPath, content, 'utf8');
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

function vbsString(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
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
    else if (arg === '--refresh-entrypoint') args.refreshEntrypoint = argv[++index];
    else if (arg === '--scheduled-task-entrypoint') args.scheduledTaskEntrypoint = argv[++index];
    else if (arg === '--local-root') args.localRoot = argv[++index];
    else if (arg === '--node-command') args.nodeCommand = argv[++index];
    else if (arg === '--hidden-wrapper-path') args.hiddenWrapperPath = argv[++index];
    else throw new Error(`unknown_argument:${arg}`);
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan = buildProviderLivenessSchedulerPlan(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(plan, null, 2));
}
