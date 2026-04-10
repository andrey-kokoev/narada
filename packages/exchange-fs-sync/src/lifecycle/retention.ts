/**
 * Retention policy module
 * 
 * Applies configurable retention policies to messages.
 */

import { readdir, readFile, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { RetentionPolicy, RetentionResult, CleanupContext } from './types.js';
import type { MessageStore, ViewStore } from '../types/runtime.js';

/**
 * Default retention policy
 */
const DEFAULT_POLICY: RetentionPolicy = {
  preserveFlagged: true,
  preserveUnread: true,
};

interface MessageInfo {
  messageId: string;
  path: string;
  size: number;
  receivedAt: Date;
  isFlagged: boolean;
  isUnread: boolean;
}

/**
 * Parse size string like "10GB" to bytes
 */
export function parseSize(sizeStr: string): number {
  const units: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
    tb: 1024 ** 4,
  };
  
  const match = sizeStr.toLowerCase().trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)?$/);
  if (!match) {
    throw new Error(`Invalid size format: ${sizeStr}`);
  }
  
  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';
  
  return Math.floor(value * units[unit]);
}

/**
 * Get message info from record
 */
async function getMessageInfo(rootDir: string, encodedName: string): Promise<MessageInfo | null> {
  const messagePath = join(rootDir, 'messages', encodedName);
  
  try {
    const recordPath = join(messagePath, 'record.json');
    const content = await readFile(recordPath, 'utf8');
    const record = JSON.parse(content) as {
      message_id?: string;
      received_at?: string;
      flags?: { is_flagged?: boolean; is_read?: boolean };
    };
    
    // Calculate size
    let size = 0;
    async function calcSize(dir: string): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          await calcSize(path);
        } else {
          const s = await stat(path);
          size += s.size;
        }
      }
    }
    await calcSize(messagePath);
    
    return {
      messageId: record.message_id || decodeURIComponent(encodedName),
      path: messagePath,
      size,
      receivedAt: record.received_at ? new Date(record.received_at) : new Date(),
      isFlagged: record.flags?.is_flagged ?? false,
      isUnread: !(record.flags?.is_read ?? true),
    };
  } catch {
    return null;
  }
}

/**
 * List all messages with their info
 */
async function listMessagesWithInfo(rootDir: string): Promise<MessageInfo[]> {
  const messagesDir = join(rootDir, 'messages');
  const messages: MessageInfo[] = [];
  
  try {
    const entries = await readdir(messagesDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const info = await getMessageInfo(rootDir, entry.name);
      if (info) {
        messages.push(info);
      }
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
  }
  
  return messages;
}

/**
 * Determine which messages to delete based on retention policy
 */
function selectMessagesForDeletion(
  messages: MessageInfo[],
  policy: RetentionPolicy
): { toDelete: MessageInfo[]; preserved: number } {
  let candidates = [...messages];
  let preserved = 0;
  
  // Filter out protected messages
  candidates = candidates.filter(m => {
    if (policy.preserveFlagged && m.isFlagged) {
      preserved++;
      return false;
    }
    if (policy.preserveUnread && m.isUnread) {
      preserved++;
      return false;
    }
    return true;
  });
  
  // Sort by received date (oldest first for deletion)
  candidates.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  
  const toDelete: MessageInfo[] = [];
  
  // Apply max age
  if (policy.maxAgeDays !== undefined && policy.maxAgeDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - policy.maxAgeDays);
    
    const ageDeletions = candidates.filter(m => m.receivedAt < cutoff);
    toDelete.push(...ageDeletions);
    candidates = candidates.filter(m => m.receivedAt >= cutoff);
  }
  
  // Apply max total size
  if (policy.maxTotalSize !== undefined) {
    const maxBytes = parseSize(policy.maxTotalSize);
    const currentTotal = messages.reduce((sum, m) => sum + m.size, 0);
    
    if (currentTotal > maxBytes) {
      let bytesToFree = currentTotal - maxBytes;
      
      for (const message of candidates) {
        if (bytesToFree <= 0) break;
        if (!toDelete.includes(message)) {
          toDelete.push(message);
          bytesToFree -= message.size;
        }
      }
    }
  }
  
  // Apply max message count
  if (policy.maxMessageCount !== undefined && policy.maxMessageCount > 0) {
    const protectedCount = messages.length - candidates.length;
    const allowedDeletions = messages.length - policy.maxMessageCount - protectedCount;
    
    if (allowedDeletions > 0) {
      let deleted = 0;
      for (const message of candidates) {
        if (deleted >= allowedDeletions) break;
        if (!toDelete.includes(message)) {
          toDelete.push(message);
          deleted++;
        }
      }
    }
  }
  
  return { toDelete, preserved };
}

