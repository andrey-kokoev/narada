import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import { access, readFile, stat } from 'node:fs/promises';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { loadConfig, isMultiMailboxConfig, loadMultiMailboxConfig, loadCharterEnv, loadEnvFile } from '@narada2/control-plane';
import { CodexCharterRunner, MockCharterRunner, KimiCliCharterRunner, getRecoveryGuidance } from '@narada2/charters';

export interface DoctorOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  staleThresholdMinutes?: number;
  site?: string;
  mode?: string;
  bootstrap?: boolean;
  cwd?: string;
}

interface DoctorCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
  remediation?: string;
}

interface ScopeDoctorResult {
  scopeId: string;
  rootDir: string;
  checks: DoctorCheck[];
  status: 'healthy' | 'degraded' | 'unknown';
}

interface DoctorReport {
  overall: 'healthy' | 'degraded' | 'unknown';
  scopes: ScopeDoctorResult[];
  summary: {
    pass: number;
    fail: number;
    warn: number;
  };
}

interface BootstrapDoctorReport {
  status: 'healthy' | 'degraded';
  checks: DoctorCheck[];
  summary: {
    pass: number;
    fail: number;
    warn: number;
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function doctorBootstrap(
  cwd: string,
  fmt: ReturnType<typeof createFormatter>,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const root = resolve(cwd);
  const checks: DoctorCheck[] = [];
  const nodeMajor = Number(process.versions.node.split('.')[0] ?? '0');

  checks.push({
    name: 'node-version',
    status: nodeMajor >= 20 ? 'pass' : 'fail',
    detail: `Node ${process.versions.node}`,
    remediation: nodeMajor >= 20 ? undefined : 'Use Node 20 or newer before installing/building Narada.',
  });

  const packageJson = join(root, 'package.json');
  checks.push({
    name: 'package-manifest',
    status: await pathExists(packageJson) ? 'pass' : 'fail',
    detail: await pathExists(packageJson) ? 'package.json exists' : 'package.json is missing',
    remediation: 'Run from the Narada repository root.',
  });

  const lockfile = join(root, 'pnpm-lock.yaml');
  checks.push({
    name: 'pnpm-lockfile',
    status: await pathExists(lockfile) ? 'pass' : 'fail',
    detail: await pathExists(lockfile) ? 'pnpm-lock.yaml exists' : 'pnpm-lock.yaml is missing',
    remediation: 'Run from a complete Narada checkout.',
  });

  const nodeModules = join(root, 'node_modules');
  checks.push({
    name: 'dependencies-installed',
    status: await pathExists(nodeModules) ? 'pass' : 'fail',
    detail: await pathExists(nodeModules) ? 'node_modules exists' : 'node_modules is missing',
    remediation: 'Run `pnpm install` from the repository root.',
  });

  const cliMain = join(root, 'packages', 'layers', 'cli', 'dist', 'main.js');
  checks.push({
    name: 'cli-built',
    status: await pathExists(cliMain) ? 'pass' : 'fail',
    detail: await pathExists(cliMain) ? 'CLI dist entry exists' : 'CLI dist entry is missing',
    remediation: 'Run `pnpm -r build` from the repository root.',
  });

  const naradaBin = join(root, 'node_modules', '.bin', 'narada');
  checks.push({
    name: 'narada-bin-linked',
    status: await pathExists(naradaBin) ? 'pass' : 'warn',
    detail: await pathExists(naradaBin) ? 'node_modules/.bin/narada exists' : 'node_modules/.bin/narada is missing',
    remediation: 'Run `pnpm install`; for shell-level access run `pnpm run narada:install-shim`.',
  });

  try {
    const requireFromRoot = createRequire(join(root, 'package.json'));
    const Database = requireFromRoot('better-sqlite3') as typeof import('better-sqlite3');
    const db = new Database(':memory:');
    db.close();
    checks.push({
      name: 'better-sqlite3-native',
      status: 'pass',
      detail: 'better-sqlite3 native binding loads',
    });
  } catch (error) {
    checks.push({
      name: 'better-sqlite3-native',
      status: 'fail',
      detail: error instanceof Error ? error.message : String(error),
      remediation: 'Run `pnpm rebuild better-sqlite3` or reinstall with native build scripts enabled.',
    });
  }

  const pass = checks.filter((check) => check.status === 'pass').length;
  const fail = checks.filter((check) => check.status === 'fail').length;
  const warn = checks.filter((check) => check.status === 'warn').length;
  const status: BootstrapDoctorReport['status'] = fail > 0 ? 'degraded' : 'healthy';
  const report: BootstrapDoctorReport = { status, checks, summary: { pass, fail, warn } };

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: status === 'healthy' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result: report,
    };
  }

