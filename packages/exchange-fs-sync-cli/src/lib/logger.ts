/**
 * Structured CLI logger with human/JSON format support
 */

import { createFormatter, detectFormat, type OutputFormat, type Formatter } from './formatter.js';

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
  format?: OutputFormat;
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const format = detectFormat(options.format);
  const formatter = createFormatter(format);
  const isVerbose = options.verbose;
  
  return {
    info(message: string, data?: Record<string, unknown>): void {
      formatter.info(message);
      if (isVerbose && data) {
        console.error('  ', JSON.stringify(data));
      }
    },
    
    error(message: string, error?: Error): void {
      formatter.error(message, error);
    },
    
    debug(message: string, data?: Record<string, unknown>): void {
      if (isVerbose) {
        formatter.info(`[debug] ${message}`);
        if (data) {
          console.error('  ', JSON.stringify(data));
        }
      }
    },
    
    result(data: unknown): void {
      formatter.result(data);
    },
    
    success(message: string): void {
      formatter.success(message);
    },
    
    warning(message: string): void {
      formatter.warning(message);
    },
  };
}
