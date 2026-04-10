/**
 * Structured logging for daemon
 */

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  component?: string;
  meta?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
}

export interface LoggerOptions {
  component?: string;
  verbose?: boolean;
}

class ConsoleLogger implements Logger {
  private readonly component: string;
  private readonly verbose: boolean;

  constructor(options: LoggerOptions = {}) {
    this.component = options.component ?? 'daemon';
    this.verbose = options.verbose ?? false;
  }

  private log(level: LogEntry['level'], message: string, meta?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      component: this.component,
      ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
    };

    // Output structured JSON to stderr for logging
    console.error(JSON.stringify(entry));
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.verbose) {
      this.log('debug', message, meta);
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, unknown> = {}): void {
    const enrichedMeta: Record<string, unknown> = { ...meta };
    if (error) {
      enrichedMeta.error = error.message;
      if (this.verbose && error.stack) {
        enrichedMeta.stack = error.stack;
      }
    }
    this.log('error', message, enrichedMeta);
  }
}

export function createLogger(options?: LoggerOptions): Logger {
  return new ConsoleLogger(options);
}