  fmt.message(`Bootstrap Doctor: ${status.toUpperCase()}`, status === 'healthy' ? 'success' : 'error');
  fmt.message(`${pass} pass, ${fail} fail, ${warn} warn`, 'info');
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
    const fmtType = check.status === 'pass' ? 'success' : check.status === 'fail' ? 'error' : 'warning';
    fmt.message(`${icon} ${check.name}: ${check.detail}`, fmtType);
    if (check.remediation) fmt.message(`  → ${check.remediation}`, 'info');
  }

  return {
    exitCode: status === 'healthy' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: report,
  };
}

async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPidFile(rootDir: string): Promise<number | null> {
  const candidates = [
    join(rootDir, 'daemon.pid'),
    join(rootDir, 'narada-daemon.pid'),
    './narada-daemon.pid',
    './daemon.pid',
  ];
  for (const path of candidates) {
    try {
      const raw = await readFile(path, 'utf8');
      const pid = parseInt(raw.trim(), 10);
      if (!isNaN(pid)) return pid;
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function readHealthFile(rootDir: string, scopeId: string): Promise<{
  status: string;
  lastSyncAt?: string;
  timestamp?: string;
  readiness?: { syncFresh?: boolean };
  thresholds?: { maxStalenessMs?: number };
} | null> {
  try {
    const raw = await readFile(join(dirname(rootDir), '.health.json'), 'utf8');
    const aggregate = JSON.parse(raw) as {
      status?: string;
      timestamp?: string;
      thresholds?: { maxStalenessMs?: number };
      scopes?: Array<{
        scopeId?: string;
        readiness?: { syncFresh?: boolean };
        charterRuntimeHealth?: unknown;
      }>;
    };
    const scoped = aggregate.scopes?.find((scope) => scope.scopeId === scopeId);
    if (aggregate.timestamp || scoped?.readiness) {
      return {
        status: aggregate.status ?? 'unknown',
        lastSyncAt: aggregate.timestamp,
        timestamp: aggregate.timestamp,
        readiness: scoped?.readiness,
        thresholds: aggregate.thresholds,
      };
    }
  } catch {
    // fall back to local operation health below
  }

  try {
    const raw = await readFile(join(rootDir, '.health.json'), 'utf8');
    return JSON.parse(raw) as {
      status: string;
      lastSyncAt?: string;
      timestamp?: string;
      readiness?: { syncFresh?: boolean };
      thresholds?: { maxStalenessMs?: number };
    };
  } catch {
    return null;
  }
}

async function checkScope(
  scopeId: string,
  rootDir: string,
  staleThresholdMinutes: number,
  scopeConfig?: { charter?: { runtime?: string; api_key?: string; model?: string; base_url?: string; timeout_ms?: number; cli_path?: string; session_id?: string; continue_session?: boolean; work_dir?: string; degraded_mode?: "draft_only" | "normal" } },
  stateDir?: string,
): Promise<ScopeDoctorResult> {
  const checks: DoctorCheck[] = [];

  // 1. Daemon process
  const pid = await readPidFile(rootDir);
  if (pid !== null) {
    const running = await isProcessRunning(pid);
    checks.push({
      name: 'daemon-process',
      status: running ? 'pass' : 'fail',
      detail: running ? `Daemon running (PID ${pid})` : `Daemon PID file found but process ${pid} is not running`,
      remediation: running ? undefined : 'Start the daemon with `narada-daemon` or `pnpm daemon`',
    });
  } else {
    checks.push({
      name: 'daemon-process',
      status: 'warn',
      detail: 'No daemon PID file found',
      remediation: 'Start the daemon with `narada-daemon` or `pnpm daemon`',
    });
  }

  // 2. Health file
  const health = await readHealthFile(rootDir, scopeId);
  if (health) {
    const healthOk = health.status === 'healthy' || health.status === 'stopped';
    checks.push({
      name: 'health-file',
      status: healthOk ? 'pass' : 'fail',
      detail: `Health status: ${health.status}`,
      remediation: healthOk ? undefined : 'Check daemon logs for errors',
    });

    // 3. Sync freshness
    if (health.readiness?.syncFresh === true) {
      checks.push({
        name: 'sync-freshness',
        status: 'pass',
        detail: `Latest aggregate health reports sync fresh${health.timestamp ? ` (${health.timestamp})` : ''}`,
      });
    } else if (health.lastSyncAt) {
      const lastSync = new Date(health.lastSyncAt);
      const minsSince = (Date.now() - lastSync.getTime()) / (1000 * 60);
      const threshold =
        (health.thresholds?.maxStalenessMs ?? staleThresholdMinutes * 60 * 1000) / (60 * 1000);
      checks.push({
        name: 'sync-freshness',
        status: minsSince <= threshold ? 'pass' : 'fail',
        detail: `Last sync ${Math.round(minsSince)} minutes ago (threshold: ${Math.round(threshold)} min)`,
        remediation: minsSince <= threshold ? undefined : 'Check daemon is running and network connectivity',
      });
    } else {
      checks.push({
        name: 'sync-freshness',
        status: 'warn',
        detail: 'No last sync timestamp in health file',
        remediation: 'Wait for first sync cycle to complete',
      });
    }
  } else {
    checks.push({
      name: 'health-file',
      status: 'warn',
      detail: 'No .health.json found',
      remediation: 'Start the daemon to generate health file',
    });
    checks.push({
      name: 'sync-freshness',
      status: 'warn',
      detail: 'Cannot determine sync freshness without health file',
      remediation: 'Start the daemon to generate health file',
    });
  }

  // 4. Charter runtime health
  if (scopeConfig?.charter) {
    const runtime = scopeConfig.charter.runtime ?? 'mock';
    try {
      let runner;
      if (runtime === 'codex-api' || runtime === 'kimi-api') {
        const env = loadCharterEnv();
        const apiKey = scopeConfig.charter.api_key ?? (runtime === 'kimi-api' ? env.kimi_api_key : env.openai_api_key);
        if (!apiKey) {
          checks.push({
            name: 'charter-runtime',
            status: 'fail',
            detail: `Runtime '${runtime}' configured but no API key resolved`,
            remediation: getRecoveryGuidance('unconfigured').operator_action,
          });
        } else {
          runner = new CodexCharterRunner({ apiKey, model: scopeConfig.charter.model, baseUrl: scopeConfig.charter.base_url, timeoutMs: scopeConfig.charter.timeout_ms });
          const health = await runner.probeHealth();
          const guidance = getRecoveryGuidance(health.class);
          const checkStatus = health.class === 'healthy' ? 'pass' : health.class === 'partially_degraded' || health.class === 'degraded_draft_only' ? 'warn' : 'fail';
          checks.push({
            name: 'charter-runtime',
            status: checkStatus,
            detail: `${health.class}: ${health.details}`,
            remediation: health.class === 'healthy' ? undefined : guidance.operator_action,
          });
        }
      } else if (runtime === 'kimi-cli') {
        runner = new KimiCliCharterRunner({
          cliPath: scopeConfig.charter.cli_path,
          model: scopeConfig.charter.model,
          sessionId: scopeConfig.charter.session_id,
          continueSession: scopeConfig.charter.continue_session,
          workDir: scopeConfig.charter.work_dir,
          timeoutMs: scopeConfig.charter.timeout_ms,
          degradedMode: scopeConfig.charter.degraded_mode,
        });
        const health = await runner.probeHealth();
        const guidance = getRecoveryGuidance(health.class);
        const checkStatus = health.class === 'healthy' ? 'pass' : health.class === 'degraded_draft_only' || health.class === 'partially_degraded' ? 'warn' : 'fail';
        checks.push({
          name: 'charter-runtime',
          status: checkStatus,
          detail: `${health.class}: ${health.details}`,
          remediation: health.class === 'healthy' ? undefined : guidance.operator_action,
        });
      } else if (runtime === 'mock') {
        runner = new MockCharterRunner();
        const health = await runner.probeHealth();
        checks.push({
          name: 'charter-runtime',
          status: 'warn',
          detail: health.details,
          remediation: getRecoveryGuidance('unconfigured').operator_action,
        });
      } else {
        checks.push({
          name: 'charter-runtime',
          status: 'fail',
          detail: `Invalid charter runtime: ${runtime}`,
          remediation: "Set `charter.runtime` to 'codex-api', 'kimi-api', 'kimi-cli', or 'mock'.",
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      checks.push({
        name: 'charter-runtime',
        status: 'fail',
        detail: `Failed to probe charter runtime: ${msg}`,
        remediation: 'Check config and network connectivity.',
      });
    }
  } else {
    checks.push({
      name: 'charter-runtime',
      status: 'warn',
      detail: 'No charter runtime configured',
      remediation: getRecoveryGuidance('unconfigured').operator_action,
    });
  }

  // 5. Principal runtime health (Task 406)
  try {
    const { JsonPrincipalRuntimeRegistry } = await import('@narada2/control-plane');
    const principalStateDir = stateDir ?? rootDir;
    const principalRegistry = new JsonPrincipalRuntimeRegistry({ rootDir: principalStateDir });
    await principalRegistry.init();
    const principals = principalRegistry.list(scopeId);
    if (principals.length === 0) {
      checks.push({
        name: 'principal-runtime',
        status: 'warn',
        detail: 'No principal runtimes registered for this scope',
        remediation: 'Daemon will create a default principal on next dispatch cycle',
      });
    } else {
      const defaultPrincipal = principals.find((p) => p.principal_type === 'worker');
      if (defaultPrincipal) {
        const { canClaimWork } = await import('@narada2/control-plane');
        const canClaim = canClaimWork(defaultPrincipal.state);
        checks.push({
          name: 'principal-runtime',
          status: canClaim ? 'pass' : 'warn',
          detail: `Default principal ${defaultPrincipal.runtime_id}: ${defaultPrincipal.state}${defaultPrincipal.detail ? ` (${defaultPrincipal.detail})` : ''}`,
          remediation: canClaim ? undefined : `Principal state "${defaultPrincipal.state}" blocks work claiming. Check charter runtime health.`,
        });
      }
      const otherPrincipals = principals.filter((p) => p.principal_type !== 'worker');
      for (const p of otherPrincipals) {
        checks.push({
          name: 'principal-runtime',
          status: 'pass',
          detail: `Principal ${p.runtime_id} (${p.principal_type}): ${p.state}`,
        });
      }
    }
  } catch {
    checks.push({
      name: 'principal-runtime',
      status: 'warn',
      detail: 'Could not check principal runtime state',
    });
  }

  // 6. Failed work items (coordinator DB)
  const dbPath = join(rootDir, '.narada', 'coordinator.db');
  try {
    const dbStat = await stat(dbPath);
    if (dbStat.isFile()) {
      const { Database } = await import('@narada2/control-plane');
      const db = new Database(dbPath);
      try {
        const failedRow = db
          .prepare(
            `select
              sum(case when status = 'failed_retryable' then 1 else 0 end) as retryable,
              sum(case when status = 'failed_terminal' and coalesce(error_message, '') not like '%[acknowledged by operator]%' then 1 else 0 end) as terminal
            from work_items`,
          )
          .get() as { retryable: number; terminal: number } | undefined;
        const retryable = failedRow?.retryable ?? 0;
        const terminal = failedRow?.terminal ?? 0;
        if (retryable === 0 && terminal === 0) {
          checks.push({
            name: 'work-queue',
            status: 'pass',
            detail: 'No failed work items',
          });
        } else {
          checks.push({
            name: 'work-queue',
            status: retryable > 0 ? 'fail' : 'warn',
            detail: `${retryable} failed_retryable, ${terminal} failed_terminal work items`,
            remediation:
              retryable > 0
                ? 'Retryable failures may resolve automatically; monitor with `narada status`'
                : 'Review historical terminal failures with `narada ops`',
          });
        }
      } finally {
        db.close();
      }
    } else {
      checks.push({
        name: 'work-queue',
        status: 'warn',
        detail: 'Coordinator database not found',
        remediation: 'Run `narada sync` to initialize the operation',
      });
    }
  } catch {
    checks.push({
      name: 'work-queue',
      status: 'warn',
      detail: 'Coordinator database not found',
      remediation: 'Run `narada sync` to initialize the operation',
    });
  }

  const status: ScopeDoctorResult['status'] = checks.some((c) => c.status === 'fail')
    ? 'degraded'
    : 'healthy';

  return { scopeId, rootDir, checks, status };
}

export async function doctorCommand(
  options: DoctorOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, verbose, logger } = context;
  const fmt = createFormatter({ format: options.format, verbose });
  const staleThresholdMinutes = options.staleThresholdMinutes ?? 60;

  if (options.bootstrap) {
    return doctorBootstrap(options.cwd ?? process.cwd(), fmt);
  }

  // Site path: --site takes precedence over config
  if (options.site) {
    if (options.mode === 'system' || options.mode === 'user') {
      return doctorLinuxSite(options.site, options.mode, staleThresholdMinutes, fmt, logger);
    }

    const { isMacosSite } = await import('@narada2/macos-site');
    if (isMacosSite(options.site)) {
      return doctorMacosSite(options.site, staleThresholdMinutes, fmt, logger);
    }

    try {
      const { isLinuxSite, resolveLinuxSiteMode } = await import('@narada2/linux-site');
      const linuxMode = resolveLinuxSiteMode(options.site);
      if (linuxMode) {
        return doctorLinuxSite(options.site, linuxMode, staleThresholdMinutes, fmt, logger);
      }
    } catch {
      // Linux package not available
    }

    return doctorWindowsSite(options.site, staleThresholdMinutes, fmt, logger);
  }

  logger.info('Running doctor', { configPath, staleThresholdMinutes });
  const resolvedConfigPath = resolve(configPath);
  const configDir = dirname(resolvedConfigPath);
  loadEnvFile(join(configDir, '.env'));
  loadEnvFile(join(dirname(configDir), '.env'));

  let raw: string;
  try {
    raw = await readFile(resolvedConfigPath, 'utf8');
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: 'Failed to read config: ' + (error as Error).message,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: 'Failed to parse config: ' + (error as Error).message,
      },
    };
  }

  const scopes: ScopeDoctorResult[] = [];

  if (isMultiMailboxConfig(parsed)) {
    const { config, valid, scopes: loadedScopes } = await loadMultiMailboxConfig({ path: resolvedConfigPath });
    if (!valid) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: 'Invalid multi-mailbox configuration' },
      };
    }
    for (const mailbox of config.mailboxes) {
      const scopeCfg = loadedScopes.find((s) => s.scope_id === mailbox.mailbox_id);
      scopes.push(await checkScope(mailbox.mailbox_id, resolve(mailbox.root_dir), staleThresholdMinutes, scopeCfg, configDir));
    }
  } else {
    let config;
    try {
      config = await loadConfig({ path: resolvedConfigPath });
    } catch (error) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          error: 'Failed to load config: ' + (error as Error).message,
        },
      };
    }
    const scope = config.scopes[0];
    if (!scope) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: 'No operations configured' },
      };
    }
    scopes.push(await checkScope(scope.scope_id, resolve(scope.root_dir), staleThresholdMinutes, scope, configDir));
  }

  const pass = scopes.reduce((sum, s) => sum + s.checks.filter((c) => c.status === 'pass').length, 0);
  const fail = scopes.reduce((sum, s) => sum + s.checks.filter((c) => c.status === 'fail').length, 0);
  const warn = scopes.reduce((sum, s) => sum + s.checks.filter((c) => c.status === 'warn').length, 0);

  const overall: DoctorReport['overall'] = fail > 0 ? 'degraded' : 'healthy';

  const report: DoctorReport = {
    overall,
    scopes,
    summary: { pass, fail, warn },
  };

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: overall === 'healthy' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result: { status: overall, ...report },
    };
  }

  // Human output
  const overallIcon = overall === 'healthy' ? '✓' : '✗';
  fmt.message(`Doctor: ${overallIcon} ${overall.toUpperCase()}`, overall === 'healthy' ? 'success' : 'error');
  fmt.message(`${pass} pass, ${fail} fail, ${warn} warn`, 'info');

  for (const scope of scopes) {
    fmt.section(`Operation: ${scope.scopeId}`);
    for (const check of scope.checks) {
      const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
      const fmtType = check.status === 'pass' ? 'success' : check.status === 'fail' ? 'error' : 'warning';
      fmt.message(`${icon} ${check.name}: ${check.detail}`, fmtType);
      if (check.remediation) {
        fmt.message(`  → ${check.remediation}`, 'info');
      }
    }
  }

  return {
    exitCode: overall === 'healthy' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: { status: overall, ...report },
  };
}

