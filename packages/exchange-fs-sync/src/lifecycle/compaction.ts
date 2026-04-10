/**
 * Message compaction/archival module
 * 
 * Archives old messages to a separate location with optional compression.
 */

import { mkdir, readdir, stat, rename, createReadStream, createWriteStream } from 'node:fs';
import { rm, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import type { CompactionOptions, CompactionResult, CleanupContext } from './types.js';
import type { MessageStore, ViewStore } from '../types/runtime.js';

/**
 * Default compaction options
 */
const DEFAULT_OPTIONS: CompactionOptions = {
  archiveAfterDays: 90,
  archiveDir: 'archive',
  compress: true,
};

interface MessageEntry {
  messageId: string;
  path: string;
  modifiedAt: Date;
  size: number;
}

/**
 * Get message modified time from record.json or directory mtime
 */
async function getMessageTimestamp(messagePath: string): Promise<Date> {
  try {
    const recordPath = join(messagePath, 'record.json');
    const content = await readFile(recordPath, 'utf8');
    const record = JSON.parse(content) as { _checksum?: string };
    // Use record modification time (simplified - could parse from record)
    const stats = await stat(recordPath);
    return stats.mtime;
  } catch {
    const stats = await stat(messagePath);
    return stats.mtime;
  }
}

/**
 * Calculate total size of a message directory
 */
async function calculateMessageSize(messagePath: string): Promise<number> {
  let total = 0;
  
  async function scan(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await scan(path);
      } else {
        const s = await stat(path);
        total += s.size;
      }
    }
  }
  
  try {
    await scan(messagePath);
  } catch {
    // Ignore errors
  }
  
  return total;
}

/**
 * List all messages in the store
 */
async function listMessages(rootDir: string): Promise<MessageEntry[]> {
  const messagesDir = join(rootDir, 'messages');
  const entries: MessageEntry[] = [];
  
  try {
    const dirs = await readdir(messagesDir, { withFileTypes: true });
    
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      
      const messageId = decodeURIComponent(dir.name);
      const path = join(messagesDir, dir.name);
      const modifiedAt = await getMessageTimestamp(path);
      const size = await calculateMessageSize(path);
      
      entries.push({ messageId, path, modifiedAt, size });
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  
  return entries;
}

/**
 * Compress a directory to a gzipped tar-like structure (simplified: just gzip the record)
 */
async function compressMessage(
  sourcePath: string,
  destPath: string
): Promise<void> {
  const archivePath = `${destPath}.tar.gz`;
  await mkdir(destPath, { recursive: true });
  
  // For simplicity, we'll gzip individual files
  // In production, you'd use tar-stream or similar
  const files = await readdir(sourcePath, { recursive: true });
  
  for (const file of files) {
    const sourceFile = join(sourcePath, file);
    const destFile = join(destPath, `${file}.gz`);
    
    // Ensure parent directory exists
    await mkdir(destFile.split('/').slice(0, -1).join('/'), { recursive: true });
    
    await pipeline(
      createReadStream(sourceFile),
      createGzip(),
      createWriteStream(destFile)
    );
  }
}

/**
 * Archive a single message
 */
async function archiveMessage(
  message: MessageEntry,
  archiveDir: string,
  compress: boolean
): Promise<{ bytesArchived: number; error?: string }> {
  const archiveMessageDir = join(archiveDir, encodeURIComponent(message.messageId));
  
  try {
    await mkdir(archiveMessageDir, { recursive: true });
    
    if (compress) {
      await compressMessage(message.path, archiveMessageDir);
    } else {
      // Simple copy - in production use recursive copy
      const { cp } = await import('node:fs/promises');
      await cp(message.path, archiveMessageDir, { recursive: true });
    }
    
    // Remove original after successful archive
    await rm(message.path, { recursive: true, force: true });
    
    return { bytesArchived: message.size };
  } catch (error) {
    // Clean up partial archive
    await rm(archiveMessageDir, { recursive: true, force: true });
    
    return {
      bytesArchived: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Compact old messages by archiving them
 */
export async function compactMessages(
  messageStore: MessageStore,
  viewStore: ViewStore,
  rootDir: string,
  options: Partial<CompactionOptions> = {},
  context: CleanupContext = {}
): Promise<CompactionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { signal, onProgress, logger } = context;
  
  // Resolve archive directory
  const archiveDir = join(rootDir, opts.archiveDir);
  
  logger?.info('Starting message compaction', {
    archiveAfterDays: opts.archiveAfterDays,
    archiveDir: opts.archiveDir,
    compress: opts.compress,
  });
  
  const result: CompactionResult = {
    messagesArchived: 0,
    messagesDeleted: 0,
    bytesBefore: 0,
    bytesAfter: 0,
    errors: [],
  };
  
  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - opts.archiveAfterDays);
  
  // List all messages
  const messages = await listMessages(rootDir);
  result.bytesBefore = messages.reduce((sum, m) => sum + m.size, 0);
  
  // Filter old messages
  const oldMessages = messages.filter(m => m.modifiedAt < cutoffDate);
  
  logger?.info(`Found ${oldMessages.length} messages older than ${opts.archiveAfterDays} days`);
  
  // Archive each old message
  for (let i = 0; i < oldMessages.length; i++) {
    if (signal?.aborted) {
      logger?.info('Compaction aborted by signal');
      break;
    }
    
    const message = oldMessages[i];
    
    await onProgress?.({
      phase: 'compaction',
      current: i + 1,
      total: oldMessages.length,
      details: `Archiving ${message.messageId}`,
    });
    
    const archiveResult = await archiveMessage(
      message,
      archiveDir,
      opts.compress
    );
    
    if (archiveResult.error) {
      result.errors.push({
        messageId: message.messageId,
        error: archiveResult.error,
      });
      logger?.error('Failed to archive message', {
        messageId: message.messageId,
        error: archiveResult.error,
      });
    } else {
      result.messagesArchived++;
      logger?.info('Archived message', {
        messageId: message.messageId,
        bytes: archiveResult.bytesArchived,
      });
    }
  }
  
  // Calculate final size
  const remainingMessages = await listMessages(rootDir);
  result.bytesAfter = remainingMessages.reduce((sum, m) => sum + m.size, 0);
  
  logger?.info('Compaction complete', {
    archived: result.messagesArchived,
    bytesBefore: result.bytesBefore,
    bytesAfter: result.bytesAfter,
    saved: result.bytesBefore - result.bytesAfter,
    errors: result.errors.length,
  });
  
  return result;
}

/**
 * Get compaction statistics
 */
export async function getCompactionStats(
  rootDir: string,
  archiveDir: string
): Promise<{
  totalMessages: number;
  archivableMessages: number;
  archiveSize: number;
  oldestMessage: Date | null;
}> {
  const messages = await listMessages(rootDir);
  
  // Check archive size
  let archiveSize = 0;
  try {
    const archivePath = join(rootDir, archiveDir);
    const entries = await readdir(archivePath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const size = await calculateMessageSize(join(archivePath, entry.name));
        archiveSize += size;
      }
    }
  } catch {
    // Archive doesn't exist yet
  }
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90); // Default 90 days
  
  const sorted = [...messages].sort((a, b) => 
    a.modifiedAt.getTime() - b.modifiedAt.getTime()
  );
  
  return {
    totalMessages: messages.length,
    archivableMessages: messages.filter(m => m.modifiedAt < cutoffDate).length,
    archiveSize,
    oldestMessage: sorted[0]?.modifiedAt ?? null,
  };
}
