import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHealthWriter, writeHealthFile, type HealthFileData } from '../../src/health.js';

describe('Health File', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'health-test-'));
  });

  afterEach(async () => {
    // Cleanup handled by OS
  });

  describe('writeHealthFile', () => {
    it('should write health file with all fields', async () => {
      const data: Omit<HealthFileData, 'timestamp'> = {
        status: 'healthy',
        scopeId: 'test@example.com',
        lastSyncAt: new Date().toISOString(),
        eventsApplied: 10,
        eventsSkipped: 2,
        lastSyncDurationMs: 1500,
        consecutiveErrors: 0,
        totalErrors: 0,
        pid: 12345,
        metrics: {
          lastSyncDurationMs: 1500,
          messagesPerSecond: 6.67,
          errorRate: 0,
          consecutiveFailures: 0,
        },
        recentErrors: [],
      };

      await writeHealthFile(tempDir, data);

      const content = await readFile(join(tempDir, '.health.json'), 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.status).toBe('healthy');
      expect(parsed.scopeId).toBe('test@example.com');
      expect(parsed.eventsApplied).toBe(10);
      expect(parsed.metrics.messagesPerSecond).toBe(6.67);
      expect(parsed.timestamp).toBeDefined();
    });

    it('should include error information', async () => {
      const data: Omit<HealthFileData, 'timestamp'> = {
        status: 'error',
        scopeId: 'test@example.com',
        lastSyncAt: null,
        eventsApplied: 0,
        eventsSkipped: 0,
        lastSyncDurationMs: 0,
        consecutiveErrors: 1,
        totalErrors: 1,
        pid: 12345,
        error: 'Connection failed',
        metrics: {
          lastSyncDurationMs: 0,
          messagesPerSecond: 0,
          errorRate: 0.1,
          consecutiveFailures: 1,
        },
        recentErrors: [{
          timestamp: new Date().toISOString(),
          code: 'CONN_ERROR',
          message: 'Connection failed',
        }],
      };

      await writeHealthFile(tempDir, data);

      const content = await readFile(join(tempDir, '.health.json'), 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.status).toBe('error');
      expect(parsed.error).toBe('Connection failed');
      expect(parsed.recentErrors).toHaveLength(1);
    });
  });

  describe('createHealthWriter', () => {
    it('should mark success with metrics', async () => {
      const writer = createHealthWriter({
        rootDir: tempDir,
        scopeId: 'test@example.com',
      });

      await writer.markSuccess(50, 5, 2000);

      const content = await readFile(join(tempDir, '.health.json'), 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.status).toBe('healthy');
      expect(parsed.eventsApplied).toBe(50);
      expect(parsed.eventsSkipped).toBe(5);
      expect(parsed.lastSyncDurationMs).toBe(2000);
      expect(parsed.metrics.lastSyncDurationMs).toBe(2000);
      expect(parsed.metrics.messagesPerSecond).toBe(25); // 50 messages / 2 seconds
      expect(parsed.metrics.errorRate).toBe(0);
      expect(parsed.metrics.consecutiveFailures).toBe(0);
    });

    it('should mark error with metrics', async () => {
      const writer = createHealthWriter({
        rootDir: tempDir,
        scopeId: 'test@example.com',
      });

      await writer.markError(new Error('Sync failed'));

      const content = await readFile(join(tempDir, '.health.json'), 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.status).toBe('error');
      expect(parsed.error).toBe('Sync failed');
      expect(parsed.metrics.consecutiveFailures).toBe(1);
      expect(parsed.metrics.errorRate).toBe(0.1); // 1/10
      expect(parsed.recentErrors).toHaveLength(1);
      expect(parsed.recentErrors[0].message).toBe('Sync failed');
    });

    it('should track recent errors', async () => {
      const writer = createHealthWriter({
        rootDir: tempDir,
        scopeId: 'test@example.com',
      });

      // First error
      await writer.markError(new Error('Error 1'));

      // Second error with previous data
      const previousData: Partial<HealthFileData> = {
        recentErrors: [{
          timestamp: new Date().toISOString(),
          code: 'ERR_1',
          message: 'Error 1',
        }],
        totalErrors: 1,
        metrics: {
          consecutiveFailures: 1,
          errorRate: 0.1,
          lastSyncDurationMs: 1000,
          messagesPerSecond: 0,
        },
      };

      await writer.markError(new Error('Error 2'), previousData);

      const content = await readFile(join(tempDir, '.health.json'), 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.recentErrors).toHaveLength(2);
      expect(parsed.totalErrors).toBe(2);
      expect(parsed.metrics.consecutiveFailures).toBe(2);
    });

    it('should limit recent errors to 10', async () => {
      const writer = createHealthWriter({
        rootDir: tempDir,
        scopeId: 'test@example.com',
      });

      // Create 15 previous errors
      const previousErrors = Array.from({ length: 15 }, (_, i) => ({
        timestamp: new Date().toISOString(),
        code: `ERR_${i}`,
        message: `Error ${i}`,
      }));

      const previousData: Partial<HealthFileData> = {
        recentErrors: previousErrors,
        metrics: {
          consecutiveFailures: 15,
          errorRate: 1,
          lastSyncDurationMs: 0,
          messagesPerSecond: 0,
        },
      };

      await writer.markError(new Error('Latest error'), previousData);

      const content = await readFile(join(tempDir, '.health.json'), 'utf8');
      const parsed = JSON.parse(content);

      // Should keep only last 10
      expect(parsed.recentErrors.length).toBeLessThanOrEqual(10);
    });

    it('should preserve previous data on success', async () => {
      const writer = createHealthWriter({
        rootDir: tempDir,
        scopeId: 'test@example.com',
      });

      const previousData: Partial<HealthFileData> = {
        totalErrors: 3,
        recentErrors: [{
          timestamp: new Date().toISOString(),
          code: 'ERR_OLD',
          message: 'Old error',
        }],
      };

      await writer.markSuccess(10, 0, 1000, previousData);

      const content = await readFile(join(tempDir, '.health.json'), 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.totalErrors).toBe(3);
      expect(parsed.recentErrors).toHaveLength(1);
      expect(parsed.status).toBe('healthy');
    });

    it('should extract error code from error object', async () => {
      const writer = createHealthWriter({
        rootDir: tempDir,
        scopeId: 'test@example.com',
      });

      const error = new Error('Custom error') as Error & { code: string };
      error.code = 'CUSTOM_CODE';

      await writer.markError(error);

      const content = await readFile(join(tempDir, '.health.json'), 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.recentErrors[0].code).toBe('CUSTOM_CODE');
    });

    it('should allow custom write', async () => {
      const writer = createHealthWriter({
        rootDir: tempDir,
        scopeId: 'test@example.com',
      });

      await writer.write({
        status: 'stale',
        lastSyncAt: new Date().toISOString(),
        eventsApplied: 0,
        eventsSkipped: 0,
        lastSyncDurationMs: 0,
        consecutiveErrors: 0,
        totalErrors: 0,
        pid: process.pid,
        metrics: {
          lastSyncDurationMs: 0,
          messagesPerSecond: 0,
          errorRate: 0,
          consecutiveFailures: 0,
        },
        recentErrors: [],
      });

      const content = await readFile(join(tempDir, '.health.json'), 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.status).toBe('stale');
    });
  });
});
