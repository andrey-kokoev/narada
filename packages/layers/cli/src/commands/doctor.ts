import { resolve, join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { loadConfig, isMultiMailboxConfig, loadMultiMailboxConfig, loadCharterEnv } from '@narada2/control-plane';
import { CodexCharterRunner, MockCharterRunner, getRecoveryGuidance } from '@narada2/charters';

export interface DoctorOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  staleThresholdMinutes?: number;
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

async function readHealthFile(rootDir: string): Promise<{
  status: string;
  lastSyncAt?: string;
  timestamp?: string;
  thresholds?: { maxStalenessMs?: number };
} | null> {
  try {
    const raw = await readFile(join(rootDir, '.health.json'), 'utf8');
    return JSON.parse(raw) as {
      status: string;
      lastSyncAt?: string;
      timestamp?: string;
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
  scopeConfig?: { charter?: { runtime?: string; api_key?: string; model?: string; base_url?: string; timeout_ms?: number } },
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
  const health = await readHealthFile(rootDir);
  if (health) {
    checks.push({
      name: 'health-file',
      status: health.status === 'healthy' ? 'pass' : 'fail',
      detail: `Health status: ${health.status}`,
      remediation: health.status === 'healthy' ? undefined : 'Check daemon logs for errors',
    });

    // 3. Sync freshness
    if (health.lastSyncAt) {
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
          remediation: "Set `charter.runtime` to 'codex-api', 'kimi-api', or 'mock'.",
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

  // 5. Failed work items (coordinator DB)
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
              sum(case when status = 'failed_terminal' then 1 else 0 end) as terminal
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
            status: terminal > 0 ? 'fail' : 'warn',
            detail: `${retryable} failed_retryable, ${terminal} failed_terminal work items`,
            remediation:
              terminal > 0
                ? 'Review terminal failures with `narada show execution <id>`'
                : 'Retryable failures may resolve automatically; monitor with `narada status`',
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

  const status: ScopeDoctorResult['status'] = checks.some((c) => c.status !== 'pass')
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

  logger.info('Running doctor', { configPath, staleThresholdMinutes });

  let raw: string;
  try {
    raw = await readFile(configPath, 'utf8');
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
    const { config, valid, scopes: loadedScopes } = await loadMultiMailboxConfig({ path: configPath });
    if (!valid) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: 'Invalid multi-mailbox configuration' },
      };
    }
    for (const mailbox of config.mailboxes) {
      const scopeCfg = loadedScopes.find((s) => s.scope_id === mailbox.mailbox_id);
      scopes.push(await checkScope(mailbox.mailbox_id, resolve(mailbox.root_dir), staleThresholdMinutes, scopeCfg));
    }
  } else {
    let config;
    try {
      config = await loadConfig({ path: configPath });
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
    scopes.push(await checkScope(scope.scope_id, resolve(scope.root_dir), staleThresholdMinutes, scope));
  }

  const pass = scopes.reduce((sum, s) => sum + s.checks.filter((c) => c.status === 'pass').length, 0);
  const fail = scopes.reduce((sum, s) => sum + s.checks.filter((c) => c.status === 'fail').length, 0);
  const warn = scopes.reduce((sum, s) => sum + s.checks.filter((c) => c.status === 'warn').length, 0);

  const overall: DoctorReport['overall'] = fail > 0 || warn > 0 ? 'degraded' : 'healthy';

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
