/**
 * Cleanup command for data lifecycle management
 */

import { resolve } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  loadConfig,
  cleanupTombstones,
  compactMessages,
  vacuum,
  applyRetentionPolicy,
  getTombstoneStats,
  getCompactionStats,
  getRetentionStats,
  FileTombstoneStore,
  FileMessageStore,
  FileViewStore,
} from '@narada2/control-plane';

export interface CleanupOptions {
  config?: string;
  dryRun?: boolean;
  tombstones?: boolean;
  compact?: boolean;
  vacuum?: boolean;
  retention?: boolean;
  all?: boolean;
  verbose?: boolean;
}

export async function cleanupCommand(
  options: CleanupOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, logger } = context;
  
  // Load config
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
  
  const rootDir = resolve(config.root_dir);
  
  // Determine which operations to run
  const runAll = options.all || (!options.tombstones && !options.compact && !options.vacuum && !options.retention);
  const operations: string[] = [];
  
  if (runAll || options.tombstones) operations.push('tombstones');
  if (runAll || options.compact) operations.push('compact');
  if (runAll || options.vacuum) operations.push('vacuum');
  if (runAll || options.retention) operations.push('retention');
  
  logger.info('Starting cleanup operations', {
    operations,
    dryRun: options.dryRun,
    rootDir,
  });
  
  const results: Record<string, unknown> = {};
  
  // Initialize stores
  const tombstoneStore = new FileTombstoneStore({ rootDir });
  const messageStore = new FileMessageStore({ rootDir });
  const viewStore = new FileViewStore({ rootDir });
  
  const lifecycleConfig = config.lifecycle;
  const lifecycleLogger = {
    info: (msg: string, meta?: Record<string, unknown>) => logger.info(msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => logger.warn(msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => logger.error(msg, meta),
  };
  const retentionPolicy = lifecycleConfig?.retention
    ? {
        maxAgeDays: lifecycleConfig.retention.max_age_days,
        maxTotalSize: lifecycleConfig.retention.max_total_size,
        maxMessageCount: lifecycleConfig.retention.max_message_count,
        preserveFlagged: lifecycleConfig.retention.preserve_flagged,
        preserveUnread: lifecycleConfig.retention.preserve_unread,
      }
    : undefined;
  
  try {
    // Tombstone cleanup
    if (operations.includes('tombstones')) {
      logger.info('Running tombstone cleanup...');
      
      const stats = options.dryRun ? await getTombstoneStats(rootDir) : null;
      
      const result = await cleanupTombstones(
        tombstoneStore,
        rootDir,
        {
          maxTombstoneAgeDays: lifecycleConfig?.tombstone_retention_days ?? 30,
          dryRun: options.dryRun ?? false,
        },
        { logger: lifecycleLogger }
      );
      
      results.tombstones = {
        ...result,
        preview: stats,
      };
      
      logger.info('Tombstone cleanup complete', result);
    }
    
    // Message compaction
    if (operations.includes('compact')) {
      logger.info('Running message compaction...');
      
      const stats = options.dryRun ? await getCompactionStats(
        rootDir,
        lifecycleConfig?.archive_dir ?? 'archive'
      ) : null;
      
      const result = await compactMessages(
        messageStore,
        viewStore,
        rootDir,
        {
          archiveAfterDays: lifecycleConfig?.archive_after_days ?? 90,
          archiveDir: lifecycleConfig?.archive_dir ?? 'archive',
          compress: lifecycleConfig?.compress_archives ?? true,
        },
        { logger: lifecycleLogger }
      );
      
      results.compaction = {
        ...result,
        preview: stats,
      };
      
      logger.info('Message compaction complete', result);
    }
    
    // Vacuum
    if (operations.includes('vacuum')) {
      logger.info('Running vacuum...');
      
      const result = await vacuum(
        config,
        {
          rebuildViews: false,
          verifyChecksums: true,
          removeOrphans: !options.dryRun,
          dryRun: options.dryRun ?? false,
        },
        { logger: lifecycleLogger }
      );
      
      results.vacuum = result;
      
      logger.info('Vacuum complete', result);
    }
    
    // Retention policy
    if (operations.includes('retention')) {
      logger.info('Applying retention policy...');
      
      const stats = options.dryRun && retentionPolicy ? await getRetentionStats(
        rootDir,
        retentionPolicy
      ) : null;
      
      const result = retentionPolicy
        ? await applyRetentionPolicy(
            messageStore,
            viewStore,
            rootDir,
            retentionPolicy,
            { logger: lifecycleLogger }
          )
        : { messagesDeleted: 0, bytesFreed: 0, preserved: 0, errors: [] };
      
      results.retention = {
        ...result,
        preview: stats,
      };
      
      logger.info('Retention policy application complete', result);
    }
    
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        dryRun: options.dryRun ?? false,
        operations: results,
      },
    };
    
  } catch (error) {
    logger.error('Cleanup failed', { error: (error as Error).message });
    
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: (error as Error).message,
        operations: results,
      },
    };
  }
}
