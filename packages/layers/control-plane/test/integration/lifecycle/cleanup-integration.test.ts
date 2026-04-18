/**
 * Integration tests for lifecycle cleanup operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  cleanupTombstones,
  vacuum,
  getTombstoneStats,
} from '../../../src/lifecycle/index.js';
import { FileTombstoneStore } from '../../../src/persistence/tombstones.js';
import type { ExchangeFsSyncConfig } from '../../../src/config/types.js';

describe('lifecycle cleanup integration', () => {
  const rootDir = '/test-data';
  
  const baseConfig: ExchangeFsSyncConfig = {
    mailbox_id: 'test@example.com',
    root_dir: rootDir,
    graph: {
      user_id: 'test@example.com',
      prefer_immutable_ids: true,
    },
    scope: {
      included_container_refs: ['inbox'],
      included_item_kinds: ['message'],
    },
    normalize: {
      attachment_policy: 'metadata_only',
      body_policy: 'text_only',
      include_headers: false,
      tombstones_enabled: true,
    },
    runtime: {
      polling_interval_ms: 60000,
      acquire_lock_timeout_ms: 30000,
      cleanup_tmp_on_startup: true,
      rebuild_views_after_sync: false,
    },
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
  };
  
  beforeEach(() => {
    vol.reset();
    vol.mkdirSync(rootDir, { recursive: true });
  });
  
  describe('tombstone cleanup', () => {
    it('should remove old tombstones in dry-run mode', async () => {
      const store = new FileTombstoneStore({ rootDir });
      
      // Create an old tombstone (45 days ago)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);
      
      const tombstoneDir = `${rootDir}/tombstones`;
      vol.mkdirSync(tombstoneDir, { recursive: true });
      vol.writeFileSync(
        `${tombstoneDir}/old-message.json`,
        JSON.stringify({
          message_id: 'old-message',
          mailbox_id: 'test@example.com',
          deleted_by_event_id: 'event-1',
          observed_at: oldDate.toISOString(),
        })
      );
      
      const result = await cleanupTombstones(store, rootDir, {
        maxTombstoneAgeDays: 30,
        dryRun: true,
      });
      
      expect(result.tombstonesRemoved).toBe(1);
      expect(result.bytesReclaimed).toBeGreaterThan(0);
      // File should still exist in dry-run mode
      expect(vol.existsSync(`${tombstoneDir}/old-message.json`)).toBe(true);
    });
    
    it('should not remove tombstones if message still exists', async () => {
      const store = new FileTombstoneStore({ rootDir });
      
      // Create an old tombstone
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);
      
      const tombstoneDir = `${rootDir}/tombstones`;
      const messagesDir = `${rootDir}/messages`;
      vol.mkdirSync(tombstoneDir, { recursive: true });
      vol.mkdirSync(`${messagesDir}/old-message`, { recursive: true });
      
      vol.writeFileSync(
        `${tombstoneDir}/old-message.json`,
        JSON.stringify({
          message_id: 'old-message',
          mailbox_id: 'test@example.com',
          deleted_by_event_id: 'event-1',
          observed_at: oldDate.toISOString(),
        })
      );
      
      const result = await cleanupTombstones(store, rootDir, {
        maxTombstoneAgeDays: 30,
        dryRun: false,
      });
      
      expect(result.tombstonesRemoved).toBe(0);
      // Tombstone should still exist because message exists
      expect(vol.existsSync(`${tombstoneDir}/old-message.json`)).toBe(true);
    });
    
    it('should get tombstone statistics', async () => {
      const tombstoneDir = `${rootDir}/tombstones`;
      vol.mkdirSync(tombstoneDir, { recursive: true });
      
      // Create multiple tombstones
      for (let i = 0; i < 5; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i * 10);
        vol.writeFileSync(
          `${tombstoneDir}/message-${i}.json`,
          JSON.stringify({
            message_id: `message-${i}`,
            observed_at: date.toISOString(),
          })
        );
      }
      
      const stats = await getTombstoneStats(rootDir);
      
      expect(stats.total).toBe(5);
      expect(stats.totalBytes).toBeGreaterThan(0);
      expect(stats.oldest).toBeInstanceOf(Date);
      expect(stats.newest).toBeInstanceOf(Date);
    });
  });
  
  describe('vacuum', () => {
    it('should find orphaned messages in dry-run mode', async () => {
      // Create a message without view entries
      const messagesDir = `${rootDir}/messages`;
      vol.mkdirSync(`${messagesDir}/orphan-message`, { recursive: true });
      vol.writeFileSync(
        `${messagesDir}/orphan-message/record.json`,
        JSON.stringify({
          message_id: 'orphan-message',
          conversation_id: 'conv-1',
          folder_refs: ['inbox'],
          flags: { is_read: true, is_flagged: false },
        })
      );
      
      // Create views directory (empty - no symlinks)
      vol.mkdirSync(`${rootDir}/views`, { recursive: true });
      
      const result = await vacuum(baseConfig, {
        rebuildViews: false,
        verifyChecksums: false,
        removeOrphans: true,
        dryRun: true,
      });
      
      expect(result.issuesFound).toBeGreaterThan(0);
      expect(result.issuesFixed).toBe(0); // Dry-run
      expect(result.issues.some(i => i.type === 'orphan')).toBe(true);
    });
    
    it('should find stale tombstones', async () => {
      // Create a tombstone without a message
      const tombstoneDir = `${rootDir}/tombstones`;
      vol.mkdirSync(tombstoneDir, { recursive: true });
      vol.writeFileSync(
        `${tombstoneDir}/deleted-message.json`,
        JSON.stringify({
          message_id: 'deleted-message',
          observed_at: new Date().toISOString(),
        })
      );
      
      // Create messages directory (empty)
      vol.mkdirSync(`${rootDir}/messages`, { recursive: true });
      
      const result = await vacuum(baseConfig, {
        rebuildViews: false,
        verifyChecksums: false,
        removeOrphans: false,
        dryRun: true,
      });
      
      expect(result.issues.some(i => i.type === 'stale_tombstone')).toBe(true);
    });
  });
});
