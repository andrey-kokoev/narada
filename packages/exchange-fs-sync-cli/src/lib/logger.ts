/**
 * Structured CLI logger using the new formatter
 */

import { createFormatter, type FormatterOptions } from './formatter.js';

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error): void;
  debug(message: string, data?: Record<string, unknown>): void;
  result(data: unknown): void;
  success(message: string): void;
  warning(message: string): void;
}

export interface CreateLoggerOptions {
  verbose: boolean;
  format?: FormatterOptions['format'];
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const formatter = createFormatter({
    format: options.format,
    verbose: options.verbose,
  });
  
  return {
    info(message: string, data?: Record<string, unknown>): void {
      formatter.message(message, 'info');
      if (options.verbose && data) {
        formatter.output({ level: 'debug', ...data });
      }
    },
    
    error(message: string, error?: Error): void {
      formatter.message(message, 'error');
      if (error && options.verbose) {
        formatter.output({ error: error.message, stack: error.stack });
      }
    },
    
    debug(message: string, data?: Record<string, unknown>): void {
      if (options.verbose) {
        formatter.message(`[debug] ${message}`, 'info');
        if (data) {
          formatter.output(data);
        }
      }
    },
    
    result(data: unknown): void {
      formatter.output(data);
    },
    
    success(message: string): void {
      formatter.message(message, 'success');
    },
    
    warning(message: string): void {
      formatter.message(message, 'warning');
    },
  };
}
