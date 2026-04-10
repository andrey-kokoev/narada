/**
 * Structured logging types and interfaces
 *
 * Provides type-safe, context-aware logging throughout the application.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogError {
  /** Error code (machine-readable) */
  code: string;
  /** Error message (human-readable) */
  message: string;
  /** Stack trace (development only) */
  stack?: string;
}

export interface LogEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Log level */
  level: LogLevel;
  /** Human-readable message */
  message: string;
  /** Component/context (e.g., "GraphAdapter", "SyncRunner") */
  context: string;
  /** Operation being performed */
  operation?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Error details if level is 'error' */
  error?: LogError;
  /** Additional structured metadata */
  metadata?: Record<string, unknown>;
}

export interface Logger {
  /**
   * Debug-level logging for development
   * Only emitted when log level is 'debug'
   */
  debug(message: string, meta?: Record<string, unknown>): void;

  /**
   * Info-level logging for normal operations
   */
  info(message: string, meta?: Record<string, unknown>): void;

  /**
   * Warning-level logging for recoverable issues
   */
  warn(message: string, meta?: Record<string, unknown>): void;

  /**
   * Error-level logging for failures
   */
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;

  /**
   * Create a child logger with additional context
   */
  child(context: string): Logger;

  /**
   * Get the current context string
   */
  readonly context: string;
}

export interface LogTransport {
  /** Write a log entry */
  write(entry: LogEntry): void;
  /** Flush any buffered entries */
  flush?(): Promise<void>;
}

export interface LoggerConfig {
  /** Minimum log level to emit */
  minLevel: LogLevel;
  /** Output format */
  format: 'pretty' | 'json' | 'auto';
  /** Transport(s) to use */
  transports: LogTransport[];
}

/** Log levels ordered by severity (lowest to highest) */
export const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** Numeric severity for comparison */
export const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Check if a log level should be emitted given a minimum level
 */
export function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVEL_SEVERITY[level] >= LOG_LEVEL_SEVERITY[minLevel];
}
