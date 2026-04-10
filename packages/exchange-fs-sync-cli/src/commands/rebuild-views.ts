import { resolve } from 'node:path';
import { loadConfig, FileViewStore } from 'exchange-fs-sync';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';

export interface RebuildViewsOptions {
  config?: string;
  verbose?: boolean;
}

export async function rebuildViewsCommand(
  options: RebuildViewsOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, logger } = context;
  
  logger.info('Loading config', { path: configPath });
  const config = await loadConfig({ path: configPath });
  const rootDir = resolve(config.root_dir);
  
  const viewStore = new FileViewStore({ rootDir });
  
  logger.info('Rebuilding views', { rootDir });
  
  const startTime = Date.now();
  await viewStore.rebuildAll();
  const duration = Date.now() - startTime;
  
  logger.info('Views rebuilt', { duration_ms: duration });
  
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      duration_ms: duration,
      message: 'Views rebuilt successfully',
    },
  };
}
