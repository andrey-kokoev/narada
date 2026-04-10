import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';

export interface ConfigOptions {
  output?: string;
  force?: boolean;
}

const DEFAULT_CONFIG = {
  mailbox_id: 'user@example.com',
  root_dir: './data',
  graph: {
    user_id: 'user@example.com',
    prefer_immutable_ids: true,
  },
  scope: {
    included_container_refs: ['inbox'],
    included_item_kinds: ['message'],
  },
  normalize: {
    attachment_policy: 'metadata_only',
    body_policy: 'text_only',
    include_headers: false,
    tombstones_enabled: true,
  },
  runtime: {
    polling_interval_ms: 60000,
    acquire_lock_timeout_ms: 30000,
    cleanup_tmp_on_startup: true,
    rebuild_views_after_sync: false,
  },
};

export async function configCommand(
  options: ConfigOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const outputPath = resolve(options.output || './config.json');
  const { logger } = context;
  
  logger.info('Initializing config', { outputPath });
  
  if (existsSync(outputPath) && !options.force) {
    const error = `File already exists: ${outputPath}. Use --force to overwrite.`;
    logger.error(error);
    
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error,
      },
    };
  }
  
  await writeFile(
    outputPath,
    JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n',
    'utf8',
  );
  
  logger.info('Config written', { outputPath });
  
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      message: `Configuration written to ${outputPath}`,
      next_steps: [
        'Edit the file to add your Graph API credentials',
        'Set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET environment variables',
        'Or add credentials directly to the config file (not recommended for production)',
        'Run "exchange-sync sync" to test the configuration',
      ],
    },
  };
}
