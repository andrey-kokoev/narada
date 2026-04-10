/**
 * Vacuum operation module
 * 
 * Performs integrity checks and repairs on the data store.
 */

import { readdir, readFile, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { VacuumOptions, VacuumResult, CleanupContext } from './types.js';
import type { ExchangeFsSyncConfig } from '../config/types.js';

/**
 * Default vacuum options
 */
const DEFAULT_OPTIONS: VacuumOptions = {
  rebuildViews: false,
  verifyChecksums: false,
  removeOrphans: false,
  dryRun: false,
};

interface MessageRecord {
  message_id?: string;
  _checksum?: string;
  [key: string]: unknown;
}

interface ViewEntry {
  messageId: string;
  viewPath: string;
  targetPath: string;
}

/**
 * Calculate checksum for validation
 */
function calculateChecksum(data: string): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

/**
 * Verify message record checksum
 */
async function verifyMessageChecksum(messagePath: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    const recordPath = join(messagePath, 'record.json');
    const content = await readFile(recordPath, 'utf8');
    const record = JSON.parse(content) as MessageRecord;
    
    if (!record._checksum) {
      return { valid: true }; // No checksum to verify
    }
    
    // Create a copy without checksum for validation
    const { _checksum, ...recordWithoutChecksum } = record;
    const calculated = calculateChecksum(
      JSON.stringify({ ...recordWithoutChecksum, _checksum: '' })
    );
    
    if (calculated !== record._checksum) {
      return {
        valid: false,
        error: `Checksum mismatch: expected ${record._checksum}, got ${calculated}`,
      };
    }
    
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if a message directory has all required files
 */
async function isMessageComplete(messagePath: string): Promise<boolean> {
  try {
    const recordPath = join(messagePath, 'record.json');
    await stat(recordPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all messages
 */
async function listMessages(rootDir: string): Promise<string[]> {
  const messagesDir = join(rootDir, 'messages');
  const messageIds: string[] = [];
  
  try {
    const entries = await readdir(messagesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        messageIds.push(decodeURIComponent(entry.name));
      }
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
  }
  
  return messageIds;
}

/**
 * List all tombstones
 */
async function listTombstones(rootDir: string): Promise<string[]> {
  const tombstonesDir = join(rootDir, 'tombstones');
  const messageIds: string[] = [];
  
  try {
    const entries = await readdir(tombstonesDir);
    for (const entry of entries) {
      if (entry.endsWith('.json')) {
        messageIds.push(decodeURIComponent(entry.slice(0, -5)));
      }
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
  }
  
  return messageIds;
}

/**
 * List all view entries (symlinks)
 */
async function listViewEntries(rootDir: string): Promise<ViewEntry[]> {
  const viewsDir = join(rootDir, 'views');
  const entries: ViewEntry[] = [];
  
  async function scan(dir: string): Promise<void> {
    try {
      const items = await readdir(dir, { withFileTypes: true });
      
      for (const item of items) {
        const path = join(dir, item.name);
        
        if (item.isDirectory()) {
          await scan(path);
        } else if (item.isSymbolicLink()) {
          try {
            const target = await readFile(path); // Readlink not directly available, use stat
            entries.push({
              messageId: decodeURIComponent(item.name),
              viewPath: path,
              targetPath: target.toString(),
            });
          } catch {
            // Broken symlink
            entries.push({
              messageId: decodeURIComponent(item.name),
              viewPath: path,
              targetPath: '',
            });
          }
        }
      }
    } catch {
      // Directory might not exist
    }
  }
  
  await scan(viewsDir);
  return entries;
}

/**
 * Check for orphaned message files (no view entry)
 */
async function findOrphans(
  rootDir: string,
  messages: string[],
  viewEntries: ViewEntry[]
): Promise<string[]> {
  const viewMessageIds = new Set(viewEntries.map(v => v.messageId));
  return messages.filter(m => !viewMessageIds.has(m));
}

/**
 * Check for missing message files (view entry exists but no message)
 */
async function findMissing(
  rootDir: string,
  messages: string[],
  viewEntries: ViewEntry[]
): Promise<ViewEntry[]> {
  const messageIds = new Set(messages);
  return viewEntries.filter(v => !messageIds.has(v.messageId));
}

/**
 * Check for stale tombstones (message gone but tombstone remains)
 * Note: This is different from old tombstones - these are tombstones where
 * the message has been properly deleted and we can safely remove the tombstone
 */
async function findStaleTombstones(
  rootDir: string,
  messages: string[],
  tombstones: string[]
): Promise<string[]> {
  const messageIds = new Set(messages);
  return tombstones.filter(t => !messageIds.has(t));
}

/**
 * Perform vacuum operation
 * 
 * Checks and repairs data integrity issues.
 */
export async function vacuum(
  config: ExchangeFsSyncConfig,
  options: Partial<VacuumOptions> = {},
  context: CleanupContext = {}
): Promise<VacuumResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { signal, onProgress, logger } = context;
  const rootDir = config.root_dir;
  
  logger?.info('Starting vacuum operation', {
    rebuildViews: opts.rebuildViews,
    verifyChecksums: opts.verifyChecksums,
    removeOrphans: opts.removeOrphans,
    dryRun: opts.dryRun,
  });
  
  const result: VacuumResult = {
    issuesFound: 0,
    issuesFixed: 0,
    viewsRebuilt: false,
    issues: [],
  };
  
  // Gather data
  await onProgress?.({ phase: 'scan', current: 0, total: 3, details: 'Listing messages' });
  const messages = await listMessages(rootDir);
  
  if (signal?.aborted) return result;
  
  await onProgress?.({ phase: 'scan', current: 1, total: 3, details: 'Listing views' });
  const viewEntries = await listViewEntries(rootDir);
  
  if (signal?.aborted) return result;
  
  await onProgress?.({ phase: 'scan', current: 2, total: 3, details: 'Listing tombstones' });
  const tombstones = await listTombstones(rootDir);
  
  if (signal?.aborted) return result;
  
  logger?.info(`Found ${messages.length} messages, ${viewEntries.length} view entries, ${tombstones.length} tombstones`);
  
  // Check for orphaned messages
  const orphans = await findOrphans(rootDir, messages, viewEntries);
  for (const orphan of orphans) {
    result.issuesFound++;
    const orphanPath = join(rootDir, 'messages', encodeURIComponent(orphan));
    
    const issue = {
      type: 'orphan' as const,
      path: orphanPath,
      messageId: orphan,
      fixed: false,
    };
    
    if (opts.removeOrphans && !opts.dryRun) {
      try {
        await rm(orphanPath, { recursive: true, force: true });
        issue.fixed = true;
        result.issuesFixed++;
        logger?.info('Removed orphan message', { messageId: orphan });
      } catch (error) {
        issue.fixed = false;
        logger?.error('Failed to remove orphan', {
          messageId: orphan,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    result.issues.push(issue);
  }
  
  if (signal?.aborted) return result;
  
  // Check for missing messages (view entry exists but no message)
  const missing = await findMissing(rootDir, messages, viewEntries);
  for (const entry of missing) {
    result.issuesFound++;
    
    const issue = {
      type: 'missing' as const,
      path: entry.viewPath,
      messageId: entry.messageId,
      fixed: false,
    };
    
    if (!opts.dryRun) {
      // Remove stale view entry
      try {
        await rm(entry.viewPath, { force: true });
        issue.fixed = true;
        result.issuesFixed++;
        logger?.info('Removed stale view entry', { messageId: entry.messageId });
      } catch (error) {
        issue.fixed = false;
        logger?.error('Failed to remove stale view', {
          messageId: entry.messageId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    result.issues.push(issue);
  }
  
  if (signal?.aborted) return result;
  
  // Check for corrupted messages (invalid JSON or checksum mismatch)
  if (opts.verifyChecksums) {
    for (let i = 0; i < messages.length; i++) {
      const messageId = messages[i];
      const messagePath = join(rootDir, 'messages', encodeURIComponent(messageId));
      
      await onProgress?.({
        phase: 'verify',
        current: i + 1,
        total: messages.length,
        details: `Verifying ${messageId}`,
      });
      
      const verification = await verifyMessageChecksum(messagePath);
      
      if (!verification.valid) {
        result.issuesFound++;
        
        const issue = {
          type: 'corrupted' as const,
          path: messagePath,
          messageId,
          fixed: false,
          error: verification.error,
        };
        
        // Corrupted messages can't be auto-fixed - log for manual intervention
        logger?.error('Found corrupted message', {
          messageId,
          error: verification.error,
        });
        
        result.issues.push(issue);
      }
      
      if (signal?.aborted) break;
    }
  }
  
  if (signal?.aborted) return result;
  
  // Check for stale tombstones
  const staleTombstones = await findStaleTombstones(rootDir, messages, tombstones);
  for (const tombstoneId of staleTombstones) {
    result.issuesFound++;
    const tombstonePath = join(rootDir, 'tombstones', `${encodeURIComponent(tombstoneId)}.json`);
    
    const issue = {
      type: 'stale_tombstone' as const,
      path: tombstonePath,
      messageId: tombstoneId,
      fixed: false,
    };
    
    if (!opts.dryRun) {
      try {
        await rm(tombstonePath, { force: true });
        issue.fixed = true;
        result.issuesFixed++;
        logger?.info('Removed stale tombstone', { messageId: tombstoneId });
      } catch (error) {
        issue.fixed = false;
        logger?.error('Failed to remove stale tombstone', {
          messageId: tombstoneId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    result.issues.push(issue);
  }
  
  if (signal?.aborted) return result;
  
  // Rebuild views if requested
  if (opts.rebuildViews && !opts.dryRun) {
    await onProgress?.({ phase: 'rebuild', current: 0, total: 1, details: 'Rebuilding views' });
    
    try {
      const { FileViewStore } = await import('../persistence/views.js');
      const viewStore = new FileViewStore({ rootDir });
      await viewStore.rebuildAll();
      
      result.viewsRebuilt = true;
      logger?.info('Views rebuilt successfully');
    } catch (error) {
      logger?.error('Failed to rebuild views', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  logger?.info('Vacuum complete', {
    issuesFound: result.issuesFound,
    issuesFixed: result.issuesFixed,
    viewsRebuilt: result.viewsRebuilt,
  });
  
  return result;
}
