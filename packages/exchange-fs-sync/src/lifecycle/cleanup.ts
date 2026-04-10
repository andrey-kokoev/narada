/**
 * Tombstone cleanup module
 * 
 * Removes old tombstone records that are no longer needed for sync continuity.
 */

import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { CleanupOptions, CleanupResult, CleanupContext } from './types.js';
import type { TombstoneStore } from '../projector/apply-event.js';

/**
 * Default cleanup options
 */
const DEFAULT_OPTIONS: CleanupOptions = {
  maxTombstoneAgeDays: 30,
  dryRun: false,
};

interface TombstoneEntry {
  messageId: string;
  path: string;
  observedAt: Date;
  size: number;
}

/**
 * Parse tombstone file to extract metadata
 */
async function parseTombstone(path: string, messageId: string): Promise<TombstoneEntry | null> {
  try {
    const stats = await stat(path);
    // Try to extract observed_at from file, fallback to mtime
    let observedAt = stats.mtime;
    
    try {
      const { readFile } = await import('node:fs/promises');
      const content = await readFile(path, 'utf8');
      const data = JSON.parse(content) as { observed_at?: string };
      if (data.observed_at) {
        observedAt = new Date(data.observed_at);
      }
    } catch {
      // Use file mtime as fallback
    }
    
    return {
      messageId: decodeURIComponent(messageId),
      path,
      observedAt,
      size: stats.size,
    };
  } catch {
    return null;
  }
}

/**
 * List all tombstones in the store directory
 */
async function listTombstones(rootDir: string): Promise<TombstoneEntry[]> {
  const tombstonesDir = join(rootDir, 'tombstones');
  const entries: TombstoneEntry[] = [];
  
  try {
    const files = await readdir(tombstonesDir);
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const messageId = file.slice(0, -5); // Remove .json
      const path = join(tombstonesDir, file);
      const entry = await parseTombstone(path, messageId);
      
      if (entry) {
        entries.push(entry);
      }
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return []; // No tombstones directory yet
    }
    throw error;
  }
  
  return entries;
}

/**
 * Check if message still exists (safety check)
 */
async function messageExists(rootDir: string, messageId: string): Promise<boolean> {
  try {
    const { stat } = await import('node:fs/promises');
    const messagePath = join(rootDir, 'messages', encodeURIComponent(messageId));
    const s = await stat(messagePath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Clean up old tombstones
 * 
 * Removes tombstones older than maxTombstoneAgeDays.
 * Safety check: won't remove if message still exists.
 */
export async function cleanupTombstones(
  store: TombstoneStore,
  rootDir: string,
  options: Partial<CleanupOptions> = {},
  context: CleanupContext = {}
): Promise<CleanupResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { signal, onProgress, logger } = context;
  
  logger?.info('Starting tombstone cleanup', { 
    maxAgeDays: opts.maxTombstoneAgeDays, 
    dryRun: opts.dryRun 
  });
  
  const result: CleanupResult = {
    tombstonesRemoved: 0,
    bytesReclaimed: 0,
    errors: [],
  };
  
  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - opts.maxTombstoneAgeDays);
  
  // List all tombstones
  const tombstones = await listTombstones(rootDir);
  
  logger?.info(`Found ${tombstones.length} tombstones`, { 
    cutoffDate: cutoffDate.toISOString() 
  });
  
  // Filter old tombstones
  const oldTombstones = tombstones.filter(t => t.observedAt < cutoffDate);
  
  logger?.info(`${oldTombstones.length} tombstones older than ${opts.maxTombstoneAgeDays} days`);
  
  // Process each old tombstone
  for (let i = 0; i < oldTombstones.length; i++) {
    // Check for cancellation
    if (signal?.aborted) {
      logger?.info('Cleanup aborted by signal');
      break;
    }
    
    const tombstone = oldTombstones[i];
    
    await onProgress?.({
      phase: 'cleanup',
      current: i + 1,
      total: oldTombstones.length,
      details: `Processing ${tombstone.messageId}`,
    });
    
    try {
      // Safety check: don't remove if message still exists
      const exists = await messageExists(rootDir, tombstone.messageId);
      if (exists) {
        logger?.warn('Skipping tombstone - message still exists', { 
          messageId: tombstone.messageId 
        });
        continue;
      }
      
      if (!opts.dryRun) {
        await unlink(tombstone.path);
        // Also remove from store if it has a remove method
        if ('remove' in store && typeof store.remove === 'function') {
          await store.remove(tombstone.messageId);
        }
      }
      
      result.tombstonesRemoved++;
      result.bytesReclaimed += tombstone.size;
      
      logger?.info(opts.dryRun ? 'Would remove tombstone' : 'Removed tombstone', {
        messageId: tombstone.messageId,
        observedAt: tombstone.observedAt.toISOString(),
        size: tombstone.size,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push({
        path: tombstone.path,
        error: errorMsg,
      });
      logger?.error('Failed to remove tombstone', {
        messageId: tombstone.messageId,
        error: errorMsg,
      });
    }
  }
  
  logger?.info('Tombstone cleanup complete', {
    removed: result.tombstonesRemoved,
    bytesReclaimed: result.bytesReclaimed,
    errors: result.errors.length,
  });
  
  return result;
}

/**
 * Get tombstone statistics without removing anything
 */
export async function getTombstoneStats(rootDir: string): Promise<{
  total: number;
  totalBytes: number;
  oldest: Date | null;
  newest: Date | null;
}> {
  const tombstones = await listTombstones(rootDir);
  
  if (tombstones.length === 0) {
    return { total: 0, totalBytes: 0, oldest: null, newest: null };
  }
  
  const totalBytes = tombstones.reduce((sum, t) => sum + t.size, 0);
  const sorted = [...tombstones].sort((a, b) => 
    a.observedAt.getTime() - b.observedAt.getTime()
  );
  
  return {
    total: tombstones.length,
    totalBytes,
    oldest: sorted[0].observedAt,
    newest: sorted[sorted.length - 1].observedAt,
  };
}
