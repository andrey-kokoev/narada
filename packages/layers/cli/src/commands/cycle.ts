import { mkdirSync } from 'node:fs';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface CycleOptions {
  site?: string;
  siteRoot?: string;
  mode?: string;
  ceilingMs?: number;
  lockTtlMs?: number;
  verbose?: boolean;
  format?: string;
}

export async function cycleCommand(
  options: CycleOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { logger } = context;
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });

  const siteId = options.site;
  if (!siteId) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: 'Missing required option: --site {site_id}',
      },
    };
  }

  // If explicit mode is provided, route directly
  if (options.mode === 'system' || options.mode === 'user') {
    return cycleLinuxSite(siteId, options.mode, options, logger, fmt);
  }

  // Try macOS first
  try {
    const { isMacosSite } = await import('@narada2/macos-site');
    if (isMacosSite(siteId)) {
      return cycleMacosSite(siteId, options, logger, fmt);
    }
  } catch {
    // macOS package not available
  }

  // Try Linux next
  try {
    const { isLinuxSite, resolveLinuxSiteMode } = await import('@narada2/linux-site');
    const linuxMode = resolveLinuxSiteMode(siteId);
    if (linuxMode) {
      return cycleLinuxSite(siteId, linuxMode, options, logger, fmt);
    }
  } catch {
    // Linux package not available
  }

  // Fall back to Windows
  return cycleWindowsSite(siteId, options, logger, fmt);
}

async function cycleLinuxSite(
  siteId: string,
  mode: 'system' | 'user',
  options: CycleOptions,
  logger: CommandContext['logger'],
  fmt: ReturnType<typeof createFormatter>,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const {
    DefaultLinuxSiteRunner,
    resolveSiteRoot,
    ensureSiteDir,
  } = await import('@narada2/linux-site');

  let siteRoot: string;
  try {
    siteRoot = options.siteRoot ?? resolveSiteRoot(siteId, mode);
    await ensureSiteDir(siteId, mode);
  } catch (err) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }

  try {
    mkdirSync(`${siteRoot}/logs`, { recursive: true });
  } catch {
    // Ignore
  }

  logger.info('Starting Linux Site cycle', { siteId, mode, siteRoot });

  const runner = new DefaultLinuxSiteRunner({
    ceilingMs: options.ceilingMs,
    lockTtlMs: options.lockTtlMs,
  });

  try {
    const result = await runner.runCycle({
      site_id: siteId,
      mode,
      site_root: siteRoot,
      config_path: `${siteRoot}/config.json`,
      cycle_interval_minutes: 5,
      lock_ttl_ms: options.lockTtlMs ?? 310_000,
      ceiling_ms: options.ceilingMs ?? 300_000,
    });

    logger.info('Cycle completed', {
      cycleId: result.cycle_id,
      status: result.status,
      steps: result.steps_completed,
    });

    if (options.verbose) {
      fmt.output(result);
    } else {
      fmt.message(`Cycle ${result.cycle_id} ${result.status} (${result.steps_completed.length} steps)`);
    }

    return {
      exitCode: result.status === 'failed' ? ExitCode.GENERAL_ERROR : ExitCode.SUCCESS,
      result,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Cycle failed with exception', { error: message });
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: message },
    };
  }
}

async function cycleMacosSite(
  siteId: string,
  options: CycleOptions,
  logger: CommandContext['logger'],
  fmt: ReturnType<typeof createFormatter>,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { runCycle } = await import('@narada2/macos-site');

  logger.info('Starting macOS Site cycle', { siteId });

  try {
    await runCycle({ site_id: siteId, site_root: options.siteRoot });
    // runCycle handles its own output and exit code
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'success', siteId },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Cycle failed with exception', { error: message });
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: message },
    };
  }
}

async function cycleWindowsSite(
  siteId: string,
  options: CycleOptions,
  logger: CommandContext['logger'],
  fmt: ReturnType<typeof createFormatter>,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const {
    DefaultWindowsSiteRunner,
    resolveSiteRoot,
    ensureSiteDir,
    resolveSiteVariant,
  } = await import('@narada2/windows-site');

  const variant = resolveSiteVariant(siteId);
  if (!variant) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Site "${siteId}" not found. Checked macOS, Linux (system/user), and Windows (native/WSL) paths.`,
      },
    };
  }

  let siteRoot: string;
  try {
    siteRoot = options.siteRoot ?? resolveSiteRoot(siteId, variant);
    await ensureSiteDir(siteId, variant);
  } catch (err) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }

  try {
    mkdirSync(`${siteRoot}/logs`, { recursive: true });
  } catch {
    // Ignore
  }

  logger.info('Starting Windows Site cycle', { siteId, variant, siteRoot });

  const runner = new DefaultWindowsSiteRunner({
    ceilingMs: options.ceilingMs,
    lockTtlMs: options.lockTtlMs,
  });

  try {
    const result = await runner.runCycle(
      {
        site_id: siteId,
        variant,
        site_root: siteRoot,
        config_path: `${siteRoot}/config.json`,
        cycle_interval_minutes: 5,
        lock_ttl_ms: options.lockTtlMs ?? 35_000,
        ceiling_ms: options.ceilingMs ?? 30_000,
      },
      { mode: 'live' },
    );

    logger.info('Cycle completed', {
      cycleId: result.cycle_id,
      status: result.status,
      steps: result.steps_completed,
    });

    if (options.verbose) {
      fmt.output(result);
    } else {
      fmt.message(`Cycle ${result.cycle_id} ${result.status} (${result.steps_completed.length} steps)`);
    }

    return {
      exitCode: result.status === 'failed' ? ExitCode.GENERAL_ERROR : ExitCode.SUCCESS,
      result,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Cycle failed with exception', { error: message });
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: message },
    };
  }
}
