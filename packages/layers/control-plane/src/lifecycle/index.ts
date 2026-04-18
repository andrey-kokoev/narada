/**
 * Data lifecycle management module
 * 
 * Provides cleanup, compaction, vacuum, and retention operations
 * for managing mailbox data over time.
 * 
 * @example
 * ```typescript
 * import { cleanupTombstones, compactMessages, vacuum, applyRetentionPolicy } from './lifecycle';
 * 
 * // Clean up old tombstones
 * await cleanupTombstones(store, rootDir, { maxTombstoneAgeDays: 30 });
 * 
 * // Archive old messages
 * await compactMessages(messageStore, viewStore, rootDir, { archiveAfterDays: 90 });
 * 
 * // Check and repair integrity
 * await vacuum(config, { verifyChecksums: true, removeOrphans: true });
 * 
 * // Apply retention policy
 * await applyRetentionPolicy(messageStore, viewStore, rootDir, {
 *   maxAgeDays: 365,
 *   preserveFlagged: true
 * });
 * ```
 */

// Core operations
export { cleanupTombstones, getTombstoneStats } from './cleanup.js';
export { compactMessages, getCompactionStats } from './compaction.js';
export { vacuum } from './vacuum.js';
export { applyRetentionPolicy, getRetentionStats, parseSize } from './retention.js';
export {
  shouldRunCleanup,
  getNextRunTime,
  maybeRunCleanup,
  runWithTimeLimit,
  createCleanupTimeout,
} from './scheduler.js';

// Types
export type {
  CleanupOptions,
  CleanupResult,
  CompactionOptions,
  CompactionResult,
  VacuumOptions,
  VacuumResult,
  RetentionPolicy,
  RetentionResult,
  CleanupSchedule,
  LifecycleConfig,
  ProgressCallback,
  CleanupContext,
  LifecycleStores,
  CleanupExecutionContext,
} from './types.js';
