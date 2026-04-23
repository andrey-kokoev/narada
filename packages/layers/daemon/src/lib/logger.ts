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

export type LogFormat = 'json' | 'pretty' | 'auto';

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void;
}

export interface LoggerOptions {
  component?: string;
  verbose?: boolean;
  format?: LogFormat;
}

class ConsoleLogger implements Logger {
  private readonly component: string;
  private readonly verbose: boolean;
  private readonly format: Exclude<LogFormat, 'auto'>;

  constructor(options: LoggerOptions = {}) {
    this.component = options.component ?? 'daemon';
    this.verbose = options.verbose ?? false;
    this.format = resolveLogFormat(options.format);
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

    console.error(this.format === 'json' ? JSON.stringify(entry) : formatPretty(entry));
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

export function resolveLogFormat(format: LogFormat | undefined): Exclude<LogFormat, 'auto'> {
  const requested = format ?? parseLogFormat(process.env.NARADA_LOG_FORMAT ?? process.env.LOG_FORMAT) ?? 'auto';
  if (requested === 'auto') {
    return process.stderr.isTTY ? 'pretty' : 'json';
  }
  return requested;
}

function parseLogFormat(value: string | undefined): LogFormat | undefined {
  if (value === 'json' || value === 'pretty' || value === 'auto') {
    return value;
  }
  return undefined;
}

function formatPretty(entry: LogEntry): string {
  const time = entry.timestamp.slice(11, 19);
  const level = entry.level.toUpperCase().padEnd(5);
  const component = entry.component ? ` ${entry.component}` : '';
  const meta = entry.meta && Object.keys(entry.meta).length > 0 ? ` ${formatMeta(entry.meta)}` : '';
  return `${time} ${level}${component}: ${entry.message}${meta}`;
}

function formatMeta(meta: Record<string, unknown>): string {
  return Object.entries(meta)
    .map(([key, value]) => `${key}=${formatMetaValue(value)}`)
    .join(' ');
}

function formatMetaValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value.includes(' ') ? JSON.stringify(value) : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function createLogger(options?: LoggerOptions): Logger {
  return new ConsoleLogger(options);
}
