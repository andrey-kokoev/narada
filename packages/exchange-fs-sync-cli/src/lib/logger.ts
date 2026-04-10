/**
 * Structured CLI logger
 */

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error): void;
  debug(message: string, data?: Record<string, unknown>): void;
  result(data: unknown): void;
}

export function createLogger(verbose: boolean): Logger {
  return {
    info(message: string, data?: Record<string, unknown>): void {
      if (verbose) {
        console.error(`[info] ${message}`, data ? JSON.stringify(data) : '');
      }
    },
    
    error(message: string, error?: Error): void {
      console.error(`[error] ${message}`);
      if (verbose && error?.stack) {
        console.error(error.stack);
      }
    },
    
    debug(message: string, data?: Record<string, unknown>): void {
      if (verbose) {
        console.error(`[debug] ${message}`, data ? JSON.stringify(data) : '');
      }
    },
    
    result(data: unknown): void {
      console.log(JSON.stringify(data, null, 2));
    },
  };
}
