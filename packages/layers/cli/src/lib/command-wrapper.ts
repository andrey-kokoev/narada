/**
 * Base wrapper for CLI commands providing common functionality
 */

import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { Logger } from './logger.js';
import { createLogger } from './logger.js';
import { ExitCode } from './exit-codes.js';
import type { OutputFormat } from './formatter.js';
import { configureLogging, setLogLevel, setLogFormat, metrics } from '@narada2/control-plane';
import {
  assertAuthorityCloneForMutation,
  authorityCloneErrorToCommandResult,
} from './narada-proper-authority.js';

export interface CommandContext {
  configPath: string;
  verbose: boolean;
  logger: Logger;
}

export class CommandResultError extends Error {
  result: unknown;

  constructor(result: unknown, message = 'command_result_error') {
    super(message);
    this.name = 'CommandResultError';
    this.result = result;
  }
}

export function commandResultError(result: unknown, message?: string): CommandResultError {
  return new CommandResultError(result, message);
}

function normalizeUnhandledCommandError(command: string, error: unknown): NormalizedCommandError {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    status: 'error',
    command,
    error: err.message,
    retryable: false,
  };
}

export function silentCommandContext(options: {
  configPath?: string;
  verbose?: boolean;
} = {}): CommandContext {
  return {
    configPath: options.configPath ?? './config.json',
    verbose: options.verbose ?? false,
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      warning: () => {},
      success: () => {},
      error: () => {},
      result: () => {},
      trace: () => {},
    } as unknown as Logger,
  };
}

export type CommandHandler<T extends Record<string, unknown>> = (
  options: T,
  context: CommandContext,
) => Promise<ExitCode | { exitCode: ExitCode; result: unknown }>;

export interface NormalizedCommandError {
  status: 'error';
  command: string;
  error: string;
  retryable: boolean;
}

export interface CommandResultEnvelope {
  exitCode: number;
  result: unknown;
}

export interface DirectCommandRunnerOptions {
  command: string;
  invocation: () => Promise<CommandResultEnvelope>;
  emit: (result: unknown, format?: unknown) => void;
  format?: unknown;
  exit?: (code: number) => never;
}

export interface DirectCommandActionOptions<TArgs extends unknown[]> {
  command: string;
  invocation: (...args: TArgs) => Promise<CommandResultEnvelope>;
  emit: (result: unknown, format?: unknown) => void;
  format?: unknown | ((...args: TArgs) => unknown);
  exit?: (code: number) => never;
}

export interface ResourceScopedDirectCommandRunnerOptions<TResource> {
  command: string;
  open: () => TResource;
  close: (resource: TResource) => void | Promise<void>;
  invocation: (resource: TResource) => Promise<CommandResultEnvelope>;
  emit: (result: unknown, format?: unknown) => void;
  format?: unknown;
  exit?: (code: number) => never;
}

export interface ResourceScopedDirectCommandActionOptions<TResource, TArgs extends unknown[]> {
  command: string;
  open: (...args: TArgs) => TResource;
  close: (resource: TResource) => void | Promise<void>;
  invocation: (resource: TResource, ...args: TArgs) => Promise<CommandResultEnvelope>;
  emit: (result: unknown, format?: unknown) => void;
  format?: unknown | ((...args: TArgs) => unknown);
  exit?: (code: number) => never;
}

export function normalizeCommandError(command: string, error: unknown): NormalizedCommandError | undefined {
  const err = error instanceof Error ? error : new Error(String(error));
  const code = (error as { code?: unknown } | null)?.code;
  const isBusy =
    code === 'SQLITE_BUSY'
    || /\bdatabase is (locked|busy)\b/i.test(err.message)
    || /\bSQLITE_BUSY\b/i.test(err.message);

  if (!isBusy) return undefined;

  return {
    status: 'error',
    command,
    error: 'Task lifecycle database is busy. Retry the command, or avoid parallel task lifecycle writes.',
    retryable: true,
  };
}

export async function runDirectCommand(options: DirectCommandRunnerOptions): Promise<void> {
  const exit = options.exit ?? ((code: number): never => process.exit(code));
  let result: CommandResultEnvelope;
  try {
    result = await options.invocation();
  } catch (error) {
    if (error instanceof CommandResultError) {
      options.emit(error.result, options.format);
      exit(ExitCode.GENERAL_ERROR);
      return;
    }
    const authorityResult = authorityCloneErrorToCommandResult(error);
    if (authorityResult) {
      options.emit(authorityResult.result, options.format);
      exit(authorityResult.exitCode);
      return;
    }
    const normalized = normalizeCommandError(options.command, error);
    options.emit(normalized ?? normalizeUnhandledCommandError(options.command, error), options.format);
    exit(ExitCode.GENERAL_ERROR);
    return;
  }

  options.emit(result.result, options.format);
  if (result.exitCode !== 0) {
    exit(result.exitCode);
  }
}

export function directCommandAction<TArgs extends unknown[]>(
  options: DirectCommandActionOptions<TArgs>,
): (...args: TArgs) => Promise<void> {
  return async (...rawArgs: TArgs): Promise<void> => {
    const args = normalizeCommanderActionArgs(rawArgs);
    const format = typeof options.format === 'function' ? options.format(...args) : options.format;
    await runDirectCommand({
      command: options.command,
      invocation: () => {
        assertAuthorityCloneForMutation(options.command, args);
        return options.invocation(...args);
      },
      emit: options.emit,
      format,
      exit: options.exit,
    });
  };
}