async function doctorMacosSite(
  siteId: string,
  staleThresholdMinutes: number,
  fmt: ReturnType<typeof createFormatter>,
  logger: CommandContext['logger'],
): Promise<{ exitCode: ExitCode; result: unknown }> {
  logger.info('Running doctor for macOS Site', { siteId });

  const {
    resolveSiteRoot,
    getMacosSiteStatus,
  } = await import('@narada2/macos-site');

  const checks: DoctorCheck[] = [];
  const siteRoot = resolveSiteRoot(siteId);

  // 1. Site directory exists and is writable
  try {
    const s = await stat(siteRoot);
    if (s.isDirectory()) {
      checks.push({
        name: 'site-directory',
        status: 'pass',
        detail: `Site directory exists: ${siteRoot}`,
      });
    } else {
      checks.push({
        name: 'site-directory',
        status: 'fail',
        detail: `Site path exists but is not a directory: ${siteRoot}`,
        remediation: `Remove the file and recreate the site directory`,
      });
    }
  } catch {
    checks.push({
      name: 'site-directory',
      status: 'fail',
      detail: `Site directory not found: ${siteRoot}`,
      remediation: `Run narada cycle --site ${siteId} to initialize`,
    });
  }

  // 2. Coordinator database
  let status: { health: { status: string; last_cycle_at: string | null; consecutive_failures: number; message: string }; lastTrace: unknown } | null = null;
  try {
    status = await getMacosSiteStatus(siteId);
    checks.push({
      name: 'coordinator-db',
      status: 'pass',
      detail: 'Coordinator database readable',
    });
  } catch {
    checks.push({
      name: 'coordinator-db',
      status: 'fail',
      detail: 'Coordinator database not found or unreadable',
      remediation: `Run narada cycle --site ${siteId} to initialize`,
    });
  }

  // 3. Lock not stuck
  try {
    const lockDir = join(siteRoot, 'state', 'cycle.lock');
    const lockStat = await stat(lockDir);
    const ageMs = Date.now() - lockStat.mtimeMs;
    const staleThresholdMs = staleThresholdMinutes * 60 * 1000;
    if (ageMs > staleThresholdMs) {
      checks.push({
        name: 'stuck-lock',
        status: 'fail',
        detail: `Lock is stale (${Math.round(ageMs / 1000)}s old)`,
        remediation: `The next cycle will auto-recover, or run narada cycle --site ${siteId}`,
      });
    } else {
      checks.push({
        name: 'stuck-lock',
        status: 'pass',
        detail: 'Lock is fresh or not present',
      });
    }
  } catch {
    checks.push({
      name: 'stuck-lock',
      status: 'pass',
      detail: 'No active lock',
    });
  }

  // 4. LaunchAgent plist registered
  try {
    const plistPath = join(process.env.HOME ?? '~', 'Library', 'LaunchAgents', `dev.narada.site.${siteId}.plist`);
    const plistStat = await stat(plistPath);
    if (plistStat.isFile()) {
      checks.push({
        name: 'launchagent',
        status: 'pass',
        detail: `LaunchAgent plist registered: ${plistPath}`,
      });
    } else {
      checks.push({
        name: 'launchagent',
        status: 'warn',
        detail: `LaunchAgent path exists but is not a file`,
        remediation: `Run the site setup to regenerate the LaunchAgent plist`,
      });
    }
  } catch {
    checks.push({
      name: 'launchagent',
      status: 'warn',
      detail: 'LaunchAgent plist not found — site is not scheduled',
      remediation: `Run the site setup to create the LaunchAgent plist`,
    });
  }

  // 5. Health status
  if (status) {
    const healthOk = status.health.status !== 'critical' && status.health.status !== 'auth_failed';
    checks.push({
      name: 'health-status',
      status: healthOk ? 'pass' : 'fail',
      detail: `Health: ${status.health.status} (${status.health.consecutive_failures} consecutive failures)`,
      remediation: healthOk ? undefined : `Investigate with narada status --site ${siteId}`,
    });

    // 6. Cycle freshness
    if (status.health.last_cycle_at) {
      const lastCycle = new Date(status.health.last_cycle_at);
      const minsSince = (Date.now() - lastCycle.getTime()) / (1000 * 60);
      checks.push({
        name: 'cycle-freshness',
        status: minsSince <= staleThresholdMinutes ? 'pass' : 'warn',
        detail: `Last cycle ${Math.round(minsSince)} minutes ago`,
        remediation: minsSince <= staleThresholdMinutes ? undefined : `Check if the LaunchAgent is loaded: launchctl list | grep dev.narada.site.${siteId}`,
      });
    } else {
      checks.push({
        name: 'cycle-freshness',
        status: 'warn',
        detail: 'No cycle recorded yet',
        remediation: `Run narada cycle --site ${siteId} to start`,
      });
    }
  } else {
    checks.push({
      name: 'health-status',
      status: 'warn',
      detail: 'Cannot determine health without coordinator database',
    });
    checks.push({
      name: 'cycle-freshness',
      status: 'warn',
      detail: 'Cannot determine cycle freshness without coordinator database',
    });
  }

  const hasFail = checks.some((c) => c.status === 'fail');
  const overall: DoctorReport['overall'] = hasFail ? 'degraded' : 'healthy';

  const scopeResult: ScopeDoctorResult = {
    scopeId: siteId,
    rootDir: siteRoot,
    checks,
    status: overall,
  };

  const report: DoctorReport = {
    overall,
    scopes: [scopeResult],
    summary: {
      pass: checks.filter((c) => c.status === 'pass').length,
      fail: checks.filter((c) => c.status === 'fail').length,
      warn: checks.filter((c) => c.status === 'warn').length,
    },
  };

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: overall === 'healthy' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result: { status: overall, ...report },
    };
  }

  const overallIcon = overall === 'healthy' ? '✓' : '✗';
  fmt.message(`Doctor: ${overallIcon} ${overall.toUpperCase()}`, overall === 'healthy' ? 'success' : 'error');
  fmt.message(`${report.summary.pass} pass, ${report.summary.fail} fail, ${report.summary.warn} warn`, 'info');

  fmt.section(`Site: ${siteId} (macOS)`);
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
    const fmtType = check.status === 'pass' ? 'success' : check.status === 'fail' ? 'error' : 'warning';
    fmt.message(`${icon} ${check.name}: ${check.detail}`, fmtType);
    if (check.remediation) {
      fmt.message(`  → ${check.remediation}`, 'info');
    }
  }

  return {
    exitCode: overall === 'healthy' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: { status: overall, ...report },
  };
}

