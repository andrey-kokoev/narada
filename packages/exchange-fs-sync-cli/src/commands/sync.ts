import { resolve } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import type { RunResult } from 'exchange-fs-sync';
import {
  loadConfig,
  buildGraphTokenProvider,
  GraphHttpClient,
  DefaultGraphAdapter,
  DefaultSyncRunner,
  FileCursorStore,
  FileApplyLogStore,
  DefaultProjector,
  cleanupTmp,
  FileLock,
  normalizeFolderRef,
  normalizeFlagged,
} from 'exchange-fs-sync';

export interface SyncOptions {
  config?: string;
  verbose?: boolean;
  dryRun?: boolean;
  format?: 'json' | 'human' | 'auto';
}

export async function syncCommand(
  options: SyncOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, verbose, logger } = context;
  const fmt = createFormatter({ format: options.format, verbose });
  
  logger.info('Loading config', { path: configPath });
  const config = await loadConfig({ path: configPath });
  const rootDir = resolve(config.root_dir);
  
  if (options.dryRun) {
    fmt.message('DRY RUN: No changes will be made', 'warning');
  }
  
  logger.info('Initializing Graph client', {
    user: config.graph.user_id,
    mailbox: config.mailbox_id,
  });
  
  // Set up token provider
  const tokenProvider = buildGraphTokenProvider({ config });
  
  // Create Graph HTTP client
  const graphClient = new GraphHttpClient({
    tokenProvider,
    baseUrl: config.graph.base_url,
    preferImmutableIds: config.graph.prefer_immutable_ids,
  });
  
  // Create adapter
  const adapter = new DefaultGraphAdapter({
    mailbox_id: config.mailbox_id,
    user_id: config.graph.user_id,
    client: graphClient,
    adapter_scope: {
      mailbox_id: config.mailbox_id,
      ...config.scope,
    },
    body_policy: config.normalize.body_policy,
    attachment_policy: config.normalize.attachment_policy,
    include_headers: config.normalize.include_headers,
    normalize_folder_ref,
    normalize_flagged,
  });
  
  // Create persistence stores
  const cursorStore = new FileCursorStore({
    rootDir,
    mailboxId: config.mailbox_id,
  });
  
  const applyLogStore = new FileApplyLogStore({ rootDir });
  
  const projector = new DefaultProjector({
    rootDir,
    tombstonesEnabled: config.normalize.tombstones_enabled,
  });
  
  // Create lock mechanism
  const lock = new FileLock({
    rootDir,
    acquireTimeoutMs: config.runtime.acquire_lock_timeout_ms,
  });
  
  // Create sync runner
  const runner = new DefaultSyncRunner({
    rootDir,
    adapter,
    cursorStore,
    applyLogStore,
    projector,
    cleanupTmp: config.runtime.cleanup_tmp_on_startup
      ? () => cleanupTmp({ rootDir })
      : undefined,
    acquireLock: () => lock.acquire(),
    rebuildViewsAfterSync: config.runtime.rebuild_views_after_sync,
  });
  
  // Run sync
  logger.info('Starting sync cycle');
  
  const result = await runner.syncOnce();
  
  logger.info('Sync complete', {
    status: result.status,
    applied: result.applied_count,
    skipped: result.skipped_count,
    duration: result.duration_ms,
  });
  
  // Output based on format
  if (fmt.getFormat() === 'json') {
    return { exitCode: getExitCode(result.status), result };
  }
  
  // Human-readable output
  outputHumanReadable(fmt, result, options.dryRun);
  
  return { exitCode: getExitCode(result.status), result };
}

function getExitCode(status: RunResult['status']): ExitCode {
  switch (status) {
    case 'success':
      return ExitCode.SUCCESS;
    case 'retryable_failure':
      return ExitCode.SYNC_RETRYABLE;
    case 'fatal_failure':
      return ExitCode.SYNC_FATAL;
    default:
      return ExitCode.GENERAL_ERROR;
  }
}

function outputHumanReadable(
  fmt: ReturnType<typeof createFormatter>,
  result: RunResult,
  dryRun?: boolean,
): void {
  const status = result.status;
  
  if (status === 'success') {
    if (result.applied_count > 0) {
      fmt.message(
        `Sync completed successfully - ${fmt.formatNumber(result.applied_count)} message(s) updated`,
        'success'
      );
    } else {
      fmt.message('Sync completed - no new messages', 'success');
    }
  } else if (status === 'retryable_failure') {
    fmt.message(`Sync failed (retryable): ${result.error || 'Unknown error'}`, 'warning');
  } else {
    fmt.message(`Sync failed: ${result.error || 'Unknown error'}`, 'error');
  }
  
  fmt.section('Summary');
  
  fmt.kv('Status', status === 'success' ? 'Success' : status === 'retryable_failure' ? 'Retryable' : 'Fatal');
  fmt.kv('Messages applied', result.applied_count);
  fmt.kv('Messages skipped', result.skipped_count);
  fmt.kv('Total events', result.event_count);
  fmt.kv('Duration', fmt.duration(result.duration_ms));
  
  if (result.prior_cursor) {
    fmt.kv('Previous cursor', 'Set');
  } else {
    fmt.kv('Previous cursor', 'None (initial sync)');
  }
  
  if (result.next_cursor) {
    fmt.kv('New cursor', 'Updated');
  }
  
  if (dryRun) {
    console.log('');
    fmt.message('This was a dry run. No changes were made.', 'info');
  }
  
  if (status === 'success' && result.applied_count === 0) {
    console.log('');
    fmt.message('No new messages to sync. The mailbox is up to date.', 'info');
  }
  
  if (status === 'retryable_failure') {
    console.log('');
    fmt.message('This error may be temporary. You can retry the sync.', 'info');
  }
  
  if (status === 'fatal_failure') {
    console.log('');
    fmt.message('A fatal error occurred. Please check your configuration and credentials.', 'error');
  }
}
