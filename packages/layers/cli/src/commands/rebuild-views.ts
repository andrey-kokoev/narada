import { resolve } from 'node:path';
import { loadConfig, FileViewStore } from '@narada2/control-plane';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface RebuildViewsOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
}

export async function rebuildViewsCommand(
  options: RebuildViewsOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, logger } = context;
  const fmt = createFormatter({ format: options.format, verbose: options.verbose });
  
  logger.info('Loading config', { path: configPath });
  const config = await loadConfig({ path: configPath });
  const rootDir = resolve(config.root_dir);
  
  const viewStore = new FileViewStore({ rootDir });
  
  logger.info('Rebuilding views', { rootDir });
  
  const startTime = Date.now();
  await viewStore.rebuildAll();
  const duration = Date.now() - startTime;
  
  logger.info('Views rebuilt', { duration_ms: duration });
  
  const result = {
    status: 'success',
    duration_ms: duration,
    message: 'Views rebuilt successfully',
  };
  
  if (fmt.getFormat() === 'json') {
    return { exitCode: ExitCode.SUCCESS, result };
  }
  
  // Human-readable output
  fmt.message('Views rebuilt successfully', 'success');
  
  fmt.section('Details');
  fmt.kv('Duration', fmt.duration(duration));
  fmt.kv('Root directory', rootDir);
  
  console.log('');
  fmt.message('The following views have been regenerated:', 'info');
  fmt.list([
    'by-thread/ - Messages grouped by conversation',
    'by-folder/ - Messages grouped by folder',
    'unread/ - Unread message links',
    'flagged/ - Flagged message links',
  ]);
  
  console.log('');
  fmt.message('All views are now consistent with the message store.', 'info');
  
  return { exitCode: ExitCode.SUCCESS, result };
}
