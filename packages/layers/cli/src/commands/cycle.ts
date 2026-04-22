import { mkdirSync } from 'node:fs';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface CycleOptions {
  site?: string;
  siteRoot?: string;
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

  // Lazy-load the Windows site runner to avoid eager native module load
  const { DefaultWindowsSiteRunner, resolveSiteRoot, ensureSiteDir } = await import('@narada2/windows-site');

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

  // For the spike, default to native Windows variant
  const variant = 'native' as const;

  let siteRoot: string;
  try {
    siteRoot = resolveSiteRoot(siteId, variant);
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

  // Ensure logs directory exists
  try {
    mkdirSync(`${siteRoot}/logs`, { recursive: true });
  } catch {
    // Ignore
  }

  logger.info('Starting Windows Site cycle', { siteId, siteRoot });

  const runner = new DefaultWindowsSiteRunner({
    ceilingMs: options.ceilingMs,
    lockTtlMs: options.lockTtlMs,
  });

  try {
    const result = await runner.runCycle({
      site_id: siteId,
      variant,
      site_root: siteRoot,
      config_path: `${siteRoot}/config.json`,
      cycle_interval_minutes: 5,
      lock_ttl_ms: options.lockTtlMs ?? 35_000,
      ceiling_ms: options.ceilingMs ?? 30_000,
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
