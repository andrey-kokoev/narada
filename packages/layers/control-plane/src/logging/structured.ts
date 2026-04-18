/**
 * Structured logging implementation
 *
 * Replaces console.* with type-safe, context-aware logging.
 * Supports multiple output formats (pretty/JSON) and transports.
 */

import {
  type Logger,
  type LogEntry,
  type LogLevel,
  type LogTransport,
  type LoggerConfig,
  shouldLog,
  LOG_LEVELS,
} from './types.js';

/** Default logger configuration */
const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: 'info',
  format: 'auto',
  transports: [],
};

/** Current global configuration */
let globalConfig: LoggerConfig = { ...DEFAULT_CONFIG };

/** PII-sensitive fields that should be sanitized */
const PII_FIELDS = new Set([
  'subject',
  'email',
  'from',
  'to',
  'cc',
  'bcc',
  'sender',
  'recipient',
  'address',
  'displayName',
  'userPrincipalName',
  'mail',
]);

/**
 * Sanitize metadata to remove PII
 *
 * Replaces sensitive values with [REDACTED] to prevent
 * leaking personal information in logs.
 */
function sanitizeMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(meta)) {
    const lowerKey = key.toLowerCase();

    if (PII_FIELDS.has(key) || PII_FIELDS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Format a log entry as pretty-printed text (for development)
 */
function formatPretty(entry: LogEntry): string {
  const colorCodes: Record<LogLevel, string> = {
    debug: '\x1b[36m', // Cyan
    info: '\x1b[32m',  // Green
    warn: '\x1b[33m',  // Yellow
    error: '\x1b[31m', // Red
  };
  const reset = '\x1b[0m';

  const levelStr = `${colorCodes[entry.level]}${entry.level.toUpperCase()}${reset}`;
  const timestamp = new Date(entry.timestamp).toISOString().slice(11, 23); // HH:MM:SS.mmm
  const context = `\x1b[90m[${entry.context}]${reset}`;

  let msg = `${timestamp} ${levelStr} ${context} ${entry.message}`;

  if (entry.operation) {
    msg += ` \x1b[90m(${entry.operation})${reset}`;
  }
  if (entry.durationMs !== undefined) {
    msg += ` \x1b[90m${entry.durationMs.toFixed(1)}ms${reset}`;
  }
  if (entry.error) {
    msg += `\n  \x1b[31m${entry.error.code}: ${entry.error.message}${reset}`;
    if (entry.error.stack) {
      msg += `\n  ${entry.error.stack.split('\n').slice(1, 3).join('\n  ')}`;
    }
  }
  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    const meta = Object.entries(entry.metadata)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ');
    msg += `\n  \x1b[90m${meta}${reset}`;
  }

  return msg;
}

/**
 * Format a log entry as JSON (for production)
 */
function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Console transport - writes to stdout/stderr
 */
class ConsoleTransport implements LogTransport {
  write(entry: LogEntry): void {
    const isDevelopment = globalConfig.format === 'pretty' ||
      (globalConfig.format === 'auto' && process.env.NODE_ENV !== 'production');

    if (isDevelopment) {
      // eslint-disable-next-line no-console
      console.error(formatPretty(entry));
    } else {
      // JSON to stderr for structured logging
      // eslint-disable-next-line no-console
      console.error(formatJson(entry));
    }
  }
}

/**
 * Create a log entry
 */
function createEntry(
  level: LogLevel,
  context: string,
  message: string,
  meta?: Record<string, unknown>,
  error?: Error,
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    metadata: meta ? sanitizeMetadata(meta) : undefined,
  };

  if (error) {
    entry.error = {
      code: (error as Error & { code?: string }).code || 'UNKNOWN_ERROR',
      message: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    };
  }

  return entry;
}

/**
 * Internal logger implementation
 */
class StructuredLogger implements Logger {
  readonly context: string;

  constructor(context: string) {
    this.context = context;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.log('error', message, meta, error);
  }

  child(childContext: string): Logger {
    return new StructuredLogger(`${this.context}.${childContext}`);
  }

  private log(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
    error?: Error,
  ): void {
    if (!shouldLog(level, globalConfig.minLevel)) {
      return;
    }

    const entry = createEntry(level, this.context, message, meta, error);

    for (const transport of globalConfig.transports) {
      try {
        transport.write(entry);
      } catch {
        // Transport failures shouldn't break application
        // Fall back to console if all transports fail
      }
    }

    // Fallback if no transports configured
    if (globalConfig.transports.length === 0) {
      new ConsoleTransport().write(entry);
    }
  }
}

/**
 * Create a new logger with the given context
 *
 * Example:
 * ```typescript
 * const logger = createLogger('GraphAdapter');
 * logger.info('Fetching messages', { count: 10 });
 * ```
 */
export function createLogger(context: string): Logger {
  return new StructuredLogger(context);
}

/**
 * Configure the global logger
 *
 * Call this once at application startup.
 */
export function configureLogging(config: Partial<LoggerConfig>): void {
  globalConfig = {
    ...globalConfig,
    ...config,
  };

  // Auto-add console transport if none provided
  if (globalConfig.transports.length === 0) {
    globalConfig.transports = [new ConsoleTransport()];
  }
}

/**
 * Get current logging configuration
 */
export function getLoggingConfig(): LoggerConfig {
  return { ...globalConfig };
}

/**
 * Reset to default configuration (useful for testing)
 */
export function resetLogging(): void {
  const existingTransports = globalConfig.transports;
  globalConfig = {
    ...DEFAULT_CONFIG,
    transports: existingTransports.length > 0 ? existingTransports : [new ConsoleTransport()],
  };
}

/**
 * Set log level from string
 */
export function setLogLevel(level: string): void {
  if (!LOG_LEVELS.includes(level as LogLevel)) {
    throw new Error(`Invalid log level: ${level}. Valid: ${LOG_LEVELS.join(', ')}`);
  }
  globalConfig.minLevel = level as LogLevel;
}

/**
 * Set log format from string
 */
export function setLogFormat(format: string): void {
  if (format !== 'pretty' && format !== 'json' && format !== 'auto') {
    throw new Error(`Invalid log format: ${format}. Valid: pretty, json, auto`);
  }
  globalConfig.format = format as 'pretty' | 'json' | 'auto';
}

// Initialize with defaults
resetLogging();

// Re-export types
export type { Logger, LogEntry, LogLevel, LogTransport, LoggerConfig };
