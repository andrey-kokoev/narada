/**
 * Logging module exports
 *
 * Provides structured logging with multiple transports and formats.
 */

export type {
  Logger,
  LogEntry,
  LogLevel,
  LogError,
  LogTransport,
  LoggerConfig,
} from './types.js';

export {
  LOG_LEVELS,
  LOG_LEVEL_SEVERITY,
  shouldLog,
} from './types.js';

export {
  createLogger,
  configureLogging,
  getLoggingConfig,
  resetLogging,
  setLogLevel,
  setLogFormat,
} from './structured.js';

export {
  FileTransport,
  createFileLogger,
  getDefaultLogDirectory,
  type FileLoggerConfig,
} from './file.js';