async function doctorLinuxSite(
  siteId: string,
  mode: 'system' | 'user',
  staleThresholdMinutes: number,
  fmt: ReturnType<typeof createFormatter>,
  logger: CommandContext['logger'],
): Promise<{ exitCode: ExitCode; result: unknown }> {
  logger.info('Running doctor for Linux Site', { siteId, mode });

  const {
    resolveSiteRoot,
    checkSite,
  } = await import('@narada2/linux-site');

  const checks = await checkSite(siteId, mode, staleThresholdMinutes);
  const siteRoot = resolveSiteRoot(siteId, mode);

  const hasFail = checks.some((c) => c.status === 'fail');
  const overall: DoctorReport['overall'] = hasFail ? 'degraded' : 'healthy';

  const scopeResult: ScopeDoctorResult = {
    scopeId: siteId,
    rootDir: siteRoot,
    checks,
    status: overall,
  };

  const report: DoctorReport = {
    overall,
    scopes: [scopeResult],
    summary: {
      pass: checks.filter((c) => c.status === 'pass').length,
      fail: checks.filter((c) => c.status === 'fail').length,
      warn: checks.filter((c) => c.status === 'warn').length,
    },
  };

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: overall === 'healthy' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result: { status: overall, ...report },
    };
  }

  const overallIcon = overall === 'healthy' ? '✓' : '✗';
  fmt.message(`Doctor: ${overallIcon} ${overall.toUpperCase()}`, overall === 'healthy' ? 'success' : 'error');
  fmt.message(`${report.summary.pass} pass, ${report.summary.fail} fail, ${report.summary.warn} warn`, 'info');

  fmt.section(`Site: ${siteId} (linux-${mode})`);
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
    const fmtType = check.status === 'pass' ? 'success' : check.status === 'fail' ? 'error' : 'warning';
    fmt.message(`${icon} ${check.name}: ${check.detail}`, fmtType);
    if (check.remediation) {
      fmt.message(`  → ${check.remediation}`, 'info');
    }
  }

  return {
    exitCode: overall === 'healthy' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: { status: overall, ...report },
  };
}

