export type CliFormat = 'json' | 'human' | 'auto';

export function wantsJsonOutput(format?: unknown, envFormat = process.env.OUTPUT_FORMAT): boolean {
  return format === 'json' || envFormat === 'json';
}

export function resolveCommandFormat(
  format?: unknown,
  fallback: CliFormat = 'auto',
  envFormat = process.env.OUTPUT_FORMAT,
): CliFormat {
  if (envFormat === 'json') return 'json';
  if (format === 'json' || format === 'human') return format;
  if (envFormat === 'human' || envFormat === 'auto') return envFormat;
  if (format === 'auto') return format;
  return fallback;
}

export function formatCommandResultForStdout(
  result: unknown,
  format?: unknown,
  envFormat = process.env.OUTPUT_FORMAT,
): string {
  if (wantsJsonOutput(format, envFormat)) {
    return JSON.stringify(result, null, 2);
  }
  if (result && typeof result === 'object' && '_formatted' in result) {
    return String((result as { _formatted: unknown })._formatted);
  }
  if (result && typeof result === 'object') {
    return JSON.stringify(result, null, 2);
  }
  return typeof result === 'string' ? result : String(result);
}

export function emitCommandResult(result: unknown, format?: unknown): void {
  console.log(formatCommandResultForStdout(result, format));
}

export interface CommandResultEnvelopeLike {
  exitCode: number;
  result: unknown;
}

// Finite commands return an envelope; this function is the stdout/exit admission point.
export function emitFiniteCommandResult(
  envelope: CommandResultEnvelopeLike,
  options: {
    format?: unknown;
    exit?: (code: number) => never;
  } = {},
): void {
  const exit = options.exit ?? ((code: number): never => process.exit(code));
  emitCommandResult(envelope.result, options.format);
  if (envelope.exitCode !== 0) {
    exit(envelope.exitCode);
  }
}

// Use for finite command failures that are thrown before a normal envelope exists.
export function emitFiniteCommandFailure(
  message: string,
  options: {
    exitCode?: number;
    exit?: (code: number) => never;
  } = {},
): never {
  const exit = options.exit ?? ((code: number): never => process.exit(code));
  console.error(message);
  return exit(options.exitCode ?? 1);
}

// Use when the command body has already rendered human output through Formatter.
export function emitFormatterBackedCommandResult(
  envelope: CommandResultEnvelopeLike,
  options: {
    format?: unknown;
    errorFallback?: string;
    exit?: (code: number) => never;
  } = {},
): void {
  const exit = options.exit ?? ((code: number): never => process.exit(code));
  if (envelope.exitCode !== 0) {
    console.error((envelope.result as { error?: string }).error ?? options.errorFallback ?? 'Command failed');
    exit(envelope.exitCode);
    return;
  }
  if (wantsJsonOutput(options.format)) {
    console.log(JSON.stringify(envelope.result, null, 2));
  } else if (envelope.result && typeof envelope.result === 'object' && '_formatted' in envelope.result) {
    console.log(String((envelope.result as { _formatted: unknown })._formatted));
  }
}

// Long-lived commands are an explicit exception: startup notices precede process lifetime.
export function emitLongLivedCommandStartup(lines: string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}

// Long-lived commands may terminate process lifetime after graceful shutdown.
export function exitLongLivedCommandSuccessfully(exit: (code: number) => never = process.exit): never {
  return exit(0);
}

// Interactive commands may terminate process lifetime after prompt cancellation.
export function exitInteractiveCommandSuccessfully(exit: (code: number) => never = process.exit): never {
  return exit(0);
}

// Interactive commands sometimes need bounded follow-up text after prompt rendering.
export function emitInteractiveCommandFollowUp(lines: string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}

// Finite setup commands may render bounded progress summaries while they mutate local scaffolding.
export function emitFiniteCommandProgress(lines: string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}

// Finite setup commands may render bounded diagnostics before returning a failing envelope or throwing.
export function emitFiniteCommandDiagnostics(lines: string[]): void {
  for (const line of lines) {
    console.error(line);
  }
}

// Finite command bodies should construct human output here, not write to stdout directly.
export function attachFormattedOutput<T extends object>(
  result: T,
  formatted: string,
  format: CliFormat,
): T | (T & { _formatted: string }) {
  return format === 'json' ? result : { ...result, _formatted: formatted };
}

// Preferred ergonomic helper for finite command results with human rendering.
export function formattedResult<T extends object>(
  result: T,
  formatted: string | string[],
  format: CliFormat,
): T | (T & { _formatted: string }) {
  const text = Array.isArray(formatted) ? formatted.join('\n') : formatted;
  return attachFormattedOutput(result, text, format);
}
