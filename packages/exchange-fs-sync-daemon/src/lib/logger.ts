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
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void;
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

  private log(level: LogEntry['level'], message: string, meta?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      component: this.component,
      ...(meta && typeof meta === "object" && Object.keys(meta as Record<string, unknown>).length > 0
        ? { meta: meta as Record<string, unknown> }
        : {}),
    };

    // Output structured JSON to stderr for logging
    console.error(JSON.stringify(entry));
  }

  debug(message: string, meta?: unknown): void {
    if (this.verbose) {
      this.log('debug', message, meta);
    }
  }

  info(message: string, meta?: unknown): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.log('warn', message, meta);
  }

  error(message: string, error?: unknown, meta: Record<string, unknown> = {}): void {
    const enrichedMeta: Record<string, unknown> = { ...meta };
    if (error instanceof Error) {
      enrichedMeta.error = error.message;
      if (this.verbose && error.stack) {
        enrichedMeta.stack = error.stack;
      }
    } else if (error !== undefined) {
      if (typeof error === "object" && error !== null) {
        Object.assign(enrichedMeta, error);
      } else {
        enrichedMeta.error = String(error);
      }
    }
    this.log('error', message, enrichedMeta);
  }
}

export function createLogger(options?: LoggerOptions): Logger {
  return new ConsoleLogger(options);
}