function normalizeCommanderActionArgs<TArgs extends unknown[]>(args: TArgs): TArgs {
  const last = args[args.length - 1] as unknown;
  if (
    last &&
    typeof last === 'object' &&
    typeof (last as { opts?: unknown }).opts === 'function'
  ) {
    const command = last as { opts: () => Record<string, unknown> };
    const parsedOptions = withProcessArgvCwd(command.opts());
    const maybeOptions = args[args.length - 2];
    if (
      maybeOptions &&
      typeof maybeOptions === 'object' &&
      !Array.isArray(maybeOptions) &&
      typeof (maybeOptions as { opts?: unknown }).opts !== 'function'
    ) {
      return [
        ...args.slice(0, -2),
        parsedOptions,
      ] as TArgs;
    }
    return [
      ...args.slice(0, -1),
      parsedOptions,
    ] as TArgs;
  }
  return args;
}

function withProcessArgvCwd(options: Record<string, unknown>): Record<string, unknown> {
  if (typeof options.cwd === 'string' && options.cwd !== '.') return options;
  const cwd = cwdFromArgv(process.argv);
  return cwd ? { ...options, cwd } : options;
}

function cwdFromArgv(argv: string[]): string | null {
  for (let i = argv.length - 1; i >= 0; i -= 1) {
    const arg = argv[i];
    if (arg === '--cwd') return argv[i + 1] ?? null;
    if (arg?.startsWith('--cwd=')) return arg.slice('--cwd='.length);
  }
  return null;
}

export async function runDirectCommandWithResource<TResource>(
  options: ResourceScopedDirectCommandRunnerOptions<TResource>,
): Promise<void> {
  let resource: TResource;
  try {
    resource = options.open();
  } catch (error) {
    const authorityResult = authorityCloneErrorToCommandResult(error);
    if (authorityResult) {
      const exit = options.exit ?? ((code: number): never => process.exit(code));
      options.emit(authorityResult.result, options.format);
      exit(authorityResult.exitCode);
      return;
    }
    throw error;
  }
  try {
    await runDirectCommand({
      command: options.command,
      invocation: () => options.invocation(resource),
      emit: options.emit,
      format: options.format,
      exit: options.exit,
    });
  } finally {
    await options.close(resource);
  }
}

export function resourceScopedDirectCommandAction<TResource, TArgs extends unknown[]>(
  options: ResourceScopedDirectCommandActionOptions<TResource, TArgs>,
): (...args: TArgs) => Promise<void> {
  return async (...rawArgs: TArgs): Promise<void> => {
    const args = normalizeCommanderActionArgs(rawArgs);
    const format = typeof options.format === 'function' ? options.format(...args) : options.format;
    await runDirectCommandWithResource({
      command: options.command,
      open: () => {
        assertAuthorityCloneForMutation(options.command, args);
        return options.open(...args);
      },
      close: options.close,
      invocation: (resource) => options.invocation(resource, ...args),
      emit: options.emit,
      format,
      exit: options.exit,
    });
  };
}

export function wrapCommand<T extends { config?: string; verbose?: boolean; format?: string }>(
  name: string,
  handler: CommandHandler<T>,
): (options: T) => Promise<void> {
  return async (options: T): Promise<void> => {
    const configPath = resolve(options.config || './config.json');
    const verbose = options.verbose || false;
    
    // Configure logging from environment (set by CLI global options)
    const logLevel = process.env.LOG_LEVEL || (verbose ? 'debug' : 'info');
    const logFormat = process.env.LOG_FORMAT || 'auto';
    
    setLogLevel(logLevel);
    setLogFormat(logFormat);
    
    // Parse format option
    let format: OutputFormat | undefined;
    if (options.format === 'json') format = 'json';
    else if (options.format === 'human') format = 'human';
    // 'auto' or undefined will use TTY detection
    
    const logger = createLogger({ verbose, format });
    
    logger.debug(`Starting command: ${name}`, { configPath, logLevel, logFormat });
    
    try {
      const result = await handler(options, { configPath, verbose, logger });
      
      // Write metrics if requested
      const metricsOutput = process.env.METRICS_OUTPUT;
      if (metricsOutput) {
        const snapshot = metrics.snapshot();
        await writeFile(metricsOutput, JSON.stringify(snapshot, null, 2));
        logger.debug(`Metrics written to ${metricsOutput}`);
      }
      
      if (typeof result === 'number') {
        process.exit(result);
      } else {
        logger.result(result.result);
        process.exit(result.exitCode);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      logger.error(`Command failed: ${err.message}`, verbose ? err : undefined);
      
      // Write metrics even on error
      const metricsOutput = process.env.METRICS_OUTPUT;
      if (metricsOutput) {
        try {
          const snapshot = metrics.snapshot();
          await writeFile(metricsOutput, JSON.stringify(snapshot, null, 2));
        } catch {
          // Ignore metrics write errors
        }
      }
      
      logger.result(normalizeCommandError(name, error) ?? {
        status: 'error',
        command: name,
        error: err.message,
        ...(verbose && { stack: err.stack }),
      });
      
      process.exit(ExitCode.GENERAL_ERROR);
    }
  };
}
