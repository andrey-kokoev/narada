/**
 * Data lifecycle management types
 * 
 * Provides interfaces for cleanup, compaction, vacuum, and retention operations.
 */

import type { TombstoneStore } from '../projector/apply-event.js';
import type { MessageStore, ViewStore } from '../types/runtime.js';

/**
 * Options for tombstone cleanup operation
 */
export interface CleanupOptions {
  /** Maximum age of tombstones to keep (in days). Default: 30 */
  maxTombstoneAgeDays: number;
  /** Preview changes without applying. Default: false */
  dryRun: boolean;
}

/**
 * Result of tombstone cleanup operation
 */
export interface CleanupResult {
  /** Number of tombstones removed */
  tombstonesRemoved: number;
  /** Bytes reclaimed from removed tombstones */
  bytesReclaimed: number;
  /** Errors encountered during cleanup */
  errors: Array<{ path: string; error: string }>;
}

/**
 * Options for message compaction/archival operation
 */
export interface CompactionOptions {
  /** Age after which messages are archived (in days). Default: 90 */
  archiveAfterDays: number;
  /** Directory to store archived messages */
  archiveDir: string;
  /** Whether to gzip compress archived messages. Default: true */
  compress: boolean;
}

/**
 * Result of message compaction operation
 */
export interface CompactionResult {
  /** Number of messages archived */
  messagesArchived: number;
  /** Number of messages deleted (if retention policy applied) */
  messagesDeleted: number;
  /** Total bytes before compaction */
  bytesBefore: number;
  /** Total bytes after compaction */
  bytesAfter: number;
  /** Errors encountered during compaction */
  errors: Array<{ messageId: string; error: string }>;
}

/**
 * Options for vacuum operation
 */
export interface VacuumOptions {
  /** Rebuild views from messages. Default: false */
  rebuildViews: boolean;
  /** Verify message checksums. Default: false */
  verifyChecksums: boolean;
  /** Remove orphaned files. Default: false */
  removeOrphans: boolean;
  /** Preview changes without applying. Default: false */
  dryRun: boolean;
}

/**
 * Result of vacuum operation
 */
export interface VacuumResult {
  /** Number of issues found */
  issuesFound: number;
  /** Number of issues fixed */
  issuesFixed: number;
  /** Whether views were rebuilt */
  viewsRebuilt: boolean;
  /** Details of each issue found */
  issues: Array<{
    type: 'orphan' | 'missing' | 'corrupted' | 'stale_tombstone';
    path: string;
    messageId?: string;
    fixed: boolean;
    error?: string;
  }>;
}

/**
 * Retention policy configuration
 */
export interface RetentionPolicy {
  /** Delete messages older than N days */
  maxAgeDays?: number;
  /** Maximum total size (e.g., "10GB"). Oldest first deletion */
  maxTotalSize?: string;
  /** Keep only N most recent messages */
  maxMessageCount?: number;
  /** Don't delete flagged items. Default: true */
  preserveFlagged: boolean;
  /** Don't delete unread items. Default: true */
  preserveUnread: boolean;
}

/**
 * Result of retention policy application
 */
export interface RetentionResult {
  /** Number of messages deleted */
  messagesDeleted: number;
  /** Bytes freed from deleted messages */
  bytesFreed: number;
  /** Number of messages preserved due to flags */
  preserved: number;
  /** Errors encountered during retention application */
  errors: Array<{ messageId: string; error: string }>;
}

/**
 * Cleanup schedule configuration
 */
export interface CleanupSchedule {
  /** How often to run cleanup */
  frequency: 'daily' | 'weekly' | 'on-sync' | 'manual';
  /** Maximum runtime for cleanup (in minutes). Default: 60 */
  maxRunTimeMinutes: number;
  /** Time window for cleanup (optional) */
  timeWindow?: { 
    /** Start time in "HH:MM" format (24-hour) */
    start: string; 
    /** End time in "HH:MM" format (24-hour) */
    end: string; 
  };
}

/**
 * Lifecycle configuration section
 */
export interface LifecycleConfig {
  /** Tombstone retention period in days. Default: 30 */
  tombstone_retention_days: number;
  /** Archive messages after N days. Default: 90 */
  archive_after_days: number;
  /** Archive directory path (relative to root_dir). Default: "archive" */
  archive_dir: string;
  /** Whether to compress archived messages. Default: true */
  compress_archives: boolean;
  /** Retention policy settings */
  retention: RetentionPolicy;
  /** Cleanup schedule settings */
  schedule: CleanupSchedule;
}

/**
 * Progress callback for long-running operations
 */
export type ProgressCallback = (progress: {
  /** Operation phase */
  phase: string;
  /** Current item being processed */
  current: number;
  /** Total items to process */
  total: number;
  /** Additional details */
  details?: string;
}) => void | Promise<void>;

/**
 * Abort signal for interruptible operations
 */
export interface CleanupContext {
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Progress callback */
  onProgress?: ProgressCallback;
  /** Logger instance */
  logger?: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

/**
 * Combined stores needed for lifecycle operations
 */
export interface LifecycleStores {
  tombstoneStore: TombstoneStore;
  messageStore: MessageStore;
  viewStore: ViewStore;
}
