/**
 * Tests for cleanup CLI command
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanupCommand } from '../src/commands/cleanup.js';
import type { CommandContext } from '../src/lib/command-wrapper.js';

// Mock the core package exports used by cleanup.ts
vi.mock('@narada2/exchange-fs-sync', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    mailbox_id: 'test@example.com',
    root_dir: '/test-data',
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
        frequency: 'weekly',
        max_run_time_minutes: 60,
      },
    },
  }),
  cleanupTombstones: vi.fn().mockResolvedValue({
    tombstonesRemoved: 5,
    bytesReclaimed: 1024,
    errors: [],
  }),
  compactMessages: vi.fn().mockResolvedValue({
    messagesArchived: 10,
    messagesDeleted: 0,
    bytesBefore: 10000,
    bytesAfter: 5000,
    errors: [],
  }),
  vacuum: vi.fn().mockResolvedValue({
    issuesFound: 2,
    issuesFixed: 2,
    viewsRebuilt: false,
    issues: [],
  }),
  applyRetentionPolicy: vi.fn().mockResolvedValue({
    messagesDeleted: 3,
    bytesFreed: 2048,
    preserved: 1,
    errors: [],
  }),
  getTombstoneStats: vi.fn().mockResolvedValue({
    total: 10,
    totalBytes: 2048,
    oldest: new Date('2024-01-01'),
    newest: new Date(),
  }),
  getCompactionStats: vi.fn().mockResolvedValue({
    totalMessages: 100,
    archivableMessages: 50,
    archiveSize: 50000,
    oldestMessage: new Date('2023-06-01'),
  }),
  getRetentionStats: vi.fn().mockResolvedValue({
    totalMessages: 100,
    totalSize: 1000000,
    flaggedCount: 5,
    unreadCount: 10,
    wouldDelete: 20,
    wouldPreserve: 5,
  }),
  FileTombstoneStore: vi.fn(),
  FileMessageStore: vi.fn(),
  FileViewStore: vi.fn(),
}));

describe('cleanup command', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  
  const baseContext: CommandContext = {
    configPath: './config.json',
    logger: mockLogger as unknown as CommandContext['logger'],
    format: 'human',
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should run all cleanup operations with --all', async () => {
    const result = await cleanupCommand(
      { all: true, dryRun: false },
      baseContext
    );
    
    expect(result.exitCode).toBe(0);
    expect(result.result).toMatchObject({
      status: 'success',
      dryRun: false,
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Starting cleanup operations',
      expect.any(Object)
    );
  });
  
  it('should run only tombstone cleanup with --tombstones', async () => {
    const result = await cleanupCommand(
      { tombstones: true, dryRun: false },
      baseContext
    );
    
    expect(result.exitCode).toBe(0);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Running tombstone cleanup...'
    );
  });
  
  it('should run in dry-run mode', async () => {
    const result = await cleanupCommand(
      { all: true, dryRun: true },
      baseContext
    );
    
    expect(result.exitCode).toBe(0);
    expect(result.result).toMatchObject({
      status: 'success',
      dryRun: true,
    });
  });
  
  it('should handle config loading errors', async () => {
    const { loadConfig } = await import('@narada2/exchange-fs-sync');
    vi.mocked(loadConfig).mockRejectedValueOnce(new Error('Config not found'));
    
    const result = await cleanupCommand(
      { all: true },
      baseContext
    );
    
    expect(result.exitCode).toBe(2); // INVALID_CONFIG
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('Config not found'),
    });
  });
});
