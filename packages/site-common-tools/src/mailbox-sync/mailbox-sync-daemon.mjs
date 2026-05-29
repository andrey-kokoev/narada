#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMailboxSync } from './graph-sync.mjs';

const DEFAULT_SCOPE_CONFIG = 'config/mailbox-scopes/user-site-mailbox.scopes.json';
const DEFAULT_SCOPE_ID = 'andrey-kokoev-exchange-correspondence';

export function parseDaemonArgs(argv) {
  const args = {
    mode: 'dry-run',
    provider: 'graph-powershell',
    scopeConfig: DEFAULT_SCOPE_CONFIG,
    scopeId: DEFAULT_SCOPE_ID,
    limit: 25,
    readSideOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.mode = 'dry-run';
    else if (arg === '--live') args.mode = 'live';
    else if (arg === '--provider') args.provider = argv[++index];
    else if (arg === '--fixture') args.fixturePath = argv[++index];
    else if (arg === '--scope-config') args.scopeConfig = argv[++index];
    else if (arg === '--scope-id') args.scopeId = argv[++index];
    else if (arg === '--runtime-root') args.runtimeRoot = argv[++index];
    else if (arg === '--limit') args.limit = Number(argv[++index]);
    else if (arg === '--mailbox') args.mailboxId = argv[++index];
    else if (arg === '--rebuild') args.rebuild = true;
    else if (arg === '--read-side-only') args.readSideOnly = true;
    else if (arg === '--help') args.help = true;
    else throw new Error(`unknown_argument:${arg}`);
  }
  return args;
}

export function usage() {
  return [
    'Usage: node tools/mailbox-sync/mailbox-sync-daemon.mjs --scope-config <path> --scope-id <id> --runtime-root <path> --read-side-only [--dry-run|--live]',
    '',
    'Runs the bounded Microsoft Graph read-side mailbox sync and writes scheduler status evidence under runtime/.',
  ].join('\n');
}

export function runMailboxSyncDaemon(options = {}) {
  if (options.readSideOnly !== true) throw new Error('read_side_only_required');
  const runtimeRoot = resolve(options.runtimeRoot ?? `runtime/mailboxes/${options.scopeId ?? DEFAULT_SCOPE_ID}`);
  const statusPath = resolve(runtimeRoot, 'scheduler-status.json');
  const startedAt = new Date().toISOString();
  try {
    const report = runMailboxSync({
      mode: options.mode ?? 'dry-run',
      provider: options.provider ?? 'graph-powershell',
      fixturePath: options.fixturePath,
      scopePath: options.scopeConfig ?? DEFAULT_SCOPE_CONFIG,
      scopeId: options.scopeId ?? DEFAULT_SCOPE_ID,
      runtimeRoot,
      limit: options.limit,
      mailboxId: options.mailboxId,
      rebuild: options.rebuild,
    });
    const status = {
      schema: 'narada.user_site.mailbox_scheduler_status.v0',
      state: options.mode === 'live' ? 'last_success' : 'not_installed',
      live_daemon_status: options.mode === 'live' ? 'live_daemon_admitted' : 'live_daemon_blocked',
      reason: options.mode === 'live' ? null : 'dry_run_only_no_scheduler_install_or_live_daemon_admission',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      scope_id: report.scope_id,
      provider: report.provider,
      bounded_limit: report.bounded_limit,
      counts: report.counts,
      mailbox_mutation: false,
      embeds_credentials: false,
      report,
    };
    writeSchedulerStatus(statusPath, status);
    return { schema: 'narada.user_site.mailbox_sync_daemon.result.v0', status: 'ok', scheduler_status_path: statusPath, scheduler_status: status };
  } catch (error) {
    const status = {
      schema: 'narada.user_site.mailbox_scheduler_status.v0',
      state: 'last_failure',
      live_daemon_status: 'live_daemon_blocked',
      reason: error instanceof Error ? error.message : String(error),
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      scope_id: options.scopeId ?? DEFAULT_SCOPE_ID,
      provider: options.provider ?? 'graph-powershell',
      mailbox_mutation: false,
      embeds_credentials: false,
    };
    writeSchedulerStatus(statusPath, status);
    return { schema: 'narada.user_site.mailbox_sync_daemon.result.v0', status: 'blocked', scheduler_status_path: statusPath, scheduler_status: status };
  }
}

function writeSchedulerStatus(path, status) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseDaemonArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  const result = runMailboxSyncDaemon(args);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'ok' ? 0 : 1);
}
