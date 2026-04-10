import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createLogger,
  configureLogging,
  resetLogging,
  setLogLevel,
  setLogFormat,
  shouldLog,
  LOG_LEVELS,
  type LogEntry,
  type LogTransport,
} from '../../../src/logging/index.js';

describe('Structured Logging', () => {
  let mockTransport: LogTransport;
  let loggedEntries: LogEntry[];

  beforeEach(() => {
    loggedEntries = [];
    mockTransport = {
      write: vi.fn((entry: LogEntry) => {
        loggedEntries.push(entry);
      }),
    };
    resetLogging();
    configureLogging({
      minLevel: 'debug',
      format: 'json',
      transports: [mockTransport],
    });
  });

  describe('createLogger', () => {
    it('should create logger with context', () => {
      const logger = createLogger('TestContext');
      expect(logger.context).toBe('TestContext');
    });

    it('should log at different levels', () => {
      const logger = createLogger('Test');

      logger.debug('debug message', { key: 'value' });
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message', new Error('test error'));

      expect(loggedEntries).toHaveLength(4);
      expect(loggedEntries[0].level).toBe('debug');
      expect(loggedEntries[1].level).toBe('info');
      expect(loggedEntries[2].level).toBe('warn');
      expect(loggedEntries[3].level).toBe('error');
    });

    it('should include context in log entries', () => {
      const logger = createLogger('MyComponent');
      logger.info('test');

      expect(loggedEntries[0].context).toBe('MyComponent');
    });

    it('should include timestamp', () => {
      const logger = createLogger('Test');
      logger.info('test');

      expect(loggedEntries[0].timestamp).toBeDefined();
      const timestamp = new Date(loggedEntries[0].timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });

    it('should include metadata', () => {
      const logger = createLogger('Test');
      logger.info('test', { count: 42, name: 'test' });

      expect(loggedEntries[0].metadata).toEqual({ count: 42, name: 'test' });
    });

    it('should sanitize PII in metadata', () => {
      const logger = createLogger('Test');
      logger.info('test', {
        subject: 'Secret Subject',
        email: 'user@example.com',
        normalField: 'visible',
      });

      expect(loggedEntries[0].metadata).toEqual({
        subject: '[REDACTED]',
        email: '[REDACTED]',
        normalField: 'visible',
      });
    });

    it('should include error details', () => {
      const logger = createLogger('Test');
      const error = new Error('Something went wrong');
      (error as Error & { code: string }).code = 'ERR_TEST';
      
      logger.error('Failed', error);

      expect(loggedEntries[0].error).toBeDefined();
      expect(loggedEntries[0].error!.code).toBe('ERR_TEST');
      expect(loggedEntries[0].error!.message).toBe('Something went wrong');
    });
  });

  describe('child logger', () => {
    it('should create child with extended context', () => {
      const parent = createLogger('Parent');
      const child = parent.child('Child');

      expect(child.context).toBe('Parent.Child');
    });

    it('should inherit configuration', () => {
      const parent = createLogger('Parent');
      const child = parent.child('Child');

      child.info('test');
      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].context).toBe('Parent.Child');
    });
  });

  describe('log levels', () => {
    it('should filter by minimum level', () => {
      setLogLevel('warn');
      const logger = createLogger('Test');

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(loggedEntries).toHaveLength(2);
      expect(loggedEntries[0].level).toBe('warn');
      expect(loggedEntries[1].level).toBe('error');
    });

    it('should validate log level', () => {
      expect(() => setLogLevel('invalid')).toThrow('Invalid log level');
    });

    it('should have all log levels defined', () => {
      expect(LOG_LEVELS).toEqual(['debug', 'info', 'warn', 'error']);
    });
  });

  describe('shouldLog', () => {
    it('should return true for equal severity', () => {
      expect(shouldLog('info', 'info')).toBe(true);
    });

    it('should return true for higher severity', () => {
      expect(shouldLog('error', 'info')).toBe(true);
    });

    it('should return false for lower severity', () => {
      expect(shouldLog('debug', 'info')).toBe(false);
    });
  });

  describe('log format', () => {
    it('should validate format', () => {
      expect(() => setLogFormat('invalid')).toThrow('Invalid log format');
    });

    it('should accept valid formats', () => {
      expect(() => setLogFormat('pretty')).not.toThrow();
      expect(() => setLogFormat('json')).not.toThrow();
      expect(() => setLogFormat('auto')).not.toThrow();
    });
  });

  describe('transport error handling', () => {
    it('should not throw on transport failure', () => {
      const failingTransport: LogTransport = {
        write: vi.fn(() => {
          throw new Error('Transport failed');
        }),
      };

      configureLogging({
        minLevel: 'info',
        format: 'json',
        transports: [failingTransport],
      });

      const logger = createLogger('Test');
      
      // Should not throw
      expect(() => logger.info('test')).not.toThrow();
    });
  });

  describe('resetLogging', () => {
    it('should reset to defaults', () => {
      setLogLevel('error');
      resetLogging();
      
      const logger = createLogger('Test');
      logger.debug('debug');
      logger.info('info');

      // Should use default level (info)
      expect(loggedEntries).toHaveLength(1);
    });
  });
});