async function doctorWindowsSite(
  siteId: string,
  staleThresholdMinutes: number,
  fmt: ReturnType<typeof createFormatter>,
  logger: CommandContext['logger'],
): Promise<{ exitCode: ExitCode; result: unknown }> {
  logger.info('Running doctor for Windows Site', { siteId });

  const {
    resolveSiteVariant,
    resolveSiteRoot,
    getWindowsSiteStatus,
  } = await import('@narada2/windows-site');

  const variant = resolveSiteVariant(siteId);
  if (!variant) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Windows Site "${siteId}" not found.`,
      },
    };
  }

  const checks: DoctorCheck[] = [];
  const siteRoot = resolveSiteRoot(siteId, variant);

  // 1. Site directory exists and is writable
  try {
    const s = await stat(siteRoot);
    if (s.isDirectory()) {
      checks.push({
        name: 'site-directory',
        status: 'pass',
        detail: `Site directory exists: ${siteRoot}`,
      });
    } else {
      checks.push({
        name: 'site-directory',
        status: 'fail',
        detail: `Site path exists but is not a directory: ${siteRoot}`,
        remediation: `Remove the file and recreate the site directory`,
      });
    }
  } catch {
    checks.push({
      name: 'site-directory',
      status: 'fail',
      detail: `Site directory not found: ${siteRoot}`,
      remediation: `Run narada cycle --site ${siteId} to initialize`,
    });
  }

  // 2. Coordinator database
  let status: WindowsSiteStatus | null = null;
  try {
    status = await getWindowsSiteStatus(siteId, variant);
    checks.push({
      name: 'coordinator-db',
      status: 'pass',
      detail: 'Coordinator database readable',
    });
  } catch {
    checks.push({
      name: 'coordinator-db',
      status: 'fail',
      detail: 'Coordinator database not found or unreadable',
      remediation: `Run narada cycle --site ${siteId} to initialize`,
    });
  }

  // 3. Lock not stuck
  try {
    const lockDir = join(siteRoot, 'state', 'cycle.lock');
    const lockStat = await stat(lockDir);
    const ageMs = Date.now() - lockStat.mtimeMs;
    const staleThresholdMs = staleThresholdMinutes * 60 * 1000;
    if (ageMs > staleThresholdMs) {
      checks.push({
        name: 'stuck-lock',
        status: 'fail',
        detail: `Lock is stale (${Math.round(ageMs / 1000)}s old)`,
        remediation: `The next cycle will auto-recover, or run narada cycle --site ${siteId}`,
      });
    } else {
      checks.push({
        name: 'stuck-lock',
        status: 'pass',
        detail: 'Lock is fresh or not present',
      });
    }
  } catch {
    checks.push({
      name: 'stuck-lock',
      status: 'pass',
      detail: 'No active lock',
    });
  }

  // 4. Health status
  if (status) {
    const healthOk = status.health.status !== 'critical' && status.health.status !== 'auth_failed';
    checks.push({
      name: 'health-status',
      status: healthOk ? 'pass' : 'fail',
      detail: `Health: ${status.health.status} (${status.health.consecutive_failures} consecutive failures)`,
      remediation: healthOk ? undefined : `Investigate with narada status --site ${siteId}`,
    });

    // 5. Cycle freshness
    if (status.health.last_cycle_at) {
      const lastCycle = new Date(status.health.last_cycle_at);
      const minsSince = (Date.now() - lastCycle.getTime()) / (1000 * 60);
      checks.push({
        name: 'cycle-freshness',
        status: minsSince <= staleThresholdMinutes ? 'pass' : 'warn',
        detail: `Last cycle ${Math.round(minsSince)} minutes ago`,
        remediation: minsSince <= staleThresholdMinutes ? undefined : `Check if the scheduler is running`,
      });
    } else {
      checks.push({
        name: 'cycle-freshness',
        status: 'warn',
        detail: 'No cycle recorded yet',
        remediation: `Run narada cycle --site ${siteId} to start`,
      });
    }
  } else {
    checks.push({
      name: 'health-status',
      status: 'warn',
      detail: 'Cannot determine health without coordinator database',
    });
    checks.push({
      name: 'cycle-freshness',
      status: 'warn',
      detail: 'Cannot determine cycle freshness without coordinator database',
    });
  }

  const hasFail = checks.some((c) => c.status === 'fail');
  const overall: DoctorReport['overall'] = hasFail ? 'degraded' : 'healthy';

  const scopeResult: ScopeDoctorResult = {
    scopeId: siteId,
    rootDir: siteRoot,
    checks,
    status: overall,
  };

  const report: DoctorReport = {
    overall,
    scopes: [scopeResult],
    summary: {
      pass: checks.filter((c) => c.status === 'pass').length,
      fail: checks.filter((c) => c.status === 'fail').length,
      warn: checks.filter((c) => c.status === 'warn').length,
    },
  };

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: overall === 'healthy' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result: { status: overall, ...report },
    };
  }

  const overallIcon = overall === 'healthy' ? '✓' : '✗';
  fmt.message(`Doctor: ${overallIcon} ${overall.toUpperCase()}`, overall === 'healthy' ? 'success' : 'error');
  fmt.message(`${report.summary.pass} pass, ${report.summary.fail} fail, ${report.summary.warn} warn`, 'info');

  fmt.section(`Site: ${siteId} (${variant})`);
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
    const fmtType = check.status === 'pass' ? 'success' : check.status === 'fail' ? 'error' : 'warning';
    fmt.message(`${icon} ${check.name}: ${check.detail}`, fmtType);
    if (check.remediation) {
      fmt.message(`  → ${check.remediation}`, 'info');
    }
  }

  return {
    exitCode: overall === 'healthy' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: { status: overall, ...report },
  };
}

interface WindowsSiteStatus {
  siteId: string;
  variant: string;
  siteRoot: string;
  health: {
    status: string;
    last_cycle_at: string | null;
    last_cycle_duration_ms: number | null;
    consecutive_failures: number;
    message: string;
  };
  lastTrace: unknown;
}
