#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_SCOPE_CONFIG = 'config/mailbox-scopes/user-site-mailbox.scopes.json';
const DEFAULT_SCOPE_ID = 'andrey-kokoev-exchange-correspondence';
const DEFAULT_TASK_NAME = 'Narada User Site Mailbox Sync';

export function buildSchedulerPlan({
  action,
  siteRoot = process.cwd(),
  scopeConfig = DEFAULT_SCOPE_CONFIG,
  scopeId = DEFAULT_SCOPE_ID,
  taskName = DEFAULT_TASK_NAME,
  syncEntrypoint = 'tools/mailbox-sync/mailbox-sync-daemon.mjs',
  runtimeRoot = null,
  dryRun = true,
} = {}) {
  const root = resolve(siteRoot);
  const scopes = loadScopes(root, scopeConfig);
  const scope = scopes.find((item) => item.scope_id === scopeId) ?? null;
  const effectiveRuntimeRoot = runtimeRoot ?? scope?.runtime_root ?? `runtime/mailboxes/${scopeId}`;
  const taskCommand = buildTaskCommand({ root, scopeConfig, scopeId, syncEntrypoint, runtimeRoot: effectiveRuntimeRoot });
  const status = readSchedulerStatus(root, effectiveRuntimeRoot);

  const base = {
    schema: 'narada.user_site.mailbox_scheduler_plan.v0',
    action,
    dry_run: dryRun,
    task_name: taskName,
    scope_id: scopeId,
    scope_config: scopeConfig,
    runtime_root: effectiveRuntimeRoot,
    credential_posture: 'external_graph_auth_context_only',
    embeds_credentials: false,
    mailbox_mutation: false,
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
          '/MO', '15',
          '/TR', taskCommand,
          '/F',
        ],
      };
    case 'pause':
    case 'disable':
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
        plan_status: 'status_only_no_mailbox_access',
        scheduled_task_command: ['schtasks', '/Query', '/TN', taskName, '/FO', 'JSON'],
      };
    default:
      throw new Error(`unknown_scheduler_action:${action}`);
  }
}

export function readSchedulerStatus(siteRoot, runtimeRoot) {
  const statusPath = resolve(siteRoot, runtimeRoot, 'scheduler-status.json');
  if (!existsSync(statusPath)) {
    return {
      state: 'not_installed',
      status_path: relativeStatusPath(runtimeRoot),
      last_success: null,
      last_failure: null,
      mailbox_access_required: false,
    };
  }

  const parsed = JSON.parse(readFileSync(statusPath, 'utf8'));
  return {
    state: normalizeStatusState(parsed.state),
    status_path: relativeStatusPath(runtimeRoot),
    last_success: parsed.last_success ?? null,
    last_failure: parsed.last_failure ?? null,
    mailbox_access_required: false,
  };
}

function buildTaskCommand({ root, scopeConfig, scopeId, syncEntrypoint, runtimeRoot }) {
  const node = process.execPath;
  const entrypoint = resolve(root, syncEntrypoint);
  const config = resolve(root, scopeConfig);
  const runtime = resolve(root, runtimeRoot);
  return [
    quote(node),
    quote(entrypoint),
    '--scope-config', quote(config),
    '--scope-id', quote(scopeId),
    '--runtime-root', quote(runtime),
    '--read-side-only',
  ].join(' ');
}

function loadScopes(siteRoot, scopeConfig) {
  const path = resolve(siteRoot, scopeConfig);
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return Array.isArray(parsed.scopes) ? parsed.scopes : [];
}

function normalizeStatusState(state) {
  const value = String(state ?? '').trim();
  if (['not_installed', 'installed_paused', 'installed_active', 'last_success', 'last_failure'].includes(value)) return value;
  return 'not_installed';
}

function relativeStatusPath(runtimeRoot) {
  return `${runtimeRoot.replaceAll('\\\\', '/')}/scheduler-status.json`;
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
    else if (arg === '--site-root') args.siteRoot = argv[++index];
    else if (arg === '--scope-config') args.scopeConfig = argv[++index];
    else if (arg === '--scope-id') args.scopeId = argv[++index];
    else if (arg === '--task-name') args.taskName = argv[++index];
    else if (arg === '--sync-entrypoint') args.syncEntrypoint = argv[++index];
    else if (arg === '--runtime-root') args.runtimeRoot = argv[++index];
    else throw new Error(`unknown_argument:${arg}`);
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan = buildSchedulerPlan(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(plan, null, 2));
}