/**
 * Apply retention policy to messages
 */
export async function applyRetentionPolicy(
  messageStore: MessageStore,
  viewStore: ViewStore,
  rootDir: string,
  policy: Partial<RetentionPolicy> = {},
  context: CleanupContext = {}
): Promise<RetentionResult> {
  const fullPolicy = { ...DEFAULT_POLICY, ...policy };
  const { signal, onProgress, logger } = context;
  
  logger?.info('Applying retention policy', {
    maxAgeDays: fullPolicy.maxAgeDays,
    maxTotalSize: fullPolicy.maxTotalSize,
    maxMessageCount: fullPolicy.maxMessageCount,
    preserveFlagged: fullPolicy.preserveFlagged,
    preserveUnread: fullPolicy.preserveUnread,
  });
  
  const result: RetentionResult = {
    messagesDeleted: 0,
    bytesFreed: 0,
    preserved: 0,
    errors: [],
  };
  
  // List all messages
  const messages = await listMessagesWithInfo(rootDir);
  
  logger?.info(`Found ${messages.length} messages`, {
    flagged: messages.filter(m => m.isFlagged).length,
    unread: messages.filter(m => m.isUnread).length,
  });
  
  // Select messages for deletion
  const { toDelete, preserved } = selectMessagesForDeletion(messages, fullPolicy);
  result.preserved = preserved;
  
  logger?.info(`Selected ${toDelete.length} messages for deletion`, {
    totalSize: toDelete.reduce((sum, m) => sum + m.size, 0),
  });
  
  // Delete selected messages
  for (let i = 0; i < toDelete.length; i++) {
    if (signal?.aborted) {
      logger?.info('Retention policy application aborted');
      break;
    }
    
    const message = toDelete[i];
    
    await onProgress?.({
      phase: 'retention',
      current: i + 1,
      total: toDelete.length,
      details: `Deleting ${message.messageId}`,
    });
    
    try {
      // Remove from views first
      await viewStore.markDelete(message.messageId);
      
      // Remove message
      await messageStore.remove(message.messageId);
      
      result.messagesDeleted++;
      result.bytesFreed += message.size;
      
      logger?.info('Deleted message', {
        messageId: message.messageId,
        size: message.size,
        age: Math.floor((Date.now() - message.receivedAt.getTime()) / (1000 * 60 * 60 * 24)),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push({
        messageId: message.messageId,
        error: errorMsg,
      });
      logger?.error('Failed to delete message', {
        messageId: message.messageId,
        error: errorMsg,
      });
    }
  }
  
  logger?.info('Retention policy application complete', {
    deleted: result.messagesDeleted,
    bytesFreed: result.bytesFreed,
    preserved: result.preserved,
    errors: result.errors.length,
  });
  
  return result;
}

/**
 * Get retention policy statistics
 */
export async function getRetentionStats(
  rootDir: string,
  policy: Partial<RetentionPolicy> = {}
): Promise<{
  totalMessages: number;
  totalSize: number;
  flaggedCount: number;
  unreadCount: number;
  wouldDelete: number;
  wouldPreserve: number;
}> {
  const messages = await listMessagesWithInfo(rootDir);
  const fullPolicy = { ...DEFAULT_POLICY, ...policy };
  
  const { toDelete, preserved } = selectMessagesForDeletion(messages, fullPolicy);
  
  return {
    totalMessages: messages.length,
    totalSize: messages.reduce((sum, m) => sum + m.size, 0),
    flaggedCount: messages.filter(m => m.isFlagged).length,
    unreadCount: messages.filter(m => m.isUnread).length,
    wouldDelete: toDelete.length,
    wouldPreserve: preserved,
  };
}
