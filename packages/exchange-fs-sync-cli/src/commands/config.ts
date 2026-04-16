import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface ConfigOptions {
  output?: string;
  force?: boolean;
  format?: 'json' | 'human' | 'auto';
}

const DEFAULT_CONFIG = {
  root_dir: './data',
  mailbox_id: 'user@example.com',
  scopes: [
    {
      scope_id: 'user@example.com',
      root_dir: './data',
      sources: [
        {
          type: 'graph',
          user_id: 'user@example.com',
          prefer_immutable_ids: true,
        },
      ],
      context_strategy: 'mailbox',
      scope: {
        included_container_refs: ['inbox', 'sentitems', 'drafts', 'archive'],
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
      charter: {
        runtime: 'mock',
      },
      policy: {
        primary_charter: 'support_steward',
        allowed_actions: ['draft_reply', 'send_reply', 'mark_read', 'no_action'],
      },
    },
  ],
  lifecycle: {
    tombstone_retention_days: 30,
    archive_after_days: 90,
    archive_dir: 'archive',
    compress_archives: true,
    retention: {
      preserve_flagged: true,
      preserve_unread: true,
    },
    schedule: {
      frequency: 'manual',
      max_run_time_minutes: 60,
    },
  },
};

export async function configCommand(
  options: ConfigOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const outputPath = resolve(options.output || './config.json');
  const { logger } = context;
  const fmt = createFormatter({ format: options.format, verbose: false });
  
  logger.info('Initializing config', { outputPath });
  
  if (existsSync(outputPath) && !options.force) {
    const error = `File already exists: ${outputPath}. Use --force to overwrite.`;
    logger.error(error);
    
    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error },
      };
    }
    
    fmt.message(error, 'error');
    console.log('');
    fmt.message('To overwrite the existing file:', 'info');
    console.log(`  exchange-sync init --output ${options.output || './config.json'} --force`);
    
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error } };
  }
  
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n',
    'utf8',
  );
  
  logger.info('Config written', { outputPath });
  
  const result = {
    status: 'success',
    message: `Configuration written to ${outputPath}`,
    path: outputPath,
    next_steps: [
      'Edit the file to add your Graph API credentials',
      'Set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET environment variables',
      'Or add credentials directly to the config file (not recommended for production)',
      'Run "exchange-sync sync" to test the configuration',
    ],
  };
  
  if (fmt.getFormat() === 'json') {
    return { exitCode: ExitCode.SUCCESS, result };
  }
  
  // Human-readable output
  fmt.message(`Configuration created: ${outputPath}`, 'success');
  
  fmt.section('Configuration Details');
  const defaultScope = DEFAULT_CONFIG.scopes[0]!;
  fmt.kv('Scope', defaultScope.scope_id);
  fmt.kv('Data directory', DEFAULT_CONFIG.root_dir);
  fmt.kv('Sync folders', defaultScope.scope.included_container_refs.join(', '));
  fmt.kv('Polling interval', `${defaultScope.runtime.polling_interval_ms / 1000}s`);
  
  fmt.section('Next Steps');
  fmt.list(result.next_steps);
  
  console.log('');
  fmt.message('Quick start:', 'info');
  console.log('  1. Edit config.json with your credentials');
  console.log('  2. Set environment variables for Graph API auth');
  console.log('  3. Run: exchange-sync sync');
  
  return { exitCode: ExitCode.SUCCESS, result };
}
