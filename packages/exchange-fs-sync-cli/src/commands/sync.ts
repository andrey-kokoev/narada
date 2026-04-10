import { resolve } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
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
  format?: string;
  dryRun?: boolean;
}

export async function syncCommand(
  options: SyncOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, verbose, logger } = context;
  
  logger.info('Loading config', { path: configPath });
  const config = await loadConfig({ path: configPath });
  const rootDir = resolve(config.root_dir);
  
  if (options.dryRun) {
    logger.info('DRY RUN: No changes will be made');
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
    normalize_folder_ref: normalizeFolderRef,
    normalize_flagged: normalizeFlagged,
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
  
  // Map result status to exit code
  let exitCode: ExitCode;
  switch (result.status) {
    case 'success':
      exitCode = ExitCode.SUCCESS;
      break;
    case 'retryable_failure':
      exitCode = ExitCode.SYNC_RETRYABLE;
      break;
    case 'fatal_failure':
      exitCode = ExitCode.SYNC_FATAL;
      break;
    default:
      exitCode = ExitCode.GENERAL_ERROR;
  }
  
  return { exitCode, result };
}
