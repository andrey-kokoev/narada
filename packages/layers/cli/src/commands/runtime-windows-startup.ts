import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';

export type WindowsStartupRuntimeMode = 'separate-client-runtime' | 'shared-user-site-runtime';

export interface RuntimeWindowsStartupOptions {
  site?: string;
  operation?: string;
  mode?: WindowsStartupRuntimeMode;
  credentialRef?: string;
  execute?: boolean;
  defer?: boolean;
  by?: string;
  format?: string;
}

export interface RuntimeWindowsStartupStatusOptions {
  site?: string;
  operation?: string;
  format?: string;
}

function requireOption(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
}

function readSiteId(siteRoot: string): string {
  const configPath = join(siteRoot, 'config.json');
  if (!existsSync(configPath)) return safeId(siteRoot.split(/[\\/]/).filter(Boolean).pop() ?? 'site');
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as { site_id?: unknown };
    return typeof parsed.site_id === 'string' && parsed.site_id.trim()
      ? parsed.site_id.trim()
      : safeId(siteRoot.split(/[\\/]/).filter(Boolean).pop() ?? 'site');
  } catch {
    return safeId(siteRoot.split(/[\\/]/).filter(Boolean).pop() ?? 'site');
  }
}

function deferredPlanPath(siteRoot: string, operation: string): string {
  return join(siteRoot, '.ai', 'runtime', 'windows-startup-deferred', `${safeId(operation)}.json`);
}

function runtimePaths(siteRoot: string, operation: string): { log: string; pid: string; health: string } {
  const root = join(siteRoot, '.ai', 'runtime');
  const op = safeId(operation);
  return {
    log: join(root, 'logs', `${op}.log`),
    pid: join(root, 'pids', `${op}.pid`),
    health: join(root, 'health', `${op}.json`),
  };
}

function processAlive(pidPath: string): boolean | null {
  if (!existsSync(pidPath)) return null;
  const pid = Number(readFileSync(pidPath, 'utf8').trim());
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function buildWindowsStartupPlan(options: Required<Pick<RuntimeWindowsStartupOptions, 'site' | 'operation' | 'mode'>> & Pick<RuntimeWindowsStartupOptions, 'credentialRef' | 'by'>): Record<string, unknown> {
  const siteRoot = resolve(options.site);
  const operation = options.operation;
  const siteId = readSiteId(siteRoot);
  const taskName = `Narada-${safeId(siteId)}-${safeId(operation)}`;
  const paths = runtimePaths(siteRoot, operation);
  const commandLine = [
    'pwsh',
    '-NoProfile',
    '-ExecutionPolicy Bypass',
    '-Command',
    `"Set-Location ${JSON.stringify(siteRoot)}; narada cycle --site-root ${JSON.stringify(siteRoot)} --site ${JSON.stringify(operation)}"`,
  ].join(' ');
  return {
    plan_kind: 'windows_startup_runtime',
    authority_locus: {
      site_root: siteRoot,
      site_id: siteId,
      operation,
    },
    runtime_mode: options.mode,
    runtime_mode_meaning: options.mode === 'separate-client-runtime'
      ? 'Install a startup entry dedicated to this client Site operation.'
      : 'Use or declare a shared User Site runtime; do not create a separate client startup entry.',
    windows_startup_substrate: {
      kind: 'task_scheduler',
      task_name: taskName,
      startup_trigger: 'AtLogon',
      run_level: 'least_privilege',
    },
    command_line: commandLine,
    environment_credential_posture: {
      raw_secrets_in_task: false,
      credential_ref: options.credentialRef ?? null,
      canonical_binding_command: 'narada capability bind-credential --kind graph.client_credentials --credential-ref <ref> --allow graph.token.request --local-env <VAR> --by <principal>',
    },
    paths,
    read_back_checks: [
      'windows_task_exists',
      'task_command_targets_site_root',
      'task_command_targets_operation',
      'task_has_no_raw_secret_arguments',
      'health_file_matches_site_and_operation',
    ],
    status_command: `narada runtime windows-startup status --site ${JSON.stringify(siteRoot)} --operation ${JSON.stringify(operation)} --format json`,
    uninstall_command: `schtasks /Delete /TN ${JSON.stringify(taskName)} /F`,
    disable_command: `schtasks /Change /TN ${JSON.stringify(taskName)} /DISABLE`,
    deferred_record_path: deferredPlanPath(siteRoot, operation),
    recorded_by: options.by ?? null,
  };
}

async function writeDeferredPlan(siteRoot: string, operation: string, plan: Record<string, unknown>): Promise<Record<string, unknown>> {
  const path = deferredPlanPath(siteRoot, operation);
  await mkdir(dirname(path), { recursive: true });
  const record = {
    status: 'deferred',
    deferred_at: new Date().toISOString(),
    plan,
  };
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  await rename(tempPath, path);
  return { path, record };
}

export async function runtimeInstallWindowsStartupCommand(
  options: RuntimeWindowsStartupOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const site = requireOption(options.site, '--site');
  const operation = requireOption(options.operation, '--operation');
  const mode = (options.mode ?? 'separate-client-runtime') as WindowsStartupRuntimeMode;
  if (!['separate-client-runtime', 'shared-user-site-runtime'].includes(mode)) {
    return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: `Unsupported mode: ${mode}` } };
  }
  const plan = buildWindowsStartupPlan({ site, operation, mode, credentialRef: options.credentialRef, by: options.by });
  if (options.execute) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        reason: 'execution_deferred',
        mutation_performed: false,
        plan,
        unblock_command: 'Run this command from the Windows runtime locus after Operator approval; WSL dry-run does not mutate Task Scheduler.',
      },
    };
  }
  if (options.defer) {
    const deferred = await writeDeferredPlan(resolve(site), operation, plan);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'deferred',
        mutation_performed: true,
        plan,
        deferred,
        read_back: {
          status: 'confirmed',
          deferred_record_path: deferred.path,
          operation,
        },
      },
    };
  }
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'dry_run',
      mutation_performed: false,
      plan,
    },
  };
}

export async function runtimeWindowsStartupStatusCommand(
  options: RuntimeWindowsStartupStatusOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const site = requireOption(options.site, '--site');
  const operation = requireOption(options.operation, '--operation');
  const siteRoot = resolve(site);
  const deferredPath = deferredPlanPath(siteRoot, operation);
  const paths = runtimePaths(siteRoot, operation);
  const deferred = existsSync(deferredPath)
    ? JSON.parse(await readFile(deferredPath, 'utf8')) as Record<string, unknown>
    : null;
  const health = existsSync(paths.health)
    ? JSON.parse(await readFile(paths.health, 'utf8')) as Record<string, unknown>
    : null;
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      site_root: siteRoot,
      operation,
      expected_startup: buildWindowsStartupPlan({ site: siteRoot, operation, mode: 'separate-client-runtime' }),
      installed_startup_entry: {
        status: 'unknown_from_non_windows_locus',
        substrate: 'windows_task_scheduler',
        read_back_command: 'schtasks /Query /TN <task-name> /FO JSON',
      },
      deferred_posture: deferred ? { status: 'recorded', record: deferred } : { status: 'not_recorded' },
      process_health: {
        pid_path: paths.pid,
        health_path: paths.health,
        pid_alive: processAlive(paths.pid),
        health,
      },
      reconciliation: {
        expected_site_operation_known: true,
        startup_entry_read_back: false,
        process_reality_known: processAlive(paths.pid) !== null || health !== null,
      },
    },
  };
}
