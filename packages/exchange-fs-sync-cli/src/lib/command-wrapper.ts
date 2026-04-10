/**
 * Base wrapper for CLI commands providing common functionality
 */

import { resolve } from 'node:path';
import type { Logger } from './logger.js';
import { createLogger } from './logger.js';
import { ExitCode } from './exit-codes.js';

export interface CommandContext {
  configPath: string;
  verbose: boolean;
  logger: Logger;
}

export type CommandHandler<T extends Record<string, unknown>> = (
  options: T,
  context: CommandContext,
) => Promise<ExitCode | { exitCode: ExitCode; result: unknown }>;

export function wrapCommand<T extends { config?: string; verbose?: boolean }>(
  name: string,
  handler: CommandHandler<T>,
): (options: T) => Promise<void> {
  return async (options: T): Promise<void> => {
    const configPath = resolve(options.config || './config.json');
    const verbose = options.verbose || false;
    const logger = createLogger(verbose);
    
    logger.debug(`Starting command: ${name}`, { configPath });
    
    try {
      const result = await handler(options, { configPath, verbose, logger });
      
      if (typeof result === 'number') {
        process.exit(result);
      } else {
        logger.result(result.result);
        process.exit(result.exitCode);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      logger.error(`Command failed: ${err.message}`, verbose ? err : undefined);
      
      logger.result({
        status: 'error',
        command: name,
        error: err.message,
        ...(verbose && { stack: err.stack }),
      });
      
      process.exit(ExitCode.GENERAL_ERROR);
    }
  };
}
