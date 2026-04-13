import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileLogger, type LogEntry } from '../../../src/logging/index.js';

describe('File Logger', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'log-test-'));
  });

  afterEach(async () => {
    // Cleanup is handled by OS temp cleanup
  });

  describe('basic logging', () => {
    it('should create log file', async () => {
      const transport = createFileLogger({
        directory: tempDir,
        maxSize: '1MB',
        maxFiles: 3,
        compress: false,
      });

      await transport.init();
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Test message',
        context: 'Test',
      };

      transport.write(entry);
      await transport.close();

      const files = await readdir(tempDir);
      expect(files).toContain('exchange-sync.log');

      const content = await readFile(join(tempDir, 'exchange-sync.log'), 'utf8');
      const parsed = JSON.parse(content);
      expect(parsed.message).toBe('Test message');
    });

    it('should write multiple entries as JSON lines', async () => {
      const transport = createFileLogger({
        directory: tempDir,
        maxSize: '1MB',
        maxFiles: 3,
        compress: false,
      });

      await transport.init();

      for (let i = 0; i < 3; i++) {
        transport.write({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Message ${i}`,
          context: 'Test',
        });
      }

      await transport.close();

      const content = await readFile(join(tempDir, 'exchange-sync.log'), 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);

      for (let i = 0; i < 3; i++) {
        const parsed = JSON.parse(lines[i]);
        expect(parsed.message).toBe(`Message ${i}`);
      }
    });
  });

  describe('rotation', () => {
    it('should rotate when size limit exceeded', async () => {
      const transport = createFileLogger({
        directory: tempDir,
        maxSize: '100B',
        maxFiles: 3,
        compress: false,
      });

      await transport.init();

      // Write entries until rotation occurs
      for (let i = 0; i < 10; i++) {
        transport.write({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `This is a long message to trigger rotation ${i}`,
          context: 'Test',
        });
      }

      await transport.close();

      const files = await readdir(tempDir);
      expect(files.length).toBeGreaterThan(1);
      
      // Should have rotated files
      expect(files.some(f => f.match(/\.log\.\d+$/))).toBe(true);
    });

    it('should respect maxFiles limit', async () => {
      const transport = createFileLogger({
        directory: tempDir,
        maxSize: '50B',
        maxFiles: 2,
        compress: false,
      });

      await transport.init();

      // Write many entries to trigger multiple rotations
      for (let i = 0; i < 20; i++) {
        transport.write({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Message ${i} with enough content to rotate quickly`,
          context: 'Test',
        });
      }

      await transport.close();

      const files = await readdir(tempDir);
      const rotatedFiles = files.filter(f => f.match(/\.log\.\d+$/));
      
      // Should have at most maxFiles rotated files
      expect(rotatedFiles.length).toBeLessThanOrEqual(2);
    });

    it('should compress rotated files when enabled', async () => {
      const transport = createFileLogger({
        directory: tempDir,
        maxSize: '50B',
        maxFiles: 3,
        compress: true,
      });

      await transport.init();

      // Write until rotation
      for (let i = 0; i < 10; i++) {
        transport.write({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Message to trigger rotation ${i}`,
          context: 'Test',
        });
      }

      await transport.close();

      const files = await readdir(tempDir);
      expect(files.some(f => f.endsWith('.gz'))).toBe(true);
    });
  });

  describe('size parsing', () => {
    it('should parse various size formats', async () => {
      // These should not throw
      const sizes = ['100B', '10KB', '5MB', '1GB', '100'];
      
      for (const size of sizes) {
        const transport = createFileLogger({
          directory: tempDir,
          maxSize: size,
          maxFiles: 3,
          compress: false,
        });

        await transport.init();
        await transport.close();
      }
    });

    it('should throw on invalid size format', () => {
      expect(() => createFileLogger({
        directory: tempDir,
        maxSize: 'invalid',
        maxFiles: 3,
        compress: false,
      })).toThrow('Invalid size format');
    });
  });

  describe('custom filename', () => {
    it('should use custom filename', async () => {
      const transport = createFileLogger({
        directory: tempDir,
        maxSize: '1MB',
        maxFiles: 3,
        compress: false,
        filename: 'custom-app',
      });

      await transport.init();

      transport.write({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Test',
        context: 'Test',
      });

      await transport.close();

      const files = await readdir(tempDir);
      expect(files).toContain('custom-app.log');
    });
  });
});
